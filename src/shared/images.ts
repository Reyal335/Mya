// Images pasted into the chat composer. Pure functions on bytes, no imports, so the
// window (to refuse a bad paste early) and the main process (to check it again, and to
// say what type it is) use the same rules. Nothing here decodes an image: the type is
// read from the first bytes and the size from the header.

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const IMAGE_MAX_COUNT = 5
// All the images of one message together: 5 of 5 MB would be over the request limit.
export const IMAGE_MAX_TOTAL_BYTES = 20 * 1024 * 1024
// Pixels, each side.
export const IMAGE_MAX_SIDE = 8000

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

// The only thing about a pasted image that crosses the IPC. The media type never does:
// main reads it from the bytes, so the window cannot name a type of its own.
export type PastedImage = { bytes: Uint8Array }

// A byte count with base-1024 units and one decimal: "512 B", "1.5 KB", "2.3 MB".
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = (bytes / 1024).toFixed(1)
  // 1048575 bytes is 1023.999 KB, which rounds to "1024.0 KB": show it as MB.
  if (bytes < 1024 * 1024 && kb !== '1024.0') return `${kb} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// The same units as formatBytes, but the decimal is rounded up, never down. For an error
// that says a size is over a limit: 5242881 bytes reads "5.1 MB", not "5.0 MB". Tenths
// are counted in whole numbers, so nothing is lost to floating point.
export function formatBytesUp(bytes: number): string {
  const tenths = (n: number): string => `${Math.floor(n / 10)}.${n % 10}`
  if (bytes < 1024) return `${bytes} B`
  const kb = Math.ceil((bytes * 10) / 1024)
  // 1048575 bytes is 1023.999 KB: up to 1024.0 KB, which shows as MB.
  if (kb < 10240) return `${tenths(kb)} KB`
  return `${tenths(Math.ceil((bytes * 10) / (1024 * 1024)))} MB`
}

export const IMAGE_ERRORS = {
  wrongType: 'Image must be a PNG, JPG, GIF, or WebP.',
  tooBig: (size: string): string => `Image must be 5 MB or smaller. This one is ${size}.`,
  tooLarge: (width: number, height: number): string =>
    `Image must be 8000 px or smaller on each side. This one is ${width}x${height}.`,
  tooMany: 'A message can hold up to 5 images.',
  tooBigTotal: (size: string): string =>
    `Images in one message must be 20 MB or smaller together. These are ${size}.`
}

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0))

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff]
const GIF87 = ascii('GIF87a')
const GIF89 = ascii('GIF89a')
const RIFF = ascii('RIFF')
const WEBP = ascii('WEBP')
const IHDR = ascii('IHDR')
const VP8_LOSSY = ascii('VP8 ')
const VP8_LOSSLESS = ascii('VP8L')
const VP8_EXTENDED = ascii('VP8X')
const VP8_START_CODE = [0x9d, 0x01, 0x2a]

// True when `bytes` holds `expected` starting at `at`. False, never a throw, when it is too short.
function has(bytes: Uint8Array, at: number, expected: readonly number[]): boolean {
  if (at + expected.length > bytes.length) return false
  for (let i = 0; i < expected.length; i++) if (bytes[at + i] !== expected[i]) return false
  return true
}

// The readers below are only called after the length was checked.
const u16be = (b: Uint8Array, at: number): number => (b[at] << 8) | b[at + 1]
const u16le = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8)
const u24le = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)
const u32be = (b: Uint8Array, at: number): number =>
  b[at] * 0x1000000 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3])
const u32le = (b: Uint8Array, at: number): number =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0

// The type by file signature, or null. The file name and any type the sender names are
// not looked at.
export function sniffImageType(bytes: Uint8Array): ImageMediaType | null {
  if (has(bytes, 0, PNG)) return 'image/png'
  if (has(bytes, 0, JPEG)) return 'image/jpeg'
  if (has(bytes, 0, GIF87) || has(bytes, 0, GIF89)) return 'image/gif'
  if (has(bytes, 0, RIFF) && has(bytes, 8, WEBP)) return 'image/webp'
  return null
}

type Size = { width: number; height: number }

// The signature, then the IHDR chunk: its length (13), "IHDR", width, height.
function pngSize(b: Uint8Array): Size | null {
  if (b.length < 24 || u32be(b, 8) !== 13 || !has(b, 12, IHDR)) return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

// Walks the segments from the start of the file to the first frame header (SOF). Each
// segment is FF, a marker, and a length that counts its own two bytes, so every step
// moves forward and the walk ends at the end of the bytes.
function jpegSize(b: Uint8Array): Size | null {
  let at = 2
  while (at + 1 < b.length) {
    if (b[at] !== 0xff) return null
    const marker = b[at + 1]
    // FF fill bytes may come before a marker.
    if (marker === 0xff) {
      at++
      continue
    }
    // No length: TEM, RST0-RST7, SOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2
      continue
    }
    // 0x00 is not a marker, EOI ends the file, and SOS starts the picture data: the
    // frame header was not found before any of them.
    if (marker === 0x00 || marker === 0xd9 || marker === 0xda) return null
    // SOF0 to SOF15, except DHT (C4), JPG (C8), and DAC (CC), which share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      // Length, precision (1), height (2), width (2), component count (1).
      if (at + 9 > b.length || u16be(b, at + 2) < 8) return null
      return { width: u16be(b, at + 7), height: u16be(b, at + 5) }
    }
    if (at + 4 > b.length) return null
    const length = u16be(b, at + 2)
    if (length < 2) return null
    at += 2 + length
  }
  return null
}

// The logical screen descriptor after the 6 byte header: width, height, little endian.
function gifSize(b: Uint8Array): Size | null {
  if (b.length < 10) return null
  return { width: u16le(b, 6), height: u16le(b, 8) }
}

// "RIFF", size, "WEBP", then the first chunk: its name, its size, and its data from
// byte 20. The first chunk says which of the three kinds of WebP this is.
function webpSize(b: Uint8Array): Size | null {
  if (has(b, 12, VP8_LOSSY)) {
    // Lossy: a 3 byte frame tag (bit 0 clear means a key frame), the start code, then
    // 14 bit width and height. The top two bits of each are a scale.
    if (b.length < 30 || (b[20] & 1) !== 0 || !has(b, 23, VP8_START_CODE)) return null
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  }
  if (has(b, 12, VP8_LOSSLESS)) {
    // Lossless: the byte 0x2F, then 14 bit width and height, each stored minus one.
    if (b.length < 25 || b[20] !== 0x2f) return null
    const bits = u32le(b, 21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (has(b, 12, VP8_EXTENDED)) {
    // Extended: flags and 3 reserved bytes, then the canvas width and height, 24 bit each,
    // stored minus one.
    if (b.length < 30) return null
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  }
  return null
}

// The pixel size from the header only. Null when the bytes are not that type, or are
// cut short or damaged before the size.
export function readImageSize(bytes: Uint8Array, type: ImageMediaType): Size | null {
  if (sniffImageType(bytes) !== type) return null
  switch (type) {
    case 'image/png':
      return pngSize(bytes)
    case 'image/jpeg':
      return jpegSize(bytes)
    case 'image/gif':
      return gifSize(bytes)
    case 'image/webp':
      return webpSize(bytes)
  }
}

export type ImageCheck =
  | { ok: true; mediaType: ImageMediaType; width: number; height: number }
  | { ok: false; error: string }

// The exact error to show, or the type and size to send with.
export function checkImage(bytes: Uint8Array): ImageCheck {
  const wrongType: ImageCheck = { ok: false, error: IMAGE_ERRORS.wrongType }
  if (bytes.length > IMAGE_MAX_BYTES) {
    return { ok: false, error: IMAGE_ERRORS.tooBig(formatBytesUp(bytes.length)) }
  }
  const mediaType = sniffImageType(bytes)
  if (!mediaType) return wrongType
  const size = readImageSize(bytes, mediaType)
  if (!size || size.width === 0 || size.height === 0) return wrongType
  if (size.width > IMAGE_MAX_SIDE || size.height > IMAGE_MAX_SIDE) {
    return { ok: false, error: IMAGE_ERRORS.tooLarge(size.width, size.height) }
  }
  return { ok: true, mediaType, width: size.width, height: size.height }
}

// The error when a message would hold more than IMAGE_MAX_COUNT images, else null.
export function checkImageCount(count: number): string | null {
  return count > IMAGE_MAX_COUNT ? IMAGE_ERRORS.tooMany : null
}

// The error when the images of a message add up to more than IMAGE_MAX_TOTAL_BYTES, else null.
export function checkImageTotal(totalBytes: number): string | null {
  return totalBytes > IMAGE_MAX_TOTAL_BYTES
    ? IMAGE_ERRORS.tooBigTotal(formatBytesUp(totalBytes))
    : null
}

export type ImagesCheck = { ok: true; mediaTypes: ImageMediaType[] } | { ok: false; error: string }

// All the images of one message, and the first error in this order: each image (size,
// type and header, dimensions), then how many there are, then their total size.
export function checkImages(images: readonly Uint8Array[]): ImagesCheck {
  const mediaTypes: ImageMediaType[] = []
  let total = 0
  for (const bytes of images) {
    const checked = checkImage(bytes)
    if (!checked.ok) return checked
    mediaTypes.push(checked.mediaType)
    total += bytes.length
  }
  const error = checkImageCount(images.length) ?? checkImageTotal(total)
  return error ? { ok: false, error } : { ok: true, mediaTypes }
}
