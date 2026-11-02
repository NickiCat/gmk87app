// QMK/VIA keycode numbering for the GMK87. The numbering changed with the firmware:
// V0104 reports VIA protocol 9 (pre-0.19 QMK codes), V0112 reports protocol 11 (modern codes).
// Ported from GMK87Control's Keycodes.cs (MIT).

export interface KeycodeEntry {
  code: number
  label: string
  group: KeycodeGroup
}

export type KeycodeGroup =
  | 'Basic'
  | 'Modifiers'
  | 'Media'
  | 'Mouse'
  | 'Layers'
  | 'Lighting'
  | 'Macros'
  | 'Vendor'
  | 'Special'

export const KEYCODE_GROUPS: KeycodeGroup[] = [
  'Basic', 'Modifiers', 'Media', 'Layers', 'Lighting', 'Vendor', 'Mouse', 'Macros', 'Special'
]

export const KC_NONE = 0x0000
export const KC_TRANSPARENT = 0x0001
export const KC_VENDOR_BLOCKED = 0xffff
/** The GMK87 Fn key is 0x5F10 on both firmwares; on V0112 the migrated MO(1) does not act as Fn. */
export const KC_LEGACY_FN = 0x5f10
export const MACRO_KEYS = 16

interface Ranges {
  modTap: [number, number]
  layerTap: [number, number]
  layerMod: [number, number] | null
  to: number
  toMask: number
  momentary: number
  defaultLayer: number
  toggleLayer: number
  oneShotLayer: number
  oneShotMod: number
  layerTapToggle: number
  layerRangeSize: number
  rgb: number
  reset: number
  fn1: number
  fn2: number
  macro: number
  custom: number
  mouseBase: number
}

const LEGACY: Ranges = {
  modTap: [0x6000, 0x7fff], layerTap: [0x4000, 0x4fff], layerMod: null,
  to: 0x5010, toMask: 0x0f, momentary: 0x5100, defaultLayer: 0x5200, toggleLayer: 0x5300,
  oneShotLayer: 0x5400, oneShotMod: 0x5500, layerTapToggle: 0x5800, layerRangeSize: 0x100,
  rgb: 0x5cc2, reset: 0x5c00, fn1: 0x5f10, fn2: 0x5f11, macro: 0x5f12, custom: 0x5f80, mouseBase: 0xf0
}

const MODERN: Ranges = {
  modTap: [0x2000, 0x3fff], layerTap: [0x4000, 0x4fff], layerMod: [0x5000, 0x51ff],
  to: 0x5200, toMask: 0x1f, momentary: 0x5220, defaultLayer: 0x5240, toggleLayer: 0x5260,
  oneShotLayer: 0x5280, oneShotMod: 0x52a0, layerTapToggle: 0x52c0, layerRangeSize: 0x20,
  // VIA v11 table: QK_MACRO 0x7700, FN_MO13/FN_MO23 (tri-layer) 0x7C77/0x7C78.
  rgb: 0x7820, reset: 0x7c00, fn1: 0x7c77, fn2: 0x7c78, macro: 0x7700, custom: 0x7f00, mouseBase: 0xcd
}

const LEGACY_VENDOR = [
  '2.4G mode', 'BT 1', 'BT 2', 'BT 3', 'Lock Win key', 'Desktop light low', 'Desktop light high',
  'Logo LED mode', 'Logo LED colour', 'Screen page', 'Key scan delay', 'Screen power', 'USER12', 'USER13'
]

const MODERN_VENDOR = [
  '2.4G mode', 'BT 1', 'BT 2', 'BT 3', 'Lock Win key', 'Logo LED mode', 'Logo LED colour',
  'Screen page', 'Key scan delay', 'Screen power', 'Vendor 10', 'Vendor 11', 'Vendor 12'
]

const RGB_NAMES = [
  'RGB Toggle', 'RGB Mode +', 'RGB Mode -', 'RGB Hue +', 'RGB Hue -', 'RGB Sat +', 'RGB Sat -',
  'RGB Bright +', 'RGB Bright -', 'RGB Speed +', 'RGB Speed -'
]

