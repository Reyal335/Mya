import { useEffect, useRef, useState } from 'react'
import './LaunchNotice.css'

// How long a notice stays before it clears itself. The time stops while the pointer is over the
// strip or focus is inside it.
const NOTICE_MS = 8_000

// The title bar's close glyph (see TitleBar.tsx): 12x12, 2px strokes, no anti-aliasing.
const CLOSE_GLYPH =
  'M1 1h2v2H1zM3 3h2v2H3zM5 5h2v2H5zM7 7h2v2H7zM9 9h2v2H9zM9 1h2v2H9zM7 3h2v2H7zM3 7h2v2H3zM1 9h2v2H1z'

type LaunchNoticeProps = {
  text: string
  // Called when Dismiss is pressed and when the time runs out. It should not change between renders.
  onDismiss: () => void
}

// A one-line notice under the title bar: what the `mya` command could not do (see "Command line"
// in designs/DESIGN.md). The caller gives each notice its own key, so a new one starts with the
// full time and a repeated text is announced again. Only the text is the alert: the Dismiss label
// is not read.
function LaunchNotice({ text, onDismiss }: LaunchNoticeProps): React.JSX.Element {
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hover || focused
  // The time left, as in AchievementToast: a pause keeps what was left and carries on from it.
  const left = useRef(NOTICE_MS)

  useEffect(() => {
    if (paused) return
    const started = Date.now()
    const timer = window.setTimeout(onDismiss, left.current)
    return () => {
      window.clearTimeout(timer)
      left.current -= Date.now() - started
    }
  }, [paused, onDismiss])

  return (
    <div
      className="launch-notice"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        // Focus moving to another part of the strip is still focus inside it.
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <span className="launch-notice__mark" aria-hidden="true" />
      <p className="launch-notice__text" role="alert" title={text}>
        {text}
      </p>
      <button
        type="button"
        className="launch-notice__dismiss"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <span className="launch-notice__glyph">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            <path fill="currentColor" d={CLOSE_GLYPH} />
          </svg>
        </span>
      </button>
    </div>
  )
}

export default LaunchNotice
