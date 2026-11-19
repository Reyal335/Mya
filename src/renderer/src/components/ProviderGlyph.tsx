import { PROVIDER_GLYPHS } from '../../../shared/providerGlyphs'
import type { ProviderId } from '../../../shared/models'
import './ProviderGlyph.css'

type ProviderGlyphProps = {
  provider: ProviderId
  // Whole numbers only: the glyph is pixel art. 2x is the usual size.
  scale?: number
}

// A provider's pixel glyph in one color (the text color of where it sits, --muted by default).
// Decorative: whatever it sits in carries the provider's name.
function ProviderGlyph({ provider, scale = 2 }: ProviderGlyphProps): React.JSX.Element {
  const glyph = PROVIDER_GLYPHS[provider]
  return (
    <svg
      className="provider-glyph"
      width={glyph.width * scale}
      height={glyph.height * scale}
      viewBox={`0 0 ${glyph.width} ${glyph.height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" d={glyph.path} />
    </svg>
  )
}

export default ProviderGlyph
