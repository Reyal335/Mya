import { useCallback, useEffect, useRef, useState } from 'react'
import AchievementToast from './components/AchievementToast'
import AppShell from './components/AppShell'
import NoProject from './components/NoProject'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import { titleBarCrumb } from './components/titleBarCrumb'
import AccountScreen from './screens/AccountScreen'
import ConversationScreen from './screens/ConversationScreen'
import InboxScreen from './screens/InboxScreen'
import AgentsScreen from './screens/AgentsScreen'
import MascotsScreen from './screens/MascotsScreen'
import type { MascotsTab } from './screens/mascotsTabIds'
import AchievementsScreen from './screens/AchievementsScreen'
import LoginsScreen from './screens/LoginsScreen'
import { DEFAULT_CHAT_TITLE } from '../../shared/chats'
import type { ProviderId } from '../../shared/models'
import NewChatDialog from './components/NewChatDialog'
import { useProgression } from './hooks/useProgression'
import { useBossFight } from './hooks/useBossFight'
import type { PartyTab } from './components/PartyPanel'
import { accessoryById } from './progression/accessories'
import { useActiveMascot } from './mascots/useActiveMascot'
import { useAccount } from './hooks/useAccount'
import { useChats } from './hooks/useChats'
import { useConversation, type CallTarget } from './hooks/useConversation'
import { usePartyPanelMode } from './hooks/usePartyPanelMode'
import { useProject } from './hooks/useProject'
import { useSidebarMode } from './hooks/useSidebarMode'
import { useTasks } from './hooks/useTasks'
import { useWaitingAlert } from './hooks/useWaitingAlert'
import type { ScrollTarget } from './conversation/scrollTarget'
import type { LeaveGuard, Screen } from './screens/types'

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('chat')
  const { project, loaded, openProject } = useProject()
  // The conversation and the tasks live above the screens, fed by the same agent
  // events, so CHAT and INBOX always agree and leaving CHAT loses nothing.
  const conversation = useConversation()
  const tasks = useTasks(project?.path ?? null)
  // The title bar's counts, the amber WAITING fill, and the breadcrumb all read what is
  // already here: the tasks, the screen, the project, and the chat that is open.
  const mascot = useActiveMascot(window.mya.mascots)
  const waitingAlert = useWaitingAlert(tasks.tasks, tasks.loaded, screen === 'inbox')
  // Who I am signed in as and the usage numbers: the sidebar's ACCOUNT link and ACCOUNT share them.
  const account = useAccount()
  // Achievements and what is equipped: the nav dot, the screen, and the unlock toast.
  const progression = useProgression()
  // The party panel's tab for this session.
  const [partyTab, setPartyTab] = useState<PartyTab>('party')
  // The party panel is open or a rail. The sidebar folds to a rail when it is open in a narrow
  // window, so the two read the same choice.
  const party = usePartyPanelMode()
  const sidebarMode = useSidebarMode(party.mode)
  // MASCOTS or BOSSES: remembered for the session, not across restarts.
  const [mascotsTab, setMascotsTab] = useState<MascotsTab>('mascots')
  const { clear } = conversation
  // The agent called for my next message, and the task open in INBOX.
  const [call, setCall] = useState<CallTarget | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null)
  // Bumped when another chat or project takes over CHAT, so the screen starts fresh: the dialogue
  // box open, the battle view closed, the composer empty, and the saved choices read again.
  const [chatEpoch, setChatEpoch] = useState(0)

  // A screen with unsaved changes asks before the app navigates or switches project.
  const leaveGuard = useRef<LeaveGuard | null>(null)
  const setLeaveGuard = useCallback((guard: LeaveGuard | null): void => {
    leaveGuard.current = guard
  }, [])
  const confirmLeave = useCallback((proceed: () => void): void => {
    if (leaveGuard.current) leaveGuard.current(proceed)
    else proceed()
  }, [])

  // Another chat became the open one (opened, made, forked, or the open one deleted): what is on
  // screen belongs to the old one. Its history loads when CHAT shows the new chat.
  const handleSwitched = useCallback((): void => {
    clear()
    setChatEpoch((n) => n + 1)
    setCall(null)
    setScrollTarget(null)
    setScreen('chat')
    setFocusRequest((n) => n + 1)
  }, [clear])
  const chats = useChats(project?.path ?? null, handleSwitched)
  // The open conversation's boss fight: each chat has its own.
  const boss = useBossFight(project?.path ?? null, chats.openId)
  // The latest of these, for the handlers that must not be remade on every change.
  const chatsRef = useRef(chats)
  const runningRef = useRef(conversation.running)
  useEffect(() => {
    chatsRef.current = chats
    runningRef.current = conversation.running
  })

  const handleOpenProject = useCallback(async (): Promise<void> => {
    const previousPath = project?.path
    try {
      const opened = await openProject()
      // A different project has its own chats, conversation, and tasks.
      if (opened && opened.path !== previousPath) {
        clear()
        setChatEpoch((n) => n + 1)
        setCall(null)
        setSelectedTaskId(null)
        setScrollTarget(null)
      }
    } catch (err) {
      console.error('Could not open the project:', err)
    }
  }, [project, openProject, clear])

  const handleNavigate = useCallback(
    (next: Screen): void => {
      if (next !== screen) confirmLeave(() => setScreen(next))
    },
    [screen, confirmLeave]
  )

  const handleSidebarOpenProject = useCallback((): void => {
    confirmLeave(() => void handleOpenProject())
  }, [confirmLeave, handleOpenProject])

  // A chat in HISTORY, a search hit, or a popup: CHAT shows that chat. The one already open just
  // comes to the front. During a run main refuses to switch, and the sidebar says why.
  const openChat = useCallback(
    (id: string, anchor?: string): void => {
      confirmLeave(() => {
        void (async () => {
          if (id !== chatsRef.current.openId) {
            if (!(await chatsRef.current.open(id))) return
          } else {
            setScreen('chat')
            setFocusRequest((n) => n + 1)
          }
          if (anchor)
            setScrollTarget((current) => ({ chatId: id, anchor, tick: (current?.tick ?? 0) + 1 }))
        })()
      })
    },
    [confirmLeave]
  )

  // NEW CHAT opens the dialog that picks who runs the chat. During a run it does nothing: main
  // refuses a new chat then too, and the sidebar says why.
  const [newChatOpen, setNewChatOpen] = useState(false)
  const newChat = useCallback((): void => {
    if (runningRef.current) return
    setNewChatOpen(true)
  }, [])

  // START <PROVIDER> CHAT: the chat is made on that provider and opens. An empty chat of the same
  // provider that is already open is kept: it only comes to the front. Returns why it did not work.
  const startChat = useCallback(
    (provider: ProviderId): Promise<string | null> =>
      new Promise((resolve) => {
        confirmLeave(() => {
          void (async () => {
            const made = await chatsRef.current.create(provider)
            if (!made.ok) {
              resolve(chatsRef.current.error ?? 'The chat could not be made.')
              return
            }
            if (!made.created) {
              setScreen('chat')
              setFocusRequest((n) => n + 1)
            }
            setNewChatOpen(false)
            resolve(null)
          })()
        })
      }),
    [confirmLeave]
  )

  // CALL on an agent card and ASK AGAIN in INBOX open CHAT with the agent called. ASK AGAIN opens the
  // chat the task came from, unless a run is going.
  const callAgent = useCallback(
    (target: CallTarget, chatId?: string | null): void => {
      confirmLeave(() => {
        void (async () => {
          if (chatId && chatId !== chatsRef.current.openId && !runningRef.current) {
            await chatsRef.current.open(chatId)
          }
          setCall(target)
          setScreen('chat')
          setFocusRequest((n) => n + 1)
        })()
      })
    },
    [confirmLeave]
  )

  // VIEW CHANGES asks the task detail to scroll to ACTIVITY. The tick makes a second
  // click on the same task scroll again.
  const [activityRequest, setActivityRequest] = useState<{ taskId: string; tick: number } | null>(
    null
  )
  const openTask = useCallback((taskId: string, section?: 'activity'): void => {
    setSelectedTaskId(taskId)
    if (section === 'activity') {
      setActivityRequest((current) => ({ taskId, tick: (current?.tick ?? 0) + 1 }))
    }
    setScreen('inbox')
  }, [])

  // OPEN on a popup: the chat it came from, or the task in INBOX. Unsaved changes still ask first.
  useEffect(
    () =>
      window.mya.ui.onOpen((target) => {
        confirmLeave(() => {
          if (target.screen === 'inbox') {
            openTask(target.taskId, target.section)
          } else if (
            target.chatId &&
            target.chatId !== chatsRef.current.openId &&
            !runningRef.current
          ) {
            void chatsRef.current.open(target.chatId).then((ok) => {
              if (!ok) setScreen('chat')
            })
          } else {
            setScreen('chat')
          }
        })
      }),
    [confirmLeave, openTask]
  )

  const openTaskSummary = tasks.tasks.find((task) => task.id === selectedTaskId) ?? null
  const openChatSummary = chats.chats.find((chat) => chat.id === chats.openId) ?? null
  const crumb = titleBarCrumb(
    screen,
    openChatSummary?.title ?? DEFAULT_CHAT_TITLE,
    project,
    openTaskSummary,
    mascotsTab,
    openChatSummary?.provider ?? null
  )

  const mainWaiting = conversation.items.some(
    (item) => item.kind === 'tool' && item.permission !== null && item.taskId === null
  )

  return (
    <AppShell
      titleBar={
        <TitleBar
          crumb={crumb}
          running={tasks.runningCount}
          waiting={tasks.waitingCount}
          waitingAlert={waitingAlert}
          // A pill opens INBOX. INBOX has no status filter, so it opens as it is.
          onOpenInbox={() => handleNavigate('inbox')}
        />
      }
      sidebar={
        <Sidebar
          mode={sidebarMode}
          screen={screen}
          onNavigate={handleNavigate}
          project={project}
          running={conversation.running}
          onOpenProject={handleSidebarOpenProject}
          chats={chats}
          provider={openChatSummary?.provider ?? 'claude'}
          onNewChat={newChat}
          onOpenChat={openChat}
          chatCount={mainWaiting ? 1 : 0}
          inboxCount={tasks.waitingCount}
          achievementsDot={progression.unseen}
          chatDot={boss.current?.status === 'active' && screen !== 'chat'}
          account={account.data}
          accountNow={account.now}
        />
      }
    >
      {screen === 'chat' &&
        (!loaded ? (
          <section className="screen" aria-label="Chat" />
        ) : project ? (
          <ConversationScreen
            key={chatEpoch}
            project={project}
            conversation={conversation}
            chat={openChatSummary}
            chatsLoaded={chats.loaded}
            call={call}
            onCallChange={setCall}
            focusRequest={focusRequest}
            onOpenTask={openTask}
            boss={boss}
            partyTab={partyTab}
            onPartyTab={setPartyTab}
            party={party}
            scrollTarget={scrollTarget}
            onNewChat={newChat}
          />
        ) : (
          <NoProject title="CHAT" onOpenProject={() => void handleOpenProject()} />
        ))}
      {screen === 'inbox' && (
        <InboxScreen
          project={project}
          projectLoaded={loaded}
          onOpenProject={() => void handleOpenProject()}
          conversation={conversation}
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
          onAskAgain={callAgent}
          activityRequest={activityRequest}
        />
      )}
      {screen === 'agents' && (
        <AgentsScreen
          project={project}
          provider={openChatSummary?.provider ?? 'claude'}
          setLeaveGuard={setLeaveGuard}
          onCall={callAgent}
        />
      )}
      {screen === 'mascots' && (
        <MascotsScreen
          provider={openChatSummary?.provider ?? 'claude'}
          tab={mascotsTab}
          onTab={setMascotsTab}
          setLeaveGuard={setLeaveGuard}
        />
      )}
      {screen === 'achievements' && <AchievementsScreen progression={progression} />}
      {screen === 'logins' && <LoginsScreen claude={account.data.account} />}
      {screen === 'account' && (
        <AccountScreen
          store={account}
          provider={openChatSummary?.provider ?? 'claude'}
          onOpenLogins={() => handleNavigate('logins')}
        />
      )}
      {newChatOpen && (
        <NewChatDialog
          account={account.data}
          current={openChatSummary?.provider ?? null}
          openIsEmpty={openChatSummary ? openChatSummary.messageCount === 0 : true}
          onClose={() => setNewChatOpen(false)}
          onStart={startChat}
          onSignIn={() => {
            setNewChatOpen(false)
            handleNavigate('logins')
          }}
        />
      )}
      <AchievementToast
        mascot={mascot}
        accessory={accessoryById(progression.equipped.accessory)}
        onEquip={(notice) => void progression.equip(notice.reward.kind, notice.reward.id)}
      />
    </AppShell>
  )
}

export default App
