import type { MascotLoop, MascotLoops } from '../../../shared/ipc'
import { STATE_FALLBACK, type MascotStateName } from '../../../shared/mascotRules'

export type { MascotLoop, MascotStateName }

// A mascot has one loop per state. idle is required; a state without a loop plays idle.
export type Mascot = {
  name: string
  // False only for the built-in default that has not been given a name of its own: its
  // "Default" is a placeholder, so the chat keeps speaking as Claude (see speakerName).
  named: boolean
  loops: MascotLoops
}

// The one place a missing state falls back: victory to talking, everything else to idle.
export function loopFor(mascot: Mascot, state: MascotStateName): MascotLoop {
  const fallback = STATE_FALLBACK[state]
  return mascot.loops[state] ?? (fallback ? mascot.loops[fallback] : undefined) ?? mascot.loops.idle
}
