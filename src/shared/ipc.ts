// Shared IPC contract between main, preload, and renderer.
// Our own small types only: never raw Agent SDK messages.

import type { AccountData } from './account'
import type { BossListItem, Fight, FightEvent } from './bosses'
import type { ChatList, ChatSearchResults, ChatStarts, ChatsResult } from './chats'
import type { AchievementsData, Equipped, Reward, RewardKind, UnlockNotice } from './achievements'
import type { PastedImage } from './images'
import type { ProviderErrorCode } from './logins'
import type { MascotStateName, MascotVoice } from './mascotRules'
import type { ModelChoice, ModelLists, ProviderId } from './models'
import type { AgentProgress, AgentStats, TaskLoot, TaskXp } from './progression'
import type { ThemeChoice, ThemeInfo } from './themes'

export const IpcChannel = {
  ProjectGet: 'project:get',
  ProjectOpen: 'project:open',
  AgentSend: 'agent:send',
  AgentStop: 'agent:stop',
  AgentPermission: 'agent:permission',
  AgentEvent: 'agent:event',
  AgentsList: 'agents:list',
  AgentsRead: 'agents:read',
  AgentsCreate: 'agents:create',
  AgentsUpdate: 'agents:update',
  AgentsRemove: 'agents:remove',
  AgentsPickIcon: 'agents:pick-icon',
  AgentsDiscardIcon: 'agents:discard-icon',
  MascotsList: 'mascots:list',
  MascotsGetActive: 'mascots:get-active',
  MascotsPickSheet: 'mascots:pick-sheet',
  MascotsDiscardSheet: 'mascots:discard-sheet',
  MascotsSliceSheet: 'mascots:slice-sheet',
  MascotsDropSources: 'mascots:drop-sources',
  MascotsCreate: 'mascots:create',
  MascotsUpdate: 'mascots:update',
  MascotsRemove: 'mascots:remove',
  MascotsResetDefault: 'mascots:reset-default',
  MascotsSetActive: 'mascots:set-active',
  // Main to every window: the active mascot or its sheets changed.
  MascotsChanged: 'mascots:changed',
  ChatHistory: 'chat:history',
  // The project's chats: the list, and what HISTORY does with them.
  ChatsList: 'chats:list',
  ChatsOpen: 'chats:open',
  ChatsCreate: 'chats:create',
  ChatsStarts: 'chats:starts',
  ChatsRename: 'chats:rename',
  ChatsPin: 'chats:pin',
  ChatsRemove: 'chats:remove',
  ChatsFork: 'chats:fork',
  ChatsExport: 'chats:export',
  ChatsSearch: 'chats:search',
  // Main to every window: a chat was made, renamed, titled, counted, pinned, or deleted.
  ChatsChanged: 'chats:changed',
  ChatGetModelChoice: 'chat:get-model-choice',
  ChatSetModelChoice: 'chat:set-model-choice',
  ModelsList: 'models:list',
  ThemesList: 'themes:list',
  ThemesAdd: 'themes:add',
  ThemesRename: 'themes:rename',
  ThemesRemove: 'themes:remove',
  ThemesGetChoice: 'themes:get-choice',
  ThemesSetChoice: 'themes:set-choice',
  TasksList: 'tasks:list',
  TasksGet: 'tasks:get',
  TasksMarkSeen: 'tasks:mark-seen',
  TasksRemove: 'tasks:remove',
  TasksClearFinished: 'tasks:clear-finished',
  // Main to every window: a task started, changed, ended, or was removed.
  TasksChanged: 'tasks:changed',
  AccountGet: 'account:get',
  AccountCheck: 'account:check',
  AccountOpenUsagePage: 'account:open-usage-page',
  // Main to every window: the account or the usage numbers changed. Carries both.
  AccountChanged: 'account:changed',
  // The main window's own buttons, for the custom title bar. Each acts on the window
  // that sent it.
  WindowMinimize: 'window:minimize',
  WindowToggleMaximize: 'window:toggle-maximize',
  WindowClose: 'window:close',
  WindowGetState: 'window:get-state',
  // Main to the main window: it was maximized, restored, put in or taken out of full
  // screen, focused, or blurred.
  WindowState: 'window:state',
  UiGetPartyPanel: 'ui:get-party-panel',
  UiSetPartyPanel: 'ui:set-party-panel',
  UiGetDialogueAutoCollapse: 'ui:get-dialogue-auto-collapse',
  UiSetDialogueAutoCollapse: 'ui:set-dialogue-auto-collapse',
  UiGetPopups: 'ui:get-popups',
  UiSetPopups: 'ui:set-popups',
  UiTestPopup: 'ui:test-popup',
  UiGetOpenInEditor: 'ui:get-open-in-editor',
  UiSetOpenInEditor: 'ui:set-open-in-editor',
  // Main to the main window: OPEN on a popup, with the screen to show.
  UiOpen: 'ui:open',
  // Main to the main window: the command line has something for it. The window then asks.
  UiLaunch: 'ui:launch',
  UiTakeLaunches: 'ui:take-launches',
  UiOpenLaunchFolder: 'ui:open-launch-folder',
  // The popup window's own channels. Main answers them only from the popup.
  PopupGetState: 'popup:get-state',
  // Main to the popup: what to show now, or null.
  PopupState: 'popup:state',
  PopupAct: 'popup:act',
  PopupHover: 'popup:hover',
  PopupGetMascot: 'popup:get-mascot',
  PopupGetEquipped: 'popup:get-equipped',
  // Progression: levels, achievements, and what is equipped.
  ProgressionAgentStats: 'progression:agent-stats',
  ProgressionAgentsSummary: 'progression:agents-summary',
  ProgressionAchievements: 'progression:achievements',
  ProgressionEquip: 'progression:equip',
  ProgressionMarkSeen: 'progression:mark-seen',
  // Main to every window: XP, an unlock, or what is equipped changed.
  ProgressionChanged: 'progression:changed',
  // Main to the main window: an achievement unlocked while the app was in front.
  ProgressionUnlocked: 'progression:unlocked',
  // Boss battles for test runs.
  BossesList: 'bosses:list',
  BossesPickIdle: 'bosses:pick-idle',
  BossesSliceIdle: 'bosses:slice-idle',
  BossesDropSources: 'bosses:drop-sources',
  BossesPickBackground: 'bosses:pick-background',
  BossesCreate: 'bosses:create',
  BossesUpdate: 'bosses:update',
  BossesRemove: 'bosses:remove',
  BossesSetInPool: 'bosses:set-in-pool',
  BossesFight: 'bosses:fight',
  BossesFightOn: 'bosses:fight-on',
  BossesDismiss: 'bosses:dismiss',
  BossesGetTestCommand: 'bosses:get-test-command',
  BossesSetTestCommand: 'bosses:set-test-command',
  // Main to every window: a fight started, played a round, ended, or went away.
  BossesFightEvent: 'bosses:fight-event',
  // Main to every window: a boss was added, changed, deleted, or its POOL toggled.
  BossesChanged: 'bosses:changed',
  ProvidersStatus: 'providers:status',
  ProvidersLoginOAuth: 'providers:login-oauth',
  ProvidersCancelLogin: 'providers:cancel-login',
  ProvidersSaveApiKey: 'providers:save-api-key',
  ProvidersLogout: 'providers:logout',
  ProvidersInstallCli: 'providers:install-cli',
  ProvidersCancelInstall: 'providers:cancel-install',
  // Main to the window that asked: where the install is, as one line from npm.
  ProvidersInstallProgress: 'providers:install-progress'
} as const

