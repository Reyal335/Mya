import { useEffect, useId, useRef, useState } from 'react'
import type { BossBackgroundChange, BossDraft, BossIdleChange } from '../../../shared/ipc'
import {
  BOSS_ACCENTS,
  BOSS_NAME_MAX,
  bossNameError,
  DEFAULT_BOSS_ACCENT,
  DEFAULT_BOSS_FPS,
  isBossAccent
} from '../../../shared/bosses'
import { FRAME_SIZE, fpsError, parseFps } from '../../../shared/mascotRules'
import { startingGrid } from '../../../shared/sliceRules'
import Dialog from '../components/Dialog'
import SheetRow from '../components/SheetRow'
import SheetSlicer from '../components/SheetSlicer'
import ThemeBackdrop from '../components/ThemeBackdrop'
import { useSheetPicker, type PickedStrip, type SheetApi } from '../components/useSheetPicker'
import type { BossEntry } from './packs'
import BossPreview from './BossPreview'
import BossSprite, { type BossEffect } from './BossSprite'
import { POP_MS, edgeSpot, type Pop } from './useRoundReplay'
import './BossDialog.css'

export type BossDialogTarget =
  { kind: 'new' } | { kind: 'edit'; entry: Extract<BossEntry, { kind: 'boss' }> }

type BossDialogProps = {
  target: BossDialogTarget
  onDirtyChange: (dirty: boolean) => void
  onSaved: () => void
  // CANCEL and Escape. The screen asks before discarding changes.
  onCancel: () => void
  // DELETE BOSS in edit mode. The screen asks first.
  onDelete: () => void
}

type Sheet = { src: string; frames: number; width: number; fileName: string }
type Background = { src: string; fileName: string; width: number; height: number }

// How the boss editor picks and cuts its one strip. Picks that are not saved are dropped with
// the sources when the editor closes.
const BOSS_SHEETS: SheetApi = {
  pick: () => window.mya.bosses.pickIdle(),
  slice: (sourceToken, columns, rows, cells) =>
    window.mya.bosses.sliceIdle(sourceToken, columns, rows, cells),
  dropSources: () => window.mya.bosses.dropSources()
}

function framesText(frames: number): string {
  return `${frames} ${frames === 1 ? 'frame' : 'frames'}`
}

function startingState(target: BossDialogTarget): {
  name: string
  accent: string
  fps: string
  sheet: Sheet | null
  background: Background | null
} {
  if (target.kind === 'new') {
    return {
      name: '',
      accent: DEFAULT_BOSS_ACCENT,
      fps: String(DEFAULT_BOSS_FPS),
      sheet: null,
      background: null
    }
  }
  const { pack, idleFile, backgroundInfo } = target.entry
  return {
    name: pack.name,
    accent: pack.accent,
    fps: String(pack.idle.fps),
    sheet: {
      src: pack.idle.src,
      frames: pack.idle.frames,
      width: pack.idle.frames * FRAME_SIZE,
      fileName: idleFile ?? 'idle.png'
    },
    background:
      pack.background && backgroundInfo
        ? {
            src: pack.background,
            fileName: backgroundInfo.file,
            width: backgroundInfo.width,
            height: backgroundInfo.height
          }
        : null
  }
}

