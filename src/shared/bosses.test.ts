import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bossXp, DEFAULT_BOSSES, readBossManifest } from './bosses.ts'

const assets = join(import.meta.dirname, '..', 'renderer', 'src', 'assets', 'bosses')

test('the default packs match their manifests and pass the pack rules', () => {
  for (const boss of DEFAULT_BOSSES) {
    const raw = JSON.parse(readFileSync(join(assets, boss.id, 'manifest.json'), 'utf8')) as unknown
    const read = readBossManifest(raw)
    assert.ok(read.ok, boss.id)
    assert.equal(read.manifest.name, boss.name)
    assert.equal(read.manifest.accent, boss.accent)
    assert.equal(read.manifest.states.defeated?.frames, 4)
  }
})

test('readBossManifest: refuses a broken manifest with a reason', () => {
  const good = {
    version: 1,
    name: 'Test Boss',
    accent: '#123abc',
    background: 'bg.jpg',
    states: { idle: { file: 'idle.png', frames: 2, fps: 3 } }
  }
  assert.ok(readBossManifest(good).ok)
  const cases: [unknown, string][] = [
    [{ ...good, version: 2 }, 'version 1'],
    [{ ...good, name: '' }, 'name'],
    [{ ...good, accent: 'red' }, 'accent'],
    [{ ...good, background: '../x.png' }, 'background'],
    [{ ...good, states: {} }, 'idle'],
    [{ ...good, states: { idle: { file: 'idle.gif', frames: 2, fps: 3 } } }, 'PNG'],
    [{ ...good, states: { idle: { file: 'idle.png', frames: 17, fps: 3 } } }, 'frames']
  ]
  for (const [raw, word] of cases) {
    const read = readBossManifest(raw)
    assert.ok(!read.ok && read.message.includes(word), `${word}: ${JSON.stringify(read)}`)
  }
})

test('bossXp: maxHp x 5, at most 500', () => {
  assert.equal(bossXp(40), 200)
  assert.equal(bossXp(500), 500)
  assert.equal(bossXp(0), 0)
})
