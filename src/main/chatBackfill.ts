import type { TranscriptMessage } from '../shared/chats.ts'
import { historyItems, type RecordedMessage } from './history.ts'

// A chat made before Mya kept its own text has only Claude Code's saved session. This reads the
// messages out of that session once, as plain text, so search and EXPORT .MD cover it too. The
// session does not say when each message was sent, so their time is 0, which reads as unknown.
// Pure: the SDK is called elsewhere.

export function transcriptFromSession(messages: RecordedMessage[]): TranscriptMessage[] {
  const items = historyItems(messages, {
    tasks: new Map(),
    agentFor: (name) => ({ name, scope: null, filePath: null, icon: null, role: null })
  })
  const out: TranscriptMessage[] = []
  for (const item of items) {
    if (item.kind === 'user') {
      out.push({
        role: 'user',
        text: item.text,
        at: 0,
        ...(item.imageCount > 0 ? { images: item.imageCount } : {}),
        ...(item.call ? { agent: item.call.name } : {})
      })
    } else if (item.kind === 'text') {
      out.push({ role: 'assistant', text: item.text, at: 0 })
    }
  }
  return out
}
