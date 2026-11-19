import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BUSY_MESSAGE, PROVIDER_NAMES } from '../../../shared/chats'
import {
  AUTO,
  AUTO_MODEL_DESCRIPTION,
  LEVEL_DESCRIPTIONS,
  LEVEL_LABELS,
  METER_BLOCKS,
  NO_LEVEL_LINE,
  choiceLabel,
  meterFill,
  modelBars,
  modelDescription,
  optionLabel,
  pickerLevels,
  type ModelChoice,
  type ModelLists,
  type ModelOption,
  type ProviderId
} from '../../../shared/models'
import { PROVIDERS, resolveProviderChoice } from '../../../shared/providers'
import ProviderTag from './ProviderTag'
import './ModelPicker.css'

type ModelPickerProps = {
  // Only the chat's own provider's models: a chat never changes provider.
  lists: ModelLists | null
  provider: ProviderId
  listFailed: boolean
  choice: ModelChoice
  asDefault: boolean
  onAsDefaultChange: (on: boolean) => void
  onPick: (next: ModelChoice) => void
  // The chat already has replies from Claude.
  hasReplies: boolean
  // The picker opened: the list and the choice are read again.
  onOpen: () => void
  // The way to another provider: the NEW CHAT dialog. Blocked while a run is going.
  onNewChat: () => void
  newChatBlocked: boolean
}

// The thinking meter: 4 blocks, filled for the level. AUTO shows alternating blocks.
function Meter({ effort, size }: { effort: string; size: 'small' | 'large' }): React.JSX.Element {
  const fill = meterFill(effort)
  return (
    <span className={`meter meter--${size}`} aria-hidden="true">
      {Array.from({ length: METER_BLOCKS }, (_, i) => {
        const on = fill === 'dotted' ? i % 2 === 0 : i < fill
        const kind = fill === 'dotted' ? (on ? 'dotted' : 'off') : on ? 'on' : 'off'
        return <span key={i} className={`meter__block meter__block--${kind}`} />
      })}
    </span>
  )
}

// POWER or SPEED: three blocks, `filled` of them lit. null leaves the space empty so
// the columns line up. `dotted` is AUTO's alternating blocks.
function Bars({
  kind,
  filled
}: {
  kind: 'power' | 'speed'
  filled: number | 'dotted' | null
}): React.JSX.Element {
  if (filled === null) return <span className="bars bars--none" aria-hidden="true" />
  return (
    <span className={`bars bars--${kind}`} aria-hidden="true">
      {[0, 1, 2].map((i) => {
        const on = filled === 'dotted' ? i !== 1 : i < filled
        return (
          <span
            key={i}
            className={`bars__block${on ? ' bars__block--on' : ''}${filled === 'dotted' ? ' bars__block--dotted' : ''}`}
          />
        )
      })}
    </span>
  )
}

// "Thinking: LOW · MED · HIGH", or "Thinking: none". Codex and Gemini rows say this in place of
// POWER and SPEED bars: there is no data for them, and made-up bars would mislead.
function thinkingLine(option: ModelOption): string {
  const levels = option.effortLevels
  if (levels === null) return 'Thinking: depends on the model'
  return levels.length === 0
    ? 'Thinking: none'
    : `Thinking: ${levels.map((level) => LEVEL_LABELS[level]).join(' · ')}`
}

