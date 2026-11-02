import { describe, expect, it } from 'vitest'
import {
  applyConfigPatch, buildConfigPacket, decodeConfig, fromBcd, repairProtocolSelector, toBcd
} from '../src/shared/config'
import { KeycodeSet, KC_LEGACY_FN } from '../src/shared/keycodes'
import { LAYOUT_KEYS, MATRIX_COLS, MATRIX_ROWS } from '../src/shared/layout'
import { FRAME_BYTES } from '../src/shared/ids'

// Factory block from Jochen Eisinger's reference.py reset().
const FACTORY = Uint8Array.from(
  Buffer.from('000809020001ffffff0000000000000000000000ff000000000000ff000902ff00000155431502141025002c01000400', 'hex')
)

describe('vendor packet', () => {
  it('matches the reference layout and checksum', () => {
    const p = buildConfigPacket(0x21, [1, 2, 3], 0x123456)
    expect(p).toHaveLength(64)
    expect(p.slice(0, 1)).toEqual([0x04])
    expect(p.slice(3, 11)).toEqual([0x21, 3, 0x56, 0x34, 0x12, 1, 2, 3])
    const sum = p.slice(3).reduce((a, b) => a + b, 0)
    expect(p[1] | (p[2] << 8)).toBe(sum & 0xffff)
  })

  it('rejects payloads over 56 bytes', () => {
    expect(() => buildConfigPacket(6, new Array(57).fill(0), 0)).toThrow()
  })
})

describe('settings block', () => {
  it('decodes the factory block', () => {
    const c = decodeConfig(FACTORY)
    expect(c.length).toBe(48)
    expect(c.effect).toBe(8)
    expect(c.brightness).toBe(9)
    expect(c.speedLevel).toBe(2) // raw 2, inverted against max 4
    expect(c.rainbow).toBe(true)
    expect(c.frameDelayMs).toBe(300)
    expect(c.clock).toEqual({ second: 55, minute: 43, hour: 15, weekday: 2, day: 14, month: 10, year: 2025 })
    expect(c.protocolSelector).toBeNull()
  })

  it('patches only the given fields', () => {
    const next = applyConfigPatch(FACTORY, { effect: 5, speedLevel: 4, red: 10, screen: 2 })
    const diff = [...next].map((b, i) => (b !== FACTORY[i] ? i : -1)).filter((i) => i >= 0)
    expect(diff.sort((a, b) => a - b)).toEqual([1, 3, 6, 33])
    expect(next[3]).toBe(0) // fastest speed is raw 0
    expect(decodeConfig(next).speedLevel).toBe(4)
  })

  it('keeps the firmware rainbow value unless the flag flips', () => {
    const on = applyConfigPatch(FACTORY, { rainbow: true })
    expect(on[5]).toBe(FACTORY[5])
    const off = applyConfigPatch(FACTORY, { rainbow: false })
    expect(off[5]).toBe(0)
    expect(applyConfigPatch(off, { rainbow: true })[5]).toBe(0xff)
  })

  it('clamps out-of-range values and the frame delay', () => {
    const next = applyConfigPatch(FACTORY, { brightness: 42, effect: -3, frameDelayMs: 10 })
    expect(next[2]).toBe(9)
    expect(next[1]).toBe(0)
    expect(next[43] | (next[44] << 8)).toBe(60)
  })

  it('writes the clock as BCD with Sunday = 0', () => {
    const t = new Date(2026, 9, 25, 7, 8, 9) // Sunday
    const c = decodeConfig(applyConfigPatch(FACTORY, { clock: t })).clock
    expect(c).toEqual({ year: 2026, month: 10, day: 25, hour: 7, minute: 8, second: 9, weekday: 0 })
    expect(toBcd(59)).toBe(0x59)
    expect(fromBcd(0x47)).toBe(47)
  })

  it('repairs a damaged V0112 protocol selector only', () => {
    const ext = new Uint8Array(64).fill(0xff)
    expect(repairProtocolSelector(ext)[0x31]).toBe(11)
    ext[0x31] = 9
    expect(repairProtocolSelector(ext)[0x31]).toBe(9)
    expect(repairProtocolSelector(FACTORY)).toEqual(FACTORY)
  })
})

describe('keycodes', () => {
  it('labels both numberings', () => {
    expect(KeycodeSet.legacy.label(0x5101)).toBe('MO(1)')
    expect(KeycodeSet.modern.label(0x5221)).toBe('MO(1)')
    expect(KeycodeSet.legacy.label(KC_LEGACY_FN)).toBe('Fn (MO1)')
    expect(KeycodeSet.modern.label(KC_LEGACY_FN)).toBe('Fn')
    expect(KeycodeSet.modern.label(0x0104)).toBe('LCtl(A)')
    expect(KeycodeSet.modern.label(0x7f00)).toBe('2.4G mode')
    expect(KeycodeSet.forProtocol(9)).toBe(KeycodeSet.legacy)
    expect(KeycodeSet.forProtocol(11)).toBe(KeycodeSet.modern)
  })

  it('flags keys that open other layers', () => {
    expect(KeycodeSet.modern.isLayerAccess(KC_LEGACY_FN)).toBe(true)
    expect(KeycodeSet.modern.isLayerAccess(0x5221)).toBe(true)
    expect(KeycodeSet.modern.isLayerAccess(0x04)).toBe(false)
  })

  it('has unique picker entries', () => {
    for (const set of [KeycodeSet.legacy, KeycodeSet.modern]) {
      const codes = set.picker.map((e) => e.code)
      expect(new Set(codes).size).toBe(codes.length)
    }
  })
})

describe('layout', () => {
  it('has the vendor definition 88 keys at unique matrix positions', () => {
    expect(LAYOUT_KEYS).toHaveLength(88)
    const pos = new Set(LAYOUT_KEYS.map((k) => `${k.row},${k.col}`))
    expect(pos.size).toBe(88)
    for (const k of LAYOUT_KEYS) {
      expect(k.row).toBeLessThan(MATRIX_ROWS)
      expect(k.col).toBeLessThan(MATRIX_COLS)
    }
  })

  it('pads frames to 32 KiB', () => {
    expect(FRAME_BYTES).toBe(65536)
  })
})
