import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useStore } from '../store'
import { Card, Field, Progress, Segmented, StatusDot } from '../components/Controls'
import { IconClock, IconImage, IconRefresh, IconUpload } from '../components/Icons'
import { DISPLAY_HEIGHT, DISPLAY_WIDTH, MAX_TOTAL_FRAMES, MIN_FRAME_DELAY_MS } from '@shared/ids'
import type { ClockValue, ScreenMode } from '@shared/config'
import { buildUpload, decodeImage, encodeFrame, renderFrame, suggestedDelay, type FitMode, type SlotImage } from '../lib/image'

const SCREENS: Array<{ value: ScreenMode; label: string }> = [
  { value: 0, label: 'Часы' },
  { value: 1, label: 'Слот 1' },
  { value: 2, label: 'Слот 2' }
]

const FITS: Array<{ value: FitMode; label: string }> = [
  { value: 'cover', label: 'Заполнить' },
  { value: 'contain', label: 'Вписать' },
  { value: 'stretch', label: 'Растянуть' }
]

const pad = (n: number): string => String(n).padStart(2, '0')
const fmtClock = (c: ClockValue): string =>
  `${c.year}-${pad(c.month)}-${pad(c.day)} ${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}`

interface Slot {
  image: SlotImage | null
  fit: FitMode
}

