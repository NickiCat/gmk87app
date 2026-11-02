import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useStore } from '../store'
import { Card, Progress, Segmented, StatusDot } from '../components/Controls'
import { IconDownload, IconRefresh, IconUpload } from '../components/Icons'
import { LAYOUT_HEIGHT, LAYOUT_KEYS, LAYOUT_WIDTH, type LayoutKey } from '@shared/layout'
import { KEYCODE_GROUPS, KeycodeSet, hex4, type KeycodeGroup } from '@shared/keycodes'
import type { KeyChange, KeymapData } from '@shared/api'

const GROUP_NAMES: Record<KeycodeGroup, string> = {
  Basic: 'Основные', Modifiers: 'Модификаторы', Media: 'Медиа', Layers: 'Слои', Lighting: 'Подсветка',
  Vendor: 'Вендорские', Mouse: 'Мышь', Macros: 'Макросы', Special: 'Особые'
}

const idx = (k: KeymapData, layer: number, row: number, col: number): number => (layer * k.rows + row) * k.cols + col

export function KeymapPage(): ReactElement {
  const { status, keymap, setKeymap, run, busy, progress, confirm, toast } = useStore()
  const [layer, setLayer] = useState(0)
  const [selected, setSelected] = useState<LayoutKey | null>(null)
  const [group, setGroup] = useState<KeycodeGroup | 'all'>('Basic')
  const [query, setQuery] = useState('')
  const [hexInput, setHexInput] = useState('')
  const [changed, setChanged] = useState<Set<number>>(new Set())

  const set = KeycodeSet.forProtocol(keymap?.protocol)
  const connected = !!status?.connected
  const current = keymap && selected ? keymap.codes[idx(keymap, layer, selected.row, selected.col)] : null

  useEffect(() => {
    setHexInput(current != null ? hex4(current) : '')
  }, [current])

  const read = (): Promise<unknown> =>
    run('Чтение раскладки', async () => {
      const k = await window.gmk.keymap.read()
      setKeymap(k)
      setChanged(new Set())
      setLayer((l) => Math.min(l, k.layers - 1))
      toast('ok', `Раскладка прочитана: ${k.layers} слоя`)
    })

  const write = async (code: number): Promise<void> => {
    if (!keymap || !selected) return
    const old = keymap.codes[idx(keymap, layer, selected.row, selected.col)]
    if (old === code) return
    if (layer === 0 && set.isLayerAccess(old) && !set.isLayerAccess(code)) {
      const ok = await confirm({
        title: 'Заменить клавишу слоя?',
        body: (
          <p>
            На этой клавише сейчас <code>{set.label(old)}</code>: через неё открывается Fn-слой. Без неё до
            функций второго слоя (включая экран и Bluetooth) можно будет добраться только через приложение.
          </p>
        ),
        confirm: 'Заменить',
        danger: true
      })
      if (!ok) return
    }
    const change: KeyChange = { layer, row: selected.row, col: selected.col, code }
    await run('Запись клавиши', async () => {
      const back = await window.gmk.keymap.setKey(change)
      const i = idx(keymap, layer, selected.row, selected.col)
      const codes = [...keymap.codes]
      codes[i] = back
      setKeymap({ ...keymap, codes })
      setChanged((s) => new Set(s).add(i))
      if (back === code) toast('ok', `${set.label(old)} → ${set.label(code)}`)
      else toast('error', `Клавиатура вернула ${hex4(back)} вместо ${hex4(code)}`)
    })
  }

  const saveBackup = (): Promise<unknown> =>
    run('Сохранение копии', async () => {
      if (!keymap) return
      const path = await window.gmk.keymap.saveBackup(keymap)
      if (path) toast('ok', `Сохранено: ${path}`)
    })

  const restore = async (): Promise<void> => {
    if (!keymap) return
    const backup = await window.gmk.keymap.loadBackup().catch((e: Error) => {
      toast('error', e.message)
      return null
    })
    if (!backup) return
    if (backup.layers !== keymap.layers || backup.rows !== keymap.rows || backup.cols !== keymap.cols) {
      toast('error', `Копия ${backup.layers}×${backup.rows}×${backup.cols}, клавиатура ${keymap.layers}×${keymap.rows}×${keymap.cols}`)
      return
    }
    const changes: KeyChange[] = []
    for (let l = 0; l < keymap.layers; l++)
      for (let r = 0; r < keymap.rows; r++)
        for (let c = 0; c < keymap.cols; c++) {
          const i = idx(keymap, l, r, c)
          if (keymap.codes[i] !== backup.codes[i]) changes.push({ layer: l, row: r, col: c, code: backup.codes[i] })
        }
    if (!changes.length) {
      toast('info', 'Раскладка уже совпадает с копией')
      return
    }
    const schemeWarning = backup.protocol !== keymap.protocol
    const ok = await confirm({
      title: 'Восстановить раскладку?',
      body: (
        <>
          <p>Отличается клавиш: {changes.length}. Они будут записаны по одной.</p>
          {schemeWarning && (
            <div className="note">
              <StatusDot state="error" />
              <span>
                Копия сделана на VIA {backup.protocol}, а клавиатура сейчас на VIA {keymap.protocol}. Коды клавиш в этих
                версиях отличаются: часть клавиш может работать иначе.
              </span>
            </div>
          )}
        </>
      ),
      confirm: `Записать ${changes.length}`,
      danger: schemeWarning
    })
    if (!ok) return
    await run('Восстановление раскладки', async () => {
      const written = await window.gmk.keymap.writeMany(changes)
      const k = await window.gmk.keymap.read()
      setKeymap(k)
      setChanged(new Set(changes.map((c) => idx(k, c.layer, c.row, c.col))))
      toast(written === changes.length ? 'ok' : 'error', `Записано ${written} из ${changes.length}`)
    })
  }

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return set.picker.filter(
      (e) =>
        (q ? e.label.toLowerCase().includes(q) || hex4(e.code).toLowerCase().includes(q) : group === 'all' || e.group === group)
    )
  }, [set, group, query])

  const kmProgress = progress['keymap'] ?? progress['keymap-write']

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Раскладка</h1>
          <p>
            Выберите клавишу на схеме и новое назначение ниже. Клавиатура сохраняет каждую клавишу сразу,
            отдельной кнопки «применить» нет.
          </p>
        </div>
        <div className="page-actions">
          <button className="v-btn v-btn-secondary" disabled={!keymap || !!busy} onClick={saveBackup}>
            <IconDownload width={14} height={14} /> Сохранить копию
          </button>
          <button className="v-btn v-btn-secondary" disabled={!keymap || !!busy} onClick={restore}>
            <IconUpload width={14} height={14} /> Восстановить
          </button>
          <button className="v-btn v-btn-primary" disabled={!connected || !!busy} onClick={read}>
            <IconRefresh width={14} height={14} /> {keymap ? 'Перечитать' : 'Прочитать'}
          </button>
        </div>
      </div>

      {kmProgress && (
        <div style={{ marginBottom: 16 }}>
          <Progress value={kmProgress.done / kmProgress.total} />
        </div>
      )}

      {!keymap ? (
        <div className="stack">
          <KeyboardView keymap={null} layer={0} set={set} selected={null} changed={changed} onSelect={() => undefined} />
          <div className="empty">
            {connected ? 'Нажмите «Прочитать», чтобы загрузить раскладку по VIA.' : 'Подключите клавиатуру.'}
            {status?.mode === 'dongle' && (
              <div style={{ marginTop: 8 }}>Через 2.4G-донгл VIA может не отвечать: для раскладки нужен кабель.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="row">
            <Segmented value={layer} onChange={(l) => setLayer(l)}
              options={Array.from({ length: keymap.layers }, (_, i) => ({ value: i, label: `Слой ${i}`, hint: i === 1 ? 'Fn' : undefined }))} />
            <span className="spacer" />
            <span className="muted mono" style={{ fontSize: 12 }}>
              {set.name}
            </span>
          </div>
          <KeyboardView keymap={keymap} layer={layer} set={set} selected={selected} changed={changed} onSelect={setSelected} />

          <Card
            title={selected ? `Клавиша [${selected.row},${selected.col}] · слой ${layer}` : 'Назначение'}
            hint={current != null ? `${set.label(current)} · ${hex4(current)}` : 'выберите клавишу на схеме'}
          >
            <div className="row wrap">
              <input className="v-input" style={{ width: 240 }} placeholder="Поиск: Enter, F5, MO(1)…" value={query}
                onChange={(e) => setQuery(e.target.value)} />
              <span className="spacer" />
              <input className="v-input mono" style={{ width: 110 }} value={hexInput} disabled={!selected}
                onChange={(e) => setHexInput(e.target.value)} placeholder="0x0000" />
              <button className="v-btn v-btn-secondary" disabled={!selected || !!busy || !/^(0x)?[0-9a-f]{1,4}$/i.test(hexInput.trim())}
                onClick={() => void write(parseInt(hexInput.trim().replace(/^0x/i, ''), 16))}>
                Записать код
              </button>
            </div>
            {!query && (
              <div className="chips">
                <button className={`chip${group === 'all' ? ' active' : ''}`} onClick={() => setGroup('all')}>Все</button>
                {KEYCODE_GROUPS.map((g) => (
                  <button key={g} className={`chip${group === g ? ' active' : ''}`} onClick={() => setGroup(g)}>
                    {GROUP_NAMES[g]}
                  </button>
                ))}
              </div>
            )}
            <div className="picker-grid">
              {entries.map((e) => (
                <button key={e.code} className={`picker-item${e.code === current ? ' active' : ''}`}
                  title={`${e.label} · ${hex4(e.code)}`} disabled={!selected || !!busy}
                  onClick={() => void write(e.code)}>
                  {e.label}
                </button>
              ))}
              {!entries.length && <span className="muted">Ничего не найдено</span>}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

function KeyboardView({
  keymap, layer, set, selected, changed, onSelect
}: {
  keymap: KeymapData | null
  layer: number
  set: KeycodeSet
  selected: LayoutKey | null
  changed: Set<number>
  onSelect: (k: LayoutKey) => void
}): ReactElement {
  const wrap = useRef<HTMLDivElement>(null)
  const [unit, setUnit] = useState(44)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      setUnit(Math.max(28, Math.min(56, Math.floor((e.contentRect.width - 2) / LAYOUT_WIDTH))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="keyboard-wrap" ref={wrap}>
      <div className="keyboard" style={{ width: LAYOUT_WIDTH * unit, height: LAYOUT_HEIGHT * unit }}>
        {LAYOUT_KEYS.map((k) => {
          const i = keymap ? idx(keymap, layer, k.row, k.col) : -1
          const code = keymap ? keymap.codes[i] : null
          const label = code != null ? set.shortLabel(code) : ''
          const isSel = selected?.row === k.row && selected?.col === k.col
          const cls = [
            'keycap',
            `tone-${k.tone}`,
            isSel ? 'selected' : '',
            code === 1 ? 'transparent' : '',
            changed.has(i) ? 'changed' : ''
          ].join(' ')
          return (
            <button key={`${k.row},${k.col}`} className={cls}
              title={code != null ? `${set.label(code)} · ${hex4(code)} · [${k.row},${k.col}]` : `[${k.row},${k.col}]`}
              style={{ left: k.x * unit, top: k.y * unit, width: k.w * unit - 2, height: k.h * unit - 2 }}
              onClick={() => onSelect(k)}>
              <span className={`keycap-label${label.length > 5 && k.w < 1.5 ? ' long' : ''}`}>{label}</span>
              <span className="keycap-pos">{k.row},{k.col}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
