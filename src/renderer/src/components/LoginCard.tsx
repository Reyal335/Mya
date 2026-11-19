import { useEffect, useId, useState, type FormEvent } from 'react'
import type { CliProviderId, ProviderStatus } from '../../../shared/ipc'
import { PROVIDER_NAMES } from '../../../shared/chats'
import { countdownSpeech, installFill, loginRows, loginStatus } from '../../../shared/loginCards'
import {
  SIGN_IN_TIMEOUT_MS,
  announcement,
  binaryFor,
  countdownLabel,
  envKeySignOutMessage,
  packageFor,
  remainingMs,
  wontStartMessage
} from '../../../shared/logins'
import { PROVIDERS } from '../../../shared/providers'
import {
  cancel,
  clearFailure,
  installCli,
  saveKey,
  signInInBrowser,
  signOut,
  useLoginCard
} from '../hooks/useLoginCard'
import ProviderGlyph from './ProviderGlyph'
import './LoginCard.css'

const INSTALL_BAR_SEGMENTS = 14

type LoginCardProps = {
  provider: CliProviderId
  // null until the first answer.
  status: ProviderStatus | null
}

const KEY_PLACEHOLDER: Record<CliProviderId, string> = { codex: 'sk-...', gemini: 'AIza...' }

const PLAIN_TEXT_NOTE = 'Saved on this computer in plain text.'

function ErrorTag(): React.JSX.Element {
  return (
    <span className="login-card__error-tag">
      <span className="login-card__square" aria-hidden="true" />
      ERROR
    </span>
  )
}

