import PixelIcon, { type PixelIconName } from './PixelIcon'
import './NavItem.css'

type NavItemProps = {
  label: string
  icon: PixelIconName
  active: boolean
  onClick: () => void
  // The icon's color when it is not the current row: the trophy is --waiting.
  tone?: 'muted' | 'waiting'
  count?: number
  // A red dot: something new to see here.
  dot?: boolean
  // What the dot means, for screen readers.
  dotLabel?: string
  // 8px, or 6px (CHAT's fight dot).
  dotSize?: 'normal' | 'small'
  // The rail: a 44px square with the icon alone. The label is its name and its tooltip.
  rail?: boolean
  // What a screen reader says in the rail, such as "Inbox, 2 waiting".
  railName?: string
}

// One of the five screens in the sidebar. A link, not a button: it goes somewhere.
function NavItem({
  label,
  icon,
  active,
  onClick,
  tone = 'muted',
  count,
  dot = false,
  dotLabel,
  dotSize = 'normal',
  rail = false,
  railName
}: NavItemProps): React.JSX.Element {
  const showCount = count !== undefined && count > 0
  const classes = [
    'nav-item',
    active ? 'nav-item--active' : '',
    tone === 'waiting' ? 'nav-item--waiting' : '',
    rail ? 'nav-item--rail' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <a
      href={`#${label.toLowerCase()}`}
      className={classes}
      aria-current={active ? 'page' : undefined}
      aria-label={rail ? (railName ?? label) : undefined}
      title={rail ? label : undefined}
      onClick={(event) => {
        event.preventDefault()
        onClick()
      }}
    >
      <PixelIcon name={icon} size={rail ? 20 : 16} className="nav-item__icon" />
      {!rail && <span className="nav-item__label">{label}</span>}
      {showCount && (
        <span
          className="nav-item__count"
          aria-label={rail ? undefined : `${count} unread`}
          aria-hidden={rail ? 'true' : undefined}
        >
          {count}
        </span>
      )}
      {dot && (
        <span
          className={`nav-item__dot${dotSize === 'small' ? ' nav-item__dot--small' : ''}`}
          role="img"
          aria-label={dotLabel ?? 'New'}
        />
      )}
    </a>
  )
}

export default NavItem
