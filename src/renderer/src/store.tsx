import {
  createContext, useCallback, type Dispatch, type SetStateAction, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode
} from 'react'
import type {
  ConfigSnapshot, DeviceProbe, DeviceStatus, KeymapData, LogEntry, MacroData, ProgressEvent, Settings
} from '@shared/api'
import type { Macro } from '@shared/macros'
import { Modal } from './components/Controls'

const MAX_LOG = 2000

interface Toast {
  kind: 'ok' | 'error' | 'info'
  text: string
}

interface ConfirmRequest {
  title: string
  body: ReactNode
  confirm: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface Store {
  status: DeviceStatus | null
  probe: DeviceProbe | null
  setProbe: (p: DeviceProbe | null) => void
  logs: LogEntry[]
  clearLogs: () => void
  progress: Record<string, ProgressEvent>
  busy: string | null
  /** Runs one keyboard operation at a time; errors become a toast and the log keeps the detail. */
  run: <T>(label: string, fn: () => Promise<T>) => Promise<T | undefined>
  toast: (kind: Toast['kind'], text: string) => void
  confirm: (r: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>
  settings: Settings | null
  setSettings: (s: Settings) => void
  /** The 2.4G dongle does not carry the 0xFF1C protocol (display, clock, logo, lighting colour). */
  vendorBlocked: boolean
  keymap: KeymapData | null
  setKeymap: (k: KeymapData | null) => void
  config: ConfigSnapshot | null
  setConfig: (c: ConfigSnapshot | null) => void
  /** Macros as last read from / written to the keyboard, and the unsaved edits. */
  macroData: MacroData | null
  setMacroData: (m: MacroData | null) => void
  macroDraft: Macro[] | null
  setMacroDraft: Dispatch<SetStateAction<Macro[] | null>>
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

export function StoreProvider({ children }: { children: ReactNode }): ReactElement {
  const [status, setStatus] = useState<DeviceStatus | null>(null)
  const [probe, setProbe] = useState<DeviceProbe | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState<Record<string, ProgressEvent>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [toastState, setToast] = useState<Toast | null>(null)
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [keymap, setKeymap] = useState<KeymapData | null>(null)
  const [config, setConfig] = useState<ConfigSnapshot | null>(null)
  const [macroData, setMacroData] = useState<MacroData | null>(null)
  const [macroDraft, setMacroDraft] = useState<Macro[] | null>(null)
  const toastTimer = useRef<number>()
  const busyRef = useRef(false)

  useEffect(() => {
    void window.gmk.device.status().then(setStatus)
    void window.gmk.settings.get().then(setSettings)
    const offStatus = window.gmk.device.onStatus((s) => {
      setStatus(s)
      if (!s.connected) {
        setProbe(null)
        setKeymap(null)
        setConfig(null)
        setMacroData(null)
      }
    })
    const offLog = window.gmk.onLog((e) => setLogs((l) => (l.length >= MAX_LOG ? [...l.slice(-MAX_LOG + 1), e] : [...l, e])))
    const offProgress = window.gmk.onProgress((e) => setProgress((p) => ({ ...p, [e.op]: e })))
    return () => {
      offStatus()
      offLog()
      offProgress()
    }
  }, [])

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    setToast({ kind, text })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 5000 : 2500)
  }, [])

  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
      if (busyRef.current) {
        toast('info', 'Дождитесь окончания текущей операции')
        return undefined
      }
      busyRef.current = true
      setBusy(label)
      try {
        return await fn()
      } catch (e) {
        toast('error', e instanceof Error ? e.message : String(e))
        return undefined
      } finally {
        busyRef.current = false
        setBusy(null)
        setProgress({})
      }
    },
    [toast]
  )

  const confirm = useCallback(
    (r: Omit<ConfirmRequest, 'resolve'>) => new Promise<boolean>((resolve) => setConfirmReq({ ...r, resolve })),
    []
  )

  const closeConfirm = (ok: boolean): void => {
    confirmReq?.resolve(ok)
    setConfirmReq(null)
  }

  const value = useMemo<Store>(
    () => ({
      status, probe, setProbe, logs, clearLogs: () => setLogs([]), progress, busy, run, toast, confirm,
      settings, setSettings, keymap, setKeymap, config, setConfig, macroData, setMacroData, macroDraft, setMacroDraft,
      vendorBlocked: status?.mode === 'dongle' && !settings?.vendorOverDongle
    }),
    [status, probe, logs, progress, busy, run, toast, confirm, settings, keymap, config, macroData, macroDraft]
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastState && (
        <div className="toast">
          <span className={`status-dot ${toastState.kind === 'ok' ? 'ok' : toastState.kind === 'error' ? 'error' : ''}`} />
          <span className={toastState.kind === 'error' ? 'status error' : ''}>{toastState.text}</span>
        </div>
      )}
      {confirmReq && (
        <Modal
          title={confirmReq.title}
          onClose={() => closeConfirm(false)}
          footer={
            <>
              <button className="v-btn v-btn-ghost" onClick={() => closeConfirm(false)}>Отмена</button>
              <button className={`v-btn ${confirmReq.danger ? 'v-btn-danger' : 'v-btn-primary'}`} autoFocus
                onClick={() => closeConfirm(true)}>
                {confirmReq.confirm}
              </button>
            </>
          }
        >
          {confirmReq.body}
        </Modal>
      )}
    </Ctx.Provider>
  )
}
