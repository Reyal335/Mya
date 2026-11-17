import type { BossPack, Fight, FightNotice } from '../../../shared/bosses'
import { BossFace, BossSprite } from './BossParts'
import './BattleNotices.css'

// A one-line battle notice in the CHAT history: the boss's idle frame in a 32px box and
// the log line. Never typed out, never in the dialogue box.
export function BattleNotice({
  pack,
  notice
}: {
  pack: BossPack
  notice: FightNotice
}): React.JSX.Element {
  return (
    <p
      className={`battle-notice battle-notice--${notice.kind}`}
      style={{ '--boss-accent': pack.accent } as React.CSSProperties}
    >
      <BossFace pack={pack} size={32} />
      <span className="battle-notice__line">{notice.line}</span>
    </p>
  )
}

// The card a finished fight leaves: defeated, or got away.
export function BossEndCard({
  pack,
  fight,
  running,
  onBattleLog,
  onFightOn
}: {
  pack: BossPack
  fight: Fight
  running: boolean
  onBattleLog: () => void
  onFightOn: () => void
}): React.JSX.Element {
  const style = { '--boss-accent': pack.accent } as React.CSSProperties
  if (fight.status === 'defeated') {
    const total = fight.lastRound?.total ?? fight.maxHp
    return (
      <article className="boss-end" style={style} aria-label={`${pack.name} defeated`}>
        <span className="boss-end__sprite">
          <BossSprite pack={pack} state="defeated" scale={1} label="" />
        </span>
        <div className="boss-end__text">
          <span className="boss-end__title boss-end__title--won">
            {pack.name.toUpperCase()} DEFEATED
          </span>
          <span className="boss-end__line">
            {fight.round} rounds · {fight.startHp} → 0 tests left · {total} / {total} passing · +
            {fight.xpAwarded} XP
          </span>
          <button type="button" className="boss-end__button" onClick={onBattleLog}>
            BATTLE LOG
          </button>
        </div>
      </article>
    )
  }
  return (
    <article className="boss-end" style={style} aria-label={`${pack.name} got away`}>
      <span className="boss-end__sprite">
        <BossSprite pack={pack} state="idle" scale={1} label="" />
      </span>
      <div className="boss-end__text">
        <span className="boss-end__title">{pack.name.toUpperCase()} GOT AWAY</span>
        <span className="boss-end__line">
          {fight.hp} / {fight.maxHp} tests left
        </span>
        <button type="button" className="boss-end__button" disabled={running} onClick={onFightOn}>
          FIGHT ON
        </button>
      </div>
    </article>
  )
}
