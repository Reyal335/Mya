import type { ProviderId } from '../../../shared/models'
import { noApprovalsLine } from '../../../shared/providers'
import './StartNotice.css'

// The first line of a Codex or Gemini chat's history: a waiting square, NO APPROVALS, and what it
// means. It is drawn from the chat's provider, so it is there after a restart too, whether or not
// the chat's earlier messages can be shown. It stays in the history. role="note": read once, in
// order with the history.
function StartNotice({ provider }: { provider: ProviderId }): React.JSX.Element {
  return (
    <p className="start-notice" role="note">
      <span className="start-notice__tag">
        <span className="start-notice__square" aria-hidden="true" />
        NO APPROVALS
      </span>
      <span className="start-notice__text">{noApprovalsLine(provider)}</span>
    </p>
  )
}

export default StartNotice
