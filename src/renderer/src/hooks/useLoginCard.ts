import { useSyncExternalStore } from 'react'
import type { CliProviderId, ProviderActionResult } from '../../../shared/ipc'
import type { CardPhase } from '../../../shared/loginCards'
import type { ProviderErrorCode } from '../../../shared/logins'
import { publishProvidersStatus } from './useProvidersStatus'

// Where a failure is shown on the card: in the install section, the browser sign-in section, under
// the key field, or beside SIGN OUT.
export type FailureWhere = 'install' | 'sign_in' | 'key' | 'sign_out'

export type LoginFailure = {
  where: FailureWhere
  message: string
  code: ProviderErrorCode | null
  // An install that failed: npm's exit code and the end of its output (COPY LOG).
  exitCode: number | null
  log: string | null
}

export type LoginCardState = {
  phase: CardPhase
  failure: LoginFailure | null
  // The npm stage while an install goes: "npm: fetching packages".
  stage: string | null
  // When the browser sign-in began, for the 3:00 clock. 0 when none is going.
  startedAt: number
}

const IDLE: LoginCardState = { phase: 'idle', failure: null, stage: null, startedAt: 0 }

// What each card is doing is kept for the whole session, outside the screen. An install or a sign-in
// goes on while another screen is open, and its card is as it was left when LOGINS comes back.
const states: Record<CliProviderId, LoginCardState> = { codex: IDLE, gemini: IDLE }
// Each action takes a number. An answer from an action that was cancelled, and so replaced, no
// longer changes the card.
const runs: Record<CliProviderId, number> = { codex: 0, gemini: 0 }
const listeners = new Set<() => void>()

function patch(provider: CliProviderId, next: Partial<LoginCardState>): void {
  states[provider] = { ...states[provider], ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLoginCard(provider: CliProviderId): LoginCardState {
  return useSyncExternalStore(subscribe, () => states[provider])
}

// Runs one action: the card is busy with `phase`, then shows what came of it. Cancelled actions
// report nothing. True when it worked.
async function run(
  provider: CliProviderId,
  phase: Exclude<CardPhase, 'idle'>,
  where: FailureWhere,
  call: (onStage: (stage: string) => void) => Promise<ProviderActionResult>
): Promise<boolean> {
  const mine = ++runs[provider]
  patch(provider, {
    phase,
    failure: null,
    stage: null,
    startedAt: phase === 'signing_in' ? Date.now() : 0
  })
  try {
    const result = await call((stage) => {
      if (runs[provider] === mine) patch(provider, { stage })
    })
    publishProvidersStatus(result.status)
    if (runs[provider] !== mine) return false
    if (result.ok) {
      patch(provider, { ...IDLE })
      return true
    }
    const code = result.code ?? null
    patch(provider, {
      ...IDLE,
      failure:
        code === 'cancelled'
          ? null
          : {
              where: code === 'key_rejected' ? 'key' : where,
              message: result.error,
              code,
              exitCode: result.exitCode ?? null,
              log: result.log ?? null
            }
    })
  } catch (err) {
    if (runs[provider] !== mine) return false
    console.error(`Could not finish the ${where} step:`, err)
    patch(provider, {
      ...IDLE,
      failure: {
        where,
        message: err instanceof Error ? err.message : 'Something went wrong.',
        code: null,
        exitCode: null,
        log: null
      }
    })
  }
  return false
}

export function installCli(provider: CliProviderId): Promise<boolean> {
  return run(provider, 'installing', 'install', async (onStage) => {
    const stop = window.mya.providers.onInstallProgress((progress) => {
      if (progress.provider === provider) onStage(progress.stage)
    })
    try {
      return await window.mya.providers.installCli(provider)
    } finally {
      stop()
    }
  })
}

export function signInInBrowser(provider: CliProviderId): Promise<boolean> {
  return run(provider, 'signing_in', 'sign_in', () => window.mya.providers.loginOAuth(provider))
}

// The key goes to main as typed and is not kept here: the card clears its field when this says yes.
export function saveKey(provider: CliProviderId, key: string): Promise<boolean> {
  return run(provider, 'saving', 'key', () => window.mya.providers.saveApiKey(provider, key))
}

export function signOut(provider: CliProviderId): Promise<boolean> {
  return run(provider, 'signing_out', 'sign_out', () => window.mya.providers.logout(provider))
}

// The error shown at `where` is over: the person changed what it was about.
export function clearFailure(provider: CliProviderId, where: FailureWhere): void {
  if (states[provider].failure?.where === where) patch(provider, { failure: null })
}

// CANCEL on an install or a browser sign-in. The card goes back to what it was at once.
export async function cancel(provider: CliProviderId): Promise<void> {
  const phase = states[provider].phase
  runs[provider] += 1
  patch(provider, { ...IDLE })
  try {
    if (phase === 'installing') await window.mya.providers.cancelInstall(provider)
    else if (phase === 'signing_in') await window.mya.providers.cancelLogin(provider)
  } catch (err) {
    console.error('Could not cancel:', err)
  }
}
