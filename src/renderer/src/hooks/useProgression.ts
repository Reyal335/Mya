import { useCallback, useEffect, useState } from 'react'
import type { AchievementsData, Equipped, RewardKind } from '../../../shared/achievements'
import type { AgentSummary } from '../../../shared/ipc'
import type { AgentProgress } from '../../../shared/progression'

const NOTHING: Equipped = { title: null, accessory: null }

export type Progression = {
  data: AchievementsData | null
  equipped: Equipped
  // An unlock not yet seen on the ACHIEVEMENTS screen: the nav item's red dot.
  unseen: boolean
  equip: (kind: RewardKind, id: string | null) => Promise<void>
  markSeen: () => Promise<void>
}

// Achievements and what is equipped, as main has them. Reloads whenever main says
// progression changed.
export function useProgression(): Progression {
  const [data, setData] = useState<AchievementsData | null>(null)

  const reload = useCallback(() => {
    window.mya.progression
      .achievements()
      .then(setData)
      .catch((err: unknown) => console.error('Could not read the achievements:', err))
  }, [])

  useEffect(() => {
    reload()
    return window.mya.progression.onChanged(reload)
  }, [reload])

  const equip = useCallback(async (kind: RewardKind, id: string | null): Promise<void> => {
    try {
      await window.mya.progression.equip({ kind, id })
    } catch (err) {
      console.error('Could not equip:', err)
    }
  }, [])

  const markSeen = useCallback(async (): Promise<void> => {
    try {
      await window.mya.progression.markAchievementsSeen()
    } catch (err) {
      console.error('Could not mark the achievements seen:', err)
    }
  }, [])

  return {
    data,
    equipped: data?.equipped ?? NOTHING,
    unseen: data?.achievements.some((entry) => entry.unlockedAt !== null && !entry.seen) ?? false,
    equip,
    markSeen
  }
}

// Class and level per agent file in the list, keyed by filePath. Asked again when the
// list changes and when main says progression changed. Asking is also when main
// checks PARTY OF 5 and FULL PARTY.
export function useAgentProgress(agents: AgentSummary[]): Record<string, AgentProgress> {
  const [progress, setProgress] = useState<Record<string, AgentProgress>>({})
  // Only the files matter: a new list with the same files asks nothing new.
  const files = agents.map((agent) => agent.filePath).join('\n')

  useEffect(() => {
    let disposed = false
    const load = (): void => {
      window.mya.progression
        .agentsSummary()
        .then((result) => {
          if (!disposed && result.ok) setProgress(result.agents)
        })
        .catch((err: unknown) => console.error('Could not read the agent levels:', err))
    }
    load()
    const unsubscribe = window.mya.progression.onChanged(load)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [files])

  return progress
}
