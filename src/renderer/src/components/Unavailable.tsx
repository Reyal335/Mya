import { useId } from 'react'
import type { ProviderId } from '../../../shared/models'
import ProviderTag from './ProviderTag'
import './Unavailable.css'

type UnavailableProps = {
  provider: ProviderId
  // The one sentence that says why, such as "Usage isn't reported by Codex."
  children: React.ReactNode
  // A thing that sits where a button would, so it can be reached by keyboard and read.
  className?: string
}

// For a feature this provider lacks, in a place you would look for it: a panel-fill box with a 2px
// dashed line border, the provider tag, and one muted sentence. Never red: nothing is broken. It
// keeps aria-disabled and can still take focus, so the reason is read out.
function Unavailable({ provider, children, className }: UnavailableProps): React.JSX.Element {
  const id = useId()
  return (
    <div
      className={`unavailable${className ? ` ${className}` : ''}`}
      tabIndex={0}
      aria-disabled="true"
      aria-describedby={id}
    >
      <ProviderTag provider={provider} />
      <span id={id} className="unavailable__text">
        {children}
      </span>
    </div>
  )
}

export default Unavailable
