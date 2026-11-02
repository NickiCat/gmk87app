// The settings block behind the 0xFF1C interface. 48 bytes on firmware V0104, 64 on V0112.
// Unknown bytes are always carried through untouched: callers patch fields, never rebuild the block.

import { MIN_FRAME_DELAY_MS } from './ids'

export const CONFIG_LENGTH = 48
export const CONFIG_EXTENDED_LENGTH = 64

export const VIA_V2_PROTOCOL = 9
export const VIA_V3_PROTOCOL = 11

const OFF = {
  effect: 1,
  brightness: 2,
  speed: 3,
  direction: 4,
  rainbow: 5,
  red: 6,
  green: 7,
  blue: 8,
  winLock: 21,
  logoMode: 28,
  logoBrightness: 29,
  logoRainbow: 31,
  logoColor: 32,
  screen: 33,
  slot1Frames: 34,
  clock: 35,
  frameDelay: 43,
  slot2Frames: 46,
  protocolSelector: 0x31
} as const

export const MAX_EFFECT = 18
export const MAX_BRIGHTNESS = 9
export const MAX_SPEED = 4
export const MAX_LOGO_MODE = 4
export const MAX_LOGO_BRIGHTNESS = 9
export const MAX_LOGO_COLOR = 8

export type ScreenMode = 0 | 1 | 2 // clock, slot 1, slot 2

