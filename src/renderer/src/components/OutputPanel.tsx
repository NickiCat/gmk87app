import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useStore } from '../store'
import { IconChevron, IconTerminal, IconTrash } from './Icons'

const TAGS: Record<string, string> = { tx: '→', rx: '←', cmd: '$', error: '!', warn: '·', ok: '✓', info: '·' }

const time = (ts: number): string => new Date(ts).toLocaleTimeString('ru-RU', { hour12: false })

export function OutputPanel(): ReactElement {
  const { logs, clearLogs } = useStore()
  const [height, setHeight] = useState(160)
  const [open, setOpen] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [hIndex, setHIndex] = useState(-1)
  const bodyRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = bodyRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [logs, open])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent): void => {
      setHeight(Math.max(90, Math.min(window.innerHeight - 220, window.innerHeight - e.clientY)))
    }
    const onUp = (): void => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const submit = async (): Promise<void> => {
    const line = input.trim()
    if (!line) return
    setInput('')
    setHistory((h) => [line, ...h.filter((x) => x !== line)].slice(0, 50))
    setHIndex(-1)
    if (line === 'clear') {
      clearLogs()
      return
    }
    stick.current = true
    await window.gmk.console.run(line)
  }

  return (
    <div className="output-panel" style={{ height: open ? height : 34 }}>
      {open && <div className={`output-resize${dragging ? ' dragging' : ''}`} onMouseDown={() => setDragging(true)} />}
      <div className="output-header">
        <IconTerminal width={14} height={14} />
        <span>Лог</span>
        <span className="muted mono">{logs.length}</span>
        <span className="spacer" />
        <button className="v-btn v-btn-ghost v-btn-icon" title="Очистить" onClick={clearLogs}>
          <IconTrash width={14} height={14} />
        </button>
        <button className="v-btn v-btn-ghost v-btn-icon" title={open ? 'Свернуть' : 'Развернуть'} onClick={() => setOpen((o) => !o)}>
          <IconChevron width={14} height={14} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      {open && (
        <>
          <div
            className="output-body"
            ref={bodyRef}
            onScroll={(e) => {
              const el = e.currentTarget
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
            }}
          >
            {logs.length === 0 && <div className="muted">Введите help для списка команд.</div>}
            {logs.map((l, i) => (
              <div key={i} className={`log-line ${l.level}`}>
                <span className="log-ts">{time(l.ts)}</span>
                <span className="log-tag">{TAGS[l.level]}</span>
                <span className="log-text">{l.text}</span>
              </div>
            ))}
          </div>
          <div className="output-prompt">
            <span>gmk87&nbsp;$</span>
            <input
              value={input}
              spellCheck={false}
              placeholder="help"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
                else if (e.key === 'ArrowUp' && history.length) {
                  const i = Math.min(history.length - 1, hIndex + 1)
                  setHIndex(i)
                  setInput(history[i])
                  e.preventDefault()
                } else if (e.key === 'ArrowDown') {
                  const i = hIndex - 1
                  setHIndex(Math.max(-1, i))
                  setInput(i >= 0 ? history[i] : '')
                  e.preventDefault()
                }
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
