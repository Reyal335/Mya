import { useEffect, useRef, useState } from 'react'
import {
  ACHIEVEMENTS,
  type AchievementDef,
  type AchievementState,
  type Reward
} from '../../../shared/achievements'
import Medal from '../components/Medal'
import { accessoryById } from '../progression/accessories'
import type { Progression } from '../hooks/useProgression'
import './AchievementsScreen.css'

type AchievementsScreenProps = {
  progression: Progression
}

function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function dateText(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function rewardLabel(reward: Reward): string {
  return reward.kind === 'title' ? `Title "${reward.name}"` : reward.name
}

type CardProps = {
  def: AchievementDef
  state: AchievementState | undefined
  // Unlocked and not yet seen when the screen opened.
  fresh: boolean
  newest: boolean
  // When the screen opened, for "today".
  openedAt: number | null
}

function AchievementCard({ def, state, fresh, newest, openedAt }: CardProps): React.JSX.Element {
  const unlockedAt = state?.unlockedAt ?? null
  if (unlockedAt !== null) {
    const today = openedAt !== null && sameDay(unlockedAt, openedAt)
    const when = fresh && today ? 'NEW · today' : dateText(unlockedAt)
    return (
      <li
        className={`achievement achievement--unlocked${newest ? ' achievement--newest' : ''}`}
        aria-label={`${def.name}, unlocked ${when}`}
      >
        <Medal id={def.id} look="unlocked" />
        <div className="achievement__text">
          <span className="achievement__name">{def.name}</span>
          <span className={`achievement__date${fresh ? ' achievement__date--new' : ''}`}>
            {when}
          </span>
          <p className="achievement__description">{def.description}</p>
          <p className="achievement__reward">Reward: {rewardLabel(def.reward)}</p>
        </div>
      </li>
    )
  }
  if (def.hidden) {
    return (
      <li className="achievement achievement--hidden" aria-label="Hidden achievement">
        <Medal id={def.id} look="hidden" />
        <div className="achievement__text">
          <span className="achievement__name">???</span>
          <p className="achievement__description">Hidden. Keep playing to find it.</p>
        </div>
      </li>
    )
  }
  const goal = state?.goal ?? def.goal
  const progress = Math.min(state?.progress ?? 0, goal)
  return (
    <li className="achievement achievement--locked" aria-label={`${def.name}, locked`}>
      <Medal id={def.id} look="locked" />
      <div className="achievement__text">
        <span className="achievement__name">{def.name}</span>
        <p className="achievement__description">{def.description}</p>
        <p className="achievement__reward achievement__reward--locked">
          Reward: {rewardLabel(def.reward)}
        </p>
        <div className="achievement__progress" role="group" aria-label={`${progress} of ${goal}`}>
          <span className="achievement__count" aria-hidden="true">
            {progress} / {goal}
          </span>
          <span className="achievement__bar" aria-hidden="true">
            <span
              className="achievement__bar-fill"
              style={{ width: `${goal > 0 ? (progress / goal) * 100 : 0}%` }}
            />
          </span>
        </div>
      </div>
    </li>
  )
}

// The ACHIEVEMENTS screen: every achievement as a medal card, and the unlocked titles
// and accessories with ON/OFF. Opening it marks every unlock seen.
function AchievementsScreen({ progression }: AchievementsScreenProps): React.JSX.Element {
  const { data, equipped, equip, markSeen } = progression
  // What was unseen when the screen opened, and when that was: those keep "NEW · today"
  // and the newest keeps its outer ring while the screen stays open.
  const [opened, setOpened] = useState<{ fresh: Set<string>; at: number } | null>(null)
  const marked = useRef(false)

  useEffect(() => {
    if (!data || marked.current) return
    marked.current = true
    const snapshot = {
      fresh: new Set(
        data.achievements
          .filter((entry) => entry.unlockedAt !== null && !entry.seen)
          .map((entry) => entry.id as string)
      ),
      at: Date.now()
    }
    void markSeen().then(() => setOpened(snapshot))
  }, [data, markSeen])
  const fresh = opened?.fresh ?? null

  const states = new Map((data?.achievements ?? []).map((entry) => [entry.id, entry]))
  const unlocked = ACHIEVEMENTS.filter((def) => (states.get(def.id)?.unlockedAt ?? null) !== null)
  const newestId =
    [...(fresh ?? [])]
      .map((id) => states.get(id as AchievementDef['id']))
      .filter((entry): entry is AchievementState => entry !== undefined)
      .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))[0]?.id ?? null
  const rewards = unlocked.map((def) => def.reward)

  return (
    <section className="achievements" aria-labelledby="achievements-title">
      <header className="achievements__head">
        <h1 id="achievements-title" className="achievements__title">
          ACHIEVEMENTS
        </h1>
        <span className="achievements__count">
          {unlocked.length} of {ACHIEVEMENTS.length} unlocked
        </span>
        <span className="achievements__segments" aria-hidden="true">
          {ACHIEVEMENTS.map((def, i) => (
            <span
              key={def.id}
              className={`achievements__segment${i < unlocked.length ? ' achievements__segment--on' : ''}`}
            />
          ))}
        </span>
      </header>

      <div className="achievements__body">
        <ul className="achievements__grid" aria-label="Achievements">
          {ACHIEVEMENTS.map((def) => (
            <AchievementCard
              key={def.id}
              def={def}
              state={states.get(def.id)}
              fresh={fresh?.has(def.id) ?? false}
              newest={def.id === newestId}
              openedAt={opened?.at ?? null}
            />
          ))}
        </ul>

        <aside className="achievements__rewards" aria-labelledby="achievements-rewards">
          <h2 id="achievements-rewards" className="achievements__label">
            UNLOCKED REWARDS
          </h2>
          {rewards.length === 0 ? (
            <p className="achievements__muted">Nothing yet. Unlock an achievement to get one.</p>
          ) : (
            <ul className="achievements__reward-list">
              {rewards.map((reward) => {
                const on =
                  reward.kind === 'title'
                    ? equipped.title === reward.id
                    : equipped.accessory === reward.id
                const picture = reward.kind === 'accessory' ? accessoryById(reward.id) : null
                return (
                  <li key={`${reward.kind}:${reward.id}`} className="achievements__reward-row">
                    {picture ? (
                      <img
                        className="achievements__reward-picture"
                        src={picture.src}
                        alt=""
                        width={32}
                        height={32}
                      />
                    ) : (
                      <span className="achievements__reward-picture achievements__reward-title">
                        T
                      </span>
                    )}
                    <span className="achievements__reward-text">
                      <span className="achievements__reward-name">{reward.name}</span>
                      <span className="achievements__muted">
                        {reward.kind === 'title' ? 'Title' : 'Accessory'}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="button button--small"
                      aria-pressed={on}
                      aria-label={`${reward.name}: ${on ? 'on' : 'off'}`}
                      onClick={() => void equip(reward.kind, on ? null : reward.id)}
                    >
                      {on ? 'ON' : 'OFF'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="achievements__muted">
            Accessories are drawn over any mascot, so they work with custom ones too.
          </p>
        </aside>
      </div>
    </section>
  )
}

export default AchievementsScreen
