import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  IMAGE_ERRORS,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_COUNT,
  IMAGE_MAX_SIDE,
  IMAGE_MAX_TOTAL_BYTES,
  checkImage,
  checkImageCount,
  checkImageTotal,
  checkImages,
  formatBytes,
  formatBytesUp,
  readImageSize,
  sniffImageType
} from './images.ts'

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0))

// Small valid headers with known sizes. Only what the readers look at is real.

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  const view = new DataView(bytes.buffer)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  view.setUint32(8, 13)
  bytes.set(ascii('IHDR'), 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  bytes[24] = 8 // bit depth
  bytes[25] = 6 // RGBA
  return bytes
}

const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff]

const APP0 = [0xff, 0xe0, 0x00, 0x10, ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]

// A DHT segment: marker C4, length 19 (2 + 1 + 16 counts), one table with no codes.
const DHT = [0xff, 0xc4, 0x00, 0x13, 0x00, ...new Array<number>(16).fill(0)]

function jpeg(width: number, height: number, sof = 0xc0, before: number[][] = []): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    ...APP0,
    ...before.flat(),
    // SOF: length 17, 8 bit, height, width, 3 components.
    0xff,
    sof,
    0x00,
    0x11,
    0x08,
    ...be16(height),
    ...be16(width),
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
    0xff,
    0xd9
  ])
}

function gif(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    ...ascii('GIF89a'),
    width & 0xff,
    width >> 8,
    height & 0xff,
    height >> 8,
    0,
    0,
    0
  ])
}

// RIFF, size, WEBP, then one chunk: name, size, data.
function webp(name: string, data: number[]): Uint8Array {
  const size = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, 0]
  return Uint8Array.from([
    ...ascii('RIFF'),
    ...size(4 + 8 + data.length),
    ...ascii('WEBP'),
    ...ascii(name),
    ...size(data.length),
    ...data
  ])
}

function webpLossy(width: number, height: number): Uint8Array {
  const le16 = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff]
  return webp('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...le16(width), ...le16(height), 0, 0])
}

function webpLossless(width: number, height: number): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)
  return webp('VP8L', [
    0x2f,
    bits & 0xff,
    (bits >>> 8) & 0xff,
    (bits >>> 16) & 0xff,
    (bits >>> 24) & 0xff,
    0
  ])
}

function webpExtended(width: number, height: number): Uint8Array {
  const le24 = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]
  return webp('VP8X', [0x10, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)])
}

// A valid PNG header at the front of `length` bytes.
function padded(length: number, width = 10, height = 10): Uint8Array {
  const bytes = new Uint8Array(length)
  bytes.set(png(width, height))
  return bytes
}

test('limits and error texts', () => {
  assert.equal(IMAGE_MAX_BYTES, 5 * 1024 * 1024)
  assert.equal(IMAGE_MAX_COUNT, 5)
  assert.equal(IMAGE_MAX_SIDE, 8000)
  assert.equal(IMAGE_ERRORS.wrongType, 'Image must be a PNG, JPG, GIF, or WebP.')
  assert.equal(IMAGE_ERRORS.tooBig('6.0 MB'), 'Image must be 5 MB or smaller. This one is 6.0 MB.')
  assert.equal(
    IMAGE_ERRORS.tooLarge(9000, 20),
    'Image must be 8000 px or smaller on each side. This one is 9000x20.'
  )
  assert.equal(IMAGE_ERRORS.tooMany, 'A message can hold up to 5 images.')
  assert.equal(IMAGE_MAX_TOTAL_BYTES, 20 * 1024 * 1024)
  assert.equal(
    IMAGE_ERRORS.tooBigTotal('21.0 MB'),
    'Images in one message must be 20 MB or smaller together. These are 21.0 MB.'
  )
})

test('formatBytes: bytes, KB, MB with one decimal', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(1023), '1023 B')
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(1024 * 1024), '1.0 MB')
  assert.equal(formatBytes(Math.round(2.3 * 1024 * 1024)), '2.3 MB')
})

test('formatBytes: steps up to MB where KB would round to 1024.0', () => {
  assert.equal(formatBytes(1048064), '1023.5 KB')
  assert.equal(formatBytes(1048550), '1.0 MB')
  assert.equal(formatBytes(1048575), '1.0 MB')
})

