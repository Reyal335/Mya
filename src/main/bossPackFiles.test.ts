import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createBossFolder,
  listBossFolders,
  loadBossFolder,
  updateBossFolder,
  type PackDeps
} from './bossPackFiles.ts'
import { fakeJpeg, fakePng, headerDecoder } from './testImages.ts'

const deps: PackDeps = { decode: headerDecoder, stripUrl: (bytes) => `strip:${bytes.length}` }
const UUID_A = '3f2b8c1e-5a47-4b0e-9d1c-0a6f2e7b9c44'
const UUID_B = '9a1d2c3e-1b2c-4d5e-8f60-71829304a5b6'

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mya-boss-test-'))
}

async function put(folder: string, files: Record<string, Buffer | string>): Promise<void> {
  await mkdir(folder, { recursive: true })
  for (const [name, data] of Object.entries(files)) await writeFile(join(folder, name), data)
}

const manifest2 = {
  version: 2,
  name: 'Lint Goblin',
  accent: '#6FCF7F',
  background: 'background.png',
  // The manifest says 3 frames; the images below decide.
  idle: { file: 'idle.png', frames: 3, fps: 4 }
}

test('a format 2 pack loads: the image decides the frame count; the background is described', async () => {
  const root = await scratch()
  try {
    const folder = join(root, UUID_A)
    await put(folder, {
      'manifest.json': JSON.stringify(manifest2),
      'idle.png': fakePng(128, 64),
      'background.png': fakePng(320, 200)
    })
    const result = await loadBossFolder(UUID_A, folder, deps)
    assert.ok(result.ok)
    const { boss } = result
    assert.equal(boss.format, 2)
    assert.equal(boss.name, 'Lint Goblin')
    assert.equal(boss.accent, '#6FCF7F')
    assert.deepEqual(
      { ...boss.idle },
      { src: `strip:${fakePng(128, 64).length}`, frames: 2, fps: 4 }
    )
    assert.equal(boss.idleFile, 'idle.png')
    assert.equal(boss.background?.file, 'background.png')
    assert.equal(boss.background?.width, 320)
    assert.equal(boss.background?.height, 200)
    assert.ok(boss.background?.src.startsWith('data:image/png;base64,'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a format 2 pack with no background loads with background null', async () => {
  const root = await scratch()
  try {
    const folder = join(root, UUID_A)
    await put(folder, {
      'manifest.json': JSON.stringify({ ...manifest2, background: null }),
      'idle.png': fakePng(64, 64)
    })
    const result = await loadBossFolder(UUID_A, folder, deps)
    assert.ok(result.ok && result.boss.background === null && result.boss.idle.frames === 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a format 1 pack with four strips loads and uses its idle strip only', async () => {
  const root = await scratch()
  try {
    const folder = join(root, UUID_A)
    const loop = (file: string, frames: number, fps: number): object => ({ file, frames, fps })
    await put(folder, {
      'manifest.json': JSON.stringify({
        version: 1,
        name: 'The Old Boss',
        accent: '#b98cf0',
        background: 'background.jpg',
        states: {
          idle: loop('idle.png', 2, 3),
          hit: loop('hit.png', 2, 8),
          heal: loop('heal.png', 2, 6),
          defeated: loop('defeated.png', 4, 6)
        }
      }),
      'idle.png': fakePng(128, 64),
      // The other strips are junk, and one is missing: none of them is read.
      'hit.png': Buffer.from('not a png'),
      'defeated.png': fakePng(10, 10),
      'background.jpg': fakeJpeg(1920, 1080)
    })
    const result = await loadBossFolder(UUID_A, folder, deps)
    assert.ok(result.ok, JSON.stringify(result))
    assert.equal(result.boss.format, 1)
    assert.equal(result.boss.name, 'The Old Boss')
    assert.equal(result.boss.accent, '#B98CF0')
    assert.equal(result.boss.idle.frames, 2)
    assert.equal(result.boss.idle.fps, 3)
    assert.ok(result.boss.background?.src.startsWith('data:image/jpeg;base64,'))
    // Loading never rewrites a pack.
    assert.equal(JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')).version, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a pack that fails a rule is a problem with a reason, and never throws', async () => {
  const root = await scratch()
  try {
    const cases: [string, Record<string, Buffer | string>, string][] = [
      ['no manifest', { 'idle.png': fakePng(64, 64) }, 'manifest.json is missing.'],
      ['bad JSON', { 'manifest.json': '{ not json' }, 'not valid JSON'],
      [
        'unknown version',
        { 'manifest.json': JSON.stringify({ ...manifest2, version: 9 }) },
        'version 1 or 2'
      ],
      [
        'long name',
        { 'manifest.json': JSON.stringify({ ...manifest2, name: 'x'.repeat(25) }) },
        'at most 24'
      ],
      [
        'idle missing',
        { 'manifest.json': JSON.stringify(manifest2), 'background.png': fakePng(320, 200) },
        'idle.png is missing.'
      ],
      [
        'idle is not a PNG',
        {
          'manifest.json': JSON.stringify(manifest2),
          'idle.png': Buffer.from('nope, text'),
          'background.png': fakePng(320, 200)
        },
        'idle.png: Sheet must be a PNG file.'
      ],
      [
        'idle height',
        {
          'manifest.json': JSON.stringify(manifest2),
          'idle.png': fakePng(128, 32),
          'background.png': fakePng(320, 200)
        },
        'Height must be 64px. Yours is 32px.'
      ],
      [
        'idle width',
        {
          'manifest.json': JSON.stringify(manifest2),
          'idle.png': fakePng(100, 64),
          'background.png': fakePng(320, 200)
        },
        'multiple of 64'
      ],
      [
        'too many frames',
        {
          'manifest.json': JSON.stringify(manifest2),
          'idle.png': fakePng(17 * 64, 64),
          'background.png': fakePng(320, 200)
        },
        'at most 16 frames'
      ],
      [
        'idle over 3 MB',
        {
          'manifest.json': JSON.stringify(manifest2),
          'idle.png': fakePng(128, 64, 3 * 1024 * 1024),
          'background.png': fakePng(320, 200)
        },
        'Sheet must be under 3 MB'
      ],
      [
        'background missing',
        { 'manifest.json': JSON.stringify(manifest2), 'idle.png': fakePng(64, 64) },
        'background.png is missing.'
      ],
      [
        'background too small',
        {
          'manifest.json': JSON.stringify(manifest2),
          'idle.png': fakePng(64, 64),
          'background.png': fakePng(200, 100)
        },
        'at least 320x180. background.png is 200x100.'
      ],
      [
        'background over 5 MB',
        {
          'manifest.json': JSON.stringify(manifest2),
          'idle.png': fakePng(64, 64),
          'background.png': fakePng(2000, 2000, 5 * 1024 * 1024)
        },
        '5 MB or smaller'
      ]
    ]
    for (const [name, files, reason] of cases) {
      const id = UUID_A
      const folder = join(root, name.replace(/\W/g, '-'))
      await put(folder, files)
      const result = await loadBossFolder(id, folder, deps)
      assert.ok(!result.ok && result.problem.includes(reason), `${name}: ${JSON.stringify(result)}`)
    }
    // A folder that does not exist is a problem too.
    const missing = await loadBossFolder(UUID_A, join(root, 'nothing-here'), deps)
    assert.ok(!missing.ok)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('listBossFolders: UUID folders oldest first, other names skipped, leftovers removed', async () => {
  const root = await scratch()
  try {
    await put(join(root, UUID_B), { 'a.txt': 'x' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    await put(join(root, UUID_A), { 'a.txt': 'x' })
    await put(join(root, 'my-boss'), { 'a.txt': 'x' })
    await put(join(root, `.tmp-${UUID_A}`), { 'a.txt': 'x' })
    await writeFile(join(root, 'stray-file.txt'), 'x')
    const listed = await listBossFolders(root)
    assert.deepEqual(listed.ids, [UUID_B, UUID_A])
    assert.deepEqual(listed.skipped, ['my-boss'])
    assert.ok(!existsSync(join(root, `.tmp-${UUID_A}`)))
    // No folder at all is an empty list.
    assert.deepEqual(await listBossFolders(join(root, 'absent')), { ids: [], skipped: [] })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('create writes the strip, the background as picked, and a format 2 manifest, then renames in', async () => {
  const root = await scratch()
  try {
    const idle = fakePng(128, 64)
    const background = fakeJpeg(1920, 1080, 500)
    await createBossFolder(root, UUID_A, {
      name: 'Lint Goblin',
      accent: '#6FCF7F',
      fps: 4,
      idle: { type: 'write', bytes: idle, frames: 2 },
      background: { type: 'write', bytes: background, kind: 'jpeg' }
    })
    assert.deepEqual((await readdir(root)).sort(), [UUID_A])
    assert.deepEqual((await readdir(join(root, UUID_A))).sort(), [
      'background.jpg',
      'idle.png',
      'manifest.json'
    ])
    // Byte for byte as uploaded.
    assert.ok((await readFile(join(root, UUID_A, 'background.jpg'))).equals(background))
    assert.ok((await readFile(join(root, UUID_A, 'idle.png'))).equals(idle))
    const written = JSON.parse(await readFile(join(root, UUID_A, 'manifest.json'), 'utf8'))
    assert.deepEqual(written, {
      version: 2,
      name: 'Lint Goblin',
      accent: '#6FCF7F',
      background: 'background.jpg',
      idle: { file: 'idle.png', frames: 2, fps: 4 }
    })
    // And it loads back.
    const loaded = await loadBossFolder(UUID_A, join(root, UUID_A), deps)
    assert.ok(loaded.ok && loaded.boss.background?.width === 1920)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('create with no background writes none, and a failed create leaves no folder behind', async () => {
  const root = await scratch()
  try {
    await createBossFolder(root, UUID_A, {
      name: 'Plain',
      accent: '#F0706A',
      fps: 4,
      idle: { type: 'write', bytes: fakePng(64, 64), frames: 1 },
      background: { type: 'none' }
    })
    assert.deepEqual((await readdir(join(root, UUID_A))).sort(), ['idle.png', 'manifest.json'])
    const written = JSON.parse(await readFile(join(root, UUID_A, 'manifest.json'), 'utf8'))
    assert.equal(written.background, null)
    // The target is a folder that already has things in it: the rename fails and the temporary
    // folder goes.
    await put(join(root, UUID_B), { 'keep.txt': 'in the way' })
    await assert.rejects(
      createBossFolder(root, UUID_B, {
        name: 'X',
        accent: '#F0706A',
        fps: 4,
        idle: { type: 'write', bytes: fakePng(64, 64), frames: 1 },
        background: { type: 'none' }
      })
    )
    assert.deepEqual((await readdir(root)).sort(), [UUID_A, UUID_B].sort())
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('update keeps what the draft keeps, replaces what it replaces, and deletes a removed background', async () => {
  const root = await scratch()
  try {
    const folder = join(root, UUID_A)
    const idle = fakePng(128, 64)
    await put(folder, {
      'manifest.json': JSON.stringify(manifest2),
      'idle.png': idle,
      'background.png': fakePng(320, 200)
    })
    // Keep both, change the name, accent, and speed.
    await updateBossFolder(
      folder,
      {
        name: 'Lint Goblin II',
        accent: '#F2B84B',
        fps: 6,
        idle: { type: 'keep', file: 'idle.png', frames: 2 },
        background: { type: 'keep', file: 'background.png' }
      },
      { idleFile: 'idle.png', backgroundFile: 'background.png' }
    )
    assert.ok((await readFile(join(folder, 'idle.png'))).equals(idle))
    assert.deepEqual(JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')), {
      version: 2,
      name: 'Lint Goblin II',
      accent: '#F2B84B',
      background: 'background.png',
      idle: { file: 'idle.png', frames: 2, fps: 6 }
    })
    // Replace the background with a JPG: the old PNG goes.
    await updateBossFolder(
      folder,
      {
        name: 'Lint Goblin II',
        accent: '#F2B84B',
        fps: 6,
        idle: { type: 'keep', file: 'idle.png', frames: 2 },
        background: { type: 'write', bytes: fakeJpeg(1920, 1080), kind: 'jpeg' }
      },
      { idleFile: 'idle.png', backgroundFile: 'background.png' }
    )
    assert.deepEqual((await readdir(folder)).sort(), [
      'background.jpg',
      'idle.png',
      'manifest.json'
    ])
    // Remove it: the file is deleted and the manifest says null.
    await updateBossFolder(
      folder,
      {
        name: 'Lint Goblin II',
        accent: '#F2B84B',
        fps: 6,
        idle: { type: 'keep', file: 'idle.png', frames: 2 },
        background: { type: 'none' }
      },
      { idleFile: 'idle.png', backgroundFile: 'background.jpg' }
    )
    assert.deepEqual((await readdir(folder)).sort(), ['idle.png', 'manifest.json'])
    const loaded = await loadBossFolder(UUID_A, folder, deps)
    assert.ok(loaded.ok && loaded.boss.background === null && loaded.boss.format === 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('saving a format 1 pack in the editor writes format 2 and keeps its idle file', async () => {
  const root = await scratch()
  try {
    const folder = join(root, UUID_A)
    await put(folder, {
      'manifest.json': JSON.stringify({
        version: 1,
        name: 'The Old Boss',
        accent: '#B98CF0',
        background: 'bg.PNG',
        states: { idle: { file: 'sheet.png', frames: 2, fps: 3 } }
      }),
      'sheet.png': fakePng(128, 64),
      'bg.PNG': fakePng(640, 360)
    })
    await updateBossFolder(
      folder,
      {
        name: 'The Old Boss',
        accent: '#B98CF0',
        fps: 3,
        idle: { type: 'keep', file: 'sheet.png', frames: 2 },
        background: { type: 'keep', file: 'bg.PNG' }
      },
      { idleFile: 'sheet.png', backgroundFile: 'bg.PNG' }
    )
    const written = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'))
    assert.equal(written.version, 2)
    assert.equal(written.idle.file, 'sheet.png')
    assert.equal(written.background, 'bg.PNG')
    assert.ok((await loadBossFolder(UUID_A, folder, deps)).ok)
    // Replacing the strip puts idle.png in and takes the old file name out.
    await updateBossFolder(
      folder,
      {
        name: 'The Old Boss',
        accent: '#B98CF0',
        fps: 3,
        idle: { type: 'write', bytes: fakePng(192, 64), frames: 3 },
        background: { type: 'keep', file: 'bg.PNG' }
      },
      { idleFile: 'sheet.png', backgroundFile: 'bg.PNG' }
    )
    assert.deepEqual((await readdir(folder)).sort(), ['bg.PNG', 'idle.png', 'manifest.json'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
