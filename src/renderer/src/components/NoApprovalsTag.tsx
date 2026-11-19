import { useEffect, useId, useRef, useState } from 'react'
import type { ProviderId } from '../../../shared/models'
import { NO_APPROVALS_HINT, noApprovalsLine } from '../../../shared/providers'
import './NoApprovalsTag.css'

type NoApprovalsTagProps = { provider: ProviderId }

// On a Codex or Gemini chat only: a button at the left of the composer's toolbar that says this
// chat runs without asking, and opens a popover that says why STOP is the answer. It cannot be
// turned off or hidden, and it never uses the error color: nothing is broken, it is how the
// provider works. Enter or Space opens it, Escape closes it and focus goes back to the tag.
function NoApprovalsTag({ provider }: NoApprovalsTagProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const line = noApprovalsLine(provider)

  // A click anywhere outside closes it. Focus stays where the click put it.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  function close(): void {
    setOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="no-approvals"
        aria-expanded={open}
        aria-controls={id}
        // The whole sentence is part of its name, so it is read without opening the popover.
        aria-label={`No approvals. ${line} Show details`}
        onClick={() => setOpen((on) => !on)}
        onKeyDown={(event) => {
          if (open && event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            close()
          }
        }}
      >
        <span className="no-approvals__square" aria-hidden="true" />
        <span className="no-approvals__label" aria-hidden="true">
          NO APPROVALS
        </span>
        <span className="no-approvals__help" aria-hidden="true">
          ?
        </span>
      </button>
      {open && (
        <div
          ref={popoverRef}
          id={id}
          role="dialog"
          aria-label="No approvals"
          className="no-approvals__popover"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            }
          }}
        >
          <p className="no-approvals__line">{line}</p>
          <p className="no-approvals__hint">{NO_APPROVALS_HINT}</p>
        </div>
      )}
    </>
  )
}

export default NoApprovalsTag