test('formatBytesUp: the same units as formatBytes, with the decimal rounded up', () => {
  assert.equal(formatBytesUp(0), '0 B')
  assert.equal(formatBytesUp(1023), '1023 B')
  assert.equal(formatBytesUp(1024), '1.0 KB')
  assert.equal(formatBytesUp(1025), '1.1 KB')
  assert.equal(formatBytesUp(1536), '1.5 KB')
  assert.equal(formatBytesUp(1024 * 1024), '1.0 MB')
  assert.equal(formatBytesUp(5 * 1024 * 1024), '5.0 MB')
  assert.equal(formatBytesUp(5 * 1024 * 1024 + 1), '5.1 MB')
  assert.equal(formatBytesUp(20 * 1024 * 1024 + 1), '20.1 MB')
  // Rounding up is never below the exact size, where formatBytes can be.
  assert.equal(formatBytes(5 * 1024 * 1024 + 1), '5.0 MB')
  assert.equal(formatBytesUp(Math.ceil(5.05 * 1024 * 1024)), '5.1 MB')
})

test('formatBytesUp: steps up to MB where KB would round up to 1024.0', () => {
  assert.equal(formatBytesUp(1048064), '1023.5 KB')
  assert.equal(formatBytesUp(1048422), '1023.9 KB')
  assert.equal(formatBytesUp(1048524), '1.0 MB')
  assert.equal(formatBytesUp(1048575), '1.0 MB')
})

test('sniffImageType: each type by its signature', () => {
  assert.equal(sniffImageType(png(1, 1)), 'image/png')
  assert.equal(sniffImageType(jpeg(1, 1)), 'image/jpeg')
  assert.equal(sniffImageType(gif(1, 1)), 'image/gif')
  assert.equal(sniffImageType(Uint8Array.from(ascii('GIF87a'))), 'image/gif')
  assert.equal(sniffImageType(webpLossy(1, 1)), 'image/webp')
  assert.equal(sniffImageType(webpLossless(1, 1)), 'image/webp')
  assert.equal(sniffImageType(webpExtended(1, 1)), 'image/webp')
})

test('sniffImageType: text, empty, short, and near misses are not images', () => {
  assert.equal(sniffImageType(Uint8Array.from(ascii('hello world, not an image'))), null)
  assert.equal(sniffImageType(new Uint8Array(0)), null)
  assert.equal(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a])), null)
  assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8])), null)
  assert.equal(sniffImageType(Uint8Array.from(ascii('GIF8'))), null)
  assert.equal(sniffImageType(Uint8Array.from(ascii('GIF88a'))), null)
  assert.equal(sniffImageType(Uint8Array.from(ascii('RIFF'))), null)
  assert.equal(sniffImageType(Uint8Array.from(ascii('RIFF\0\0\0\0WAVEfmt '))), null)
  assert.equal(
    sniffImageType(Uint8Array.from(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))),
    null
  )
})

test('checkImage: the bytes decide the type, not what the sender called it', () => {
  // JPEG bytes sent as a "PNG" are a JPEG.
  const result = checkImage(jpeg(10, 10))
  assert.equal(result.ok && result.mediaType, 'image/jpeg')
})

test('readImageSize: PNG', () => {
  assert.deepEqual(readImageSize(png(640, 480), 'image/png'), { width: 640, height: 480 })
  assert.deepEqual(readImageSize(png(70000, 3), 'image/png'), { width: 70000, height: 3 })
  assert.deepEqual(readImageSize(png(0xffffffff, 1), 'image/png'), { width: 4294967295, height: 1 })
})

test('readImageSize: PNG that is cut short or has no IHDR', () => {
  assert.equal(readImageSize(png(640, 480).slice(0, 23), 'image/png'), null)
  assert.equal(readImageSize(png(640, 480).slice(0, 8), 'image/png'), null)
  const notIhdr = png(640, 480)
  notIhdr.set(ascii('IDAT'), 12)
  assert.equal(readImageSize(notIhdr, 'image/png'), null)
  const badLength = png(640, 480)
  badLength[11] = 12
  assert.equal(readImageSize(badLength, 'image/png'), null)
})

test('readImageSize: JPEG baseline (SOF0)', () => {
  assert.deepEqual(readImageSize(jpeg(800, 600), 'image/jpeg'), { width: 800, height: 600 })
})

test('readImageSize: JPEG progressive (SOF2) and other frame types', () => {
  assert.deepEqual(readImageSize(jpeg(1024, 768, 0xc2), 'image/jpeg'), { width: 1024, height: 768 })
  assert.deepEqual(readImageSize(jpeg(5, 6, 0xc1), 'image/jpeg'), { width: 5, height: 6 })
  assert.deepEqual(readImageSize(jpeg(5, 6, 0xcf), 'image/jpeg'), { width: 5, height: 6 })
})

