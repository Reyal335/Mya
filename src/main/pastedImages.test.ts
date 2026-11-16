import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCall, withCall } from '../shared/callAgent.ts'
import { IMAGE_ERRORS, IMAGE_MAX_BYTES, IMAGE_MAX_TOTAL_BYTES } from '../shared/images.ts'
import { readPastedImages, userContent, type SendImage } from './pastedImages.ts'

// Small valid headers: only what the size readers look at is real.

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  const view = new DataView(bytes.buffer)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12) // IHDR
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

// A JPEG: SOI, a SOF0 frame header, EOI.
function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
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

// A valid PNG header at the front of `length` bytes.
function padded(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  bytes.set(png(10, 10))
  return bytes
}

const items = (...all: Uint8Array[]): { bytes: Uint8Array }[] => all.map((bytes) => ({ bytes }))
const text = (value: string): Uint8Array => new TextEncoder().encode(value)
// 5 images of `each` bytes.
const five = (each: number): { bytes: Uint8Array }[] =>
  items(...Array.from({ length: 5 }, () => padded(each)))

const wrongType = { ok: false, message: IMAGE_ERRORS.wrongType }

test('readPastedImages: no images is fine', () => {
  assert.deepEqual(readPastedImages(undefined), { ok: true, images: [] })
  assert.deepEqual(readPastedImages(null), { ok: true, images: [] })
  assert.deepEqual(readPastedImages([]), { ok: true, images: [] })
})

test('readPastedImages: anything that is not an array is refused', () => {
  for (const raw of ['x', 5, true, {}, { length: 1, 0: { bytes: png(1, 1) } }, () => []]) {
    assert.deepEqual(readPastedImages(raw), wrongType)
  }
})

test('readPastedImages: items without bytes are refused', () => {
  for (const item of [{}, null, 5, 'x', [1, 2], { bytes: undefined }, { bytes: null }, {}]) {
    assert.deepEqual(readPastedImages([item]), wrongType)
  }
  // One good image does not carry a bad one along.
  assert.deepEqual(readPastedImages([{ bytes: png(1, 1) }, {}]), wrongType)
})

test('readPastedImages: bytes that are not a view on memory are refused', () => {
  const real = png(10, 10)
  // A plain array of numbers, a string, a bare ArrayBuffer.
  assert.deepEqual(readPastedImages([{ bytes: Array.from(real) }]), wrongType)
  assert.deepEqual(readPastedImages([{ bytes: String.fromCharCode(...real) }]), wrongType)
  assert.deepEqual(readPastedImages([{ bytes: real.buffer }]), wrongType)
  assert.deepEqual(readPastedImages([{ bytes: { 0: 0x89, length: 33 } }]), wrongType)
})

test('readPastedImages: a DataView or a Float64Array is read as plain bytes', () => {
  const buffer = new ArrayBuffer(40)
  new Uint8Array(buffer).set(png(10, 10))
  const viaFloats = readPastedImages([{ bytes: new Float64Array(buffer) }])
  assert.equal(viaFloats.ok, true)
  if (viaFloats.ok) {
    assert.equal(viaFloats.images[0].mediaType, 'image/png')
    assert.ok(viaFloats.images[0].bytes instanceof Uint8Array)
    assert.equal(viaFloats.images[0].bytes.length, 40)
  }

  const viaView = readPastedImages([{ bytes: new DataView(buffer, 0, 33) }])
  assert.equal(viaView.ok, true)
  if (viaView.ok) assert.equal(viaView.images[0].bytes.length, 33)
})

test('readPastedImages: a view on part of a bigger buffer is only that part', () => {
  const buffer = new ArrayBuffer(50)
  new Uint8Array(buffer).set(png(10, 10), 7)
  const part = readPastedImages([{ bytes: new Uint8Array(buffer, 7, 33) }])
  assert.equal(part.ok, true)
  if (part.ok) {
    assert.deepEqual(part.images[0].bytes, png(10, 10))
    assert.equal(part.images[0].bytes.byteOffset, 7)
  }
  // A Buffer is a Uint8Array too.
  assert.equal(readPastedImages([{ bytes: Buffer.from(png(10, 10)) }]).ok, true)
})

test('readPastedImages: the type comes from the bytes, not from what the window says', () => {
  const claimed = readPastedImages([{ bytes: jpeg(10, 10), mediaType: 'image/svg+xml' }])
  assert.equal(claimed.ok, true)
  if (claimed.ok) {
    assert.equal(claimed.images[0].mediaType, 'image/jpeg')
    assert.deepEqual(Object.keys(claimed.images[0]).sort(), ['bytes', 'mediaType'])
  }
  // A claimed type does not make text an image.
  assert.deepEqual(readPastedImages([{ bytes: text('<svg/>'), mediaType: 'image/png' }]), wrongType)
})

test('readPastedImages: images that pass come back in order with their types', () => {
  const result = readPastedImages(items(png(10, 10), jpeg(20, 20)))
  assert.equal(result.ok, true)
  if (result.ok)
    assert.deepEqual(
      result.images.map((image) => image.mediaType),
      ['image/png', 'image/jpeg']
    )
})

test('readPastedImages: a sparse array of a billion slots is refused without walking it', () => {
  const started = performance.now()
  assert.deepEqual(readPastedImages(new Array(1_000_000_000)), {
    ok: false,
    message: IMAGE_ERRORS.tooMany
  })
  // Walking it would take many seconds.
  assert.ok(performance.now() - started < 1000)
})

