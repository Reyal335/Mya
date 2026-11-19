import type { AccountState } from '../../../shared/account'
import ClaudeLoginCard from '../components/ClaudeLoginCard'
import LoginCard from '../components/LoginCard'
import { useProvidersStatus } from '../hooks/useProvidersStatus'
import './LoginsScreen.css'

type LoginsScreenProps = {
  // The Claude Code login, read by ACCOUNT. LOGINS only shows it.
  claude: AccountState
}

// LOGINS from designs/22i-logins.html and 22j-logins-states.html: one card per provider. A new chat
// can only use a provider that is signed in. Claude's card is read only; Codex and Gemini can be
// installed, signed in to, and signed out of here.
function LoginsScreen({ claude }: LoginsScreenProps): React.JSX.Element {
  const { status, reading, refresh } = useProvidersStatus(true)

  return (
    <div className="logins">
      <header className="logins__head">
        <div>
          <h1 className="logins__title" tabIndex={-1}>
            LOGINS
          </h1>
          <p className="logins__subtitle">
            One sign-in per provider. A new chat can only use a provider that&apos;s signed in.
          </p>
        </div>
        <button
          type="button"
          className="button button--secondary button--small"
          disabled={reading}
          onClick={() => void refresh(true)}
        >
          {reading ? 'REFRESHING...' : 'REFRESH STATUS'}
        </button>
      </header>

      <div className="logins__cards">
        <ClaudeLoginCard account={claude} />
        <LoginCard provider="codex" status={status?.codex ?? null} />
        <LoginCard provider="gemini" status={status?.gemini ?? null} />
      </div>
    </div>
  )
}

export default LoginsScreen
