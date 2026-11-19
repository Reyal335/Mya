// What a LOGINS card says, as pure rules: its status word and color, the rows of its table, and how
// far along an install is. The card itself is in the window; these are tested without a screen.

import type { ProviderStatus } from './ipc.ts'
import { howLabel } from './logins.ts'

// What the card is busy with. `idle` means nothing: the card shows the status as it is.
export type CardPhase = 'idle' | 'installing' | 'signing_in' | 'saving' | 'signing_out'

// The status word's color: running is the green, waiting the amber, muted the grey.
export type StatusTone = 'running' | 'waiting' | 'muted' | 'error'

export type LoginStatus = { label: string; tone: StatusTone }

// The word beside a card's name. An install that failed, and a CLI that is there and will not start,
// are ERROR. A card that is not installed is NOT INSTALLED, one that is installed and signed out is
// SIGNED OUT, and a signed-in one is SIGNED IN, whichever way it was signed in.
export function loginStatus(
  status: ProviderStatus | null,
  phase: CardPhase,
  installFailed: boolean
): LoginStatus {
  if (status === null) return { label: 'CHECKING...', tone: 'muted' }
  if (phase === 'installing') return { label: 'INSTALLING', tone: 'running' }
  if (phase === 'signing_in') return { label: 'SIGNING IN', tone: 'running' }
  if (installFailed || status.cli === 'broken') return { label: 'ERROR', tone: 'error' }
  if (!status.installed) return { label: 'NOT INSTALLED', tone: 'muted' }
  return status.loggedIn
    ? { label: 'SIGNED IN', tone: 'running' }
    : { label: 'SIGNED OUT', tone: 'waiting' }
}

// A row of the table: its label and value, and how the value is set (the plan in the pixel font, the
// masked key in code).
export type LoginRow = { label: string; value: string; style?: 'plan' | 'code' }

// The CLI row's value.
export function cliValue(status: ProviderStatus | null, phase: CardPhase): string {
  if (status === null) return 'Checking...'
  if (phase === 'installing') return 'Installing...'
  if (status.cli === 'broken') return "Found, but it won't start"
  if (status.cli === 'missing' || !status.installed) return 'Not installed'
  return status.version ?? 'Installed'
}

// The table: CLI, then who is signed in and how. A card that is not signed in says No (Not yet while
// the browser is open, Unknown when the CLI will not start); a signed-in one lists what is known.
export function loginRows(status: ProviderStatus | null, phase: CardPhase): LoginRow[] {
  const rows: LoginRow[] = [{ label: 'CLI', value: cliValue(status, phase) }]
  if (status === null) return rows
  if (status.cli === 'broken') {
    rows.push({ label: 'Signed in', value: 'Unknown' })
    return rows
  }
  if (!status.loggedIn || phase === 'installing') {
    rows.push({ label: 'Signed in', value: phase === 'signing_in' ? 'Not yet' : 'No' })
    return rows
  }
  const account = status.account
  const keyed = status.method === 'api_key' || status.method === 'env'
  rows.push({
    label: 'Signed in as',
    value: keyed ? 'API key' : (account?.name ?? account?.email ?? 'Signed in')
  })
  if (!keyed && account?.name && account.email) rows.push({ label: 'Email', value: account.email })
  if (account?.plan) rows.push({ label: 'Plan', value: account.plan.toUpperCase(), style: 'plan' })
  rows.push({ label: 'How', value: howLabel(status.method, status.envVar) })
  if (keyed && status.keyMask) rows.push({ label: 'Key', value: status.keyMask, style: 'code' })
  return rows
}

// How many of the bar's segments are filled for the stage npm last reported. The bar is stepped and
// stands still between stages, so it needs no animation.
export function installFill(stage: string | null, total = 14): number {
  const share = (part: number): number => Math.max(1, Math.round(total * part))
  if (stage === null) return share(0.1)
  if (/fetching/i.test(stage)) return share(0.3)
  if (/unpacking/i.test(stage)) return share(0.65)
  if (/finishing/i.test(stage)) return share(0.9)
  return share(0.2)
}

// The countdown as a screen reader says it: "2 minutes 41 seconds left".
export function countdownSpeech(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  const part = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (minutes === 0) return `${part(rest, 'second')} left`
  return rest === 0
    ? `${part(minutes, 'minute')} left`
    : `${part(minutes, 'minute')} ${part(rest, 'second')} left`
}
