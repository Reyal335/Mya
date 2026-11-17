import { useCallback, useEffect, useRef, useState } from 'react'
import type { Fight, FightRound } from '../../../shared/bosses'

export const HURT_MS = 1_200
export const VICTORY_MS = 3_000

export type BossMood = 'hurt' | 'victory' | null

export type BossFightStore = {
  // The open conversation's key, null before it has one.
  key: string | null
  current: Fight | null
  // Fights this conversation finished before, for their notices and end cards.
  past: Fight[]
  // The latest round, to replay. A new tick is a new round.
  replay: { round: FightRound; tick: number } | null
  // The mascot plays hurt after a round with heals, victory after a win.
  mood: BossMood
  fightOn: () => Promise<boolean>
  dismiss: () => Promise<void>
}

// The open project's fight, as main has it. Main sends an event after every change; a
// round in the event is replayed by the BOSS tab and the battle view.
export function useBossFight(projectPath: string | null): BossFightStore {
  const [data, setData] = useState<{ key: string | null; current: Fight | null; past: Fight[] }>({
    key: null,
    current: null,
    past: []
  })
  const [replay, setReplay] = useState<BossFightStore['replay']>(null)
  const [mood, setMood] = useState<BossMood>(null)
  const moodTimer = useRef<number | null>(null)
  const latest = useRef(0)

  const reload = useCallback((): void => {
    const request = ++latest.current
    window.mya.bosses
      .fight()
      .then((next) => {
        if (request === latest.current) setData(next)
      })
      .catch((err: unknown) => console.error('Could not read the boss fight:', err))
  }, [])

  const showMood = useCallback((next: BossMood, ms: number): void => {
    if (moodTimer.current !== null) window.clearTimeout(moodTimer.current)
    setMood(next)
    moodTimer.current = window.setTimeout(() => {
      moodTimer.current = null
      setMood(null)
    }, ms)
  }, [])

  // A different project: its own conversation and fight. Nothing from the last one replays.
  useEffect(() => {
    reload()
    return () => {
      latest.current += 1
      setReplay(null)
    }
  }, [projectPath, reload])

  useEffect(
    () =>
      window.mya.bosses.onFight((event) => {
        // A fight of another project, or one that went away: read what is open now.
        if (!event.fight || event.fight.projectPath !== projectPath) {
          reload()
          return
        }
        const fight = event.fight
        setData((current) => ({
          key: event.key,
          current: fight,
          past: current.key === event.key ? current.past : []
        }))
        if (event.round) {
          const round = event.round
          setReplay((current) => ({ round, tick: (current?.tick ?? 0) + 1 }))
          if (round.kind === 'victory') showMood('victory', VICTORY_MS)
          else if (round.heals.length > 0) showMood('hurt', HURT_MS)
        }
        // An archived fight moves to the past: read it again for its notices.
        if (event.round?.kind === 'encounter') reload()
      }),
    [projectPath, reload, showMood]
  )

  useEffect(
    () => () => {
      if (moodTimer.current !== null) window.clearTimeout(moodTimer.current)
    },
    []
  )

  const fightOn = useCallback(async (): Promise<boolean> => {
    try {
      return (await window.mya.bosses.fightOn()).ok
    } catch (err) {
      console.error('Could not resume the fight:', err)
      return false
    }
  }, [])

  const dismiss = useCallback(async (): Promise<void> => {
    try {
      await window.mya.bosses.dismiss()
    } catch (err) {
      console.error('Could not dismiss the fight:', err)
    }
  }, [])

  return { ...data, replay, mood, fightOn, dismiss }
}
