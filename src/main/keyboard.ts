import { HidChannel, enumerate, type HidInterface } from './hid/channel'
import { ViaClient } from './hid/via'
import { VendorClient, readFirmwareInfo } from './hid/vendor'
import { loadSettings } from './settings'
import {
  PRODUCT_ID_DONGLE, PRODUCT_ID_USB, USAGE_PAGE_CONFIG, USAGE_PAGE_OTA, USAGE_PAGE_VIA, VENDOR_ID,
  FRAME_BYTES, MAX_TOTAL_FRAMES
} from '@shared/ids'
import { applyConfigPatch, decodeConfig, type ConfigPatch } from '@shared/config'
import { MATRIX_COLS, MATRIX_ROWS } from '@shared/layout'
import { parseMacros, serializeMacros, type Macro } from '@shared/macros'
import type {
  ConfigSnapshot, DeviceProbe, MacroData, DeviceStatus, InterfaceInfo, KeyChange, KeymapData, LightingSnapshot,
  LightingWrite, LogEntry, ProgressEvent, UploadRequest
} from '@shared/api'

type Emit = {
  log: (e: LogEntry) => void
  progress: (e: ProgressEvent) => void
}

const hex = (bytes: ArrayLike<number>, max = 64): string =>
  Array.from({ length: Math.min(bytes.length, max) }, (_, i) => bytes[i].toString(16).padStart(2, '0')).join(' ')

/**
 * Single entry point to the keyboard. Every operation opens its interface, runs and closes again,
 * serialized through one queue so two pages can never interleave packets. Nothing here talks to the
 * keyboard on its own: every exchange starts from an explicit user action.
 */
export class Keyboard {
  private queue: Promise<unknown> = Promise.resolve()
  private quiet = false
  private cancelUpload = false
  private lastStatus = ''

  constructor(private readonly emit: Emit) {}

  /** Makes the next status() call log the device again, e.g. after the renderer reloads. */
  resetStatusLog(): void {
    this.lastStatus = ''
  }

  log(level: LogEntry['level'], text: string): void {
    this.emit.log({ ts: Date.now(), level, text })
  }

  // ---------- discovery (sysfs only, no packets) ----------

  async status(): Promise<DeviceStatus> {
    const all = (await enumerate(VENDOR_ID)).filter(
      (d) => d.productId === PRODUCT_ID_USB || d.productId === PRODUCT_ID_DONGLE
    )
    // A cable may be plugged in for charging while the dongle is also present; VIA only works over the cable.
    const pid = all.some((d) => d.productId === PRODUCT_ID_USB) ? PRODUCT_ID_USB : all[0]?.productId ?? null
    const mine = all.filter((d) => d.productId === pid)
    const pick = (page: number): InterfaceInfo | null => {
      const d = mine.find((i) => i.usagePage === page)
      return d ? toInfo(d) : null
    }
    const status: DeviceStatus = {
      connected: mine.length > 0,
      mode: pid === PRODUCT_ID_USB ? 'usb' : pid === PRODUCT_ID_DONGLE ? 'dongle' : null,
      productId: pid,
      product: mine[0]?.product ?? '',
      release: mine[0]?.release ?? null,
      via: pick(USAGE_PAGE_VIA),
      config: pick(USAGE_PAGE_CONFIG),
      ota: pick(USAGE_PAGE_OTA),
      all: mine.map(toInfo)
    }
    const key = JSON.stringify(status)
    if (key !== this.lastStatus) {
      this.lastStatus = key
      if (status.connected) {
        this.log('info', `Найдена GMK87 (${status.mode === 'usb' ? 'кабель' : '2.4G-донгл'}, PID 0x${pid!.toString(16)})`)
      } else {
        this.log('warn', 'GMK87 не найдена')
      }
    }
    return status
  }

