import { HidChannel, ProtocolError } from './channel'
import {
  VIA_LIGHT_BRIGHTNESS, VIA_LIGHT_CHANNEL, VIA_LIGHT_COLOR, VIA_LIGHT_EFFECT, VIA_LIGHT_SPEED,
  type ViaLightingState
} from '@shared/lighting'

const CMD_GET_PROTOCOL_VERSION = 0x01
const CMD_SET_KEYCODE = 0x05
const CMD_CUSTOM_SET = 0x07
const CMD_CUSTOM_GET = 0x08
const CMD_CUSTOM_SAVE = 0x09
const CMD_MACRO_GET_COUNT = 0x0c
const CMD_MACRO_GET_BUFFER_SIZE = 0x0d
const CMD_MACRO_GET_BUFFER = 0x0e
const CMD_MACRO_SET_BUFFER = 0x0f
const CMD_GET_LAYER_COUNT = 0x11
const CMD_GET_KEYMAP_BUFFER = 0x12

/** Largest chunk that fits a 32-byte reply after the 4-byte header. */
const MAX_KEYMAP_CHUNK = 28
const REPLY_TIMEOUT_MS = 600

/** VIA raw HID client. Only the commands the GMK87 firmware implements are exposed. */
export class ViaClient {
  constructor(private readonly ch: HidChannel) {}

  async getProtocolVersion(): Promise<number> {
    const r = await this.transact([CMD_GET_PROTOCOL_VERSION, 0, 0])
    return (r[1] << 8) | r[2]
  }

  async getLayerCount(): Promise<number> {
    return (await this.transact([CMD_GET_LAYER_COUNT, 0]))[1]
  }

  /** Reads the whole dynamic keymap: [layer][row][col], 16-bit big-endian. */
  async readKeymap(layers: number, rows: number, cols: number, progress?: (f: number) => void): Promise<number[]> {
    const total = layers * rows * cols * 2
    const buf = new Uint8Array(total)
    for (let offset = 0; offset < total; offset += MAX_KEYMAP_CHUNK) {
      const size = Math.min(MAX_KEYMAP_CHUNK, total - offset)
      const r = await this.transact([CMD_GET_KEYMAP_BUFFER, offset >> 8, offset & 0xff, size])
      const got = (r[1] << 8) | r[2]
      if (got !== offset) throw new ProtocolError(`Чтение раскладки вернуло смещение ${got}, ожидалось ${offset}`)
      buf.set(r.subarray(4, 4 + size), offset)
      progress?.((offset + size) / total)
    }
    const codes: number[] = []
    for (let i = 0; i < total; i += 2) codes.push((buf[i] << 8) | buf[i + 1])
    return codes
  }

  /** WRITES one key on one layer. The firmware persists it immediately. */
  async setKeycode(layer: number, row: number, col: number, code: number): Promise<void> {
    await this.transact([CMD_SET_KEYCODE, layer, row, col, (code >> 8) & 0xff, code & 0xff])
  }

  async getMacroCount(): Promise<number> {
    return (await this.transact([CMD_MACRO_GET_COUNT]))[1]
  }

  async getMacroBufferSize(): Promise<number> {
    const r = await this.transact([CMD_MACRO_GET_BUFFER_SIZE])
    return (r[1] << 8) | r[2]
  }

  async readMacroBuffer(size: number, progress?: (f: number) => void): Promise<number[]> {
    const out: number[] = []
    for (let offset = 0; offset < size; offset += MAX_KEYMAP_CHUNK) {
      const n = Math.min(MAX_KEYMAP_CHUNK, size - offset)
      const r = await this.transact([CMD_MACRO_GET_BUFFER, offset >> 8, offset & 0xff, n])
      out.push(...r.subarray(4, 4 + n))
      progress?.((offset + n) / size)
      // Macros are NUL-terminated; once every macro has ended the rest of the buffer is not needed.
      if (this.stopAfter !== null && out.filter((b) => b === 0).length >= this.stopAfter) break
    }
    return out
  }

