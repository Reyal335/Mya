// Chats: the shapes main and the window share. Pure: no imports but types.
//
// A project keeps many chats. Each belongs to one provider for its whole life (once it has a
// first message), and has a title, a time, a count, and a pin. The window gets summaries; the
// session ids and the saved choices stay in main.

import type { ProviderId } from './models'

export const DEFAULT_CHAT_TITLE = 'New chat'

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini'
}

export type ChatSummary = {
  id: string
  provider: ProviderId
  title: string
  createdAt: number
  updatedAt: number
  // Messages Mya has: mine and the replies, not tool cards.
  messageCount: number
  pinned: boolean
}

// The project's chats in list order (pinned first), and which one is open.
export type ChatList = { chats: ChatSummary[]; openId: string | null }

export type ChatsErrorCode =
  'no_project' | 'busy' | 'not_found' | 'invalid' | 'unsupported' | 'not_ready' | 'io_error'

export type ChatsError = { code: ChatsErrorCode; message: string }

export type ChatsResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: ChatsError }

export const BUSY_MESSAGE = 'Wait for the reply, or press STOP.'

// What a new chat of each provider starts on, as the NEW CHAT card says it: "GPT-5.5 · MED". The
// level is null for a model with none.
export type ProviderStart = { model: string; level: string | null }
export type ChatStarts = Record<ProviderId, ProviderStart>

// --- Search ---------------------------------------------------------------------------

export type SearchSnippet = { before: string; match: string; after: string }

// A title that matched, with the [start, end) ranges to mark.
export type TitleHit = { chatId: string; ranges: [number, number][] }

// A chat whose messages matched: the best message, by its place in the chat.
// `anchor` is the start of that message's text, for finding it in the opened chat.
export type MessageHit = { chatId: string; index: number; snippet: SearchSnippet; anchor: string }

export type ChatSearchResults = { titles: TitleHit[]; messages: MessageHit[] }

// --- What Mya keeps of a conversation ----------------------------------------------------

export type TranscriptMessage = {
  role: 'user' | 'assistant'
  text: string
  at: number
  // How many pasted images a message of mine had. The images are not kept.
  images?: number
  // The agent I called for the message, by name.
  agent?: string
}
