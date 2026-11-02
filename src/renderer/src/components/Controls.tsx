import { useEffect, useRef, useState, type ReactElement, type ReactNode, type KeyboardEvent } from 'react'
import { IconClose } from './Icons'

export interface SelectOption<T> {
  value: T
  label: string
  hint?: string
}

/** Custom dropdown: native <select> popups are mispositioned in a frameless window. */
export function Select<T extends string | number>({
  value, options: allOptions, onChange, disabled, placeholder, width, searchable
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  disabled?: boolean
  placeholder?: string
  width?: number
  /** Shows a filter field at the top of the menu, for long lists. */
  searchable?: boolean
}): ReactElement {
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState(-1)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const current = allOptions.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const options = q
    ? allOptions.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q))
    : allOptions

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    // Only on open: the filtered list is a new array every render and must not reset the hover focus.
    if (open) setFocus(Math.max(0, allOptions.findIndex((o) => o.value === value)))
  }, [open])

  const onKey = (e: KeyboardEvent): void => {
    if (disabled) return
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') setFocus((f) => Math.min(options.length - 1, f + 1))
    else if (e.key === 'ArrowUp') setFocus((f) => Math.max(0, f - 1))
    else if (e.key === 'Enter' && focus >= 0) {
      onChange(options[focus].value)
      setOpen(false)
    } else return
    e.preventDefault()
  }

  return (
    <div className={`v-select${open ? ' open' : ''}`} ref={ref} style={width ? { width } : undefined} onKeyDown={onKey}>
      <button type="button" className="v-select-trigger" disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <span className="v-select-value">{current?.label ?? placeholder ?? '—'}</span>
        <span className="v-select-caret" />
      </button>
      {open && (
        <div className="v-select-menu" role="listbox">
          {searchable && (
            <input className="v-input v-input-sm v-select-search" autoFocus placeholder="Поиск…" value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setFocus(0)
              }} />
          )}
          {options.map((o, i) => (
            <button
              type="button"
              key={String(o.value)}
              className={`v-select-option${o.value === value ? ' selected' : ''}${i === focus ? ' focused' : ''}`}
              onMouseEnter={() => setFocus(i)}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.label}
              {o.hint && <span className="opt-hint">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Segmented<T extends string | number>({
  value, options, onChange, disabled
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  disabled?: boolean
}): ReactElement {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button type="button" key={String(o.value)} className={o.value === value ? 'active' : ''}
          disabled={disabled} onClick={() => onChange(o.value)} title={o.hint}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({
  checked, onChange, label, disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  disabled?: boolean
}): ReactElement {
  return (
    <label className={`v-switch${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="v-switch-track" />
      <span>{label}</span>
    </label>
  )
}

export function RangeField({
  label, value, min, max, onChange, disabled, format, hint
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  disabled?: boolean
  format?: (v: number) => string
  hint?: string
}): ReactElement {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <span className="mono">{format ? format(value) : `${value} / ${max}`}</span>
      </div>
      <input className="v-range" type="range" min={min} max={max} step={1} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

export function Card({
  title, hint, children, footer, mono
}: {
  title: ReactNode
  hint?: ReactNode
  children: ReactNode
  footer?: ReactNode
  mono?: boolean
}): ReactElement {
  return (
    <section className="block-card">
      <div className="block-card-header">
        <h3>{title}</h3>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <div className={`block-card-body${mono ? ' mono' : ''}`}>{children}</div>
      {footer && <div className="block-card-footer">{footer}</div>}
    </section>
  )
}

export function Modal({
  title, children, footer, onClose
}: {
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}): ReactElement {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog">
        <div className="modal-header">
          <h2>{title}</h2>
          <span className="spacer" />
          <button className="v-btn v-btn-ghost v-btn-icon" onClick={onClose} title="Закрыть">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function Progress({ value }: { value: number }): ReactElement {
  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

export function Spinner(): ReactElement {
  return <span className="spinner" />
}

export function StatusDot({ state }: { state: 'ok' | 'error' | 'busy' | 'idle' }): ReactElement {
  return <span className={`status-dot ${state === 'idle' ? '' : state}`} />
}
