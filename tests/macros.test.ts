import { describe, expect, it } from 'vitest'
import { compactTaps, parseMacros, serializeMacro, serializeMacros, type Macro } from '../src/shared/macros'
import { KeycodeSet } from '../src/shared/keycodes'

describe('macro encoding', () => {
  it('encodes text, keys and delays like QMK send_string', () => {
    const m: Macro = [
      { type: 'down', code: 0xe0 },
      { type: 'tap', code: 0x06 },
      { type: 'up', code: 0xe0 },
      { type: 'delay', ms: 250 },
      { type: 'text', text: 'Hi!' }
    ]
    expect(serializeMacro(m)).toEqual([1, 2, 0xe0, 1, 1, 0x06, 1, 3, 0xe0, 1, 4, 0x32, 0x35, 0x30, 0x7c, 0x48, 0x69, 0x21])
  })

  it('round-trips through the buffer', () => {
    const macros: Macro[] = [
      [{ type: 'text', text: 'git status\n' }],
      [],
      [{ type: 'tap', code: 0x28 }, { type: 'delay', ms: 5 }, { type: 'raw', bytes: [1, 5, 0x10, 0x5f] }]
    ]
    const buf = serializeMacros(macros)
    expect(parseMacros([...buf, 0, 0, 0], 3)).toEqual(macros)
  })

  it('returns empty macros when the buffer runs out', () => {
    expect(parseMacros([0x41, 0], 3)).toEqual([[{ type: 'text', text: 'A' }], [], []])
  })

  it('keeps untypable bytes as raw', () => {
    expect(parseMacros([0x41, 0x80, 0], 1)).toEqual([[{ type: 'text', text: 'A' }, { type: 'raw', bytes: [0x80] }]])
  })

  it('rejects Cyrillic text and 16-bit keycodes', () => {
    expect(() => serializeMacro([{ type: 'text', text: 'привет' }])).toThrow()
    expect(() => serializeMacro([{ type: 'tap', code: 0x5f10 }])).toThrow()
  })

  it('folds down/up pairs into taps', () => {
    expect(compactTaps([
      { type: 'down', code: 0xe0 }, { type: 'down', code: 6 }, { type: 'up', code: 6 }, { type: 'up', code: 0xe0 }
    ])).toEqual([{ type: 'down', code: 0xe0 }, { type: 'tap', code: 6 }, { type: 'up', code: 0xe0 }])
  })
})

describe('macro keycodes', () => {
  it('uses the VIA tables for both firmwares', () => {
    expect(KeycodeSet.legacy.macro(0)).toBe(0x5f12)
    expect(KeycodeSet.modern.macro(0)).toBe(0x7700)
    expect(KeycodeSet.modern.label(0x7703)).toBe('Macro 3')
  })
})
