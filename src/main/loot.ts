// What a finished task changed, as "items obtained", built from its own tool calls.
// Pure apart from Node's path rules: no files are read and git is never run. Line
// counts come from the Edit and Write inputs, so they are close but not exact.

import { isAbsolute, relative, resolve, sep } from 'path'
import type { ToolState } from '../shared/ipc'
import type { LootItem, TaskLoot } from '../shared/progression'

// One tool call an agent made, as the task keeps it for the loot. The inputs
// themselves are not kept: only what the loot needs.
export type TaskCall = {
  toolId: string
  name: string
  // The file the call names, resolved against the project, or null.
  path: string | null
  added: number
  removed: number
  // For a Write: whether the file was there when the call started. null otherwise.
  existed: boolean | null
  state: ToolState
}

const EDITS = ['Edit', 'MultiEdit']

// Lines in a piece of text: split at newlines, one trailing newline ignored. Empty is 0.
export function lineCount(text: unknown): number {
  if (typeof text !== 'string' || text === '') return 0
  const lines = text.split(/\r\n|\r|\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines.length
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

// The file and the line counts of one call, from its full input.
export function callFacts(
  name: string,
  input: Record<string, unknown>,
  cwd: string
): { path: string | null; added: number; removed: number } {
  const file = str(input.file_path)
  const path = file === null ? null : resolve(cwd, file)
  if (name === 'Edit') {
    return { path, added: lineCount(input.new_string), removed: lineCount(input.old_string) }
  }
  if (name === 'MultiEdit') {
    let added = 0
    let removed = 0
    for (const edit of Array.isArray(input.edits) ? input.edits : []) {
      if (typeof edit !== 'object' || edit === null) continue
      added += lineCount((edit as Record<string, unknown>).new_string)
      removed += lineCount((edit as Record<string, unknown>).old_string)
    }
    return { path, added, removed }
  }
  if (name === 'Write') return { path, added: lineCount(input.content), removed: 0 }
  return { path, added: 0, removed: 0 }
}

export function changesFiles(name: string): boolean {
  return name === 'Write' || EDITS.includes(name)
}

// The same file whatever its case or slashes on Windows.
function keyOf(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

// Relative to the project when inside it, with forward slashes; otherwise as it is.
export function shownPath(path: string, projectPath: string): string {
  const rel = relative(projectPath, path)
  const inside = rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
  return inside ? rel.split(sep).join('/') : path
}

export function lootFor(calls: TaskCall[], projectPath: string): TaskLoot {
  const items = new Map<string, LootItem>()
  const found = new Map<string, string>()
  for (const call of calls) {
    // Denied, failed, and stopped calls changed nothing.
    if (call.state !== 'done' || call.path === null) continue
    const key = keyOf(call.path)
    if (call.name === 'Read') {
      if (!found.has(key)) found.set(key, shownPath(call.path, projectPath))
      continue
    }
    if (!changesFiles(call.name)) continue
    const item = items.get(key)
    if (item) {
      item.added += call.added
      item.removed += call.removed
    } else {
      items.set(key, {
        path: shownPath(call.path, projectPath),
        added: call.added,
        removed: call.removed,
        // New only when the first change is a Write to a file that was not there.
        isNew: call.name === 'Write' && call.existed === false
      })
    }
  }
  const list = [...items.values()]
  const reads = list.length === 0 ? [...found.values()] : []
  return {
    items: list,
    added: list.reduce((sum, item) => sum + item.added, 0),
    removed: list.reduce((sum, item) => sum + item.removed, 0),
    found: reads,
    foundCount: reads.length
  }
}

// No call failed and no request was denied.
export function isClean(calls: TaskCall[]): boolean {
  return !calls.some((call) => call.state === 'failed' || call.state === 'denied')
}