/** Short legends for key caps; anything missing falls back to the full label. */
const SHORT: Record<number, string> = {
  0x00: '', 0x01: '▽', 0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Bksp', 0x2b: 'Tab', 0x2c: 'Space',
  0x39: 'Caps', 0x46: 'PrtSc', 0x47: 'ScrLk', 0x48: 'Pause', 0x49: 'Ins', 0x4a: 'Home', 0x4b: 'PgUp',
  0x4c: 'Del', 0x4d: 'End', 0x4e: 'PgDn', 0x4f: '→', 0x50: '←', 0x51: '↓', 0x52: '↑', 0x65: 'Menu',
  0xe0: 'Ctrl', 0xe1: 'Shift', 0xe2: 'Alt', 0xe3: 'Win', 0xe4: 'RCtrl', 0xe5: 'RShift', 0xe6: 'RAlt', 0xe7: 'RWin',
  0xa8: 'Mute', 0xa9: 'Vol+', 0xaa: 'Vol-', 0xab: 'Next', 0xac: 'Prev', 0xae: 'Play', 0xad: 'Stop',
  0xff: 'Blocked'
}

function buildBasic(mouseBase: number): Map<number, string> {
  const d = new Map<number, string>([
    [0x00, 'None'], [0x01, 'Transparent'],
    [0x28, 'Enter'], [0x29, 'Esc'], [0x2a, 'Backspace'], [0x2b, 'Tab'], [0x2c, 'Space'],
    [0x2d, '-'], [0x2e, '='], [0x2f, '['], [0x30, ']'], [0x31, '\\'], [0x32, 'ISO #'],
    [0x33, ';'], [0x34, "'"], [0x35, '`'], [0x36, ','], [0x37, '.'], [0x38, '/'], [0x39, 'Caps Lock'],
    [0x46, 'Print Screen'], [0x47, 'Scroll Lock'], [0x48, 'Pause'], [0x49, 'Insert'], [0x4a, 'Home'],
    [0x4b, 'Page Up'], [0x4c, 'Delete'], [0x4d, 'End'], [0x4e, 'Page Down'],
    [0x4f, 'Right'], [0x50, 'Left'], [0x51, 'Down'], [0x52, 'Up'],
    [0x53, 'Num Lock'], [0x54, 'KP /'], [0x55, 'KP *'], [0x56, 'KP -'], [0x57, 'KP +'], [0x58, 'KP Enter'],
    [0x62, 'KP 0'], [0x63, 'KP .'], [0x64, 'ISO \\'], [0x65, 'Menu'], [0x66, 'Power'], [0x67, 'KP ='],
    [0x74, 'Execute'], [0x75, 'Help'], [0x77, 'Select'], [0x78, 'Stop'], [0x79, 'Again'],
    [0x7a, 'Undo'], [0x7b, 'Cut'], [0x7c, 'Copy'], [0x7d, 'Paste'], [0x7e, 'Find'],
    [0x85, 'KP ,'], [0x87, 'Int1 (Ro)'], [0x88, 'Int2 (Kana)'], [0x89, 'Int3 (Yen)'],
    [0x8a, 'Int4 (Henkan)'], [0x8b, 'Int5 (Muhenkan)'], [0x8c, 'Int6'], [0x8d, 'Int7'], [0x8e, 'Int8'], [0x8f, 'Int9'],
    [0xa5, 'System Power'], [0xa6, 'System Sleep'], [0xa7, 'System Wake'],
    [0xa8, 'Mute'], [0xa9, 'Volume Up'], [0xaa, 'Volume Down'], [0xab, 'Next Track'], [0xac, 'Prev Track'],
    [0xad, 'Media Stop'], [0xae, 'Play/Pause'], [0xaf, 'Media Select'], [0xb0, 'Eject'], [0xb1, 'Mail'],
    [0xb2, 'Calculator'], [0xb3, 'My Computer'], [0xb4, 'Web Search'], [0xb5, 'Web Home'], [0xb6, 'Web Back'],
    [0xb7, 'Web Forward'], [0xb8, 'Web Stop'], [0xb9, 'Web Refresh'], [0xba, 'Web Favorites'],
    [0xbb, 'Fast Forward'], [0xbc, 'Rewind'], [0xbd, 'Brightness Up'], [0xbe, 'Brightness Down'],
    [0xe0, 'Left Ctrl'], [0xe1, 'Left Shift'], [0xe2, 'Left Alt'], [0xe3, 'Left Win'],
    [0xe4, 'Right Ctrl'], [0xe5, 'Right Shift'], [0xe6, 'Right Alt'], [0xe7, 'Right Win']
  ])
  for (let i = 0; i < 26; i++) d.set(0x04 + i, String.fromCharCode(65 + i))
  for (let i = 0; i < 9; i++) d.set(0x1e + i, String(i + 1))
  d.set(0x27, '0')
  for (let i = 0; i < 12; i++) d.set(0x3a + i, `F${i + 1}`)
  for (let i = 0; i < 12; i++) d.set(0x68 + i, `F${i + 13}`)
  for (let i = 0; i < 9; i++) d.set(0x59 + i, `KP ${i + 1}`)
  for (let i = 0; i < 9; i++) d.set(0x90 + i, `Lang${i + 1}`)

  const mouse =
    mouseBase === 0xf0
      ? ['Mouse Up', 'Mouse Down', 'Mouse Left', 'Mouse Right', 'Mouse Btn1', 'Mouse Btn2', 'Mouse Btn3', 'Mouse Btn4',
         'Mouse Btn5', 'Wheel Up', 'Wheel Down', 'Wheel Left', 'Wheel Right', 'Mouse Accel 0', 'Mouse Accel 1', 'Mouse Accel 2']
      : ['Mouse Up', 'Mouse Down', 'Mouse Left', 'Mouse Right', 'Mouse Btn1', 'Mouse Btn2', 'Mouse Btn3', 'Mouse Btn4',
         'Mouse Btn5', 'Mouse Btn6', 'Mouse Btn7', 'Mouse Btn8', 'Wheel Up', 'Wheel Down', 'Wheel Left', 'Wheel Right',
         'Mouse Accel 0', 'Mouse Accel 1', 'Mouse Accel 2']
  mouse.forEach((name, i) => d.set(mouseBase + i, name))
  if (mouseBase !== 0xf0) {
    d.set(0xc1, 'Mission Control')
    d.set(0xc2, 'Launchpad')
  }
  return d
}