// The model and thinking picker from designs/10-model-picker.html and 22b-model-picker.html: a
// control at the left of the input box's toolbar, and a dialog above the box, placed against it (its
// parent must be positioned). Picking applies at once. It offers the chat's own provider's models
// only; the last row is the way to another provider (NEW CHAT).
function ModelPicker({
  lists,
  provider,
  listFailed,
  choice,
  asDefault,
  onAsDefaultChange,
  onPick,
  hasReplies,
  onOpen,
  onNewChat,
  newChatBlocked
}: ModelPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const controlRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // The model when the picker opened, to tell whether this visit switched models.
  const [openedWith, setOpenedWith] = useState(choice.model)

  const claude = provider === 'claude'
  const providerName = PROVIDER_NAMES[provider]
  const label = choiceLabel(choice, lists)
  const levels = pickerLevels(choice.model, lists)
  const takesLevel = levels.length > 0
  // Claude has AUTO beside its levels. Codex and Gemini have no AUTO level: a model with levels
  // always has one, and a model with none shows no level at all.
  const selectedEffort = takesLevel ? choice.effort : AUTO
  const switched = claude && hasReplies && choice.model !== openedWith
  const showsLevel = claude || takesLevel
  const controlName = showsLevel ? `${label.model} · THINK ${label.level}` : label.model

  function openPicker(): void {
    setOpenedWith(choice.model)
    setOpen(true)
    onOpen()
  }

  function close(returnFocus: boolean): void {
    setOpen(false)
    if (returnFocus) controlRef.current?.focus()
  }

  // Focus moves into the picker when it opens: onto the selected model.
  useEffect(() => {
    if (!open) return
    const selected = dialogRef.current?.querySelector<HTMLElement>(
      '.model-picker__row[aria-pressed="true"]'
    )
    const first = dialogRef.current?.querySelector<HTMLElement>('button, input')
    ;(selected ?? first)?.focus()
  }, [open])

  // A click anywhere outside closes it. Focus stays where the click put it.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (dialogRef.current?.contains(target) || controlRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
      return
    }
    // The picker sits inside the input box's form: Enter on its checkbox must not submit it.
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault()
      return
    }
    // Arrow keys move through the model rows (up and down) and the level buttons
    // (left and right). Tab moves through everything too.
    const target = event.target as HTMLElement
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
    if (!vertical && !horizontal) return
    const group = target.closest<HTMLElement>(
      vertical ? '.model-picker__models' : '.model-picker__levels'
    )
    if (!group) return
    const buttons = [...group.querySelectorAll<HTMLElement>('button')]
    const index = buttons.indexOf(target)
    if (index < 0) return
    event.preventDefault()
    const step = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
    buttons[(index + step + buttons.length) % buttons.length].focus()
  }

  function pickModel(model: string): void {
    // The level is made to fit the new model by the hook and by main: the nearest the model has.
    onPick(resolveProviderChoice({ model, effort: choice.effort }, lists, provider).choice)
  }

  return (
    <>
      <button
        ref={controlRef}
        type="button"
        className={`model-picker__control${open ? ' model-picker__control--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        // The name stays whole when a narrow input hides the text.
        aria-label={`Model: ${controlName}`}
        // The full text, for when the label is cut short or hidden.
        title={controlName}
        onClick={() => (open ? close(false) : openPicker())}
        onKeyDown={(event) => {
          if (open && event.key === 'Escape') {
            event.preventDefault()
            close(true)
          }
        }}
      >
        {showsLevel && <Meter effort={choice.effort} size="small" />}
        <span className="model-picker__label">
          {label.model}
          {showsLevel && <span className="model-picker__dot"> · THINK {label.level}</span>}
        </span>
        {/* The dialog opens upward, so the caret points up while it is closed. */}
        <span className="model-picker__caret" aria-hidden="true">
          {open ? 'v' : '^'}
        </span>
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-label={`Model and thinking, ${providerName}`}
          className="model-picker__dialog"
          onKeyDown={handleKeyDown}
        >
          <div className="model-picker__head">
            <h2 className="model-picker__title">
              {claude ? 'MODEL' : `${PROVIDERS[provider].label} MODELS`}
            </h2>
            {claude ? (
              <span className="model-picker__columns" aria-hidden="true">
                <span>POWER</span>
                <span>SPEED</span>
              </span>
            ) : (
              <ProviderTag provider={provider} />
            )}
          </div>

          <div className="model-picker__models" role="group" aria-label="Model">
            {claude && (
              <ModelRow
                selected={choice.model === AUTO}
                name="AUTO"
                description={AUTO_MODEL_DESCRIPTION}
                power="dotted"
                speed="dotted"
                onClick={() => pickModel(AUTO)}
              />
            )}
            {lists?.models.map((option) => {
              const bars = claude ? modelBars(option) : null
              return (
                <ModelRow
                  key={option.value}
                  selected={choice.model === option.value}
                  name={optionLabel(option)}
                  description={claude ? modelDescription(option) : thinkingLine(option)}
                  bars={claude}
                  power={bars ? bars.power : null}
                  speed={bars ? bars.speed : null}
                  onClick={() => pickModel(option.value)}
                />
              )
            })}
          </div>
          {listFailed && <p className="model-picker__error">Couldn&apos;t load the model list.</p>}

          <div className="model-picker__head model-picker__head--divided">
            <h2 className="model-picker__title">THINKING</h2>
            {showsLevel && <Meter effort={choice.effort} size="large" />}
          </div>

          {claude || takesLevel ? (
            <div className="model-picker__levels" role="group" aria-label="Thinking power">
              {claude && (
                <LevelButton
                  selected={selectedEffort === AUTO}
                  label="AUTO"
                  onClick={() => onPick({ model: choice.model, effort: AUTO })}
                />
              )}
              {levels.map((level) => (
                <LevelButton
                  key={level}
                  selected={selectedEffort === level}
                  label={LEVEL_LABELS[level]}
                  onClick={() => onPick({ model: choice.model, effort: level })}
                />
              ))}
            </div>
          ) : (
            // A model with no levels: a dashed line says so, so the missing buttons are explained.
            <p className="model-picker__no-levels" aria-disabled="true">
              {label.model} has no thinking levels.
            </p>
          )}
          {(claude || takesLevel) && (
            <p className="model-picker__level-line">
              {takesLevel
                ? LEVEL_DESCRIPTIONS[
                    selectedEffort === AUTO
                      ? 'auto'
                      : (selectedEffort as keyof typeof LEVEL_DESCRIPTIONS)
                  ]
                : NO_LEVEL_LINE}
            </p>
          )}

          <div className="model-picker__footer">
            <label className="model-picker__check">
              <input
                type="checkbox"
                checked={asDefault}
                onChange={(event) => onAsDefaultChange(event.target.checked)}
              />
              Use for new {providerName} chats too
            </label>
            <button type="button" className="model-picker__done" onClick={() => close(true)}>
              DONE
            </button>
          </div>
          <p className="model-picker__note">
            Changes apply from your next message. Party agents you call keep the model set in their
            agent file.
          </p>
          {switched && (
            <p className="model-picker__note">
              Switching models re-reads the whole chat, which uses more of your plan.
            </p>
          )}

          <div className="model-picker__other">
            <span className="model-picker__note">To use another provider, start a new chat.</span>
            <button
              type="button"
              className="model-picker__new"
              aria-disabled={newChatBlocked ? 'true' : undefined}
              title={newChatBlocked ? BUSY_MESSAGE : undefined}
              onClick={() => {
                if (newChatBlocked) return
                close(false)
                onNewChat()
              }}
            >
              NEW CHAT
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ModelRow({
  selected,
  name,
  description,
  bars = true,
  power,
  speed,
  onClick
}: {
  selected: boolean
  name: string
  description: string
  // Claude's rows have POWER and SPEED bars; the others have none.
  bars?: boolean
  power: number | 'dotted' | null
  speed: number | 'dotted' | null
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`model-picker__row${selected ? ' model-picker__row--selected' : ''}`}
      onClick={onClick}
    >
      <span className="model-picker__row-text">
        <span className="model-picker__row-name">{name}</span>
        <span className="model-picker__row-description">{description}</span>
      </span>
      {bars && <Bars kind="power" filled={power} />}
      {bars && <Bars kind="speed" filled={speed} />}
    </button>
  )
}

function LevelButton({
  selected,
  label,
  onClick
}: {
  selected: boolean
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`model-picker__level${selected ? ' model-picker__level--selected' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export default ModelPicker