export type ProjectInfo = {
  path: string
  name: string
}

export type AgentErrorCode =
  | 'no_project'
  | 'busy'
  | 'invalid_prompt'
  | 'invalid_image'
  | 'not_signed_in'
  | 'api_key_in_use'
  | 'rate_limit'
  | 'overloaded'
  | 'billing'
  | 'agent_unavailable'
  | 'sdk_error'

export type AgentError = {
  code: AgentErrorCode
  message: string
}

// `joined` is true when the message went into the run that was already going, and
// false when it started a new run. The requestId is the run's, one per run.
export type AgentSendResult =
  { ok: true; requestId: string; joined: boolean } | { ok: false; error: AgentError }

// Where a message I sent into a run that was already going stands. It is queued
// until Claude Code takes it in; main reports the two ways that can end.
export type MessageDelivery = 'queued' | 'received' | 'not_delivered'

// An agent I call for my next message, as the step 5 list gives it. Main reads
// the name from the file itself.
export type AgentCallRef = { scope: AgentScope; filePath: string }

// A tool call's input as the SDK gives it. String fields over the IPC size limit
// are cut, and the event says so with `truncated`.
export type ToolInput = Record<string, unknown>

export type ToolEndState = 'done' | 'failed' | 'denied'

export type ToolState = 'running' | 'waiting' | 'done' | 'failed' | 'denied' | 'stopped'

export type PermissionDecision = 'approve' | 'deny'

// The agent behind a task, as the party panel and the inbox show it. scope and
// filePath are null for a built-in agent such as general-purpose.
export type TaskAgent = {
  name: string
  scope: AgentScope | null
  filePath: string | null
  icon: string | null
  role: string | null
}

export type TaskStatus = 'running' | 'waiting' | 'done' | 'error' | 'stopped'

export type TaskEndStatus = 'done' | 'error' | 'stopped'

// One tool call an agent made, labelled as step 3's tool cards are.
export type TaskActivity = { toolId: string; verb: string; target: string | null; state: ToolState }

