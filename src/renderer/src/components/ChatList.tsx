import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BUSY_MESSAGE, PROVIDER_NAMES, type ChatSummary } from '../../../shared/chats'
import { timeLabel } from '../../../shared/chatTime'
import ChatMenu, { type ChatMenuAction } from './ChatMenu'
import EmptyChats from './EmptyChats'
import ProviderGlyph from './ProviderGlyph'
import './ChatList.css'

type ChatListProps = {
  chats: ChatSummary[]
  openId: string | null
  // A run is going: the other chats and the actions that would change which chat is open are
  // disabled, with the reason.
  running: boolean
  now: number
  onOpen: (id: string) => void
  onRename: (id: string, title: string) => Promise<boolean>
  onPin: (id: string, pinned: boolean) => void
  onFork: (id: string) => void
  onExport: (id: string) => void
  onDelete: (chat: ChatSummary) => void
}

// The project's chats, newest first, pinned ones on top above a 2px rule. Each row is a link that
// opens the chat and a ⋯ button that shows on hover or focus and opens the item menu.
function ChatList({
  chats,
  openId,
  running,
  now,
  onOpen,
  onRename,
  onPin,
  onFork,
  onExport,
  onDelete
}: ChatListProps): React.JSX.Element {
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const linkRefs = useRef(new Map<string, HTMLElement>())

  const lastPinned = chats.reduce((at, chat, i) => (chat.pinned ? i : at), -1)

  function closeMenu(returnFocus: boolean): void {
    const anchor = menu?.anchor
    setMenu(null)
    if (returnFocus) anchor?.focus()
  }

  function act(chat: ChatSummary, action: ChatMenuAction): void {
    switch (action) {
      case 'rename':
        closeMenu(false)
        setRenaming(chat.id)
        return
      case 'pin':
        closeMenu(true)
        onPin(chat.id, !chat.pinned)
        return
      case 'fork':
        closeMenu(true)
        onFork(chat.id)
        return
      case 'export':
        closeMenu(true)
        onExport(chat.id)
        return
      case 'delete':
        // The confirm opens over the ⋯ button, which gets focus back when it closes.
        closeMenu(true)
        onDelete(chat)
        return
    }
  }

  if (chats.length === 0) return <EmptyChats />

  return (
    <ul className="chat-list" aria-label="Chats">
      {chats.map((chat, i) => {
        const current = chat.id === openId
        const blocked = running && !current
        const provider = PROVIDER_NAMES[chat.provider]
        const editing = renaming === chat.id
        return (
          <Fragment key={chat.id}>
            <li
              className={`chat-row${current ? ' chat-row--current' : ''}${menu?.id === chat.id ? ' chat-row--menu' : ''}`}
            >
              {editing ? (
                <RenameRow
                  chat={chat}
                  onDone={(title) => {
                    setRenaming(null)
                    if (title !== null) void onRename(chat.id, title)
                    // Focus goes back to the row, wherever it moved to.
                    requestAnimationFrame(() => linkRefs.current.get(chat.id)?.focus())
                  }}
                />
              ) : (
                <>
                  <a
                    ref={(element) => {
                      if (element) linkRefs.current.set(chat.id, element)
                      else linkRefs.current.delete(chat.id)
                    }}
                    href="#chat"
                    className="chat-row__open"
                    aria-current={current ? 'true' : undefined}
                    aria-disabled={blocked ? 'true' : undefined}
                    aria-label={`${chat.title}, ${provider} chat`}
                    title={blocked ? BUSY_MESSAGE : chat.title}
                    onClick={(event) => {
                      event.preventDefault()
                      if (!blocked) onOpen(chat.id)
                    }}
                  >
                    <ProviderGlyph provider={chat.provider} />
                    {running && current && (
                      <span className="chat-row__running" role="img" aria-label="Running" />
                    )}
                    <span className="chat-row__title">{chat.title}</span>
                    <span className="chat-row__time">{timeLabel(chat.updatedAt, now)}</span>
                  </a>
                  <button
                    type="button"
                    className="chat-row__more"
                    aria-label="Chat options"
                    aria-haspopup="menu"
                    aria-expanded={menu?.id === chat.id}
                    onClick={(event) => {
                      const anchor = event.currentTarget
                      setMenu((open) => (open?.id === chat.id ? null : { id: chat.id, anchor }))
                    }}
                  >
                    ⋯
                  </button>
                </>
              )}
            </li>
            {i === lastPinned && lastPinned < chats.length - 1 && (
              <li className="chat-list__rule" role="presentation" />
            )}
          </Fragment>
        )
      })}
      {menu &&
        (() => {
          const chat = chats.find((entry) => entry.id === menu.id)
          if (!chat) return null
          return (
            <ChatMenu
              anchor={menu.anchor}
              label={chat.title}
              pinned={chat.pinned}
              canFork={chat.provider === 'claude'}
              forkBlocked={running}
              deleteBlocked={running && chat.id === openId}
              onAct={(action) => act(chat, action)}
              onClose={closeMenu}
            />
          )
        })()}
    </ul>
  )
}

type RenameRowProps = {
  chat: ChatSummary
  // The new title, or null for no change (Escape, or an empty or unchanged name).
  onDone: (title: string | null) => void
}

// The title edited where it sits. Enter saves, Escape cancels, and an empty name changes nothing.
function RenameRow({ chat, onDone }: RenameRowProps): React.JSX.Element {
  const [value, setValue] = useState(chat.title)
  const input = useRef<HTMLInputElement>(null)
  const finished = useRef(false)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  function finish(save: boolean): void {
    if (finished.current) return
    finished.current = true
    const title = value.trim()
    onDone(save && title !== '' && title !== chat.title ? title : null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      // The sidebar's own Escape handling (search, the rail's flyout) must not also run.
      event.stopPropagation()
      finish(false)
    }
  }

  return (
    <div className="chat-row__edit">
      <ProviderGlyph provider={chat.provider} />
      <input
        ref={input}
        className="chat-row__input"
        type="text"
        value={value}
        maxLength={120}
        aria-label={`Rename ${chat.title}`}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish(true)}
      />
    </div>
  )
}

export default ChatList