  // ---------- serialized channel access ----------

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => undefined)
    return next
  }

  private async withChannel<T>(page: number, fn: (ch: HidChannel) => Promise<T>): Promise<T> {
    const s = await this.status()
    const iface = page === USAGE_PAGE_VIA ? s.via : page === USAGE_PAGE_CONFIG ? s.config : s.ota
    if (!s.connected) throw new Error('Клавиатура не подключена')
    if (!iface) throw new Error(`Интерфейс 0x${page.toString(16).toUpperCase()} не найден`)
    const settings = await loadSettings()
    const logger = settings.logPackets
      ? (dir: 'tx' | 'rx', b: ArrayLike<number>) => {
          if (!this.quiet) this.log(dir, hex(b))
        }
      : undefined
    const ch = await HidChannel.open(iface.path, logger)
    try {
      return await fn(ch)
    } finally {
      await ch.close()
    }
  }

  private via<T>(fn: (v: ViaClient) => Promise<T>): Promise<T> {
    return this.withChannel(USAGE_PAGE_VIA, (ch) => fn(new ViaClient(ch)))
  }

  /**
   * The 2.4G dongle does not pass the 64-byte vendor protocol through to the keyboard: it either stays
   * silent or answers by itself with an all-zero block. Blocked there unless the user opts in.
   */
  private async vendorAvailable(): Promise<boolean> {
    const s = await this.status()
    return s.mode !== 'dongle' || (await loadSettings()).vendorOverDongle
  }

  private async vendor<T>(fn: (v: VendorClient) => Promise<T>): Promise<T> {
    if (!(await this.vendorAvailable())) throw new Error(DONGLE_VENDOR_MSG)
    return this.withChannel(USAGE_PAGE_CONFIG, (ch) => fn(new VendorClient(ch)))
  }

  private async tryVia<T>(fn: (v: ViaClient) => Promise<T>): Promise<T | null> {
    try {
      return await this.via(fn)
    } catch (e) {
      this.log('warn', `VIA: ${msg(e)}`)
      return null
    }
  }

  // ---------- device ----------

  probe(): Promise<DeviceProbe> {
    return this.run(async () => {
      const errors: string[] = []
      let viaProtocol: number | null = null
      let layers: number | null = null
      let firmware: DeviceProbe['firmware'] = null
      try {
        await this.via(async (v) => {
          viaProtocol = await v.getProtocolVersion()
          layers = await v.getLayerCount()
        })
        this.log('ok', `VIA protocol ${viaProtocol}, слоёв: ${layers}`)
      } catch (e) {
        errors.push(`VIA: ${msg(e)}`)
        this.log('warn', `VIA: ${msg(e)}`)
      }
      try {
        const fw = await this.withChannel(USAGE_PAGE_OTA, readFirmwareInfo)
        firmware = { version: fw.version, crc: fw.crc, raw: fw.raw }
        this.log('ok', `Прошивка: 0x${fw.version.toString(16)} CRC 0x${fw.crc.toString(16)} (${hex(fw.raw)})`)
      } catch (e) {
        errors.push(`Прошивка: ${msg(e)}`)
        this.log('warn', `Прошивка: ${msg(e)}`)
      }
      return { viaProtocol, layers, firmware, errors }
    })
  }

  // ---------- keymap ----------

  readKeymap(): Promise<KeymapData> {
    return this.run(() =>
      this.via(async (v) => {
        const protocol = await v.getProtocolVersion()
        const layers = await v.getLayerCount()
        this.log('info', `Чтение раскладки: ${layers} слоя, матрица ${MATRIX_ROWS}×${MATRIX_COLS}`)
        const codes = await v.readKeymap(layers, MATRIX_ROWS, MATRIX_COLS, (f) =>
          this.emit.progress({ op: 'keymap', done: Math.round(f * 100), total: 100 })
        )
        this.log('ok', `Раскладка прочитана (VIA ${protocol})`)
        return { protocol, layers, rows: MATRIX_ROWS, cols: MATRIX_COLS, codes }
      })
    )
  }

  /** WRITES one key and returns the code read back from the keyboard. */
  setKey(c: KeyChange): Promise<number> {
    return this.run(() =>
      this.via(async (v) => {
        await v.setKeycode(c.layer, c.row, c.col, c.code)
        const back = await readKeyAt(v, c)
        this.log(back === c.code ? 'ok' : 'warn',
          `Слой ${c.layer} [${c.row},${c.col}] ← 0x${c.code.toString(16).padStart(4, '0')}` +
          (back === c.code ? '' : `, но клавиатура вернула 0x${back.toString(16).padStart(4, '0')}`))
        return back
      })
    )
  }

  /** WRITES several keys one by one (V0112's bulk command acts as a single-key write, so it is never used). */
  writeMany(changes: KeyChange[]): Promise<number> {
    return this.run(() =>
      this.via(async (v) => {
        let ok = 0
        for (let i = 0; i < changes.length; i++) {
          const c = changes[i]
          await v.setKeycode(c.layer, c.row, c.col, c.code)
          if ((await readKeyAt(v, c)) === c.code) ok++
          this.emit.progress({ op: 'keymap-write', done: i + 1, total: changes.length })
        }
        this.log(ok === changes.length ? 'ok' : 'warn', `Записано клавиш: ${ok}/${changes.length}`)
        return ok
      })
    )
  }

  // ---------- macros (VIA dynamic macros) ----------

  readMacros(): Promise<MacroData> {
    return this.run(() => this.via((v) => this.readMacrosWith(v)))
  }

  private async readMacrosWith(v: ViaClient): Promise<MacroData> {
    const protocol = await v.getProtocolVersion()
    const count = await v.getMacroCount()
    const bufferSize = await v.getMacroBufferSize()
    v.stopAfter = count
    const buffer = await v.readMacroBuffer(bufferSize, (f) =>
      this.emit.progress({ op: 'macros', done: Math.round(f * 100), total: 100 })
    )
    const macros = parseMacros(buffer, count)
    this.log('ok', `Макросы прочитаны: ${count} шт., буфер ${bufferSize} байт`)
    return { protocol, count, bufferSize, macros }
  }

  /** WRITES every macro, then reads them back to confirm. */
  writeMacros(macros: Macro[]): Promise<MacroData> {
    return this.run(() =>
      this.via(async (v) => {
        const count = await v.getMacroCount()
        const bufferSize = await v.getMacroBufferSize()
        if (macros.length !== count) throw new Error(`Ожидалось ${count} макросов, передано ${macros.length}`)
        const data = serializeMacros(macros)
        if (data.length > bufferSize) throw new Error(`Макросы занимают ${data.length} байт, а в клавиатуре ${bufferSize}`)
        await v.writeMacroBuffer(data, (f) => this.emit.progress({ op: 'macros', done: Math.round(f * 100), total: 100 }))
        this.log('info', `Записано ${data.length} байт макросов`)
        const back = await this.readMacrosWith(v)
        const same = JSON.stringify(serializeMacros(back.macros)) === JSON.stringify(data)
        this.log(same ? 'ok' : 'warn', same ? 'Макросы записаны и проверены' : 'Макросы записаны, но прочитанные отличаются')
        if (!same) throw new Error('После записи клавиатура вернула другие макросы. Подробности в логе')
        return back
      })
    )
  }

  // ---------- vendor settings block ----------

  readConfig(): Promise<ConfigSnapshot> {
    return this.run(async () => {
      const raw = await this.vendor((v) => v.readConfig())
      this.log('ok', `Конфигурация прочитана (${raw.length} байт)`)
      return snapshot(raw)
    })
  }

  /** Reads the block fresh, patches only the given fields and writes it back. */
  updateConfig(patch: ConfigPatch, forceClock = false): Promise<ConfigSnapshot> {
    return this.run(async () => {
      const settings = await loadSettings()
      const full: ConfigPatch = { ...patch }
      if (forceClock || settings.syncClockOnWrite) full.clock = new Date()
      const written = await this.vendor(async (v) => {
        const current = await v.readConfig()
        const next = applyConfigPatch(current, full)
        await v.writeConfig(next)
        return next
      })
      this.log('ok', `Конфигурация записана: ${Object.keys(full).join(', ')}`)
      return snapshot(written)
    })
  }

  syncClock(): Promise<ConfigSnapshot> {
    return this.updateConfig({}, true)
  }

  // ---------- lighting ----------

  /**
   * V0104 (VIA 9): everything lives in the vendor block.
   * V0112 (VIA 11): effect, brightness and speed go over VIA channel 3; direction, rainbow and RGB
   * stay in the vendor block (VIA's own colour value is ignored by the firmware).
   */
  readLighting(): Promise<LightingSnapshot> {
    return this.run(async () => {
      const viaProtocol = await this.tryVia((v) => v.getProtocolVersion())
      const via = viaProtocol !== null && viaProtocol >= 11 ? await this.tryVia((v) => v.readLighting()) : null
      const vendorOk = await this.vendorAvailable()
      if (!via && !vendorOk) throw new Error(DONGLE_VENDOR_MSG)
      const config = vendorOk ? snapshot(await this.vendor((v) => v.readConfig())) : null
      this.log('ok', `Подсветка прочитана (${[via && 'VIA', config && 'блок настроек'].filter(Boolean).join(' + ')})`)
      return { viaProtocol, via, config }
    })
  }

  writeLighting(w: LightingWrite): Promise<LightingSnapshot> {
    return this.run(async () => {
      const settings = await loadSettings()
      const viaProtocol = await this.tryVia((v) => v.getProtocolVersion())
      let via = null
      if (viaProtocol !== null && viaProtocol >= 11) {
        via = await this.via(async (v) => {
          const current = await v.readLighting()
          const desired = { ...current, effect: w.effect, brightness: w.brightness, speed: w.speedLevel }
          await v.writeLighting(current, desired)
          return v.readLighting()
        })
      }
      if (!(await this.vendorAvailable())) {
        if (!via) throw new Error(DONGLE_VENDOR_MSG)
        this.log('ok', 'Подсветка записана через VIA (направление, радуга и цвет требуют кабеля)')
        return { viaProtocol, via, config: null }
      }
      // Bytes 1-3 mirror what VIA just set, so this write never undoes it.
      const patch: ConfigPatch = { ...w }
      if (settings.syncClockOnWrite) patch.clock = new Date()
      const written = await this.vendor(async (v) => {
        const next = applyConfigPatch(await v.readConfig(), patch)
        await v.writeConfig(next)
        return next
      })
      this.log('ok', 'Подсветка записана')
      return { viaProtocol, via, config: snapshot(written) }
    })
  }

  // ---------- display ----------

  upload(req: UploadRequest): Promise<ConfigSnapshot> {
    return this.run(async () => {
      const total = req.slot1Frames + req.slot2Frames
      if (req.slot1Frames < 1 || req.slot2Frames < 1) throw new Error('В каждом слоте должен быть хотя бы один кадр')
      if (total > MAX_TOTAL_FRAMES) throw new Error(`Кадров ${total}, максимум ${MAX_TOTAL_FRAMES}`)
      if (req.data.length !== total * FRAME_BYTES) throw new Error('Размер данных не совпадает с числом кадров')

      this.cancelUpload = false
      this.quiet = true
      const started = Date.now()
      try {
        const written = await this.vendor(async (v) => {
          const next = applyConfigPatch(await v.readConfig(), {
            slot1Frames: req.slot1Frames,
            slot2Frames: req.slot2Frames,
            frameDelayMs: req.frameDelayMs,
            screen: req.screen,
            clock: new Date()
          })
          this.log('info', `Загрузка ${total} кадров (${(req.data.length / 1024).toFixed(0)} КБ)…`)
          await v.uploadImages(next, req.data, (f) =>
            this.emit.progress({ op: 'upload', done: Math.round(f * req.data.length), total: req.data.length }),
            () => this.cancelUpload
          )
          return next
        })
        this.log('ok', `Изображения загружены за ${((Date.now() - started) / 1000).toFixed(1)} с`)
        return snapshot(written)
      } finally {
        this.quiet = false
      }
    })
  }

  requestCancelUpload(): void {
    this.cancelUpload = true
  }

  // ---------- console ----------

  async console(line: string): Promise<void> {
    const [cmd, ...args] = line.trim().split(/\s+/)
    if (!cmd) return
    this.log('cmd', line.trim())
    try {
      switch (cmd) {
        case 'help':
          for (const l of [
            'status                 — найденные интерфейсы (без обмена с клавиатурой)',
            'probe                  — версия VIA, число слоёв, прошивка',
            'config                 — прочитать и показать блок настроек',
            'sync-time              — синхронизировать часы',
            'screen <0|1|2>         — показать часы / слот 1 / слот 2',
            'via <hex…>             — сырая VIA-команда (32 байта)',
            'vendor <cmd> <pos> [hex…] — сырая команда 0xFF1C',
            'clear                  — очистить лог'
          ]) this.log('info', l)
          break
        case 'status': {
          const s = await this.status()
          for (const i of s.all) {
            this.log('info', `${i.path}  if=${i.interface}  usage=0x${i.usagePage.toString(16)}/0x${i.usage.toString(16)}`)
          }
          if (!s.connected) this.log('warn', 'Клавиатура не найдена')
          break
        }
        case 'probe':
          await this.probe()
          break
        case 'config': {
          const c = await this.readConfig()
          this.log('info', hex(c.raw))
          this.log('info', JSON.stringify(c.decoded))
          break
        }
        case 'sync-time':
          await this.syncClock()
          break
        case 'screen': {
          const n = Number(args[0])
          if (![0, 1, 2].includes(n)) throw new Error('screen 0|1|2')
          await this.updateConfig({ screen: n as 0 | 1 | 2 })
          break
        }
        case 'via': {
          const bytes = parseHex(args)
          const r = await this.run(() => this.via((v) => v.transact(bytes)))
          this.log('rx', hex(r))
          break
        }
        case 'vendor': {
          const [c, pos, ...rest] = args
          const command = parseInt(c, 16)
          if (Number.isNaN(command)) throw new Error('vendor <cmd hex> <pos> [data hex…]')
          const r = await this.run(() =>
            this.vendor((v) => v.transact(command, parseHex(rest), Number(pos ?? 0)))
          )
          this.log('rx', hex(r))
          break
        }
        default:
          this.log('error', `Неизвестная команда: ${cmd}. Введите help`)
      }
    } catch (e) {
      this.log('error', msg(e))
    }
  }
}

async function readKeyAt(v: ViaClient, c: KeyChange): Promise<number> {
  const offset = ((c.layer * MATRIX_ROWS + c.row) * MATRIX_COLS + c.col) * 2
  const r = await v.transact([0x12, offset >> 8, offset & 0xff, 2])
  return (r[4] << 8) | r[5]
}

function snapshot(raw: Uint8Array): ConfigSnapshot {
  return { raw: [...raw], decoded: decodeConfig(raw) }
}

function toInfo(d: HidInterface): InterfaceInfo {
  return { path: d.path, interface: d.interface, usagePage: d.usagePage, usage: d.usage }
}

function parseHex(tokens: string[]): number[] {
  const bytes = tokens.join('').replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '')
  if (bytes.length % 2) throw new Error('Нечётное число hex-цифр')
  return bytes.match(/../g)?.map((b) => parseInt(b, 16)) ?? []
}

const DONGLE_VENDOR_MSG =
  'Через 2.4G-донгл экран, часы, логотип и цвет подсветки недоступны: донгл не передаёт этот протокол. Подключите кабель'

export const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
