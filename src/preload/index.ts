import { contextBridge, ipcRenderer } from 'electron'
import type { Gmk87Api } from '@shared/api'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  if (!r.ok) throw new Error(r.error)
  return r.value
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Gmk87Api = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close')
  },
  device: {
    status: () => invoke('device:status'),
    probe: () => invoke('device:probe'),
    onStatus: (cb) => subscribe('device:status', cb)
  },
  keymap: {
    read: () => invoke('keymap:read'),
    setKey: (c) => invoke('keymap:setKey', c),
    writeMany: (c) => invoke('keymap:writeMany', c),
    saveBackup: (d) => invoke('keymap:saveBackup', d),
    loadBackup: () => invoke('keymap:loadBackup')
  },
  macros: {
    read: () => invoke('macros:read'),
    write: (m) => invoke('macros:write', m)
  },
  config: {
    read: () => invoke('config:read'),
    update: (p) => invoke('config:update', { ...p, clock: p.clock?.toISOString() }),
    syncClock: () => invoke('config:syncClock')
  },
  lighting: {
    read: () => invoke('lighting:read'),
    write: (w) => invoke('lighting:write', w)
  },
  display: {
    pickImage: () => invoke('display:pickImage'),
    upload: (req) => invoke('display:upload', req),
    cancelUpload: () => ipcRenderer.send('display:cancelUpload')
  },
  console: {
    run: (line) => invoke('console:run', line)
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (p) => invoke('settings:set', p),
    pickBackupDir: () => invoke('settings:pickBackupDir')
  },
  onLog: (cb) => subscribe('log', cb),
  onProgress: (cb) => subscribe('progress', cb)
}

contextBridge.exposeInMainWorld('gmk', api)
