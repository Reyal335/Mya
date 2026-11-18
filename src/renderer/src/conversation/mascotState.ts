import type { ConversationItem, ConversationStatus } from '../hooks/useConversation'
import type { MascotStateName } from '../mascots/types'

export type MascotStateInput = {
  items: ConversationItem[]
  status: ConversationStatus
  // True while reply text is still typing out in the dialogue box.
  typing: boolean
  // A boss battle: hurt for 1.2 seconds after a round with heals, victory for 3 seconds
  // after a win. Both rank just below asking.
  mood?: 'hurt' | 'victory' | null
}

// What the mascot shows. The first rule that matches wins.
export function mascotState({
  items,
  status,
  typing,
  mood = null
}: MascotStateInput): MascotStateName {
  if (items.some((item) => item.kind === 'tool' && item.permission !== null)) return 'asking'
  if (mood) return mood
  // A running agent counts as a running tool.
  if (
    items.some(
      (item) =>
        (item.kind === 'tool' && item.state === 'running') ||
        (item.kind === 'task' && item.status === 'running')
    )
  ) {
    return 'working'
  }
  if (typing) return 'talking'
  if (status === 'running' || status === 'waiting') return 'thinking'
  return 'idle'
}
