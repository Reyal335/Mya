import type { ProviderStatus } from '../../../shared/ipc'
import { howLabel } from '../../../shared/logins'
import type { ProviderId } from '../../../shared/models'
import { PROVIDERS } from '../../../shared/providers'
import { useProvidersStatus } from '../hooks/useProvidersStatus'
import ProviderTag from './ProviderTag'
import Unavailable from './Unavailable'
import '../screens/AccountScreen.css'

type ProviderAccountProps = {
  provider: ProviderId
  onOpenLogins: () => void
}

// ACCOUNT on a Codex or Gemini chat (designs/22h-account-codex.html): that provider's account as
// LOGINS knows it (name, email, plan, how, the CLI), then a line saying usage isn't reported. Claude's
// chats show the 5-hour and 7-day bars here.
function ProviderAccount({ provider, onOpenLogins }: ProviderAccountProps): React.JSX.Element {
  const { status } = useProvidersStatus(true)
  const info = PROVIDERS[provider]
  const own: ProviderStatus | null = status && provider !== 'claude' ? status[provider] : null
  const account = own?.account ?? null

  return (
    <section className="account" aria-labelledby="account-title">
      <header className="account__head">
        <h1 id="account-title" tabIndex={-1} className="account__title">
          ACCOUNT
        </h1>
        <p className="account__subtitle">
          <ProviderTag provider={provider} /> For this chat&apos;s provider.{' '}
          <button type="button" className="account__link" onClick={onOpenLogins}>
            CHANGE ON LOGINS
          </button>
        </p>
      </header>

      <div className="account__panels">
        <section className="account__panel" aria-label="Account">
          <div className="account__panel-head">
            <h2 className="account__panel-title">ACCOUNT</h2>
          </div>
          {own === null ? (
            <p className="account__text account__text--muted">Reading the account.</p>
          ) : !own.loggedIn ? (
            <p className="account__text">
              {own.installed
                ? `Not signed in to ${info.name}, so this chat can't run.`
                : `The ${info.name} CLI isn't installed.`}{' '}
              <button type="button" className="account__link" onClick={onOpenLogins}>
                SIGN IN ON LOGINS
              </button>
            </p>
          ) : (
            <dl className="account__fields">
              {account?.name && (
                <div className="account__field">
                  <dt>NAME</dt>
                  <dd>{account.name}</dd>
                </div>
              )}
              {account?.email && (
                <div className="account__field">
                  <dt>EMAIL</dt>
                  <dd className="account__email">{account.email}</dd>
                </div>
              )}
              {account?.plan && (
                <div className="account__field">
                  <dt>PLAN</dt>
                  <dd>
                    <span className="account__plan">{account.plan.toUpperCase()}</span>
                  </dd>
                </div>
              )}
              <div className="account__field">
                <dt>SIGNED IN WITH</dt>
                <dd>{howLabel(own.method, own.envVar)}</dd>
              </div>
              <div className="account__field">
                <dt>CLI</dt>
                <dd>{own.version ?? 'Installed'}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="account__panel" aria-label="Usage">
          <div className="account__panel-head">
            <h2 className="account__panel-title">USAGE</h2>
          </div>
          <Unavailable provider={provider}>Usage isn&apos;t reported by {info.name}.</Unavailable>
          <p className="account__usage-note">Claude chats show 5-hour and 7-day bars here.</p>
        </section>
      </div>
    </section>
  )
}

export default ProviderAccount
