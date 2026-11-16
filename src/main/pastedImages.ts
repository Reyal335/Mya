// The pasted images of a message, on the main side: reading them from the IPC arguments
// and putting them into the message for Claude. Pure, with no Electron, so node --test
// can run it.
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import {
  IMAGE_ERRORS,
  checkImageCount,
  checkImages,
  type ImageMediaType
} from '../shared/images.ts'

// A pasted image main has checked: its bytes and the type main read from them.
export type SendImage = { bytes: Uint8Array; mediaType: ImageMediaType }

export type PastedImages = { ok: true; images: SendImage[] } | { ok: false; message: string }

// The pasted images of a message, checked again here. Only bytes come in: the type is
// read from them, whatever the window says it is. The count is checked before any image
// is looked at, then the first check that fails gives its exact error: each image, then
// the total size (checkImages keeps that order).
export function readPastedImages(raw: unknown): PastedImages {
  if (raw === undefined || raw === null) return { ok: true, images: [] }
  if (!Array.isArray(raw)) return { ok: false, message: IMAGE_ERRORS.wrongType }
  const tooMany = checkImageCount(raw.length)
  if (tooMany) return { ok: false, message: tooMany }

  const all: Uint8Array[] = []
  for (const item of raw) {
    const held =
      typeof item === 'object' && item !== null ? (item as { bytes?: unknown }).bytes : null
    // Any typed array or DataView, seen as plain bytes.
    if (!ArrayBuffer.isView(held)) return { ok: false, message: IMAGE_ERRORS.wrongType }
    all.push(new Uint8Array(held.buffer, held.byteOffset, held.byteLength))
  }
  const checked = checkImages(all)
  if (!checked.ok) return { ok: false, message: checked.error }
  return {
    ok: true,
    images: all.map((bytes, index) => ({ bytes, mediaType: checked.mediaTypes[index] }))
  }
}

// Without images the content is the text itself. With images it is blocks: the text
// first, left out when blank, then each image. `text` already has the agent call
// sentence in it, as one text block, so history can read the sentence back.
export function userContent(
  text: string,
  images: SendImage[]
): SDKUserMessage['message']['content'] {
  if (images.length === 0) return text
  return [
    ...(text.trim() === '' ? [] : [{ type: 'text' as const, text }]),
    ...images.map((image) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: image.mediaType,
        data: Buffer.from(image.bytes).toString('base64')
      }
    }))
  ]
}
