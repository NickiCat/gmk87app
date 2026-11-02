// Types shared by main, preload and renderer.

import type { ConfigPatch, DecodedConfig } from './config'
import type { ViaLightingState } from './lighting'
import type { Macro } from './macros'

export type ConnectionMode = 'usb' | 'dongle'

export interface InterfaceInfo {
  path: string
  interface: number
  usagePage: number
  usage: number
}

export interface DeviceStatus {
  connected: boolean
  mode: ConnectionMode | null
  productId: number | null
  product: string
  release: number | null
  via: InterfaceInfo | null
  config: InterfaceInfo | null
  ota: InterfaceInfo | null
  all: InterfaceInfo[]
}

export interface DeviceProbe {
  viaProtocol: number | null
  layers: number | null
  firmware: { version: number; crc: number; raw: number[] } | null
  errors: string[]
}

export interface KeymapData {
  protocol: number
  layers: number
  rows: number
  cols: number
  /** [layer][row][col] flattened. */
  codes: number[]
}

export interface KeyChange {
  layer: number
  row: number
  col: number
  code: number
}

export interface KeymapBackup {
  format: 'gmk87-keymap'
  version: 1
  savedAt: string
  protocol: number
  layers: number
  rows: number
  cols: number
  codes: number[]
}

export interface MacroData {
  protocol: number
  count: number
  bufferSize: number
  macros: Macro[]
}

export interface ConfigSnapshot {
  raw: number[]
  decoded: DecodedConfig
}

export interface LightingSnapshot {
  /** VIA protocol, or null when VIA did not answer (e.g. over the 2.4G dongle). */
  viaProtocol: number | null
  via: ViaLightingState | null
  /** Null when the vendor interface is unavailable (2.4G dongle). */
  config: ConfigSnapshot | null
}

export interface LightingWrite {
  effect: number
  brightness: number
  speedLevel: number
  reverseDirection: boolean
  rainbow: boolean
  red: number
  green: number
  blue: number
}

export interface UploadRequest {
  /** slot-1 frames then slot-2 frames, FRAME_BYTES each. */
  data: Uint8Array
  slot1Frames: number
  slot2Frames: number
  frameDelayMs: number
  screen: 0 | 1 | 2
}

export interface PickedFile {
  name: string
  path: string
  bytes: Uint8Array
}

export interface Settings {
  syncClockOnWrite: boolean
  logPackets: boolean
  /** Try the 0xFF1C vendor protocol over the 2.4G dongle anyway. */
  vendorOverDongle: boolean
  backupDir: string
}

export interface LogEntry {
  ts: number
  level: 'info' | 'ok' | 'warn' | 'error' | 'tx' | 'rx' | 'cmd'
  text: string
}

export interface ProgressEvent {
  op: string
  done: number
  total: number
}

export interface Gmk87Api {
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
  }
  device: {
    status(): Promise<DeviceStatus>
    probe(): Promise<DeviceProbe>
    onStatus(cb: (s: DeviceStatus) => void): () => void
  }
  keymap: {
    read(): Promise<KeymapData>
    setKey(change: KeyChange): Promise<number>
    writeMany(changes: KeyChange[]): Promise<number>
    saveBackup(data: KeymapData): Promise<string | null>
    loadBackup(): Promise<KeymapBackup | null>
  }
  macros: {
    read(): Promise<MacroData>
    write(macros: Macro[]): Promise<MacroData>
  }
  config: {
    read(): Promise<ConfigSnapshot>
    update(patch: ConfigPatch): Promise<ConfigSnapshot>
    syncClock(): Promise<ConfigSnapshot>
  }
  lighting: {
    read(): Promise<LightingSnapshot>
    write(w: LightingWrite): Promise<LightingSnapshot>
  }
  display: {
    pickImage(): Promise<PickedFile | null>
    upload(req: UploadRequest): Promise<ConfigSnapshot>
    cancelUpload(): void
  }
  console: {
    run(line: string): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    pickBackupDir(): Promise<Settings>
  }
  onLog(cb: (e: LogEntry) => void): () => void
  onProgress(cb: (e: ProgressEvent) => void): () => void
}
