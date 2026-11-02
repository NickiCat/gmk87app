import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useStore } from '../store'
import { Card, Progress, Segmented, Select, StatusDot } from '../components/Controls'
import { IconChevron, IconClose, IconRefresh, IconUpload } from '../components/Icons'
import { KeycodeSet, hex4 } from '@shared/keycodes'
import {
  HID_BY_DOM_CODE, compactTaps, isTypable, serializeMacro, serializeMacros, type Macro, type MacroAction
} from '@shared/macros'

const KEY_TYPES: Array<{ value: 'tap' | 'down' | 'up'; label: string; hint: string }> = [
  { value: 'tap', label: 'Нажать', hint: 'нажать и отпустить' },
  { value: 'down', label: 'Зажать', hint: 'держать до «Отпустить»' },
  { value: 'up', label: 'Отпустить', hint: 'отпустить зажатую' }
]

const TYPE_NAMES: Record<MacroAction['type'], string> = {
  text: 'текст', tap: 'клавиша', down: 'клавиша', up: 'клавиша', delay: 'пауза', raw: 'байты'
}

function preview(m: Macro, set: KeycodeSet): string {
  if (!m.length) return 'пусто'
  return m
    .map((a) =>
      a.type === 'text' ? a.text
        : a.type === 'delay' ? `⏱${a.ms}`
          : a.type === 'raw' ? '…'
            : (a.type === 'down' ? '↓' : a.type === 'up' ? '↑' : '') + set.shortLabel(a.code))
    .join(' ')
}

function sizeOf(m: Macro): number | null {
  try {
    return serializeMacro(m).length + 1
  } catch {
    return null
  }
}

