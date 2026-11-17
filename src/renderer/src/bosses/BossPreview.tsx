import type { CSSProperties } from 'react'
import type { BossLoop } from '../../../shared/bosses'
import ThemeBackdrop from '../components/ThemeBackdrop'
import BossSprite, { type BossEffect } from './BossSprite'
import { HpBar, PopLayer } from './BossParts'
import type { Pop } from './useRoundReplay'
import './BossPreview.css'

// The fake fight the preview shows: 12 of 30 tests left, which is 40% of the bar.
const PREVIEW_HP = 12
const PREVIEW_MAX_HP = 30

type BossPreviewProps = {
  name: string
  accent: string
  // The picture, or null: plain navy.
  background: string | null
  // The idle loop, or null before one is uploaded.
  idle: BossLoop | null
  effect: BossEffect | null
  pops: Pop[]
}

// The boss as the battle view draws it, small: the background (or plain navy), a dim layer, the
// battle view's bottom gradient, a name plate with a bar at 40%, the floor glow in the accent,
// and the sprite at scale 2. It redraws as the editor changes, and TEST HIT plays one hit on it.
function BossPreview({
  name,
  accent,
  background,
  idle,
  effect,
  pops
}: BossPreviewProps): React.JSX.Element {
  return (
    <div
      className="boss-preview"
      style={{ '--boss-accent': accent } as CSSProperties}
      role="group"
      aria-label={`Preview of ${name.trim() || 'your boss'}`}
    >
      <ThemeBackdrop image={background} fade={0} what="boss background" />
      <span className="boss-preview__dim" aria-hidden="true" />
      <span className="boss-preview__fade" aria-hidden="true" />
      <div className="boss-preview__plate">
        <div className="boss-preview__plate-row">
          <span className="boss-preview__name">{name.trim().toUpperCase() || 'NAME'}</span>
          <span className="boss-preview__hp">
            <strong>{PREVIEW_HP}</strong> / {PREVIEW_MAX_HP}
          </span>
        </div>
        <HpBar hp={PREVIEW_HP} maxHp={PREVIEW_MAX_HP} height={12} />
      </div>
      <span className="boss-preview__glow" aria-hidden="true" />
      {idle && (
        <div className="boss-preview__sprite">
          <BossSprite
            pack={{ idle }}
            scale={2}
            effect={effect}
            label={`${name.trim() || 'Boss'} preview`}
          />
          <PopLayer pops={pops} />
        </div>
      )}
    </div>
  )
}

export default BossPreview
