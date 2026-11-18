// Test helpers (used only by tests): tiny files that are PNGs and JPEGs as far as the header
// goes, and a decoder that reads those headers, so the rules run without Electron.

import { headerSize, sniffImage } from './imageFile.ts'
import type { Decoder } from './sheetCheck.ts'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// A PNG header (signature and IHDR) for a picture of this size, then `extra` filler bytes.
export function fakePng(width: number, height: number, extra = 0): Buffer {
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write('IHDR', 4, 'latin1')
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  ihdr[16] = 8
  ihdr[17] = 6
  return Buffer.concat([PNG_SIGNATURE, ihdr, Buffer.alloc(extra)])
}

// A JPEG start of image and a start-of-frame segment holding the size, then filler.
export function fakeJpeg(width: number, height: number, extra = 0): Buffer {
  const frame = Buffer.alloc(19)
  frame[0] = 0xff
  frame[1] = 0xc0
  frame.writeUInt16BE(17, 2)
  frame[4] = 8
  frame.writeUInt16BE(height, 5)
  frame.writeUInt16BE(width, 7)
  frame[9] = 3
  return Buffer.concat([Buffer.from([0xff, 0xd8]), frame, Buffer.alloc(extra)])
}

// What nativeImage would say for these files: the size in the header.
export const headerDecoder: Decoder = (bytes) => {
  const kind = sniffImage(bytes)
  return kind ? headerSize(bytes, kind) : null
}
