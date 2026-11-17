import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BOSS_ACCENTS,
  bossManifestText,
  bossNameError,
  bossXp,
  canLeavePool,
  DEFAULT_BOSSES,
  fightPack,
  isBossId,
  poolIds,
  readBossManifest,
  type BossPack
} from './bosses.ts'

const assets = join(import.meta.dirname, '..', 'renderer', 'src', 'assets', 'bosses')

test('the default packs are format 2, match their manifests, and carry only an idle strip', () => {
  for (const boss of DEFAULT_BOSSES) {
    const raw = JSON.parse(readFileSync(join(assets, boss.id, 'manifest.json'), 'utf8')) as unknown
    const read = readBossManifest(raw)
    assert.ok(read.ok, boss.id)
    assert.equal(read.format, 2, boss.id)
    assert.equal(read.manifest.name, boss.name)
    assert.equal(read.manifest.accent, boss.accent)
    assert.equal(read.manifest.idle.file, 'idle.png')
    assert.equal(read.manifest.background, 'background.png')
    // Exactly the manifest, the idle strip, and the background: no hit, heal, or defeated art.
    assert.deepEqual(readdirSync(join(assets, boss.id)).sort(), [
      'background.png',
      'idle.png',
      'manifest.json'
    ])
    assert.ok(existsSync(join(assets, boss.id, 'idle.png')))
  }
})

const goodV2 = {
  version: 2,
  name: 'Test Boss',
  accent: '#123abc',
  background: 'bg.jpg',
  idle: { file: 'idle.png', frames: 2, fps: 3 }
}

test('readBossManifest: format 2 reads, upper-cases the accent, and allows no background', () => {
  const read = readBossManifest(goodV2)
  assert.ok(read.ok)
  assert.equal(read.format, 2)
  assert.equal(read.manifest.accent, '#123ABC')
  const none = readBossManifest({ ...goodV2, background: null })
  assert.ok(none.ok && none.manifest.background === null)
})

test('readBossManifest: refuses a broken format 2 manifest with a reason', () => {
  const long = 'x'.repeat(25)
  const cases: [unknown, string][] = [
    [null, 'not an object'],
    [{ ...goodV2, version: 3 }, 'version 1 or 2'],
    [{ ...goodV2, name: '' }, 'Name is required'],
    [{ ...goodV2, name: '   ' }, 'Name is required'],
    [{ ...goodV2, name: long }, 'at most 24'],
    [{ ...goodV2, name: 'a\nb' }, 'line breaks'],
    [{ ...goodV2, accent: 'red' }, 'accent'],
    [{ ...goodV2, accent: '#12345' }, 'accent'],
    [{ ...goodV2, background: '../x.png' }, 'background'],
    [{ ...goodV2, background: 'bg.gif' }, 'background'],
    [{ ...goodV2, idle: undefined }, 'idle loop is required'],
    [{ ...goodV2, idle: { file: 'idle.gif', frames: 2, fps: 3 } }, 'PNG'],
    [{ ...goodV2, idle: { file: 'idle.png', frames: 17, fps: 3 } }, 'frames'],
    [{ ...goodV2, idle: { file: 'idle.png', frames: 2, fps: 0 } }, 'fps'],
    [{ ...goodV2, idle: { file: 'idle.png', frames: 2, fps: 31 } }, 'fps'],
    [{ ...goodV2, idle: { file: 'idle.png', frames: 2, fps: 2.5 } }, 'fps']
  ]
  for (const [raw, word] of cases) {
    const read = readBossManifest(raw)
    assert.ok(!read.ok && read.message.includes(word), `${word}: ${JSON.stringify(read)}`)
  }
})

test('readBossManifest: a format 1 pack loads with its idle state and ignores the rest', () => {
  const v1 = {
    version: 1,
    name: 'Older Boss ' + 'x'.repeat(21), // 32 characters, allowed in format 1
    accent: '#B98CF0',
    background: 'background.png',
    states: {
      idle: { file: 'idle.png', frames: 2, fps: 3 },
      hit: { file: 'hit.png', frames: 99, fps: 'fast' },
      heal: 'nonsense',
      defeated: { file: 'defeated.gif', frames: 4, fps: 6 }
    }
  }
  assert.equal(v1.name.length, 32)
  const read = readBossManifest(v1)
  assert.ok(read.ok)
  assert.equal(read.format, 1)
  assert.deepEqual(read.manifest.idle, { file: 'idle.png', frames: 2, fps: 3 })
  assert.equal(read.manifest.background, 'background.png')
  // Format 1 still needs its own things.
  for (const [raw, word] of [
    [{ ...v1, states: {} }, 'idle state is required'],
    [{ ...v1, states: undefined }, 'states'],
    [{ ...v1, background: null }, 'background'],
    [{ ...v1, name: 'x'.repeat(33) }, '1 to 32']
  ] as [unknown, string][]) {
    const bad = readBossManifest(raw)
    assert.ok(!bad.ok && bad.message.includes(word), `${word}: ${JSON.stringify(bad)}`)
  }
})

