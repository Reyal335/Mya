import type { BoxKind } from '../../../shared/dialogueBar'

// What the open dialogue box shows. The first match wins: a request, then the last reply text,
// then a notice, then work, then a run in progress, then nothing. The collapsed bar's line follows
// the same answer, so the two never disagree.
export function boxKind({
  request,
  reply,
  notice,
  working,
  running
}: {
  request: boolean
  reply: boolean
  notice: boolean
  working: boolean
  running: boolean
}): BoxKind {
  if (request) return 'asking'
  if (reply) return 'reply'
  if (notice) return 'notice'
  if (working) return 'working'
  if (running) return 'thinking'
  return 'idle'
}