// Main to renderer, on IpcChannel.AgentEvent. Every event carries the requestId.
// taskId is the task a tool call belongs to, or null for the main conversation.
export type AgentEvent =
  | { requestId: string; type: 'text'; text: string }
  | { requestId: string; type: 'tool_start'; toolId: string; name: string; taskId: string | null }
  | {
      requestId: string
      type: 'tool_input'
      toolId: string
      input: ToolInput
      truncated: boolean
      taskId: string | null
    }
  | {
      requestId: string
      type: 'tool_end'
      toolId: string
      state: ToolEndState
      taskId: string | null
    }
  | {
      requestId: string
      type: 'permission_request'
      permissionId: string
      toolId: string
      name: string
      input: ToolInput
      truncated: boolean
      taskId: string | null
    }
  | {
      requestId: string
      type: 'permission_resolved'
      permissionId: string
      decision: PermissionDecision
    }
  | { requestId: string; type: 'task_start'; taskId: string; agent: TaskAgent; description: string }
  | {
      requestId: string
      type: 'task_end'
      taskId: string
      status: TaskEndStatus
      report: string
      truncated: boolean
      // What a task that ended as done changed, and the XP its agent earned.
      loot: TaskLoot | null
      xp: TaskXp | null
    }
  // A message I sent while the run was going: Claude took it in, or the run ended
  // first. Only for messages sent into a run already going, never the run's first.
  | {
      requestId: string
      type: 'message_state'
      messageId: string
      state: Exclude<MessageDelivery, 'queued'>
    }
  // A reply of Claude's is starting: the exact model answering and the thinking
  // level in force ('auto' or a level). Only for the main conversation.
  | { requestId: string; type: 'reply_start'; model: string; level: string }
  // Claude thought for `ms` milliseconds before answering. Only for the main conversation.
  | { requestId: string; type: 'thought'; ms: number }
  // A line of information in the conversation, such as a lost saved conversation.
  | { requestId: string; type: 'notice'; text: string }
  | { requestId: string; type: 'done' }
  | { requestId: string; type: 'stopped' }
  | { requestId: string; type: 'error'; code: AgentErrorCode; message: string }

// Tasks: one Agent tool call each, kept in userData/tasks.json.

export type TaskSummary = {
  id: string
  agent: TaskAgent
  description: string
  status: TaskStatus
  // One line: the latest activity, "Waiting: ...", or the start of the report.
  preview: string
  startedAt: number
  endedAt: number | null
  seen: boolean
  // The chat that brought the agent in, or null when it is not known.
  chatId: string | null
  // The provider that ran it: its chat's. A task whose chat is not known was Claude's.
  provider: ProviderId
  // Set when the task ended as done (loot) and its agent file earned XP (xp).
  loot: TaskLoot | null
  xp: TaskXp | null
}

export type TaskDetail = TaskSummary & {
  prompt: string
  promptTruncated: boolean
  report: string | null
  reportTruncated: boolean
  activity: TaskActivity[]
}

export type TasksError = { code: 'not_found' | 'invalid' | 'io_error'; message: string }

export type TasksResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: TasksError }

// The main conversation as loaded from its session: the same item kinds the
// conversation builds from events, without ids.
export type HistoryItem =
  // `imageCount` is how many images the message had. The images themselves are not sent.
  | { kind: 'user'; text: string; call: TaskAgent | null; imageCount: number }
  // `model` is the exact model that answered, from the saved session, or null.
  | { kind: 'text'; text: string; model: string | null }
  | {
      kind: 'tool'
      toolId: string
      name: string
      input: ToolInput | null
      truncated: boolean
      state: ToolState
    }
  | {
      kind: 'task'
      taskId: string
      agent: TaskAgent
      description: string
      status: TaskStatus
      activity: string | null
      report: string | null
      loot: TaskLoot | null
      xp: TaskXp | null
    }

export type ChatHistory = {
  // The chat these belong to, or null when the project has none.
  chatId: string | null
  items: HistoryItem[]
  // More than 200 messages: only the last 200 are in items.
  truncated: boolean
  // The saved conversation could not be read.
  unavailable: boolean
  // The chat has messages its provider cannot bring back (Codex and Gemini): it opens empty.
  notShown: boolean
  // Whether sending continues the chat's own provider session, or starts a fresh one in the same
  // chat. null for a chat with no messages.
  resume: 'continues' | 'fresh' | null
  // When the chat was last used and how many messages Mya has of it, for the RESUMED line.
  updatedAt: number
  messageCount: number
}

export type PartyPanelMode = 'open' | 'rail'

// What a start of the `mya` command left for the window. The path is for display only: the window
// names a folder request by id.
export type LaunchEvent =
  { id: string; kind: 'open-folder'; path: string } | { id: string; kind: 'notice'; text: string }

// projectChanged can be true on a failure: the project switched but the chat was refused.
export type LaunchOpenResult =
  | { ok: true; project: ProjectInfo; projectChanged: boolean; created: boolean }
  | { ok: false; project: ProjectInfo | null; projectChanged: boolean; error: { message: string } }

// Model and thinking: the models the logged-in account can use (AUTO is not a row),
// or why the list could not be loaded.
export type ModelsResult = ({ ok: true } & ModelLists) | { ok: false; message: string }

