// What the composer sends. Big pastes become chips in the input box and are put
// back into the message as fenced code blocks. splitFenced is the way back, so
// the chat history can draw those blocks as code boxes. Pure functions that import
// only images.ts, so the main process and the renderer can both use it.

import { formatBytes } from './images.ts'

export const PASTE_MAX_LINES = 20
export const PASTE_MAX_CHARS = 2000

// Lines are separated by \r\n, \r or \n. One trailing newline is ignored, so
// 'a' and 'a\n' are 1 line and 'a\n\n' is 2. '' is 0 lines; '\n' is 1.
export function countLines(text: string): number {
  if (text === '') return 0
  // A loop, not a match of every break: a paste of millions of lines would build a
  // huge array. `end` is where the last break ends.
  let breaks = 0
  let end = -1
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code !== 10 && code !== 13) continue
    // \r\n is one break.
    if (code === 13 && text.charCodeAt(i + 1) === 10) i++
    breaks++
    end = i + 1
  }
  return end === text.length ? breaks : breaks + 1
}

// A paste of more than PASTE_MAX_CHARS characters or PASTE_MAX_LINES lines. The
// length goes first: a long text needs no line count.
export function shouldChip(text: string): boolean {
  return text.length > PASTE_MAX_CHARS || countLines(text) > PASTE_MAX_LINES
}

// UTF-8 size with base-1024 units and one decimal: "512 B", "1.5 KB", "2.3 MB".
export function formatSize(text: string): string {
  return formatBytes(new TextEncoder().encode(text).length)
}

// A backtick fence longer than any run of backticks in the text, so nothing
// inside the text can close it early.
export function fenceFor(text: string): string {
  let longest = 0
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}

// Typed text that ends inside a fence nobody closed gets the closing fence, on its
// own line. Without it the pasted blocks after it would close it or sit inside it.
function closeOpenFence(typed: string): string {
  const length = openFenceLength(typed)
  if (length === 0) return typed
  return `${typed}${/[\r\n]$/.test(typed) ? '' : '\n'}${'`'.repeat(length)}`
}

// The text that is sent: what was typed, exactly as typed (when it is not
// blank, and with its last fence closed if it was left open), then each pasted
// chunk in its own fenced block, one blank line apart.
export function buildMessage(typed: string, pasted: string[]): string {
  if (pasted.length === 0) return typed
  const parts: string[] = []
  if (typed.trim() !== '') parts.push(closeOpenFence(typed))
  for (const chunk of pasted) {
    const fence = fenceFor(chunk)
    parts.push(`${fence}\n${chunk.replace(/\r?\n$/, '')}\n${fence}`)
  }
  return parts.join('\n\n')
}

export type MessageSegment =
  { kind: 'text'; text: string } | { kind: 'code'; text: string; language: string | null }

type Line = {
  start: number
  // The end of the line's text, before its line break.
  end: number
  // The start of the next line, after the line break.
  next: number
}

// A line of 3 or more backticks, up to 3 spaces in, with an info string that
// has no backtick in it.
const OPEN = /^ {0,3}(`{3,})([^`]*)$/
const CLOSE = /^ {0,3}(`{3,}) *$/

function splitLines(message: string): Line[] {
  const lines: Line[] = []
  const breaks = /\r\n|\r|\n/g
  let start = 0
  for (let hit = breaks.exec(message); hit !== null; hit = breaks.exec(message)) {
    const next = hit.index + hit[0].length
    lines.push({ start, end: hit.index, next })
    start = next
  }
  lines.push({ start, end: message.length, next: message.length })
  return lines
}

// The backtick count of the fence still open at the end of the message, or 0. A
// fence with no closing line after it stays open to the end, as in CommonMark. That
// is the first opener splitFenced leaves unclosed, so the two agree on when there is one.
function openFenceLength(message: string): number {
  let open = 0
  for (const line of splitLines(message)) {
    const text = message.slice(line.start, line.end)
    if (open === 0) {
      open = OPEN.exec(text)?.[1].length ?? 0
    } else {
      const close = CLOSE.exec(text)
      if (close && close[1].length >= open) open = 0
    }
  }
  return open
}

// Splits a message on fenced code blocks, CommonMark style. A fence that is
// never closed is not a code block: it stays in the text, unchanged.
export function splitFenced(message: string): MessageSegment[] {
  const lines = splitLines(message)
  const segments: MessageSegment[] = []
  let textStart = 0
  let afterCode = false
  // An opening fence of this length or more has no closing fence after it, so a
  // later one of the same size or longer cannot have one either.
  let unclosedFrom = Infinity

  const pushText = (end: number, beforeCode: boolean): void => {
    let text = message.slice(textStart, end)
    // The line breaks next to a code block are the blank lines buildMessage adds.
    if (afterCode) text = text.replace(/^[\r\n]+/, '')
    if (beforeCode) text = text.replace(/[\r\n]+$/, '')
    if (text !== '') segments.push({ kind: 'text', text })
  }

  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(message.slice(lines[i].start, lines[i].end))
    if (!open || open[1].length >= unclosedFrom) continue

    let close = -1
    for (let j = i + 1; j < lines.length && close === -1; j++) {
      const hit = CLOSE.exec(message.slice(lines[j].start, lines[j].end))
      if (hit && hit[1].length >= open[1].length) close = j
    }
    if (close === -1) {
      unclosedFrom = open[1].length
      continue
    }

    pushText(lines[i].start, true)
    segments.push({
      kind: 'code',
      text: close === i + 1 ? '' : message.slice(lines[i + 1].start, lines[close - 1].end),
      language: open[2].trim().split(/\s+/)[0] || null
    })
    textStart = lines[close].next
    afterCode = true
    i = close
  }
  pushText(message.length, false)
  return segments
}
