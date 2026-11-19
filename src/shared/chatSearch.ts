import type { ChatSearchResults, MessageHit, SearchSnippet, TitleHit } from './chats.ts'

// Search over a project's chats. Titles come first, then the text of the messages Mya keeps.
// Pure: main reads the transcripts and hands the text in.

export type SearchableChat = { id: string; title: string; updatedAt: number }
export type SearchableMessage = { index: number; text: string }

export const RESULT_LIMIT = 50
const SNIPPET_BEFORE = 12
const SNIPPET_AFTER = 44
export const ANCHOR_LENGTH = 160

// Lower case that never changes a string's length, so an index in the folded text is an index
// in the original. A letter whose lower case is longer (a dotted capital I) stays as it is.
function fold(text: string): string {
  return Array.from(text, (char) => {
    const lower = char.toLowerCase()
    return lower.length === char.length ? lower : char
  }).join('')
}

const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char)

// 0 when the match opens the text, 1 when it opens a word, 2 when it is inside one.
function placeScore(folded: string, at: number): number {
  if (at === 0) return 0
  return isWordChar(folded[at - 1]) ? 2 : 1
}

type Found = { at: number; score: number }

// The best place `needle` (already folded) occurs in `text`, or null.
function bestMatch(text: string, needle: string): Found | null {
  const folded = fold(text)
  let best: Found | null = null
  let from = 0
  for (;;) {
    const at = folded.indexOf(needle, from)
    if (at < 0) return best
    const score = placeScore(folded, at)
    if (best === null || score < best.score) best = { at, score }
    if (score === 0) return best
    from = at + 1
  }
}

function allRanges(text: string, needle: string): [number, number][] {
  const folded = fold(text)
  const ranges: [number, number][] = []
  let from = 0
  for (;;) {
    const at = folded.indexOf(needle, from)
    if (at < 0) return ranges
    ranges.push([at, at + needle.length])
    from = at + needle.length
  }
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ')

// One line around the match: a little before it, the match, and more after it.
export function snippetOf(text: string, at: number, length: number): SearchSnippet {
  const flat = oneLine(text)
  // Collapsing white space moves the match: find where it landed.
  const lead = oneLine(text.slice(0, at)).length
  const start = Math.min(lead, flat.length)
  let before = flat.slice(Math.max(0, start - SNIPPET_BEFORE), start)
  const cutBefore = start - SNIPPET_BEFORE > 0
  // A cut in the middle of a word starts the snippet at the next whole word.
  if (cutBefore && flat[start - SNIPPET_BEFORE - 1] !== ' ') {
    const space = before.indexOf(' ')
    if (space >= 0) before = before.slice(space + 1)
  }
  const matchEnd = Math.min(flat.length, start + length)
  const match = flat.slice(start, matchEnd)
  const after = flat.slice(matchEnd, matchEnd + SNIPPET_AFTER)
  return {
    before: (cutBefore ? '…' : '') + before.trimStart(),
    match,
    after: after.trimEnd() + (matchEnd + SNIPPET_AFTER < flat.length ? '…' : '')
  }
}

export function searchChats(
  rawQuery: string,
  chats: SearchableChat[],
  messages: ReadonlyMap<string, SearchableMessage[]>,
  limit: number = RESULT_LIMIT
): ChatSearchResults {
  const query = rawQuery.replace(/\s+/g, ' ').trim()
  if (query === '') return { titles: [], messages: [] }
  const needle = fold(query)

  const titled: { hit: TitleHit; score: number; updatedAt: number }[] = []
  const titledIds = new Set<string>()
  for (const chat of chats) {
    const found = bestMatch(chat.title, needle)
    if (!found) continue
    titledIds.add(chat.id)
    titled.push({
      hit: { chatId: chat.id, ranges: allRanges(chat.title, needle) },
      score: found.score,
      updatedAt: chat.updatedAt
    })
  }
  titled.sort((a, b) => a.score - b.score || b.updatedAt - a.updatedAt)

  const inMessages: { hit: MessageHit; score: number; updatedAt: number }[] = []
  for (const chat of chats) {
    // A chat already listed by its title is not listed again by its text.
    if (titledIds.has(chat.id)) continue
    let best: { message: SearchableMessage; found: Found } | null = null
    for (const message of messages.get(chat.id) ?? []) {
      const found = bestMatch(message.text, needle)
      if (!found) continue
      // The better place wins; between equal places, the later message.
      if (best === null || found.score < best.found.score || found.score === best.found.score) {
        best = { message, found }
      }
    }
    if (!best) continue
    inMessages.push({
      hit: {
        chatId: chat.id,
        index: best.message.index,
        snippet: snippetOf(best.message.text, best.found.at, needle.length),
        anchor: oneLine(best.message.text).trim().slice(0, ANCHOR_LENGTH)
      },
      score: best.found.score,
      updatedAt: chat.updatedAt
    })
  }
  inMessages.sort((a, b) => a.score - b.score || b.updatedAt - a.updatedAt)

  return {
    titles: titled.slice(0, limit).map((entry) => entry.hit),
    messages: inMessages.slice(0, limit).map((entry) => entry.hit)
  }
}