export function DisplayPage(): ReactElement {
  const { status, run, busy, toast, confirm, config, setConfig, progress, vendorBlocked } = useStore()
  const [slots, setSlots] = useState<[Slot, Slot]>([{ image: null, fit: 'cover' }, { image: null, fit: 'cover' }])
  const [delay, setDelay] = useState(100)
  const [after, setAfter] = useState<ScreenMode>(1)
  const [screen, setScreen] = useState<ScreenMode>(0)
  const [now, setNow] = useState(new Date())
  // Everything on this page goes over the 0xFF1C protocol, which the 2.4G dongle does not carry.
  const connected = !!status?.connected && !vendorBlocked

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (config) {
      setScreen(config.decoded.screen)
      if (config.decoded.frameDelayMs >= MIN_FRAME_DELAY_MS) setDelay(config.decoded.frameDelayMs)
    }
  }, [config])

  const frames = (i: 0 | 1): number => slots[i].image?.frames.length ?? 0
  const total = Math.max(1, frames(0)) + Math.max(1, frames(1))

  const pick = async (i: 0 | 1): Promise<void> => {
    const file = await window.gmk.display.pickImage().catch((e: Error) => {
      toast('error', e.message)
      return null
    })
    if (!file) return
    try {
      const otherMin = Math.max(1, frames(i === 0 ? 1 : 0))
      const img = await decodeImage(file.name, file.bytes, MAX_TOTAL_FRAMES - otherMin)
      setSlots((s) => {
        const next = [...s] as [Slot, Slot]
        next[i] = { ...next[i], image: img }
        return next
      })
      if (img.frames.length > 1) setDelay(suggestedDelay(img, delay))
      if (img.totalFrames > img.frames.length) {
        toast('info', `${file.name}: ${img.totalFrames} кадров, взяты первые ${img.frames.length} (лимит ${MAX_TOTAL_FRAMES} на оба слота)`)
      }
    } catch (e) {
      toast('error', `Не удалось открыть ${file.name}: ${e instanceof Error ? e.message : e}`)
    }
  }

  const clear = (i: 0 | 1): void =>
    setSlots((s) => {
      const next = [...s] as [Slot, Slot]
      next[i] = { ...next[i], image: null }
      return next
    })

  const setFit = (i: 0 | 1, fit: FitMode): void =>
    setSlots((s) => {
      const next = [...s] as [Slot, Slot]
      next[i] = { ...next[i], fit }
      return next
    })

  const readConfig = (): Promise<unknown> =>
    run('Чтение настроек', async () => {
      setConfig(await window.gmk.config.read())
      toast('ok', 'Настройки экрана прочитаны')
    })

  const upload = async (): Promise<void> => {
    if (!slots[0].image && !slots[1].image) return
    const ok = await confirm({
      title: 'Загрузить изображения?',
      body: (
        <>
          <p>
            Загрузка перезаписывает <b>оба</b> слота: пустой слот станет чёрным. Прочитать старые изображения с
            клавиатуры нельзя.
          </p>
          <p className="mono">Кадров: {total} · задержка {delay} мс · после загрузки: {SCREENS[after].label}</p>
          {status?.mode === 'dongle' && (
            <div className="note">
              <StatusDot state="idle" />
              <span>Через 2.4G-донгл загрузка идёт долго. По кабелю быстрее и надёжнее.</span>
            </div>
          )}
        </>
      ),
      confirm: 'Загрузить'
    })
    if (!ok) return
    await run('Загрузка изображений', async () => {
      const enc = (i: 0 | 1): Uint8Array[] => slots[i].image?.frames.map((f) => encodeFrame(f.bitmap, slots[i].fit)) ?? []
      const { data, n1, n2 } = buildUpload(enc(0), enc(1))
      const c = await window.gmk.display.upload({ data, slot1Frames: n1, slot2Frames: n2, frameDelayMs: delay, screen: after })
      setConfig(c)
      toast('ok', 'Изображения загружены')
    })
  }

  const show = (s: ScreenMode): Promise<unknown> =>
    run('Переключение экрана', async () => {
      const c = await window.gmk.config.update({ screen: s })
      setConfig(c)
      toast('ok', `На экране: ${SCREENS[s].label}`)
    })

  const sync = (): Promise<unknown> =>
    run('Синхронизация часов', async () => {
      setConfig(await window.gmk.config.syncClock())
      toast('ok', 'Часы синхронизированы')
    })

  const up = progress['upload']
  const uploading = busy === 'Загрузка изображений'
  const decoded = config?.decoded

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Экран и часы</h1>
          <p>
            Экран {DISPLAY_WIDTH}×{DISPLAY_HEIGHT}, два слота под картинки или GIF-анимации, всего до {MAX_TOTAL_FRAMES}
            {' '}кадров. Все кадры показываются с одной задержкой.
          </p>
        </div>
        <div className="page-actions">
          <button className="v-btn v-btn-secondary" disabled={!connected || !!busy} onClick={readConfig}>
            <IconRefresh width={14} height={14} /> Прочитать настройки
          </button>
        </div>
      </div>

      <div className="stack">
        {vendorBlocked && (
          <div className="note">
            <StatusDot state="error" />
            <span>
              Клавиатура подключена через 2.4G-донгл, а он не передаёт протокол экрана и часов. Подключите клавиатуру
              кабелем. Картинки можно выбрать и посмотреть заранее.
            </span>
          </div>
        )}
        <div className="grid-2">
          {([0, 1] as const).map((i) => (
            <Card key={i} title={`Слот ${i + 1}`}
              hint={slots[i].image ? `${slots[i].image!.frames.length} кадр.` : decoded ? `на клавиатуре: ${i === 0 ? decoded.slot1Frames : decoded.slot2Frames} кадр.` : 'пусто'}
              footer={
                <>
                  <button className="v-btn v-btn-ghost v-btn-sm" disabled={!slots[i].image} onClick={() => clear(i)}>Очистить</button>
                  <span className="spacer" />
                  <button className="v-btn v-btn-secondary v-btn-sm" onClick={() => void pick(i)}>
                    <IconImage width={14} height={14} /> Выбрать…
                  </button>
                </>
              }>
              <SlotPreview slot={slots[i]} delay={delay} />
              <div className="row wrap">
                <span className="muted mono" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {slots[i].image?.name ?? 'PNG, JPG, GIF, WebP, BMP'}
                </span>
                <span className="spacer" />
                <Segmented value={slots[i].fit} options={FITS} onChange={(f) => setFit(i, f)} disabled={!slots[i].image} />
              </div>
            </Card>
          ))}
        </div>

        <div className="grid-2">
          <Card title="Загрузка на клавиатуру" hint={`${total} / ${MAX_TOTAL_FRAMES} кадров`}
            footer={
              <>
                {uploading && (
                  <button className="v-btn v-btn-danger v-btn-sm" onClick={() => window.gmk.display.cancelUpload()}>Отменить</button>
                )}
                <span className="spacer" />
                <button className="v-btn v-btn-primary" disabled={!connected || !!busy || (!slots[0].image && !slots[1].image) || total > MAX_TOTAL_FRAMES}
                  onClick={() => void upload()}>
                  <IconUpload width={14} height={14} /> Загрузить
                </button>
              </>
            }>
            <div className="row wrap" style={{ gap: 24, alignItems: 'flex-end' }}>
              <Field label="Задержка кадра, мс" hint={`не меньше ${MIN_FRAME_DELAY_MS}`}>
                <input className="v-input mono" type="number" style={{ width: 120 }} min={MIN_FRAME_DELAY_MS} max={65535} value={delay}
                  onChange={(e) => setDelay(Math.max(MIN_FRAME_DELAY_MS, Math.min(65535, Number(e.target.value) || MIN_FRAME_DELAY_MS)))} />
              </Field>
              <Field label="После загрузки показать">
                <Segmented value={after} options={SCREENS} onChange={setAfter} />
              </Field>
            </div>
            {up && (
              <div className="stack" style={{ gap: 6 }}>
                <Progress value={up.done / up.total} />
                <span className="muted mono" style={{ fontSize: 12 }}>
                  {(up.done / 1024).toFixed(0)} / {(up.total / 1024).toFixed(0)} КБ · {Math.round((up.done / up.total) * 100)}%
                </span>
              </div>
            )}
          </Card>

          <Card title="Что на экране" hint={decoded ? SCREENS[decoded.screen].label : 'не прочитано'}
            footer={
              <>
                <span className="spacer" />
                <button className="v-btn v-btn-secondary" disabled={!connected || !!busy} onClick={() => show(screen)}>Показать</button>
              </>
            }>
            <Segmented value={screen} options={SCREENS} onChange={setScreen} />
            <div className="field-hint">Меняет только выбор экрана, загруженные картинки остаются.</div>
          </Card>

          <Card title="Часы" hint={decoded?.clock ? 'прочитано' : undefined}
            footer={
              <>
                <span className="spacer" />
                <button className="v-btn v-btn-primary" disabled={!connected || !!busy} onClick={sync}>
                  <IconClock width={14} height={14} /> Синхронизировать
                </button>
              </>
            }>
            <div>
              <div className="field-label">Компьютер</div>
              <div className="clock-face">{now.toLocaleTimeString('ru-RU', { hour12: false })}</div>
              <div className="muted mono" style={{ fontSize: 12 }}>{now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
            <dl className="kv">
              <dt>На клавиатуре</dt>
              <dd>{decoded?.clock ? `${fmtClock(decoded.clock)} (на момент чтения)` : '—'}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}

function SlotPreview({ slot, delay }: { slot: Slot; delay: number }): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  const [frame, setFrame] = useState(0)
  const n = slot.image?.frames.length ?? 0

  useEffect(() => {
    setFrame(0)
    if (n < 2) return
    const t = setInterval(() => setFrame((f) => (f + 1) % n), Math.max(MIN_FRAME_DELAY_MS, delay))
    return () => clearInterval(t)
  }, [n, delay, slot.image])

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const f = slot.image?.frames[Math.min(frame, n - 1)]
    if (f) renderFrame(ctx, f.bitmap, slot.fit)
    else {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT)
    }
  }, [frame, slot, n])

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <canvas ref={ref} width={DISPLAY_WIDTH} height={DISPLAY_HEIGHT} className="screen-preview large" />
      {n > 1 && <span className="muted mono" style={{ fontSize: 11 }}>{frame + 1}/{n}</span>}
    </div>
  )
}
