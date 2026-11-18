import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ASKING_LINE, barView, IDLE_PROMPT, type BarInput, type BarView } from './dialogueBar.ts'

const base: BarInput = {
  state: 'idle',
  kind: 'idle',
  typing: false,
  firstLine: '',
  typedLine: '',
  working: '',
  notice: null,
  empty: false
}

const view = (patch: Partial<BarInput>): BarView => barView({ ...base, ...patch })

test('idle before anything was sent: the prompt, muted', () => {
  const bar = view({ empty: true })
  assert.equal(bar.chip, 'IDLE')
  assert.deepEqual(bar.line, { type: 'text', text: IDLE_PROMPT, tone: 'muted', cursor: false })
  assert.equal(bar.fullReplyNote, false)
})

test('idle with nothing to show: an empty line', () => {
  assert.deepEqual(view({}).line, { type: 'text', text: '', tone: 'muted', cursor: false })
})

test('idle after a reply: the first line, and the note', () => {
  const bar = view({ kind: 'reply', firstLine: 'Done. I fixed the failing test.' })
  assert.equal(bar.chip, 'IDLE')
  assert.deepEqual(bar.line, {
    type: 'text',
    text: 'Done. I fixed the failing test.',
    tone: 'text',
    cursor: false
  })
  assert.equal(bar.fullReplyNote, true)
})

test('thinking: the dots', () => {
  const bar = view({ state: 'thinking', kind: 'thinking' })
  assert.equal(bar.chip, 'THINKING')
  assert.deepEqual(bar.line, { type: 'dots' })
})

test('talking: the last line typed so far, with the cursor and no note', () => {
  const bar = view({
    state: 'talking',
    kind: 'reply',
    typing: true,
    firstLine: 'First',
    typedLine: 'Second line so f'
  })
  assert.equal(bar.chip, 'TALKING')
  assert.deepEqual(bar.line, { type: 'text', text: 'Second line so f', tone: 'text', cursor: true })
  assert.equal(bar.fullReplyNote, false)
})

test('working: the text the box shows', () => {
  const bar = view({ state: 'working', kind: 'working', working: 'Scout is working: Reading a.ts' })
  assert.equal(bar.chip, 'WORKING')
  assert.deepEqual(bar.line, {
    type: 'text',
    text: 'Scout is working: Reading a.ts',
    tone: 'text',
    cursor: false
  })
})

test('after an error or a stop: the notice in its own color', () => {
  const error = view({ kind: 'notice', notice: { text: 'Something broke.', tone: 'error' } })
  assert.deepEqual(error.line, {
    type: 'text',
    text: 'Something broke.',
    tone: 'error',
    cursor: false
  })
  const stopped = view({ kind: 'notice', notice: { text: 'Stopped.', tone: 'muted' } })
  assert.deepEqual(stopped.line, { type: 'text', text: 'Stopped.', tone: 'muted', cursor: false })
  assert.equal(stopped.fullReplyNote, false)
})

test('the boss moods name themselves and show what the box would show', () => {
  const victory = view({ state: 'victory', kind: 'reply', firstLine: 'We won.' })
  assert.equal(victory.chip, 'VICTORY')
  assert.equal(victory.line.type === 'text' && victory.line.text, 'We won.')
  const hurt = view({ state: 'hurt', kind: 'thinking' })
  assert.equal(hurt.chip, 'HURT')
  assert.deepEqual(hurt.line, { type: 'dots' })
})

test('asking, which only shows while the mascot holds it after an answer', () => {
  const bar = view({ state: 'asking', kind: 'asking' })
  assert.equal(bar.chip, 'ASKING')
  assert.deepEqual(bar.line, { type: 'text', text: ASKING_LINE, tone: 'muted', cursor: false })
})

test('the line follows what the box shows while the mascot holds its last state', () => {
  // The reply finished typing, but the mascot still shows TALKING for a moment.
  const bar = view({ state: 'talking', kind: 'reply', typing: false, firstLine: 'Hello there.' })
  assert.equal(bar.chip, 'TALKING')
  assert.equal(bar.line.type === 'text' && bar.line.text, 'Hello there.')
  assert.equal(bar.fullReplyNote, true)
})