// The open chat's choice, made to fit what is available now, or why it failed. `provider` is
// the chat's: it is fixed when the chat is made, and the chat only runs that provider's models.
export type ModelChoiceResult =
  { ok: true; choice: ModelChoice; provider: ProviderId } | { ok: false; error: { message: string } }

// The main window, for the custom title bar. `platform` decides whether the bar draws
// its own window buttons (win32, linux) or leaves room for the native ones (darwin).
export type WindowPlatform = 'win32' | 'darwin' | 'linux'

export type WindowState = {
  // Maximized or in full screen: the button then offers Restore.
  maximized: boolean
  focused: boolean
  platform: WindowPlatform
}

// Chat themes: uploaded pictures behind the CHAT history and stage (the built-in Tokyo
// Night is bundled with the window), and the choice of which one and how faded.

export type ThemesErrorCode =
  | 'invalid'
  | 'not_found'
  | 'no_project'
  | 'too_large'
  | 'not_image'
  | 'too_small'
  | 'too_big_dimensions'
  | 'io_error'

export type ThemesError = { code: ThemesErrorCode; message: string }

export type ThemesResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: ThemesError }

// ADD THEME: the file dialog was closed, a theme was added, or the file was refused
// with the message to show.
export type AddThemeResult =
  | { ok: true; canceled: true }
  | { ok: true; canceled: false; theme: ThemeInfo }
  | { ok: false; error: ThemesError }

// The open chat's own theme (null when it uses the default) and the default.
export type ThemeChoices = { chat: ThemeChoice | null; default: ThemeChoice }

// APPLY in the picker. 'chat' saves the choice for this chat only. 'all' saves it as
// the default and clears this chat's own choice.
export type ThemeChoiceChange = { scope: 'chat' | 'all'; themeId: string; fade: number }

// A pick in the model picker. `asDefault` also saves it as the choice new chats start from.
export type ModelChoiceChange = { model: string; effort: string; asDefault: boolean }

// Popups: the small always-on-top window with the mascot (designs/5-popup-notifications.html).

// Who speaks in the bubble: an agent with its icon, or the main conversation's
// speaker (the dialogue box's name), with no icon.
export type PopupWho = { kind: 'agent'; name: string; icon: string | null } | { kind: 'speaker' }

export type PopupAction = 'approve' | 'deny' | 'open' | 'details' | 'dismiss' | 'equip'

// Where OPEN takes the main window. `section` scrolls the task detail to ACTIVITY.
export type PopupOpenTarget =
  { screen: 'chat'; chatId?: string } | { screen: 'inbox'; taskId: string; section?: 'activity' }

// The loot lines on an "agent reported back" popup.
export type PopupLoot = {
  items: number
  added: number
  removed: number
  // A read-only quest: how many files it read.
  found: number
  // The first two item names, NEW marked.
  first: { path: string; isNew: boolean }[]
  xp: number | null
  levelUp: boolean
}

export type PopupView =
  | {
      id: string
      kind: 'approval'
      who: PopupWho
      // The tool card's one-line label, such as "Editing src/auth.js".
      label: string
      // Where this request is among those pending, shown as "1 of 3" when more than one.
      position: { index: number; total: number }
      request: { name: string; input: ToolInput; truncated: boolean; projectPath: string }
      // Short enough to show in full in the compact popup.
      fits: boolean
      detailsOpen: boolean
    }
  | {
      id: string
      kind: 'finished' | 'error'
      who: PopupWho
      text: string
      loot?: PopupLoot | null
      // The provider of the chat it came from, for the tag beside the status.
      provider?: ProviderId
    }
  | { id: string; kind: 'achievement'; name: string; reward: Reward }

// The API the popup's preload exposes as window.myaPopup. Nothing else.
export type MyaPopupApi = {
  getState: () => Promise<PopupView | null>
  onState: (callback: (view: PopupView | null) => void) => () => void
  act: (id: string, action: PopupAction) => Promise<{ ok: boolean }>
  // The pointer is over the card: finished and error popups wait.
  hover: (isOver: boolean) => void
  mascot: {
    getActive: () => Promise<MascotsResult<{ mascot: ActiveMascotData }>>
    onChanged: (callback: () => void) => () => void
  }
  // The equipped accessory, drawn over the mascot.
  equipped: {
    get: () => Promise<Equipped>
    onChanged: (callback: () => void) => () => void
  }
}

// Agent files: Claude Code subagents in <project>/.claude/agents/ and the global folder.

export type AgentScope = 'project' | 'global'

export type AgentSummary = {
  scope: AgentScope
  filePath: string
  // The name field, or the filename when the file has a problem and no name.
  name: string
  description: string
  // null means the tools key is left out, so the agent inherits every tool.
  tools: string[] | null
  // null means the model key is left out, so Claude Code picks the default.
  model: string | null
  otherFields: string[]
  icon: string | null
  // A Mya label such as "code-reader", kept in userData, not in the file.
  role: string | null
  // Read only, for the agent gate: the file's permissionMode and background fields.
  permissionMode: string | null
  background: boolean
  problem: string | null
}