function buildSpecial(r: Ranges, vendor: string[]): Map<number, string> {
  const d = new Map<number, string>([
    [r.reset, 'Reset'],
    [r.fn1, 'Fn (MO1)'],
    [r.fn2, 'Fn2 (MO2)'],
    [KC_VENDOR_BLOCKED, 'Blocked (vendor)']
  ])
  if (r.fn1 !== KC_LEGACY_FN) {
    d.set(KC_LEGACY_FN, 'Fn')
    d.set(r.fn1, 'FN_MO13')
    d.set(r.fn2, 'FN_MO23')
  }
  RGB_NAMES.forEach((n, i) => d.set(r.rgb + i, n))
  for (let i = 0; i < MACRO_KEYS; i++) d.set(r.macro + i, `Macro ${i}`)
  vendor.forEach((n, i) => d.set(r.custom + i, n))
  return d
}

function modPrefix(mods: number): string {
  const side = mods & 0x10 ? 'R' : 'L'
  const parts: string[] = []
  if (mods & 0x01) parts.push('Ctl')
  if (mods & 0x02) parts.push('Sft')
  if (mods & 0x04) parts.push('Alt')
  if (mods & 0x08) parts.push('Gui')
  return side + parts.join('+')
}

export const hex4 = (code: number): string => '0x' + code.toString(16).toUpperCase().padStart(4, '0')

export class KeycodeSet {
  readonly name: string
  readonly picker: KeycodeEntry[]
  private readonly r: Ranges
  private readonly basic: Map<number, string>
  private readonly special: Map<number, string>

  constructor(name: string, ranges: Ranges, vendor: string[]) {
    this.name = name
    this.r = ranges
    this.basic = buildBasic(ranges.mouseBase)
    this.special = buildSpecial(ranges, vendor)
    this.picker = this.buildPicker()
  }

  static readonly legacy = new KeycodeSet('Legacy (VIA 9 / V0104)', LEGACY, LEGACY_VENDOR)
  static readonly modern = new KeycodeSet('Modern (VIA 11 / V0112)', MODERN, MODERN_VENDOR)

  static forProtocol(protocol: number | null | undefined): KeycodeSet {
    return (protocol ?? 0) >= 11 ? KeycodeSet.modern : KeycodeSet.legacy
  }

