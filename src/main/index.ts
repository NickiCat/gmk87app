import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { basename, join } from 'path'
import { Keyboard, msg } from './keyboard'
import { loadSettings, saveSettings } from './settings'
import type { KeyChange, KeymapBackup, KeymapData, LightingWrite, Settings, UploadRequest } from '@shared/api'
import type { ConfigPatch } from '@shared/config'
import type { Macro } from '@shared/macros'

let win: BrowserWindow | null = null

const send = (channel: string, payload: unknown): void => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

const keyboard = new Keyboard({
  log: (e) => send('log', e),
  progress: (e) => send('progress', e)
})

function createWindow(): void {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    backgroundColor: '#000000',
    show: false,
    title: 'GMK87 Control',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.on('ready-to-show', () => win?.show())
  win.webContents.on('did-finish-load', () => keyboard.resetStatusLog())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** IPC handlers return { ok, value } / { ok: false, error } so renderer errors keep their message. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...(args as A)) }
    } catch (e) {
      keyboard.log('error', msg(e))
      return { ok: false, error: msg(e) }
    }
  })
}

function registerIpc(): void {
  ipcMain.on('window:minimize', () => win?.minimize())
  ipcMain.on('window:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('window:close', () => win?.close())

  handle('device:status', () => keyboard.status())
  handle('device:probe', () => keyboard.probe())

  handle('keymap:read', () => keyboard.readKeymap())
  handle('keymap:setKey', (c: KeyChange) => keyboard.setKey(c))
  handle('keymap:writeMany', (c: KeyChange[]) => keyboard.writeMany(c))
  handle('keymap:saveBackup', async (data: KeymapData) => {
    const settings = await loadSettings()
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
    const r = await dialog.showSaveDialog(win!, {
      title: 'Сохранить раскладку',
      defaultPath: join(settings.backupDir, `gmk87-keymap-${stamp}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePath) return null
    const backup: KeymapBackup = { format: 'gmk87-keymap', version: 1, savedAt: new Date().toISOString(), ...data }
    await fs.writeFile(r.filePath, JSON.stringify(backup, null, 2))
    keyboard.log('ok', `Раскладка сохранена: ${r.filePath}`)
    return r.filePath
  })
  handle('keymap:loadBackup', async () => {
    const settings = await loadSettings()
    const r = await dialog.showOpenDialog(win!, {
      title: 'Открыть раскладку',
      defaultPath: settings.backupDir,
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const parsed = JSON.parse(await fs.readFile(r.filePaths[0], 'utf8')) as KeymapBackup
    if (parsed.format !== 'gmk87-keymap' || !Array.isArray(parsed.codes)) {
      throw new Error('Файл не похож на резервную копию раскладки GMK87')
    }
    if (parsed.codes.length !== parsed.layers * parsed.rows * parsed.cols) throw new Error('Повреждённая копия: неверное число кодов')
    return parsed
  })

  handle('macros:read', () => keyboard.readMacros())
  handle('macros:write', (m: Macro[]) => keyboard.writeMacros(m))

  handle('config:read', () => keyboard.readConfig())
  handle('config:update', ({ clock, ...rest }: Omit<ConfigPatch, 'clock'> & { clock?: string }) =>
    keyboard.updateConfig(clock ? { ...rest, clock: new Date(clock) } : rest)
  )
  handle('config:syncClock', () => keyboard.syncClock())

  handle('lighting:read', () => keyboard.readLighting())
  handle('lighting:write', (w: LightingWrite) => keyboard.writeLighting(w))

  handle('display:pickImage', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Выбрать изображение',
      properties: ['openFile'],
      filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const path = r.filePaths[0]
    return { name: basename(path), path, bytes: new Uint8Array(await fs.readFile(path)) }
  })
  handle('display:upload', (req: UploadRequest) => keyboard.upload(req))
  ipcMain.on('display:cancelUpload', () => keyboard.requestCancelUpload())

  handle('console:run', (line: string) => keyboard.console(line))

  handle('settings:get', () => loadSettings())
  handle('settings:set', (p: Partial<Settings>) => saveSettings(p))
  handle('settings:pickBackupDir', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return loadSettings()
    return saveSettings({ backupDir: r.filePaths[0] })
  })
}

/** Hotplug: enumeration reads sysfs only and sends nothing to the keyboard. */
function watchDevices(): void {
  let last = ''
  const tick = async (): Promise<void> => {
    try {
      const s = await keyboard.status()
      const key = JSON.stringify(s)
      if (key !== last) {
        last = key
        send('device:status', s)
      }
    } catch (e) {
      keyboard.log('error', `Поиск устройств: ${msg(e)}`)
    }
  }
  void tick()
  setInterval(tick, 2000)
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  watchDevices()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
