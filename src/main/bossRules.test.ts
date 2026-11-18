import { test } from 'node:test'
import assert from 'node:assert/strict'
import { poolIds, type Fight } from '../shared/bosses.ts'
import type { TestRun } from '../shared/testRuns.ts'
import {
  applyRun,
  escapeFight,
  forgetConversation,
  isFullRun,
  pickBoss,
  pickLineup,
  resumeFight,
  startFight,
  withAttacker,
  type Attacker,
  type TestRunInput
} from './bossRules.ts'

const BOSS = 'The Red Suite'
const builder: Attacker = { id: 'C:/p/.claude/agents/builder.md', name: 'builder' }
const scout: Attacker = { id: 'C:/p/.claude/agents/scout.md', name: 'scout' }
const party: Attacker[] = [
  builder,
  scout,
  { id: 'C:/g/a.md', name: 'a' },
  { id: 'C:/g/b.md', name: 'b' },
  { id: 'C:/g/c.md', name: 'c' }
]
const fixed = (): number => 0

// A named run: failing tests as [file, name], plus counts.
function named(failing: [string, string][], total: number, files?: string[]): TestRun {
  const listed = files ?? [...new Set(failing.map(([file]) => file))]
  return {
    runner: 'jest',
    total,
    passed: total - failing.length,
    failed: failing.length,
    skipped: 0,
    failing: failing.map(([file, name]) => ({ file, name })),
    passing: [],
    files: listed.map((file) => ({
      file,
      failed: failing.filter(([f]) => f === file).length,
      total: null
    })),
    parsed: 'full'
  }
}

function summary(failed: number, passed: number): TestRun {
  return {
    runner: 'jest',
    total: failed + passed,
    passed,
    failed,
    skipped: 0,
    failing: [],
    passing: [],
    files: [],
    parsed: 'summary'
  }
}

let clock = 1000
function input(run: TestRun, command = 'npm test', attacker = builder, exitCode = 1): TestRunInput {
  clock += 1000
  return { run, command, exitCode, attacker, toolId: `tool-${clock}`, taskId: 'task-1', at: clock }
}

// 8 of 40 failing: 5 in a.test.js, 3 in b.test.js.
const EIGHT: [string, string][] = [
  ['a.test.js', 'a1'],
  ['a.test.js', 'a2'],
  ['a.test.js', 'a3'],
  ['a.test.js', 'a4'],
  ['a.test.js', 'a5'],
  ['b.test.js', 'b1'],
  ['b.test.js', 'b2'],
  ['b.test.js', 'b3']
]

function encounter(): Fight {
  const started = startFight(
    { key: 'k', projectPath: 'C:/p', sessionId: 's', bossId: 'red-suite', bossName: BOSS, party },
    input(named(EIGHT, 40)),
    fixed
  )
  assert.ok(started)
  return started.fight
}

test('encounter: hp is what fails, maxHp the whole suite', () => {
  const fight = encounter()
  assert.equal(fight.status, 'active')
  assert.equal(fight.hp, 8)
  assert.equal(fight.maxHp, 40)
  assert.equal(fight.round, 1)
  assert.deepEqual(fight.log, ['A wild The Red Suite appears! 8 of 40 tests left.'])
  assert.deepEqual(fight.files['a.test.js'].failing, ['a1', 'a2', 'a3', 'a4', 'a5'])
  assert.equal(fight.notices[0].kind, 'encounter')
  assert.equal(fight.notices[0].taskId, 'task-1')
})

test('encounter: a passing run still appears, already defeated', () => {
  const started = startFight(
    { key: 'k', projectPath: 'C:/p', sessionId: 's', bossId: 'x', bossName: BOSS, party },
    input(named([], 40), 'npm test', builder, 0),
    fixed
  )
  assert.equal(started.fight.status, 'defeated')
  assert.equal(started.fight.hp, 0)
  assert.equal(started.fight.maxHp, 40)
  assert.deepEqual(started.fight.log, [
    'A wild The Red Suite appears! 0 of 40 tests left.',
    'The Red Suite is defeated! All 40 tests pass.'
  ])
  assert.equal(started.fight.finalHit, builder.id)
  assert.equal(started.round.kind, 'encounter')
})

