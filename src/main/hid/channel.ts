import HID from 'node-hid'

// hidraw only: the libusb backend would detach the kernel driver and the keyboard would stop typing.
HID.setDriverType('hidraw')

export type PacketLogger = (dir: 'tx' | 'rx', bytes: ArrayLike<number>) => void

export class ProtocolError extends Error {}

/** One opened HID collection. Reports include the report ID at index 0 (0x00 when the collection has none). */
export class HidChannel {
  private constructor(
    private readonly dev: HID.HIDAsync,
    readonly path: string,
    private readonly log?: PacketLogger
  ) {}

  static async open(path: string, log?: PacketLogger): Promise<HidChannel> {
    try {
      return new HidChannel(await HID.HIDAsync.open(path, { nonExclusive: true }), path, log)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        `Не удалось открыть ${path}: ${msg}. Проверьте права доступа (udev-правило 50-gmk87.rules).`
      )
    }
  }

  async write(report: number[]): Promise<void> {
    this.log?.('tx', report)
    await this.dev.write(report)
  }

  /** Returns one input report, or undefined on timeout. */
  async read(timeoutMs: number): Promise<Uint8Array | undefined> {
    const buf = await this.dev.read(Math.max(1, Math.round(timeoutMs)))
    if (!buf || buf.length === 0) return undefined
    this.log?.('rx', buf)
    return new Uint8Array(buf)
  }

  /** Discards replies queued from an earlier session or another program. */
  async drain(): Promise<void> {
    for (let i = 0; i < 64; i++) {
      if (!(await this.dev.read(25))) return
    }
  }

  async close(): Promise<void> {
    try {
      await this.dev.close()
    } catch {
      // already closed
    }
  }
}

export interface HidInterface {
  path: string
  vendorId: number
  productId: number
  interface: number
  usagePage: number
  usage: number
  product: string
  release: number
}

export async function enumerate(vendorId: number): Promise<HidInterface[]> {
  const list = await HID.devicesAsync()
  return list
    .filter((d) => d.vendorId === vendorId && d.path)
    .map((d) => ({
      path: d.path as string,
      vendorId: d.vendorId,
      productId: d.productId,
      interface: d.interface,
      usagePage: d.usagePage ?? 0,
      usage: d.usage ?? 0,
      product: d.product ?? '',
      release: d.release
    }))
}
