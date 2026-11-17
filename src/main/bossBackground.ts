import {
  BOSS_BG_MAX_BYTES,
  BOSS_BG_NOT_IMAGE,
  BOSS_BG_TOO_BIG,
  bossBgSizeProblem
} from '../shared/bossBackground.ts'
import { headerSize, sniffImage, type ImageKind } from './imageFile.ts'
import type { Decoder } from './sheetCheck.ts'

export type BackgroundCheck =
  { ok: true; kind: ImageKind; width: number; height: number } | { ok: false; message: string }

// The background rules, on a whole file, in this order; the first to fail is the message:
// 1. 5 MB or smaller.
// 2. A real PNG or JPEG: the file's first bytes, not its name.
// 3. The size, 320x180 to 4000 on each side, any shape. An image the decoder cannot read gets
//    the message from step 2.
// The size in the header is checked before the decoder runs, so a small file that claims a
// huge picture is refused without anything being allocated for it. The bytes are never changed.
export function checkBackground(bytes: Buffer, fileName: string, decode: Decoder): BackgroundCheck {
  if (bytes.length > BOSS_BG_MAX_BYTES) return { ok: false, message: BOSS_BG_TOO_BIG }
  const kind = sniffImage(bytes)
  if (!kind) return { ok: false, message: BOSS_BG_NOT_IMAGE }
  const claimed = headerSize(bytes, kind)
  if (!claimed) return { ok: false, message: BOSS_BG_NOT_IMAGE }
  const claimedProblem = bossBgSizeProblem(fileName, claimed.width, claimed.height)
  if (claimedProblem) return { ok: false, message: claimedProblem }
  // The size the decoder reads is the one that counts.
  const decoded = decode(bytes)
  if (!decoded) return { ok: false, message: BOSS_BG_NOT_IMAGE }
  const problem = bossBgSizeProblem(fileName, decoded.width, decoded.height)
  if (problem) return { ok: false, message: problem }
  return { ok: true, kind, width: decoded.width, height: decoded.height }
}