test('encounter: exit code only, with an unknown total', () => {
  const run: TestRun = {
    ...summary(0, 0),
    total: null,
    passed: null,
    failed: null,
    parsed: 'exit-code'
  }
  const started = startFight(
    { key: 'k', projectPath: 'C:/p', sessionId: 's', bossId: 'x', bossName: BOSS, party },
    input(run),
    fixed
  )
  assert.ok(started)
  assert.equal(started.fight.hp, 1)
  assert.equal(started.fight.maxHp, 1)
})

test('lineup: the attacker first and active, then up to 3 others', () => {
  const fight = encounter()
  assert.equal(fight.lineup.length, 4)
  assert.equal(fight.lineup[0].id, builder.id)
  assert.equal(fight.active, builder.id)
  assert.equal(new Set(fight.lineup.map((m) => m.id)).size, 4)
  assert.equal(pickLineup(builder, [builder], fixed).length, 1)
})

test('a full round with named hits', () => {
  const fixedSix = EIGHT.slice(6) // b2, b3 still fail; a1..a5 and b1 now pass
  const { fight, round } = applyRun(
    encounter(),
    input(named(fixedSix, 40, ['a.test.js', 'b.test.js'])),
    BOSS
  )
  assert.equal(round.hits.length, 6)
  assert.deepEqual(
    round.hits.map((h) => h.name),
    ['a1', 'a2', 'a3', 'a4', 'a5', 'b1']
  )
  assert.deepEqual(round.clearedFiles, ['a.test.js'])
  assert.equal(fight.hp, 2)
  assert.equal(fight.round, 2)
  assert.equal(fight.lineup[0].energy, 6)
  assert.equal(fight.log.at(-1), '6 hit combo! 2 of 40 tests left.')
  assert.equal(round.stillFailingCount, 2)
})

test('a full run that does not list a file counts it as passing', () => {
  // Only b.test.js is in the output now: a.test.js passes entirely.
  const { fight, round } = applyRun(
    encounter(),
    input(named(EIGHT.slice(5), 40, ['b.test.js'])),
    BOSS
  )
  assert.equal(round.hits.length, 5)
  assert.equal(fight.hp, 3)
  assert.equal(fight.files['a.test.js'], undefined)
})

test('a round with a regression heals the boss', () => {
  const run = named([...EIGHT.slice(1), ['c.test.js', 'c1']], 40)
  const { fight, round } = applyRun(encounter(), input(run), BOSS)
  assert.equal(round.hits.length, 1)
  assert.deepEqual(round.heals, [{ file: 'c.test.js', name: 'c1' }])
  assert.deepEqual(round.brokenFiles, ['c.test.js'])
  assert.equal(fight.hp, 8)
  assert.equal(fight.lineup[0].health, 95)
  assert.equal(
    fight.log.at(-1),
    '1 hit combo! 8 of 40 tests left. The Red Suite healed 1! c.test.js broke.'
  )
})

test('health never drops below 40', () => {
  let fight = encounter()
  for (let i = 0; i < 20; i++) {
    const broken: [string, string][] = [...EIGHT, ['z.test.js', `z${i}`]]
    fight = applyRun(fight, input(named(broken, 40)), BOSS).fight
  }
  assert.equal(fight.lineup[0].health, 40)
})

test('a partial run only updates the files it ran', () => {
  // npx jest a.test.js: 2 of a's 5 now pass. b is not in this output.
  const run = named(EIGHT.slice(2, 5), 12, ['a.test.js'])
  const { fight, round } = applyRun(encounter(), input(run, 'npx jest a.test.js'), BOSS)
  assert.equal(round.hits.length, 2)
  assert.deepEqual(fight.files['b.test.js'].failing, ['b1', 'b2', 'b3'])
  assert.equal(fight.hp, 6)
  assert.equal(fight.maxHp, 40)
})

