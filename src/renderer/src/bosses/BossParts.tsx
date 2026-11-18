import type { BossPack } from '../../../shared/bosses'
import BossSprite from './BossSprite'
import type { Pop } from './useRoundReplay'
import './BossParts.css'

// The boss's idle frame as a still picture in a small box (notices, the rail).
export function BossFace({ pack, size }: { pack: BossPack; size: 32 | 64 }): React.JSX.Element {
  return (
    <span className={`boss-face boss-face--${size}`} aria-hidden="true">
      <BossSprite pack={pack} scale={size === 32 ? 0.5 : 1} label="" />
    </span>
  )
}

// The HP bar: what is left in --error, the part just lost in --waiting draining away.
export function HpBar({
  hp,
  maxHp,
  height
}: {
  hp: number
  maxHp: number
  height: 4 | 12 | 14
}): React.JSX.Element {
  const width = `${maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0}%`
  return (
    <span className={`hp-bar hp-bar--${height}`} aria-hidden="true">
      <span className="hp-bar__lost" style={{ width }} />
      <span className="hp-bar__left" style={{ width }} />
    </span>
  )
}

// "−1" and "+1" rising from spots around the sprite.
export function PopLayer({ pops }: { pops: Pop[] }): React.JSX.Element {
  return (
    <span className="boss-pops" aria-hidden="true">
      {pops.map((pop) => (
        <span
          key={pop.id}
          className={`boss-pop boss-pop--${pop.text === '+1' ? 'heal' : 'hit'}`}
          style={{ left: `${pop.x}%`, top: `${pop.y}%` }}
        >
          {pop.text}
        </span>
      ))}
    </span>
  )
}
