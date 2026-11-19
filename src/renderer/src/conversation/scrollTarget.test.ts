import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anchorOf, findAnchored } from './scrollTarget.ts'

const items = [
  { id: 1, kind: 'user', text: 'Fix the  flaky\nauth test' },
  { id: 2, kind: 'tool' },
  { id: 3, kind: 'text', text: 'The test fails because the clock is mocked.' },
  { id: 4, kind: 'notice' }
]

test('anchor: white space collapses and the text is cut', () => {
  assert.equal(anchorOf('  a \n\n b  '), 'a b')
  assert.equal(anchorOf('x'.repeat(300)).length, 160)
})

test('anchor: finds a message of mine and a reply by their start', () => {
  assert.equal(findAnchored(items, anchorOf('Fix the flaky auth test')), 1)
  assert.equal(findAnchored(items, anchorOf('The test fails because the clock is mocked.')), 3)
})

test('anchor: tool cards and notices are never matched, and a missing one is null', () => {
  assert.equal(findAnchored(items, 'nothing like this'), null)
  assert.equal(findAnchored(items, ''), null)
})
