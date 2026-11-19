import { useEffect, useId, useState } from 'react'
import type { AccountData } from '../../../shared/account'
import type { ChatStarts } from '../../../shared/chats'
import type { ProviderId } from '../../../shared/models'
import {
  CANNOT_START_LINE,
  STATUS_TEXT,
  cardState,
  checkingLine,
  confirmLines,
  initialSelection,
  startLabel,
  type CardState
} from '../../../shared/providerCards'
import { PROVIDERS, PROVIDER_ORDER } from '../../../shared/providers'
import { useProvidersStatus } from '../hooks/useProvidersStatus'
import Dialog from './Dialog'
import ProviderGlyph from './ProviderGlyph'
import './NewChatDialog.css'

type NewChatDialogProps = {
  account: AccountData
  // The provider of the chat that is open, or null when the project has none.
  current: ProviderId | null
  // The open chat has no message yet: nothing moves to HISTORY, so there is no confirm line.
  openIsEmpty: boolean
  onClose: () => void
  // START <PROVIDER> CHAT. Returns the reason it did not work, or null.
  onStart: (provider: ProviderId) => Promise<string | null>
  // "Sign in on LOGINS": closes the dialog and opens LOGINS.
  onSignIn: () => void
}

// NEW CHAT from designs/22-new-chat.html and 22e-provider-cards.html: pick who runs the chat. The
// provider stays with the chat for good. Three cards in a radio group; a provider that is not
// signed in (or installed) is disabled, with the way to LOGINS.
function NewChatDialog({
  account,
  current,
  openIsEmpty,
  onClose,
  onStart,
  onSignIn
}: NewChatDialogProps): React.JSX.Element {
  const { status } = useProvidersStatus(true)
  const [starts, setStarts] = useState<ChatStarts | null>(null)
  const [chosen, setChosen] = useState<ProviderId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const nameId = useId()

  // What a new chat of each provider starts on: read once when the dialog opens.
  useEffect(() => {
    let active = true
    window.mya.chats.starts().then(
      (result) => {
        if (active && result.ok) setStarts(result.starts)
      },
      (err: unknown) => console.error('Could not read where chats start:', err)
    )
    return () => {
      active = false
    }
  }, [])

  const states = {} as Record<ProviderId, CardState>
  for (const provider of PROVIDER_ORDER) {
    states[provider] = cardState(provider, {
      claude:
        account.account.kind === 'loading'
          ? null
          : account.account.kind === 'signed_in'
            ? 'signed_in'
            : 'signed_out',
      cli:
        provider === 'claude' || status === null
          ? null
          : { installed: status[provider].installed, loggedIn: status[provider].loggedIn }
    })
  }
  const selected =
    chosen !== null && states[chosen] === 'ready'
      ? chosen
      : initialSelection(current, states, PROVIDER_ORDER)
  // The selected card can change once the sign-ins are read (Codex turns out to be signed in and is
  // the current provider). The dialog put focus on the radio that was selected when it opened, so
  // while nothing has been chosen by hand, focus follows the selection.
  useEffect(() => {
    if (chosen !== null || selected === null) return
    const input = document.getElementById(`${nameId}-${selected}`)
    const active = document.activeElement
    if (
      input instanceof HTMLInputElement &&
      active instanceof HTMLInputElement &&
      active.name === 'provider' &&
      active !== input
    ) {
      input.focus()
    }
  }, [chosen, selected, nameId])
  const confirm = selected
    ? confirmLines({ current, target: selected, openIsEmpty })
    : { main: null, note: null }

  async function start(): Promise<void> {
    if (!selected || starting) return
    setStarting(true)
    setError(null)
    const failed = await onStart(selected)
    setStarting(false)
    if (failed) setError(failed)
  }

  return (
    <Dialog
      title="NEW CHAT"
      subtitle="Pick who runs this chat. It stays with them until you start another."
      size="providers"
      closeButton
      onClose={onClose}
      actions={
        <>
          {confirm.main && (
            <p className="nc-confirm nc-footer-line">
              {confirm.main}
              {confirm.note && <span className="nc-confirm__note"> {confirm.note}</span>}
            </p>
          )}
          <button type="button" className="button button--secondary" onClick={onClose}>
            CANCEL
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!selected || starting}
            onClick={() => void start()}
          >
            {selected ? startLabel(selected) : 'START A CHAT'}
          </button>
        </>
      }
    >
      <fieldset className="nc-cards">
        <legend className="visually-hidden">Provider</legend>
        {PROVIDER_ORDER.map((provider) => {
          const info = PROVIDERS[provider]
          const state = states[provider]
          const enabled = state === 'ready'
          const picked = selected === provider
          const start = starts?.[provider]
          const className = [
            'nc-card',
            picked ? 'nc-card--selected' : '',
            enabled ? '' : 'nc-card--off',
            state === 'checking' ? 'nc-card--checking' : ''
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <label
              key={provider}
              className={className}
              htmlFor={`${nameId}-${provider}`}
              aria-busy={state === 'checking' ? 'true' : undefined}
            >
              <span className="nc-card__head">
                <input
                  id={`${nameId}-${provider}`}
                  type="radio"
                  name="provider"
                  value={provider}
                  checked={picked}
                  disabled={!enabled}
                  // Focus starts on the selected radio.
                  data-autofocus={picked ? '' : undefined}
                  onChange={() => setChosen(provider)}
                />
                <ProviderGlyph provider={provider} scale={3} />
                <span className="nc-card__name">{info.label}</span>
              </span>
              <span className={`nc-card__status nc-card__status--${state}`}>
                <span className="nc-card__dot" aria-hidden="true" />
                {STATUS_TEXT[state]}
              </span>
              {state === 'checking' ? (
                <span className="nc-card__line">{checkingLine(provider)}</span>
              ) : (
                <>
                  {enabled ? (
                    <span className="nc-card__line">
                      Starts on{' '}
                      <b>
                        {start
                          ? start.level
                            ? `${start.model} · ${start.level}`
                            : start.model
                          : '...'}
                      </b>
                    </span>
                  ) : (
                    <span className="nc-card__line">{CANNOT_START_LINE}</span>
                  )}
                  <span className="nc-card__summary">{info.summary}</span>
                  {enabled ? (
                    <span className="nc-card__missing">
                      {provider !== 'claude' && (
                        <span className="nc-card__missing-label">NOT HERE YET</span>
                      )}
                      <span>{info.missing}</span>
                    </span>
                  ) : (
                    <a
                      href="#logins"
                      className="nc-card__link"
                      onClick={(event) => {
                        event.preventDefault()
                        onSignIn()
                      }}
                    >
                      Sign in on LOGINS
                    </a>
                  )}
                </>
              )}
            </label>
          )
        })}
      </fieldset>

      {error && (
        <p className="nc-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  )
}

export default NewChatDialog
