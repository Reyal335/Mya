// The rules for a boss's background picture, shared by main (which checks the file) and the
// tests. A background is a PNG or JPG, any shape, never resized or converted.

const MB = 1024 * 1024
export const BOSS_BG_MAX_MB = 5
export const BOSS_BG_MAX_BYTES = BOSS_BG_MAX_MB * MB
export const BOSS_BG_MIN_WIDTH = 320
export const BOSS_BG_MIN_HEIGHT = 180
export const BOSS_BG_MAX_SIDE = 4000

export const BOSS_BG_TOO_BIG = `Background must be ${BOSS_BG_MAX_MB} MB or smaller.`
export const BOSS_BG_NOT_IMAGE = 'Background must be a PNG or JPG.'

export function bossBgTooSmall(fileName: string, width: number, height: number): string {
  return `Background must be at least ${BOSS_BG_MIN_WIDTH}x${BOSS_BG_MIN_HEIGHT}. ${fileName} is ${width}x${height}.`
}

export function bossBgTooLarge(fileName: string, width: number, height: number): string {
  return `Background must be ${BOSS_BG_MAX_SIDE} px or smaller on each side. ${fileName} is ${width}x${height}.`
}

// Rule 3, the size: null when it is fine, else the message. Too small is checked first.
export function bossBgSizeProblem(fileName: string, width: number, height: number): string | null {
  if (width < BOSS_BG_MIN_WIDTH || height < BOSS_BG_MIN_HEIGHT) {
    return bossBgTooSmall(fileName, width, height)
  }
  if (width > BOSS_BG_MAX_SIDE || height > BOSS_BG_MAX_SIDE) {
    return bossBgTooLarge(fileName, width, height)
  }
  return null
}
