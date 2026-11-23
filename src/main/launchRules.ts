import { isAbsolute, resolve } from 'path'
import { appFolderArg, userArgs } from '../shared/cliArgs.ts'

// What a start of Mya was asked on its command line, read without Electron so it can be
// tested. launch.ts acts on it.

// The arguments after the program (Chromium switches included: appFolderArg skips them) and the
// folder the command was run in.
export type LaunchRequest = { args: string[]; cwd: string }

// What a second start hands to the first through the single-instance lock.
export type LaunchData = { mya: 1; args: string[]; cwd: string }

const MAX_ARGS = 64
const MAX_LENGTH = 32767

export function launchRequestOf(
  argv: readonly string[],
  defaultApp: boolean,
  cwd: string
): LaunchRequest {
  return { args: userArgs(argv, defaultApp), cwd }
}

export function launchDataOf(request: LaunchRequest): LaunchData {
  return { mya: 1, ...request }
}

// The lock's additionalData comes from another process: check its shape before using it.
export function readLaunchData(raw: unknown): LaunchRequest | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const data = raw as Record<string, unknown>
  if (data.mya !== 1) return null
  const { args, cwd } = data
  if (!Array.isArray(args) || args.length > MAX_ARGS) return null
  if (!args.every((arg) => typeof arg === 'string' && arg.length <= MAX_LENGTH)) return null
  if (typeof cwd !== 'string' || cwd === '' || cwd.length > MAX_LENGTH || !isAbsolute(cwd)) {
    return null
  }
  return { args: args as string[], cwd }
}

// The second start's request: what it sent with the lock, else the argv and working folder
// Electron gives the first (the switch it injects is skipped by appFolderArg anyway).
export function secondInstanceRequest(
  argv: readonly string[],
  workingDirectory: string,
  additionalData: unknown,
  defaultApp: boolean
): LaunchRequest {
  return (
    readLaunchData(additionalData) ?? {
      args: userArgs(argv, defaultApp),
      cwd: workingDirectory
    }
  )
}

// The folder to open, made absolute against the folder the command ran in, or null for none.
export function launchFolder(request: LaunchRequest): string | null {
  const raw = appFolderArg(request.args)
  return raw === null ? null : resolve(request.cwd, raw)
}

// The same folder, ignoring a trailing separator and, on Windows, case. Mirrors projectId in
// chatIndex.ts, so "same folder" here means "same project" there.
export function samePath(
  a: string,
  b: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const left = resolve(a)
  const right = resolve(b)
  return platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}
