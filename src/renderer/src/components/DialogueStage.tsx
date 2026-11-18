import { useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
import type { PermissionDecision, TaskAgent } from '../../../shared/ipc'
import type { ConversationItem } from '../hooks/useConversation'
import type { MascotLoop, MascotStateName } from '../mascots/types'
import { barView } from '../../../shared/dialogueBar'
import { errorText, STOPPED_TEXT } from '../../../shared/noticeText'
import { toPlainText } from '../../../shared/plainText'
import type { ToolLabel } from '../../../shared/toolLabel'
import { useTypewriter } from '../hooks/useTypewriter'
import { needsWholeParse, shownLastLine, useMarkdownBlocks } from '../markdown/markdownTree'
import { boxKind } from '../conversation/boxKind'
import Mascot from './Mascot'
import DialogueBox from './DialogueBox'
import DialogueBar from './DialogueBar'
import { AutoToggle, CollapseButton, STAGE_ID } from './DialogueControls'

type ToolItem = Extract<ConversationItem, { kind: 'tool' }>
type NoticeItem = Extract<ConversationItem, { kind: 'notice' }>

type DialogueStageProps = {
  open: boolean
  locked: boolean
  auto: boolean
  unseen: boolean
  onAuto: (on: boolean) => void
  onCollapse: () => void
  onExpand: () => void
  // The mascot and what hangs on it.
  loop: MascotLoop
  accessory: { src: string; x: number; y: number } | null
  state: MascotStateName
  badge: string | undefined
  title: string | null
  speaker: string
  // The last item when it is reply text. It types out here (and in the bar), and is not in the
  // history while the box is open, unless it is `instant`: text loaded from a saved chat.
  reply: { id: number; text: string; instant: boolean } | null
  notice: NoticeItem['notice'] | null
  tag: string
  pending: ToolItem[]
  asker: Pick<TaskAgent, 'name' | 'icon'> | null
  working: ToolLabel | null
  running: boolean
  empty: boolean
  // The most recent reply text that is complete, for screen readers.
  announce: string
  projectPath: string
  reducedMotion: boolean
  onAnswer: (permissionId: string, decision: PermissionDecision) => void
  // Called only when typing starts or stops, never per character.
  onTypingChange: (typing: boolean) => void
}

// What sits under the history in CHAT's frame: the mascot with the dialogue box, or, collapsed,
// the one-row bar. It owns the typewriter and the screen reader live region, so a reply keeps
// typing and is still announced while the box is collapsed; only what is drawn changes.
function DialogueStage({
  open,
  locked,
  auto,
  unseen,
  onAuto,
  onCollapse,
  onExpand,
  loop,
  accessory,
  state,
  badge,
  title,
  speaker,
  reply,
  notice,
  tag,
  pending,
  asker,
  working,
  running,
  empty,
  announce,
  projectPath,
  reducedMotion,
  onAnswer,
  onTypingChange
}: DialogueStageProps): React.JSX.Element {
  const instant = reducedMotion || Boolean(reply?.instant)
  // While the run goes on the reply can still grow: only its last block is parsed
  // again. When the run ends the blocks stay, unless the reply has definitions
  // that cross blocks: then it is parsed whole, exactly as the history shows it.
  const text = reply?.text ?? ''
  const whole = instant || (!running && needsWholeParse(text))
  const markdown = useMarkdownBlocks(text, reply?.id ?? null, whole)
  const { shown, typing, skip } = useTypewriter(markdown.length, reply?.id ?? null, instant)

  useEffect(() => {
    onTypingChange(typing)
  }, [typing, onTypingChange])

  const kind = boxKind({
    request: pending.length > 0,
    reply: reply !== null,
    notice: notice !== null,
    working: working !== null,
    running
  })

  // Focus follows the button that was pressed to the one that takes its place. It moves only for a
  // press: the box folding by itself (AUTO, a request) never takes focus.
  const collapseRef = useRef<HTMLButtonElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  // The swap is flushed first, so the new button exists and the move does not wait for a frame.
  const collapse = (): void => {
    flushSync(onCollapse)
    expandRef.current?.focus()
  }
  const expand = (): void => {
    flushSync(onExpand)
    collapseRef.current?.focus()
  }

  // The bar's line, worked out only while the bar shows. The first line of the reply is cut from
  // its plain text; the typed line is read from the blocks the box would draw.
  const firstLine = useMemo(
    () => (open ? '' : (toPlainText(text).split('\n')[0] ?? '')),
    [open, text]
  )
  const typedLine = useMemo(
    () => (open || kind !== 'reply' || !typing ? '' : shownLastLine(markdown, shown)),
    [open, kind, typing, markdown, shown]
  )
  const workingText = working
    ? `${working.verb}${working.target !== null ? ` ${working.target}` : ''}`
    : ''

  const mascot = (scale: number): React.JSX.Element => (
    <Mascot
      src={loop.src}
      frames={loop.frames}
      fps={loop.fps}
      reverse={loop.reverse}
      scale={scale}
      label={`Mascot, ${state}`}
      accessory={accessory}
    />
  )

  return (
    <div id={STAGE_ID} className="conversation__stage-slot">
      {open ? (
        <div className="conversation__stage">
          <div className="stage__mascot">
            <div className="stage__frame">
              {mascot(2)}
              {badge && (
                <span className={`stage__badge stage__badge--${state}`} aria-hidden="true">
                  {badge}
                </span>
              )}
            </div>
            <div className={`stage__tag stage__tag--${state}`}>{state.toUpperCase()}</div>
            {title && <div className="stage__title">{title.toUpperCase()}</div>}
          </div>
          <DialogueBox
            agentName={speaker}
            kind={kind}
            markdown={markdown}
            shown={shown}
            typing={typing}
            skip={skip}
            notice={notice}
            tag={tag}
            pending={pending}
            asker={asker}
            working={working}
            empty={empty}
            projectPath={projectPath}
            onAnswer={onAnswer}
            controls={
              <>
                <AutoToggle auto={auto} onChange={onAuto} />
                <CollapseButton locked={locked} onCollapse={collapse} buttonRef={collapseRef} />
              </>
            }
          />
        </div>
      ) : (
        <DialogueBar
          speaker={speaker}
          view={barView({
            state,
            kind,
            typing,
            firstLine,
            typedLine,
            working: workingText,
            notice: notice
              ? notice.type === 'error'
                ? { text: errorText(notice.error), tone: 'error' }
                : { text: notice.type === 'stopped' ? STOPPED_TEXT : notice.text, tone: 'muted' }
              : null,
            empty
          })}
          unseen={unseen}
          mascot={mascot(1)}
          auto={auto}
          onAuto={onAuto}
          onExpand={expand}
          expandRef={expandRef}
        />
      )}
      {/* Announces each finished reply, open or collapsed. It never unmounts with the box. */}
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  )
}

export default DialogueStage
