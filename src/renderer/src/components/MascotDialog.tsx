import { useEffect, useId, useRef, useState } from 'react'
import type {
  MascotDraft,
  MascotLoops,
  MascotSheetChange,
  MascotSummary
} from '../../../shared/ipc'
import {
  canReverse,
  DEFAULT_FPS,
  DEFAULT_MASCOT_ID,
  EMOJI_LEVELS,
  fpsError,
  FRAME_SIZE,
  MASCOT_STATES,
  mascotNameError,
  MAX_MASCOT_NAME_LENGTH,
  MAX_VOICE_LENGTH,
  parseFps,
  voiceError,
  type EmojiLevel,
  type MascotStateName,
  type MascotVoice
} from '../../../shared/mascotRules'
import { DEFAULT_MASCOT } from '../mascots/defaultMascot'
import Dialog from './Dialog'
import { startingGrid } from '../../../shared/sliceRules'
import SheetRow from './SheetRow'
import SheetSlicer from './SheetSlicer'
import { useSheetPicker, type PickedStrip, type SheetApi } from './useSheetPicker'
import './MascotDialog.css'

export type MascotDialogTarget =
  | { kind: 'new' }
  | { kind: 'edit'; mascot: Extract<MascotSummary, { problem: null }> }
  // The built-in mascot: `uploaded` holds only the loops the user uploaded for it.
  // `voice` is null for the built-in voice (plain, no emoji).
  | { kind: 'default'; name: string; uploaded: Partial<MascotLoops>; voice: MascotVoice | null }

type MascotDialogProps = {
  target: MascotDialogTarget
  onDirtyChange: (dirty: boolean) => void
  onSaved: () => void
  // CANCEL and Escape. The screen asks before discarding changes.
  onCancel: () => void
}

type SlotSheet = {
  src: string
  frames: number
  width: number
  fileName: string
  // The default's bundled idle sheet: shown, but never saved or removed.
  builtIn: boolean
}

type Slot = {
  sheet: SlotSheet | null
  change: MascotSheetChange
  // The fps field's text, checked with parseFps.
  fps: string
  // REVERSE AT END: play forward, then back. Only means something with 3+ frames.
  reverse: boolean
  error: string | null
}

type Slots = Record<MascotStateName, Slot>

const BUILT_IN_IDLE = DEFAULT_MASCOT.loops.idle

// What an empty slot falls back to: for the default's idle row, the bundled
// idle sheet; otherwise nothing (the state plays the idle loop).
function fallbackSlot(
  isDefault: boolean,
  state: MascotStateName
): Pick<Slot, 'sheet' | 'fps' | 'reverse'> {
  if (isDefault && state === 'idle') {
    return {
      sheet: {
        src: BUILT_IN_IDLE.src,
        frames: BUILT_IN_IDLE.frames,
        width: BUILT_IN_IDLE.frames * FRAME_SIZE,
        fileName: 'built-in sheet',
        builtIn: true
      },
      fps: String(BUILT_IN_IDLE.fps),
      reverse: false
    }
  }
  return { sheet: null, fps: String(DEFAULT_FPS), reverse: false }
}

function initialSlots(loops: Partial<MascotLoops>, isDefault: boolean): Slots {
  const slots = {} as Slots
  for (const state of MASCOT_STATES) {
    const loop = loops[state]
    const base = loop
      ? {
          sheet: {
            src: loop.src,
            frames: loop.frames,
            width: loop.frames * FRAME_SIZE,
            fileName: `${state}.png`,
            builtIn: false
          },
          fps: String(loop.fps),
          reverse: loop.reverse
        }
      : fallbackSlot(isDefault, state)
    slots[state] = { ...base, change: { type: 'keep' }, error: null }
  }
  return slots
}

function targetName(target: MascotDialogTarget): string {
  if (target.kind === 'edit') return target.mascot.name
  if (target.kind === 'default') return target.name
  return ''
}

