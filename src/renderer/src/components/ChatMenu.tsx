import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { BUSY_MESSAGE } from '../../../shared/chats'
import './ChatMenu.css'

export type ChatMenuAction = 'rename' | 'pin' | 'fork' | 'export' | 'delete'

type ChatMenuProps = {
  // The ⋯ button the menu opened from. Focus goes back to it.
  anchor: HTMLElement
  label: string
  pinned: boolean
  // Only Claude chats can be forked; for the others the item is not there.
  canFork: boolean
  // A run is going: forking is refused, and so is deleting the chat that is running.
  forkBlocked: boolean
  deleteBlocked: boolean
  onAct: (action: ChatMenuAction) => void
  // `returnFocus` puts focus back on the ⋯ button.
  onClose: (returnFocus: boolean) => void
}

type Item =
  | { kind: 'item'; action: ChatMenuAction; label: string; blocked: boolean; danger: boolean }
  | { kind: 'rule' }

const WIDTH = 200
const MARGIN = 8

// The item menu from designs/21c-chat-history.html: a real menu. Arrow keys, Home and End move
// between items, Enter or Space picks one, Escape closes it and focus goes back to ⋯. It is drawn
// at the end of the page, so the list's own scrolling never cuts it.
function ChatMenu({
  anchor,
  label,
  pinned,
  canFork,
  forkBlocked,
  deleteBlocked,
  onAct,
  onClose
}: ChatMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  const items: Item[] = [
    { kind: 'item', action: 'rename', label: 'RENAME', blocked: false, danger: false },
    {
      kind: 'item',
      action: 'pin',
      label: pinned ? 'UNPIN' : 'PIN TO TOP',
      blocked: false,
      danger: false
    },
    ...(canFork
      ? [
          {
            kind: 'item',
            action: 'fork',
            label: 'FORK AS NEW CHAT',
            blocked: forkBlocked,
            danger: false
          } as Item
        ]
      : []),
    { kind: 'item', action: 'export', label: 'EXPORT .MD', blocked: false, danger: false },
    { kind: 'rule' },
    { kind: 'item', action: 'delete', label: 'DELETE', blocked: deleteBlocked, danger: true }
  ]

  // Under the button, its right edge on the button's, kept inside the window; above it when there
  // is no room below.
  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const rect = anchor.getBoundingClientRect()
    const height = menu.offsetHeight
    const left = Math.max(MARGIN, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - MARGIN))
    const below = rect.bottom + 4
    const top =
      below + height > window.innerHeight - MARGIN ? Math.max(MARGIN, rect.top - 4 - height) : below
    setPlace({ left, top })
  }, [anchor])

  const buttons = (): HTMLButtonElement[] => [
    ...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
  ]

  // The first item takes focus once the menu is placed: a hidden element cannot be focused.
  const placed = place !== null
  useEffect(() => {
    if (placed) buttons()[0]?.focus()
  }, [placed])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target && (ref.current?.contains(target) || anchor.contains(target))) return
      onClose(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
    // Opened once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const all = buttons()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    let next: number
    switch (event.key) {
      case 'ArrowDown':
        next = at < 0 ? 0 : (at + 1) % all.length
        break
      case 'ArrowUp':
        next = at <= 0 ? all.length - 1 : at - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = all.length - 1
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        onClose(true)
        return
      case 'Tab':
        event.preventDefault()
        onClose(true)
        return
      default:
        return
    }
    event.preventDefault()
    all[next]?.focus()
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Options for ${label}`}
      className="chat-menu"
      style={place ?? { left: 0, top: 0, visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) =>
        item.kind === 'rule' ? (
          <span key={`rule${i}`} role="separator" className="chat-menu__rule" />
        ) : (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            className={`chat-menu__item${item.danger ? ' chat-menu__item--danger' : ''}`}
            aria-disabled={item.blocked ? 'true' : undefined}
            title={item.blocked ? BUSY_MESSAGE : undefined}
            onClick={() => {
              // A blocked item stays a button you can reach, so its reason can be read.
              if (!item.blocked) onAct(item.action)
            }}
          >
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  )
}

export default ChatMenu
