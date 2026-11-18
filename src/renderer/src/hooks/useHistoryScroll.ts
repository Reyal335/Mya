import { useCallback, useEffect, useRef, type RefCallback } from 'react'
import { GUARD_MS, isGuarded, OPEN_WITHIN } from '../../../shared/dialogueCollapse'

// How long ↓ LATEST takes to scroll, at most.
const JUMP_MS = 300
// A wheel or key press counts as my scrolling for this long after it.
const INTENT_MS = 150
// Touch scrolling keeps coasting after the finger lifts.
const COAST_MS = 1000
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

type Measure = { distance: number; user: boolean; guarded: boolean }

type Api = {
  pin: () => void
  jump: (instant: boolean) => void
  measure: () => void
}

export type HistoryScroll = {
  // Goes on the scrolling element. The element can come and go (the battle view replaces it).
  attach: RefCallback<HTMLDivElement>
  // Scroll to the bottom if I am at the bottom (within 8px), and tell `report` where it stands.
  // Called when the history grows.
  repin: () => void
  // Treat me as at the bottom from now on: a message was sent, a new chat started.
  follow: () => void
  // Scroll to the bottom now, and stay there as the history grows.
  pinNow: () => void
  // ↓ LATEST: scroll to the bottom, smoothly for at most 300ms unless `instant`.
  jump: (instant: boolean) => void
  // The box opened or closed: for 300ms my scrolling does not count for AUTO.
  markChange: () => void
}

// The CHAT history's scrolling: it sticks to the bottom only while I am within 8px of it, tells
// `report` how far the bottom is out of view, and whether the scroll was mine (wheel, keys, the
// scrollbar, touch) or the app's own, which never counts. The app's scrolls are the ones that
// land exactly where the app put the history.
export function useHistoryScroll(report: (measure: Measure) => void): HistoryScroll {
  const api = useRef<Api | null>(null)
  const stick = useRef(true)
  const guardUntil = useRef(0)
  const reportRef = useRef(report)
  useEffect(() => {
    reportRef.current = report
  })

  const attach = useCallback<RefCallback<HTMLDivElement>>((el) => {
    if (!el) return
    let intentUntil = 0
    let pointerDown = false
    let touching = false
    // Where the app last put the history, and the frame of a running jump.
    let appTop: number | null = null
    let frame = 0

    const distance = (): number => el.scrollHeight - el.scrollTop - el.clientHeight
    const setTop = (top: number): void => {
      el.scrollTop = top
      appTop = el.scrollTop
    }
    const stop = (): void => {
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
    }
    // Me scrolling ends a jump at once.
    const intent = (ms: number): void => {
      intentUntil = Math.max(intentUntil, performance.now() + ms)
      stop()
    }

    const onScroll = (): void => {
      const now = performance.now()
      const gap = distance()
      const app = appTop !== null && Math.abs(el.scrollTop - appTop) < 1
      // Where I am is read from scrolls that are not the app's own. The app's scroll event comes
      // a frame after it scrolled, when more may have been added below, so it cannot say whether
      // I was at the bottom: the app only scrolls me there because I was.
      if (!app) {
        appTop = null
        stick.current = gap <= OPEN_WITHIN
      }
      const user = !app && (now < intentUntil || pointerDown || touching)
      reportRef.current({ distance: gap, user, guarded: isGuarded(now, guardUntil.current) })
    }
    const onWheel = (): void => intent(INTENT_MS)
    // The scroll keys, from the history or from a link or button inside it. Space scrolls only
    // when nothing inside has it, since a button takes it.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!SCROLL_KEYS.has(event.key)) return
      if (event.key === ' ' && event.target !== el) return
      intent(INTENT_MS)
    }
    // A press on the scrollbar (the strip right of the content) is me scrolling.
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target !== el) return
      if (event.clientX > el.getBoundingClientRect().left + el.clientWidth) {
        pointerDown = true
        stop()
      }
    }
    const onPointerUp = (): void => {
      pointerDown = false
    }
    const onTouchStart = (): void => {
      touching = true
      stop()
    }
    const onTouchEnd = (): void => {
      touching = false
      intent(COAST_MS)
    }

    // A running jump owns the scroll: the box opening under it must not snap the history to the
    // bottom and make the jump start over from where it began.
    const pin = (): void => {
      if (frame === 0) setTop(el.scrollHeight)
    }
    const measure = (): void =>
      reportRef.current({ distance: distance(), user: false, guarded: true })

    el.addEventListener('scroll', onScroll)
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    // The history's own size changes (the box opened or closed, the input box grew, the window
    // was resized): stay at the bottom if I was there, and measure again.
    const observer = new ResizeObserver(() => {
      if (stick.current) pin()
      measure()
    })
    observer.observe(el)

    api.current = {
      pin,
      measure,
      jump: (instant) => {
        stop()
        stick.current = true
        guardUntil.current = performance.now() + JUMP_MS + GUARD_MS
        if (instant) {
          pin()
          return
        }
        // Where it starts is read on its first frame, after the box has opened or closed.
        let from = 0
        let start = -1
        const step = (time: number): void => {
          if (start < 0) {
            from = el.scrollTop
            start = time
          }
          const t = Math.min(1, (time - start) / JUMP_MS)
          const eased = 1 - (1 - t) * (1 - t)
          // The end moves while it runs (the box may open), so it is read every frame.
          const end = el.scrollHeight - el.clientHeight
          setTop(from + (end - from) * eased)
          if (t < 1) {
            frame = requestAnimationFrame(step)
          } else {
            frame = 0
            pin()
          }
        }
        frame = requestAnimationFrame(step)
      }
    }

    return () => {
      stop()
      observer.disconnect()
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      api.current = null
    }
  }, [])

  return {
    attach,
    repin: useCallback(() => {
      if (stick.current) api.current?.pin()
      api.current?.measure()
    }, []),
    follow: useCallback(() => {
      stick.current = true
    }, []),
    pinNow: useCallback(() => {
      stick.current = true
      api.current?.pin()
    }, []),
    jump: useCallback((instant: boolean) => api.current?.jump(instant), []),
    markChange: useCallback(() => {
      guardUntil.current = performance.now() + GUARD_MS
    }, [])
  }
}
