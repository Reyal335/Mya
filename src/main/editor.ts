// Launching VS Code on a project folder, gated behind the OPEN IN EDITOR setting.
// Always spawned directly with an argv array, never through a shell, so a project
// path can never be read as a shell command.
import { spawn, spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'

// Same reasoning as sdk.ts's childEnv: never hand a child process a key that would
// switch billing to the API, and never let it think it is Electron's own Node.
function editorEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env['ELECTRON_RUN_AS_NODE']
  delete env['ANTHROPIC_API_KEY']
  delete env['ANTHROPIC_AUTH_TOKEN']
  return env
}

function launch(command: string, args: string[]): void {
  try {
    const child = spawn(command, args, {
      shell: false,
      detached: true,
      stdio: 'ignore',
      env: editorEnv()
    })
    child.unref()
  } catch (err) {
    console.error('Could not launch the editor:', err instanceof Error ? err.message : err)
  }
}

// Windows ships no fixed registry entry for VS Code, so check the two install
// locations the installer offers, then fall back to the `code` command on PATH
// (a .cmd shim in a `bin` folder next to the real Code.exe).
function findWindowsCodeExe(): string | null {
  const localAppData = process.env['LOCALAPPDATA']
  if (localAppData) {
    const candidate = join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe')
    if (existsSync(candidate)) return candidate
  }
  const programFiles = process.env['ProgramFiles']
  if (programFiles) {
    const candidate = join(programFiles, 'Microsoft VS Code', 'Code.exe')
    if (existsSync(candidate)) return candidate
  }
  try {
    const result = spawnSync('where', ['code'], { shell: false, encoding: 'utf8' })
    const line = result.stdout
      ?.split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry !== '')
    if (line) {
      // .../Microsoft VS Code/bin/code.cmd -> .../Microsoft VS Code/Code.exe
      const exe = join(dirname(dirname(line)), 'Code.exe')
      if (existsSync(exe)) return exe
    }
  } catch {
    // No PATH lookup available; give up below.
  }
  return null
}

export function openInEditor(path: string): void {
  if (process.platform === 'darwin') {
    launch('open', ['-a', 'Visual Studio Code', path])
    return
  }
  if (process.platform === 'linux') {
    launch('code', [path])
    return
  }
  if (process.platform === 'win32') {
    const exe = findWindowsCodeExe()
    if (!exe) {
      console.error('Could not find VS Code to open the project in.')
      return
    }
    launch(exe, [path])
    return
  }
  console.error(`Could not open the editor: unsupported platform "${process.platform}".`)
}
