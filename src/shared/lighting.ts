// Effect and logo catalogues. Names follow the vendor VIA definition.

export type ColorSupport = 'none' | 'custom' | 'rainbow' | 'palette'

export interface LightingEffect {
  id: number
  name: string
  color: ColorSupport
}

export const EFFECTS: LightingEffect[] = [
  { id: 0, name: 'Выключено', color: 'none' },
  { id: 1, name: 'Wave', color: 'custom' },
  { id: 2, name: 'Colour cloud', color: 'custom' },
  { id: 3, name: 'Vortex', color: 'custom' },
  { id: 4, name: 'Mix colour', color: 'rainbow' },
  { id: 5, name: 'Breathe', color: 'custom' },
  { id: 6, name: 'Light', color: 'custom' },
  { id: 7, name: 'Slowly off', color: 'custom' },
  { id: 8, name: 'Stone', color: 'custom' },
  { id: 9, name: 'Laser', color: 'custom' },
  { id: 10, name: 'Starry', color: 'custom' },
  { id: 11, name: 'Flowers open', color: 'rainbow' },
  { id: 12, name: 'Traverse', color: 'rainbow' },
  { id: 13, name: 'Wave bar', color: 'custom' },
  { id: 14, name: 'Meteor', color: 'custom' },
  { id: 15, name: 'Rain', color: 'custom' },
  { id: 16, name: 'Scan', color: 'custom' },
  { id: 17, name: 'Trigger colour', color: 'palette' },
  { id: 18, name: 'Center spread', color: 'rainbow' }
]

export const LOGO_MODES = [
  'Мигание, один цвет',
  'Пульс, радуга',
  'Мигание, один цвет (alt)',
  'Постоянный цвет',
  'Постоянный цвет (alt)'
]

export const LOGO_COLORS = ['Красный', 'Оранжевый', 'Жёлтый', 'Зелёный', 'Бирюзовый', 'Синий', 'Фиолетовый', 'Белый', 'Выключен']

/** From the firmware's own hue wheel, plus white. */
export const SWATCHES: Array<[string, string]> = [
  ['Red', '#ff0100'],
  ['Orange', '#ff6d00'],
  ['Yellow', '#ffff00'],
  ['Lime', '#9eff00'],
  ['Green', '#00ff00'],
  ['Spring', '#00ff6d'],
  ['Cyan', '#00ffff'],
  ['Sky', '#009eff'],
  ['Blue', '#0000ff'],
  ['Violet', '#6300ff'],
  ['Magenta', '#ff00ff'],
  ['Pink', '#ff0068'],
  ['White', '#ffffff']
]

/** VIA V3 custom channel 3 (qmk_rgb_matrix) on firmware V0112. */
export const VIA_LIGHT_CHANNEL = 3
export const VIA_LIGHT_BRIGHTNESS = 1
export const VIA_LIGHT_EFFECT = 2
export const VIA_LIGHT_SPEED = 3
export const VIA_LIGHT_COLOR = 4

export interface ViaLightingState {
  brightness: number
  effect: number
  speed: number
  hue: number
  saturation: number
}
