// Physical layout of the GMK87 in KLE units, parsed from the vendor VIA definition
// ("ZUOYA GMK87", identical for USB 0x5055 and dongle 0x5088). Labels are "row,col" in the 8×15 matrix.

export const MATRIX_ROWS = 8
export const MATRIX_COLS = 15

export interface LayoutKey {
  row: number
  col: number
  x: number
  y: number
  w: number
  h: number
  /** 0 = alpha, 1 = modifier, 2 = accent — from the KLE colours, rendered as shades of grey. */
  tone: number
}

type KleItem = string | { x?: number; y?: number; w?: number; h?: number; c?: string }

const TONES: Record<string, number> = { '#cccccc': 0, '#aaaaaa': 1, '#777777': 2 }

const k = (x: number, label: string, w = 1): KleItem[] => [{ w, h: 1, x }, label]

const KLE: KleItem[][] = [
  [{ c: '#777777' }, ...k(0.1, '0,0'), { c: '#aaaaaa' }, ...k(0.6, '0,1'), ...k(0.1, '0,2'), ...k(0.1, '0,3'), ...k(0.1, '0,4'),
    { c: '#cccccc' }, ...k(0.6, '0,5'), ...k(0.1, '0,6'), ...k(0.1, '0,7'), ...k(0.1, '0,8'), ...k(0.6, '0,9'),
    { c: '#aaaaaa' }, ...k(0.1, '0,10'), ...k(0.1, '0,11'), ...k(0.1, '0,12'), ...k(0.5, '0,13'),
    { c: '#777777' }, ...k(0.6, '7,0'), ...k(0.1, '0,14'), ...k(0.1, '7,1')],
  [{ y: 0.25 }, { c: '#cccccc' }, ...k(0.1, '1,0'), ...k(0.1, '1,1'), ...k(0.1, '1,2'), ...k(0.1, '1,3'),
    { c: '#aaaaaa' }, ...k(0.1, '1,4'), ...k(0.1, '1,5'), ...k(0.1, '1,6'), ...k(0.1, '1,7'),
    { c: '#cccccc' }, ...k(0.1, '1,8'), ...k(0.1, '1,9'), ...k(0.1, '1,10'), ...k(0.1, '1,11'),
    { c: '#aaaaaa' }, ...k(0.1, '1,12'), { c: '#777777' }, ...k(0.2, '1,13', 2.8),
    { c: '#cccccc' }, ...k(0.6, '1,14'), ...k(0.1, '5,4'), ...k(0.1, '3,14')],
  [{ y: 0.15 }, { c: '#aaaaaa' }, ...k(0.1, '2,0', 1.8), ...k(0.1, '2,1'), ...k(0.1, '2,2'), ...k(0.1, '2,3'),
    { c: '#cccccc' }, ...k(0.1, '2,4'), ...k(0.1, '2,5'), ...k(0.1, '2,6'), ...k(0.1, '2,7'),
    { c: '#aaaaaa' }, ...k(0.1, '2,8'), ...k(0.1, '2,9'), ...k(0.1, '2,10'), ...k(0.1, '2,11'),
    { c: '#cccccc' }, ...k(0.1, '2,12'), ...k(0.1, '2,13', 2.1),
    { c: '#aaaaaa' }, ...k(0.6, '2,14'), ...k(0.1, '5,5'), ...k(0.1, '5,6')],
  [{ y: 0.15 }, { c: '#777777' }, ...k(0.1, '3,0', 2.25), { c: '#cccccc' }, ...k(0.1, '3,1'), ...k(0.1, '3,2'), ...k(0.1, '3,3'),
    { c: '#aaaaaa' }, ...k(0.1, '3,4'), ...k(0.1, '3,5'), ...k(0.1, '3,6'), ...k(0.1, '3,7'),
    { c: '#cccccc' }, ...k(0.1, '3,8'), ...k(0.1, '3,9'), ...k(0.1, '3,10'), ...k(0.1, '3,11'),
    { c: '#777777' }, ...k(0.1, '3,13', 2.75)],
  [{ y: 0.15 }, { c: '#aaaaaa' }, ...k(0.1, '4,0', 3.0), ...k(0.1, '4,2'), ...k(0.1, '4,3'), ...k(0.1, '4,4'),
    { c: '#cccccc' }, ...k(0.1, '4,5'), ...k(0.1, '4,6'), ...k(0.1, '4,7'), ...k(0.1, '4,8'),
    { c: '#aaaaaa' }, ...k(0.1, '4,9'), ...k(0.1, '4,10'), ...k(0.1, '4,11'), ...k(0.1, '4,13', 3.1),
    { c: '#777777' }, ...k(1.7, '4,14')],
  [{ y: 0.15 }, { c: '#cccccc' }, ...k(0.1, '5,0', 1.5), ...k(0.1, '5,1', 1.5), ...k(0.1, '5,2', 1.5),
    { c: '#777777' }, ...k(0.1, '5,8', 6.0), { c: '#aaaaaa' }, ...k(0.1, '5,9', 1.5), ...k(0.1, '5,10', 1.5),
    ...k(0.1, '5,11', 1.5), { c: '#cccccc' }, ...k(0.1, '5,12', 1.5),
    { c: '#777777' }, ...k(0.6, '5,13'), ...k(0.1, '5,14'), ...k(0.1, '5,7')]
]

function parseKle(rows: KleItem[][]): LayoutKey[] {
  const keys: LayoutKey[] = []
  let y = 0
  let tone = 0
  for (const row of rows) {
    let x = 0
    let w = 1
    let h = 1
    for (const item of row) {
      if (typeof item === 'object') {
        if (item.x !== undefined) x += item.x
        if (item.y !== undefined) y += item.y
        if (item.w !== undefined) w = item.w
        if (item.h !== undefined) h = item.h
        if (item.c !== undefined) tone = TONES[item.c] ?? 0
        continue
      }
      const [r, c] = item.split(',').map(Number)
      keys.push({ row: r, col: c, x, y, w, h, tone })
      x += w
      w = 1
      h = 1
    }
    y += 1
  }
  return keys
}

export const LAYOUT_KEYS = parseKle(KLE)
export const LAYOUT_WIDTH = Math.max(...LAYOUT_KEYS.map((k) => k.x + k.w))
export const LAYOUT_HEIGHT = Math.max(...LAYOUT_KEYS.map((k) => k.y + k.h))