function targetLoops(target: MascotDialogTarget): Partial<MascotLoops> {
  if (target.kind === 'edit') return target.mascot.loops
  if (target.kind === 'default') return target.uploaded
  return {}
}

function targetVoice(target: MascotDialogTarget): MascotVoice | null {
  if (target.kind === 'edit') return target.mascot.voice
  if (target.kind === 'default') return target.voice
  return null
}

function framesText(frames: number): string {
  return `${frames} ${frames === 1 ? 'frame' : 'frames'}`
}

// How the mascot editor picks and cuts sheets.
const MASCOT_SHEETS: SheetApi = {
  pick: () => window.mya.mascots.pickSheet(),
  slice: (sourceToken, columns, rows, cells) =>
    window.mya.mascots.sliceSheet(sourceToken, columns, rows, cells),
  discard: (token) => window.mya.mascots.discardSheet(token),
  dropSources: () => window.mya.mascots.dropSources()
}

// The upload dialog from designs/4-mascot-manager.html: a name and one row per
// state. Picked sheets wait in the main process until SAVE; any not saved are
// dropped when the dialog closes.
function MascotDialog({
  target,
  onDirtyChange,
  onSaved,
  onCancel
}: MascotDialogProps): React.JSX.Element {
  const id = useId()
  const formId = `${id}-form`
  const isDefault = target.kind === 'default'
  // The id to update, or null for a new mascot.
  const editId = target.kind === 'edit' ? target.mascot.id : isDefault ? DEFAULT_MASCOT_ID : null
  const [initial] = useState(() => {
    const voice = targetVoice(target)
    return {
      name: targetName(target),
      slots: initialSlots(targetLoops(target), isDefault),
      voiceText: voice?.text ?? '',
      voiceEmoji: voice?.emoji ?? ('off' as EmojiLevel)
    }
  })
  const [name, setName] = useState(initial.name)
  const [nameTouched, setNameTouched] = useState(editId !== null)
  const [slots, setSlots] = useState(initial.slots)
  const [voiceText, setVoiceText] = useState(initial.voiceText)
  const [voiceTouched, setVoiceTouched] = useState(editId !== null)
  const [voiceEmoji, setVoiceEmoji] = useState<EmojiLevel>(initial.voiceEmoji)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const slotsRef = useRef(slots)
  useEffect(() => {
    slotsRef.current = slots
  }, [slots])

  // Picked sheets wait in the main process until SAVE. Closing the dialog drops the ones not
  // saved and every loaded source sheet. The latest sheet picked in another layout stays loaded,
  // so REUSE SHEET can slice it for other rows.
  const picker = useSheetPicker<MascotStateName>(MASCOT_SHEETS, {
    startingFps,
    startingReverse,
    onStrip: fillSlot,
    onError: (state, message) => updateSlot(state, { error: message })
  })

  const nameError = mascotNameError(name)
  const filled = MASCOT_STATES.filter((state) => slots[state].sheet)
  const fpsValid = filled.every((state) => parseFps(slots[state].fps) !== null)
  // Blank text means no voice, so it is never an error; only non-blank text is checked.
  const trimmedVoice = voiceText.trim()
  const voiceProblem = trimmedVoice === '' ? null : voiceError(voiceText)
  // An open slicer counts as a change, so closing the dialog asks first. The emoji level
  // only counts as a change while there is voice text: with none, it does not end up in
  // the draft either way.
  const dirty =
    picker.slicing !== null ||
    name.trim() !== initial.name.trim() ||
    trimmedVoice !== initial.voiceText.trim() ||
    (trimmedVoice !== '' && voiceEmoji !== initial.voiceEmoji) ||
    MASCOT_STATES.some(
      (state) =>
        slots[state].change.type !== 'keep' ||
        (slots[state].sheet !== null &&
          (slots[state].fps !== initial.slots[state].fps ||
            slots[state].reverse !== initial.slots[state].reverse))
    )
  const valid = nameError === null && slots.idle.sheet !== null && fpsValid && voiceProblem === null
  const canSave = valid && dirty && !saving && picker.slicing === null

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  function updateSlot(state: MascotStateName, patch: Partial<Slot>): void {
    setSlots((current) => ({ ...current, [state]: { ...current[state], ...patch } }))
  }

  function dropToken(change: MascotSheetChange): void {
    if (change.type === 'token') picker.release(change.token)
  }

  // The speed a new sheet starts at: a replaced upload keeps its speed; an
  // empty slot (or the built-in idle) starts at the default.
  function startingFps(state: MascotStateName): string {
    const before = slotsRef.current[state]
    return before.sheet && !before.sheet.builtIn ? before.fps : String(DEFAULT_FPS)
  }

  // Likewise a replaced upload keeps REVERSE AT END; anything else starts with it off.
  function startingReverse(state: MascotStateName): boolean {
    const before = slotsRef.current[state]
    return Boolean(before.sheet && !before.sheet.builtIn && before.reverse)
  }

  // Puts a strip that waits in the main process behind its token into a row.
  function fillSlot(
    state: MascotStateName,
    strip: PickedStrip,
    fps: string,
    reverse: boolean
  ): void {
    dropToken(slotsRef.current[state].change)
    updateSlot(state, {
      sheet: {
        src: strip.preview,
        frames: strip.frames,
        width: strip.frames * FRAME_SIZE,
        fileName: strip.fileName,
        builtIn: false
      },
      change: { type: 'token', token: strip.token },
      fps,
      reverse,
      error: null
    })
  }

  function remove(state: MascotStateName): void {
    const before = slotsRef.current[state]
    dropToken(before.change)
    // Removing a sheet that was never saved just empties the slot again. On the
    // default's idle row, the built-in sheet comes back.
    const savedSheet = initial.slots[state].sheet
    const saved = savedSheet !== null && !savedSheet.builtIn
    updateSlot(state, {
      ...fallbackSlot(isDefault, state),
      change: saved ? { type: 'remove' } : { type: 'keep' },
      error: null
    })
  }

  function toDraft(): MascotDraft {
    const states = {} as MascotDraft['states']
    for (const state of MASCOT_STATES) {
      const slot = slots[state]
      states[state] = {
        fps: parseFps(slot.fps) ?? DEFAULT_FPS,
        reverse: slot.sheet !== null && slot.reverse,
        sheet: slot.change
      }
    }
    const trimmed = voiceText.trim()
    return {
      name: name.trim(),
      states,
      voice: trimmed === '' ? null : { text: trimmed, emoji: voiceEmoji }
    }
  }

  async function save(): Promise<void> {
    setNameTouched(true)
    setVoiceTouched(true)
    if (!canSave) return
    setSaving(true)
    setFormError(null)
    try {
      const draft = toDraft()
      const result = editId
        ? await window.mya.mascots.update(editId, draft)
        : await window.mya.mascots.create(draft)
      if (result.ok) {
        // Saved sheets are no longer pending; main has already let go of them.
        picker.forgetPending()
        onDirtyChange(false)
        onSaved()
        return
      }
      setFormError(result.error.message)
    } catch (err) {
      console.error('Could not save the mascot:', err)
      setFormError('The mascot could not be saved.')
    }
    setSaving(false)
  }

  function renderRow(state: MascotStateName): React.JSX.Element {
    const slot = slots[state]
    const { sheet } = slot
    const slicer =
      picker.slicing?.row === state && picker.source
        ? { ...picker.slicing, source: picker.source }
        : null
    // While slicing, the fps field sets the slicer preview's speed.
    const fpsText = slicer ? slicer.fps : slot.fps
    const fps = parseFps(fpsText)
    const oneFrame = !slicer && sheet?.frames === 1
    const hasSheet = Boolean(slicer || sheet)
    const fpsProblem = hasSheet && !oneFrame ? fpsError(fpsText) : null

    let meta = 'No sheet yet'
    if (slicer) {
      meta = `${slicer.source.fileName} · ${slicer.source.width}x${slicer.source.height} · slicing`
    } else if (sheet) {
      meta = `${sheet.fileName} · ${sheet.width}x${FRAME_SIZE} · ${framesText(sheet.frames)}`
    }

    return (
      <SheetRow
        key={state}
        ariaLabel={`${state} loop`}
        tag={state.toUpperCase()}
        tagClass={`sheet-row__state--${state}`}
        required={state === 'idle'}
        meta={meta}
        look={slicer ? 'slicing' : slot.error ? 'error' : !sheet ? 'empty' : 'filled'}
        error={slot.error}
        fps={{
          text: fpsText,
          active: hasSheet,
          disabled: !hasSheet || oneFrame,
          invalid: Boolean(fpsProblem),
          label: `${state} FPS`,
          title: oneFrame
            ? 'A one-frame sheet does not animate.'
            : !hasSheet
              ? 'No sheet yet.'
              : undefined,
          onChange: (value) => {
            if (slicer) picker.setSlicingFps(value)
            else updateSlot(state, { fps: value })
          }
        }}
        upload={{
          replace: Boolean(sheet),
          label: `${sheet ? 'Replace' : 'Upload'} ${state} sheet`,
          onClick: () => void picker.pick(state)
        }}
        reuse={{
          label: picker.source
            ? `Reuse sheet ${picker.source.fileName} for ${state}`
            : `Reuse sheet for ${state}`,
          title: picker.source
            ? `Slice ${picker.source.fileName} again for this state`
            : 'No sheet loaded yet.',
          disabled: !picker.source || Boolean(slicer),
          onClick: () => picker.openSlicer(state)
        }}
        // The default's idle row can drop an uploaded sheet: the built-in one comes back.
        remove={{
          label: `Remove ${state} sheet`,
          title:
            state === 'idle'
              ? isDefault
                ? 'Goes back to the built-in idle sheet.'
                : 'Idle is required'
              : undefined,
          disabled: Boolean(slicer) || !sheet || sheet.builtIn || (state === 'idle' && !isDefault),
          onClick: () => remove(state)
        }}
        slicer={
          slicer ? (
            <SheetSlicer
              key={slicer.opening}
              source={slicer.source}
              initialGrid={
                slicer.source.grid ?? startingGrid(slicer.source.width, slicer.source.height)
              }
              initialReverse={slicer.reverse}
              fps={fps}
              onUse={(grid, cells, reverse) =>
                picker.confirmSlice(state, slicer.fps, grid, cells, reverse)
              }
              onCancel={picker.closeSlicer}
            />
          ) : null
        }
        sheet={sheet ? { src: sheet.src, frames: sheet.frames } : null}
        loop={{
          fps,
          reverse: slot.reverse,
          label: `${state} loop playing`,
          stripLabel: sheet ? `${state} sheet, ${framesText(sheet.frames)}` : ''
        }}
        placeholder={
          state === 'idle'
            ? 'Idle is required'
            : state === 'victory'
              ? 'Plays the talking loop'
              : 'Plays the idle loop'
        }
        extra={
          !slicer && sheet && !sheet.builtIn && canReverse(sheet.frames) ? (
            <label className="sheet-row__reverse">
              <input
                type="checkbox"
                checked={slot.reverse}
                aria-label={`${state} reverse at end`}
                onChange={(event) => updateSlot(state, { reverse: event.target.checked })}
              />
              REVERSE AT END
              <span className="sheet-row__reverse-note">Plays forward, then back.</span>
            </label>
          ) : null
        }
        fpsProblem={fpsProblem}
      />
    )
  }

  return (
    <Dialog
      title={isDefault ? 'EDIT DEFAULT MASCOT' : editId ? 'EDIT MASCOT' : 'ADD MASCOT'}
      size="wide"
      onClose={onCancel}
      actions={
        <>
          <button
            type="submit"
            form={formId}
            className="button button--primary"
            disabled={!canSave}
          >
            {saving ? 'SAVING...' : 'SAVE MASCOT'}
          </button>
          <button type="button" className="button button--secondary" onClick={onCancel}>
            CANCEL
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="mascot-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="mascot-form__field">
          <label htmlFor={`${id}-name`} className="mascot-form__label">
            NAME
          </label>
          <input
            id={`${id}-name`}
            className="mascot-form__input"
            type="text"
            value={name}
            placeholder="Name your mascot"
            maxLength={MAX_MASCOT_NAME_LENGTH}
            aria-invalid={nameTouched && nameError !== null}
            aria-describedby={`${id}-name-help`}
            onChange={(event) => {
              setNameTouched(true)
              setName(event.target.value)
            }}
          />
          <div id={`${id}-name-help`}>
            {nameTouched && nameError && <p className="mascot-form__error">{nameError}</p>}
          </div>
        </div>

        {isDefault && (
          <p className="mascot-form__note">
            This is the built-in mascot. Your name and loops are kept in the app&apos;s data folder
            and the built-in files never change. RESET on its card brings back the built-in version.
          </p>
        )}

        <div className="mascot-form__field">
          <div className="mascot-form__voice-head">
            <label htmlFor={`${id}-voice`} className="mascot-form__label">
              VOICE
            </label>
            <span
              className={`mascot-form__count${
                trimmedVoice.length > MAX_VOICE_LENGTH ? ' mascot-form__count--over' : ''
              }`}
            >
              {trimmedVoice.length} / {MAX_VOICE_LENGTH}
            </span>
          </div>
          <textarea
            id={`${id}-voice`}
            className="mascot-form__input mascot-form__input--voice"
            rows={3}
            value={voiceText}
            placeholder="How should this mascot talk? For example: Dry, smug wit. Sarcastic, clever observations. Short sentences with bite."
            maxLength={MAX_VOICE_LENGTH}
            aria-invalid={voiceTouched && voiceProblem !== null}
            aria-describedby={`${id}-voice-help`}
            onChange={(event) => {
              setVoiceTouched(true)
              setVoiceText(event.target.value)
            }}
          />
          <div id={`${id}-voice-help`}>
            {voiceTouched && voiceProblem && <p className="mascot-form__error">{voiceProblem}</p>}
          </div>
          <p className="mascot-form__note">
            Shapes how Claude talks in the main conversation. Left blank, Claude speaks plainly.
          </p>

          <fieldset className="mascot-form__emoji" disabled={trimmedVoice === ''}>
            <legend className="mascot-form__label">EMOJI</legend>
            <div className="mascot-form__emoji-row">
              {EMOJI_LEVELS.map((level) => (
                <label
                  key={level}
                  className={`mascot-emoji${voiceEmoji === level ? ' mascot-emoji--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={`${id}-emoji`}
                    checked={voiceEmoji === level}
                    disabled={trimmedVoice === ''}
                    onChange={() => setVoiceEmoji(level)}
                  />
                  {level.toUpperCase()}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mascot-form__format">
          <span className="mascot-form__format-title">FORMAT</span>
          <br />
          One spritesheet per state, as a strip or a grid. PNG under 3 MB. A strip of 64x64 frames
          is used as it is. Any other sheet opens the slicer: set columns and rows, then pick the
          frames for the loop. Frames must be square and are scaled to 64x64. Up to 16 frames per
          loop. Idle is required; a state with no sheet plays the idle loop.
        </div>

        <div className="mascot-form__loops-head">
          <span className="mascot-form__label">ANIMATION LOOPS</span>
          <span className="mascot-form__count">{filled.length} of 5 uploaded</span>
        </div>

        {MASCOT_STATES.map(renderRow)}

        {formError && (
          <div role="alert" className="mascot-form__alert">
            {formError}
          </div>
        )}
      </form>
    </Dialog>
  )
}

export default MascotDialog
