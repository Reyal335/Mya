import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  boxStep,
  GUARD_MS,
  initialBoxState,
  isGuarded,
  isOpen,
  type BoxEvent,
  type BoxInputs,
  type BoxState
} from './dialogueCollapse.ts'

const idle: BoxInputs = { running: false, locked: false, reply: null }

function run(state: BoxState, ...events: BoxEvent[]): BoxState {
  return events.reduce(boxStep, state)
}

const scroll = (distance: number, user = true, guarded = false): BoxEvent => ({
  type: 'scroll',
  distance,
  user,
  guarded
})

const inputs = (patch: Partial<BoxInputs>): BoxEvent => ({ type: 'inputs', ...idle, ...patch })

const reply = (id: number, length: number): BoxInputs['reply'] => ({ id, length, instant: false })

test('every chat starts open, with AUTO on', () => {
  const state = initialBoxState(idle)
  assert.equal(isOpen(state), true)
  assert.equal(state.auto, true)
})

test('COLLAPSE and EXPAND work with AUTO on or off', () => {
  for (const auto of [true, false]) {
    const closed = run(initialBoxState(idle, auto), { type: 'collapse' })
    assert.equal(isOpen(closed), false)
    assert.equal(isOpen(run(closed, { type: 'expand' })), true)
  }
})

test('the guard lasts 300ms', () => {
  assert.equal(GUARD_MS, 300)
  assert.equal(isGuarded(1299, 1000 + GUARD_MS), true)
  assert.equal(isGuarded(1300, 1000 + GUARD_MS), false)
})

test('AUTO on: my scroll more than 48px out collapses, back within 8px opens', () => {
  let state = initialBoxState(idle)
  state = run(state, scroll(48))
  assert.equal(isOpen(state), true, '48 is not more than 48')
  state = run(state, scroll(49))
  assert.equal(isOpen(state), false)
  state = run(state, scroll(30))
  assert.equal(isOpen(state), false, 'between 8 and 48 changes nothing')
  state = run(state, scroll(9))
  assert.equal(isOpen(state), false)
  state = run(state, scroll(8))
  assert.equal(isOpen(state), true)
})

test('open stays open between 8 and 48', () => {
  const state = run(initialBoxState(idle), scroll(30), scroll(9), scroll(48))
  assert.equal(isOpen(state), true)
})

test('AUTO off: scrolling never opens or closes the box', () => {
  let state = initialBoxState(idle, false)
  state = run(state, scroll(500))
  assert.equal(isOpen(state), true)
  state = run(state, { type: 'collapse' }, scroll(0))
  assert.equal(isOpen(state), false)
})

test('a scroll the app made does not count, and neither does one inside the guard', () => {
  const open = initialBoxState(idle)
  assert.equal(isOpen(run(open, scroll(500, false))), true)
  assert.equal(isOpen(run(open, scroll(500, true, true))), true)
  const closed = run(open, { type: 'collapse' })
  assert.equal(isOpen(run(closed, scroll(0, false))), false)
  assert.equal(isOpen(run(closed, scroll(0, true, true))), false)
})

test('a scroll still measures the history when it does not count', () => {
  const state = run(initialBoxState(idle), scroll(500, false, true))
  assert.equal(state.far, true)
  assert.equal(state.atBottom, false)
  const back = run(state, scroll(0, false, true))
  assert.equal(back.far, false)
  assert.equal(back.atBottom, true)
})

test('an approval request opens the box at once, whatever AUTO says, and it stays open', () => {
  for (const auto of [true, false]) {
    const closed = run(initialBoxState(idle, auto), { type: 'collapse' })
    const asking = run(closed, inputs({ locked: true }))
    assert.equal(isOpen(asking), true)
    assert.equal(asking.locked, true)
    const answered = run(asking, inputs({ locked: false }))
    assert.equal(isOpen(answered), true)
    assert.equal(answered.open, true)
  }
})

test('while a request waits the box cannot be collapsed, by the button or by scrolling', () => {
  const asking = run(initialBoxState(idle), inputs({ locked: true }))
  assert.equal(run(asking, { type: 'collapse' }), asking)
  assert.equal(isOpen(run(asking, scroll(500))), true)
  assert.equal(isOpen(run(asking, scroll(500), inputs({ locked: false }))), true)
})

test('a request pending when the screen opens keeps the box open', () => {
  assert.equal(isOpen(initialBoxState({ ...idle, locked: true })), true)
})

test('a run starting opens the box and scrolls to the bottom, with AUTO on', () => {
  const closed = run(initialBoxState(idle), { type: 'collapse' })
  const started = run(closed, inputs({ running: true }))
  assert.equal(isOpen(started), true)
  assert.equal(started.pin, closed.pin + 1)
})

test('a run starting does nothing with AUTO off', () => {
  const closed = run(initialBoxState(idle, false), { type: 'collapse' })
  const started = run(closed, inputs({ running: true }))
  assert.equal(isOpen(started), false)
  assert.equal(started.pin, closed.pin)
})