export type AgentDetail = AgentSummary & {
  body: string
  modifiedTime: number
}

export type AgentFolders = {
  project: string | null
  global: string
}

export type AgentIconChange =
  { type: 'keep' } | { type: 'remove' } | { type: 'token'; token: string }

export type AgentDraft = {
  scope: AgentScope
  name: string
  description: string
  body: string
  tools: string[] | null
  model: string | null
  icon: AgentIconChange
  // null means no role.
  role: string | null
}

export type AgentsErrorCode =
  'invalid' | 'exists' | 'conflict' | 'not_found' | 'outside_folder' | 'no_project' | 'io_error'

export type AgentsError = { code: AgentsErrorCode; message: string }

export type AgentsResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: AgentsError }

export type PickIconResult =
  | { ok: true; canceled: true }
  | { ok: true; canceled: false; token: string; preview: string }
  | { ok: false; error: AgentsError }

// Mascots: the built-in default (id "default", bundled with the renderer) and
// uploaded ones in userData/mascots/<uuid>/.

// One spritesheet: a horizontal strip of 64x64 frames, played at `fps`. `src`
// is a data URL. The frame count always comes from the image width. With `reverse`
// the loop plays forward, then back, then forward again (see loopOrder); it only
// takes effect with three or more frames.
export type MascotLoop = {
  src: string
  frames: number
  fps: number
  reverse: boolean
}

export type MascotLoops = { idle: MascotLoop } & Partial<
  Record<Exclude<MascotStateName, 'idle'>, MascotLoop>
>

export type MascotSummary =
  // `voice` is null when the mascot has none set.
  | { id: string; name: string; loops: MascotLoops; voice: MascotVoice | null; problem: null }
  // Can be deleted, not edited or set active. `name` is the folder id when
  // the manifest has no usable name.
  | { id: string; name: string; loops: Partial<MascotLoops>; problem: string }

// The user's changes to the built-in default, kept in userData/mascots/default/
// and laid over the bundled mascot. The bundled files are never changed.
export type DefaultMascotEdits = {
  // True when the folder exists, even if it is broken.
  edited: boolean
  // null means the built-in name.
  name: string | null
  // Uploaded loops only. idle falls back to the bundled sheet, other states to idle.
  loops: Partial<MascotLoops>
  // null means the built-in voice.
  voice: MascotVoice | null
  // Set when the folder is broken. The bundled mascot is then used as it is.
  problem: string | null
}

// The mascot to show. For the default, `name` may be null and `loops` may lack
// idle: the renderer fills both in from the bundled mascot.
export type ActiveMascotData = {
  id: string
  name: string | null
  loops: Partial<MascotLoops>
}

export type MascotSheetChange =
  { type: 'keep' } | { type: 'remove' } | { type: 'token'; token: string }

export type MascotDraft = {
  name: string
  // Every state, in any order. `keep` on a state without a sheet leaves it empty.
  // For the default, an empty idle means the bundled idle sheet.
  states: Record<MascotStateName, { fps: number; reverse: boolean; sheet: MascotSheetChange }>
  // null means no voice set.
  voice: MascotVoice | null
}

export type MascotsErrorCode = 'invalid' | 'invalid_slice' | 'not_found' | 'no_idle' | 'io_error'

export type MascotsError = { code: MascotsErrorCode; message: string }

export type MascotsResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: MascotsError }

// A picked file that is already a legal strip, waiting behind `token` until SAVE.
export type PickedStrip = {
  kind: 'strip'
  token: string
  preview: string
  frames: number
  width: number
  fileName: string
}

// A picked file in any other layout. It waits behind `sourceToken` until the
// dialog closes, so it can be sliced for several states. `bytes` is the file,
// for the window to show from a blob: URL: a data: URL of a sheet over about
// 1.5 MB is longer than Chromium allows, and the image would not load.
export type PickedSource = {
  kind: 'needs_slice'
  sourceToken: string
  fileName: string
  width: number
  height: number
  bytes: Uint8Array
}

export type PickSheetResult =
  | { ok: true; canceled: true }
  | ({ ok: true; canceled: false } & (PickedStrip | PickedSource))
  | { ok: false; error: MascotsError }

// A slice is a new strip, waiting behind `token` like a picked one.
export type SliceSheetResult =
  { ok: true; token: string; frames: number; preview: string } | { ok: false; error: MascotsError }

// --- Bosses: the manager ---

// What the editor does with the idle strip and the background of a boss it saves.
export type BossIdleChange = { type: 'keep' } | { type: 'token'; token: string }
export type BossBackgroundChange =
  { type: 'keep' } | { type: 'remove' } | { type: 'token'; token: string }

