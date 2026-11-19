// The popup window: one hidden, reused BrowserWindow in the bottom-right corner
// of the primary display. popups.ts decides what it shows; this file feeds it
// events, draws its view, runs its timers, and checks every act from the page.
import { randomUUID } from 'crypto'
import { join } from 'path'
import {
  BrowserWindow,
  ipcMain,
  screen,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { is } from '@electron-toolkit/utils'
import {
  IpcChannel,
  type AgentError,
  type PopupLoot,
  type PopupOpenTarget,
  type PopupView,
  type PopupWho,
  type TaskAgent
} from '../shared/ipc'
import type { UnlockNotice } from '../shared/achievements'
import type { ProviderId } from '../shared/models'
import type { TaskLoot, TaskXp } from '../shared/progression'
import { errorText } from '../shared/noticeText'
import { fitsPopup, popupDetailsHeight } from '../shared/popupFit'
import { toPlainText } from '../shared/plainText'
import { labelText, toolLabel } from '../shared/toolLabel'
import { answerPermission, watchRuns } from './agent'
import { getActiveMascot } from './mascots'
import { equip, equippedNow, onUnlock } from './progressionStore'
import { onFightEnd } from './bosses'
import { getPopups } from './settings'
import * as popups from './popups'

// The ISO time that starts every diagnostic log line.
const stamp = (): string => new Date().toISOString()

// The card is 340 wide like the mockup. The window is transparent and 6px larger
// each way for the card's hard shadow. Fixed heights per state, never measured.
const SHADOW = 6
const WIDTH = 340 + SHADOW
const NOTICE_HEIGHT = 168 + SHADOW
// An agent's finished task with its loot: two more lines under the mascot row.
const LOOT_HEIGHT = 234 + SHADOW
// An achievement: the mascot row and the EQUIP and LATER buttons, like a compact approval.
const ACHIEVEMENT_HEIGHT = 222 + SHADOW
const APPROVAL_HEIGHT = 222 + SHADOW
const DETAILS_HEIGHT = 420 + SHADOW
// Between the mascot row and the short details in a compact approval.
const DETAILS_GAP = 10
// From the right and bottom of the work area.
const EDGE = 16

const TEST_TEXT = 'This is what a popup looks like.'
const DONE_TEXT = 'Done.'
const TASK_ERROR_TEXT = 'The agent ended with an error.'

let mainWindow: BrowserWindow | null = null
let popup: BrowserWindow | null = null
let pageReady = false
let state = popups.initialState()
// The view last sent to the page, as JSON, so an unchanged view is not sent again.
let sentView: string | null = null
let timer: NodeJS.Timeout | null = null
let flashing = false
// Set when the main window goes, so the popup may really close.
let closing = false

function alive(window: BrowserWindow | null): window is BrowserWindow {
  return window !== null && !window.isDestroyed()
}

function heightOf(view: PopupView): number {
  if (view.kind === 'achievement') return ACHIEVEMENT_HEIGHT
  if (view.kind !== 'approval') return view.loot ? LOOT_HEIGHT : NOTICE_HEIGHT
  if (view.detailsOpen) return DETAILS_HEIGHT
  if (!view.fits) return APPROVAL_HEIGHT
  const { name, input, projectPath } = view.request
  return APPROVAL_HEIGHT + DETAILS_GAP + popupDetailsHeight(name, input, projectPath)
}

// Bottom-right of the primary display's work area. It grows upward: the bottom edge stays put.
function place(height: number): void {
  if (!alive(popup)) return
  const { workArea } = screen.getPrimaryDisplay()
  popup.setBounds({
    x: workArea.x + workArea.width - WIDTH - EDGE,
    y: workArea.y + workArea.height - height - EDGE,
    width: WIDTH,
    height
  })
}

function render(): void {
  const view = popups.viewOf(state)
  if (alive(popup) && pageReady) {
    const json = JSON.stringify(view)
    if (json !== sentView) {
      sentView = json
      popup.webContents.send(IpcChannel.PopupState, view)
    }
    if (view) {
      place(heightOf(view))
      // Never show() or focus(): the app I am working in keeps the keyboard.
      if (!popup.isVisible()) popup.showInactive()
    } else if (popup.isVisible()) {
      popup.hide()
    }
    console.log(
      `${stamp()} [popup] render: success, view=${JSON.stringify(view).substring(0, 100)}`
    )
  }

  const flash = popups.flashOf(state)
  if (flash !== flashing && alive(mainWindow)) {
    flashing = flash
    mainWindow.flashFrame(flash)
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = null
  const deadline = popups.deadlineOf(state)
  if (deadline === null || closing) return
  timer = setTimeout(() => dispatch({ type: 'timer' }), Math.max(0, deadline - Date.now()))
}

function dispatch(event: popups.PopupEvent): void {
  if (closing) return
  try {
    state = popups.step(state, event, Date.now())
    render()
    schedule()
    console.log(`${stamp()} [popup] dispatch: success`)
  } catch (err) {
    console.error(
      `${stamp()} [popup] dispatch failed: ${err instanceof Error ? err.message : String(err)}`
    )
    throw err
  }
}

function isBackground(): boolean {
  return !alive(mainWindow) || !mainWindow.isFocused() || mainWindow.isMinimized()
}

function whoOf(agent: TaskAgent | null): PopupWho {
  return agent ? { kind: 'agent', name: agent.name, icon: agent.icon } : { kind: 'speaker' }
}

// The first line of a reply or report, as plain text: no Markdown marks, no harness note.
function firstLine(text: string): string {
  return (
    toPlainText(text)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== '') ?? DONE_TEXT
  )
}

// The loot lines for a finished task's popup, or null when it changed and read nothing.
function popupLoot(loot: TaskLoot | null, xp: TaskXp | null): PopupLoot | null {
  if (!loot || (loot.items.length === 0 && loot.foundCount === 0 && !xp)) return null
  return {
    items: loot.items.length,
    added: loot.added,
    removed: loot.removed,
    found: loot.foundCount,
    first: loot.items.slice(0, 2).map((item) => ({ path: item.path, isNew: item.isNew })),
    xp: xp?.total ?? null,
    levelUp: xp !== null && xp.after.level > xp.before.level
  }
}

function runNotice(
  outcome: 'done' | AgentError,
  reply: string,
  chatId: string,
  provider: ProviderId
): popups.PopupNotice {
  // OPEN goes to the chat the run was in, which may no longer be the open one.
  return outcome === 'done'
    ? {
        id: randomUUID(),
        kind: 'finished',
        who: { kind: 'speaker' },
        text: firstLine(reply),
        open: { screen: 'chat', chatId },
        provider
      }
    : {
        id: randomUUID(),
        kind: 'error',
        who: { kind: 'speaker' },
        text: errorText(outcome),
        open: { screen: 'chat', chatId },
        provider
      }
}

function watch(): void {
  watchRuns({
    requestOpened: (request) => {
      // canShow is popups.ts's rule (enabled and background), worked out here from the state.
      const canShow = state.enabled && state.background
      const focused = alive(mainWindow) ? mainWindow.isFocused() : 'no window'
      console.log(
        `${stamp()} [popup] request_opened: agent=${request.agent?.name ?? 'claude'}, canShow=${canShow}, background=${state.background}, enabled=${state.enabled}, isFocused=${focused}, requests=${state.requests.length}`
      )
      dispatch({
        type: 'request_opened',
        request: {
          permissionId: request.permissionId,
          who: whoOf(request.agent),
          label: labelText(toolLabel(request.name, request.input, request.cwd)),
          name: request.name,
          input: request.input,
          truncated: request.truncated,
          projectPath: request.cwd,
          chatId: request.chatId,
          fits: fitsPopup(request.name, request.input, request.truncated, request.cwd)
        }
      })
    },
    requestClosed: (permissionId) => dispatch({ type: 'request_closed', permissionId }),
    taskEnded: (task) => {
      if (task.status === 'stopped') return
      const done = task.status === 'done'
      dispatch({
        type: 'task_ended',
        runId: task.runId,
        notice: {
          id: randomUUID(),
          kind: done ? 'finished' : 'error',
          who: whoOf(task.agent),
          text: done ? firstLine(task.report) : task.report.trim() || TASK_ERROR_TEXT,
          open: done
            ? { screen: 'inbox', taskId: task.taskId }
            : { screen: 'chat', chatId: task.chatId },
          loot: done ? popupLoot(task.loot, task.xp) : null,
          provider: task.provider
        }
      })
    },
    runEnded: (run) =>
      dispatch({
        type: 'run_ended',
        runId: run.runId,
        notice:
          run.outcome === 'stopped'
            ? null
            : runNotice(run.outcome, run.reply, run.chatId, run.provider)
      })
  })
}

// --- Acts from the popup page ------------------------------------------------

function fromPopup(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return alive(popup) && event.sender === popup.webContents
}

// OPEN: the main window to the front, restored if minimized, on the right screen.
function openMain(target: PopupOpenTarget): void {
  if (!alive(mainWindow)) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send(IpcChannel.UiOpen, target)
}

function act(id: string, action: string): boolean {
  switch (action) {
    case 'approve':
    case 'deny':
      // The same answer as the main window's buttons: permission_resolved reaches
      // the main window, and the watcher closes this popup.
      return answerPermission(id, action)
    case 'details':
    case 'dismiss':
      dispatch({ type: 'act', id, action })
      return true
    case 'equip': {
      // EQUIP: the achievement's reward goes on, and the popup closes.
      const shown = state.shown
      if (shown?.kind === 'notice' && shown.notice.kind === 'achievement') {
        const { reward } = shown.notice
        void equip({ kind: reward.kind, id: reward.id })
      }
      dispatch({ type: 'act', id, action })
      return true
    }
    case 'open': {
      const target = popups.openTargetOf(state)
      openMain(target)
      // The main window is coming to the front: hide now rather than wait for its focus event.
      dispatch({ type: 'background', background: false })
      dispatch({ type: 'act', id, action })
      return true
    }
    default:
      return false
  }
}

function registerPopupIpc(): void {
  ipcMain.handle(IpcChannel.PopupGetState, (event) =>
    fromPopup(event) ? popups.viewOf(state) : null
  )
  ipcMain.handle(IpcChannel.PopupGetMascot, (event) =>
    fromPopup(event)
      ? getActiveMascot()
      : { ok: false, error: { code: 'invalid', message: 'Only the popup asks for this.' } }
  )
  // Main checks every act: the id must be the popup on screen now, and the action
  // one it offers. APPROVE is refused until the whole request has been shown.
  ipcMain.handle(IpcChannel.PopupAct, (event, id: unknown, action: unknown) => {
    if (!fromPopup(event) || !popups.actAllowed(state, id, action)) return { ok: false }
    return { ok: act(id as string, action as string) }
  })
  ipcMain.handle(IpcChannel.PopupGetEquipped, (event) =>
    fromPopup(event) ? equippedNow() : { title: null, accessory: null }
  )
  ipcMain.on(IpcChannel.PopupHover, (event, over: unknown) => {
    if (fromPopup(event) && typeof over === 'boolean') dispatch({ type: 'hover', over })
  })
}

// --- Achievements ----------------------------------------------------------------

// An unlock shows as a popup with the app in the background (popups on), queued like a
// finished popup. With the app in front, the main window shows it as a toast.
function showUnlock(notice: UnlockNotice): void {
  if (state.enabled && state.background) {
    dispatch({
      type: 'achievement',
      notice: {
        id: randomUUID(),
        kind: 'achievement',
        name: notice.name,
        reward: notice.reward,
        open: { screen: 'chat' }
      }
    })
  } else if (alive(mainWindow) && !state.background) {
    mainWindow.webContents.send(IpcChannel.ProgressionUnlocked, notice)
  }
}

// --- Setting and TEST POPUP ----------------------------------------------------

export function setPopupsEnabled(on: boolean): void {
  dispatch({ type: 'enabled', enabled: on })
}

export function showTestPopup(): void {
  dispatch({
    type: 'test',
    notice: {
      id: randomUUID(),
      kind: 'finished',
      who: { kind: 'speaker' },
      text: TEST_TEXT,
      open: { screen: 'chat' }
    }
  })
}

// --- The window ------------------------------------------------------------------

function createPopupWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WIDTH,
    height: NOTICE_HEIGHT,
    show: false,
    frame: false,
    // The card draws its own hard shadow; the corners around it stay see-through.
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Mya',
    webPreferences: {
      preload: join(__dirname, '../preload/popup.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  window.setMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  // Alt+F4 on the popup: it only closes with the main window. A finished or error
  // popup counts as dismissed; a request stays until it is answered.
  window.on('close', (event) => {
    if (closing) return
    event.preventDefault()
    const view = popups.viewOf(state)
    if (view && view.kind !== 'approval') dispatch({ type: 'act', id: view.id, action: 'dismiss' })
  })
  window.webContents.on('did-finish-load', () => {
    pageReady = true
    sentView = null
    render()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/popup.html`)
  } else {
    window.loadFile(join(__dirname, '../renderer/popup.html'))
  }
  return window
}

let ipcRegistered = false

function onDisplaysChanged(): void {
  const view = popups.viewOf(state)
  if (view) place(heightOf(view))
}

// Made hidden with the main window, and closed with it.
export function setupPopups(main: BrowserWindow): void {
  mainWindow = main
  closing = false
  state = popups.initialState()
  popup = createPopupWindow()
  if (!ipcRegistered) {
    registerPopupIpc()
    ipcRegistered = true
  }
  watch()
  onUnlock(showUnlock)
  // A boss defeated or got away: a finished or error popup, with the app in the background.
  onFightEnd((end) =>
    dispatch({
      type: 'fight_ended',
      notice: {
        id: randomUUID(),
        kind: end.kind === 'victory' ? 'finished' : 'error',
        who: { kind: 'speaker' },
        text: end.text,
        open: end.chatId ? { screen: 'chat', chatId: end.chatId } : { screen: 'chat' }
      }
    })
  )

  const update = (): void => dispatch({ type: 'background', background: isBackground() })
  main.on('focus', update)
  main.on('blur', update)
  main.on('minimize', update)
  main.on('restore', update)
  main.on('show', update)
  main.on('hide', update)
  screen.on('display-metrics-changed', onDisplaysChanged)
  screen.on('display-added', onDisplaysChanged)
  screen.on('display-removed', onDisplaysChanged)

  getPopups()
    .then((on) => dispatch({ type: 'enabled', enabled: on }))
    .catch((err: unknown) => console.error(`${stamp()} Could not read the popups setting:`, err))
}

// The main window is gone: the popup goes with it, so nothing keeps the app running.
export function closePopups(): void {
  closing = true
  watchRuns(null)
  onUnlock(null)
  onFightEnd(null)
  if (timer) clearTimeout(timer)
  timer = null
  screen.off('display-metrics-changed', onDisplaysChanged)
  screen.off('display-added', onDisplaysChanged)
  screen.off('display-removed', onDisplaysChanged)
  if (alive(popup)) popup.destroy()
  popup = null
  pageReady = false
  sentView = null
  mainWindow = null
  flashing = false
}
