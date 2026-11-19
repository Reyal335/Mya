import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cardState,
  checkingLine,
  confirmLines,
  initialSelection,
  startLabel,
  type CardState
} from './providerCards.ts'

test('card: Claude follows the Claude Code login', () => {
  assert.equal(cardState('claude', { claude: null, cli: null }), 'checking')
  assert.equal(cardState('claude', { claude: 'signed_in', cli: null }), 'ready')
  assert.equal(cardState('claude', { claude: 'signed_out', cli: null }), 'signed_out')
})

test('card: Codex and Gemini follow their CLI: checking, not installed, signed out, ready', () => {
  assert.equal(cardState('codex', { claude: null, cli: null }), 'checking')
  assert.equal(
    cardState('codex', { claude: null, cli: { installed: false, loggedIn: false } }),
    'not_installed'
  )
  assert.equal(
    cardState('gemini', { claude: null, cli: { installed: true, loggedIn: false } }),
    'signed_out'
  )
  assert.equal(
    cardState('gemini', { claude: null, cli: { installed: true, loggedIn: true } }),
    'ready'
  )
})

test('card: a CLI that is not installed is never ready, even if a login is left behind', () => {
  assert.equal(
    cardState('codex', { claude: null, cli: { installed: false, loggedIn: true } }),
    'not_installed'
  )
})

test('copy: the line under a card that is checking', () => {
  assert.equal(checkingLine('gemini'), 'Looking for the Gemini CLI.')
  assert.equal(checkingLine('codex'), 'Looking for the Codex CLI.')
})

test('copy: the start button names the provider', () => {
  assert.equal(startLabel('codex'), 'START CODEX CHAT')
  assert.equal(startLabel('claude'), 'START CLAUDE CHAT')
})

test('confirm: the same provider says the chat moves to HISTORY', () => {
  assert.deepEqual(confirmLines({ current: 'claude', target: 'claude', openIsEmpty: false }), {
    main: 'Start a new conversation? The current one moves to HISTORY.',
    note: null
  })
})

test('confirm: switching adds that the new provider will not see the old chat', () => {
  assert.deepEqual(confirmLines({ current: 'claude', target: 'codex', openIsEmpty: false }), {
    main: 'Start a new conversation? The current one moves to HISTORY.',
    note: "Codex won't see your Claude chat."
  })
  assert.equal(
    confirmLines({ current: 'codex', target: 'gemini', openIsEmpty: false }).note,
    "Gemini won't see your Codex chat."
  )
})

test('confirm: an empty chat moves nowhere, so there is no line', () => {
  assert.deepEqual(confirmLines({ current: 'claude', target: 'codex', openIsEmpty: true }), {
    main: null,
    note: null
  })
  assert.deepEqual(confirmLines({ current: null, target: 'codex', openIsEmpty: false }), {
    main: null,
    note: null
  })
})

test('selection: the current provider when it is ready, else the first that is', () => {
  const states = (
    c: CardState,
    x: CardState,
    g: CardState
  ): Record<'claude' | 'codex' | 'gemini', CardState> => ({
    claude: c,
    codex: x,
    gemini: g
  })
  const order = ['claude', 'codex', 'gemini'] as const
  assert.equal(initialSelection('codex', states('ready', 'ready', 'ready'), order), 'codex')
  assert.equal(initialSelection('codex', states('ready', 'signed_out', 'ready'), order), 'claude')
  assert.equal(
    initialSelection('claude', states('signed_out', 'checking', 'ready'), order),
    'gemini'
  )
  assert.equal(
    initialSelection('claude', states('signed_out', 'signed_out', 'not_installed'), order),
    null
  )
  assert.equal(initialSelection(null, states('ready', 'ready', 'ready'), order), 'claude')
})
