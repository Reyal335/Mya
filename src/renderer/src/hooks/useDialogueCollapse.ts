import { useCallback, useEffect, useRef, useState } from 'react'
import {
  boxStep,
  initialBoxState,
  isOpen,
  type BoxEvent,
  type BoxInputs
} from '../../../shared/dialogueCollapse'

export type DialogueCollapse = {
  // The box is open (always while a request waits).
  open: boolean
  auto: boolean
  // At least one approval request is pending: the box cannot be collapsed.
  locked: boolean
  // Reply text arrived while collapsed and its end is out of view.
  unseen: boolean
  // The history's bottom is more than 48px out of view: ↓ LATEST shows.
  far: boolean
  // Counts up each time the history should be scrolled to the bottom.
  pin: number
  collapse: () => void
  expand: () => void
  // ↓ LATEST: opens the box with AUTO on.
  latest: () => void
  setAuto: (on: boolean) => void
  // NEW CHAT: the box starts open.
  reset: () => void
  // The history was measured or scrolled (see useHistoryScroll).
  report: (measure: { distance: number; user: boolean; guarded: boolean }) => void
}

// The dialogue box's open, collapsed, and AUTO state for CHAT. The rules are the pure boxStep in
// shared/dialogueCollapse.ts; this hook feeds it the screen's events and keeps AUTO in
// settings.json. Only AUTO is saved: every chat starts open, so the box is open again after
// NEW CHAT, after leaving CHAT, and after a restart.
export function useDialogueCollapse(inputs: BoxInputs): DialogueCollapse {
  const [state, setState] = useState(() => initialBoxState(inputs))
  // What the screen is doing (a run starting, a request, reply text) goes in while rendering,
  // like the typewriter does with its block key. boxStep returns the same object when the
  // inputs change nothing, so this settles at once.
  const synced = boxStep(state, { type: 'inputs', ...inputs })
  if (synced !== state) setState(synced)

  const send = useCallback((event: BoxEvent): void => setState((s) => boxStep(s, event)), [])

  // AUTO as saved. A toggle pressed before the answer comes wins over it.
  const touched = useRef(false)
  useEffect(() => {
    let disposed = false
    window.mya.ui
      .getDialogueAutoCollapse()
      .then((on) => {
        if (!disposed && !touched.current) send({ type: 'auto', on })
      })
      .catch((err: unknown) => console.error('Could not read the AUTO setting:', err))
    return () => {
      disposed = true
    }
  }, [send])

  const setAuto = useCallback(
    (on: boolean): void => {
      touched.current = true
      send({ type: 'auto', on })
      window.mya.ui
        .setDialogueAutoCollapse(on)
        .catch((err: unknown) => console.error('Could not save the AUTO setting:', err))
    },
    [send]
  )

  return {
    open: isOpen(synced),
    auto: synced.auto,
    locked: synced.locked,
    unseen: synced.unseen,
    far: synced.far,
    pin: synced.pin,
    collapse: useCallback(() => send({ type: 'collapse' }), [send]),
    expand: useCallback(() => send({ type: 'expand' }), [send]),
    latest: useCallback(() => send({ type: 'latest' }), [send]),
    setAuto,
    reset: useCallback(() => send({ type: 'reset' }), [send]),
    report: useCallback(
      ({ distance, user, guarded }) => send({ type: 'scroll', distance, user, guarded }),
      [send]
    )
  }
}
