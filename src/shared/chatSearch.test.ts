import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  searchChats,
  snippetOf,
  type SearchableChat,
  type SearchableMessage
} from './chatSearch.ts'

const chats: SearchableChat[] = [
  { id: 'a', title: 'Boss card sizing', updatedAt: 500 },
  { id: 'b', title: 'Custom boss uploads', updatedAt: 400 },
  { id: 'c', title: 'Progression XP rules', updatedAt: 300 },
  { id: 'd', title: 'Approvals on the battle view', updatedAt: 200 },
  { id: 'e', title: 'Unrelated', updatedAt: 100 },
  { id: 'f', title: 'Overbossed', updatedAt: 50 }
]

const say = (...texts: string[]): SearchableMessage[] =>
  texts.map((text, index) => ({ index, text }))

const messages = new Map<string, SearchableMessage[]>([
  ['a', say('The cards feel too tall.', 'Argenti says the boss sizing is on purpose.')],
  ['c', say('HP equals tests to pass, so the boss shows up when you run them.')],
  ['d', say('show the request over the BOSS screen', 'nothing here')],
  ['e', say('no match in this one')]
])

test('search: an empty query finds nothing', () => {
  assert.deepEqual(searchChats('', chats, messages), { titles: [], messages: [] })
  assert.deepEqual(searchChats('   ', chats, messages), { titles: [], messages: [] })
})

test('search: titles come first, matched without regard to case', () => {
  const found = searchChats('BOSS', chats, messages)
  assert.deepEqual(
    found.titles.map((hit) => hit.chatId),
    ['a', 'b', 'f']
  )
})

test('search: a title that starts with the query beats a word, and a word beats the middle of one', () => {
  // a: starts the title. b: starts a word. f: inside a word.
  const found = searchChats('boss', chats, new Map())
  assert.deepEqual(
    found.titles.map((hit) => hit.chatId),
    ['a', 'b', 'f']
  )
})

test('search: equal places are ordered by the most recent chat', () => {
  const same: SearchableChat[] = [
    { id: 'old', title: 'Boss one', updatedAt: 1 },
    { id: 'new', title: 'Boss two', updatedAt: 2 }
  ]
  assert.deepEqual(
    searchChats('boss', same, new Map()).titles.map((hit) => hit.chatId),
    ['new', 'old']
  )
})

test('search: a title hit carries the ranges to mark', () => {
  const found = searchChats('boss', chats, new Map())
  assert.deepEqual(found.titles[0].ranges, [[0, 4]])
  assert.deepEqual(found.titles[1].ranges, [[7, 11]])
})

test('search: text matches follow the titles, one per chat, and skip chats already listed', () => {
  const found = searchChats('boss', chats, messages)
  // a is in the titles, so it is not listed again for its message. c and d both open a word with
  // the query, so the more recent chat comes first.
  assert.deepEqual(
    found.messages.map((hit) => hit.chatId),
    ['c', 'd']
  )
})

test('search: the message hit names the message and a one-line snippet with the match marked', () => {
  const found = searchChats('boss', chats, messages)
  const hit = found.messages.find((entry) => entry.chatId === 'c')
  assert.ok(hit)
  assert.equal(hit.index, 0)
  assert.equal(hit.snippet.match, 'boss')
  assert.match(hit.snippet.before, /so the $/)
  assert.ok(hit.snippet.before.length <= 14)
  assert.match(hit.snippet.after, /^ shows up/)
})

test('search: the better place in a chat wins, then the later message', () => {
  const map = new Map<string, SearchableMessage[]>([
    ['c', say('a ghostboss here', 'boss at the start', 'the boss in a word', 'boss again')]
  ])
  const found = searchChats('boss', [{ id: 'c', title: 'x', updatedAt: 1 }], map)
  // Messages 1 and 3 open with the word; the later one wins.
  assert.equal(found.messages[0].index, 3)
})

test('search: a message starting with the query ranks above one that only contains it', () => {
  const map = new Map<string, SearchableMessage[]>([
    ['p', say('xx boss xx')],
    ['q', say('boss first')]
  ])
  const found = searchChats(
    'boss',
    [
      { id: 'p', title: 'p', updatedAt: 9 },
      { id: 'q', title: 'q', updatedAt: 1 }
    ],
    map
  )
  assert.deepEqual(
    found.messages.map((hit) => hit.chatId),
    ['q', 'p']
  )
})

test('search: the limit cuts each list', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({
    id: `t${i}`,
    title: `boss ${i}`,
    updatedAt: i
  }))
  assert.equal(searchChats('boss', many, new Map(), 3).titles.length, 3)
})

test('snippet: long text is cut with ellipses and stays on one line', () => {
  const text = `${'before '.repeat(10)}NEEDLE${' after'.repeat(20)}`
  const at = text.indexOf('NEEDLE')
  const snippet = snippetOf(text, at, 6)
  assert.equal(snippet.match, 'NEEDLE')
  assert.ok(snippet.before.startsWith('…'))
  assert.ok(snippet.after.endsWith('…'))
  assert.ok(!/\n/.test(snippet.before + snippet.match + snippet.after))
})

test('snippet: new lines inside become spaces and the match still lines up', () => {
  const text = 'line one\n\nthe boss\nappears'
  const snippet = snippetOf(text, text.indexOf('boss'), 4)
  assert.equal(snippet.match, 'boss')
  // The cut falls inside "line", so the snippet starts at the next whole word.
  assert.equal(snippet.before, '…one the ')
  assert.equal(snippet.after, ' appears')
})
