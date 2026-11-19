import { useEffect, useSyncExternalStore } from 'react'
import type { ProvidersStatusResult } from '../../../shared/ipc'

// What LOGINS knows about Codex and Gemini: whether each CLI is installed and signed in. Kept for
// the whole session and shared by everything that shows it (the NEW CHAT cards, LOGINS, ACCOUNT),
// so switching between them never flashes CHECKING again.
let cached: ProvidersStatusResult | null = null
let reading = false
let inFlight: Promise<void> | null = null
let readId = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function publish(next: ProvidersStatusResult): void {
  cached = next
  emit()
}

// An action's answer (an install, a sign-in, a sign-out) carries the new status: show it everywhere
// at once, even when no screen is using the hook at that moment.
export function publishProvidersStatus(next: ProvidersStatusResult): void {
  publish(next)
}

// Reads from the CLIs. Screens that open together share one read; `force` (REFRESH STATUS) skips both
// that and main's own short memory of the last read.
function readStatus(force = false): Promise<void> {
  if (inFlight && !force) return inFlight
  // A newer read replaces this one: only the last to start says when reading is over.
  const id = ++readId
  reading = true
  emit()
  const started = (async (): Promise<void> => {
    try {
      publish(await window.mya.providers.status(force))
    } catch (err) {
      console.error('Could not read the sign-ins:', err)
    } finally {
      if (id === readId) {
        inFlight = null
        reading = false
        emit()
      }
    }
  })()
  inFlight = started
  return started
}

export type ProvidersStatusStore = {
  // null until the first answer.
  status: ProvidersStatusResult | null
  // True while a read is on its way.
  reading: boolean
  // Reads again from the CLIs (REFRESH STATUS).
  refresh: (force?: boolean) => Promise<void>
  // An action's answer carries the new status: take it as it is.
  update: (next: ProvidersStatusResult) => void
}

export function useProvidersStatus(readOnMount = true): ProvidersStatusStore {
  const status = useSyncExternalStore(subscribe, () => cached)
  const isReading = useSyncExternalStore(subscribe, () => reading)

  useEffect(() => {
    if (readOnMount) void readStatus(false)
  }, [readOnMount])

  return { status, reading: isReading, refresh: readStatus, update: publish }
}