test('a summary-only partial run changes nothing', () => {
  const { fight, round } = applyRun(encounter(), input(summary(1, 11), 'npx jest a.test.js'), BOSS)
  assert.equal(round.kind, 'partial')
  assert.equal(fight.hp, 8)
  assert.equal(
    fight.log.at(-1),
    'Partial run: 11 / 12 passed. It counts once a full run confirms it.'
  )
})

test('a summary-only full run deals damage from the counts', () => {
  const { fight, round } = applyRun(encounter(), input(summary(3, 37)), BOSS)
  assert.equal(round.hits.length, 5)
  assert.ok(round.hits.every((h) => h.name === null))
  assert.equal(fight.hp, 3)
})

test('a summary-only full run with no change keeps the failing names', () => {
  // Claude re-runs the suite through a filter that keeps only the summary lines.
  const { fight, round } = applyRun(
    encounter(),
    input(summary(8, 32), 'npm test 2>&1 | tail -5'),
    BOSS
  )
  assert.equal(round.hits.length, 0)
  assert.equal(fight.hp, 8)
  assert.deepEqual(fight.files['a.test.js'].failing, ['a1', 'a2', 'a3', 'a4', 'a5'])
  assert.ok(round.stillFailing.every((t) => t.name !== null))
  // A later named run still scores named hits.
  const next = applyRun(fight, input(named(EIGHT.slice(1), 40)), BOSS)
  assert.deepEqual(next.round.hits, [{ file: 'a.test.js', name: 'a1' }])
})

test('a full run with a bigger suite grows maxHp', () => {
  const { fight } = applyRun(encounter(), input(named(EIGHT, 46)), BOSS)
  assert.equal(fight.maxHp, 46)
  assert.equal(fight.hp, 8)
})

test('isFullRun: the same command, or a total that covers the suite', () => {
  const fight = { maxHp: 40, command: 'npm test' }
  assert.ok(isFullRun(fight, summary(1, 1), '  npm   test '))
  assert.ok(isFullRun(fight, summary(1, 39), 'npx jest'))
  assert.ok(!isFullRun(fight, summary(1, 10), 'npm test -- a.test.js'))
})

test('victory: a full run with nothing failing', () => {
  const after = applyRun(encounter(), input(named(EIGHT.slice(6), 40)), BOSS).fight
  const { fight, round } = applyRun(after, input(named([], 40), 'npm test', scout, 0), BOSS)
  assert.equal(fight.status, 'defeated')
  assert.equal(fight.hp, 0)
  assert.equal(fight.finalHit, scout.id)
  assert.equal(round.kind, 'victory')
  assert.equal(round.hits.length, 2)
  assert.equal(fight.log.at(-1), 'The Red Suite is defeated! All 40 tests pass.')
  // The final hitter joined the lineup.
  assert.ok(fight.lineup.some((m) => m.id === scout.id && m.hits === 2))
})

test('a passing partial run is not a victory', () => {
  const { fight } = applyRun(
    encounter(),
    input(named([], 5, ['a.test.js']), 'npx jest a.test.js', builder, 0),
    BOSS
  )
  assert.equal(fight.status, 'active')
  assert.equal(fight.hp, 3)
})

test('escape on STOP or the end of the run, while HP is left', () => {
  const fight = escapeFight(encounter(), BOSS, 9999)
  assert.ok(fight)
  assert.equal(fight.status, 'escaped')
  assert.equal(fight.log.at(-1), 'The Red Suite got away. 8 tests still failing.')
  assert.equal(escapeFight(fight, BOSS, 10000), null)
})

test('FIGHT ON: the same boss, HP, and lineup', () => {
  const escaped = escapeFight(encounter(), BOSS, 9999)!
  const resumed = resumeFight(escaped)
  assert.ok(resumed)
  assert.equal(resumed.status, 'active')
  assert.equal(resumed.hp, 8)
  assert.equal(resumed.bossId, 'red-suite')
  assert.deepEqual(resumed.lineup, escaped.lineup)
  assert.equal(resumeFight(resumed), null)
})

