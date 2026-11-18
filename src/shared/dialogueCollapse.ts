// The rules for when CHAT's dialogue box is open and when it is collapsed to a bar (DESIGN.md,
// Collapsible dialogue box). Pure: no timers, no DOM, no React. The window keeps one BoxState and
// feeds it events; every event that changes nothing returns the very same object, so the window
// can compare by reference and never re-render for it.
//
// Time is not in here. The 300ms guard after a change is kept by the caller, which tells a scroll
// event whether it is `guarded`; GUARD_MS and isGuarded() are here so the number lives once.

// The history's bottom this far out of view (px) collapses the box and shows ↓ LATEST.
export const COLLAPSE_BEYOND = 48
// Back within this many px of the bottom counts as at the bottom.
export const OPEN_WITHIN = 8
// After the box opens or closes, scroll events do not count for AUTO this long (ms).
export const GUARD_MS = 300

export function isGuarded(now: number, until: number): boolean {
  return now < until
}

// A reply text that is the last item, as the box sees it.
export type ReplyInput = { id: number; length: number; instant: boolean }

export type BoxInputs = {
  // A run is going.
  running: boolean
  // At least one approval request is pending.
  locked: boolean
  reply: ReplyInput | null
}

export type BoxState = {
  // The box's own choice. While locked it is true; use isOpen().
  open: boolean
  // AUTO: collapse while I scroll back, open for new activity.
  auto: boolean
  locked: boolean
  // Reply text arrived while collapsed and its end is out of view: the NEW tag.
  unseen: boolean
  // The history's bottom is within OPEN_WITHIN, and more than COLLAPSE_BEYOND out of view.
  atBottom: boolean
  far: boolean
  // Counts up each time the history should be scrolled to the bottom.
  pin: number
  // This run's first reply text already opened the box.
  replyOpened: boolean
  // What the last inputs were, to tell a change from a repeat.
  seenRunning: boolean
  seenReplyId: number | null
  seenReplyLength: number
}

export type BoxEvent =
  | ({ type: 'inputs' } & BoxInputs)
  | { type: 'collapse' }
  | { type: 'expand' }
  // ↓ LATEST was pressed.
  | { type: 'latest' }
  | { type: 'auto'; on: boolean }
  // A new chat starts with the box open.
  | { type: 'reset' }
  // The history was measured. `user` is true for scrolling by me (wheel, keys, the scrollbar,
  // touch), never for a scroll the app made; `guarded` is true within GUARD_MS of a change.
  | { type: 'scroll'; distance: number; user: boolean; guarded: boolean }

export function isOpen(state: BoxState): boolean {
  return state.open || state.locked
}

export function initialBoxState(inputs: BoxInputs, auto = true): BoxState {
  return {
    open: true,
    auto,
    locked: inputs.locked,
    unseen: false,
    atBottom: true,
    far: false,
    pin: 0,
    replyOpened: false,
    seenRunning: inputs.running,
    seenReplyId: inputs.reply?.id ?? null,
    seenReplyLength: inputs.reply?.length ?? 0
  }
}

// The same object when no field differs.
function change(state: BoxState, patch: Partial<BoxState>): BoxState {
  for (const key of Object.keys(patch) as (keyof BoxState)[]) {
    if (state[key] !== patch[key]) return { ...state, ...patch }
  }
  return state
}

export function boxStep(state: BoxState, event: BoxEvent): BoxState {
  switch (event.type) {
    case 'inputs': {
      let open = state.open
      let pin = state.pin
      let replyOpened = state.replyOpened
      // A run starts: open, unless AUTO is off, and scroll to the bottom.
      if (event.running && !state.seenRunning) {
        replyOpened = false
        if (state.auto) {
          open = true
          pin += 1
        }
      }
      // An approval request opens the box at once, whatever AUTO says. Answering the last one
      // leaves it open.
      if (event.locked && !state.locked) open = true
      const reply = event.reply
      const live = reply !== null && !reply.instant && reply.length > 0
      const isNewReply = live && reply.id !== state.seenReplyId
      // The first reply text of a run opens the box once. Later text in the same run does not, so
      // reading back during a long run is never undone.
      if (isNewReply && event.running && !replyOpened) {
        replyOpened = true
        if (state.auto) {
          open = true
          pin += 1
        }
      }
      const grew =
        live && (reply.id === state.seenReplyId ? reply.length > state.seenReplyLength : true)
      const shown = open || event.locked
      let unseen = state.unseen
      if (grew && !shown && !state.atBottom) unseen = true
      if (shown) unseen = false
      return change(state, {
        open,
        pin,
        replyOpened,
        unseen,
        locked: event.locked,
        seenRunning: event.running,
        seenReplyId: reply?.id ?? null,
        seenReplyLength: reply?.length ?? 0
      })
    }
    case 'collapse':
      // Nothing to do while a request waits.
      return state.locked ? state : change(state, { open: false })
    case 'expand':
      return change(state, { open: true, unseen: false })
    case 'latest':
      return state.auto ? change(state, { open: true, unseen: false }) : state
    case 'auto':
      return change(state, { auto: event.on })
    case 'reset':
      return change(state, { open: true, unseen: false, replyOpened: false })
    case 'scroll': {
      const atBottom = event.distance <= OPEN_WITHIN
      const far = event.distance > COLLAPSE_BEYOND
      let open = state.open
      let unseen = state.unseen
      if (atBottom) unseen = false
      if (state.auto && event.user && !event.guarded) {
        if (far && open && !state.locked) open = false
        else if (atBottom && !isOpen(state)) open = true
      }
      if (open) unseen = false
      return change(state, { atBottom, far, open, unseen })
    }
  }
}
