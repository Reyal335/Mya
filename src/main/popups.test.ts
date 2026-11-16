import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FINISHED_MS,
  actAllowed,
  initialState,
  offeredActions,
  step,
  viewOf,
  type PopupEvent,
  type PopupNotice,
  type PopupState
} from './popups.ts'

const achievement = (id: string): PopupNotice => ({
  id,
  kind: 'achievement',
  name: 'FIRST QUEST',
  reward: { kind: 'title', id: 'rookie', name: 'Rookie' },
  open: { screen: 'chat' }
})

function run(events: PopupEvent[], now = 0, start: PopupState = initialState()): PopupState {
  return events.reduce((state, event) => step(state, event, now), start)
}

test('achievement popup: shows in the background with EQUIP and LATER', () => {
  const state = run([
    { type: 'background', background: true },
    { type: 'achievement', notice: achievement('a1') }
  ])
  const view = viewOf(state)
  assert.deepEqual(view, {
    id: 'a1',
    kind: 'achievement',
    name: 'FIRST QUEST',
    reward: { kind: 'title', id: 'rookie', name: 'Rookie' }
  })
  assert.deepEqual(offeredActions(view!), ['equip', 'dismiss'])
  assert.ok(actAllowed(state, 'a1', 'equip'))
  assert.ok(!actAllowed(state, 'a1', 'open'))
})

test('achievement popup: never shows in front or with popups off', () => {
  assert.equal(viewOf(run([{ type: 'achievement', notice: achievement('a1') }])), null)
  const off = run([
    { type: 'background', background: true },
    { type: 'enabled', enabled: false },
    { type: 'achievement', notice: achievement('a1') }
  ])
  assert.equal(viewOf(off), null)
})

test('achievement popup: queues behind a popup on screen and times out like a finished one', () => {
  const finished: PopupNotice = {
    id: 'f1',
    kind: 'finished',
    who: { kind: 'speaker' },
    text: 'Done.',
    open: { screen: 'chat' }
  }
  let state = run([
    { type: 'background', background: true },
    { type: 'run_ended', runId: 'r', notice: finished },
    { type: 'achievement', notice: achievement('a1') }
  ])
  assert.equal(viewOf(state)?.id, 'f1')
  state = step(state, { type: 'timer' }, FINISHED_MS)
  assert.equal(viewOf(state)?.id, 'a1')
  state = step(state, { type: 'timer' }, FINISHED_MS * 2)
  assert.equal(viewOf(state), null)
})

test('achievement popup: EQUIP and LATER both close it', () => {
  for (const action of ['equip', 'dismiss'] as const) {
    const state = run([
      { type: 'background', background: true },
      { type: 'achievement', notice: achievement('a1') },
      { type: 'act', id: 'a1', action }
    ])
    assert.equal(viewOf(state), null)
  }
})

test('finished popup: carries its loot to the view', () => {
  const loot = {
    items: 2,
    added: 6,
    removed: 1,
    found: 0,
    first: [{ path: 'todo.md', isNew: true }],
    xp: 85,
    levelUp: false
  }
  const state = run([
    { type: 'background', background: true },
    {
      type: 'run_ended',
      runId: 'r',
      notice: {
        id: 'f1',
        kind: 'finished',
        who: { kind: 'agent', name: 'Builder', icon: null },
        text: 'Done.',
        open: { screen: 'inbox', taskId: 't' },
        loot
      }
    }
  ])
  const view = viewOf(state)
  assert.ok(view && view.kind === 'finished' && view.loot?.xp === 85)
})
