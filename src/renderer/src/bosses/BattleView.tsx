import { useEffect, useRef, useState } from 'react'
import type { AgentSummary } from '../../../shared/ipc'
import { MAIN_MEMBER, type BossPack, type Fight, type FightTest } from '../../../shared/bosses'
import { RUNNER_NAMES } from '../../../shared/testRuns'
import AgentIcon from '../components/AgentIcon'
import Mascot from '../components/Mascot'
import { loopFor, type Mascot as MascotData } from '../mascots/types'
import ThemeBackdrop from '../components/ThemeBackdrop'
import BossSprite from './BossSprite'
import { HpBar, PopLayer } from './BossParts'
import type { ReplayView } from './useRoundReplay'
import './BattleView.css'

const MAX_HIT_ROWS = 8
const MAX_STILL_ROWS = 3
// The lineup's height (60px) and its 12px from the bottom, plus an 8px gap.
const LINEUP_ROOM = 80
// The frame's content width at or under which the plate moves (the CSS container query).
const NARROW_FRAME = 640

type BattleViewProps = {
  fight: Fight
  pack: BossPack
  view: ReplayView
  mascot: MascotData
  speaker: string
  agents: AgentSummary[]
  running: boolean
  // A finished fight opened from its end card: no FIGHT ON.
  readOnly: boolean
  onBack: () => void
  onFightOn: () => void
}

function testName(test: FightTest): string {
  return test.name ?? 'a test'
}

function shortFile(file: string | null): string {
  if (!file) return 'tests'
  const parts = file.split('/')
  return parts[parts.length - 1] || file
}