test('readImageSize: JPEG skips a DHT segment in front of the frame header', () => {
  const bytes = jpeg(321, 123, 0xc0, [DHT])
  assert.deepEqual(readImageSize(bytes, 'image/jpeg'), { width: 321, height: 123 })
  // The DHT marker (C4) is in the SOF range but is not a frame header.
  assert.deepEqual(readImageSize(jpeg(7, 9, 0xc0, [DHT, DHT]), 'image/jpeg'), {
    width: 7,
    height: 9
  })
})

test('readImageSize: JPEG with fill bytes and standalone markers before the frame', () => {
  const bytes = jpeg(40, 30, 0xc0, [
    [0xff, 0xff, 0xff, 0xd0],
    [0xff, 0x01]
  ])
  assert.deepEqual(readImageSize(bytes, 'image/jpeg'), { width: 40, height: 30 })
})

test('readImageSize: JPEG with no frame header, or damaged segments', () => {
  const soiOnly = Uint8Array.from([0xff, 0xd8, 0xff])
  assert.equal(readImageSize(soiOnly, 'image/jpeg'), null)
  // The picture data (SOS) starts before any frame header.
  const sos = Uint8Array.from([0xff, 0xd8, ...APP0, 0xff, 0xda, 0x00, 0x02])
  assert.equal(readImageSize(sos, 'image/jpeg'), null)
  // The file ends (EOI) before any frame header.
  assert.equal(
    readImageSize(Uint8Array.from([0xff, 0xd8, ...APP0, 0xff, 0xd9]), 'image/jpeg'),
    null
  )
  // A segment length of 0 or 1 would never move the walk forward.
  assert.equal(
    readImageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]), 'image/jpeg'),
    null
  )
  assert.equal(
    readImageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]), 'image/jpeg'),
    null
  )
  // A segment length that runs past the end.
  assert.equal(
    readImageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 1, 2]), 'image/jpeg'),
    null
  )
  // Not at a marker.
  assert.equal(
    readImageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 1, 2, 3, 4]), 'image/jpeg'),
    null
  )
  // An invalid marker byte.
  assert.equal(
    readImageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x04]), 'image/jpeg'),
    null
  )
})

test('readImageSize: JPEG cut short inside the frame header', () => {
  const whole = jpeg(800, 600)
  const sofAt = 2 + APP0.length
  for (let end = sofAt; end < sofAt + 9; end++) {
    assert.equal(readImageSize(whole.slice(0, end), 'image/jpeg'), null, `cut at ${end}`)
  }
  // Exactly the 9 bytes the size needs are enough.
  assert.deepEqual(readImageSize(whole.slice(0, sofAt + 9), 'image/jpeg'), {
    width: 800,
    height: 600
  })
  // A frame header that says it is shorter than the fields it holds.
  const short = whole.slice()
  short[sofAt + 3] = 7
  assert.equal(readImageSize(short, 'image/jpeg'), null)
})

test('readImageSize: GIF, little endian', () => {
  assert.deepEqual(readImageSize(gif(320, 200), 'image/gif'), { width: 320, height: 200 })
  assert.deepEqual(readImageSize(gif(0x1234, 0xabcd), 'image/gif'), {
    width: 0x1234,
    height: 0xabcd
  })
  assert.equal(readImageSize(gif(320, 200).slice(0, 9), 'image/gif'), null)
})

test('readImageSize: WebP lossy (VP8)', () => {
  assert.deepEqual(readImageSize(webpLossy(500, 300), 'image/webp'), { width: 500, height: 300 })
  assert.equal(readImageSize(webpLossy(500, 300).slice(0, 29), 'image/webp'), null)
  // The scale bits in the top two bits of each field are not part of the size.
  const scaled = webpLossy(500, 300)
  scaled[27] |= 0xc0
  scaled[29] |= 0x40
  assert.deepEqual(readImageSize(scaled, 'image/webp'), { width: 500, height: 300 })
  // Without the start code, or not a key frame, there is no size to read.
  const noCode = webpLossy(500, 300)
  noCode[23] = 0
  assert.equal(readImageSize(noCode, 'image/webp'), null)
  const delta = webpLossy(500, 300)
  delta[20] |= 1
  assert.equal(readImageSize(delta, 'image/webp'), null)
})

