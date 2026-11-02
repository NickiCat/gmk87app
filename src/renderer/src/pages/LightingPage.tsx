import { useEffect, useState, type ReactElement } from 'react'
import { useStore } from '../store'
import { Card, Field, RangeField, Select, StatusDot, Switch } from '../components/Controls'
import { IconRefresh } from '../components/Icons'
import { EFFECTS, LOGO_COLORS, LOGO_MODES, SWATCHES } from '@shared/lighting'
import { MAX_BRIGHTNESS, MAX_LOGO_BRIGHTNESS, MAX_SPEED, type DecodedConfig } from '@shared/config'
import type { LightingSnapshot, LightingWrite } from '@shared/api'

interface Logo {
  logoMode: number
  logoColor: number
  logoBrightness: number
  logoRainbow: boolean
  winLock: boolean
}

const toHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lightingFrom(s: LightingSnapshot, prev: LightingWrite | null): LightingWrite {
  const c = s.config?.decoded
  return {
    effect: s.via?.effect ?? c?.effect ?? 0,
    brightness: s.via?.brightness ?? c?.brightness ?? 0,
    speedLevel: s.via?.speed ?? c?.speedLevel ?? 0,
    // Without the settings block (2.4G dongle) these are unknown; they are neither shown as read nor written.
    reverseDirection: c?.reverseDirection ?? prev?.reverseDirection ?? false,
    rainbow: c?.rainbow ?? prev?.rainbow ?? false,
    red: c?.red ?? prev?.red ?? 255,
    green: c?.green ?? prev?.green ?? 255,
    blue: c?.blue ?? prev?.blue ?? 255
  }
}

const logoFrom = (c: DecodedConfig): Logo => ({
  logoMode: Math.min(c.logoMode, LOGO_MODES.length - 1),
  logoColor: Math.min(c.logoColor, LOGO_COLORS.length - 1),
  logoBrightness: c.logoBrightness,
  logoRainbow: c.logoRainbow,
  winLock: c.winLock
})

