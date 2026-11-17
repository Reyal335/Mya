// Writes a web favicon set from the same pixel art as the app icon
// (scripts/make-icon.mjs). Run it with `node scripts/make-favicon.mjs`.
// Self-contained on purpose: importing make-icon.mjs would also re-run its
// own top-level file writes, since it has no execution guard.

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const ART = [
  '.......WWWW.....',
  '......WWWWWW....',
  '..WWW.WWWWWWW...',
  '.WWWWWWWWWWWWW..',
  '.WWWWWWWWWWWWWW.',
  'WWWWWWWWWWWWWWWW',
  'WWWWNNWWWWNNWWWW',
  'WWWWNNWWWWNNWWWW',
  'WWTTWWWNNWWWTTWW',
  'WWWWWWWWWWWWWWWW',
  '.WWWWWWWWWWWWWW.',
  '..TTTTTTTTTTTT..'
]

const ART_WIDTH = 16
const ART_HEIGHT = 12

const COLORS = {
  '.': [0x1c, 0x25, 0x41],
  W: [0xf2, 0xf4, 0xf8],
  N: [0x0b, 0x13, 0x2b],
  T: [0x5b, 0xc0, 0xbe]
}

// Icon size in pixels -> whole-number scale of one art pixel.
const SCALES = { 16: 1, 32: 2, 48: 2, 180: 11 }

const ICO_SIZES = [16, 32, 48]

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'favicon')

// Opaque RGBA rows, each starting with PNG's filter byte (0 = none).
function renderRows(size) {
  const scale = SCALES[size]
  const offsetX = (size - ART_WIDTH * scale) / 2
  const offsetY = (size - ART_HEIGHT * scale) / 2
  const stride = 1 + size * 4
  const rows = Buffer.alloc(stride * size)

  for (let y = 0; y < size; y++) {
    const artY = Math.floor((y - offsetY) / scale)
    for (let x = 0; x < size; x++) {
      const artX = Math.floor((x - offsetX) / scale)
      const [r, g, b] = COLORS[ART[artY]?.[artX] ?? '.']
      const at = y * stride + 1 + x * 4
      rows[at] = r
      rows[at + 1] = g
      rows[at + 2] = b
      rows[at + 3] = 255
    }
  }
  return rows
}

function pngChunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bits per channel
  header[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(renderRows(size), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function encodeIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(ICO_SIZES.length, 4)

  const images = ICO_SIZES.map((size) => pngs.get(size))
  let offset = header.length + 16 * ICO_SIZES.length
  const entries = ICO_SIZES.map((size, i) => {
    const entry = Buffer.alloc(16)
    entry[0] = size % 256 // a width or height of 0 means 256
    entry[1] = size % 256
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(images[i].length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += images[i].length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images])
}

const pngs = new Map(Object.keys(SCALES).map((size) => [Number(size), encodePng(Number(size))]))

mkdirSync(OUT_DIR, { recursive: true })

const outputs = {
  'favicon.ico': encodeIco(pngs),
  'favicon-16x16.png': pngs.get(16),
  'favicon-32x32.png': pngs.get(32),
  'apple-touch-icon.png': pngs.get(180)
}

for (const [file, data] of Object.entries(outputs)) {
  writeFileSync(join(OUT_DIR, file), data)
  console.log(`favicon/${file} (${data.length} bytes)`)
}
