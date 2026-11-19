import { DEFAULT_CHAT_TITLE } from './chats.ts'

// A chat's title is the first line of its first message, cut to 40 characters at a word
// boundary. Until there is one it is "New chat".

export const TITLE_MAX = 40

// The first line that has text, with runs of white space made one space.
function firstLine(text: string): string {
  for (const line of text.split(/\r\n|\r|\n/)) {
    const tidy = line.replace(/\s+/g, ' ').trim()
    if (tidy !== '') return tidy
  }
  return ''
}

export function makeTitle(text: string): string {
  const line = firstLine(text)
  if (line === '') return DEFAULT_CHAT_TITLE
  // Counted in characters, not UTF-16 units, so a cut never splits an emoji.
  const chars = Array.from(line)
  if (chars.length <= TITLE_MAX) return line
  // A space right after the limit means the 40 characters end on a word.
  if (chars[TITLE_MAX] === ' ') return chars.slice(0, TITLE_MAX).join('').trimEnd()
  const cut = chars.slice(0, TITLE_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).join('').trimEnd()
}

// A name typed in RENAME: trimmed, on one line, and not empty. null means no change.
export function cleanRename(raw: string, current: string): string | null {
  const title = raw.replace(/\s+/g, ' ').trim()
  if (title === '' || title === current) return null
  return Array.from(title).slice(0, 120).join('')
}