test('readImageSize: WebP lossless (VP8L), minus one on each side', () => {
  assert.deepEqual(readImageSize(webpLossless(1, 1), 'image/webp'), { width: 1, height: 1 })
  assert.deepEqual(readImageSize(webpLossless(640, 480), 'image/webp'), { width: 640, height: 480 })
  assert.deepEqual(readImageSize(webpLossless(16384, 16384), 'image/webp'), {
    width: 16384,
    height: 16384
  })
  assert.equal(readImageSize(webpLossless(640, 480).slice(0, 24), 'image/webp'), null)
  const noSignature = webpLossless(640, 480)
  noSignature[20] = 0
  assert.equal(readImageSize(noSignature, 'image/webp'), null)
})

test('readImageSize: WebP extended (VP8X), 24 bit canvas minus one', () => {
  assert.deepEqual(readImageSize(webpExtended(1, 1), 'image/webp'), { width: 1, height: 1 })
  assert.deepEqual(readImageSize(webpExtended(1920, 1080), 'image/webp'), {
    width: 1920,
    height: 1080
  })
  assert.deepEqual(readImageSize(webpExtended(70000, 8001), 'image/webp'), {
    width: 70000,
    height: 8001
  })
  assert.equal(readImageSize(webpExtended(1920, 1080).slice(0, 29), 'image/webp'), null)
})

test('readImageSize: a WebP whose first chunk is not an image chunk', () => {
  assert.equal(readImageSize(webp('EXIF', new Array<number>(20).fill(0)), 'image/webp'), null)
  assert.equal(readImageSize(Uint8Array.from(ascii('RIFF\0\0\0\0WEBP')), 'image/webp'), null)
})

test('readImageSize: the bytes must be the named type', () => {
  assert.equal(readImageSize(png(10, 10), 'image/jpeg'), null)
  assert.equal(readImageSize(jpeg(10, 10), 'image/png'), null)
  assert.equal(readImageSize(new Uint8Array(0), 'image/gif'), null)
})

test('checkImage: each type passes with its size', () => {
  assert.deepEqual(checkImage(png(640, 480)), {
    ok: true,
    mediaType: 'image/png',
    width: 640,
    height: 480
  })
  assert.deepEqual(checkImage(jpeg(800, 600)), {
    ok: true,
    mediaType: 'image/jpeg',
    width: 800,
    height: 600
  })
  assert.deepEqual(checkImage(gif(32, 16)), {
    ok: true,
    mediaType: 'image/gif',
    width: 32,
    height: 16
  })
  assert.deepEqual(checkImage(webpLossy(500, 300)), {
    ok: true,
    mediaType: 'image/webp',
    width: 500,
    height: 300
  })
  assert.deepEqual(checkImage(webpLossless(64, 64)), {
    ok: true,
    mediaType: 'image/webp',
    width: 64,
    height: 64
  })
  assert.deepEqual(checkImage(webpExtended(64, 32)), {
    ok: true,
    mediaType: 'image/webp',
    width: 64,
    height: 32
  })
})

test('checkImage: exactly 5 MB passes the size gate, one byte more does not', () => {
  assert.equal(checkImage(padded(IMAGE_MAX_BYTES)).ok, true)
  assert.deepEqual(checkImage(padded(IMAGE_MAX_BYTES + 1)), {
    ok: false,
    error: 'Image must be 5 MB or smaller. This one is 5.1 MB.'
  })
  assert.deepEqual(checkImage(padded(6 * 1024 * 1024)), {
    ok: false,
    error: 'Image must be 5 MB or smaller. This one is 6.0 MB.'
  })
})

test('checkImage: the size gate comes before the type check', () => {
  const big = new Uint8Array(IMAGE_MAX_BYTES + 1)
  assert.deepEqual(checkImage(big), { ok: false, error: IMAGE_ERRORS.tooBig('5.1 MB') })
})

test('checkImage: 8000 px passes, 8001 px does not', () => {
  assert.equal(checkImage(png(IMAGE_MAX_SIDE, IMAGE_MAX_SIDE)).ok, true)
  assert.deepEqual(checkImage(png(IMAGE_MAX_SIDE + 1, 100)), {
    ok: false,
    error: 'Image must be 8000 px or smaller on each side. This one is 8001x100.'
  })
  assert.deepEqual(checkImage(png(100, IMAGE_MAX_SIDE + 1)), {
    ok: false,
    error: IMAGE_ERRORS.tooLarge(100, IMAGE_MAX_SIDE + 1)
  })
  assert.equal(checkImage(jpeg(IMAGE_MAX_SIDE, 1)).ok, true)
  assert.equal(checkImage(jpeg(IMAGE_MAX_SIDE + 1, 1)).ok, false)
  assert.equal(checkImage(webpExtended(IMAGE_MAX_SIDE, IMAGE_MAX_SIDE)).ok, true)
  assert.equal(checkImage(webpExtended(1, IMAGE_MAX_SIDE + 1)).ok, false)
  assert.equal(checkImage(gif(IMAGE_MAX_SIDE + 1, 1)).ok, false)
})

