import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SIGN_IN_TIMEOUT_MS,
  announcement,
  binaryFor,
  cancelledInBrowser,
  classifyCliFailure,
  countdownLabel,
  envKeySignOutMessage,
  howLabel,
  installFailedMessage,
  installStage,
  keyRejectedMessage,
  packageFor,
  remainingMs,
  signInExpired,
  wontStartMessage
} from './logins.ts'

// --- the sign-in clock ----------------------------------------------------------------------

test('sign-in timeout: three minutes, counting down from 3:00', () => {
  assert.equal(SIGN_IN_TIMEOUT_MS, 180_000)
  assert.equal(remainingMs(1000, 1000), 180_000)
  assert.equal(countdownLabel(remainingMs(1000, 1000)), '3:00')
  assert.equal(countdownLabel(remainingMs(0, 59_000)), '2:01')
  assert.equal(countdownLabel(remainingMs(0, 179_000)), '0:01')
})

test('sign-in timeout: a part of a second counts as the second, and the clock stops at 0:00', () => {
  assert.equal(countdownLabel(179_100 - 1000 * 178), '0:02')
  assert.equal(countdownLabel(0), '0:00')
  assert.equal(countdownLabel(-5), '0:00')
})

test('sign-in timeout: it expires at three minutes and not a moment before', () => {
  assert.equal(signInExpired(0, 179_999), false)
  assert.equal(signInExpired(0, 180_000), true)
  assert.equal(signInExpired(0, 500_000), true)
  assert.equal(remainingMs(0, 500_000), 0)
})

test('sign-in timeout: a shorter total is honoured (the fast fixture)', () => {
  assert.equal(signInExpired(0, 8_000, 8_000), true)
  assert.equal(countdownLabel(remainingMs(0, 2_000, 8_000)), '0:06')
})

test('sign-in timeout: the countdown is read out every 30 seconds only', () => {
  assert.equal(announcement(180_000), '3:00 left to finish signing in')
  assert.equal(announcement(150_000), '2:30 left to finish signing in')
  assert.equal(announcement(149_000), null)
  assert.equal(announcement(31_000), null)
  assert.equal(announcement(30_000), '0:30 left to finish signing in')
  assert.equal(announcement(0), null)
  const spoken = Array.from({ length: 181 }, (_, s) => announcement((180 - s) * 1000)).filter(
    Boolean
  )
  assert.equal(spoken.length, 6)
})

// --- the words of the errors ------------------------------------------------------------------

test("error copy is the spec's, word for word", () => {
  assert.equal(installFailedMessage(1), 'Install failed. npm exited with code 1.')
  assert.equal(installFailedMessage(null), 'Install failed. npm exited with code unknown.')
  assert.equal(
    keyRejectedMessage('Codex'),
    "Codex didn't accept this key. Check it and paste it again."
  )
  assert.equal(wontStartMessage('codex'), "Couldn't run codex --version. Reinstall the CLI.")
  assert.equal(
    envKeySignOutMessage('OPENAI_API_KEY'),
    'Set outside Mya. To sign out, remove OPENAI_API_KEY and restart Mya.'
  )
})

// --- reading CLI output ------------------------------------------------------------------------

test('a browser sign-in that ended with a no is told apart from one that failed', () => {
  assert.equal(cancelledInBrowser('Error: access_denied'), true)
  assert.equal(cancelledInBrowser('The request was cancelled by the user'), true)
  assert.equal(
    cancelledInBrowser('Token exchange failed: Failed to read CA certificate file'),
    false
  )
})

test('a command that will not run: missing from this computer, or there and broken', () => {
  assert.equal(
    classifyCliFailure("'codex' is not recognized as an internal or external command"),
    'missing'
  )
  assert.equal(classifyCliFailure('spawn gemini ENOENT'), 'missing')
  assert.equal(classifyCliFailure('bash: codex: command not found'), 'missing')
  assert.equal(
    classifyCliFailure(
      "Error: Cannot find module 'D:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js'"
    ),
    'broken'
  )
  assert.equal(classifyCliFailure('Segmentation fault'), 'broken')
})

test('npm output becomes a one-line stage', () => {
  assert.equal(
    installStage('npm http fetch GET 200 https://registry.npmjs.org/x'),
    'npm: fetching packages'
  )
  assert.equal(
    installStage('npm info run esbuild postinstall'),
    'npm: info run esbuild postinstall'
  )
  assert.equal(installStage('added 12 packages in 3s'), 'npm: finishing')
  assert.equal(installStage('npm ERR! code E404'), 'npm: hit an error')
  assert.equal(installStage('   '), null)
  assert.ok((installStage('x'.repeat(200)) ?? '').length <= 66)
})

test('how a CLI is signed in', () => {
  assert.equal(howLabel('oauth', null), 'Browser')
  assert.equal(howLabel('api_key', null), 'API key, saved by Mya')
  assert.equal(howLabel('env', 'OPENAI_API_KEY'), 'Environment key (OPENAI_API_KEY)')
  assert.equal(howLabel(null, null), 'Not signed in')
})

test('the package and binary of each CLI', () => {
  assert.equal(packageFor('codex'), '@openai/codex')
  assert.equal(packageFor('gemini'), '@google/gemini-cli')
  assert.equal(binaryFor('codex'), 'codex')
  assert.equal(binaryFor('gemini'), 'gemini')
})