test('a test run after an escape brings the boss back and counts', () => {
  const escaped = escapeFight(encounter(), BOSS, 9999)!
  const { fight } = applyRun(escaped, input(named(EIGHT.slice(1), 40)), BOSS)
  assert.equal(fight.status, 'active')
  assert.equal(fight.hp, 7)
  assert.ok(fight.log.includes('The Red Suite is back! 8 of 40 tests left.'))
})

test('a later attacker replaces the member with the least energy', () => {
  let lineup = encounter().lineup.map((m, i) => ({ ...m, energy: 10 - i }))
  lineup = withAttacker(lineup, { id: 'new', name: 'new' })
  assert.equal(lineup.length, 4)
  assert.equal(lineup[3].id, 'new')
  assert.equal(withAttacker(lineup, builder), lineup)
})

test('pickBoss: never the last one when there is a choice', () => {
  const ids = ['red-suite', 'flaky-golem', 'null-wraith']
  for (let i = 0; i < 30; i++) {
    assert.notEqual(
      pickBoss(ids, 'flaky-golem', () => i / 30),
      'flaky-golem'
    )
  }
  assert.equal(pickBoss(['only'], 'only', Math.random), 'only')
  assert.equal(pickBoss([], null, Math.random), null)
})

test('a new fight saves the boss name, and a round keeps it current', () => {
  const fight = encounter()
  assert.equal(fight.bossName, BOSS)
  // The boss was renamed: the next round says so. Once it is deleted the caller passes the saved
  // name back, so the fight keeps using it.
  const renamed = applyRun(fight, input(named(EIGHT.slice(0, 7), 40)), 'Lint Goblin')
  assert.equal(renamed.fight.bossName, 'Lint Goblin')
  assert.ok(renamed.fight.log.at(-1)?.includes('hit combo'))
  const deleted = applyRun(renamed.fight, input(named(EIGHT, 40)), renamed.fight.bossName)
  assert.equal(deleted.fight.bossName, 'Lint Goblin')
  assert.ok(deleted.fight.log.at(-1)?.includes('Lint Goblin healed 1!'))
  // The boss going away changes none of the fight numbers.
  assert.equal(deleted.fight.round, 3)
  assert.equal(deleted.fight.hp, 8)
  assert.equal(deleted.fight.maxHp, 40)
  assert.equal(deleted.fight.bossId, 'red-suite')
})

test('the pool: a fight only ever draws a boss that is in it', () => {
  const valid = ['red-suite', 'flaky-golem', 'null-wraith', 'c1']
  const out = ['red-suite', 'c1']
  for (let i = 0; i < 40; i++) {
    const picked = pickBoss(poolIds(valid, out), null, () => i / 40)
    assert.ok(picked === 'flaky-golem' || picked === 'null-wraith', String(picked))
  }
})

test('the pool: the last boss is left out when two or more are in, and kept when one is', () => {
  const valid = ['red-suite', 'flaky-golem', 'null-wraith']
  for (let i = 0; i < 30; i++) {
    const picked = pickBoss(poolIds(valid, ['null-wraith']), 'flaky-golem', () => i / 30)
    assert.equal(picked, 'red-suite')
  }
  // One boss in the pool, and it was the last: it comes again.
  assert.equal(
    pickBoss(poolIds(valid, ['red-suite', 'null-wraith']), 'flaky-golem', fixed),
    'flaky-golem'
  )
  // Nothing in the pool: every valid boss is.
  const all = poolIds(valid, valid)
  assert.deepEqual(all, valid)
  assert.ok(valid.includes(pickBoss(all, null, fixed) ?? ''))
})

test('NEW CHAT removes the conversation fight', () => {
  const fight = encounter()
  const fights = { k: fight, other: { ...fight, key: 'other' } }
  const left = forgetConversation(fights, 'k')
  assert.deepEqual(Object.keys(left), ['other'])
})
