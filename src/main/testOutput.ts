import { readFile, realpath, stat } from 'fs/promises'
import { homedir } from 'os'
import { isAbsolute, join, relative, resolve, sep } from 'path'

// A shell call's result, as the boss fight reads it: the output text and the exit code.
// Claude Code writes "Exit code N" as the first line of a failed command's result, and
// nothing for exit 0. Output over about 30 KB is replaced by a short preview of its start
// and the path of a file in Claude Code's own tool-results folder holding all of it: that
// file is read, and only that kind of file.

const MAX_SAVED_OUTPUT = 5 * 1024 * 1024
const EXIT_LINE = /^Exit code (\d+)\r?\n?/
const SAVED_AT = /Full output saved to: (.+?)\r?\n/

function claudeDir(): string {
  const configDir = process.env['CLAUDE_CONFIG_DIR']?.trim()
  return configDir ? resolve(configDir) : join(homedir(), '.claude')
}

function isInside(folder: string, path: string): boolean {
  const rel = relative(folder, path)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

// Only a file Claude Code saved itself: under <claude dir>/projects/, in a tool-results
// folder, at most 5 MB.
async function readSavedOutput(raw: string): Promise<string | null> {
  try {
    const path = await realpath(resolve(raw.trim()))
    const projects = await realpath(join(claudeDir(), 'projects'))
    if (!isInside(projects, path) || !path.split(sep).includes('tool-results')) return null
    const info = await stat(path)
    if (!info.isFile() || info.size > MAX_SAVED_OUTPUT) return null
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export type ShellResult = { output: string; exitCode: number }

// null when the call has no output to read: it was interrupted or went to the background.
export async function shellResult(
  text: string,
  isError: boolean,
  toolUseResult: unknown
): Promise<ShellResult | null> {
  const structured = (
    typeof toolUseResult === 'object' && toolUseResult !== null ? toolUseResult : {}
  ) as Record<string, unknown>
  if (structured.interrupted === true || typeof structured.backgroundTaskId === 'string')
    return null
  const exit = EXIT_LINE.exec(text)
  const exitCode = exit ? Number.parseInt(exit[1], 10) : isError ? 1 : 0
  let output = exit ? text.slice(exit[0].length) : text
  if (output.includes('<persisted-output>')) {
    const path =
      typeof structured.persistedOutputPath === 'string'
        ? structured.persistedOutputPath
        : (SAVED_AT.exec(output)?.[1] ?? null)
    const saved = path ? await readSavedOutput(path) : null
    // Without the file the preview is all there is; the parser never reads a missing
    // summary as zero failures.
    if (saved !== null) output = saved
  }
  return { output, exitCode }
}
