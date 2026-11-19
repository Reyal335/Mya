import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { AccountData } from '../../../shared/account'
import { BUSY_MESSAGE, PROVIDER_NAMES, type ChatSummary } from '../../../shared/chats'
import type { ProjectInfo } from '../../../shared/ipc'
import type { ProviderId } from '../../../shared/models'
import type { ChatsStore } from '../hooks/useChats'
import { useNow } from '../hooks/useNow'
import type { SidebarMode } from '../hooks/useSidebarMode'
import type { Screen } from '../screens/types'
import AccountLink from './AccountLink'
import ChatList from './ChatList'
import ChatSearch from './ChatSearch'
import Dialog from './Dialog'
import NavItem from './NavItem'
import PixelIcon, { type PixelIconName } from './PixelIcon'
import './Sidebar.css'

type SidebarProps = {
  mode: SidebarMode
  screen: Screen
  onNavigate: (screen: Screen) => void
  project: ProjectInfo | null
  // A run is going: NEW CHAT, the other chats, and CHANGE are disabled, with the reason.
  running: boolean
  onOpenProject: () => void
  chats: ChatsStore
  // The open chat's provider: its glyph sits in the ACCOUNT link.
  provider: ProviderId
  onNewChat: () => void
  // `anchor` is the start of a message to scroll the chat to (a search hit in the messages).
  onOpenChat: (id: string, anchor?: string) => void
  // Badges, hidden at zero: 1 while the main conversation itself waits for me, and the number of
  // tasks waiting for me.
  chatCount: number
  inboxCount: number
  // An unlock not yet seen: ACHIEVEMENTS shows a red dot.
  achievementsDot: boolean
  // A boss fight is active and CHAT is not open: CHAT shows a small red dot.
  chatDot: boolean
  account: AccountData
  accountNow: number
}

const NAV_ITEMS: { screen: Screen; label: string; icon: PixelIconName; tone?: 'waiting' }[] = [
  { screen: 'chat', label: 'CHAT', icon: 'chat' },
  { screen: 'inbox', label: 'INBOX', icon: 'inbox' },
  { screen: 'agents', label: 'AGENTS', icon: 'agents' },
  { screen: 'mascots', label: 'MASCOTS', icon: 'mascots' },
  { screen: 'achievements', label: 'ACHIEVEMENTS', icon: 'achievements', tone: 'waiting' }
]

