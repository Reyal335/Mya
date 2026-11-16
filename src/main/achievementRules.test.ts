import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyProgressEvent,
  emptyBook,
  type AchievementBook,
  type ProgressEvent
} from './achievementRules.ts'

// Local times, so the night checks do not depend on the machine's time zone.
const noon = new Date(2026, 10, 17, 12, 0).getTime()
const threeAm = new Date(2026, 10, 17, 3, 0).getTime()
const nextNoon = new Date(2026, 10, 18, 12, 0).getTime()

function ended(extra: Partial<Extract<ProgressEvent, { type: 'task_ended' }>> = {}): ProgressEvent {
  return {
    type: 'task_ended',
    status: 'done',
    clean: true,
    denied: false,
    startedAt: noon - 60_000,
    at: noon,
    itemsTotal: 0,
    ...extra
  }
}

function run(
  events: ProgressEvent[],
  start: AchievementBook = emptyBook()
): { book: AchievementBook; unlocked: string[] } {
  let book = start
  const unlocked: string[] = []
  for (const event of events) {
    const result = applyProgressEvent(book, event)
    book = result.book
    unlocked.push(...result.unlocked)
  }
  return { book, unlocked }
}

test('FIRST QUEST: a task ending as done', () => {
  const { book, unlocked } = run([ended()])
  assert.ok(unlocked.includes('first-quest'))
  assert.equal(book.achievements['first-quest']?.unlockedAt, noon)
  assert.equal(book.achievements['first-quest']?.seen, false)
})

test('FIRST QUEST: error and stopped do not count', () => {
  assert.deepEqual(run([ended({ status: 'error' }), ended({ status: 'stopped' })]).unlocked, [])
})

test('PARTY OF 5: 5 agents in the party list', () => {
  const four = run([{ type: 'party_loaded', size: 4, runnable: [], at: noon }])
  assert.deepEqual(four.unlocked, [])
  assert.equal(four.book.achievements['party-of-5']?.progress, 4)
  const five = run([{ type: 'party_loaded', size: 5, runnable: [], at: noon }])
  assert.deepEqual(five.unlocked, ['party-of-5'])
})

test('NIGHT OWL: a task or a run done between 2:00 and 4:59', () => {
  assert.ok(run([ended({ at: threeAm })]).unlocked.includes('night-owl'))
  assert.deepEqual(run([{ type: 'run_ended', done: true, at: threeAm }]).unlocked, ['night-owl'])
  assert.deepEqual(run([{ type: 'run_ended', done: false, at: threeAm }]).unlocked, [])
  assert.deepEqual(run([{ type: 'run_ended', done: true, at: noon }]).unlocked, [])
  const five = new Date(2026, 10, 17, 5, 0).getTime()
  assert.deepEqual(run([{ type: 'run_ended', done: true, at: five }]).unlocked, [])
  const late = new Date(2026, 10, 17, 4, 59).getTime()
  assert.deepEqual(run([{ type: 'run_ended', done: true, at: late }]).unlocked, ['night-owl'])
})

test('FLAWLESS: 10 clean tasks in a row', () => {
  const nine = run(Array.from({ length: 9 }, () => ended()))
  assert.ok(!nine.unlocked.includes('flawless'))
  assert.equal(nine.book.achievements.flawless?.progress, 9)
  const ten = run([ended()], nine.book)
  assert.deepEqual(ten.unlocked, ['flawless'])
})

test('FLAWLESS: an error or a task without the clean bonus resets the streak; stopped does not', () => {
  const events = [
    ...Array.from({ length: 5 }, () => ended()),
    ended({ status: 'stopped' }),
    ended({ clean: false }),
    ...Array.from({ length: 5 }, () => ended())
  ]
  const { book, unlocked } = run(events)
  assert.ok(!unlocked.includes('flawless'))
  assert.equal(book.counters.streak, 5)
  assert.equal(run([ended({ status: 'error' })], book).book.counters.streak, 0)
})

test('FULL PARTY: every runnable agent called in one day, at least 2', () => {
  const party = ['a', 'b', 'c']
  const start = (agentKey: string, at = noon): ProgressEvent => ({
    type: 'task_started',
    agentKey,
    runnable: party,
    at
  })
  const two = run([start('a'), start('b'), start('a')])
  assert.deepEqual(two.unlocked, [])
  assert.equal(two.book.achievements['full-party']?.progress, 2)
  assert.deepEqual(run([start('c')], two.book).unlocked, ['full-party'])
  // A new day starts over.
  assert.deepEqual(run([start('c', nextNoon)], two.book).unlocked, [])
})

test('FULL PARTY: a party of one never unlocks it, and a party load checks too', () => {
  assert.deepEqual(
    run([{ type: 'task_started', agentKey: 'a', runnable: ['a'], at: noon }]).unlocked,
    []
  )
  const called = run([
    { type: 'task_started', agentKey: 'a', runnable: ['a', 'b', 'c'], at: noon },
    { type: 'task_started', agentKey: 'b', runnable: ['a', 'b', 'c'], at: noon }
  ])
  // c left the party, so everyone left has been called.
  assert.deepEqual(
    run([{ type: 'party_loaded', size: 2, runnable: ['a', 'b'], at: noon }], called.book).unlocked,
    ['full-party']
  )
})

test('FULL PARTY: a built-in agent does not count as called', () => {
  const { book } = run([{ type: 'task_started', agentKey: null, runnable: ['a', 'b'], at: noon }])
  assert.deepEqual(book.counters.calledToday, [])
})

test('HOARDER: 100 changed files over all agents', () => {
  const some = run([ended({ itemsTotal: 99 })])
  assert.ok(!some.unlocked.includes('hoarder'))
  assert.equal(some.book.achievements.hoarder?.progress, 99)
  assert.ok(run([ended({ itemsTotal: 100 })], some.book).unlocked.includes('hoarder'))
})

test('BOSS SLAYER: unlocked by a defeated boss (step 18)', () => {
  assert.deepEqual(run([{ type: 'boss_defeated', at: noon }]).unlocked, ['boss-slayer'])
})

test('SPEEDRUN: done in under 30 seconds', () => {
  assert.ok(run([ended({ startedAt: noon - 29_999 })]).unlocked.includes('speedrun'))
  assert.ok(!run([ended({ startedAt: noon - 30_000 })]).unlocked.includes('speedrun'))
  assert.ok(!run([ended({ status: 'error', startedAt: noon - 1 })]).unlocked.includes('speedrun'))
})

test('SECOND WIND: done after a denied request', () => {
  assert.ok(run([ended({ clean: false, denied: true })]).unlocked.includes('second-wind'))
  assert.ok(!run([ended({ status: 'error', denied: true })]).unlocked.includes('second-wind'))
})

test('Unlocks are never taken back, and progress stays at the goal', () => {
  const first = run([ended()])
  const again = run([ended({ status: 'error' }), ended()], first.book)
  assert.ok(!again.unlocked.includes('first-quest'))
  assert.equal(again.book.achievements['first-quest']?.unlockedAt, noon)
  const flawless = run(Array.from({ length: 10 }, () => ended()))
  const after = run([ended({ status: 'error' })], flawless.book)
  assert.equal(after.book.achievements.flawless?.progress, 10)
  assert.notEqual(after.book.achievements.flawless?.unlockedAt, null)
})

test('applyProgressEvent does not change the book it was given', () => {
  const start = emptyBook()
  run([ended(), { type: 'task_started', agentKey: 'a', runnable: ['a'], at: noon }], start)
  assert.deepEqual(start, emptyBook())
})