test('a repeat of the same inputs changes nothing', () => {
  const started = run(initialBoxState(idle), inputs({ running: true }))
  assert.equal(run(started, inputs({ running: true })), started)
})

test('the first reply text of a run opens the box once, not every text after it', () => {
  let state = run(initialBoxState(idle), inputs({ running: true }))
  state = run(state, { type: 'collapse' })
  state = run(state, inputs({ running: true, reply: reply(1, 5) }))
  assert.equal(isOpen(state), true, 'the first reply text opens it')
  assert.equal(state.replyOpened, true)
  const pinned = state.pin
  // I read back: scrolling collapses it again.
  state = run(state, scroll(200))
  assert.equal(isOpen(state), false)
  // The reply grows, a tool runs, and more text follows in a new text item.
  state = run(state, inputs({ running: true, reply: reply(1, 40) }))
  state = run(state, inputs({ running: true, reply: null }))
  state = run(state, inputs({ running: true, reply: reply(2, 3) }))
  assert.equal(isOpen(state), false, 'the second text does not pull me back')
  assert.equal(state.pin, pinned)
  // The next run starts it all over.
  state = run(state, inputs({ running: false }), inputs({ running: true }))
  assert.equal(isOpen(state), true)
  assert.equal(state.replyOpened, false)
})

test('text that is loaded from a saved chat does not open the box', () => {
  const closed = run(initialBoxState(idle), { type: 'collapse' })
  // History loads with no run going, and its text is instant.
  const loaded = run(closed, inputs({ reply: { id: 4, length: 30, instant: true } }))
  assert.equal(isOpen(loaded), false)
  assert.equal(loaded.pin, closed.pin)
  assert.equal(loaded.unseen, false)
})

test('the first reply text does nothing with AUTO off', () => {
  let state = run(initialBoxState(idle, false), inputs({ running: true }))
  state = run(state, { type: 'collapse' })
  state = run(state, inputs({ running: true, reply: reply(1, 5) }))
  assert.equal(isOpen(state), false)
  assert.equal(state.pin, 0)
})

test('NEW shows when text arrives while collapsed and its end is out of view', () => {
  let state = run(initialBoxState(idle, false), { type: 'collapse' }, scroll(120, false))
  state = run(state, inputs({ running: true, reply: reply(1, 5) }))
  assert.equal(state.unseen, true)
  // Scrolling to the bottom clears it.
  assert.equal(run(state, scroll(0, false)).unseen, false)
  assert.equal(run(state, scroll(8, true)).unseen, false)
  // So does opening the box.
  assert.equal(run(state, { type: 'expand' }).unseen, false)
})

test('NEW does not show when the history is already at the bottom, or the box is open', () => {
  const atBottom = run(initialBoxState(idle, false), { type: 'collapse' })
  assert.equal(
    run(atBottom, inputs({ running: true, reply: reply(1, 5) })).unseen,
    false,
    'its end is in view in the LATEST copy'
  )
  const open = run(initialBoxState(idle, false), scroll(120, false))
  assert.equal(run(open, inputs({ running: true, reply: reply(1, 5) })).unseen, false)
})

test('NEW comes again as the same reply grows, and for a new text item', () => {
  let state = run(initialBoxState(idle, false), { type: 'collapse' }, scroll(120, false))
  state = run(state, inputs({ running: true, reply: reply(1, 5) }))
  assert.equal(state.unseen, true)
  // I scroll to the bottom (NEW clears) and away again.
  state = run(state, scroll(0, false), scroll(120, false))
  assert.equal(state.unseen, false)
  assert.equal(run(state, inputs({ running: true, reply: reply(1, 5) })).unseen, false, 'no growth')
  assert.equal(run(state, inputs({ running: true, reply: reply(1, 9) })).unseen, true)
  assert.equal(run(state, inputs({ running: true, reply: reply(2, 2) })).unseen, true)
})

test('↓ LATEST opens the box with AUTO on, and only scrolls with AUTO off', () => {
  const closedOn = run(initialBoxState(idle), { type: 'collapse' })
  assert.equal(isOpen(run(closedOn, { type: 'latest' })), true)
  const closedOff = run(initialBoxState(idle, false), { type: 'collapse' })
  assert.equal(isOpen(run(closedOff, { type: 'latest' })), false)
})

test('far says when ↓ LATEST shows, open or collapsed', () => {
  let state = initialBoxState(idle)
  assert.equal(state.far, false)
  state = run(state, scroll(49, false))
  assert.equal(state.far, true)
  assert.equal(isOpen(state), true)
  state = run(state, scroll(48, false))
  assert.equal(state.far, false)
})

test('NEW CHAT starts open again and keeps the AUTO choice', () => {
  const closed = run(initialBoxState(idle, false), { type: 'collapse' })
  const fresh = run(closed, { type: 'reset' })
  assert.equal(isOpen(fresh), true)
  assert.equal(fresh.auto, false)
})

test('AUTO can be switched', () => {
  const off = run(initialBoxState(idle), { type: 'auto', on: false })
  assert.equal(off.auto, false)
  assert.equal(run(off, { type: 'auto', on: false }), off)
})