// One LOGINS card for Codex or Gemini (designs/22i-logins.html and 22j-logins-states.html): the
// status, a table of what is known, and whatever the card can do now: install the CLI, sign in by
// browser or by pasted key, sign out. What an action is doing and what failed is kept by
// useLoginCard, so it survives leaving the screen.
function LoginCard({ provider, status }: LoginCardProps): React.JSX.Element {
  const ids = useId()
  const info = PROVIDERS[provider]
  const name = PROVIDER_NAMES[provider]
  const pkg = packageFor(provider)
  const binary = binaryFor(provider)
  const { phase, failure, stage, startedAt } = useLoginCard(provider)

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  // REPLACE KEY on a card signed in by a saved key opens the field again.
  const [replacing, setReplacing] = useState(false)
  // The log that COPY LOG last copied, so the button says COPIED only for that one.
  const [copiedLog, setCopiedLog] = useState<string | null>(null)
  // The clock for the browser sign-in, kept as a number the interval moves.
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (phase !== 'signing_in') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const tone = loginStatus(status, phase, failure?.where === 'install')
  const rows = loginRows(status, phase)

  const broken = status?.cli === 'broken'
  const missing = status !== null && !broken && !status.installed
  const installing = phase === 'installing'
  const showInstall = missing || installing
  const signedIn = status?.loggedIn === true
  const busy = phase !== 'idle'
  const signingIn = phase === 'signing_in'
  const remaining = remainingMs(startedAt, Math.max(now, startedAt))

  const keyFailure = failure?.where === 'key' ? failure : null
  const rejected = keyFailure?.code === 'key_rejected'
  const keyInputId = `${ids}-key`
  const keyNoteId = `${ids}-key-note`
  const keyErrorId = `${ids}-key-error`
  const envNoteId = `${ids}-env`

  async function submitKey(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (apiKey.trim() === '' || busy) return
    if (await saveKey(provider, apiKey)) {
      setApiKey('')
      setShowKey(false)
      setReplacing(false)
    }
  }

  async function copyLog(): Promise<void> {
    if (!failure?.log) return
    try {
      await navigator.clipboard.writeText(failure.log)
      setCopiedLog(failure.log)
    } catch (err) {
      console.error('Could not copy the log:', err)
    }
  }

  const browserButton = (primary: boolean, label: string): React.JSX.Element => (
    <button
      type="button"
      className={`button ${primary ? 'button--primary' : 'button--secondary'}`}
      disabled={busy}
      onClick={() => void signInInBrowser(provider)}
    >
      {label}
    </button>
  )

  // The two sign-in sections, for a card that is not signed in or is switching account.
  const browserSection = (title: string): React.JSX.Element => {
    const failed = failure?.where === 'sign_in' ? failure : null
    return (
      <div className="login-card__section">
        <span className="login-card__label">{title}</span>
        {signingIn ? (
          <>
            <div className="login-card__waiting" aria-live="polite">
              <span className="login-card__wait-tag">
                <span className="login-card__square" aria-hidden="true" />
                WAITING FOR BROWSER
              </span>
              <span>Finish signing in in your browser.</span>
              <span
                className="login-card__clock"
                role="timer"
                aria-label={countdownSpeech(remaining)}
              >
                {countdownLabel(remaining)}
              </span>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void cancel(provider)}
              >
                CANCEL
              </button>
              {/* Read out every 30 seconds, not every tick. */}
              <span className="login-card__sr">{announcement(remaining) ?? ''}</span>
            </div>
            <span className="login-card__hint">
              Stops waiting after {SIGN_IN_TIMEOUT_MS / 60_000} minutes.
            </span>
          </>
        ) : failed ? (
          <div role="alert" className="login-card__alert">
            <ErrorTag />
            <span className="login-card__message">{failed.message}</span>
            {browserButton(true, 'SIGN IN IN BROWSER')}
          </div>
        ) : (
          <>
            <span className="login-card__hint">
              Opens your browser. Come back here when it says you&apos;re done.
            </span>
            <div className="login-card__actions">
              {browserButton(!signedIn, signedIn ? 'SWITCH ACCOUNT' : 'SIGN IN IN BROWSER')}
            </div>
          </>
        )}
      </div>
    )
  }

  const keySection = (
    <div className="login-card__section">
      <span className="login-card__label">OR PASTE API KEY</span>
      <form className="login-card__key" onSubmit={(event) => void submitKey(event)}>
        <label htmlFor={keyInputId} className="login-card__key-label">
          API key
        </label>
        <div className="login-card__key-row">
          <input
            id={keyInputId}
            type={showKey ? 'text' : 'password'}
            className={`login-card__input${rejected ? ' login-card__input--error' : ''}`}
            placeholder={KEY_PLACEHOLDER[provider]}
            value={apiKey}
            disabled={busy}
            aria-invalid={rejected ? true : undefined}
            aria-describedby={`${keyNoteId}${keyFailure ? ` ${keyErrorId}` : ''}`}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setApiKey(event.target.value)
              // Typing a new key ends the error about the last one.
              if (keyFailure) clearFailure(provider, 'key')
            }}
          />
          <button
            type="button"
            className="button button--secondary button--small"
            aria-pressed={showKey}
            aria-controls={keyInputId}
            disabled={busy}
            onClick={() => setShowKey((value) => !value)}
          >
            {showKey ? 'HIDE' : 'SHOW'}
          </button>
          <button type="submit" className="button" disabled={busy || apiKey.trim() === ''}>
            {phase === 'saving' ? 'SAVING...' : 'SAVE KEY'}
          </button>
          {replacing && (
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => {
                setReplacing(false)
                setApiKey('')
              }}
            >
              CANCEL
            </button>
          )}
        </div>
        {keyFailure && (
          <span id={keyErrorId} role="alert" className="login-card__field-error">
            {keyFailure.message}
          </span>
        )}
        <span id={keyNoteId} className="login-card__plain-note">
          {PLAIN_TEXT_NOTE}
        </span>
      </form>
    </div>
  )

  return (
    <section className="login-card" aria-label={`${name} login`}>
      <div className="login-card__head">
        <ProviderGlyph provider={provider} scale={3} />
        <h2 className="login-card__title">{info.label}</h2>
        <span className={`login-card__status login-card__status--${tone.tone}`} role="status">
          <span className="login-card__square" aria-hidden="true" />
          {tone.label}
        </span>
      </div>
      <span className="login-card__summary">
        {name} chats and agents pinned to {name}.
      </span>

      <dl className="login-card__table">
        {rows.map((row) => (
          <div key={row.label} className="login-card__row">
            <dt>{row.label}</dt>
            <dd className={row.style ? `login-card__value--${row.style}` : undefined}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {broken && (
        <div className="login-card__section">
          <span className="login-card__label">CLI</span>
          <div role="alert" className="login-card__alert">
            <ErrorTag />
            <span className="login-card__message">{wontStartMessage(binary)}</span>
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() => void installCli(provider)}
            >
              INSTALL CLI
            </button>
          </div>
        </div>
      )}

      {showInstall && (
        <>
          <div className="login-card__section">
            <span className="login-card__label">1. INSTALL CLI</span>
            {installing ? (
              <>
                <div className="login-card__install" aria-live="polite">
                  <span>Installing {pkg}...</span>
                  <div
                    className="login-card__bar"
                    role="progressbar"
                    aria-label={`Installing ${name} CLI`}
                    aria-busy="true"
                    aria-valuetext={stage ?? 'Starting'}
                  >
                    {Array.from({ length: INSTALL_BAR_SEGMENTS }, (_, index) => (
                      <span
                        key={index}
                        className={`login-card__segment${index < installFill(stage, INSTALL_BAR_SEGMENTS) ? ' login-card__segment--on' : ''}`}
                      />
                    ))}
                  </div>
                  <span className="login-card__hint">{stage ?? 'npm: starting'}</span>
                </div>
                <div className="login-card__actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => void cancel(provider)}
                  >
                    CANCEL
                  </button>
                </div>
              </>
            ) : failure?.where === 'install' ? (
              <div role="alert" className="login-card__alert">
                <ErrorTag />
                <span className="login-card__message">{failure.message}</span>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void installCli(provider)}
                >
                  RETRY
                </button>
                {failure.log && (
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => void copyLog()}
                  >
                    {copiedLog === failure.log ? 'COPIED' : 'COPY LOG'}
                  </button>
                )}
              </div>
            ) : (
              <>
                <span className="login-card__text">
                  The {name} CLI isn&apos;t on this computer.
                </span>
                <div className="login-card__actions">
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={busy}
                    onClick={() => void installCli(provider)}
                  >
                    INSTALL CLI
                  </button>
                  <span className="login-card__hint">Runs npm install -g {pkg}</span>
                </div>
              </>
            )}
          </div>
          <div className="login-card__section">
            <span className="login-card__label">2. SIGN IN</span>
            <span id={envNoteId} className="login-card__hint">
              Install the CLI first.
            </span>
            <div className="login-card__actions">
              <button
                type="button"
                className="button button--secondary login-card__dashed"
                aria-disabled="true"
                aria-describedby={envNoteId}
              >
                SIGN IN IN BROWSER
              </button>
              <button
                type="button"
                className="button button--secondary login-card__dashed"
                aria-disabled="true"
                aria-describedby={envNoteId}
              >
                PASTE API KEY
              </button>
            </div>
          </div>
        </>
      )}

      {status !== null && !broken && !showInstall && (
        <>
          {(!signedIn || signingIn || failure?.where === 'sign_in') &&
            browserSection('SIGN IN IN BROWSER')}
          {!signedIn && keySection}

          {signedIn && !signingIn && (
            <div className="login-card__section">
              {status.method === 'api_key' && !replacing && (
                <span className="login-card__plain-note">{PLAIN_TEXT_NOTE}</span>
              )}
              <div className="login-card__actions">
                {status.method === 'env' ? (
                  <>
                    <button
                      type="button"
                      className="button button--secondary login-card__dashed"
                      aria-disabled="true"
                      aria-describedby={envNoteId}
                    >
                      SIGN OUT
                    </button>
                    <span id={envNoteId} className="login-card__hint">
                      {envKeySignOutMessage(status.envVar ?? 'the environment variable')}
                    </span>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="button button--danger"
                      disabled={busy}
                      onClick={() => void signOut(provider)}
                    >
                      {phase === 'signing_out' ? 'SIGNING OUT...' : 'SIGN OUT'}
                    </button>
                    {status.method === 'api_key' ? (
                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={busy}
                        aria-expanded={replacing}
                        onClick={() => setReplacing((value) => !value)}
                      >
                        REPLACE KEY
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={busy}
                        onClick={() => void signInInBrowser(provider)}
                      >
                        SWITCH ACCOUNT
                      </button>
                    )}
                  </>
                )}
              </div>
              {failure?.where === 'sign_out' && (
                <div role="alert" className="login-card__alert">
                  <ErrorTag />
                  <span className="login-card__message">{failure.message}</span>
                </div>
              )}
            </div>
          )}
          {signedIn && replacing && keySection}
        </>
      )}
    </section>
  )
}

export default LoginCard
