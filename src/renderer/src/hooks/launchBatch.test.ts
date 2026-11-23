import { test } from 'node:test'
import assert from 'node:assert/strict'
import { launchBatch } from './launchBatch.ts'

test('launch batch: nothing queued asks nothing', () => {
  assert.deepEqual(launchBatch([]), { notice: null, openId: null })
})

test('launch batch: one of each kind', () => {
  assert.deepEqual(launchBatch([{ id: 'a', kind: 'open-folder' }]), {
    notice: null,
    openId: 'a'
  })
  assert.deepEqual(launchBatch([{ id: 'n', kind: 'notice', text: 'Hello' }]), {
    notice: 'Hello',
    openId: null
  })
})

test('launch batch: the last of each kind wins', () => {
  assert.deepEqual(
    launchBatch([
      { id: 'a', kind: 'open-folder' },
      { id: 'b', kind: 'open-folder' },
      { id: 'n1', kind: 'notice', text: 'first' },
      { id: 'n2', kind: 'notice', text: 'second' }
    ]),
    { notice: 'second', openId: 'b' }
  )
})

test('launch batch: mixed order keeps the last of each kind', () => {
  assert.deepEqual(
    launchBatch([
      { id: 'n1', kind: 'notice', text: 'first' },
      { id: 'a', kind: 'open-folder' },
      { id: 'n2', kind: 'notice', text: 'second' },
      { id: 'b', kind: 'open-folder' },
      { id: 'n3', kind: 'notice', text: 'third' }
    ]),
    { notice: 'third', openId: 'b' }
  )
})
