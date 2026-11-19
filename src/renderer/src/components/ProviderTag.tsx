import { PROVIDERS } from '../../../shared/providers'
import type { ProviderId } from '../../../shared/models'
import ProviderGlyph from './ProviderGlyph'
import './ProviderTag.css'

type ProviderTagProps = {
  provider: ProviderId
}

// A provider's glyph and its name in capitals, muted, in a 2px line border, 20px tall. Not a button.
// No provider has a color of its own: a provider is a text label plus its glyph.
function ProviderTag({ provider }: ProviderTagProps): React.JSX.Element {
  return (
    <span className="provider-tag">
      <ProviderGlyph provider={provider} />
      {PROVIDERS[provider].label}
    </span>
  )
}

export default ProviderTag
