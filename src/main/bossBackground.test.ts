import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkBackground } from './bossBackground.ts'
import { fakeJpeg, fakePng, headerDecoder } from './testImages.ts'

const MB = 1024 * 1024

test('a PNG and a JPG inside the limits pass, at any aspect ratio', () => {
  const png = checkBackground(fakePng(320, 200), 'floor.png', headerDecoder)
  assert.deepEqual(png, { ok: true, kind: 'png', width: 320, height: 200 })
  const jpg = checkBackground(fakeJpeg(1920, 1080), 'sky.jpg', headerDecoder)
  assert.deepEqual(jpg, { ok: true, kind: 'jpeg', width: 1920, height: 1080 })
  for (const [w, h] of [
    [320, 180],
    [4000, 4000],
    [4000, 180],
    [320, 4000]
  ]) {
    assert.ok(checkBackground(fakePng(w, h), 'x.png', headerDecoder).ok, `${w}x${h}`)
  }
})

test('a file over 5 MB is refused first, before anything else is looked at', () => {
  const big = checkBackground(fakePng(2000, 2000, 6 * MB), 'big.png', headerDecoder)
  assert.deepEqual(big, { ok: false, message: 'Background must be 5 MB or smaller.' })
  // Even a text file: the size rule comes before the signature rule.
  const text = checkBackground(Buffer.alloc(6 * MB, 0x61), 'notes.png', headerDecoder)
  assert.deepEqual(text, { ok: false, message: 'Background must be 5 MB or smaller.' })
  // 5 MB exactly is fine.
  assert.ok(checkBackground(fakePng(2000, 2000, 5 * MB - 33), 'ok.png', headerDecoder).ok)
})

test('a text file renamed to .png is not a PNG or JPG', () => {
  const text = Buffer.from('This is not a picture, only text with a picture name.')
  assert.deepEqual(checkBackground(text, 'fake.png', headerDecoder), {
    ok: false,
    message: 'Background must be a PNG or JPG.'
  })
  // A GIF and an empty file are not either.
  assert.equal(checkBackground(Buffer.from('GIF89a......'), 'x.png', headerDecoder).ok, false)
  assert.equal(checkBackground(Buffer.alloc(0), 'x.png', headerDecoder).ok, false)
})

test('a size outside 320x180 to 4000 on each side says which and gives the real size', () => {
  assert.deepEqual(checkBackground(fakePng(200, 100), 'tiny.png', headerDecoder), {
    ok: false,
    message: 'Background must be at least 320x180. tiny.png is 200x100.'
  })
  assert.deepEqual(checkBackground(fakePng(319, 400), 'narrow.png', headerDecoder), {
    ok: false,
    message: 'Background must be at least 320x180. narrow.png is 319x400.'
  })
  assert.deepEqual(checkBackground(fakePng(400, 179), 'flat.png', headerDecoder), {
    ok: false,
    message: 'Background must be at least 320x180. flat.png is 400x179.'
  })
  assert.deepEqual(checkBackground(fakeJpeg(4500, 3000), 'wide.jpg', headerDecoder), {
    ok: false,
    message: 'Background must be 4000 px or smaller on each side. wide.jpg is 4500x3000.'
  })
  assert.deepEqual(checkBackground(fakePng(2000, 4001), 'tall.png', headerDecoder), {
    ok: false,
    message: 'Background must be 4000 px or smaller on each side. tall.png is 2000x4001.'
  })
})

test('the size comes before the decoder, so a file that claims a huge picture is never decoded', () => {
  let decoded = 0
  const result = checkBackground(fakePng(30000, 30000), 'claim.png', (bytes) => {
    decoded += 1
    return headerDecoder(bytes)
  })
  assert.equal(result.ok, false)
  assert.equal(decoded, 0)
})

test('a picture the decoder cannot read gets the PNG or JPG message', () => {
  const result = checkBackground(fakePng(640, 360), 'broken.png', () => null)
  assert.deepEqual(result, { ok: false, message: 'Background must be a PNG or JPG.' })
  // A header the reader cannot make sense of (a JPEG with no frame) too.
  const noFrame = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0])
  assert.equal(checkBackground(noFrame, 'x.jpg', headerDecoder).ok, false)
})

test('the size the decoder reads is the one that counts', () => {
  // The header says 640x360, the decoder says 100x50.
  const result = checkBackground(fakePng(640, 360), 'liar.png', () => ({ width: 100, height: 50 }))
  assert.deepEqual(result, {
    ok: false,
    message: 'Background must be at least 320x180. liar.png is 100x50.'
  })
})
