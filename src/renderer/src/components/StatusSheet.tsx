import { useEffect, useState } from 'react'
import type { AgentSummary } from '../../../shared/ipc'
import { classFor, type AgentStats } from '../../../shared/progression'
import AgentIcon from './AgentIcon'
import ClassBadge from './ClassBadge'
import Dialog from './Dialog'
import './SegmentBar.css'
import './StatusSheet.css'

type StatusSheetProps = {
  agent: AgentSummary
  onClose: () => void
}

const SEGMENTS = 20

function joinedText(at: number | null): string {
  if (at === null) return 'Not yet: no quest cleared'
  return new Date(at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// An agent's status sheet: class, level, XP, skills, and record. All cosmetic: none of
// it changes what the agent may do.
function StatusSheet({ agent, onClose }: StatusSheetProps): React.JSX.Element {
  const [stats, setStats] = useState<AgentStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const agentClass = classFor(agent.tools)

  useEffect(() => {
    let disposed = false
    const load = (): void => {
      window.mya.progression
        .agentStats(agent.filePath)
        .then((result) => {
          if (disposed) return
          if (result.ok) {
            setStats(result.stats)
            setError(null)
          } else {
            setError(result.error.message)
          }
        })
        .catch((err: unknown) => console.error('Could not read the agent status:', err))
    }
    load()
    const unsubscribe = window.mya.progression.onChanged(load)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [agent.filePath])

  const scopeLine =
    agent.scope === 'project'
      ? agent.role
        ? `${agent.role} · project agent`
        : 'Project agent'
      : agent.role
        ? `${agent.role} · global agent`
        : 'Global agent'
  const capped = stats !== null && stats.toNext === 0
  const filled = stats
    ? capped
      ? SEGMENTS
      : Math.floor((stats.intoLevel / stats.toNext) * SEGMENTS)
    : 0

  return (
    <Dialog
      title="STATUS"
      onClose={onClose}
      onBackdropClick={onClose}
      actions={
        <button type="button" className="button button--secondary" onClick={onClose}>
          CLOSE
        </button>
      }
    >
      <div className="status">
        <div className="status__top">
          <AgentIcon src={agent.icon} size={80} label="" />
          <div className="status__who">
            <p className="status__name">{agent.name}</p>
            <div className="status__tags">
              <ClassBadge classId={agentClass.id} size="sheet" reason={agentClass.reason} />
              <span className="status__model">{agent.model ?? 'default'}</span>
            </div>
            <p className="status__scope">{scopeLine}</p>
          </div>
          <div className="status__level" aria-label={`Level ${stats?.level ?? 1}`}>
            <span className="status__level-label" aria-hidden="true">
              LEVEL
            </span>
            <span className="status__level-number" aria-hidden="true">
              {stats?.level ?? 1}
            </span>
          </div>
        </div>

        {error && (
          <p role="alert" className="status__error">
            {error}
          </p>
        )}

        {stats && (
          <div
            className="status__xp"
            role="group"
            aria-label={
              capped
                ? 'Highest level reached'
                : `${stats.intoLevel} of ${stats.toNext} XP, ${stats.toNext - stats.intoLevel} to level ${stats.level + 1}`
            }
          >
            <div className="segment-bar segment-bar--screen" aria-hidden="true">
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <span
                  key={i}
                  className={`segment-bar__cell segment-bar__cell--${i < filled ? 'accent' : 'empty'}`}
                />
              ))}
            </div>
            <div className="status__xp-text" aria-hidden="true">
              <span>{capped ? 'MAX' : `${stats.intoLevel} / ${stats.toNext}`}</span>
              {!capped && (
                <span className="status__muted">
                  {stats.toNext - stats.intoLevel} to LV {stats.level + 1}
                </span>
              )}
            </div>
          </div>
        )}

        <section className="status__section" aria-labelledby="status-skills">
          <h3 id="status-skills" className="status__label">
            SKILLS
          </h3>
          <ul className="status__chips">
            {agent.tools === null ? (
              <li className={`status__chip status__chip--deciding status__chip--${agentClass.id}`}>
                All tools
              </li>
            ) : agent.tools.length === 0 ? (
              <li className="status__chip">No tools</li>
            ) : (
              agent.tools.map((tool) => {
                const deciding = agentClass.deciding.includes(tool)
                return (
                  <li
                    key={tool}
                    className={`status__chip${deciding ? ` status__chip--deciding status__chip--${agentClass.id}` : ''}`}
                  >
                    {deciding && <span aria-label="Decides the class">* </span>}
                    {tool}
                  </li>
                )
              })
            )}
          </ul>
          <p className="status__muted">{agentClass.reason}</p>
        </section>

        <section className="status__section" aria-labelledby="status-record">
          <h3 id="status-record" className="status__label">
            RECORD
          </h3>
          <dl className="status__record">
            <dt>Quests cleared</dt>
            <dd>
              {stats?.questsTotal ?? 0}{' '}
              <span className="status__muted">({stats?.questsHere ?? 0} in this project)</span>
            </dd>
            <dt>Bosses defeated</dt>
            <dd>{stats?.bossesDefeated ?? 0}</dd>
            <dt>Most used skill</dt>
            <dd>
              {stats?.topSkill ? `${stats.topSkill.name} ×${stats.topSkill.count}` : 'None yet'}
            </dd>
            <dt>Joined the party</dt>
            <dd>{joinedText(stats?.joinedAt ?? null)}</dd>
          </dl>
        </section>
      </div>
    </Dialog>
  )
}

export default StatusSheet
