import {
  WINDOW_NAMES,
  barView,
  meterLabel,
  meterNotes,
  usageRows,
  valueText,
  valueTone,
  type AccountData
} from '../../../shared/account'
import type { ProviderId } from '../../../shared/models'
import { PROVIDERS, can } from '../../../shared/providers'
import ProviderGlyph from './ProviderGlyph'
import SegmentBar from './SegmentBar'
import './AccountLink.css'

type AccountLinkProps = {
  data: AccountData
  now: number
  // ACCOUNT is the screen on show.
  active: boolean
  // The open chat's provider: its glyph sits beside the word ACCOUNT.
  provider: ProviderId
  // The rail shows the glyph alone, in a 44px square.
  rail?: boolean
  onOpen: () => void
}

// The way into ACCOUNT, at the bottom of the sidebar on every screen: the word ACCOUNT with the
// chat's provider glyph, then today's 5H and 7D usage as thin bars with their percent. The states
// are step 13's: a percent, near the limit, no percent yet, signed out ("Not signed in"), an API
// key ("API key"), and the notes under the bars.
function AccountLink({
  data,
  now,
  active,
  provider,
  rail = false,
  onOpen
}: AccountLinkProps): React.JSX.Element {
  const { account } = data
  // The usage bars are Claude's. A provider that reports none says so in a line, and the name says
  // it too.
  const noUsage = !can(provider, 'usage')
  const label = noUsage
    ? `Account: ${PROVIDERS[provider].name}, no usage reported`
    : meterLabel(data, now)

  let body: React.JSX.Element | null = null
  if (!rail) {
    if (noUsage) {
      body = <span className="account-link__note">No usage from {PROVIDERS[provider].name}</span>
    } else if (account.kind === 'signed_out') {
      body = <span className="account-link__text">Not signed in</span>
    } else if (account.kind === 'api_key') {
      body = <span className="account-link__text">API key</span>
    } else {
      const rows = usageRows(data.usage, now)
      body = (
        <>
          {rows.map((row) => (
            <span key={row.id} className="account-link__row">
              <span className="account-link__name">{WINDOW_NAMES[row.id].short}</span>
              <span className="account-link__bar">
                <SegmentBar view={barView(row, 10)} segments={10} size="thin" />
              </span>
              <span className={`account-link__value account-link__value--${valueTone(row)}`}>
                {valueText(row, true)}
              </span>
            </span>
          ))}
          {meterNotes(rows, now).map((note) => (
            <span key={note} className="account-link__note">
              {note}
            </span>
          ))}
        </>
      )
    }
  }

  return (
    <a
      href="#account"
      className={`account-link${rail ? ' account-link--rail' : ''}${active ? ' account-link--active' : ''}`}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      title={rail ? 'Account' : undefined}
      onClick={(event) => {
        event.preventDefault()
        onOpen()
      }}
    >
      {rail ? (
        <ProviderGlyph provider={provider} />
      ) : (
        <>
          <span className="account-link__head">
            <span className="account-link__title">ACCOUNT</span>
            <ProviderGlyph provider={provider} />
          </span>
          {body}
        </>
      )}
    </a>
  )
}

export default AccountLink
