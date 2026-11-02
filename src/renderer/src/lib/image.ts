import { DISPLAY_HEIGHT, DISPLAY_WIDTH, FRAME_BYTES } from '@shared/ids'

export type FitMode = 'cover' | 'contain' | 'stretch'

export interface SourceFrame {
  bitmap: ImageBitmap
  /** Frame duration in ms (GIF/WebP animations), 0 for stills. */
  durationMs: number
}

export interface SlotImage {
  name: string
  frames: SourceFrame[]
  /** Total frames in the file, before any trimming to the frame limit. */
  totalFrames: number
}

// WebCodecs ImageDecoder (Chromium) decodes every frame of GIF/WebP/APNG without a JS GIF decoder.
interface DecodedVideoFrame {
  duration: number | null
  close(): void
}
interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }
  decode(o: { frameIndex: number }): Promise<{ image: DecodedVideoFrame }>
  close(): void
}
type ImageDecoderCtor = new (init: { data: ArrayBuffer; type: string }) => ImageDecoderLike

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp'
}

export async function decodeImage(name: string, bytes: Uint8Array, maxFrames: number): Promise<SlotImage> {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const type = MIME[ext] ?? 'image/png'
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const Decoder = (globalThis as unknown as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder

  if (Decoder) {
    const dec = new Decoder({ data, type })
    try {
      await dec.tracks.ready
      const total = dec.tracks.selectedTrack?.frameCount ?? 1
      const frames: SourceFrame[] = []
      for (let i = 0; i < Math.min(total, maxFrames); i++) {
        const { image } = await dec.decode({ frameIndex: i })
        const bitmap = await createImageBitmap(image as unknown as ImageBitmapSource)
        frames.push({ bitmap, durationMs: image.duration ? image.duration / 1000 : 0 })
        image.close()
      }
      return { name, frames, totalFrames: total }
    } finally {
      dec.close()
    }
  }
  const bitmap = await createImageBitmap(new Blob([data], { type }))
  return { name, frames: [{ bitmap, durationMs: 0 }], totalFrames: 1 }
}

/** Draws a source frame onto a 240×135 canvas with the chosen fit, over black. */
export function renderFrame(ctx: CanvasRenderingContext2D, bmp: ImageBitmap, fit: FitMode): void {
  const W = DISPLAY_WIDTH
  const H = DISPLAY_HEIGHT
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (fit === 'stretch') {
    ctx.drawImage(bmp, 0, 0, W, H)
    return
  }
  const scale = fit === 'cover' ? Math.max(W / bmp.width, H / bmp.height) : Math.min(W / bmp.width, H / bmp.height)
  const w = bmp.width * scale
  const h = bmp.height * scale
  ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h)
}

/** One keyboard frame: RGB565 big-endian, padded with zeros to FRAME_BYTES. */
export function encodeFrame(bmp: ImageBitmap, fit: FitMode): Uint8Array {
  const canvas = new OffscreenCanvas(DISPLAY_WIDTH, DISPLAY_HEIGHT)
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
  renderFrame(ctx, bmp, fit)
  const px = ctx.getImageData(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT).data
  const out = new Uint8Array(FRAME_BYTES)
  for (let i = 0, o = 0; i < px.length; i += 4, o += 2) {
    const v = ((px[i] >> 3) << 11) | ((px[i + 1] >> 2) << 5) | (px[i + 2] >> 3)
    out[o] = v >> 8
    out[o + 1] = v & 0xff
  }
  return out
}

/** Builds the upload buffer: slot-1 frames, then slot-2 frames. An empty slot gets one black frame. */
export function buildUpload(slot1: Uint8Array[], slot2: Uint8Array[]): { data: Uint8Array; n1: number; n2: number } {
  const s1 = slot1.length ? slot1 : [new Uint8Array(FRAME_BYTES)]
  const s2 = slot2.length ? slot2 : [new Uint8Array(FRAME_BYTES)]
  const data = new Uint8Array((s1.length + s2.length) * FRAME_BYTES)
  ;[...s1, ...s2].forEach((f, i) => data.set(f, i * FRAME_BYTES))
  return { data, n1: s1.length, n2: s2.length }
}

/** Median frame duration, clamped to the keyboard minimum; the keyboard has one delay for all frames. */
export function suggestedDelay(img: SlotImage | null, fallback: number): number {
  const d = img?.frames.map((f) => f.durationMs).filter((x) => x > 0).sort((a, b) => a - b) ?? []
  if (!d.length) return fallback
  return Math.max(60, Math.round(d[Math.floor(d.length / 2)]))
}
