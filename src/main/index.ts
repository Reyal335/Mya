import { app, shell, BrowserWindow } from 'electron'
import { dirname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startAccount } from './account'
import { appIcon, windowIconOptions } from './appIcon'
import { stopRun } from './agent'
import { handleLaunch, setLaunchWindow } from './launch'
import { launchDataOf, launchRequestOf, secondInstanceRequest } from './launchRules'
import { closePopups, setupPopups } from './popupWindow'
import { registerIpc } from './ipc'
import { prefetchModels } from './models'
import { getProvidersStatus } from './providerAuth'
import { getProject, loadProject } from './settings'
import { loadProgression, useProjectFrom } from './progressionStore'
import { loadBosses, watchConversations } from './bosses'
import { setFirstChatStart } from './chats'
import { firstChatStart } from './startChoice'
import { loadTasks } from './tasks'
import { loadUsage } from './usage'
import { watchWindow } from './windowControls'

// Matches --bg in the renderer tokens, so the window never flashes white on load.
const WINDOW_BACKGROUND = '#0B132B'

// The window's frame. The page draws its own title bar (TitleBar): on Windows and Linux
// there is no system frame and the bar has its own window buttons; on macOS the traffic
// lights stay, inset into the bar.
const frameOptions: Electron.BrowserWindowConstructorOptions =
  process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : { frame: false }

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Mya',
    backgroundColor: WINDOW_BACKGROUND,
    show: false,
    ...frameOptions,
    ...windowIconOptions,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Hide the default menu bar on Windows and Linux. macOS keeps its app menu.
  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false)
  }

  // The title bar redraws when the window is maximized, restored, focused, or blurred.
  watchWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // A run belongs to this window. Stop it when the window goes away. The popup
  // goes with it, so a hidden popup never keeps the app running.
  mainWindow.on('closed', () => {
    closePopups()
    stopRun()
  })

  // Links never open inside the app. An http or https link opens in the system
  // browser; any other kind is dropped.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isWebUrl(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Nothing may navigate the app window away from the app. A reload of the same
  // page (development) is allowed.
  mainWindow.webContents.on('will-navigate', (event) => {
    if (event.url === mainWindow.webContents.getURL()) return
    event.preventDefault()
    if (isWebUrl(event.url)) shell.openExternal(event.url)
  })

  // Load the dev server URL in development, the built file in production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}

// One Mya at a time. A second start (the mya command, the Start menu) hands its arguments and
// its folder to this one and quits.
const firstLaunch = launchRequestOf(process.argv, process.defaultApp === true, process.cwd())
if (!app.requestSingleInstanceLock(launchDataOf(firstLaunch))) {
  app.quit()
} else {
  // Packaged: do not hold the folder the command ran in open (Windows would refuse to delete or
  // rename it while Mya runs). The Start menu starts Mya in its own folder too. The folder was
  // read above and travels with the launch request.
  if (app.isPackaged) {
    try {
      process.chdir(dirname(process.execPath))
    } catch {
      // Keep the folder it started in.
    }
  }

  // Another start has something for this one. It may come before the window exists: the raise
  // then waits for the window, and what it asked is queued (see launch.ts).
  app.on('second-instance', (_event, argv, workingDirectory, additionalData) =>
    handleLaunch(
      secondInstanceRequest(argv, workingDirectory, additionalData, process.defaultApp === true),
      true
    )
  )

  app.whenReady().then(async () => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron.app')

    // A packaged macOS app gets its icon from the bundle; in development the dock
    // would otherwise show the default Electron icon.
    if (is.dev && process.platform === 'darwin') {
      app.dock?.setIcon(appIcon)
    }

    // F12 toggles DevTools in development; Ctrl/Cmd+R is ignored in production.
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    await loadProject()
    // Start loading the model list and provider login status now, so both are ready in
    // memory when the window opens.
    prefetchModels(getProject()?.path ?? null)
    void getProvidersStatus()
    // Tasks cut off when the app last closed become stopped before anything reads them.
    await loadTasks()
    // XP and achievements. A corrupt progression.json is kept aside and the app starts.
    useProjectFrom(() => getProject()?.path ?? null)
    await loadProgression()
    // Boss fights, and the user's boss packs (a broken pack is skipped and logged).
    await loadBosses()
    watchConversations()
    // A project with no chat yet makes its first chat on the first provider that is signed in.
    setFirstChatStart(firstChatStart)
    // The saved usage numbers come back first; the account is read on its own after that.
    await loadUsage()
    registerIpc()
    startAccount()
    const window = createWindow()
    setLaunchWindow(window)
    setupPopups(window)
    // What this start was asked, such as a folder. Its window shows itself; nothing is raised.
    handleLaunch(firstLaunch, false)

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        const reopened = createWindow()
        setLaunchWindow(reopened)
        setupPopups(reopened)
      }
    })
  })

  app.on('before-quit', () => {
    closePopups()
    stopRun()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
