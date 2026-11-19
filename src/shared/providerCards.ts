// What the NEW CHAT dialog's cards say, as pure rules: whether a provider can start a chat, and
// which line goes above the buttons. Tested without a screen.

import { PROVIDER_NAMES } from './chats.ts'
import type { ProviderId } from './models.ts'
import { PROVIDERS } from './providers.ts'

// A card is CHECKING while the answer is on its way, ready when a chat can start on that provider,
// and otherwise says why it cannot.
export type CardState = 'checking' | 'ready' | 'signed_out' | 'not_installed'

// The two things a card needs to know about a provider: the Claude Code login (from the account) and
// the CLI's status (from LOGINS). `null` means the answer has not come yet.
export type CardFacts = {
  // Claude: 'signed_in', or anything else read from the account. null: not read yet.
  claude: 'signed_in' | 'signed_out' | null
  cli: { installed: boolean; loggedIn: boolean } | null
}

export function cardState(provider: ProviderId, facts: CardFacts): CardState {
  if (provider === 'claude') {
    if (facts.claude === null) return 'checking'
    return facts.claude === 'signed_in' ? 'ready' : 'signed_out'
  }
  if (facts.cli === null) return 'checking'
  if (!facts.cli.installed) return 'not_installed'
  return facts.cli.loggedIn ? 'ready' : 'signed_out'
}

export const STATUS_TEXT: Record<CardState, string> = {
  checking: 'CHECKING...',
  ready: 'SIGNED IN',
  signed_out: 'SIGNED OUT',
  not_installed: 'NOT INSTALLED'
}

// "Looking for the Gemini CLI." under a card that is still checking. Claude is read from Claude
// Code, which has no CLI to look for.
export function checkingLine(provider: ProviderId): string {
  return provider === 'claude'
    ? 'Looking for the Claude Code login.'
    : `Looking for the ${PROVIDER_NAMES[provider]} CLI.`
}

export const CANNOT_START_LINE = "Can't start a chat yet."

export function startLabel(provider: ProviderId): string {
  return `START ${PROVIDERS[provider].label} CHAT`
}

// The line above the buttons. Starting on the same provider says the chat moves to HISTORY;
// switching adds that the new provider won't see the old chat; a chat that is still empty moves
// nowhere, so it has no line at all.
export function confirmLines(args: {
  current: ProviderId | null
  target: ProviderId
  openIsEmpty: boolean
}): { main: string | null; note: string | null } {
  if (args.current === null || args.openIsEmpty) return { main: null, note: null }
  const main = 'Start a new conversation? The current one moves to HISTORY.'
  if (args.current === args.target) return { main, note: null }
  return {
    main,
    note: `${PROVIDER_NAMES[args.target]} won't see your ${PROVIDER_NAMES[args.current]} chat.`
  }
}

// Which card is selected when the dialog opens: the current provider when it can start a chat, else
// the first that can, else none.
export function initialSelection(
  current: ProviderId | null,
  states: Record<ProviderId, CardState>,
  order: readonly ProviderId[]
): ProviderId | null {
  if (current !== null && states[current] === 'ready') return current
  return order.find((provider) => states[provider] === 'ready') ?? null
}
