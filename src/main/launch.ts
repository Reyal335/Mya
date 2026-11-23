import { randomUUID } from 'crypto'
import { realpath, stat } from 'fs/promises'
import type { BrowserWindow, WebContents } from 'electron'
import { BUSY_MESSAGE } from '../shared/chats'
import { notFolderText } from '../shared/cliArgs'
import { IpcChannel, type LaunchEvent, type LaunchOpenResult } from '../shared/ipc'
import type { ProviderId } from '../shared/models'
import { isRunning } from './agent'
import { chatsCreate } from './chatActions'
import { launchFolder, samePath, type LaunchRequest } from './launchRules'
import { openProjectFolder } from './projectSwitch'
import { getProject } from './settings'
import { firstReadyProvider, signedIn } from './startChoice'

// The `mya` command's folder, from a start of Mya to the main window. Main works out what the
// command line asked and queues it; the window is poked and takes the queue (poke, then pull), so
// a window that is not ready yet, or one that remounts, can never lose or double an event.
// Nothing here trusts the window: a folder request is named by an id main made up and the
// folder behind it never comes back from the window.

const MAX_ANNOUNCED = 16
const MAX_ID = 64
// The chain handles one start at a time, so an await that never returns would stall every later
// one. A folder that does not answer (a dead network drive) and the sign-in check are bounded.
const FOLDER_TIMEOUT_MS = 5_000
const PROVIDER_TIMEOUT_MS = 30_000
const TIMED_OUT = Symbol('timed out')
const NOT_MADE = 'The chat could not be made.'

let mainWindow: BrowserWindow | null = null
// A raise that came before there was a window to raise.
let raiseWanted = false
// What the window has not taken yet, oldest first.
const pending: LaunchEvent[] = []
// Folder requests the window may still ask to open: id to the folder as main checked it.
const announced = new Map<string, string>()
// Announcing and opening, one at a time and in the order they arrived.
let chain: Promise<unknown> = Promise.resolve()

const log = (err: unknown): void =>
  console.error('[launch]', err instanceof Error ? err.message : err)

function liveWindow(): BrowserWindow | null {
  return mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow : null
}

const noAnswerText = (path: string): string => `Could not open ${path}. It did not answer in time.`

// The work's result, or TIMED_OUT when it takes longer than `ms`. The work itself is not stopped.
async function within<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms)
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

// Which providers are signed in, or null when that could not be found out in time.
async function providersReady(): Promise<Record<ProviderId, boolean> | null> {
  try {
    const ready = await within(signedIn(), PROVIDER_TIMEOUT_MS)
    return ready === TIMED_OUT ? null : ready
  } catch (err) {
    log(err)
    return null
  }
}

// The folder as it is written on disk (Windows keeps whatever case was typed otherwise). A
// junction, subst drive, or mapped drive resolves to some other path: it keeps the typed one.
async function canonicalFolder(path: string): Promise<string> {
  let real: string
  try {
    real = await realpath(path)
  } catch {
    return path
  }
  return samePath(real, path) ? real : path
}

// Same as popupWindow's OPEN: restored if minimized, then to the front.
function raise(): void {
  const window = liveWindow()
  if (!window) {
    raiseWanted = true
    return
  }
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function push(event: LaunchEvent): void {
  pending.push(event)
  const window = liveWindow()
  if (window && !window.webContents.isDestroyed()) window.webContents.send(IpcChannel.UiLaunch)
}

async function announce(request: LaunchRequest, wantRaise: boolean): Promise<void> {
  if (wantRaise) raise()
  const target = launchFolder(request)
  if (target === null) return
  const id = randomUUID()
  const isFolder = await within(isDirectory(target), FOLDER_TIMEOUT_MS)
  if (isFolder === TIMED_OUT) {
    push({ id, kind: 'notice', text: noAnswerText(target) })
    return
  }
  if (!isFolder) {
    push({ id, kind: 'notice', text: notFolderText(target) })
    return
  }
  if (isRunning()) {
    push({ id, kind: 'notice', text: BUSY_MESSAGE })
    return
  }
  // A folder that is slow to resolve is kept as it was typed, as one that cannot be resolved is.
  const resolved = await within(canonicalFolder(target), FOLDER_TIMEOUT_MS)
  const path = resolved === TIMED_OUT ? target : resolved
  announced.set(id, path)
  if (announced.size > MAX_ANNOUNCED) {
    const oldest = announced.keys().next()
    if (!oldest.done) announced.delete(oldest.value)
  }
  push({ id, kind: 'open-folder' })
}

function fail(message: string): LaunchOpenResult {
  return { ok: false, project: getProject(), projectChanged: false, error: { message } }
}

async function openFolder(rawId: unknown): Promise<LaunchOpenResult> {
  if (typeof rawId !== 'string' || rawId === '' || rawId.length > MAX_ID) {
    return fail('That is not a folder request.')
  }
  const path = announced.get(rawId)
  announced.delete(rawId)
  if (path === undefined) return fail('That folder request has expired.')
  const isFolder = await within(isDirectory(path), FOLDER_TIMEOUT_MS)
  if (isFolder === TIMED_OUT) return fail(noAnswerText(path))
  if (!isFolder) return fail(notFolderText(path))
  // The run belongs to the open project; it cannot change under it.
  if (isRunning()) return fail(BUSY_MESSAGE)

  // Who is signed in comes first. It can take seconds, and until main switches the project the
  // window and main must keep showing the same one.
  const ready = await providersReady()
  if (ready === null) return fail(NOT_MADE)
  // A run may have started while that was asked: it still belongs to the open project.
  if (isRunning()) return fail(BUSY_MESSAGE)

  const current = getProject()
  const changed = current === null || !samePath(current.path, path)
  try {
    const project = changed ? await openProjectFolder(path) : current
    const made = await chatsCreate(project.path, firstReadyProvider(ready), ready)
    if (!made.ok) {
      return { ok: false, project, projectChanged: changed, error: { message: made.error.message } }
    }
    return { ok: true, project, projectChanged: changed, created: made.created }
  } catch (err) {
    // The project may have switched before this: say so, so the window follows main.
    log(err)
    return {
      ok: false,
      project: getProject(),
      projectChanged: getProject() !== current,
      error: { message: NOT_MADE }
    }
  }
}

// The main window, made at start and again when macOS reopens one. Called once per window.
export function setLaunchWindow(window: BrowserWindow): void {
  mainWindow = window
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  if (raiseWanted) {
    raiseWanted = false
    window.once('ready-to-show', () => raise())
  }
}

// A start of Mya, with what it was asked. `raise` is for a second start: the one that is
// already running comes to the front. The first start shows its own window.
export function handleLaunch(request: LaunchRequest, wantRaise: boolean): void {
  chain = chain.then(() => announce(request, wantRaise)).catch(log)
}

// Hands the queue to the main window, once. Any other sender gets nothing.
export function takeLaunches(sender: WebContents): LaunchEvent[] {
  const window = liveWindow()
  if (!window || sender !== window.webContents) return []
  return pending.splice(0)
}

// OPEN for an open-folder event the window was told of. Refused for any other sender.
export function openLaunchFolder(sender: WebContents, rawId: unknown): Promise<LaunchOpenResult> {
  const window = liveWindow()
  if (!window || sender !== window.webContents) {
    return Promise.resolve(fail('That is not a folder request.'))
  }
  const result = chain.then(() => openFolder(rawId))
  chain = result.catch(log)
  return result
}