// What the editor sends to create or update a boss. Main checks every field again; no path and
// no image bytes ever come from the window.
export type BossDraft = {
  name: string
  accent: string
  fps: number
  idle: BossIdleChange
  background: BossBackgroundChange
}

export type BossesErrorCode = 'invalid' | 'not_found' | 'built_in' | 'last_in_pool' | 'io_error'

export type BossesError = { code: BossesErrorCode; message: string }

export type BossesResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: BossesError }

// A picked background waits in main behind `token` until SAVE, like a picked sheet.
export type PickBackgroundResult =
  | { ok: true; canceled: true }
  | {
      ok: true
      canceled: false
      token: string
      fileName: string
      width: number
      height: number
      // The picture as a data URL, for the row and the preview.
      preview: string
    }
  | { ok: false; error: BossesError }

// The API the preload exposes as window.mya.
export type MyaApi = {
  project: {
    get: () => Promise<ProjectInfo | null>
    open: () => Promise<ProjectInfo | null>
  }
  agent: {
    // `call` names an agent for this message. Main checks it and adds the sentence.
    // `messageId` is a lowercase UUID the window makes up: main sends it to Claude
    // Code as the message's id and reports its delivery under it. While a run is
    // going the message goes into that run; otherwise it starts one. `images` are pasted
    // images, bytes only: main reads each one's type from its bytes and checks it again.
    send: (
      prompt: string,
      call: AgentCallRef | null,
      messageId: string,
      images?: PastedImage[]
    ) => Promise<AgentSendResult>
    stop: () => Promise<void>
    answerPermission: (
      permissionId: string,
      decision: PermissionDecision
    ) => Promise<{ ok: boolean }>
    onEvent: (callback: (event: AgentEvent) => void) => () => void
  }
  agents: {
    list: () => Promise<AgentsResult<{ agents: AgentSummary[]; folders: AgentFolders }>>
    read: (filePath: string) => Promise<AgentsResult<{ agent: AgentDetail }>>
    create: (draft: AgentDraft) => Promise<AgentsResult<{ filePath: string }>>
    update: (
      filePath: string,
      draft: AgentDraft,
      modifiedTime: number
    ) => Promise<AgentsResult<{ filePath: string }>>
    remove: (filePath: string) => Promise<AgentsResult>
    pickIcon: () => Promise<PickIconResult>
    // Drops a picked icon that will not be saved.
    discardIcon: (token: string) => Promise<void>
  }
  mascots: {
    // Uploaded mascots, plus the user's edits to the built-in default. `activeId`
    // is "default" when the chosen mascot is missing or has a problem.
    list: () => Promise<
      MascotsResult<{
        mascots: MascotSummary[]
        defaultMascot: DefaultMascotEdits
        activeId: string
      }>
    >
    getActive: () => Promise<MascotsResult<{ mascot: ActiveMascotData }>>
    pickSheet: () => Promise<PickSheetResult>
    // Drops a picked sheet that will not be saved.
    discardSheet: (token: string) => Promise<void>
    // Cuts picked cells (reading-order indexes, in play order) out of a source
    // into a strip of 64x64 frames.
    sliceSheet: (
      sourceToken: string,
      columns: number,
      rows: number,
      cells: number[]
    ) => Promise<SliceSheetResult>
    // Drops every loaded source sheet. Called when the dialog closes.
    dropSources: () => Promise<void>
    create: (draft: MascotDraft) => Promise<MascotsResult<{ id: string }>>
    // id "default" edits the built-in mascot's name and loops.
    update: (id: string, draft: MascotDraft) => Promise<MascotsResult<{ id: string }>>
    remove: (id: string) => Promise<MascotsResult>
    // Moves the default's edits to the trash, back to the bundled mascot.
    resetDefault: () => Promise<MascotsResult>
    setActive: (id: string) => Promise<MascotsResult>
    onChanged: (callback: () => void) => () => void
  }
  chat: {
    // The open chat's saved conversation, as items.
    history: () => Promise<ChatHistory>
    // The open project's chat: its model and thinking choice.
    getModelChoice: () => Promise<ModelChoiceResult>
    // Saves a pick for the chat (and for new chats too with asDefault). During a run
    // it applies from the next message.
    setModelChoice: (change: ModelChoiceChange) => Promise<ModelChoiceResult>
  }
  // The open project's chats. Every call that changes them hands back the list as it is now.
  // Making, opening, and forking a chat, and deleting the open one, are refused with the code
  // busy while a run is going.
  chats: {
    list: () => Promise<ChatsResult<ChatList>>
    open: (id: string) => Promise<ChatsResult<ChatList>>
    // NEW CHAT, on the provider the dialog picked. The provider is fixed from then on. An empty
    // chat of the same provider that is already open is kept, and `created` is false. A provider
    // that is not signed in is refused with the code not_ready.
    create: (provider: ProviderId) => Promise<ChatsResult<ChatList & { created: boolean }>>
    // What a new chat of each provider starts on, for the cards in the NEW CHAT dialog.
    starts: () => Promise<ChatsResult<{ starts: ChatStarts }>>
    // An empty or unchanged title is no change.
    rename: (id: string, title: string) => Promise<ChatsResult<ChatList>>
    pin: (id: string, pinned: boolean) => Promise<ChatsResult<ChatList>>
    remove: (id: string) => Promise<ChatsResult<ChatList>>
    // Claude chats only.
    fork: (id: string) => Promise<ChatsResult<ChatList>>
    // Opens the save dialog and writes the chat's messages as Markdown.
    export: (id: string) => Promise<ChatsResult<{ canceled: boolean }>>
    search: (query: string) => Promise<ChatsResult<{ results: ChatSearchResults }>>
    onChanged: (callback: () => void) => () => void
  }
  themes: {
    // The uploaded themes, oldest first.
    list: () => Promise<ThemesResult<{ themes: ThemeInfo[] }>>
    // Opens the file dialog and adds the file it returns, or says why it was refused.
    add: () => Promise<AddThemeResult>
    // Returns the name as saved (trimmed).
    rename: (id: string, name: string) => Promise<ThemesResult<{ name: string }>>
    // Chats that used the theme go back to the default. Returns the choices as they are now.
    remove: (id: string) => Promise<ThemesResult<ThemeChoices>>
    getChoice: () => Promise<ThemesResult<ThemeChoices>>
    setChoice: (change: ThemeChoiceChange) => Promise<ThemesResult<ThemeChoices>>
  }
  models: {
    // Fetched once per project folder, in the order the SDK returns.
    list: () => Promise<ModelsResult>
  }
  tasks: {
    // The open project's tasks, newest first.
    list: () => Promise<TasksResult<{ tasks: TaskSummary[] }>>
    get: (taskId: string) => Promise<TasksResult<{ task: TaskDetail }>>
    markSeen: (taskId: string) => Promise<TasksResult>
    // A running or waiting task cannot be removed.
    remove: (taskId: string) => Promise<TasksResult>
    // Removes the open project's done, error, and stopped tasks.
    clearFinished: () => Promise<TasksResult>
    onChanged: (callback: () => void) => () => void
  }
  account: {
    // Who I am signed in as and the saved usage numbers, as main has them now.
    get: () => Promise<AccountData>
    // Reads the account again from Claude Code (CHECK AGAIN). Uses none of the plan.
    check: () => Promise<AccountData>
    onChange: (callback: (data: AccountData) => void) => () => void
    // Opens claude.ai's usage page in the default browser. Main opens that one address.
    openUsagePage: () => Promise<{ ok: boolean }>
  }
  window: {
    minimize: () => Promise<void>
    // Maximizes, or restores a maximized or full-screen window. 'doubleClick' marks a
    // double-click on the bar: main ignores it when the system has just done the same.
    toggleMaximize: (source?: 'doubleClick') => Promise<void>
    // Closes the window the way closing it any other way does.
    close: () => Promise<void>
    getState: () => Promise<WindowState>
    onState: (callback: (state: WindowState) => void) => () => void
  }
  ui: {
    // null until I choose with the collapse button.
    getPartyPanel: () => Promise<PartyPanelMode | null>
    setPartyPanel: (mode: PartyPanelMode) => Promise<{ ok: boolean }>
    // AUTO on CHAT's dialogue box, kept in settings.json. On when never set.
    getDialogueAutoCollapse: () => Promise<boolean>
    setDialogueAutoCollapse: (on: boolean) => Promise<{ ok: boolean }>
    // Popups on or off, kept in settings.json. On when never set.
    getPopups: () => Promise<boolean>
    setPopups: (on: boolean) => Promise<{ ok: boolean }>
    // A sample finished popup for 6 seconds, even with popups off or the app in front.
    testPopup: () => Promise<void>
    // Launch VS Code on OPEN/CHANGE, on or off, kept in settings.json. Off when never set.
    getOpenInEditor: () => Promise<boolean>
    setOpenInEditor: (on: boolean) => Promise<{ ok: boolean }>
    // OPEN on a popup: the screen the main window should show.
    onOpen: (callback: (target: PopupOpenTarget) => void) => () => void
    // The `mya` command has something for the window: call takeLaunches to get it.
    onLaunch: (callback: () => void) => () => void
    // Hands over what the command line left, once: the queue is emptied.
    takeLaunches: () => Promise<LaunchEvent[]>
    // Opens the folder of an open-folder event: switches the project if it differs, then makes a
    // new chat on the first provider that is signed in. Refused during a run.
    openLaunchFolder: (id: string) => Promise<LaunchOpenResult>
  }
  progression: {
    // The STATUS sheet's numbers for an agent file from the list.
    agentStats: (filePath: string) => Promise<ProgressionResult<{ stats: AgentStats }>>
    // Class and level per agent file in the party list, keyed by its filePath.
    agentsSummary: () => Promise<ProgressionResult<{ agents: Record<string, AgentProgress> }>>
    achievements: () => Promise<AchievementsData>
    // id null takes that kind off. Only an unlocked reward can be equipped.
    equip: (change: EquipChange) => Promise<{ ok: boolean }>
    markAchievementsSeen: () => Promise<void>
    onChanged: (callback: () => void) => () => void
    // An unlock while the app is in front: the toast shows it.
    onUnlocked: (callback: (notice: UnlockNotice) => void) => () => void
  }
  bosses: {
    // Every boss: the three built-in ones (their pictures are bundled with the window), then the
    // folders in userData/bosses, oldest first, each a pack or a problem. Always read from disk.
    list: () => Promise<BossesResult<{ bosses: BossListItem[] }>>
    // The idle strip is picked like a mascot sheet: a legal strip is used as it is, anything else
    // opens the slicer. Nothing is written until SAVE.
    pickIdle: () => Promise<PickSheetResult>
    sliceIdle: (
      sourceToken: string,
      columns: number,
      rows: number,
      cells: number[]
    ) => Promise<SliceSheetResult>
    // Drops every loaded source sheet and every pick that was not saved. Called when the editor
    // closes.
    dropSources: () => Promise<void>
    pickBackground: () => Promise<PickBackgroundResult>
    create: (draft: BossDraft) => Promise<BossesResult<{ id: string }>>
    update: (id: string, draft: BossDraft) => Promise<BossesResult<{ id: string }>>
    // The folder goes to the OS trash. The built-in bosses are refused.
    remove: (id: string) => Promise<BossesResult>
    // POOL ON or OFF. The last boss in the pool cannot leave it.
    setInPool: (id: string, on: boolean) => Promise<BossesResult<{ inPool: boolean }>>
    onChanged: (callback: () => void) => () => void
    // The open conversation's fight, and the ones it finished before.
    fight: () => Promise<BossFightData>
    onFight: (callback: (event: FightEvent) => void) => () => void
    // FIGHT ON: the boss that got away is active again. The window then sends the message.
    fightOn: () => Promise<{ ok: boolean }>
    // DISMISS on a defeated fight.
    dismiss: () => Promise<{ ok: boolean }>
    // The open project's own test command, '' for the usual runners.
    getTestCommand: () => Promise<string>
    setTestCommand: (command: string) => Promise<{ ok: boolean; command: string }>
  }
  providers: {
    status: (force?: boolean) => Promise<ProvidersStatusResult>
    loginOAuth: (provider: CliProviderId) => Promise<ProviderActionResult>
    cancelLogin: (provider: CliProviderId) => Promise<{ ok: boolean }>
    saveApiKey: (provider: CliProviderId, apiKey: string) => Promise<ProviderActionResult>
    logout: (provider: CliProviderId) => Promise<ProviderActionResult>
    // Runs npm install -g. Progress comes through onInstallProgress, and cancelInstall stops it.
    installCli: (provider: CliProviderId) => Promise<ProviderActionResult>
    cancelInstall: (provider: CliProviderId) => Promise<{ ok: boolean }>
    onInstallProgress: (callback: (progress: InstallProgress) => void) => () => void
  }
}

