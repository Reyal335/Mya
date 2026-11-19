// The pure parts of LOGINS: the sign-in clock, the words of its errors, and how the output of the
// CLIs and of npm is read. Main and the window share them, and they are tested without a screen.

// A browser sign-in is given three minutes, and then it stops waiting.
export const SIGN_IN_TIMEOUT_MS = 180_000

export type ProviderErrorCode =
  | 'install_failed'
  | 'timeout'
  // CANCEL was pressed: nothing to report.
  | 'cancelled'
  // The browser side said no.
  | 'browser_cancelled'
  | 'key_rejected'
  | 'wont_start'
  | 'not_installed'
  | 'env_key'
  | 'sign_in_failed'

// --- The sign-in clock ----------------------------------------------------------------------

export function remainingMs(startedAt: number, now: number, total = SIGN_IN_TIMEOUT_MS): number {
  return Math.max(0, startedAt + total - now)
}

export function signInExpired(startedAt: number, now: number, total = SIGN_IN_TIMEOUT_MS): boolean {
  return remainingMs(startedAt, now, total) === 0
}

// "3:00" at the start, "0:01" with a second left. A part of a second counts as the second.
export function countdownLabel(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${rest < 10 ? `0${rest}` : rest}`
}

// The countdown is read out at most every 30 seconds (3:00, 2:30, ...), never every tick.
export function announcement(ms: number): string | null {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return seconds > 0 && seconds % 30 === 0
    ? `${countdownLabel(ms)} left to finish signing in`
    : null
}

// --- What the errors say ------------------------------------------------------------------------

export const TIMEOUT_MESSAGE = 'Sign-in timed out after 3 minutes. Try again.'
export const BROWSER_CANCELLED_MESSAGE = 'Sign-in was cancelled in the browser.'

export function installFailedMessage(exitCode: number | null): string {
  return `Install failed. npm exited with code ${exitCode ?? 'unknown'}.`
}

export function keyRejectedMessage(providerName: string): string {
  return `${providerName} didn't accept this key. Check it and paste it again.`
}

export function wontStartMessage(binary: string): string {
  return `Couldn't run ${binary} --version. Reinstall the CLI.`
}

export function envKeySignOutMessage(variable: string): string {
  return `Set outside Mya. To sign out, remove ${variable} and restart Mya.`
}

// --- Reading what the CLIs print -------------------------------------------------------------------

// Whether a browser sign-in that ended without a login ended because the person said no there.
export function cancelledInBrowser(output: string): boolean {
  return /\b(cancel(?:l)?ed|denied|access_denied|declined|rejected by user)\b/i.test(output)
}

// A command that would not run: it is not on this computer, or it is there and does not start.
export function classifyCliFailure(output: string): 'missing' | 'broken' {
  // A Node program that starts and then cannot find its own module is installed but broken.
  if (/Cannot find module/i.test(output)) return 'broken'
  return /is not recognized|not found|ENOENT|No such file|cannot find the (?:file|path)/i.test(
    output
  )
    ? 'missing'
    : 'broken'
}

// A line of npm's output as the one-line stage the install bar shows, or null for one that says
// nothing.
export function installStage(line: string): string | null {
  const text = line.trim()
  if (text === '') return null
  if (/http fetch|fetch(?:ing)?|GET /i.test(text)) return 'npm: fetching packages'
  if (/reify|idealTree|building|linking|extract/i.test(text)) return 'npm: unpacking packages'
  if (/^added \d+|changed \d+|up to date/i.test(text)) return 'npm: finishing'
  if (/ERR!|error/i.test(text)) return 'npm: hit an error'
  const plain = text.replace(/^npm\s+/i, '')
  return `npm: ${plain.length > 60 ? `${plain.slice(0, 57)}...` : plain}`
}

// How a CLI is signed in, as LOGINS and ACCOUNT say it.
export function howLabel(
  method: 'oauth' | 'api_key' | 'env' | null,
  envVar: string | null
): string {
  if (method === 'oauth') return 'Browser'
  if (method === 'api_key') return 'API key, saved by Mya'
  if (method === 'env') return `Environment key (${envVar ?? 'environment'})`
  return 'Not signed in'
}

export function packageFor(provider: 'codex' | 'gemini'): string {
  return provider === 'codex' ? '@openai/codex' : '@google/gemini-cli'
}

export function binaryFor(provider: 'codex' | 'gemini'): string {
  return provider === 'codex' ? 'codex' : 'gemini'
}

export function envVarsFor(provider: 'codex' | 'gemini'): string[] {
  return provider === 'codex'
    ? ['OPENAI_API_KEY', 'CODEX_API_KEY']
    : ['GEMINI_API_KEY', 'GOOGLE_API_KEY']
}
