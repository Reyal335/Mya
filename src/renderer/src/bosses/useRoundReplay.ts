import { useEffect, useState } from 'react'
import type { BossStateName, Fight, FightRound } from '../../../shared/bosses'

// The round replay: the fight in main is already final, and this only shows it again a
// hit at a time. Hits 120ms apart (evenly within 2 seconds past 16), each a "−1" pop, the
// hit loop for 200ms, and the bar down by one; then "<n> HIT COMBO!" for 1.5 seconds,
// then heals; a victory ends on the defeated loop. Reduced motion shows the end at once.

export const HIT_GAP_MS = 120
export const MAX_HITS_MS = 2_000
export const HIT_LOOP_MS = 200
export const POP_MS = 600
export const COMBO_MS = 1_500
export const HITS_BADGE_MS = 2_000

export type Pop = { id: number; text: '−1' | '+1'; x: number; y: number }

export type ReplayView = {
  hp: number
  sprite: BossStateName
  pops: Pop[]
  // "<n> HIT COMBO!" above the sprite.
  combo: number | null
  // "<n> HITS" in the BOSS tab's box.
  hitsBadge: number | null
}

export function gapFor(hits: number): number {
  return hits > 16 ? MAX_HITS_MS / hits : HIT_GAP_MS
}

function restSprite(fight: Fight | null): BossStateName {
  return fight?.status === 'defeated' ? 'defeated' : 'idle'
}

function rest(fight: Fight | null): ReplayView {
  return { hp: fight?.hp ?? 0, sprite: restSprite(fight), pops: [], combo: null, hitsBadge: null }
}

// A spot around the sprite's edge, in percent of its box.
function edgeSpot(): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2
  return { x: 50 + Math.cos(angle) * 42, y: 45 + Math.sin(angle) * 38 }
}

let nextPop = 1

export function useRoundReplay(
  fight: Fight | null,
  replay: { round: FightRound; tick: number } | null,
  reducedMotion: boolean
): ReplayView {
  // A round already there when this view opened is not replayed.
  const [seen, setSeen] = useState(replay?.tick ?? 0)
  const [playing, setPlaying] = useState<ReplayView | null>(null)
  const round = replay?.round ?? null
  const tick = replay?.tick ?? 0

  // A new round starts from the HP before it. With reduced motion it is not played.
  if (tick !== seen) {
    setSeen(tick)
    setPlaying(
      round && !reducedMotion && (round.hits.length > 0 || round.heals.length > 0)
        ? {
            hp: round.hpBefore,
            sprite: 'idle',
            pops: [],
            combo: null,
            hitsBadge: round.hits.length > 0 ? round.hits.length : null
          }
        : null
    )
  }

  useEffect(() => {
    if (!round || tick === 0 || reducedMotion) return
    const hits = round.hits.length
    const heals = round.heals.length
    if (hits === 0 && heals === 0) return
    const timers: number[] = []
    const at = (ms: number, change: (view: ReplayView) => ReplayView): void => {
      timers.push(window.setTimeout(() => setPlaying((view) => (view ? change(view) : view)), ms))
    }
    const pop = (ms: number, text: Pop['text']): void => {
      const id = nextPop++
      at(ms, (view) => ({ ...view, pops: [...view.pops, { id, text, ...edgeSpot() }] }))
      at(ms + POP_MS, (view) => ({ ...view, pops: view.pops.filter((p) => p.id !== id) }))
    }
    const gap = gapFor(hits)
    for (let i = 0; i < hits; i++) {
      const ms = i * gap
      pop(ms, '−1')
      at(ms, (view) => ({ ...view, hp: Math.max(0, view.hp - 1), sprite: 'hit' }))
      at(ms + HIT_LOOP_MS, (view) => ({ ...view, sprite: 'idle' }))
    }
    let end = hits > 0 ? (hits - 1) * gap + HIT_LOOP_MS : 0
    if (hits > 0) {
      at(end, (view) => ({ ...view, combo: hits }))
      at(end + COMBO_MS, (view) => ({ ...view, combo: null }))
    }
    for (let i = 0; i < heals; i++) {
      const ms = end + i * HIT_GAP_MS
      pop(ms, '+1')
      at(ms, (view) => ({ ...view, hp: view.hp + 1, sprite: 'heal' }))
      at(ms + HIT_LOOP_MS, (view) => ({ ...view, sprite: 'idle' }))
    }
    if (heals > 0) end += (heals - 1) * HIT_GAP_MS + HIT_LOOP_MS
    if (round.kind === 'victory') at(end, (view) => ({ ...view, sprite: 'defeated' }))
    at(HITS_BADGE_MS, (view) => ({ ...view, hitsBadge: null }))
    // Done: back to the fight as main has it.
    timers.push(
      window.setTimeout(
        () => setPlaying(null),
        Math.max(end + POP_MS, hits > 0 ? end + COMBO_MS : 0, HITS_BADGE_MS)
      )
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [tick, round, reducedMotion])

  return playing ?? rest(fight)
}