// The sidebar from designs/21-sidebar.html: NEW CHAT, the five screens, HISTORY, and the ACCOUNT
// link with the gear. Below 1100px with the party panel open it folds to a 68px rail whose
// history opens as a flyout. LOGINS is not in the nav: the gear opens it.
function Sidebar({
  mode,
  screen,
  onNavigate,
  project,
  running,
  onOpenProject,
  chats,
  provider,
  onNewChat,
  onOpenChat,
  chatCount,
  inboxCount,
  achievementsDot,
  chatDot,
  account,
  accountNow
}: SidebarProps): React.JSX.Element {
  const rail = mode === 'rail'
  const now = useNow()
  const [searchOpen, setSearchOpen] = useState(false)
  const [flyout, setFlyout] = useState(false)
  const [deleting, setDeleting] = useState<ChatSummary | null>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const historyButton = useRef<HTMLButtonElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const whyId = useId()
  const { remove } = chats

  // The rail's flyout only exists in the rail.
  const flyoutOpen = rail && flyout

  // Ctrl+K (Cmd+K) opens the search from anywhere. In the rail it opens the flyout with it.
  useEffect(() => {
    if (!project) return
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'k')
        return
      event.preventDefault()
      setSearchOpen(true)
      if (rail) setFlyout(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [project, rail])

  const closeFlyout = useCallback((returnFocus: boolean): void => {
    setFlyout(false)
    setSearchOpen(false)
    if (!returnFocus) return
    // After a click elsewhere, focus stays where that click put it. Otherwise it goes back to the
    // history button.
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (!active || active === document.body) historyButton.current?.focus()
    })
  }, [])

  useEffect(() => {
    if (!flyoutOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      setFlyout(false)
      setSearchOpen(false)
      historyButton.current?.focus()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (!target) return
      if (flyoutRef.current?.contains(target) || historyButton.current?.contains(target)) return
      // A menu or a dialog opened from the flyout is drawn outside it and still belongs to it.
      if ((target as Element).closest?.('.chat-menu, [role="dialog"], [role="alertdialog"]')) return
      closeFlyout(true)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [flyoutOpen, closeFlyout])

  function openChat(id: string, anchor?: string): void {
    if (rail) closeFlyout(false)
    setSearchOpen(false)
    onOpenChat(id, anchor)
  }

  function newChat(): void {
    if (running) return
    if (rail) closeFlyout(false)
    onNewChat()
  }

  function closeSearch(): void {
    // Back to where search was opened from. Both buttons stay on the page, so focus moves now.
    ;(rail ? historyButton : searchButton).current?.focus()
    setSearchOpen(false)
  }

  const nav = NAV_ITEMS.map((item) => (
    <NavItem
      key={item.screen}
      label={item.label}
      icon={item.icon}
      tone={item.tone}
      rail={rail}
      railName={
        item.screen === 'inbox' && inboxCount > 0
          ? `Inbox, ${inboxCount} waiting`
          : item.screen === 'chat' && chatCount > 0
            ? 'Chat, waiting for you'
            : item.label.charAt(0) + item.label.slice(1).toLowerCase()
      }
      active={screen === item.screen}
      onClick={() => onNavigate(item.screen)}
      count={item.screen === 'inbox' ? inboxCount : item.screen === 'chat' ? chatCount : undefined}
      dot={
        (item.screen === 'achievements' && achievementsDot) || (item.screen === 'chat' && chatDot)
      }
      dotSize={item.screen === 'chat' ? 'small' : 'normal'}
      dotLabel={item.screen === 'chat' ? 'A boss fight is going' : 'New achievement'}
    />
  ))

  const newChatButton = (
    <button
      type="button"
      className={`new-chat${rail ? ' new-chat--rail' : ''}${running ? ' new-chat--busy' : ''}`}
      aria-disabled={running ? 'true' : undefined}
      aria-describedby={running && !rail ? whyId : undefined}
      aria-label={rail ? (running ? `New chat. ${BUSY_MESSAGE}` : 'New chat') : undefined}
      title={rail ? (running ? BUSY_MESSAGE : 'New chat') : undefined}
      onClick={newChat}
    >
      <PixelIcon name="plus" size={rail ? 20 : 12} />
      {!rail && 'NEW CHAT'}
    </button>
  )

  const gear = (
    <a
      href="#settings"
      className={`sidebar__gear${screen === 'logins' ? ' sidebar__gear--active' : ''}`}
      aria-label="Settings"
      aria-current={screen === 'logins' ? 'page' : undefined}
      title="Settings"
      onClick={(event) => {
        event.preventDefault()
        onNavigate('logins')
      }}
    >
      <PixelIcon name="gear" size={rail ? 20 : 16} />
    </a>
  )

  // The HISTORY block: its label, the project and the search buttons, then the list or the
  // search. In the full sidebar it is part of the sidebar; in the rail it is the flyout.
  const history = (
    <>
      <div className="sidebar__history-head">
        <h2 className="sidebar__label">HISTORY</h2>
        <div className="sidebar__project-row">
          <button
            type="button"
            className="sidebar__project"
            aria-disabled={running ? 'true' : undefined}
            title={running ? BUSY_MESSAGE : (project?.path ?? 'Open a project')}
            aria-label={project ? `Project ${project.name}. Change project` : 'Open a project'}
            onClick={() => {
              if (!running) onOpenProject()
            }}
          >
            <span className="sidebar__project-name">
              {project ? project.name.toUpperCase() : 'OPEN PROJECT'}
            </span>
            {/* The pixel font has no ▾, so it is drawn: an accent triangle on a 8x4 grid. */}
            <span className="sidebar__project-caret" aria-hidden="true">
              <svg
                width="8"
                height="4"
                viewBox="0 0 8 4"
                shapeRendering="crispEdges"
                focusable="false"
              >
                <path fill="currentColor" d="M0 0h8v1H0zM1 1h6v1H1zM2 2h4v1H2zM3 3h2v1H3z" />
              </svg>
            </span>
          </button>
          <button
            ref={searchButton}
            type="button"
            className="sidebar__search"
            aria-label="Search chats"
            aria-pressed={searchOpen}
            disabled={!project}
            title="Search chats (Ctrl+K)"
            onClick={() => setSearchOpen((open) => !open)}
          >
            <PixelIcon name="search" size={16} />
          </button>
        </div>
      </div>
      {chats.error && (
        <p className="sidebar__error" role="alert">
          {chats.error}
        </p>
      )}
      <div className="sidebar__list">
        {!project ? null : searchOpen ? (
          <ChatSearch
            chats={chats.chats}
            openId={chats.openId}
            running={running}
            search={chats.search}
            onOpen={openChat}
            onClose={closeSearch}
          />
        ) : (
          <ChatList
            chats={chats.chats}
            openId={chats.openId}
            running={running}
            now={now}
            onOpen={openChat}
            onRename={chats.rename}
            onPin={(id, pinned) => void chats.pin(id, pinned)}
            onFork={(id) => void chats.fork(id)}
            onExport={(id) => void chats.exportChat(id)}
            onDelete={setDeleting}
          />
        )}
      </div>
    </>
  )

  return (
    <nav className={`sidebar${rail ? ' sidebar--rail' : ''}`} aria-label="Main">
      <div className="sidebar__top">
        {newChatButton}
        {running && !rail && (
          <p id={whyId} className="sidebar__why">
            {BUSY_MESSAGE}
          </p>
        )}
        <div className="sidebar__nav">{nav}</div>
      </div>

      {rail ? (
        <>
          <div className="sidebar__rule sidebar__rule--rail" />
          <button
            ref={historyButton}
            type="button"
            className="sidebar__rail-button"
            aria-label="Chat history"
            aria-expanded={flyoutOpen}
            aria-controls="history-flyout"
            title="Chat history"
            onClick={() => {
              if (flyoutOpen) closeFlyout(true)
              else setFlyout(true)
            }}
          >
            <PixelIcon name="list" size={20} />
          </button>
          <span className="sidebar__spacer" />
          <AccountLink
            data={account}
            now={accountNow}
            active={screen === 'account'}
            provider={provider}
            rail
            onOpen={() => onNavigate('account')}
          />
          {gear}
          {flyoutOpen && (
            <div
              ref={flyoutRef}
              id="history-flyout"
              className="history-flyout"
              role="region"
              aria-label="Chat history"
            >
              {history}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="sidebar__rule" />
          {history}
          <div className="sidebar__footer">
            <AccountLink
              data={account}
              now={accountNow}
              active={screen === 'account'}
              provider={provider}
              onOpen={() => onNavigate('account')}
            />
            {gear}
          </div>
        </>
      )}

      {deleting && (
        <Dialog
          title="DELETE CHAT?"
          tone="danger"
          onClose={() => setDeleting(null)}
          actions={
            <>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setDeleting(null)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => {
                  const chat = deleting
                  setDeleting(null)
                  void remove(chat.id)
                }}
              >
                DELETE
              </button>
            </>
          }
        >
          <p>
            Delete this chat from Mya? {PROVIDER_NAMES[deleting.provider]}&apos;s own files stay on
            your computer.
          </p>
        </Dialog>
      )}
    </nav>
  )
}

export default Sidebar