export function MacrosPage(): ReactElement {
  const { status, run, busy, toast, confirm, progress, macroData, setMacroData, macroDraft, setMacroDraft } = useStore()
  const [selected, setSelected] = useState(0)
  const [recording, setRecording] = useState(false)
  const connected = !!status?.connected
  const set = KeycodeSet.forProtocol(macroData?.protocol)
  const draft = macroDraft ?? macroData?.macros ?? null
  const macro = draft?.[selected] ?? []

  const keyOptions = useMemo(
    () => set.picker
      .filter((e) => e.code >= 0x04 && e.code <= 0xff)
      .map((e) => ({ value: e.code, label: e.label, hint: hex4(e.code) })),
    [set]
  )

  const dirty = !!draft && !!macroData && JSON.stringify(draft) !== JSON.stringify(macroData.macros)
  const used = useMemo(() => {
    if (!draft) return null
    try {
      return serializeMacros(draft).length
    } catch {
      return null
    }
  }, [draft])
  const error = useMemo(() => {
    if (!draft) return null
    for (let i = 0; i < draft.length; i++) {
      try {
        serializeMacro(draft[i])
      } catch (e) {
        return `Macro ${i}: ${e instanceof Error ? e.message : e}`
      }
    }
    if (macroData && used !== null && used > macroData.bufferSize) return `Не помещается: ${used} из ${macroData.bufferSize} байт`
    return null
  }, [draft, used, macroData])

  // Functional update: recorded key events can arrive faster than React re-renders.
  const update = (fn: (m: Macro) => Macro): void => {
    if (!macroData) return
    setMacroDraft((prev) => (prev ?? macroData.macros).map((m, i) => (i === selected ? fn(m) : m)))
  }
  const setAction = (i: number, a: MacroAction): void => update((m) => m.map((x, j) => (j === i ? a : x)))
  const move = (i: number, d: -1 | 1): void =>
    update((m) => {
      const j = i + d
      if (j < 0 || j >= m.length) return m
      const next = [...m]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  // Recording: keystrokes in the app window become down/up actions, folded into taps when done.
  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      const code = HID_BY_DOM_CODE[e.code]
      e.preventDefault()
      e.stopPropagation()
      if (code === undefined || e.repeat) return
      update((m) => [...m, { type: e.type === 'keydown' ? 'down' : 'up', code }])
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
    }
  })

  const stopRecording = (): void => {
    setRecording(false)
    update(compactTaps)
  }

  useEffect(() => () => setRecording(false), [])

  const read = async (): Promise<void> => {
    if (dirty && !(await confirm({ title: 'Отменить изменения?', body: <p>Несохранённые правки макросов пропадут.</p>, confirm: 'Перечитать', danger: true }))) return
    await run('Чтение макросов', async () => {
      const d = await window.gmk.macros.read()
      setMacroData(d)
      setMacroDraft(null)
      setSelected((s) => Math.min(s, Math.max(0, d.count - 1)))
      toast('ok', `Макросов: ${d.count}, буфер ${d.bufferSize} байт`)
    })
  }

  const save = (): Promise<unknown> =>
    run('Запись макросов', async () => {
      if (!draft) return
      const d = await window.gmk.macros.write(draft)
      setMacroData(d)
      setMacroDraft(null)
      toast('ok', 'Макросы записаны')
    })

  const p = progress['macros']

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Макросы</h1>
          <p>
            Последовательности нажатий и текста, которые клавиатура выполняет сама. Чтобы макрос срабатывал,
            назначьте клавише код <code>Macro N</code> на странице «Раскладка» (группа «Макросы»).
          </p>
        </div>
        <div className="page-actions">
          <button className="v-btn v-btn-secondary" disabled={!connected || !!busy || recording} onClick={() => void read()}>
            <IconRefresh width={14} height={14} /> {macroData ? 'Перечитать' : 'Прочитать'}
          </button>
          <button className="v-btn v-btn-primary" disabled={!dirty || !!error || !!busy || recording} onClick={save}
            title={error ?? undefined}>
            <IconUpload width={14} height={14} /> Записать на клавиатуру
          </button>
        </div>
      </div>

      {p && busy && (
        <div style={{ marginBottom: 16 }}>
          <Progress value={p.done / p.total} />
        </div>
      )}

      {!draft || !macroData ? (
        <div className="stack">
          <div className="empty">{connected ? 'Нажмите «Прочитать», чтобы загрузить макросы по VIA.' : 'Подключите клавиатуру.'}</div>
          <div className="note">
            <StatusDot state="idle" />
            <span>
              Поддержку макросов прошивкой GMK87 никто пока не проверял. Если клавиатура ответит, что команда не
              поддерживается, значит, макросов в этой прошивке нет.
            </span>
          </div>
        </div>
      ) : macroData.count === 0 ? (
        <div className="empty">Прошивка сообщает 0 макросов.</div>
      ) : (
        <div className="macro-layout">
          <section className="block-card">
            <div className="block-card-header">
              <h3>Макросы</h3>
              <span className="hint mono">{used ?? '?'} / {macroData.bufferSize} Б</span>
            </div>
            {used !== null && (
              <div style={{ padding: '8px 12px 0' }}>
                <Progress value={used / macroData.bufferSize} />
              </div>
            )}
            <div className="macro-list">
              {draft.map((m, i) => (
                <button key={i} className={`nav-item macro-item${i === selected ? ' active' : ''}`}
                  disabled={recording} onClick={() => setSelected(i)}>
                  <span className="mono">M{i}</span>
                  {JSON.stringify(m) !== JSON.stringify(macroData.macros[i]) && <span className="status-dot busy" title="изменён" />}
                  <span className="macro-preview">{preview(m, set)}</span>
                </button>
              ))}
            </div>
          </section>

          <Card
            title={`Macro ${selected}`}
            hint={`клавиша ${hex4(set.macro(selected))} · ${sizeOf(macro) ?? '?'} Б`}
            footer={
              <>
                <button className="v-btn v-btn-ghost v-btn-sm" disabled={!macro.length || recording}
                  onClick={() => update(() => [])}>Очистить</button>
                <span className="spacer" />
                {dirty && (
                  <button className="v-btn v-btn-ghost v-btn-sm" disabled={recording}
                    onClick={() => setMacroDraft(null)}>Отменить все правки</button>
                )}
              </>
            }
          >
            <div className="row wrap">
              <button className="v-btn v-btn-secondary v-btn-sm" disabled={recording}
                onClick={() => update((m) => [...m, { type: 'text', text: '' }])}>+ Текст</button>
              <button className="v-btn v-btn-secondary v-btn-sm" disabled={recording}
                onClick={() => update((m) => [...m, { type: 'tap', code: 0x04 }])}>+ Клавиша</button>
              <button className="v-btn v-btn-secondary v-btn-sm" disabled={recording}
                onClick={() => update((m) => [...m, { type: 'delay', ms: 100 }])}>+ Пауза</button>
              <span className="spacer" />
              {recording ? (
                <button className="v-btn v-btn-sm recording" onClick={stopRecording}>
                  <span className="rec-dot" /> Остановить запись
                </button>
              ) : (
                <button className="v-btn v-btn-secondary v-btn-sm" onClick={() => setRecording(true)}>
                  <span className="status-dot error" /> Записать с клавиатуры
                </button>
              )}
            </div>
            {recording && (
              <div className="note">
                <span className="rec-dot" style={{ marginTop: 4 }} />
                <span>Нажимайте клавиши: каждое нажатие и отпускание добавится в макрос. Затем нажмите «Остановить запись».</span>
              </div>
            )}

            <div className="macro-actions">
              {macro.length === 0 && <div className="muted">Макрос пуст. Добавьте действия кнопками выше или запишите с клавиатуры.</div>}
              {macro.map((a, i) => (
                <div className="macro-row" key={i}>
                  <span className="macro-row-type">{TYPE_NAMES[a.type]}</span>
                  <div className="macro-row-body">
                    <ActionEditor action={a} keyOptions={keyOptions} onChange={(x) => setAction(i, x)} disabled={recording} />
                  </div>
                  <button className="v-btn v-btn-ghost v-btn-icon" title="Выше" disabled={i === 0 || recording} onClick={() => move(i, -1)}>
                    <IconChevron width={14} height={14} />
                  </button>
                  <button className="v-btn v-btn-ghost v-btn-icon" title="Ниже" disabled={i === macro.length - 1 || recording} onClick={() => move(i, 1)}>
                    <IconChevron width={14} height={14} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  <button className="v-btn v-btn-ghost v-btn-icon" title="Удалить" disabled={recording}
                    onClick={() => update((m) => m.filter((_, j) => j !== i))}>
                    <IconClose width={14} height={14} />
                  </button>
                </div>
              ))}
            </div>

            {error && (
              <div className="note">
                <StatusDot state="error" />
                <span>{error}</span>
              </div>
            )}
            <div className="field-hint">
              Текст набирается в английской раскладке: только латиница, цифры и ASCII-знаки. Клавиши с модификаторами
              делайте через «Зажать» и «Отпустить», например Ctrl зажать → C → Ctrl отпустить.
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

function ActionEditor({
  action, keyOptions, onChange, disabled
}: {
  action: MacroAction
  keyOptions: Array<{ value: number; label: string; hint: string }>
  onChange: (a: MacroAction) => void
  disabled: boolean
}): ReactElement {
  switch (action.type) {
    case 'text': {
      const bad = [...action.text].find((ch) => !isTypable(ch))
      return (
        <>
          <input className="v-input mono v-input-sm" style={{ flex: 1 }} value={action.text} disabled={disabled}
            placeholder="Текст для набора" onChange={(e) => onChange({ type: 'text', text: e.target.value })} />
          {bad && <span className="status error" style={{ fontSize: 12 }}>«{bad}» не набрать</span>}
        </>
      )
    }
    case 'tap':
    case 'down':
    case 'up':
      return (
        <>
          <Segmented value={action.type} options={KEY_TYPES} disabled={disabled}
            onChange={(t) => onChange({ type: t, code: action.code })} />
          <Select value={action.code} options={keyOptions} searchable width={200} disabled={disabled}
            onChange={(code) => onChange({ type: action.type, code })} />
        </>
      )
    case 'delay':
      return (
        <>
          <input className="v-input mono v-input-sm" type="number" min={1} max={65535} style={{ width: 100 }}
            value={action.ms} disabled={disabled}
            onChange={(e) => onChange({ type: 'delay', ms: Math.max(1, Math.min(65535, Number(e.target.value) || 1)) })} />
          <span className="muted">мс</span>
        </>
      )
    case 'raw':
      return (
        <span className="mono muted" style={{ fontSize: 12 }} title="Неизвестное действие, записывается без изменений">
          {action.bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}
        </span>
      )
  }
}