// The latest round, in words: the attacker, the hits and the combo, the heals, and what
// still fails.
function TestLog({
  fight,
  pack,
  mascot,
  speaker
}: {
  fight: Fight
  pack: BossPack
  mascot: MascotData
  speaker: string
}): React.JSX.Element {
  const round = fight.lastRound
  const loop = loopFor(mascot, 'idle')
  const attacker = round
    ? round.attacker === MAIN_MEMBER
      ? speaker
      : (fight.lineup.find((m) => m.id === round.attacker)?.name ?? speaker)
    : speaker
  const named = round?.hits.filter((hit) => hit.name !== null) ?? []
  const unnamed = (round?.hits.length ?? 0) - named.length
  const heals = round?.heals ?? []
  const still = round?.stillFailing ?? []
  return (
    <section className="battle__log" aria-label="Test log">
      <div className="battle__log-head">
        <span className="battle__log-mascot">
          <Mascot
            src={loop.src}
            frames={loop.frames}
            fps={loop.fps}
            reverse={loop.reverse}
            scale={0.5}
            label=""
          />
        </span>
        <span className="battle__log-title">TEST LOG</span>
        <span className="battle__log-meta">
          {RUNNER_NAMES[fight.runner]} · round {fight.round}
        </span>
      </div>
      {round && (
        <div className="battle__log-body">
          {round.kind === 'encounter' ? (
            <p className="battle__strike">{fight.notices[0]?.line ?? ''}</p>
          ) : (
            <p className="battle__strike">▶ {attacker} strikes!</p>
          )}
          {named.slice(0, MAX_HIT_ROWS).map((hit, i) => (
            <p key={`h${i}`} className="battle__row">
              <span className="battle__pass">✓</span>
              <span className="battle__test">{testName(hit)}</span>
              <span className="battle__minus">−1</span>
            </p>
          ))}
          {named.length > MAX_HIT_ROWS && (
            <p className="battle__muted">+{named.length - MAX_HIT_ROWS} more</p>
          )}
          {unnamed > 0 && <p className="battle__row">{unnamed} tests now pass</p>}
          {round.hits.length > 0 && (
            <p className="battle__combo">
              <strong>{round.hits.length} hit combo!</strong>
              {round.clearedFiles.map((file) => ` ${shortFile(file)} cleared.`).join('')}
            </p>
          )}
          {heals.map((heal, i) => (
            <p key={`x${i}`} className="battle__row">
              <span className="battle__fail">✕</span>
              <span className="battle__test">{testName(heal)}</span>
              <span className="battle__fail">+1</span>
            </p>
          ))}
          {heals.length > 0 && (
            <p className="battle__row">
              {pack.name} healed {heals.length}!
              {round.brokenFiles[0] ? ` ${shortFile(round.brokenFiles[0])} broke.` : ''}
            </p>
          )}
          {round.kind === 'partial' && (
            <p className="battle__muted">{fight.log[fight.log.length - 1]}</p>
          )}
          {round.kind !== 'encounter' &&
            round.kind !== 'partial' &&
            round.hits.length === 0 &&
            heals.length === 0 &&
            round.kind !== 'victory' && (
              <p className="battle__muted">No change. {fight.hp} tests still failing.</p>
            )}
          {still.slice(0, MAX_STILL_ROWS).map((test, i) => (
            <p key={`s${i}`} className="battle__row battle__row--muted">
              <span className="battle__fail">✕</span>
              <span className="battle__test">
                {shortFile(test.file)} · {testName(test)}
              </span>
            </p>
          ))}
          {round.stillFailingCount > MAX_STILL_ROWS && (
            <p className="battle__muted">
              +{round.stillFailingCount - MAX_STILL_ROWS} more still failing
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function Lineup({
  fight,
  agents,
  mascot,
  speaker
}: {
  fight: Fight
  agents: AgentSummary[]
  mascot: MascotData
  speaker: string
}): React.JSX.Element {
  const idle = loopFor(mascot, 'idle')
  return (
    <ol className="battle__lineup" aria-label="Lineup">
      {fight.lineup.map((member) => {
        const agent = agents.find((a) => a.filePath === member.id)
        const name = member.id === MAIN_MEMBER ? speaker : (agent?.name ?? member.name)
        const active = member.id === fight.active
        return (
          <li
            key={member.id}
            className={`battle__member${active ? ' battle__member--active' : ''}`}
            aria-current={active ? 'true' : undefined}
          >
            <span className="battle__member-icon">
              {member.id === MAIN_MEMBER ? (
                <Mascot src={idle.src} frames={idle.frames} fps={idle.fps} scale={0.5} label="" />
              ) : (
                <AgentIcon src={agent?.icon ?? null} size={32} label="" />
              )}
            </span>
            <span className="battle__member-text">
              <span className="battle__member-name">{name}</span>
              <span
                className="battle__bar battle__bar--health"
                role="img"
                aria-label={`Health ${member.health} percent`}
              >
                <span style={{ width: `${member.health}%` }} />
              </span>
              <span
                className={`battle__bar battle__bar--energy${member.energy >= 10 ? ' battle__bar--full' : ''}`}
                role="img"
                aria-label={`Energy ${member.energy} of 10`}
              >
                <span style={{ width: `${member.energy * 10}%` }} />
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// The battle view from "20b/20c/20d", in place of the CHAT stage frame.
function BattleView({
  fight,
  pack,
  view,
  mascot,
  speaker,
  agents,
  running,
  readOnly,
  onBack,
  onFightOn
}: BattleViewProps): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(4)

  // The boss at scale 4, or 3 when the space right of the log is under 300px wide or the
  // frame is under 420px tall. On a frame too short for 192px above the lineup (the
  // smallest windows), scale 2, so nothing overlaps. Measured whenever the frame resizes.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = (): void => {
      const { width, height } = frame.getBoundingClientRect()
      const log = Math.min(320, width * 0.4)
      const space = width - 12 - log - 12
      // From the boss's top down to the lineup's top, with an 8px gap. A narrow frame
      // puts the HP plate under BACK TO CHAT and the boss 30px lower (see the CSS).
      const narrow = width - 8 <= NARROW_FRAME
      const room = height - (narrow ? 108 : 78) - LINEUP_ROOM
      let next = space < 300 || height < 420 ? 3 : 4
      while (next > 2 && 64 * next > room) next -= 1
      setScale(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const defeated = fight.status === 'defeated'
  const escaped = fight.status === 'escaped'
  const total = fight.lastRound?.total ?? fight.maxHp
  const size = 64 * scale
  const style = { '--boss-accent': pack.accent, '--boss-size': `${size}px` } as React.CSSProperties

  return (
    <div
      ref={frameRef}
      className="battle"
      style={style}
      aria-label={`Battle with ${pack.name}`}
      role="region"
    >
      {/* The pack's background by the chat theme's scaling rule (small pixel art stays crisp, a
          big picture is scaled smoothly), bottom-anchored and cropped to the frame, with no theme
          fade; without one it is plain navy. */}
      <ThemeBackdrop image={pack.background} fade={0} what="boss background" />
      <span className="battle__fade" aria-hidden="true" />

      <TestLog fight={fight} pack={pack} mascot={mascot} speaker={speaker} />

      <div className="battle__plate">
        <div className="battle__plate-row">
          <span className="battle__boss-name">{pack.name}</span>
          <span className="battle__muted">
            {RUNNER_NAMES[fight.runner]} · round {fight.round}
          </span>
          <span className="battle__plate-hp">
            <strong>{view.hp}</strong> / {fight.maxHp}
          </span>
        </div>
        <span role="group" aria-label={`${view.hp} of ${fight.maxHp} tests left`}>
          <HpBar hp={view.hp} maxHp={fight.maxHp} height={14} />
        </span>
      </div>

      <button type="button" className="battle__back" onClick={onBack}>
        BACK TO CHAT
      </button>

      <div className="battle__stage">
        <span className="battle__glow" aria-hidden="true" />
        <div className="battle__sprite">
          <BossSprite
            pack={pack}
            scale={scale}
            effect={view.effect}
            defeated={view.defeated}
            label={`${pack.name}${defeated ? ', defeated' : ''}`}
          />
          <PopLayer pops={view.pops} />
          {view.combo !== null && (
            <span className="battle__combo-text" role="status">
              {view.combo} HIT COMBO!
            </span>
          )}
        </div>
        {defeated && view.defeated && (
          <div className="battle__banner" role="status">
            <span className="battle__banner-title">{pack.name.toUpperCase()} IS DEFEATED!</span>
            <span className="battle__banner-text">
              {total} / {total} passing · +{fight.xpAwarded} XP
            </span>
          </div>
        )}
        {escaped && (
          <div className="battle__banner battle__banner--away" role="status">
            <span className="battle__banner-title">{pack.name.toUpperCase()} GOT AWAY.</span>
            <span className="battle__banner-text">{fight.hp} tests still failing.</span>
            {!readOnly && (
              <button
                type="button"
                className="battle__fight-on"
                disabled={running}
                onClick={onFightOn}
              >
                FIGHT ON
              </button>
            )}
          </div>
        )}
      </div>

      <Lineup fight={fight} agents={agents} mascot={mascot} speaker={speaker} />
    </div>
  )
}

export default BattleView
