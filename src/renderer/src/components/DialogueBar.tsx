import type { ReactNode, Ref } from 'react'
import { FULL_REPLY_NOTE, type BarView } from '../../../shared/dialogueBar'
import { AutoToggle, ExpandButton } from './DialogueControls'
import './DialogueBar.css'

type DialogueBarProps = {
  speaker: string
  view: BarView
  // Reply text arrived while collapsed and its end is out of view.
  unseen: boolean
  // The mascot at scale 1, playing the current state's loop.
  mascot: ReactNode
  auto: boolean
  onAuto: (on: boolean) => void
  onExpand: () => void
  expandRef: Ref<HTMLButtonElement>
}

// The dialogue box collapsed to one row (designs mockup 22): the mascot, the name and the state,
// one line of what the box would say, AUTO, and ▲ EXPAND. Its height never depends on the line.
// A click anywhere else on it does nothing. The line is aria-hidden: the live region in the
// stage announces each finished reply, so it is not read a second time here.
function DialogueBar({
  speaker,
  view,
  unseen,
  mascot,
  auto,
  onAuto,
  onExpand,
  expandRef
}: DialogueBarProps): React.JSX.Element {
  const { line } = view
  return (
    <div className="dialogue-bar">
      <div className="dialogue-bar__mascot">{mascot}</div>
      <div className="dialogue-bar__body">
        <div className="dialogue-bar__head">
          <span className="dialogue-bar__name">{speaker}</span>
          <span className={`stage__tag stage__tag--${view.state} dialogue-bar__chip`}>
            {view.chip}
          </span>
          {unseen && <span className="dialogue-bar__new">NEW</span>}
          {view.fullReplyNote && (
            <span className="dialogue-bar__note" aria-hidden="true">
              {FULL_REPLY_NOTE}
            </span>
          )}
        </div>
        <div className="dialogue-bar__line" aria-hidden="true">
          {line.type === 'dots' ? (
            <span className="dialogue__dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          ) : (
            <>
              <span className={`dialogue-bar__text dialogue-bar__text--${line.tone}`}>
                {line.text}
              </span>
              {line.cursor && <span className="dialogue__cursor dialogue-bar__cursor" />}
            </>
          )}
        </div>
      </div>
      <div className="dialogue-bar__controls">
        <AutoToggle auto={auto} onChange={onAuto} />
        <ExpandButton onExpand={onExpand} buttonRef={expandRef} />
      </div>
    </div>
  )
}

export default DialogueBar
