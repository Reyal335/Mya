import { ANCHOR_LENGTH } from '../../../shared/chatSearch.ts'

// A search hit in the messages: once its chat is open, the history scrolls to the message that
// starts with `anchor`. A new tick asks again.
export type ScrollTarget = { chatId: string; anchor: string; tick: number }

type Anchorable = { id: number; kind: string; text?: string }

// The same one-line form main made the anchor in.
export function anchorOf(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, ANCHOR_LENGTH)
}

// The id of the first message or reply in the history that the anchor names, or null (the chat
// shows only its last 200 messages, and a Codex or Gemini chat shows none).
export function findAnchored(items: readonly Anchorable[], anchor: string): number | null {
  if (anchor === '') return null
  for (const item of items) {
    if ((item.kind === 'user' || item.kind === 'text') && anchorOf(item.text ?? '') === anchor) {
      return item.id
    }
  }
  return null
}
