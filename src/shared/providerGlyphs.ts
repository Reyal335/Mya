import type { ProviderId } from './models.ts'

// One pixel glyph per provider, drawn on a small grid and filled with a single color. They are
// our own shapes: a diamond, a prompt, and twin pillars. Never a provider's logo.

export type GlyphShape = { width: number; height: number; path: string }

export const PROVIDER_GLYPHS: Record<ProviderId, GlyphShape> = {
  // A diamond on a 7x7 grid.
  claude: {
    width: 7,
    height: 7,
    path: 'M3 0h1v1H3zM2 1h3v1H2zM1 2h5v1H1zM0 3h7v1H0zM1 4h5v1H1zM2 5h3v1H2zM3 6h1v1H3z'
  },
  // A prompt on an 8x7 grid.
  codex: {
    width: 8,
    height: 7,
    path: 'M0 0h1v1H0zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM2 4h1v1H2zM1 5h1v1H1zM0 6h1v1H0zM4 6h4v1H4z'
  },
  // Twin pillars on a 7x7 grid.
  gemini: {
    width: 7,
    height: 7,
    path: 'M0 0h7v1H0zM1 1h2v5H1zM4 1h2v5H4zM0 6h7v1H0z'
  }
}
