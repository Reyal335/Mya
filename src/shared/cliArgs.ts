// The `mya` command's arguments, read one way everywhere: the app (main), mya-dev
// (scripts/mya-dev.mjs) and the texts baked into the shims (scripts/make-shims.mjs).
// Pure: no imports. Erasable TypeScript only (no enum, namespace, parameter properties):
// node runs this file straight from the scripts with type stripping.

export type ShimCommand =
  | { kind: 'open'; folder: string | null }
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string }

export const WSL_REFUSAL = 'Mya cannot open folders inside WSL. Use a folder under /mnt/c instead.'

// No < > | & ^ % ! " ( ) or ' : make-shims bakes these into cmd echo and sh printf lines.
export function usageLines(name: string): string[] {
  return [
    `Usage: ${name} [FOLDER]`,
    '',
    'Starts Mya, or brings it to the front.',
    'With a FOLDER, also starts a new chat in it. Use . for the folder you are in.',
    '',
    'Options:',
    '  --version  Print the version and exit.',
    '  --help     Print this help and exit.'
  ]
}
export const usageText = (name: string): string => usageLines(name).join('\n')
export const versionText = (version: string): string => `Mya ${version}`
export const unknownOptionText = (name: string, arg: string): string =>
  `${name}: unknown option "${arg}"`
export const tooManyText = (name: string): string => `${name}: give one folder at most`
export const notFolderText = (path: string): string => `Could not open ${path}. It is not a folder.`

// "C:\x\" reaches a Windows program as C:\x" (the backslash escapes the quote), sometimes
// with a trailing space. A bare drive "C:" would mean that drive's current folder: read it
// as the root.
export function cleanFolderArg(raw: string): string {
  const trimmed = raw.replace(/["\s]+$/, '')
  return /^[A-Za-z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed
}

// The shims' reading, strict. Same rules as mya.cmd and the sh script, in the same order:
// an empty argument is ignored; an unknown option fails at once; then more than one folder
// fails; then --help; then --version; else open. Options are case-sensitive.
export function parseShimArgs(args: readonly string[], name: string): ShimCommand {
  let help = false
  let version = false
  let count = 0
  let first: string | null = null
  for (const arg of args) {
    if (arg === '') continue
    if (arg === '--help') help = true
    else if (arg === '--version') version = true
    else if (arg.startsWith('-')) return { kind: 'error', message: unknownOptionText(name, arg) }
    else {
      count++
      if (first === null) first = arg
    }
  }
  if (count > 1) return { kind: 'error', message: tooManyText(name) }
  if (help) return { kind: 'help' }
  if (version) return { kind: 'version' }
  const folder = first === null ? '' : cleanFolderArg(first)
  return { kind: 'open', folder: folder === '' ? null : folder }
}

// The app's reading: Chromium/Electron switches (anything starting with '-') can legitimately
// be on its command line and are skipped. The first folder wins (the shims refused more).
export function appFolderArg(args: readonly string[]): string | null {
  for (const arg of args) {
    if (arg.startsWith('-')) continue
    const folder = cleanFolderArg(arg)
    if (folder !== '') return folder
  }
  return null
}

// What follows the program. In development (process.defaultApp) Electron's argv is
// [electron, ...switches, appPath, ...args]: skip leading switches, then the app path.
export function userArgs(argv: readonly string[], defaultApp: boolean): string[] {
  if (!defaultApp) return argv.slice(1)
  let i = 1
  while (i < argv.length && argv[i].startsWith('-')) i++
  return argv.slice(i + 1)
}
