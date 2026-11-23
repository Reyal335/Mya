#!/usr/bin/env node
// mya-dev: the mya command for the development build (npm link puts it on PATH). Starts
// `electron-vite dev` from the repo, detached, with the folder made absolute against the
// terminal's folder, and returns at once. Same arguments as mya (src/shared/cliArgs.ts).

import { spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const NAME = 'mya-dev'
// Through npm link's junction to the repo itself.
const repo = dirname(dirname(realpathSync(fileURLToPath(import.meta.url))))
// package.json has no "type", so Node warns that cliArgs.ts is reparsed as an ES module. That is
// expected here and four lines of noise after every launch; drop Node's warning printer.
process.removeAllListeners('warning')
const cli = await import(pathToFileURL(join(repo, 'src', 'shared', 'cliArgs.ts')).href)

const command = cli.parseShimArgs(process.argv.slice(2), NAME)
if (command.kind === 'error') {
  console.error(command.message)
  console.error(cli.usageText(NAME))
  process.exit(1)
}
if (command.kind === 'help') {
  console.log(cli.usageText(NAME))
  process.exit(0)
}
if (command.kind === 'version') {
  const { version } = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
  console.log(`${cli.versionText(version)} (dev)`)
  process.exit(0)
}

const viteBin = join(repo, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
if (!existsSync(viteBin)) {
  console.error(`${NAME}: electron-vite is not installed. Run npm install in ${repo}.`)
  process.exit(1)
}

const args = [viteBin, 'dev']
if (command.folder !== null) args.push('--', resolve(process.cwd(), command.folder))

// A leftover ELECTRON_RUN_AS_NODE would make electron run as plain node, not as the app.
const env = { ...process.env }
for (const key of Object.keys(env)) {
  if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key]
}

const log = join(tmpdir(), 'mya-dev.log')
const out = openSync(log, 'w')
const child = spawn(process.execPath, args, {
  cwd: repo,
  env,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', out, out]
})
child.unref()
closeSync(out)
console.log(`Starting Mya (development build). Output: ${log}`)
