import { PROVIDER_NAMES, type TranscriptMessage } from './chats.ts'
import type { ProviderId } from './models.ts'

// EXPORT .MD: the messages Mya has for a chat, as Markdown. Pure.

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function stamp(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}

export function chatToMarkdown(
  chat: { title: string; provider: ProviderId; createdAt: number },
  messages: TranscriptMessage[],
  speaker: string
): string {
  const provider = PROVIDER_NAMES[chat.provider]
  const count = messages.length
  const lines = [
    `# ${chat.title.replace(/\s+/g, ' ').trim()}`,
    '',
    `${provider} chat · started ${stamp(chat.createdAt)} · ${count} ${count === 1 ? 'message' : 'messages'}`
  ]
  for (const message of messages) {
    // A time of 0 means it is not known (a chat read back from a saved Claude Code session).
    const when = message.at > 0 ? ` · ${stamp(message.at)}` : ''
    lines.push('', `## ${message.role === 'user' ? 'You' : speaker}${when}`, '')
    if (message.agent) lines.push(`_Agent called: ${message.agent}_`, '')
    const text = message.text.replace(/\r\n?/g, '\n').trim()
    if (text !== '') lines.push(text)
    if (message.images && message.images > 0) {
      lines.push(
        ...(text === '' ? [] : ['']),
        `_${message.images} ${message.images === 1 ? 'image' : 'images'} attached_`
      )
    }
  }
  return `${lines.join('\n')}\n`
}

// A file name for the save dialog: the title with what Windows and other systems refuse
// taken out.
export function exportFileName(title: string): string {
  const tidy = title
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  const cut = Array.from(tidy).slice(0, 60).join('').trim()
  // Windows keeps these names for devices.
  const safe = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cut) ? `${cut}_` : cut
  return `${safe === '' ? 'chat' : safe}.md`
}
