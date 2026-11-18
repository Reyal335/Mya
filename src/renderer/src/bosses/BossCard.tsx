import type { CSSProperties } from 'react'
import type { BossPack } from '../../../shared/bosses'
import ThemeBackdrop from '../components/ThemeBackdrop'
import BossSprite from './BossSprite'
import './BossCard.css'

type BossCardProps = {
  pack: BossPack
  builtIn: boolean
  inPool: boolean
  // The card whose boss is open in the editor.
  editing: boolean
  busy: boolean
  onTogglePool: () => void
  // Custom bosses only.
  onEdit?: () => void
  onDelete?: () => void
}

// A boss in the gallery: a thumbnail (its background and the idle loop), the name, whether it
// is built in or custom, the POOL toggle, and for a custom boss EDIT and DELETE.
function BossCard({
  pack,
  builtIn,
  inPool,
  editing,
  busy,
  onTogglePool,
  onEdit,
  onDelete
}: BossCardProps): React.JSX.Element {
  const classes = ['boss-card']
  if (editing) classes.push('boss-card--editing')
  if (!inPool) classes.push('boss-card--out')
  return (
    <article
      className={classes.join(' ')}
      style={{ '--boss-accent': pack.accent } as CSSProperties}
    >
      <div className="boss-card__thumb">
        <ThemeBackdrop image={pack.background} fade={0} what="boss background" />
        <span className="boss-card__thumb-fade" aria-hidden="true" />
        <span className="boss-card__thumb-sprite">
          <BossSprite pack={pack} scale={1} label={`${pack.name}, idle loop`} />
        </span>
      </div>
      <div className="boss-card__name-row">
        <span className="boss-card__swatch" aria-hidden="true" />
        <h3 className="boss-card__name">{pack.name}</h3>
        <span className="boss-card__kind">
          {builtIn ? 'Built-in' : 'Custom'}
          {editing ? ' · editing' : ''}
        </span>
      </div>
      <div className="boss-card__controls">
        <button
          type="button"
          className={`boss-card__pool${inPool ? ' boss-card__pool--on' : ''}`}
          aria-pressed={inPool}
          aria-label={`${pack.name} in the random pool`}
          disabled={busy}
          onClick={onTogglePool}
        >
          {inPool ? 'POOL: ON' : 'POOL: OFF'}
        </button>
        {!builtIn && (
          <>
            <button
              type="button"
              className="button button--small button--secondary boss-card__button"
              aria-label={`Edit ${pack.name}`}
              disabled={busy}
              onClick={onEdit}
            >
              EDIT
            </button>
            <button
              type="button"
              className="button button--small button--danger boss-card__button"
              aria-label={`Delete ${pack.name}`}
              disabled={busy}
              onClick={onDelete}
            >
              DELETE
            </button>
          </>
        )}
      </div>
    </article>
  )
}

// A folder in userData/bosses that failed a rule: why, which folder, and DELETE. Built-in
// bosses never come here.
export function BossProblemCard({
  id,
  problem,
  busy,
  onDelete
}: {
  id: string
  problem: string
  busy: boolean
  onDelete: () => void
}): React.JSX.Element {
  return (
    <article className="boss-card boss-card--problem">
      <p className="boss-card__problem">{problem}</p>
      <p className="boss-card__folder">{id}</p>
      <div className="boss-card__controls">
        <button
          type="button"
          className="button button--small button--danger boss-card__button"
          aria-label={`Delete ${id}`}
          disabled={busy}
          onClick={onDelete}
        >
          DELETE
        </button>
      </div>
    </article>
  )
}

export default BossCard
