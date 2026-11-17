import { useCallback, useEffect, useRef, useState } from 'react'
import Dialog from '../components/Dialog'
import type { LeaveGuard } from '../screens/types'
import BossCard, { BossProblemCard } from './BossCard'
import BossDialog, { type BossDialogTarget } from './BossDialog'
import { useBosses } from './useBosses'
import './BossesTab.css'

export const BOSS_POOL_NOTE =
  "Turn POOL off to keep a boss out of the draw. At least one boss stays in the pool. Built-in bosses can't be edited or deleted."

type ConfirmState =
  | { kind: 'discard'; proceed: () => void }
  | { kind: 'delete'; id: string; name: string; inFight: boolean; busy: boolean }

type BossesTabProps = {
  // Lets the app ask before leaving while the editor has unsaved changes.
  setLeaveGuard: (guard: LeaveGuard | null) => void
}

// The BOSSES tab of MASCOTS: every boss, which ones are in the random pool, and the editor to
// add, change, and delete custom bosses.
function BossesTab({ setLeaveGuard }: BossesTabProps): React.JSX.Element {
  const { entries, loaded, error } = useBosses()
  // The key opens a fresh editor each time.
  const [editor, setEditor] = useState<{ key: number; target: BossDialogTarget } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nonce = useRef(0)
  const titleRef = useRef<HTMLHeadingElement>(null)

  const bosses = entries.flatMap((entry) => (entry.kind === 'boss' ? [entry] : []))
  const inPool = bosses.filter((entry) => entry.inPool).length
  const editingId = editor?.target.kind === 'edit' ? editor.target.entry.pack.id : null

  // Asks once before discarding unsaved changes in the editor.
  const askBeforeLeaving = useCallback(
    (proceed: () => void): void => {
      if (dirty) setConfirm({ kind: 'discard', proceed })
      else proceed()
    },
    [dirty]
  )

  useEffect(() => {
    if (!dirty) return
    setLeaveGuard(askBeforeLeaving)
    return () => setLeaveGuard(null)
  }, [dirty, askBeforeLeaving, setLeaveGuard])

  function openEditor(target: BossDialogTarget): void {
    nonce.current += 1
    setMessage(null)
    setEditor({ key: nonce.current, target })
  }

  function closeEditor(): void {
    setEditor(null)
    setDirty(false)
  }

  async function togglePool(id: string, on: boolean): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.mya.bosses.setInPool(id, on)
      if (!result.ok) setMessage(result.error.message)
    } catch (err) {
      console.error('Could not change the pool:', err)
      setMessage('The pool could not be changed.')
    }
    setBusy(false)
  }

  // Asks first. Whether a saved fight used the boss is read again now, so a fight that started
  // while this tab was open is not missed.
  async function askDelete(id: string, name: string): Promise<void> {
    let inFight = entries.some(
      (entry) => entry.kind === 'boss' && entry.pack.id === id && entry.inFight
    )
    try {
      const result = await window.mya.bosses.list()
      if (result.ok) {
        inFight = result.bosses.some(
          (boss) => boss.id === id && boss.problem === null && boss.inFight
        )
      }
    } catch (err) {
      console.error('Could not read the bosses before deleting:', err)
    }
    setConfirm({ kind: 'delete', id, name, inFight, busy: false })
  }

  async function confirmDelete(id: string): Promise<void> {
    setConfirm((current) => (current?.kind === 'delete' ? { ...current, busy: true } : current))
    try {
      const result = await window.mya.bosses.remove(id)
      setMessage(result.ok ? null : result.error.message)
      // The boss open in the editor is gone: the editor closes, its changes with it.
      if (result.ok && editingId === id) closeEditor()
    } catch (err) {
      console.error('Could not delete the boss:', err)
      setMessage('The boss could not be deleted.')
    }
    setConfirm(null)
    // The card that held the DELETE button is gone, so focus the heading.
    titleRef.current?.focus()
  }

  return (
    <div className="bosses">
      <div className="bosses__head">
        <h2 ref={titleRef} tabIndex={-1} className="bosses__title">
          BOSSES
        </h2>
        <span className="bosses__count">
          {inPool} of {bosses.length} in the pool
        </span>
      </div>
      {error && (
        <p role="alert" className="bosses__error">
          {error}
        </p>
      )}
      {message && (
        <p role="alert" className="bosses__error">
          {message}
        </p>
      )}

      <div className="bosses__grid-wrap">
        <div className="bosses__grid">
          {entries.map((entry) =>
            entry.kind === 'problem' ? (
              <BossProblemCard
                key={entry.id}
                id={entry.id}
                problem={entry.problem}
                busy={busy}
                onDelete={() => void askDelete(entry.id, entry.id)}
              />
            ) : (
              <BossCard
                key={entry.pack.id}
                pack={entry.pack}
                builtIn={entry.builtIn}
                inPool={entry.inPool}
                editing={entry.pack.id === editingId}
                busy={busy || !loaded}
                onTogglePool={() => void togglePool(entry.pack.id, !entry.inPool)}
                onEdit={() => openEditor({ kind: 'edit', entry })}
                onDelete={() => void askDelete(entry.pack.id, entry.pack.name)}
              />
            )
          )}
          <button type="button" className="bosses__add" onClick={() => openEditor({ kind: 'new' })}>
            <span className="bosses__add-plus" aria-hidden="true">
              +
            </span>
            ADD BOSS
          </button>
        </div>
      </div>

      <p className="bosses__note">{BOSS_POOL_NOTE}</p>

      {editor && (
        <BossDialog
          key={editor.key}
          target={editor.target}
          onDirtyChange={setDirty}
          onSaved={closeEditor}
          onCancel={() => askBeforeLeaving(closeEditor)}
          onDelete={() => {
            if (editor.target.kind === 'edit') {
              void askDelete(editor.target.entry.pack.id, editor.target.entry.pack.name)
            }
          }}
        />
      )}

      {confirm?.kind === 'discard' && (
        <Dialog
          title="DISCARD CHANGES?"
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setConfirm(null)}
              >
                KEEP EDITING
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => {
                  const { proceed } = confirm
                  setConfirm(null)
                  setDirty(false)
                  proceed()
                }}
              >
                DISCARD
              </button>
            </>
          }
        >
          <p>This boss has unsaved changes. They will be lost, with any pictures not yet saved.</p>
        </Dialog>
      )}

      {confirm?.kind === 'delete' && (
        <Dialog
          title="DELETE BOSS?"
          tone="danger"
          onClose={() => {
            if (!confirm.busy) setConfirm(null)
          }}
          actions={
            <>
              <button
                type="button"
                className="button button--secondary"
                disabled={confirm.busy}
                onClick={() => setConfirm(null)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={confirm.busy}
                onClick={() => void confirmDelete(confirm.id)}
              >
                DELETE
              </button>
            </>
          }
        >
          <p>
            Delete <strong>{confirm.name}</strong>? Its folder goes to the trash.
          </p>
          {confirm.inFight && <p>A fight using this boss will show The Red Suite instead.</p>}
        </Dialog>
      )}
    </div>
  )
}

export default BossesTab