test('bossManifestText writes format 2 and reads back', () => {
  const text = bossManifestText({
    name: 'Lint Goblin',
    accent: '#6FCF7F',
    background: 'background.png',
    idle: { file: 'idle.png', frames: 2, fps: 4 }
  })
  assert.ok(text.endsWith('\n'))
  const json = JSON.parse(text) as Record<string, unknown>
  assert.equal(json.version, 2)
  assert.deepEqual(Object.keys(json), ['version', 'name', 'accent', 'background', 'idle'])
  const read = readBossManifest(json)
  assert.ok(read.ok && read.format === 2 && read.manifest.name === 'Lint Goblin')
  const none = readBossManifest(
    JSON.parse(
      bossManifestText({
        name: 'N',
        accent: '#F0706A',
        background: null,
        idle: { file: 'idle.png', frames: 1, fps: 4 }
      })
    )
  )
  assert.ok(none.ok && none.manifest.background === null)
})

test('bossNameError: 1 to 24 characters once trimmed', () => {
  assert.equal(bossNameError('Lint Goblin'), null)
  assert.equal(bossNameError('  Lint Goblin  '), null)
  assert.equal(bossNameError('x'.repeat(24)), null)
  assert.equal(bossNameError('x'.repeat(25)), 'Name must be at most 24 characters.')
  assert.equal(bossNameError('   '), 'Name is required.')
  assert.equal(bossNameError(''), 'Name is required.')
})

test('the editor offers eight accents, the first the default', () => {
  assert.equal(BOSS_ACCENTS.length, 8)
  assert.equal(BOSS_ACCENTS[0], '#F0706A')
})

test('isBossId: a UUID or a built-in id, nothing that could build another path', () => {
  assert.ok(isBossId('red-suite'))
  assert.ok(isBossId('3f2b8c1e-5a47-4b0e-9d1c-0a6f2e7b9c44'))
  for (const bad of ['', '..', '../x', 'a/b', 'abcd1234', 'RED-SUITE', 5, null, undefined]) {
    assert.ok(!isBossId(bad), String(bad))
  }
})

const ids = ['red-suite', 'flaky-golem', 'null-wraith', 'c1', 'c2']

test('poolIds: the valid bosses in the pool; every valid one when none is', () => {
  assert.deepEqual(poolIds(ids, []), ids)
  assert.deepEqual(poolIds(ids, ['red-suite', 'c1']), ['flaky-golem', 'null-wraith', 'c2'])
  // An id that is not a boss (deleted, or a stray) changes nothing.
  assert.deepEqual(poolIds(ids, ['gone']), ids)
  assert.deepEqual(poolIds(ids, ids), ids)
})

test('canLeavePool: at least one valid boss stays in', () => {
  assert.ok(canLeavePool(ids, [], 'red-suite'))
  const out = ['flaky-golem', 'null-wraith', 'c1', 'c2']
  assert.ok(!canLeavePool(ids, out, 'red-suite'))
  assert.ok(canLeavePool(ids, out, 'c2'))
  assert.ok(!canLeavePool(['only'], [], 'only'))
})

const pack = (id: string, name: string, accent: string): BossPack => ({
  id,
  name,
  accent,
  background: `${id}.png`,
  idle: { src: `${id}-idle`, frames: 2, fps: 3 }
})
const packs = [
  pack('red-suite', 'The Red Suite', '#F0706A'),
  pack('flaky-golem', 'The Flaky Golem', '#B98CF0'),
  pack('c1', 'Lint Goblin', '#6FCF7F')
]

test('fightPack: the boss itself while it exists', () => {
  const found = fightPack(packs, { bossId: 'c1', bossName: 'Old Name' })
  assert.equal(found?.id, 'c1')
  assert.equal(found?.name, 'Lint Goblin')
})

test('fightPack: a deleted boss is drawn as The Red Suite under the name the fight saved', () => {
  const found = fightPack(packs, { bossId: 'deleted', bossName: 'Lint Goblin' })
  assert.equal(found?.id, 'red-suite')
  assert.equal(found?.name, 'Lint Goblin')
  assert.equal(found?.accent, '#F0706A')
  assert.equal(found?.background, 'red-suite.png')
  assert.equal(found?.idle.src, 'red-suite-idle')
  // The pack itself is not changed.
  assert.equal(packs[0].name, 'The Red Suite')
  // A fight saved before the name was kept has none: it is called The Red Suite.
  assert.equal(fightPack(packs, { bossId: 'deleted', bossName: '' })?.name, 'The Red Suite')
  assert.equal(fightPack([], { bossId: 'deleted', bossName: 'x' }), null)
})

test('bossXp: maxHp x 5, at most 500', () => {
  assert.equal(bossXp(40), 200)
  assert.equal(bossXp(500), 500)
  assert.equal(bossXp(0), 0)
})
