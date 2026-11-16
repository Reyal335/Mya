import './NavItem.css'

type NavItemProps = {
  label: string
  active: boolean
  onClick: () => void
  count?: number
  // A red dot: something new to see here.
  dot?: boolean
  // What the dot means, for screen readers.
  dotLabel?: string
}

function NavItem({
  label,
  active,
  onClick,
  count,
  dot = false,
  dotLabel
}: NavItemProps): React.JSX.Element {
  const showCount = count !== undefined && count > 0

  return (
    <button
      type="button"
      className={active ? 'nav-item nav-item--active' : 'nav-item'}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span>{label}</span>
      {showCount && (
        <span className="nav-item__count" aria-label={`${count} unread`}>
          {count}
        </span>
      )}
      {dot && <span className="nav-item__dot" role="img" aria-label={dotLabel ?? 'New'} />}
    </button>
  )
}

export default NavItem
