import { useEffect, useState, type CSSProperties } from 'react'
import type { BossPack } from '../../../shared/bosses'
import Mascot from '../components/Mascot'
import './BossSprite.css'

// A hit or a heal to play on the sprite. A new id plays it again, also while one is playing.
export type BossEffect = { kind: 'hit' | 'heal'; id: number }

export const HIT_FLASH_MS = 120
export const HEAL_TINT_MS = 160

type BossSpriteProps = {
  pack: Pick<BossPack, 'idle'>
  // Whole-number scale (the boss is drawn at 64 * scale pixels square); 0.5 draws 32px.
  scale: number
  label: string
  // The hit or heal to play now.
  effect?: BossEffect | null
  // The defeat: over 800ms, in 4 hard steps, the boss sinks 4 source pixels, turns gray, and
  // fades to 35%; then it holds that look with the loop stopped on frame 0. A boss that is
  // defeated when it first appears (a card, a view opened later) shows that look at once.
  defeated?: boolean
  // Holds the white hit look (the editor's HIT frame): no timer, and it stays under reduced
  // motion because it is a picture, not an animation.
  hold?: 'hit'
  // Stops the loop on frame 0 (the editor's IDLE and HIT frames).
  still?: boolean
}

// Every boss is drawn by this one component: the idle loop through Mascot, and the same three
// effects for every boss, built-in or custom. The effects are CSS on the wrapper (a white
// silhouette from a filter, a green tint, a sink with a grayscale and an opacity), so the
// frame stays hard-edged and no art is needed for them. Moves are layout offsets, not
// transforms: a transform can blur one device pixel at fractional display scaling.
function BossSprite({
  pack,
  scale,
  label,
  effect = null,
  defeated = false,
  hold,
  still = false
}: BossSpriteProps): React.JSX.Element {
  const { idle } = pack
  const [shown, setShown] = useState<BossEffect | null>(null)
  const [seen, setSeen] = useState(effect?.id ?? 0)
  // An effect already there when the sprite appears is not played.
  const [settled] = useState(defeated)

  // A new effect starts (or restarts) the flash. Set while rendering, so the first frame of the
  // flash is the new one.
  const id = effect?.id ?? 0
  if (id !== seen) {
    setSeen(id)
    setShown(effect)
  }
  useEffect(() => {
    if (!shown) return
    const timer = window.setTimeout(
      () => setShown(null),
      shown.kind === 'hit' ? HIT_FLASH_MS : HEAL_TINT_MS
    )
    return () => window.clearTimeout(timer)
  }, [shown])

  const px = scale === 0.5 ? 0.5 : Math.max(1, Math.round(scale))
  const classes = ['boss-sprite']
  if (hold === 'hit') classes.push('boss-sprite--held-hit')
  else if (defeated) classes.push(settled ? 'boss-sprite--defeated-held' : 'boss-sprite--defeated')
  else if (shown) classes.push(`boss-sprite--${shown.kind}`)

  return (
    <span
      className={classes.join(' ')}
      style={{ '--boss-px': `${px}px`, width: 64 * px, height: 64 * px } as CSSProperties}
    >
      <Mascot
        src={idle.src}
        frames={idle.frames}
        // A defeated or still boss stops on frame 0.
        fps={defeated || still ? 0 : idle.fps}
        scale={scale}
        label={label}
      />
    </span>
  )
}

export default BossSprite
