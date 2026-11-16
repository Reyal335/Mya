import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withCall } from '../shared/callAgent.ts'
import { historyItems, type HistoryContext, type RecordedMessage } from './history.ts'

const context: HistoryContext = {
  tasks: new Map(),
  agentFor: (name) => ({ name, scope: null, filePath: null, icon: null, role: null })
}

const user = (content: unknown, parent: string | null = null): RecordedMessage => ({
  type: 'user',
  message: { role: 'user', content },
  parent_tool_use_id: parent
})

const png = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }
const words = (value: string): { type: string; text: string } => ({ type: 'text', text: value })

test('history: a message with text and an image has its image counted', () => {
  assert.deepEqual(historyItems([user([words('look'), png])], context), [
    { kind: 'user', text: 'look', call: null, imageCount: 1 }
  ])
})

test('history: text that is a plain string has no images', () => {
  assert.deepEqual(historyItems([user('hello')], context), [
    { kind: 'user', text: 'hello', call: null, imageCount: 0 }
  ])
  assert.deepEqual(historyItems([user([words('hello')])], context), [
    { kind: 'user', text: 'hello', call: null, imageCount: 0 }
  ])
})

test('history: a message of images only is still my message, with no text', () => {
  assert.deepEqual(historyItems([user([png])], context), [
    { kind: 'user', text: '', call: null, imageCount: 1 }
  ])
  assert.deepEqual(historyItems([user([png, png, png])], context), [
    { kind: 'user', text: '', call: null, imageCount: 3 }
  ])
})

test('history: blank text with no images makes no item', () => {
  assert.deepEqual(historyItems([user('   '), user([words('')]), user([])], context), [])
})

test('history: image blocks that are malformed are not counted', () => {
  const bad = [
    { type: 'image' },
    { type: 'image', source: null },
    { type: 'image', source: 'AAAA' },
    null,
    5,
    'image'
  ]
  assert.deepEqual(historyItems([user(bad)], context), [])
  assert.deepEqual(historyItems([user([words('hi'), ...bad, png])], context), [
    { kind: 'user', text: 'hi', call: null, imageCount: 1 }
  ])
  // Content that is not text or blocks at all.
  assert.deepEqual(historyItems([user({ type: 'image' }), user(null), user(7)], context), [])
})

test("history: images inside a tool result are the tool's, not mine", () => {
  const result = { type: 'tool_result', tool_use_id: 't1', content: [png, words('done')] }
  assert.deepEqual(historyItems([user([result])], context), [])
  // Even next to one at the top of the message.
  assert.deepEqual(historyItems([user([result, png])], context), [])
})

test('history: text Claude Code put in itself is skipped, images or not', () => {
  const reminder = words('<system-reminder>be careful</system-reminder>')
  assert.deepEqual(historyItems([user([reminder, png])], context), [])
})

test('history: an agent call sentence is read back with the image count kept', () => {
  assert.deepEqual(
    historyItems([user([words(withCall('Reviewer', 'check this')), png])], context),
    [
      {
        kind: 'user',
        text: 'check this',
        call: { name: 'Reviewer', scope: null, filePath: null, icon: null, role: null },
        imageCount: 1
      }
    ]
  )
  // No typed text: the sentence alone is the text block, and the message shows no text.
  assert.deepEqual(historyItems([user([words(withCall('Reviewer', '')), png, png])], context), [
    {
      kind: 'user',
      text: '',
      call: { name: 'Reviewer', scope: null, filePath: null, icon: null, role: null },
      imageCount: 2
    }
  ])
})

test('history: messages inside an agent task are not part of the conversation', () => {
  assert.deepEqual(historyItems([user([words('inner'), png], 'toolu_1')], context), [])
})

test('history: messages stay in order, each with its own image count', () => {
  const items = historyItems(
    [user([png]), user('then text'), user([words('and both'), png, png])],
    context
  )
  assert.deepEqual(
    items.map((item) => item.kind === 'user' && [item.text, item.imageCount]),
    [
      ['', 1],
      ['then text', 0],
      ['and both', 2]
    ]
  )
})
