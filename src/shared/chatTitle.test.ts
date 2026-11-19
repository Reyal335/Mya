import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanRename, makeTitle, TITLE_MAX } from './chatTitle.ts'

test('title: no text is "New chat"', () => {
  assert.equal(makeTitle(''), 'New chat')
  assert.equal(makeTitle('   \n\t \n'), 'New chat')
})

test('title: a short message is its own title', () => {
  assert.equal(makeTitle('Fix the flaky auth test'), 'Fix the flaky auth test')
})

test('title: only the first line counts, blank lines before it are skipped', () => {
  assert.equal(makeTitle('\n\n  Why does this fail?  \nError: port in use'), 'Why does this fail?')
  assert.equal(makeTitle('one\r\ntwo'), 'one')
})

test('title: runs of white space become one space', () => {
  assert.equal(makeTitle('look \t  at   this'), 'look at this')
})

test('title: exactly 40 characters is kept whole', () => {
  const forty = 'a'.repeat(TITLE_MAX)
  assert.equal(makeTitle(forty), forty)
})

test('title: a long message is cut at a word boundary within 40 characters', () => {
  const title = makeTitle('Please refactor the authentication middleware so it stops leaking')
  assert.equal(title, 'Please refactor the authentication')
  assert.ok(Array.from(title).length <= TITLE_MAX)
})

test('title: a space right after the 40th character keeps all 40', () => {
  const text = `${'a'.repeat(39)}b next words`
  assert.equal(makeTitle(text), `${'a'.repeat(39)}b`)
})

test('title: one long word is cut at 40', () => {
  assert.equal(makeTitle('x'.repeat(90)), 'x'.repeat(TITLE_MAX))
})

test('title: a cut never splits an emoji', () => {
  const title = makeTitle('😀'.repeat(60))
  assert.equal(Array.from(title).length, TITLE_MAX)
  assert.equal(title, '😀'.repeat(TITLE_MAX))
})

test('rename: empty or unchanged input means no change', () => {
  assert.equal(cleanRename('', 'Old'), null)
  assert.equal(cleanRename('   ', 'Old'), null)
  assert.equal(cleanRename(' Old ', 'Old'), null)
})

test('rename: a new name is tidied', () => {
  assert.equal(cleanRename('  Boss   card\nsizing ', 'Old'), 'Boss card sizing')
})
