// USB identity and HID interfaces of the Zuoya GMK87.
// Sources: SrilalS/GMK87Control (MIT), codedgar/gmk87-node (MIT), Jochen Eisinger's reference.py (BSD).

export const VENDOR_ID = 0x320f
export const PRODUCT_ID_USB = 0x5055
export const PRODUCT_ID_DONGLE = 0x5088

/** VIA raw HID: keymap and (firmware V0112) backlight. 32-byte reports without a report ID. */
export const USAGE_PAGE_VIA = 0xff60
/** Vendor settings block, lighting, display upload. Report ID 0x04, 64 bytes. */
export const USAGE_PAGE_CONFIG = 0xff1c
/** Firmware update endpoint. Only the read-only info query (report 0x05, command 0x01) is ever sent. */
export const USAGE_PAGE_OTA = 0xffef

export const DISPLAY_WIDTH = 240
export const DISPLAY_HEIGHT = 135
/** RGB565 big-endian, padded to the next 32 KiB boundary (64 800 → 65 536 bytes). */
export const FRAME_BYTES = (DISPLAY_WIDTH * DISPLAY_HEIGHT * 2 + 0x7fff) & ~0x7fff
/** gmk87-node and GMK87Control keep to 36 frames across both slots; the Python reference allows 90. */
export const MAX_TOTAL_FRAMES = 36
export const MIN_FRAME_DELAY_MS = 60