  label(code: number): string {
    const b = this.basic.get(code)
    if (b !== undefined) return b
    const s = this.special.get(code)
    if (s !== undefined) return s
    const r = this.r
    const basicLabel = (c: number): string => this.basic.get(c) ?? '0x' + c.toString(16).toUpperCase().padStart(2, '0')

    if (code >= 0x0100 && code <= 0x1fff) return `${modPrefix((code >> 8) & 0x1f)}(${basicLabel(code & 0xff)})`
    if (code >= r.layerTap[0] && code <= r.layerTap[1]) return `LT${(code >> 8) & 0x0f}(${basicLabel(code & 0xff)})`
    if (code >= r.modTap[0] && code <= r.modTap[1]) return `MT(${modPrefix((code >> 8) & 0x1f)}, ${basicLabel(code & 0xff)})`
    if (r.layerMod && code >= r.layerMod[0] && code <= r.layerMod[1]) return `LM(${(code >> 5) & 0x0f}, ${modPrefix(code & 0x1f)})`

    const layer = code & (r.layerRangeSize - 1)
    const inRange = (start: number): boolean => code >= start && code < start + r.layerRangeSize
    if (inRange(r.momentary)) return `MO(${layer})`
    if (inRange(r.defaultLayer)) return `DF(${layer})`
    if (inRange(r.toggleLayer)) return `TG(${layer})`
    if (inRange(r.oneShotLayer)) return `OSL(${layer})`
    if (inRange(r.oneShotMod)) return `OSM(${modPrefix(code & 0x1f)})`
    if (inRange(r.layerTapToggle)) return `TT(${layer})`
    if (code >= r.to && code <= r.to + r.toMask) return `TO(${code & r.toMask})`
    if (code >= r.custom && code < r.custom + 0x40) return `Custom ${code - r.custom}`
    return hex4(code)
  }

  shortLabel(code: number): string {
    if (code === KC_VENDOR_BLOCKED) return '✕'
    if (code < 0x100 && SHORT[code] !== undefined) return SHORT[code]
    if (code === KC_LEGACY_FN || code === this.r.fn1) return 'Fn'
    return this.label(code)
  }

  /** True for codes whose loss on layer 0 could leave the user without a way into the Fn layer. */
  isLayerAccess(code: number): boolean {
    const r = this.r
    return (
      code === KC_LEGACY_FN || code === r.fn1 || code === r.fn2 ||
      (code >= r.momentary && code < r.momentary + r.layerRangeSize) ||
      (code >= r.toggleLayer && code < r.toggleLayer + r.layerRangeSize) ||
      (code >= r.to && code <= r.to + r.toMask) ||
      (code >= r.layerTap[0] && code <= r.layerTap[1])
    )
  }

  momentary(layer: number): number { return this.r.momentary + layer }
  toggleLayer(layer: number): number { return this.r.toggleLayer + layer }
  toLayer(layer: number): number { return this.r.to + layer }
  macro(index: number): number { return this.r.macro + index }

  private buildPicker(): KeycodeEntry[] {
    const list: KeycodeEntry[] = []
    for (const [code, name] of [...this.basic].sort((a, b) => a[0] - b[0])) {
      let group: KeycodeGroup = 'Basic'
      if (code <= 0x01) group = 'Special'
      else if (code >= 0xe0 && code <= 0xe7) group = 'Modifiers'
      else if (code >= 0xa5 && code <= 0xbe) group = 'Media'
      else if (name.startsWith('Mouse') || name.startsWith('Wheel')) group = 'Mouse'
      list.push({ code, label: name, group })
    }
    list.push({ code: KC_LEGACY_FN, label: 'Fn', group: 'Layers' })
    for (let layer = 0; layer < 4; layer++) {
      list.push({ code: this.momentary(layer), label: `MO(${layer})`, group: 'Layers' })
      list.push({ code: this.toggleLayer(layer), label: `TG(${layer})`, group: 'Layers' })
      list.push({ code: this.toLayer(layer), label: `TO(${layer})`, group: 'Layers' })
    }
    const seen = new Set(list.map((e) => e.code))
    for (const [code, name] of [...this.special].sort((a, b) => a[0] - b[0])) {
      if (seen.has(code)) continue
      seen.add(code)
      const group: KeycodeGroup = name.startsWith('RGB')
        ? 'Lighting'
        : name.startsWith('Macro')
          ? 'Macros'
          : code >= this.r.custom && code < KC_VENDOR_BLOCKED
            ? 'Vendor'
            : 'Special'
      list.push({ code, label: name, group })
    }
    return list
  }
}