export function LightingPage(): ReactElement {
  const { status, run, busy, toast, setConfig, config, vendorBlocked } = useStore()
  const [snap, setSnap] = useState<LightingSnapshot | null>(null)
  const [light, setLight] = useState<LightingWrite | null>(null)
  const [logo, setLogo] = useState<Logo | null>(null)
  const [hex, setHex] = useState('')
  const connected = !!status?.connected

  // Pick up a config another page has already read.
  useEffect(() => {
    if (config && !logo) setLogo(logoFrom(config.decoded))
  }, [config, logo])

  const lightHex = light ? toHex(light.red, light.green, light.blue) : ''
  useEffect(() => setHex(lightHex), [lightHex])

  const apply = (s: LightingSnapshot): void => {
    setSnap(s)
    setLight((prev) => lightingFrom(s, prev))
    if (s.config) {
      setLogo(logoFrom(s.config.decoded))
      setConfig(s.config)
    }
  }

  const read = (): Promise<unknown> =>
    run('Чтение подсветки', async () => {
      apply(await window.gmk.lighting.read())
      toast('ok', 'Настройки подсветки прочитаны')
    })

  const writeLight = (): Promise<unknown> =>
    run('Запись подсветки', async () => {
      if (!light) return
      apply(await window.gmk.lighting.write(light))
      toast('ok', 'Подсветка записана')
    })

  const writeLogo = (): Promise<unknown> =>
    run('Запись настроек', async () => {
      if (!logo) return
      const c = await window.gmk.config.update(logo)
      setConfig(c)
      setLogo(logoFrom(c.decoded))
      toast('ok', 'Настройки логотипа записаны')
    })

  const effect = EFFECTS.find((e) => e.id === light?.effect) ?? EFFECTS[0]
  const usesVia = snap?.via != null
  /** Direction, rainbow and colour live only in the settings block. */
  const vendorFields = !!light && !!snap?.config
  const colorEditable = vendorFields && effect.id !== 0 && !light!.rainbow && (usesVia || effect.color === 'custom')
  const colorHint = !light
    ? ''
    : !snap?.config
      ? 'Цвет, радуга и направление настраиваются только по кабелю: 2.4G-донгл не передаёт этот протокол.'
    : effect.id === 0
      ? 'Подсветка выключена.'
      : light.rainbow
        ? 'Включена радуга, поэтому цвет не используется.'
        : usesVia
          ? 'На прошивке V0112 цвет хранится в блоке настроек; какие эффекты его используют, проверено не для всех.'
          : effect.color === 'custom'
            ? 'Этот эффект использует выбранный цвет.'
            : effect.color === 'rainbow'
              ? 'Этот эффект всегда радужный, цвет не используется.'
              : 'Этот эффект перебирает 4 встроенных цвета.'

  const patch = (p: Partial<LightingWrite>): void => setLight((l) => (l ? { ...l, ...p } : l))
  const patchLogo = (p: Partial<Logo>): void => setLogo((l) => (l ? { ...l, ...p } : l))

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Подсветка</h1>
          <p>
            Сначала прочитайте текущие настройки: при записи приложение меняет только поля этой страницы, остальные
            байты конфигурации остаются как были.
          </p>
        </div>
        <div className="page-actions">
          <button className="v-btn v-btn-primary" disabled={!connected || !!busy} onClick={read}>
            <IconRefresh width={14} height={14} /> {snap ? 'Перечитать' : 'Прочитать'}
          </button>
        </div>
      </div>

      <div className="grid-2">
        <Card
          title="Клавиши"
          hint={snap ? [usesVia && `VIA ${snap.viaProtocol}`, snap.config && 'блок настроек'].filter(Boolean).join(' + ') : 'не прочитано'}
          footer={
            <>
              <span className="spacer" />
              <button className="v-btn v-btn-primary" disabled={!light || !!busy} onClick={writeLight}>
                Записать подсветку
              </button>
            </>
          }
        >
          <Field label="Эффект">
            <Select value={light?.effect ?? 0} disabled={!light} onChange={(v) => patch({ effect: v })}
              options={EFFECTS.map((e) => ({
                value: e.id, label: e.name,
                hint: e.color === 'rainbow' ? 'радуга' : e.color === 'palette' ? 'палитра' : undefined
              }))} />
          </Field>
          <RangeField label="Яркость" value={light?.brightness ?? 0} min={0} max={MAX_BRIGHTNESS} disabled={!light}
            onChange={(v) => patch({ brightness: v })} />
          <RangeField label="Скорость" value={light?.speedLevel ?? 0} min={0} max={MAX_SPEED} disabled={!light}
            onChange={(v) => patch({ speedLevel: v })} />
          <div className="row wrap" style={{ gap: 24 }}>
            <Switch checked={!!light?.reverseDirection} disabled={!vendorFields} onChange={(v) => patch({ reverseDirection: v })}
              label="Обратное направление" />
            <Switch checked={!!light?.rainbow} disabled={!vendorFields} onChange={(v) => patch({ rainbow: v })} label="Радуга" />
          </div>
          <Field label="Цвет" hint={colorHint}>
            <div className="row wrap">
              <span className="color-preview"
                style={{ background: light ? toHex(light.red, light.green, light.blue) : 'transparent', opacity: colorEditable ? 1 : 0.3 }} />
              <input className="v-input mono" style={{ width: 96 }} value={hex} disabled={!colorEditable}
                onChange={(e) => {
                  setHex(e.target.value)
                  const rgb = fromHex(e.target.value)
                  if (rgb) patch({ red: rgb[0], green: rgb[1], blue: rgb[2] })
                }} />
              <div className="rgb-inputs">
                {(['red', 'green', 'blue'] as const).map((ch) => (
                  <input key={ch} className="v-input mono v-input-sm" type="number" min={0} max={255}
                    disabled={!colorEditable} value={light?.[ch] ?? 0} title={ch.toUpperCase()}
                    onChange={(e) => patch({ [ch]: Math.max(0, Math.min(255, Number(e.target.value) || 0)) })} />
                ))}
              </div>
            </div>
            <div className="swatches" style={{ marginTop: 8 }}>
              {SWATCHES.map(([name, c]) => {
                const rgb = fromHex(c)!
                const active = !!light && light.red === rgb[0] && light.green === rgb[1] && light.blue === rgb[2]
                return (
                  <button key={name} className={`swatch${active ? ' active' : ''}`} title={name} style={{ background: c }}
                    disabled={!colorEditable} onClick={() => patch({ red: rgb[0], green: rgb[1], blue: rgb[2] })} />
                )
              })}
            </div>
          </Field>
        </Card>

        <Card
          title="Логотип и Win Lock"
          hint={vendorBlocked ? 'только по кабелю' : logo ? 'блок настроек' : 'не прочитано'}
          footer={
            <>
              <span className="spacer" />
              <button className="v-btn v-btn-primary" disabled={!logo || vendorBlocked || !!busy} onClick={writeLogo}>
                Записать
              </button>
            </>
          }
        >
          <Field label="Режим логотипа">
            <Select value={logo?.logoMode ?? 0} disabled={!logo} onChange={(v) => patchLogo({ logoMode: v })}
              options={LOGO_MODES.map((m, i) => ({ value: i, label: m }))} />
          </Field>
          <Field label="Цвет логотипа">
            <Select value={logo?.logoColor ?? 0} disabled={!logo || logo.logoRainbow} onChange={(v) => patchLogo({ logoColor: v })}
              options={LOGO_COLORS.map((m, i) => ({ value: i, label: m }))} />
          </Field>
          <RangeField label="Яркость логотипа" value={logo?.logoBrightness ?? 0} min={0} max={MAX_LOGO_BRIGHTNESS}
            disabled={!logo} onChange={(v) => patchLogo({ logoBrightness: v })} format={(v) => (v === 0 ? 'выкл' : `${v} / ${MAX_LOGO_BRIGHTNESS}`)} />
          <Switch checked={!!logo?.logoRainbow} disabled={!logo} onChange={(v) => patchLogo({ logoRainbow: v })} label="Радуга на логотипе" />
          <Switch checked={!!logo?.winLock} disabled={!logo} onChange={(v) => patchLogo({ winLock: v })} label="Блокировать клавишу Win" />
          {vendorBlocked && (
            <div className="note">
              <StatusDot state="error" />
              <span>Через 2.4G-донгл логотип и Win Lock недоступны. Подключите клавиатуру кабелем.</span>
            </div>
          )}
          <div className="note">
            <StatusDot state="idle" />
            <span>Названия режимов логотипа взяты из gmk87-node и на клавиатуре проверены не все.</span>
          </div>
        </Card>
      </div>
    </>
  )
}
