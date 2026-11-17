import {
  FRAME_SIZE,
  MAX_SHEET_BYTES,
  SHEET_NOT_IMAGE,
  SHEET_NOT_PNG,
  sheetSizeProblem,
  sheetTooBigMessage
} from '../shared/mascotRules.ts'
import { pngSize } from './png.ts'

// The size an image decoder reads, or null when it cannot decode the bytes. main passes
// nativeImage; tests pass a fake, so these rules run without Electron.
export type Decoder = (bytes: Buffer) => { width: number; height: number } | null

export type SheetCheck =
  { ok: true; frames: number; width: number } | { ok: false; message: string }

// The spritesheet rules for a strip, in order, on a whole file: size, a PNG, the frame size,
// and the decoded size matching the header. The frame count comes from the width. The bytes
// are never changed. Mascot sheets and boss idle loops share it.
export function checkSheetBytes(bytes: Buffer, decode: Decoder): SheetCheck {
  if (bytes.length > MAX_SHEET_BYTES)
    return { ok: false, message: sheetTooBigMessage(bytes.length) }
  const size = pngSize(bytes)
  if (!size) return { ok: false, message: SHEET_NOT_PNG }
  const problem = sheetSizeProblem(size.width, size.height)
  if (problem) return { ok: false, message: problem }
  const decoded = decode(bytes)
  if (!decoded || decoded.width !== size.width || decoded.height !== size.height) {
    return { ok: false, message: SHEET_NOT_IMAGE }
  }
  return { ok: true, frames: size.width / FRAME_SIZE, width: size.width }
}