test('checkImage: not an image, or an image that cannot be read', () => {
  const wrong = { ok: false, error: IMAGE_ERRORS.wrongType }
  assert.deepEqual(checkImage(new Uint8Array(0)), wrong)
  assert.deepEqual(checkImage(Uint8Array.from(ascii('just some text'))), wrong)
  // A good signature with the header cut off.
  assert.deepEqual(checkImage(png(10, 10).slice(0, 20)), wrong)
  assert.deepEqual(checkImage(Uint8Array.from([0xff, 0xd8, 0xff])), wrong)
  assert.deepEqual(checkImage(webp('EXIF', [0, 0, 0, 0])), wrong)
  // A size of 0 is not an image.
  assert.deepEqual(checkImage(png(0, 10)), wrong)
  assert.deepEqual(checkImage(png(10, 0)), wrong)
  assert.deepEqual(checkImage(gif(0, 0)), wrong)
  assert.deepEqual(checkImage(png(0, IMAGE_MAX_SIDE + 1)), wrong)
})

test('checkImageCount: up to 5 is fine, 6 is not', () => {
  assert.equal(checkImageCount(0), null)
  assert.equal(checkImageCount(1), null)
  assert.equal(checkImageCount(5), null)
  assert.equal(checkImageCount(6), 'A message can hold up to 5 images.')
  assert.equal(checkImageCount(50), IMAGE_ERRORS.tooMany)
})

test('checkImageTotal: exactly 20 MB passes, one byte more does not', () => {
  assert.equal(checkImageTotal(0), null)
  assert.equal(checkImageTotal(IMAGE_MAX_TOTAL_BYTES), null)
  assert.equal(
    checkImageTotal(IMAGE_MAX_TOTAL_BYTES + 1),
    'Images in one message must be 20 MB or smaller together. These are 20.1 MB.'
  )
  assert.equal(checkImageTotal(25 * 1024 * 1024), IMAGE_ERRORS.tooBigTotal('25.0 MB'))
})

// Five images of this many bytes each, valid PNG headers.
const five = (each: number): Uint8Array[] => Array.from({ length: 5 }, () => padded(each))

test('checkImages: a message of images that all pass gives their types', () => {
  assert.deepEqual(checkImages([]), { ok: true, mediaTypes: [] })
  assert.deepEqual(checkImages([png(10, 10), jpeg(10, 10), gif(1, 1), webpLossy(8, 8)]), {
    ok: true,
    mediaTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  })
})

test('checkImages: 5 images of 20 MB together pass, one more byte fails the total', () => {
  const each = IMAGE_MAX_TOTAL_BYTES / 5
  assert.equal(checkImages(five(each)).ok, true)
  const over = five(each)
  over[4] = padded(each + 1)
  assert.deepEqual(checkImages(over), {
    ok: false,
    error: IMAGE_ERRORS.tooBigTotal('20.1 MB')
  })
})

test('checkImages: order of errors is each image, then the count, then the total', () => {
  // 5 valid images of 4.2 MB each are 21 MB: the total is the error.
  assert.deepEqual(checkImages(five(Math.round(4.2 * 1024 * 1024))), {
    ok: false,
    error: IMAGE_ERRORS.tooBigTotal('21.0 MB')
  })
  // A 6th image is the count, even when the total is over as well.
  assert.deepEqual(checkImages([...five(100), png(10, 10)]), {
    ok: false,
    error: IMAGE_ERRORS.tooMany
  })
  assert.deepEqual(checkImages([...five(Math.round(4.2 * 1024 * 1024)), png(10, 10)]), {
    ok: false,
    error: IMAGE_ERRORS.tooMany
  })
  // An image that fails is the error before the count and the total.
  assert.deepEqual(checkImages([...five(100), Uint8Array.from(ascii('text'))]), {
    ok: false,
    error: IMAGE_ERRORS.wrongType
  })
  assert.deepEqual(checkImages([png(10, 10), padded(IMAGE_MAX_BYTES + 1), ...five(100)]), {
    ok: false,
    error: IMAGE_ERRORS.tooBig('5.1 MB')
  })
  assert.deepEqual(checkImages([...five(Math.round(4.2 * 1024 * 1024)), png(9000, 10)]), {
    ok: false,
    error: IMAGE_ERRORS.tooLarge(9000, 10)
  })
})
