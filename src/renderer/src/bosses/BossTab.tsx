import { useEffect, useId, useState } from 'react'
import { fightText, type BossPack, type Fight } from '../../../shared/bosses'
import { RUNNER_NAMES } from '../../../shared/testRuns'
import BossSprite from './BossSprite'
import { HpBar, PopLayer } from './BossParts'
import type { ReplayView } from './useRoundReplay'
import { durationText, fileLabel, weakPoints } from './fightView'
import './BossTab.css'

const MAX_WEAK_POINTS = 6

type BossTabProps = {
  fight: Fight | null
  pack: BossPack | null
  view: ReplayView
  // The battle view is open: EXPAND BATTLE reads BACK TO CHAT.
  expanded: boolean
  running: boolean
  onToggleBattle: () => void
  onFightOn: () => void
  onDismiss: () => void
  onWeakPoint: (file: string) => void
}

// TEST COMMAND, saved on blur.
function TestCommand(): React.JSX.Element {
  const id = useId()
  const hint = useId()
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState('')
  useEffect(() => {
    let disposed = false
    window.mya.bosses
      .getTestCommand()
      .then((command) => {
        if (disposed) return
        setValue(command)
        setSaved(command)
      })
      .catch((err: unknown) => console.error('Could not read the test command:', err))
    return () => {
      disposed = true
    }
  }, [])
  const save = (): void => {
    if (value === saved) return
    window.mya.bosses
      .setTestCommand(value)
      .then((result) => {
        if (!result.ok) return
        setValue(result.command)
        setSaved(result.command)
      })
      .catch((err: unknown) => console.error('Could not save the test command:', err))
  }
  return (
    <div className="boss-tab__command">
      <label htmlFor={id} className="boss-tab__label">
        TEST COMMAND
      </label>
      <input
        id={id}
        className="boss-tab__input"
        type="text"
        value={value}
        spellCheck={false}
        aria-describedby={hint}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
      />
      <p id={hint} className="boss-tab__muted">
        {fightText.testCommandHint}
      </p>
    </div>
  )
}

function WeakPoints({
  fight,
  onPick
}: {
  fight: Fight
  onPick: (file: string) => void
}): React.JSX.Element | null {
  const points = weakPoints(fight)
  if (points.length === 0) return null
  const shown = points.slice(0, MAX_WEAK_POINTS)
  return (
    <div className="boss-tab__weak">
      <span className="boss-tab__weak-label">WEAK POINTS</span>
      {shown.map((point, i) => (
        <button
          key={point.file}
          type="button"
          className={`boss-tab__weak-row${i === 0 ? ' boss-tab__weak-row--first' : ''}`}
          title={`Put "Focus on ${fileLabel(point.file)}." in the message box`}
          onClick={() => onPick(point.file)}
        >
          <span className="boss-tab__weak-file">{fileLabel(point.file)}</span>
          <span className="boss-tab__weak-count">{point.count}</span>
        </button>
      ))}
      {points.length > MAX_WEAK_POINTS && (
        <span className="boss-tab__muted">+{points.length - MAX_WEAK_POINTS} more files</span>
      )}
    </div>
  )
}

// The BOSS tab of the party panel: the boss, its HP, and its weak points.
function BossTab({
  fight,
  pack,
  view,
  expanded,
  running,
  onToggleBattle,
  onFightOn,
  onDismiss,
  onWeakPoint
}: BossTabProps): React.JSX.Element {
  if (!fight || !pack) {
    return (
      <div className="boss-tab">
        <p className="boss-tab__muted">{fightText.noBoss}</p>
        <TestCommand />
      </div>
    )
  }
  const style = { '--boss-accent': pack.accent } as React.CSSProperties
  const meta = `${RUNNER_NAMES[fight.runner]} · round ${fight.round}`
  const expand = (
    <button
      type="button"
      className={`boss-tab__expand${expanded ? ' boss-tab__expand--back' : ''}`}
      onClick={onToggleBattle}
    >
      {expanded ? 'BACK TO CHAT' : 'EXPAND BATTLE'}
    </button>
  )

  const box = (
    <div className="boss-tab__box">
      <BossSprite
        pack={pack}
        scale={2}
        effect={view.effect}
        defeated={view.defeated}
        label={`${pack.name}${fight.status === 'defeated' ? ', defeated' : ''}`}
      />
      <PopLayer pops={view.pops} />
      {view.hitsBadge !== null && <span className="boss-tab__hits">{view.hitsBadge} HITS</span>}
    </div>
  )

  if (fight.status === 'defeated') {
    return (
      <div className="boss-tab" style={style}>
        {box}
        <div className="boss-tab__name">{pack.name}</div>
        <div className="boss-tab__defeated">DEFEATED</div>
        <div className="boss-tab__muted">
          {fight.round} rounds ·{' '}
          {durationText((fight.endedAt ?? fight.startedAt) - fight.startedAt)}
        </div>
        <div className="boss-tab__bottom">
          <button type="button" className="button button--secondary" onClick={onDismiss}>
            DISMISS
          </button>
          {expand}
        </div>
      </div>
    )
  }

  return (
    <div className="boss-tab" style={style}>
      {box}
      <div>
        <div className="boss-tab__name">{pack.name}</div>
        <div className="boss-tab__meta">{meta}</div>
      </div>
      {fight.status === 'escaped' ? (
        <div className="boss-tab__away">GOT AWAY · {fight.hp} left</div>
      ) : (
        <div
          className="boss-tab__hp"
          role="group"
          aria-label={`${view.hp} of ${fight.maxHp} tests left`}
        >
          <HpBar hp={view.hp} maxHp={fight.maxHp} height={12} />
          <span className="boss-tab__left" aria-hidden="true">
            <strong>{view.hp}</strong> / {fight.maxHp} tests left
          </span>
        </div>
      )}
      <WeakPoints fight={fight} onPick={onWeakPoint} />
      <div className="boss-tab__bottom">
        {fight.status === 'escaped' ? (
          <>
            <button
              type="button"
              className="boss-tab__expand"
              disabled={running}
              onClick={onFightOn}
            >
              FIGHT ON
            </button>
            <button type="button" className="button button--secondary" onClick={onToggleBattle}>
              {expanded ? 'BACK TO CHAT' : 'EXPAND BATTLE'}
            </button>
          </>
        ) : (
          expand
        )}
      </div>
    </div>
  )
}

export default BossTab