// The editor from "21. Boss manager": a name, the one idle loop, a background, an accent color,
// a live preview, and what the app adds (the white hit flash and the rest). A picked file waits
// in the main process until SAVE BOSS; any not saved are dropped when the editor closes.
function BossDialog({
  target,
  onDirtyChange,
  onSaved,
  onCancel,
  onDelete
}: BossDialogProps): React.JSX.Element {
  const id = useId()
  const formId = `${id}-form`
  const editId = target.kind === 'edit' ? target.entry.pack.id : null
  const [initial] = useState(() => startingState(target))
  const [name, setName] = useState(initial.name)
  const [nameTouched, setNameTouched] = useState(editId !== null)
  const [accent, setAccent] = useState(initial.accent)
  const [fps, setFps] = useState(initial.fps)
  const [sheet, setSheet] = useState(initial.sheet)
  const [idleChange, setIdleChange] = useState<BossIdleChange>({ type: 'keep' })
  const [idleError, setIdleError] = useState<string | null>(null)
  const [background, setBackground] = useState(initial.background)
  const [backgroundChange, setBackgroundChange] = useState<BossBackgroundChange>({ type: 'keep' })
  const [backgroundError, setBackgroundError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // TEST HIT: a new id plays the white flash again, with a "−1" pop.
  const [effect, setEffect] = useState<BossEffect | null>(null)
  const [pops, setPops] = useState<Pop[]>([])
  const hits = useRef(0)
  const popTimers = useRef<number[]>([])

  useEffect(() => {
    const timers = popTimers.current
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [])

  // The latest values, for handlers that run after an await.
  const idleRef = useRef({ sheet, change: idleChange, fps })
  useEffect(() => {
    idleRef.current = { sheet, change: idleChange, fps }
  })

  const picker = useSheetPicker<'idle'>(BOSS_SHEETS, {
    // A replaced strip keeps its speed; the first one starts at the default.
    startingFps: () => (idleRef.current.sheet ? idleRef.current.fps : String(DEFAULT_BOSS_FPS)),
    startingReverse: () => false,
    onStrip: (_row, strip: PickedStrip, nextFps) => {
      dropIdleToken(idleRef.current.change)
      setSheet({
        src: strip.preview,
        frames: strip.frames,
        width: strip.frames * FRAME_SIZE,
        fileName: strip.fileName
      })
      setIdleChange({ type: 'token', token: strip.token })
      setFps(nextFps)
      setIdleError(null)
    },
    onError: (_row, message) => setIdleError(message)
  })

  function dropIdleToken(change: BossIdleChange): void {
    if (change.type === 'token') picker.release(change.token)
  }

  const nameError = bossNameError(name)
  const fpsValid = parseFps(fps) !== null
  const slicer =
    picker.slicing && picker.source ? { ...picker.slicing, source: picker.source } : null
  const dirty =
    slicer !== null ||
    name.trim() !== initial.name.trim() ||
    accent !== initial.accent ||
    idleChange.type !== 'keep' ||
    backgroundChange.type !== 'keep' ||
    (sheet !== null && fps !== initial.fps)
  const valid = nameError === null && sheet !== null && fpsValid && isBossAccent(accent)
  const canSave = valid && dirty && !saving && slicer === null

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  async function pickBackground(): Promise<void> {
    try {
      const result = await window.mya.bosses.pickBackground()
      // A refused file leaves the row, and the picture, as they were.
      if (!result.ok) {
        setBackgroundError(result.error.message)
        return
      }
      if (result.canceled) return
      setBackground({
        src: result.preview,
        fileName: result.fileName,
        width: result.width,
        height: result.height
      })
      setBackgroundChange({ type: 'token', token: result.token })
      setBackgroundError(null)
    } catch (err) {
      console.error('Could not pick a background:', err)
      setBackgroundError('The background could not be opened.')
    }
  }

  function removeBackground(): void {
    setBackground(null)
    // A background that was never saved just goes; a saved one is removed on SAVE.
    setBackgroundChange(initial.background ? { type: 'remove' } : { type: 'keep' })
    setBackgroundError(null)
  }

  function testHit(): void {
    hits.current += 1
    const pop: Pop = { id: -hits.current, text: '−1', ...edgeSpot() }
    setEffect({ kind: 'hit', id: hits.current })
    setPops((current) => [...current, pop])
    popTimers.current.push(
      window.setTimeout(() => setPops((current) => current.filter((p) => p.id !== pop.id)), POP_MS)
    )
  }

  async function save(): Promise<void> {
    setNameTouched(true)
    if (!canSave) return
    setSaving(true)
    setFormError(null)
    try {
      const draft: BossDraft = {
        name: name.trim(),
        accent,
        fps: parseFps(fps) ?? DEFAULT_BOSS_FPS,
        idle: idleChange,
        background: backgroundChange
      }
      const result = editId
        ? await window.mya.bosses.update(editId, draft)
        : await window.mya.bosses.create(draft)
      if (result.ok) {
        // Saved files are no longer pending; main has already let go of them.
        picker.forgetPending()
        onDirtyChange(false)
        onSaved()
        return
      }
      setFormError(result.error.message)
    } catch (err) {
      console.error('Could not save the boss:', err)
      setFormError('The boss could not be saved.')
    }
    setSaving(false)
  }

  const shownFps = slicer ? slicer.fps : fps
  const parsedFps = parseFps(shownFps)
  const oneFrame = !slicer && sheet?.frames === 1
  const hasSheet = slicer !== null || sheet !== null
  const fpsProblem = hasSheet && !oneFrame ? fpsError(shownFps) : null
  const idleMeta = slicer
    ? `${slicer.source.fileName} · ${slicer.source.width}x${slicer.source.height} · slicing`
    : sheet
      ? `${sheet.fileName} · ${sheet.width}x${FRAME_SIZE} · ${framesText(sheet.frames)}`
      : 'No sheet yet'
  const previewIdle = sheet
    ? { src: sheet.src, frames: sheet.frames, fps: parsedFps ?? DEFAULT_BOSS_FPS }
    : null

  return (
    <Dialog
      title={editId ? 'EDIT BOSS' : 'ADD BOSS'}
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
            {saving ? 'SAVING...' : 'SAVE BOSS'}
          </button>
          <button type="button" className="button button--secondary" onClick={onCancel}>
            CANCEL
          </button>
          {editId && (
            <button
              type="button"
              className="button button--danger boss-form__delete"
              disabled={saving}
              onClick={onDelete}
            >
              DELETE BOSS
            </button>
          )}
        </>
      }
    >
      <form
        id={formId}
        className="boss-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="boss-form__field">
          <label htmlFor={`${id}-name`} className="boss-form__label">
            NAME
          </label>
          <input
            id={`${id}-name`}
            className="boss-form__input"
            type="text"
            value={name}
            placeholder="Name your boss"
            maxLength={BOSS_NAME_MAX}
            aria-invalid={nameTouched && nameError !== null}
            aria-describedby={`${id}-name-help`}
            onChange={(event) => {
              setNameTouched(true)
              setName(event.target.value)
            }}
          />
          <div id={`${id}-name-help`}>
            {nameTouched && nameError && <p className="boss-form__error">{nameError}</p>}
          </div>
        </div>

        <div className="boss-form__format">
          <span className="boss-form__format-title">FORMAT</span>
          <br />
          One idle loop: a horizontal strip of 64x64 frames, PNG. Height 64px, width a multiple of
          64, up to 16 frames. Drawn 4x in battle. A strip of 64x64 frames is used as it is. Any
          other sheet opens the slicer: set columns and rows, then pick the frames for the loop.
          Frames must be square and are scaled to 64x64.
        </div>

        <SheetRow
          ariaLabel="idle loop"
          tag="IDLE LOOP"
          required
          meta={idleMeta}
          look={slicer ? 'slicing' : idleError ? 'error' : !sheet ? 'empty' : 'filled'}
          error={idleError}
          fps={{
            text: shownFps,
            active: hasSheet,
            disabled: !hasSheet || oneFrame,
            invalid: Boolean(fpsProblem),
            label: 'idle FPS',
            title: oneFrame
              ? 'A one-frame sheet does not animate.'
              : !hasSheet
                ? 'No sheet yet.'
                : undefined,
            onChange: (value) => {
              if (slicer) picker.setSlicingFps(value)
              else setFps(value)
            }
          }}
          upload={{
            replace: sheet !== null,
            label: `${sheet ? 'Replace' : 'Upload'} idle loop`,
            onClick: () => void picker.pick('idle')
          }}
          slicer={
            slicer ? (
              <SheetSlicer
                key={slicer.opening}
                source={slicer.source}
                initialGrid={
                  slicer.source.grid ?? startingGrid(slicer.source.width, slicer.source.height)
                }
                initialReverse={false}
                fps={parsedFps}
                onUse={(grid, cells, reverse) =>
                  picker.confirmSlice('idle', slicer.fps, grid, cells, reverse)
                }
                onCancel={picker.closeSlicer}
              />
            ) : null
          }
          sheet={sheet ? { src: sheet.src, frames: sheet.frames } : null}
          loop={{
            fps: parsedFps,
            reverse: false,
            label: 'idle loop playing',
            stripLabel: sheet ? `idle sheet, ${framesText(sheet.frames)}` : ''
          }}
          placeholder="Idle loop is required."
          fpsProblem={fpsProblem}
        />

        <section
          className={`sheet-row${backgroundError ? ' sheet-row--error' : !background ? ' sheet-row--empty' : ''}`}
          aria-label="background"
        >
          <div className="sheet-row__head">
            <span className="sheet-row__state">BACKGROUND</span>
            <span className="sheet-row__meta">
              {background
                ? `${background.fileName} · ${background.width}x${background.height}`
                : 'No background yet'}
            </span>
            <div className="sheet-row__controls">
              <button
                type="button"
                className="button button--small sheet-row__button"
                aria-label={`${background ? 'Replace' : 'Upload'} background`}
                onClick={() => void pickBackground()}
              >
                {background ? 'REPLACE' : 'UPLOAD'}
              </button>
              {background && (
                <button
                  type="button"
                  className="button button--secondary button--small sheet-row__button"
                  aria-label="Remove background"
                  onClick={removeBackground}
                >
                  REMOVE
                </button>
              )}
            </div>
          </div>
          {backgroundError && (
            <div role="alert" className="sheet-row__error">
              <span className="sheet-row__error-mark" aria-hidden="true">
                X
              </span>
              <span>{backgroundError}</span>
            </div>
          )}
          <div className="boss-form__background">
            <div className="boss-form__background-thumb">
              {/* The 240x125 thumbnail: the same background rule as the preview and the battle. */}
              <ThemeBackdrop image={background?.src ?? null} fade={0} what="boss background" />
            </div>
            <div className="boss-form__background-notes">
              <p>PNG or JPG, 320x180 to 4000x4000, up to 5 MB.</p>
              <p>
                Anchored to the bottom edge, cropped to fit. Small pixel art keeps crisp pixels.
              </p>
              <p>No background: the battle uses plain navy.</p>
            </div>
          </div>
        </section>

        <fieldset className="boss-form__accents">
          <legend className="boss-form__sr">Accent color</legend>
          <div className="boss-form__swatches">
            {BOSS_ACCENTS.map((color) => (
              <input
                key={color}
                type="radio"
                name={`${id}-accent`}
                className="boss-form__swatch"
                style={{ backgroundColor: color }}
                value={color}
                checked={accent.toUpperCase() === color}
                aria-label={color}
                onChange={() => setAccent(color)}
              />
            ))}
          </div>
          <p className="boss-form__note">
            Used for the battle frame, the name, and the floor glow.
          </p>
        </fieldset>

        <div className="boss-form__field">
          <span className="boss-form__label">PREVIEW</span>
          <BossPreview
            name={name}
            accent={accent}
            background={background?.src ?? null}
            idle={previewIdle}
            effect={effect}
            pops={pops}
          />
        </div>

        <div className="boss-form__added">
          <div className="boss-form__frames">
            <figure className="boss-form__frame">
              <span className="boss-form__frame-box">
                {previewIdle && (
                  <BossSprite pack={{ idle: previewIdle }} scale={1} still label="Idle frame" />
                )}
              </span>
              <figcaption className="boss-form__frame-label">IDLE</figcaption>
            </figure>
            <span className="boss-form__arrow" aria-hidden="true">
              ›
            </span>
            <figure className="boss-form__frame boss-form__frame--hit">
              <span className="boss-form__frame-box">
                {previewIdle && (
                  <BossSprite
                    pack={{ idle: previewIdle }}
                    scale={1}
                    still
                    hold="hit"
                    label="Hit frame"
                  />
                )}
              </span>
              <figcaption className="boss-form__frame-label">HIT</figcaption>
            </figure>
          </div>
          <div className="boss-form__added-text">
            <span className="boss-form__added-title">ADDED FOR YOU</span>
            <p>
              Every boss flashes white for a moment when it takes a hit, like the built-in ones.
              Heals flash green, and a defeated boss sinks and fades. You only draw the idle loop.
            </p>
            <button
              type="button"
              className="button button--small boss-form__test-hit"
              disabled={!previewIdle}
              onClick={testHit}
            >
              TEST HIT
            </button>
          </div>
        </div>

        {formError && (
          <div role="alert" className="boss-form__alert">
            {formError}
          </div>
        )}
      </form>
    </Dialog>
  )
}

export default BossDialog
