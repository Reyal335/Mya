import { app } from 'electron'
import type { CliProviderId, ProviderStatus } from '../shared/ipc'
import { maskKey } from '../shared/providers'

// Made-up LOGINS states, to see each card and each error without installing, signing in, or
// signing out of anything. Set MYA_LOGINS_FIXTURE in an app that is not packaged (`npm start`); a
// packaged app ignores it. One state for each CLI, "codex=<state>,gemini=<state>", or one name for
// both. The real status, the real CLIs, and the real keys are not read or changed while it is set.
//
//   not-installed        INSTALL CLI runs a made-up install (about 3 seconds) and succeeds
//   install-fails        the made-up install ends with "Install failed. npm exited with code 1."
//   wont-start           the CLI is there and does not start (the "Couldn't run ... --version" card)
//   signed-out           installed, signed out. Sign-in actions are made up too
//   sign-in-times-out    SIGN IN IN BROWSER waits for the 3:00 clock to run out, then fails.
//                        Add MYA_LOGINS_FAST=1 to make that 6 seconds
//   browser-cancelled    SIGN IN IN BROWSER ends after 2 seconds with "cancelled in the browser"
//   key-rejected         SAVE KEY is refused with "<Provider> didn't accept this key"
//   signed-in-browser    signed in by browser
//   signed-in-key        signed in by a saved API key
//   signed-in-env        signed in by an environment key (SIGN OUT is disabled)

export const FIXTURE_STATES = [
  'not-installed',
  'install-fails',
  'wont-start',
  'signed-out',
  'sign-in-times-out',
  'browser-cancelled',
  'key-rejected',
  'signed-in-browser',
  'signed-in-key',
  'signed-in-env'
] as const

export type FixtureState = (typeof FIXTURE_STATES)[number]

const current = new Map<CliProviderId, FixtureState>()
let read = false

function parse(): void {
  if (read) return
  read = true
  if (app.isPackaged) return
  const raw = process.env['MYA_LOGINS_FIXTURE']
  if (!raw) return
  const wanted = new Map<CliProviderId, string>()
  for (const part of raw.split(',')) {
    const [left, right] = part.includes('=') ? part.split('=') : ['both', part]
    const name = (right ?? '').trim()
    if (left.trim() === 'codex' || left.trim() === 'both') wanted.set('codex', name)
    if (left.trim() === 'gemini' || left.trim() === 'both') wanted.set('gemini', name)
  }
  for (const [provider, name] of wanted) {
    if ((FIXTURE_STATES as readonly string[]).includes(name)) {
      current.set(provider, name as FixtureState)
    } else {
      console.error(
        `[logins] Unknown fixture "${name}". Choose one of: ${FIXTURE_STATES.join(', ')}`
      )
    }
  }
  if (current.size > 0) console.log('[logins] Showing made-up states. Real values are ignored.')
}

export function fixtureOf(provider: CliProviderId): FixtureState | null {
  parse()
  return current.get(provider) ?? null
}

export function setFixture(provider: CliProviderId, state: FixtureState): void {
  current.set(provider, state)
}

// The wait for the made-up sign-in: the real three minutes, or 6 seconds with MYA_LOGINS_FAST.
export function fixtureSignInWaitMs(real: number): number {
  return process.env['MYA_LOGINS_FAST'] ? 6_000 : real
}

export function fixtureStatus(provider: CliProviderId, state: FixtureState): ProviderStatus {
  const version = provider === 'codex' ? 'codex-cli 0.170.0' : 'gemini-cli 0.9.0'
  const base: ProviderStatus = {
    provider,
    installed: true,
    version,
    loggedIn: false,
    method: null,
    detail: null,
    account: null,
    keyMask: null,
    envVar: null,
    cli: 'ok'
  }
  const person = {
    name: 'Fixture Person',
    email: 'person@example.com',
    plan: provider === 'codex' ? 'ChatGPT Plus' : 'Google AI Pro',
    organization: null,
    activeUntil: null
  }
  switch (state) {
    case 'not-installed':
    case 'install-fails':
      return { ...base, installed: false, version: null, cli: 'missing' }
    case 'wont-start':
      return { ...base, installed: false, version: null, cli: 'broken' }
    case 'signed-in-browser':
      return { ...base, loggedIn: true, method: 'oauth', detail: 'Browser', account: person }
    case 'signed-in-key': {
      const mask = maskKey(
        provider === 'codex' ? 'sk-abcdefgh1234567890wxyz9f2c' : 'AIzaSyD-fixture-key-7a1b'
      )
      return {
        ...base,
        loggedIn: true,
        method: 'api_key',
        detail: `Saved API Key (${mask})`,
        keyMask: mask
      }
    }
    case 'signed-in-env': {
      const name = provider === 'codex' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'
      const mask = maskKey(
        provider === 'codex' ? 'sk-envkey-1234567890-3d4e' : 'AIzaSyD-env-key-9c0d'
      )
      return {
        ...base,
        loggedIn: true,
        method: 'env',
        detail: `Environment key (${mask})`,
        envVar: name,
        keyMask: mask
      }
    }
    default:
      return base
  }
}
