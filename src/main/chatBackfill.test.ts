import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withCall } from '../shared/callAgent.ts'
import { transcriptFromSession } from './chatBackfill.ts'
import type { RecordedMessage } from './history.ts'

const user = (content: unknown): RecordedMessage => ({
  type: 'user',
  message: { role: 'user', content },
  parent_tool_use_id: null
})
const reply = (content: unknown[]): RecordedMessage => ({
  type: 'assistant',
  message: { role: 'assistant', model: 'claude-sonnet-5-5', content },
  parent_tool_use_id: null
})

test('backfill: my messages and the reply text come out, tool cards do not', () => {
  const out = transcriptFromSession([
    user('Fix the build'),
    reply([
      { type: 'text', text: 'Looking.' },
      { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.ts' } }
    ]),
    user([{ type: 'tool_result', tool_use_id: 't1', content: 'file text' }]),
    reply([{ type: 'text', text: 'Fixed.' }])
  ])
  assert.deepEqual(
    out.map((m) => [m.role, m.text]),
    [
      ['user', 'Fix the build'],
      ['assistant', 'Looking.'],
      ['assistant', 'Fixed.']
    ]
  )
  assert.ok(out.every((m) => m.at === 0))
})

test('backfill: an agent call keeps the agent and drops the sentence', () => {
  const out = transcriptFromSession([user(withCall('Argenti', 'Review this'))])
  assert.deepEqual(out, [{ role: 'user', text: 'Review this', at: 0, agent: 'Argenti' }])
})

test('backfill: text Claude Code injected is left out', () => {
  const out = transcriptFromSession([
    user('<system-reminder>be careful</system-reminder>'),
    user('Real message')
  ])
  assert.deepEqual(
    out.map((m) => m.text),
    ['Real message']
  )
})