export interface ClockValue {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

export interface DecodedConfig {
  length: number
  effect: number
  brightness: number
  /** 0 slowest … MAX_SPEED fastest (the raw byte is inverted). */
  speedLevel: number
  reverseDirection: boolean
  rainbow: boolean
  red: number
  green: number
  blue: number
  winLock: boolean
  logoMode: number
  logoBrightness: number
  logoRainbow: boolean
  logoColor: number
  screen: ScreenMode
  slot1Frames: number
  slot2Frames: number
  frameDelayMs: number
  clock: ClockValue | null
  protocolSelector: number | null
}

export type ConfigPatch = Partial<
  Omit<DecodedConfig, 'length' | 'clock' | 'protocolSelector'>
> & { clock?: Date }

const clamp = (v: number, max: number): number => Math.max(0, Math.min(max, Math.round(v)))

export const toBcd = (v: number): number => {
  if (v < 0 || v > 99) throw new RangeError(`BCD value out of range: ${v}`)
  return (Math.floor(v / 10) << 4) | v % 10
}
export const fromBcd = (b: number): number => (b >> 4) * 10 + (b & 0x0f)

export function decodeConfig(raw: Uint8Array): DecodedConfig {
  if (raw.length !== CONFIG_LENGTH && raw.length !== CONFIG_EXTENDED_LENGTH) {
    throw new Error(`Config block must be ${CONFIG_LENGTH} or ${CONFIG_EXTENDED_LENGTH} bytes, got ${raw.length}`)
  }
  const c = OFF.clock
  const clock: ClockValue = {
    second: fromBcd(raw[c]),
    minute: fromBcd(raw[c + 1]),
    hour: fromBcd(raw[c + 2]),
    weekday: raw[c + 3],
    day: fromBcd(raw[c + 4]),
    month: fromBcd(raw[c + 5]),
    year: 2000 + fromBcd(raw[c + 6])
  }
  const clockValid =
    clock.month >= 1 && clock.month <= 12 && clock.day >= 1 && clock.day <= 31 &&
    clock.hour < 24 && clock.minute < 60 && clock.second < 60

  return {
    length: raw.length,
    effect: raw[OFF.effect],
    brightness: raw[OFF.brightness],
    speedLevel: MAX_SPEED - Math.min(raw[OFF.speed], MAX_SPEED),
    reverseDirection: raw[OFF.direction] !== 0,
    rainbow: raw[OFF.rainbow] !== 0,
    red: raw[OFF.red],
    green: raw[OFF.green],
    blue: raw[OFF.blue],
    winLock: raw[OFF.winLock] !== 0,
    logoMode: raw[OFF.logoMode],
    logoBrightness: raw[OFF.logoBrightness],
    logoRainbow: raw[OFF.logoRainbow] !== 0,
    logoColor: raw[OFF.logoColor],
    screen: (raw[OFF.screen] <= 2 ? raw[OFF.screen] : 0) as ScreenMode,
    slot1Frames: raw[OFF.slot1Frames],
    slot2Frames: raw[OFF.slot2Frames],
    frameDelayMs: raw[OFF.frameDelay] | (raw[OFF.frameDelay + 1] << 8),
    clock: clockValid ? clock : null,
    protocolSelector: raw.length === CONFIG_EXTENDED_LENGTH ? raw[OFF.protocolSelector] : null
  }
}

/** Returns a patched copy of the block. */
export function applyConfigPatch(raw: Uint8Array, patch: ConfigPatch): Uint8Array {
  const out = Uint8Array.from(raw)
  if (patch.effect !== undefined) out[OFF.effect] = clamp(patch.effect, MAX_EFFECT)
  if (patch.brightness !== undefined) out[OFF.brightness] = clamp(patch.brightness, MAX_BRIGHTNESS)
  if (patch.speedLevel !== undefined) out[OFF.speed] = MAX_SPEED - clamp(patch.speedLevel, MAX_SPEED)
  if (patch.reverseDirection !== undefined) out[OFF.direction] = patch.reverseDirection ? 1 : 0
  // 0xFF is what the firmware's own hue key stores for rainbow; only touch the byte when the flag flips.
  if (patch.rainbow !== undefined && patch.rainbow !== (out[OFF.rainbow] !== 0)) {
    out[OFF.rainbow] = patch.rainbow ? 0xff : 0
  }
  if (patch.red !== undefined) out[OFF.red] = clamp(patch.red, 255)
  if (patch.green !== undefined) out[OFF.green] = clamp(patch.green, 255)
  if (patch.blue !== undefined) out[OFF.blue] = clamp(patch.blue, 255)
  if (patch.winLock !== undefined) out[OFF.winLock] = patch.winLock ? 1 : 0
  if (patch.logoMode !== undefined) out[OFF.logoMode] = clamp(patch.logoMode, MAX_LOGO_MODE)
  if (patch.logoBrightness !== undefined) out[OFF.logoBrightness] = clamp(patch.logoBrightness, MAX_LOGO_BRIGHTNESS)
  if (patch.logoRainbow !== undefined) out[OFF.logoRainbow] = patch.logoRainbow ? 1 : 0
  if (patch.logoColor !== undefined) out[OFF.logoColor] = clamp(patch.logoColor, MAX_LOGO_COLOR)
  if (patch.screen !== undefined) out[OFF.screen] = clamp(patch.screen, 2)
  if (patch.slot1Frames !== undefined) out[OFF.slot1Frames] = clamp(patch.slot1Frames, 255)
  if (patch.slot2Frames !== undefined) out[OFF.slot2Frames] = clamp(patch.slot2Frames, 255)
  if (patch.frameDelayMs !== undefined) {
    const ms = Math.max(MIN_FRAME_DELAY_MS, Math.min(0xffff, Math.round(patch.frameDelayMs)))
    out[OFF.frameDelay] = ms & 0xff
    out[OFF.frameDelay + 1] = ms >> 8
  }
  if (patch.clock) {
    const t = patch.clock
    const c = OFF.clock
    out[c] = toBcd(t.getSeconds())
    out[c + 1] = toBcd(t.getMinutes())
    out[c + 2] = toBcd(t.getHours())
    out[c + 3] = t.getDay() // 0 = Sunday, as the keyboard reports it
    out[c + 4] = toBcd(t.getDate())
    out[c + 5] = toBcd(t.getMonth() + 1)
    out[c + 6] = toBcd(t.getFullYear() % 100)
  }
  return out
}

/**
 * Writing only 48 bytes leaves the V0112 VIA protocol selector (0x31) at 0xFF, which disables parts of VIA.
 * Resets anything other than 9 or 11 to 11. Returns a copy.
 */
export function repairProtocolSelector(raw: Uint8Array): Uint8Array {
  const out = Uint8Array.from(raw)
  if (out.length === CONFIG_EXTENDED_LENGTH) {
    const v = out[OFF.protocolSelector]
    if (v !== VIA_V2_PROTOCOL && v !== VIA_V3_PROTOCOL) out[OFF.protocolSelector] = VIA_V3_PROTOCOL
  }
  return out
}

/** Builds one 0xFF1C report: id 0x04, checksum (LE, over bytes 3..63), command, length, 24-bit position, payload. */
export function buildConfigPacket(command: number, data: ArrayLike<number>, position: number): number[] {
  if (data.length > 56) throw new RangeError('Config payload is limited to 56 bytes')
  const buf = new Array<number>(64).fill(0)
  buf[0] = 0x04
  buf[3] = command & 0xff
  buf[4] = data.length
  buf[5] = position & 0xff
  buf[6] = (position >> 8) & 0xff
  buf[7] = (position >> 16) & 0xff
  for (let i = 0; i < data.length; i++) buf[8 + i] = data[i] & 0xff
  let sum = 0
  for (let i = 3; i < 64; i++) sum += buf[i]
  buf[1] = sum & 0xff
  buf[2] = (sum >> 8) & 0xff
  return buf
}
