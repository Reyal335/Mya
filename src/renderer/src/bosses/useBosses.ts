import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BossPack } from '../../../shared/bosses'
import { DEFAULT_PACKS, entriesFrom, type BossEntry } from './packs'

export type BossesState = {
  // Every boss and problem folder, for the manager.
  entries: BossEntry[]
  // The bosses a fight can be drawn with: the valid ones. Before main has answered it is the
  // built-in three, so nothing is missing for a moment.
  packs: BossPack[]
  // Main has answered at least once. A fight is not drawn before this, so a custom boss is
  // never shown as The Red Suite while the list is on its way.
  loaded: boolean
  error: string | null
  reload: () => Promise<void>
}

const BUILT_IN_ENTRIES: BossEntry[] = DEFAULT_PACKS.map((pack) => ({
  kind: 'boss',
  pack,
  builtIn: true,
  inPool: true,
  idleFile: null,
  backgroundInfo: null,
  inFight: false
}))

// The bosses, as main has them. Main tells every window after a boss is added, changed,
// deleted, or its POOL toggled, so a new name, accent, loop, or background shows at once. The
// list is read from disk on each call, so there is no reload on focus.
export function useBosses(): BossesState {
  const [entries, setEntries] = useState<BossEntry[]>(BUILT_IN_ENTRIES)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only the latest request may update the list.
  const latest = useRef(0)

  const reload = useCallback((): Promise<void> => {
    const request = ++latest.current
    return window.mya.bosses.list().then(
      (result) => {
        if (request !== latest.current) return
        if (result.ok) {
          setEntries(entriesFrom(result.bosses))
          setError(null)
        } else {
          setError(result.error.message)
        }
        setLoaded(true)
      },
      (err: unknown) => {
        console.error('Could not list the bosses:', err)
        if (request !== latest.current) return
        setError('The bosses could not be loaded.')
        setLoaded(true)
      }
    )
  }, [])

  useEffect(() => {
    void reload()
    const unsubscribe = window.mya.bosses.onChanged(() => void reload())
    return () => {
      latest.current += 1
      unsubscribe()
    }
  }, [reload])

  const packs = useMemo(
    () => entries.flatMap((entry) => (entry.kind === 'boss' ? [entry.pack] : [])),
    [entries]
  )
  return { entries, packs, loaded, error, reload }
}
