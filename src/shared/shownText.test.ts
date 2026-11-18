import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastLine, textLines } from './shownText.ts'

// The shape React elements have, without React: the tree is read by shape only.
const el = (type: unknown, children?: unknown, node?: string): unknown => ({
  type,
  props: { children, node: node ? { tagName: node } : undefined }
})

test('a paragraph is one line', () => {
  assert.deepEqual(textLines(el('p', 'Hello there')), ['Hello there'])
})

test('blocks are lines, and the last line is the last block', () => {
  const tree = [el('p', 'First'), '\n', el('p', ['Second ', el('strong', 'bold'), ' end'])]
  assert.deepEqual(textLines(tree), ['First', 'Second bold end'])
  assert.equal(lastLine(tree), 'Second bold end')
})

test('list items are lines', () => {
  const tree = el('ul', [el('li', 'one'), '\n', el('li', 'two')])
  assert.deepEqual(textLines(tree), ['one', 'two'])
})

test('a code box is its lines', () => {
  const tree = el(() => null, el('code', 'const a = 1\nconst b = 2\n'), 'pre')
  assert.deepEqual(textLines(tree), ['const a = 1', 'const b = 2'])
  assert.equal(lastLine(tree), 'const b = 2')
})

test('a component stands in for its element through props.node', () => {
  const tree = [el(() => null, 'one', 'p'), el(() => null, 'two', 'p')]
  assert.deepEqual(textLines(tree), ['one', 'two'])
})

test('a table row joins its cells with a dot', () => {
  const tree = el(
    () => null,
    [
      el('tr', [el('th', 'Name'), el('th', 'Age')], 'tr'),
      el('tr', [el('td', 'Ann'), el('td', '31')], 'tr')
    ],
    'table'
  )
  assert.deepEqual(textLines(tree), ['Name · Age', 'Ann · 31'])
  assert.equal(lastLine(tree), 'Ann · 31')
})

test('a break is a new line', () => {
  assert.deepEqual(textLines(el('p', ['one', el('br'), 'two'])), ['one', 'two'])
})

test('fragments, null, false, numbers and extra spaces are read', () => {
  const tree = [null, false, el(Symbol.for('react.fragment'), ['a', 1, null]), '   b   c ']
  assert.deepEqual(textLines(el('p', tree)), ['a1 b c'])
})

test('an empty tree has no last line', () => {
  assert.equal(lastLine(null), '')
  assert.equal(lastLine([el('p', ''), '\n']), '')
})
