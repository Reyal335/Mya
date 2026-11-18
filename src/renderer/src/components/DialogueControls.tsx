import type { Ref } from 'react'
import './DialogueControls.css'

// The three buttons that fold the dialogue box: AUTO and ▼ COLLAPSE sit in the open box's
// header, AUTO and ▲ EXPAND in the bar (DESIGN.md, Collapsible dialogue box).

// The wrapper around the box and the bar, which both buttons control.
export const STAGE_ID = 'dialogue-stage'

export function AutoToggle({
  auto,
  onChange
}: {
  auto: boolean
  onChange: (on: boolean) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`dialogue__auto dialogue__auto--${auto ? 'on' : 'off'}`}
      aria-pressed={auto}
      title="Collapse while I scroll back, open for new replies"
      onClick={() => onChange(!auto)}
    >
      AUTO: {auto ? 'ON' : 'OFF'}
    </button>
  )
}

// While a request waits it does nothing and says why. It stays a button you can reach, so the
// reason can be read.
export function CollapseButton({
  locked,
  onCollapse,
  buttonRef
}: {
  locked: boolean
  onCollapse: () => void
  buttonRef: Ref<HTMLButtonElement>
}): React.JSX.Element {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`dialogue__collapse${locked ? ' dialogue__collapse--locked' : ''}`}
      aria-expanded="true"
      aria-controls={STAGE_ID}
      aria-disabled={locked ? 'true' : undefined}
      title={locked ? 'Answer the request first' : undefined}
      onClick={() => {
        if (!locked) onCollapse()
      }}
    >
      <span aria-hidden="true">▼ </span>COLLAPSE
    </button>
  )
}

export function ExpandButton({
  onExpand,
  buttonRef
}: {
  onExpand: () => void
  buttonRef: Ref<HTMLButtonElement>
}): React.JSX.Element {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="dialogue__expand"
      aria-expanded="false"
      aria-controls={STAGE_ID}
      onClick={onExpand}
    >
      <span aria-hidden="true">▲ </span>EXPAND
    </button>
  )
}
