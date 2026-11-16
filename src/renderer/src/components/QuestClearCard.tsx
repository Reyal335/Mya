import type { TaskAgent } from '../../../shared/ipc'
import { CLASS_RULES, type TaskLoot, type TaskXp } from '../../../shared/progression'
import AgentIcon from './AgentIcon'
import ClassBadge from './ClassBadge'
import XpBar from './XpBar'
import './QuestClearCard.css'

type QuestClearCardProps = {
  agent: TaskAgent
  description: string
  loot: TaskLoot
  xp: TaskXp
  // VIEW CHANGES: the INBOX detail on ACTIVITY.
  onViewChanges: () => void
  // OPEN IN INBOX. Left out in INBOX itself.
  onOpenInInbox?: () => void
}

const MAX_ROWS = 8

// A 16px pixel file icon: yellow with a plus for a NEW file, muted otherwise.
function FileIcon({ isNew }: { isNew: boolean }): React.JSX.Element {
  return (
    <svg
      className={`quest__file${isNew ? ' quest__file--new' : ''}`}
      width="16"
      height="16"
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path className="quest__file-page" d="M1 0h4v1h1v1h1v6H1z" />
      <path className="quest__file-fold" d="M5 0h1v1h1v1H5z" />
      {isNew && <path className="quest__file-plus" d="M3 3h1v1h1v1H4v1H3V5H2V4h1z" />}
    </svg>
  )
}

function itemsText(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

// The QUEST CLEAR card: an agent's task that ended as done, with what it changed as
// "items obtained" and the XP it earned. Built from the saved task, so it looks the
// same after a restart.
function QuestClearCard({
  agent,
  description,
  loot,
  xp,
  onViewChanges,
  onOpenInInbox
}: QuestClearCardProps): React.JSX.Element {
  const leveledUp = xp.after.level > xp.before.level
  const label = description ? `${agent.name} · ${description}` : agent.name
  const shown = loot.items.slice(0, MAX_ROWS)
  const foundShown = loot.found.slice(0, MAX_ROWS)
  const breakdown = xp.lines.map((line) => `${line.label} +${line.xp}`).join(' · ')
  // The bar shows the level the agent was in. A level up fills it to the end.
  const { before } = xp
  const gained = leveledUp ? before.toNext - before.intoLevel : xp.total
  const capped = before.toNext === 0

  return (
    <article className="quest" aria-label={`Quest clear: ${label}`}>
      <header className="quest__head">
        <AgentIcon src={agent.icon} size={40} label="" />
        <div className="quest__heading">
          <p className="quest__title">QUEST CLEAR!</p>
          <p className="quest__who">{label}</p>
        </div>
        {/* The class the agent had when the quest ended; its tools then are not kept. */}
        <ClassBadge classId={xp.classId} reason={CLASS_RULES[xp.classId]} />
      </header>

      {loot.items.length > 0 && (
        <section className="quest__section" aria-label="Items obtained">
          <div className="quest__section-head">
            <span className="quest__label">ITEMS OBTAINED</span>
            <span className="quest__totals">
              {itemsText(loot.items.length)} · <span className="quest__add">+{loot.added}</span>{' '}
              <span className="quest__remove">−{loot.removed}</span>
            </span>
          </div>
          <ul className="quest__list">
            {shown.map((item) => (
              <li key={item.path} className="quest__row">
                <FileIcon isNew={item.isNew} />
                <span className="quest__path" title={item.path}>
                  {item.path}
                </span>
                {item.isNew && <span className="quest__new">NEW</span>}
                <span className="quest__counts">
                  <span className="quest__add">+{item.added}</span>
                  <span className="quest__remove">−{item.removed}</span>
                </span>
              </li>
            ))}
            {loot.items.length > MAX_ROWS && (
              <li className="quest__more">+{loot.items.length - MAX_ROWS} more</li>
            )}
          </ul>
        </section>
      )}

      {loot.items.length === 0 && loot.found.length > 0 && (
        <section className="quest__section" aria-label="Found">
          <div className="quest__section-head">
            <span className="quest__label">FOUND</span>
            <span className="quest__totals">
              {loot.foundCount} {loot.foundCount === 1 ? 'file' : 'files'} read
            </span>
          </div>
          <ul className="quest__list quest__list--found">
            {foundShown.map((path) => (
              <li key={path} className="quest__row">
                <FileIcon isNew={false} />
                <span className="quest__path" title={path}>
                  {path}
                </span>
              </li>
            ))}
            {loot.foundCount > MAX_ROWS && (
              <li className="quest__more">+{loot.foundCount - MAX_ROWS} more</li>
            )}
          </ul>
        </section>
      )}

      <section className="quest__xp" aria-label="Experience">
        <p className="quest__xp-line">
          <span className="quest__xp-total">+{xp.total} XP</span>
          <span className="quest__breakdown">{breakdown}</span>
        </p>
        <div
          className="quest__level"
          role="group"
          aria-label={
            capped
              ? `Level ${before.level}, the highest level`
              : `Level ${before.level}: ${Math.min(before.toNext, before.intoLevel + gained)} of ${before.toNext} XP`
          }
        >
          <span className="quest__lv">LV {before.level}</span>
          <XpBar
            intoLevel={capped ? 1 : before.intoLevel}
            toNext={capped ? 1 : before.toNext}
            gained={capped ? 0 : gained}
            size="card"
          />
          {!capped && <span className="quest__lv">LV {before.level + 1}</span>}
        </div>
        {leveledUp && (
          <p className="quest__banner" role="status">
            LEVEL UP! {agent.name.toUpperCase()} IS LV {xp.after.level}
          </p>
        )}
      </section>

      <div className="quest__actions">
        <button
          type="button"
          className="button button--small button--secondary"
          onClick={onViewChanges}
        >
          VIEW CHANGES
        </button>
        {onOpenInInbox && (
          <button
            type="button"
            className="button button--small button--secondary"
            onClick={onOpenInInbox}
          >
            OPEN IN INBOX
          </button>
        )}
      </div>
    </article>
  )
}

export default QuestClearCard