test('readPastedImages: 1000 images are refused by count before any is looked at', () => {
  // Each of these would be "too big" if main looked at it.
  const huge = new Uint8Array(IMAGE_MAX_BYTES + 1)
  const started = performance.now()
  assert.deepEqual(readPastedImages(Array.from({ length: 1000 }, () => ({ bytes: huge }))), {
    ok: false,
    message: IMAGE_ERRORS.tooMany
  })
  assert.ok(performance.now() - started < 500)
  // Nor is a bad image in the first 6 looked at: the count is what is reported.
  assert.deepEqual(readPastedImages([{ bytes: text('x') }, ...five(100)]), {
    ok: false,
    message: IMAGE_ERRORS.tooMany
  })
  assert.deepEqual(readPastedImages([{}, ...five(100)]), {
    ok: false,
    message: IMAGE_ERRORS.tooMany
  })
})

test('readPastedImages: errors come in order, each image, then the total', () => {
  const big = Math.round(4.2 * 1024 * 1024)
  // 5 valid images of 4.2 MB: only the total is wrong.
  assert.deepEqual(readPastedImages(five(big)), {
    ok: false,
    message: IMAGE_ERRORS.tooBigTotal('21.0 MB')
  })
  // A bad image is reported even when the total is over as well.
  assert.deepEqual(readPastedImages([...five(big).slice(0, 4), { bytes: text('nope') }]), wrongType)
  // The first image that fails gives the error.
  assert.deepEqual(readPastedImages(items(padded(IMAGE_MAX_BYTES + 1), text('nope'))), {
    ok: false,
    message: IMAGE_ERRORS.tooBig('5.1 MB')
  })
  assert.deepEqual(readPastedImages(items(text('nope'), padded(IMAGE_MAX_BYTES + 1))), wrongType)
  assert.deepEqual(readPastedImages(items(png(8001, 10), text('nope'))), {
    ok: false,
    message: IMAGE_ERRORS.tooLarge(8001, 10)
  })
})

test('readPastedImages: the exact text for 5 MB and 1 byte, and for 20 MB and 1 byte in all', () => {
  assert.deepEqual(readPastedImages(items(padded(IMAGE_MAX_BYTES + 1))), {
    ok: false,
    message: 'Image must be 5 MB or smaller. This one is 5.1 MB.'
  })
  assert.equal(readPastedImages(five(IMAGE_MAX_TOTAL_BYTES / 5)).ok, true)
  const over = five(IMAGE_MAX_TOTAL_BYTES / 5)
  over[4] = { bytes: padded(IMAGE_MAX_TOTAL_BYTES / 5 + 1) }
  assert.deepEqual(readPastedImages(over), {
    ok: false,
    message: 'Images in one message must be 20 MB or smaller together. These are 20.1 MB.'
  })
})

const gif = (bytes: number[]): SendImage => ({
  bytes: Uint8Array.from(bytes),
  mediaType: 'image/gif'
})

test('userContent: without images it is exactly the text', () => {
  assert.equal(userContent('hello', []), 'hello')
  assert.equal(userContent('', []), '')
  assert.equal(userContent('  \n', []), '  \n')
})

test('userContent: the text block first, then one image block each, in order', () => {
  assert.deepEqual(
    userContent('look', [gif([1, 2, 3]), { ...gif([255]), mediaType: 'image/webp' }]),
    [
      { type: 'text', text: 'look' },
      { type: 'image', source: { type: 'base64', media_type: 'image/gif', data: 'AQID' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: '/w==' } }
    ]
  )
})

test('userContent: the data is the base64 of the bytes and nothing around them', () => {
  const real = png(10, 10)
  const blocks = userContent('x', [{ bytes: real, mediaType: 'image/png' }])
  assert.ok(Array.isArray(blocks))
  const image = blocks[1] as { source: { data: string } }
  assert.deepEqual(new Uint8Array(Buffer.from(image.source.data, 'base64')), real)
  // A view on part of a bigger buffer: only that part.
  const view = Uint8Array.of(9, 1, 2, 3, 9).subarray(1, 4)
  assert.deepEqual(userContent('', [{ bytes: view, mediaType: 'image/gif' }]), [
    { type: 'image', source: { type: 'base64', media_type: 'image/gif', data: 'AQID' } }
  ])
})

test('userContent: blank text leaves out the text block', () => {
  const only = [
    { type: 'image', source: { type: 'base64', media_type: 'image/gif', data: 'AQID' } }
  ]
  assert.deepEqual(userContent('', [gif([1, 2, 3])]), only)
  assert.deepEqual(userContent('   \n\t', [gif([1, 2, 3])]), only)
})

test('userContent: text is kept exactly as it is', () => {
  const blocks = userContent('  spaced  \n', [gif([1])])
  assert.ok(Array.isArray(blocks))
  assert.deepEqual(blocks[0], { type: 'text', text: '  spaced  \n' })
})

test('userContent: an agent call sentence stays inside the one first text block', () => {
  const called = withCall('Reviewer', 'check this')
  const blocks = userContent(called, [gif([1, 2, 3]), gif([4])])
  assert.ok(Array.isArray(blocks))
  assert.equal(blocks.filter((block) => block.type === 'text').length, 1)
  assert.deepEqual(blocks[0], { type: 'text', text: called })
  const first = blocks[0] as { text: string }
  assert.deepEqual(parseCall(first.text), { agentName: 'Reviewer', text: 'check this' })

  // A call with no typed text and an image: the sentence alone is the text block.
  const alone = userContent(withCall('Reviewer', ''), [gif([1])])
  assert.ok(Array.isArray(alone))
  assert.equal(alone.filter((block) => block.type === 'text').length, 1)
  const sentence = alone[0] as { text: string }
  assert.deepEqual(parseCall(sentence.text), { agentName: 'Reviewer', text: '' })
})
