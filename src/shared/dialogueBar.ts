// What the collapsed dialogue bar shows (DESIGN.md, Collapsible dialogue box). Pure, so every
// state can be tested without a screen. The chip follows the mascot's shown state; the line
// follows what the open box would be showing (its `kind`), which is the same thing except for the
// 400ms the mascot holds a state and the boss moods.

import type { MascotStateName } from './mascotRules.ts'

// What the open dialogue box shows. The first match wins in this order: a request, reply text, a
// notice, work, a run in progress, nothing.
export type BoxKind = 'asking' | 'reply' | 'notice' | 'working' | 'thinking' | 'idle'

export type BarInput = {
  state: MascotStateName
  kind: BoxKind
  // Reply text is still typing out.
  typing: boolean
  // The first line of the reply, Markdown stripped to plain text.
  firstLine: string
  // The last line of the text typed so far.
  typedLine: string
  // "<agent> is working: <activity>" or the tool label.
  working: string
  // The notice's text and color: an error is --error, a stop or an info line is --muted.
  notice: { text: string; tone: 'error' | 'muted' } | null
  // Nothing has been sent in this chat yet.
  empty: boolean
}

export type BarLine =
  // Plain text; `tone` is its color; `cursor` draws the block cursor after it.
  | { type: 'text'; text: string; tone: 'text' | 'muted' | 'error'; cursor: boolean }
  // The cycling dots the box uses while thinking.
  | { type: 'dots' }

export type BarView = {
  // The state chip: IDLE, THINKING, TALKING, WORKING, ASKING, VICTORY or HURT.
  chip: string
  state: MascotStateName
  line: BarLine
  // " · full reply is in the history", beside the name, when the line is a finished reply's start.
  fullReplyNote: boolean
}

export const IDLE_PROMPT = 'What should we work on?'
export const FULL_REPLY_NOTE = '· full reply is in the history'
// Only for the 400ms after a request is answered, while the mascot still holds ASKING: the box
// cannot be collapsed while a request waits.
export const ASKING_LINE = 'Waiting for approval'

export function barView(input: BarInput): BarView {
  const { kind } = input
  let line: BarLine
  let fullReplyNote = false
  switch (kind) {
    case 'asking':
      line = { type: 'text', text: ASKING_LINE, tone: 'muted', cursor: false }
      break
    case 'reply':
      if (input.typing) {
        line = { type: 'text', text: input.typedLine, tone: 'text', cursor: true }
      } else {
        line = { type: 'text', text: input.firstLine, tone: 'text', cursor: false }
        fullReplyNote = true
      }
      break
    case 'notice':
      line = input.notice
        ? { type: 'text', text: input.notice.text, tone: input.notice.tone, cursor: false }
        : { type: 'text', text: '', tone: 'muted', cursor: false }
      break
    case 'working':
      line = { type: 'text', text: input.working, tone: 'text', cursor: false }
      break
    case 'thinking':
      line = { type: 'dots' }
      break
    default:
      line = input.empty
        ? { type: 'text', text: IDLE_PROMPT, tone: 'muted', cursor: false }
        : { type: 'text', text: '', tone: 'muted', cursor: false }
  }
  return { chip: input.state.toUpperCase(), state: input.state, line, fullReplyNote }
}
