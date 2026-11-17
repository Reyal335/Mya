import type { ReactNode } from 'react'
import { MAX_FPS, MIN_FPS } from '../../../shared/mascotRules'
import Mascot from './Mascot'
import SheetStrip from './SheetStrip'
import './SheetRow.css'

type ButtonSpec = {
  label: string
  title?: string
  disabled: boolean
  onClick: () => void
}

type SheetRowProps = {
  // What a screen reader calls the row: "idle loop".
  ariaLabel: string
  // The word at the left, such as IDLE, and a color for it (a class of the mascot editor).
  tag: string
  tagClass?: string
  required?: boolean
  meta: string
  look: 'filled' | 'empty' | 'error' | 'slicing'
  error: string | null
  fps: {
    text: string
    // The field holds a value (a sheet or an open slicer).
    active: boolean
    disabled: boolean
    invalid: boolean
    label: string
    title?: string
    onChange: (text: string) => void
  }
  upload: { replace: boolean; label: string; onClick: () => void }
  // REUSE SHEET and REMOVE are the mascot editor's; a row without them leaves them out.
  reuse?: ButtonSpec
  remove?: ButtonSpec
  // The open slicer, which takes the place of the body.
  slicer: ReactNode | null
  // The picked sheet, shown as the loop playing and the strip with its frame dividers.
  sheet: { src: string; frames: number } | null
  loop: { fps: number | null; reverse: boolean; label: string; stripLabel: string }
  // Said while the row has no sheet.
  placeholder: string
  // Under the loop (the mascot's REVERSE AT END).
  extra?: ReactNode
  fpsProblem: string | null
}

// One row of an upload form: its name, the file and its size, FPS, UPLOAD or REPLACE, the
// slicer for a grid, the loop playing, and the strip with frame dividers. The mascot editor
// has one per state; the boss editor has one, for its idle loop.
function SheetRow({
  ariaLabel,
  tag,
  tagClass,
  required = false,
  meta,
  look,
  error,
  fps,
  upload,
  reuse,
  remove,
  slicer,
  sheet,
  loop,
  placeholder,
  extra,
  fpsProblem
}: SheetRowProps): React.JSX.Element {
  const rowClass = ['sheet-row']
  if (look === 'slicing') rowClass.push('sheet-row--slicing')
  else if (look === 'error') rowClass.push('sheet-row--error')
  else if (look === 'empty') rowClass.push('sheet-row--empty')

  return (
    <section className={rowClass.join(' ')} aria-label={ariaLabel}>
      <div className="sheet-row__head">
        <span className={`sheet-row__state${tagClass ? ` ${tagClass}` : ''}`}>{tag}</span>
        {required && <span className="sheet-row__required">required</span>}
        <span className="sheet-row__meta">{meta}</span>
        {/* Always FPS, UPLOAD or REPLACE, then REUSE SHEET and REMOVE when the row has them. A
            control that does not apply is disabled, so the buttons never move. */}
        <div className="sheet-row__controls">
          <label className="sheet-row__fps">
            FPS
            <input
              className="sheet-row__fps-input"
              type="number"
              inputMode="numeric"
              min={MIN_FPS}
              max={MAX_FPS}
              step={1}
              value={fps.active ? fps.text : ''}
              disabled={fps.disabled}
              aria-label={fps.label}
              aria-invalid={fps.invalid}
              title={fps.title}
              onChange={(event) => fps.onChange(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="button button--small sheet-row__button"
            aria-label={upload.label}
            onClick={upload.onClick}
          >
            {upload.replace ? 'REPLACE' : 'UPLOAD'}
          </button>
          {reuse && (
            <button
              type="button"
              className="button button--secondary button--small sheet-row__button sheet-row__button--wide"
              disabled={reuse.disabled}
              aria-label={reuse.label}
              title={reuse.title}
              onClick={reuse.onClick}
            >
              REUSE SHEET
            </button>
          )}
          {remove && (
            <button
              type="button"
              className="button button--secondary button--small sheet-row__button"
              disabled={remove.disabled}
              aria-label={remove.label}
              title={remove.title}
              onClick={remove.onClick}
            >
              REMOVE
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="sheet-row__error">
          <span className="sheet-row__error-mark" aria-hidden="true">
            X
          </span>
          <span>{error}</span>
        </div>
      )}

      {slicer ? (
        slicer
      ) : sheet ? (
        <div className="sheet-row__body">
          <div className="sheet-row__loop">
            <Mascot
              src={sheet.src}
              frames={sheet.frames}
              fps={loop.fps ?? 0}
              reverse={loop.reverse}
              scale={1}
              label={loop.label}
            />
          </div>
          <SheetStrip src={sheet.src} frames={sheet.frames} label={loop.stripLabel} />
        </div>
      ) : (
        <div className="sheet-row__placeholder">{placeholder}</div>
      )}

      {extra}

      {fpsProblem && <p className="sheet-row__fps-error">{fpsProblem}</p>}
    </section>
  )
}

export default SheetRow