  /** Set by the caller to the macro count so reads stop after the last terminator. */
  stopAfter: number | null = null

  /** WRITES the macro buffer from offset 0. The firmware persists it. */
  async writeMacroBuffer(data: number[], progress?: (f: number) => void): Promise<void> {
    for (let offset = 0; offset < data.length; offset += MAX_KEYMAP_CHUNK) {
      const chunk = data.slice(offset, offset + MAX_KEYMAP_CHUNK)
      await this.transact([CMD_MACRO_SET_BUFFER, offset >> 8, offset & 0xff, chunk.length, ...chunk])
      progress?.((offset + chunk.length) / data.length)
    }
  }

  /** Only meaningful on protocol 11+; older firmware answers 0x08 with hard-coded values. */
  async getCustomValue(channel: number, id: number, length: number): Promise<Uint8Array> {
    const r = await this.transact([CMD_CUSTOM_GET, channel, id])
    if (r[1] !== channel || r[2] !== id) throw new ProtocolError(`Ответ для ${r[1]}/${r[2]}, ожидался ${channel}/${id}`)
    return r.slice(3, 3 + length)
  }

  async setCustomValue(channel: number, id: number, value: number[]): Promise<void> {
    await this.transact([CMD_CUSTOM_SET, channel, id, ...value])
  }

  async saveCustom(channel: number): Promise<void> {
    await this.transact([CMD_CUSTOM_SAVE, channel])
  }

  async readLighting(): Promise<ViaLightingState> {
    const c = VIA_LIGHT_CHANNEL
    const brightness = (await this.getCustomValue(c, VIA_LIGHT_BRIGHTNESS, 1))[0]
    const effect = (await this.getCustomValue(c, VIA_LIGHT_EFFECT, 1))[0]
    const speed = (await this.getCustomValue(c, VIA_LIGHT_SPEED, 1))[0]
    const color = await this.getCustomValue(c, VIA_LIGHT_COLOR, 2)
    return { brightness, effect, speed, hue: color[0], saturation: color[1] }
  }

  /** WRITES every value that differs from `current`, then saves the channel once. Returns true if anything changed. */
  async writeLighting(current: ViaLightingState, desired: ViaLightingState): Promise<boolean> {
    const c = VIA_LIGHT_CHANNEL
    let changed = false
    if (desired.effect !== current.effect) {
      await this.setCustomValue(c, VIA_LIGHT_EFFECT, [desired.effect])
      changed = true
    }
    if (desired.brightness !== current.brightness) {
      await this.setCustomValue(c, VIA_LIGHT_BRIGHTNESS, [desired.brightness])
      changed = true
    }
    if (desired.speed !== current.speed) {
      await this.setCustomValue(c, VIA_LIGHT_SPEED, [desired.speed])
      changed = true
    }
    if (changed) await this.saveCustom(c)
    return changed
  }

  /** Sends one raw VIA command (up to 32 bytes) and returns the 32-byte reply. */
  async transact(payload: number[]): Promise<Uint8Array> {
    if (payload.length > 32) throw new RangeError('VIA payload is limited to 32 bytes')
    const report = new Array<number>(33).fill(0)
    payload.forEach((b, i) => (report[i + 1] = b & 0xff))
    await this.ch.write(report)

    const deadline = Date.now() + REPLY_TIMEOUT_MS
    while (Date.now() < deadline) {
      const reply = await this.ch.read(deadline - Date.now())
      if (!reply) break
      // hidraw strips the zero report ID on input, so the command echo is at index 0.
      const data = reply.length === 33 ? reply.subarray(1) : reply
      if (payload[0] !== CMD_GET_PROTOCOL_VERSION && data[0] === 0x01 && data[2] === 0x09) {
        throw new ProtocolError(`Клавиатура не поддерживает VIA-команду 0x${hex2(payload[0])}`)
      }
      if (data[0] === payload[0]) return data
    }
    throw new ProtocolError(`Нет ответа на VIA-команду 0x${hex2(payload[0])}`)
  }
}

const hex2 = (b: number): string => b.toString(16).toUpperCase().padStart(2, '0')
