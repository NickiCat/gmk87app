// VIA dynamic macros. The buffer holds `count` NUL-terminated macros. Plain bytes are typed as ASCII
// (send_string); 0x01 starts an action: 01 tap, 02 down, 03 up (+ 1-byte basic keycode),
// 04 delay (+ decimal ms in ASCII, terminated by '|'). Anything else is kept as raw bytes.

export type MacroAction =
  | { type: 'text'; text: string }
  | { type: 'tap' | 'down' | 'up'; code: number }
  | { type: 'delay'; ms: number }
  | { type: 'raw'; bytes: number[] }

export type Macro = MacroAction[]

const PREFIX = 0x01
const OP: Record<'tap' | 'down' | 'up' | 'delay', number> = { tap: 1, down: 2, up: 3, delay: 4 }
const DELAY_END = 0x7c // '|'

/** Characters send_string can type: printable ASCII, Enter and Tab. */
export const isTypable = (ch: string): boolean => {
  const c = ch.charCodeAt(0)
  return ch.length === 1 && ((c >= 0x20 && c <= 0x7e) || c === 0x0a || c === 0x09)
}

export function serializeMacro(macro: Macro): number[] {
  const out: number[] = []
  for (const a of macro) {
    switch (a.type) {
      case 'text':
        for (const ch of a.text) {
          if (!isTypable(ch)) throw new Error(`Символ «${ch}» нельзя набрать макросом: только латиница, цифры и ASCII-знаки`)
          out.push(ch.charCodeAt(0))
        }
        break
      case 'tap':
      case 'down':
      case 'up':
        if (a.code < 0x04 || a.code > 0xff) throw new Error(`В макросе можно использовать только обычные клавиши (код ≤ 0xFF), а не 0x${a.code.toString(16)}`)
        out.push(PREFIX, OP[a.type], a.code)
        break
      case 'delay': {
        const ms = Math.max(1, Math.min(65535, Math.round(a.ms)))
        out.push(PREFIX, OP.delay, ...[...String(ms)].map((d) => d.charCodeAt(0)), DELAY_END)
        break
      }
      case 'raw':
        out.push(...a.bytes)
    }
  }
  if (out.includes(0)) throw new Error('Макрос не может содержать нулевой байт')
  return out
}

/** All macros, each followed by its NUL terminator. */
export function serializeMacros(macros: Macro[]): number[] {
  return macros.flatMap((m) => [...serializeMacro(m), 0])
}

export function parseMacro(bytes: number[]): Macro {
  const out: Macro = []
  let text = ''
  const flush = (): void => {
    if (text) out.push({ type: 'text', text })
    text = ''
  }
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b !== PREFIX) {
      if (isTypable(String.fromCharCode(b))) text += String.fromCharCode(b)
      else {
        flush()
        out.push({ type: 'raw', bytes: [b] })
      }
      continue
    }
    flush()
    const op = bytes[i + 1]
    if ((op === 1 || op === 2 || op === 3) && i + 2 < bytes.length) {
      out.push({ type: op === 1 ? 'tap' : op === 2 ? 'down' : 'up', code: bytes[i + 2] })
      i += 2
    } else if (op === 4) {
      const end = bytes.indexOf(DELAY_END, i + 2)
      const digits = bytes.slice(i + 2, end < 0 ? bytes.length : end)
      const ms = Number(String.fromCharCode(...digits))
      if (end >= 0 && Number.isFinite(ms)) {
        out.push({ type: 'delay', ms })
        i = end
      } else {
        out.push({ type: 'raw', bytes: bytes.slice(i) })
        break
      }
    } else {
      // Unknown action (e.g. VIA's 2-byte keycode actions): keep it byte for byte.
      const len = op === 5 || op === 6 || op === 7 ? 4 : 2
      out.push({ type: 'raw', bytes: bytes.slice(i, i + len) })
      i += len - 1
    }
  }
  flush()
  return out
}

/** Splits a buffer into `count` macros; missing ones come back empty. */
export function parseMacros(buffer: number[], count: number): Macro[] {
  const macros: Macro[] = []
  let start = 0
  for (let n = 0; n < count; n++) {
    let end = buffer.indexOf(0, start)
    if (end < 0) end = buffer.length
    macros.push(start < buffer.length ? parseMacro(buffer.slice(start, end)) : [])
    start = end + 1
  }
  return macros
}

/** Turns "down X, up X" pairs into "tap X", as recorded keystrokes usually are. */
export function compactTaps(macro: Macro): Macro {
  const out: Macro = []
  for (let i = 0; i < macro.length; i++) {
    const a = macro[i]
    const b = macro[i + 1]
    if (a.type === 'down' && b?.type === 'up' && b.code === a.code) {
      out.push({ type: 'tap', code: a.code })
      i++
    } else out.push(a)
  }
  return out
}

/** KeyboardEvent.code → HID usage, for recording macros in the app window. */
export const HID_BY_DOM_CODE: Record<string, number> = (() => {
  const m: Record<string, number> = {
    Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c, Minus: 0x2d, Equal: 0x2e,
    BracketLeft: 0x2f, BracketRight: 0x30, Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
    Comma: 0x36, Period: 0x37, Slash: 0x38, CapsLock: 0x39, PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
    Insert: 0x49, Home: 0x4a, PageUp: 0x4b, Delete: 0x4c, End: 0x4d, PageDown: 0x4e,
    ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52, NumLock: 0x53,
    NumpadDivide: 0x54, NumpadMultiply: 0x55, NumpadSubtract: 0x56, NumpadAdd: 0x57, NumpadEnter: 0x58,
    Numpad0: 0x62, NumpadDecimal: 0x63, IntlBackslash: 0x64, ContextMenu: 0x65, NumpadEqual: 0x67,
    ControlLeft: 0xe0, ShiftLeft: 0xe1, AltLeft: 0xe2, MetaLeft: 0xe3,
    ControlRight: 0xe4, ShiftRight: 0xe5, AltRight: 0xe6, MetaRight: 0xe7
  }
  for (let i = 0; i < 26; i++) m[`Key${String.fromCharCode(65 + i)}`] = 0x04 + i
  for (let i = 1; i <= 9; i++) m[`Digit${i}`] = 0x1d + i
  m.Digit0 = 0x27
  for (let i = 1; i <= 12; i++) m[`F${i}`] = 0x39 + i
  for (let i = 13; i <= 24; i++) m[`F${i}`] = 0x68 + i - 13
  for (let i = 1; i <= 9; i++) m[`Numpad${i}`] = 0x58 + i
  return m
})()