// key is null before the open project has a conversation.
export type BossFightData = { key: string | null; current: Fight | null; past: Fight[] }

export type EquipChange = { kind: RewardKind; id: string | null }

export type ProgressionResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: { message: string } }

export type CliProviderId = 'codex' | 'gemini'

export type ProviderAuthMethod = 'oauth' | 'api_key' | 'env' | null

export type ProviderAccountInfo = {
  name: string | null
  email: string | null
  plan: string | null
  organization: string | null
  activeUntil: string | null
}

export type ProviderStatus = {
  provider: CliProviderId
  installed: boolean
  version: string | null
  loggedIn: boolean
  method: ProviderAuthMethod
  // Masked API key, account email, or credential source description. Never a raw secret.
  detail: string | null
  account: ProviderAccountInfo | null
  // The key behind an API key or environment sign-in as the window may see it: the first 4 and
  // last 4 characters ("sk-a...9f2c"). The full key never crosses to the window.
  keyMask: string | null
  // The environment variable an environment key came from.
  envVar: string | null
  // Whether the CLI runs, is not on this computer, or is there and will not start.
  cli: 'ok' | 'missing' | 'broken'
}

// One line of an install as it goes, such as "npm: fetching packages".
export type InstallProgress = { provider: CliProviderId; stage: string }

export type ProvidersStatusResult = {
  codex: ProviderStatus
  gemini: ProviderStatus
}

export type ProviderActionResult =
  | { ok: true; status: ProvidersStatusResult }
  | {
      ok: false
      error: string
      // What kind of failure it was, for the card to show it in its own place.
      code?: ProviderErrorCode | null
      // An install that failed: npm's exit code, and the end of its output (COPY LOG).
      exitCode?: number | null
      log?: string | null
      status: ProvidersStatusResult
    }
