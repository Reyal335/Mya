import type { AccountState } from '../../../shared/account'
import type { LoginStatus } from '../../../shared/loginCards'
import { PROVIDERS } from '../../../shared/providers'
import ProviderGlyph from './ProviderGlyph'
import './LoginCard.css'

type ClaudeLoginCardProps = {
  // The Claude Code login, as ACCOUNT reads it.
  account: AccountState
}

// What the card says for each answer the account can give. Only the way it is signed in is shown:
// Mya never copies or stores this login.
function read(account: AccountState): { status: LoginStatus; signedInWith: string } {
  switch (account.kind) {
    case 'signed_in':
    case 'api_key':
      return {
        status: { label: 'SIGNED IN', tone: 'running' },
        signedInWith: account.signedInWith
      }
    case 'signed_out':
      return {
        status: { label: 'SIGNED OUT', tone: 'waiting' },
        signedInWith: 'Not signed in'
      }
    case 'unreadable':
      return {
        status: { label: 'UNKNOWN', tone: 'muted' },
        signedInWith: "Couldn't check"
      }
    default:
      return {
        status: { label: 'CHECKING...', tone: 'muted' },
        signedInWith: 'Checking...'
      }
  }
}

// The Claude card on LOGINS (designs/22i-logins.html): read only. Claude has no sign-in of its own
// in Mya; it uses the Claude Code login that is already on this computer.
function ClaudeLoginCard({ account }: ClaudeLoginCardProps): React.JSX.Element {
  const { status, signedInWith } = read(account)
  return (
    <section className="login-card" aria-label="Claude login">
      <div className="login-card__head">
        <ProviderGlyph provider="claude" scale={3} />
        <h2 className="login-card__title">{PROVIDERS.claude.label}</h2>
        <span className={`login-card__status login-card__status--${status.tone}`} role="status">
          <span className="login-card__square" aria-hidden="true" />
          {status.label}
        </span>
      </div>
      <span className="login-card__summary">
        Claude chats. Approvals, usage bars and the full party.
      </span>
      <dl className="login-card__table">
        <div className="login-card__row">
          <dt>Signed in with</dt>
          <dd>{signedInWith}</dd>
        </div>
      </dl>
      <p className="login-card__text">
        Uses your Claude Code login. To sign in, run <code>claude</code> and then{' '}
        <code>/login</code> in a terminal.
      </p>
      <span className="login-card__hint">Read only. Mya never stores this login.</span>
    </section>
  )
}

export default ClaudeLoginCard
