import { HidChannel, ProtocolError } from './channel'
import { buildConfigPacket, CONFIG_EXTENDED_LENGTH, CONFIG_LENGTH, repairProtocolSelector } from '@shared/config'

export const CMD_INIT = 0x01
export const CMD_COMMIT = 0x02
export const CMD_PREPARE_READ = 0x03
export const CMD_READ_CONFIG = 0x05
export const CMD_WRITE_CONFIG = 0x06
export const CMD_FRAME_DATA = 0x21
export const CMD_UPLOAD_START = 0x23

const MAX_PAYLOAD = 56
const REPLY_TIMEOUT_MS = 5000
const EXTENDED_TIMEOUT_MS = 1000
const REPORT_ID = 0x04

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Client for the vendor interface (usage page 0xFF1C). The packet sequences match the official
 * Zuoya app as captured by gmk87-node and GMK87Control.
 */
export class VendorClient {
  constructor(private readonly ch: HidChannel) {}

  /** Reads the settings block (64 bytes on V0112, else 48). Sends INIT/COMMIT, exactly as the vendor app does. */
  async readConfig(): Promise<Uint8Array> {
    await this.ch.drain()
    await this.transact(CMD_INIT, [], 0)
    for (let i = 0; i < 9; i++) await this.transact(CMD_PREPARE_READ, [0, 0, 0, 0], i * 4)
    await this.transact(CMD_PREPARE_READ, [0], 36)
    await this.transact(CMD_COMMIT, [], 0)

    const raw = new Uint8Array(CONFIG_EXTENDED_LENGTH)
    for (let pos = 0; pos < CONFIG_LENGTH; pos += 4) {
      raw.set((await this.transact(CMD_READ_CONFIG, [0, 0, 0, 0], pos)).subarray(0, 4), pos)
    }
    // The 2.4G dongle answers these reads itself with zeros; writing such a block back would wipe the settings.
    if (raw.subarray(0, CONFIG_LENGTH).every((b) => b === 0)) {
      throw new ProtocolError('Клавиатура вернула пустой блок настроек (так отвечает 2.4G-донгл). Подключите кабель')
    }
    try {
      for (let pos = CONFIG_LENGTH; pos < CONFIG_EXTENDED_LENGTH; pos += 4) {
        raw.set((await this.transact(CMD_READ_CONFIG, [0, 0, 0, 0], pos, EXTENDED_TIMEOUT_MS)).subarray(0, 4), pos)
      }
    } catch (e) {
      if (e instanceof ProtocolError) return raw.slice(0, CONFIG_LENGTH)
      throw e
    }
    return raw
  }

  /**
   * WRITES the settings block. The firmware starts from an erased flash slot, so every byte not
   * written ends up 0xFF: the whole block is always sent, with a damaged VIA selector repaired.
   */
  async writeConfig(block: Uint8Array): Promise<void> {
    if (block.subarray(0, CONFIG_LENGTH).every((b) => b === 0)) throw new ProtocolError('Отказ записывать пустой блок настроек')
    const raw = repairProtocolSelector(block)
    await this.ch.drain()
    await this.transact(CMD_INIT, [], 0)
    for (let pos = 0; pos < raw.length; pos += MAX_PAYLOAD) {
      await this.transact(CMD_WRITE_CONFIG, raw.subarray(pos, Math.min(raw.length, pos + MAX_PAYLOAD)), pos)
    }
    await this.transact(CMD_COMMIT, [], 0)
  }

  /**
   * WRITES the config and then the whole image memory. Always replaces BOTH slots: `image` is slot-1
   * frames followed by slot-2 frames, and the frame counts in `config` must describe that layout.
   */
  async uploadImages(
    config: Uint8Array,
    image: Uint8Array,
    progress?: (f: number) => void,
    cancelled?: () => boolean
  ): Promise<void> {
    await this.writeConfig(config)
    await this.transact(CMD_UPLOAD_START, [], 0)
    await this.transact(CMD_INIT, [], 0)
    let lastReport = 0
    for (let pos = 0; pos < image.length; pos += MAX_PAYLOAD) {
      if (cancelled?.()) {
        // Finish the session cleanly so the keyboard is not left mid-upload.
        await this.transact(CMD_COMMIT, [], 0)
        throw new Error('Загрузка отменена: изображение на клавиатуре записано не полностью')
      }
      const end = Math.min(image.length, pos + MAX_PAYLOAD)
      await this.transact(CMD_FRAME_DATA, image.subarray(pos, end), pos)
      const now = Date.now()
      if (now - lastReport > 100 || end === image.length) {
        progress?.(end / image.length)
        lastReport = now
      }
    }
    await this.transact(CMD_COMMIT, [], 0)
  }

  /** Sends one command and waits for the reply that echoes it; returns reply bytes 4 onward. */
  async transact(command: number, data: ArrayLike<number>, position: number, timeoutMs = REPLY_TIMEOUT_MS): Promise<Uint8Array> {
    // The Python reference waits before COMMIT to give the keyboard time to finish the previous step.
    if (command === CMD_COMMIT) await sleep(100)
    await this.ch.write(buildConfigPacket(command, data, position))

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const reply = await this.ch.read(deadline - Date.now())
      if (!reply) break
      // On the dongle this collection shares its hidraw node with keyboard/mouse reports: skip them.
      if (reply.length > 4 && reply[0] === REPORT_ID && reply[3] === command) return reply.subarray(4)
    }
    throw new ProtocolError(
      `Нет ответа на команду 0x${command.toString(16).padStart(2, '0')} (позиция ${position})`
    )
  }
}

/** Read-only query on the firmware-update collection. Deliberately has no way to send the OTA transfer. */
export async function readFirmwareInfo(ch: HidChannel): Promise<{ version: number; crc: number; raw: number[] }> {
  await ch.drain()
  const report = new Array<number>(64).fill(0)
  report[0] = 0x05
  report[1] = 0x01
  for (let i = 4; i <= 32; i++) report[i] = 0xff
  await ch.write(report)
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const r = await ch.read(deadline - Date.now())
    if (!r) break
    if (r[0] === 0x05 && r[1] === 0x01 && r.length >= 12) {
      const dv = new DataView(r.buffer, r.byteOffset, r.byteLength)
      return { version: dv.getUint32(4, true), crc: dv.getUint32(8, true), raw: [...r.subarray(0, 12)] }
    }
  }
  throw new ProtocolError('Нет ответа на запрос версии прошивки')
}
