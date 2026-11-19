import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProviderStatus } from './ipc.ts'
import { cliValue, countdownSpeech, installFill, loginRows, loginStatus } from './loginCards.ts'

function status(over: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    provider: 'codex',
    installed: true,
    version: 'codex-cli 0.170.0',
    loggedIn: false,
    method: null,
    detail: null,
    account: null,
    keyMask: null,
    envVar: null,
    cli: 'ok',
    ...over
  }
}

const person = {
  name: 'Fixture Person',
  email: 'person@example.com',
  plan: 'chatgpt free',
  organization: null,
  activeUntil: null
}

test('the status word and its color, in each state', () => {
  assert.deepEqual(loginStatus(null, 'idle', false), { label: 'CHECKING...', tone: 'muted' })
  assert.deepEqual(loginStatus(status({ installed: false, cli: 'missing' }), 'idle', false), {
    label: 'NOT INSTALLED',
    tone: 'muted'
  })
  assert.deepEqual(loginStatus(status(), 'installing', false), {
    label: 'INSTALLING',
    tone: 'running'
  })
  assert.deepEqual(loginStatus(status(), 'idle', false), { label: 'SIGNED OUT', tone: 'waiting' })
  assert.deepEqual(loginStatus(status(), 'signing_in', false), {
    label: 'SIGNING IN',
    tone: 'running'
  })
  assert.deepEqual(loginStatus(status({ loggedIn: true, method: 'oauth' }), 'idle', false), {
    label: 'SIGNED IN',
    tone: 'running'
  })
})

test('a failed install and a CLI that will not start are ERROR', () => {
  assert.deepEqual(loginStatus(status({ installed: false, cli: 'missing' }), 'idle', true), {
    label: 'ERROR',
    tone: 'error'
  })
  assert.deepEqual(loginStatus(status({ installed: false, cli: 'broken' }), 'idle', false), {
    label: 'ERROR',
    tone: 'error'
  })
  // A sign-in that failed is not an ERROR status: the card is still signed out.
  assert.equal(loginStatus(status(), 'idle', false).label, 'SIGNED OUT')
})

test('the CLI row', () => {
  assert.equal(cliValue(status(), 'idle'), 'codex-cli 0.170.0')
  assert.equal(cliValue(status({ version: null }), 'idle'), 'Installed')
  assert.equal(cliValue(status({ installed: false, cli: 'missing' }), 'idle'), 'Not installed')
  assert.equal(
    cliValue(status({ installed: false, cli: 'missing' }), 'installing'),
    'Installing...'
  )
  assert.equal(
    cliValue(status({ installed: false, cli: 'broken' }), 'idle'),
    "Found, but it won't start"
  )
})

test('the table of a signed-out card, one that is signing in, and one that will not start', () => {
  assert.deepEqual(loginRows(status(), 'idle'), [
    { label: 'CLI', value: 'codex-cli 0.170.0' },
    { label: 'Signed in', value: 'No' }
  ])
  assert.equal(loginRows(status(), 'signing_in')[1].value, 'Not yet')
  assert.equal(loginRows(status({ installed: false, cli: 'broken' }), 'idle')[1].value, 'Unknown')
})

test('the table of a card signed in by browser lists the person, the plan, and how', () => {
  const rows = loginRows(
    status({ loggedIn: true, method: 'oauth', detail: 'Browser', account: person }),
    'idle'
  )
  assert.deepEqual(rows, [
    { label: 'CLI', value: 'codex-cli 0.170.0' },
    { label: 'Signed in as', value: 'Fixture Person' },
    { label: 'Email', value: 'person@example.com' },
    { label: 'Plan', value: 'CHATGPT FREE', style: 'plan' },
    { label: 'How', value: 'Browser' }
  ])
})

test('a browser sign-in that knows only an email shows it once, as who is signed in', () => {
  const rows = loginRows(
    status({
      loggedIn: true,
      method: 'oauth',
      account: { ...person, name: null, plan: null }
    }),
    'idle'
  )
  assert.deepEqual(
    rows.map((row) => row.label),
    ['CLI', 'Signed in as', 'How']
  )
  assert.equal(rows[1].value, 'person@example.com')
})

test('the table of a card signed in by a key shows the masked key and never more', () => {
  const rows = loginRows(
    status({ loggedIn: true, method: 'api_key', keyMask: 'sk-a...9f2c' }),
    'idle'
  )
  assert.deepEqual(rows, [
    { label: 'CLI', value: 'codex-cli 0.170.0' },
    { label: 'Signed in as', value: 'API key' },
    { label: 'How', value: 'API key, saved by Mya' },
    { label: 'Key', value: 'sk-a...9f2c', style: 'code' }
  ])
})

test('the table of a card signed in by an environment key names the variable', () => {
  const rows = loginRows(
    status({ loggedIn: true, method: 'env', envVar: 'OPENAI_API_KEY', keyMask: 'sk-p...41ab' }),
    'idle'
  )
  assert.equal(rows[2].value, 'Environment key (OPENAI_API_KEY)')
  assert.equal(rows[3].value, 'sk-p...41ab')
})

test('the install bar fills by stage and always shows some progress', () => {
  assert.equal(installFill(null), 1)
  assert.ok(installFill('npm: fetching packages') < installFill('npm: unpacking packages'))
  assert.ok(installFill('npm: unpacking packages') < installFill('npm: finishing'))
  assert.ok(installFill('npm: finishing') < 14)
  assert.ok(installFill('npm: something else') >= 1)
})

test('the countdown as a screen reader says it', () => {
  assert.equal(countdownSpeech(161_000), '2 minutes 41 seconds left')
  assert.equal(countdownSpeech(180_000), '3 minutes left')
  assert.equal(countdownSpeech(61_000), '1 minute 1 second left')
  assert.equal(countdownSpeech(1_000), '1 second left')
  assert.equal(countdownSpeech(0), '0 seconds left')
})
