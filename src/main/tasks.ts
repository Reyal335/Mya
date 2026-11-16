import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import {
  IpcChannel,
  type AgentScope,
  type TaskActivity,
  type TaskAgent,
  type TaskDetail,
  type TaskEndStatus,
  type TaskStatus,
  type TasksResult,
  type TaskSummary,
  type ToolState
} from '../shared/ipc'
import { toPlainText } from '../shared/plainText'
import {
  CLASS_NAMES,
  type ClassId,
  type Level,
  type LootItem,
  type TaskLoot,
  type TaskXp,
  type XpLine
} from '../shared/progression'
import { labelText } from '../shared/toolLabel'
import { loadIcons } from './agentIcons'
import { loadRoles } from './agentRoles'
import { isObject, readJsonFile, serialQueue, writeJsonFile } from './jsonFile'
import { lootFor, type TaskCall } from './loot'
import { recordTaskEnd } from './progressionStore'

// Tasks: one Agent tool call each, kept in userData/tasks.json as
// { version: 1, tasks }. Main is the one source: the inbox lists what is here, and
// tasks:changed tells every window when something changed.

const VERSION = 1
const MAX_TEXT = 20_000
const MAX_ACTIVITY = 100
const MAX_PER_PROJECT = 200
const PREVIEW_LENGTH = 80
// Tool calls kept per task for its loot. Far above what a task makes.
const MAX_CALLS = 2_000
const NOTIFY_MS = 100
export const INTERRUPTED_REPORT = 'Interrupted when Mya closed.'

type StoredAgent = { name: string; scope: AgentScope | null; filePath: string | null }

type TaskRecord = {
  id: string
  projectPath: string
  sessionId: string | null
  agent: StoredAgent
  description: string
  prompt: string
  promptTruncated: boolean
  status: TaskStatus
  report: string | null
  reportTruncated: boolean
  activity: TaskActivity[]
  startedAt: number
  endedAt: number | null
  seen: boolean
  // The task's tool calls, for its loot. In memory only, while it runs.
  calls: TaskCall[]
  // Saved when the task ends as done, so its QUEST CLEAR card survives a restart.
  loot: TaskLoot | null
  xp: TaskXp | null
}

let tasks: TaskRecord[] | null = null
// Pending permission requests per task, in memory only: tool id and its label.
const pending = new Map<string, Map<string, string>>()
const queue = serialQueue()

function tasksPath(): string {
  return join(app.getPath('userData'), 'tasks.json')
}

function cut(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_TEXT
    ? { text: text.slice(0, MAX_TEXT), truncated: true }
    : { text, truncated: false }
}

const STATUSES: TaskStatus[] = ['running', 'waiting', 'done', 'error', 'stopped']
const TOOL_STATES: ToolState[] = ['running', 'waiting', 'done', 'failed', 'denied', 'stopped']

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readActivity(raw: unknown): TaskActivity[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!isObject(entry)) return []
    const { toolId, verb, target, state } = entry
    if (typeof toolId !== 'string' || typeof verb !== 'string') return []
    if (!TOOL_STATES.includes(state as ToolState)) return []
    return [{ toolId, verb, target: str(target), state: state as ToolState }]
  })
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function readLoot(raw: unknown): TaskLoot | null {
  if (!isObject(raw) || !Array.isArray(raw.items)) return null
  const items: LootItem[] = raw.items.flatMap((item) =>
    isObject(item) && typeof item.path === 'string'
      ? [
          {
            path: item.path,
            added: num(item.added),
            removed: num(item.removed),
            isNew: item.isNew === true
          }
        ]
      : []
  )
  const found = Array.isArray(raw.found)
    ? raw.found.filter((path): path is string => typeof path === 'string')
    : []
  return {
    items,
    added: num(raw.added),
    removed: num(raw.removed),
    found,
    foundCount: num(raw.foundCount) || found.length
  }
}

function readLevel(raw: unknown): Level | null {
  if (!isObject(raw) || typeof raw.level !== 'number') return null
  return { level: num(raw.level), intoLevel: num(raw.intoLevel), toNext: num(raw.toNext) }
}

function readXp(raw: unknown): TaskXp | null {
  if (!isObject(raw) || typeof raw.total !== 'number' || !Array.isArray(raw.lines)) return null
  const before = readLevel(raw.before)
  const after = readLevel(raw.after)
  if (!before || !after || typeof raw.classId !== 'string' || !(raw.classId in CLASS_NAMES)) {
    return null
  }
  const lines: XpLine[] = raw.lines.flatMap((line) =>
    isObject(line) && typeof line.label === 'string'
      ? [{ label: line.label, xp: num(line.xp) }]
      : []
  )
  return { total: num(raw.total), lines, classId: raw.classId as ClassId, before, after }
}

function readRecord(raw: unknown): TaskRecord | null {
  if (!isObject(raw) || !isObject(raw.agent)) return null
  const { id, projectPath, description, prompt, status, startedAt } = raw
  const name = str(raw.agent.name)
  if (
    typeof id !== 'string' ||
    typeof projectPath !== 'string' ||
    name === null ||
    typeof startedAt !== 'number' ||
    !STATUSES.includes(status as TaskStatus)
  ) {
    return null
  }
  const scope =
    raw.agent.scope === 'project' || raw.agent.scope === 'global' ? raw.agent.scope : null
  return {
    id,
    projectPath,
    sessionId: str(raw.sessionId),
    agent: { name, scope, filePath: str(raw.agent.filePath) },
    description: str(description) ?? '',
    prompt: str(prompt) ?? '',
    promptTruncated: raw.promptTruncated === true,
    status: status as TaskStatus,
    report: str(raw.report),
    reportTruncated: raw.reportTruncated === true,
    activity: readActivity(raw.activity),
    startedAt,
    endedAt: typeof raw.endedAt === 'number' ? raw.endedAt : null,
    seen: raw.seen === true,
    calls: [],
    loot: readLoot(raw.loot),
    xp: readXp(raw.xp)
  }
}

function save(): Promise<void> {
  // The calls are for the loot only and stay in memory.
  // An undefined field is left out of the JSON.
  const snapshot = {
    version: VERSION,
    tasks: (tasks ?? []).map((task) => ({ ...task, calls: undefined }))
  }
  return queue(async () => {
    try {
      await writeJsonFile(tasksPath(), snapshot)
    } catch (err) {
      console.error('[tasks] Could not save tasks.json:', err)
    }
  })
}

// Loads tasks.json once. A task saved as running or waiting was cut off when the
// app closed: it becomes stopped.
async function load(): Promise<TaskRecord[]> {
  if (tasks) return tasks
  let loaded: TaskRecord[] = []
  try {
    const raw = await readJsonFile(tasksPath())
    if (isObject(raw) && raw.version === VERSION && Array.isArray(raw.tasks)) {
      loaded = raw.tasks.flatMap((entry) => {
        const record = readRecord(entry)
        return record ? [record] : []
      })
    }
  } catch (err) {
    console.error('[tasks] Could not read tasks.json:', err)
  }
  if (tasks) return tasks
  let changed = false
  for (const task of loaded) {
    if (task.status === 'running' || task.status === 'waiting') {
      task.status = 'stopped'
      task.report = INTERRUPTED_REPORT
      task.reportTruncated = false
      task.endedAt ??= task.startedAt
      task.activity = task.activity.map((entry) =>
        entry.state === 'running' || entry.state === 'waiting'
          ? { ...entry, state: 'stopped' }
          : entry
      )
      changed = true
    }
  }
  tasks = loaded
  if (changed) await save()
  return tasks
}

// Called once at startup, so interrupted tasks are fixed before anything reads them.
export function loadTasks(): Promise<void> {
  return load().then(() => undefined)
}

let notifyTimer: ReturnType<typeof setTimeout> | null = null

function notify(): void {
  if (notifyTimer) return
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IpcChannel.TasksChanged)
    }
  }, NOTIFY_MS)
}

function find(id: string): TaskRecord | undefined {
  return tasks?.find((task) => task.id === id)
}

function oneLine(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH - 3)}...` : line
}

function preview(task: TaskRecord): string {
  const waiting = pending.get(task.id)
  if (task.status === 'waiting' && waiting && waiting.size > 0) {
    return oneLine(`Waiting: ${[...waiting.values()][0]}`)
  }
  if (task.status === 'running') {
    const latest = task.activity[task.activity.length - 1]
    return latest ? oneLine(labelText(latest)) : 'Starting...'
  }
  // A done report is Markdown: the preview is its plain text, harness note left out.
  if (task.status === 'done') return oneLine(toPlainText(task.report ?? ''))
  return oneLine(task.report ?? '')
}

type Look = (agent: StoredAgent) => Promise<TaskAgent>

// Icons and roles live in userData maps keyed by the agent file path.
async function agentLook(): Promise<Look> {
  const iconFor = await loadIcons()
  const roleFor = await loadRoles()
  return async (agent) => ({
    ...agent,
    icon: agent.filePath ? await iconFor(agent.filePath) : null,
    role: agent.filePath ? roleFor(agent.filePath) : null
  })
}

async function summary(task: TaskRecord, look: Look): Promise<TaskSummary> {
  return {
    id: task.id,
    agent: await look(task.agent),
    description: task.description,
    status: task.status,
    preview: preview(task),
    startedAt: task.startedAt,
    endedAt: task.endedAt,
    seen: task.seen,
    loot: task.loot,
    xp: task.xp
  }
}

// --- Changes from the agent run -------------------------------------------

export type NewTask = {
  id: string
  projectPath: string
  sessionId: string | null
  agent: StoredAgent
  description: string
  prompt: string
}

export async function startTask(input: NewTask): Promise<void> {
  const list = await load()
  if (find(input.id)) return
  const prompt = cut(input.prompt)
  list.push({
    ...input,
    prompt: prompt.text,
    promptTruncated: prompt.truncated,
    status: 'running',
    report: null,
    reportTruncated: false,
    activity: [],
    startedAt: Date.now(),
    endedAt: null,
    seen: false,
    calls: [],
    loot: null,
    xp: null
  })
  // Keep the newest tasks of each project. Running or waiting ones always stay.
  const mine = list
    .filter((task) => task.projectPath === input.projectPath)
    .sort((a, b) => b.startedAt - a.startedAt)
  const drop = new Set(
    mine
      .slice(MAX_PER_PROJECT)
      .filter((task) => task.status !== 'running' && task.status !== 'waiting')
      .map((task) => task.id)
  )
  if (drop.size > 0) tasks = list.filter((task) => !drop.has(task.id))
  await save()
  notify()
}

// Adds or updates one tool call in the task's activity. Not saved until the task ends.
export function taskActivity(
  taskId: string,
  toolId: string,
  label: { verb: string; target: string | null } | null,
  state: ToolState
): void {
  const task = find(taskId)
  if (!task) return
  const call = task.calls.find((entry) => entry.toolId === toolId)
  if (call) call.state = state
  const index = task.activity.findIndex((entry) => entry.toolId === toolId)
  if (index >= 0) {
    const entry = task.activity[index]
    task.activity[index] = { ...entry, ...(label ?? {}), state }
  } else {
    task.activity.push({ toolId, verb: label?.verb ?? '...', target: label?.target ?? null, state })
    if (task.activity.length > MAX_ACTIVITY)
      task.activity.splice(0, task.activity.length - MAX_ACTIVITY)
  }
  notify()
}

// A tool call inside the task, with what its loot needs. Its state follows taskActivity.
export function taskCall(taskId: string, call: TaskCall): void {
  const task = find(taskId)
  if (!task || task.calls.some((entry) => entry.toolId === call.toolId)) return
  if (task.calls.length < MAX_CALLS) task.calls.push({ ...call })
}

function refreshWaiting(task: TaskRecord): void {
  if (task.status !== 'running' && task.status !== 'waiting') return
  task.status = (pending.get(task.id)?.size ?? 0) > 0 ? 'waiting' : 'running'
}

// A permission request from inside the task, waiting for my answer.
export function taskRequestOpened(taskId: string, toolId: string, label: string): void {
  const task = find(taskId)
  if (!task) return
  const waiting = pending.get(taskId) ?? new Map<string, string>()
  waiting.set(toolId, label)
  pending.set(taskId, waiting)
  refreshWaiting(task)
  notify()
}

export function taskRequestClosed(taskId: string, toolId: string): void {
  const task = find(taskId)
  pending.get(taskId)?.delete(toolId)
  if (!task) return
  refreshWaiting(task)
  notify()
}

// The agent's file and its tools line, or null for a built-in agent. Only a file earns XP.
export type TaskAgentFile = { filePath: string; tools: string[] | null } | null

export async function endTask(
  taskId: string,
  status: TaskEndStatus,
  report: string | null,
  agentFile: TaskAgentFile = null
): Promise<{ loot: TaskLoot | null; xp: TaskXp | null }> {
  const task = find(taskId)
  if (!task) return { loot: null, xp: null }
  pending.delete(taskId)
  const text = report === null ? null : cut(report)
  task.status = status
  task.report = text?.text ?? task.report
  task.reportTruncated = text?.truncated ?? task.reportTruncated
  task.endedAt = Date.now()
  task.activity = task.activity.map((entry) =>
    entry.state === 'running' || entry.state === 'waiting' ? { ...entry, state: 'stopped' } : entry
  )
  // Loot and XP only for a task that ended as done. Nothing here can fail the task.
  task.loot = status === 'done' ? lootFor(task.calls, task.projectPath) : null
  task.xp = await recordTaskEnd({
    status,
    agent: agentFile,
    projectPath: task.projectPath,
    calls: task.calls,
    loot: task.loot,
    startedAt: task.startedAt,
    endedAt: task.endedAt
  })
  task.calls = []
  await save()
  notify()
  return { loot: task.loot, xp: task.xp }
}

export function isOpenTask(taskId: string): boolean {
  const status = find(taskId)?.status
  return status === 'running' || status === 'waiting'
}

// A saved task, for history loading: its agent, label, status, and report.
export async function savedTasks(
  ids: string[]
): Promise<Map<string, TaskSummary & { report: string | null }>> {
  await load()
  const look = await agentLook()
  const found = new Map<string, TaskSummary & { report: string | null }>()
  for (const id of ids) {
    const task = find(id)
    if (task) found.set(id, { ...(await summary(task, look)), report: task.report })
  }
  return found
}

// --- The inbox -----------------------------------------------------------

function knownId(raw: unknown): TaskRecord {
  const task = typeof raw === 'string' ? find(raw) : undefined
  if (!task) throw new TaskFailure('not_found', 'This task no longer exists.')
  return task
}

class TaskFailure extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid',
    message: string
  ) {
    super(message)
  }
}

async function guarded<T extends object>(work: () => Promise<T>): Promise<TasksResult<T>> {
  try {
    await load()
    return { ok: true, ...(await work()) }
  } catch (err) {
    if (err instanceof TaskFailure)
      return { ok: false, error: { code: err.code, message: err.message } }
    console.error('[tasks]', err)
    return { ok: false, error: { code: 'io_error', message: 'The tasks could not be read.' } }
  }
}

export function listTasks(
  projectPath: string | null
): Promise<TasksResult<{ tasks: TaskSummary[] }>> {
  return guarded(async () => {
    if (!projectPath) return { tasks: [] }
    const look = await agentLook()
    const mine = (tasks ?? [])
      .filter((task) => task.projectPath === projectPath)
      .sort((a, b) => b.startedAt - a.startedAt)
    const list: TaskSummary[] = []
    for (const task of mine) list.push(await summary(task, look))
    return { tasks: list }
  })
}

export function getTask(
  rawId: unknown,
  projectPath: string | null
): Promise<TasksResult<{ task: TaskDetail }>> {
  return guarded(async () => {
    const task = knownId(rawId)
    if (task.projectPath !== projectPath)
      throw new TaskFailure('not_found', 'This task is not in the open project.')
    const look = await agentLook()
    return {
      task: {
        ...(await summary(task, look)),
        prompt: task.prompt,
        promptTruncated: task.promptTruncated,
        report: task.report,
        reportTruncated: task.reportTruncated,
        activity: task.activity.map((entry) => ({ ...entry }))
      }
    }
  })
}

export function markTaskSeen(rawId: unknown): Promise<TasksResult> {
  return guarded(async () => {
    const task = knownId(rawId)
    if (!task.seen) {
      task.seen = true
      await save()
      notify()
    }
    return {}
  })
}

export function removeTask(rawId: unknown): Promise<TasksResult> {
  return guarded(async () => {
    const task = knownId(rawId)
    if (task.status === 'running' || task.status === 'waiting') {
      throw new TaskFailure('invalid', 'A running or waiting task cannot be deleted.')
    }
    tasks = (tasks ?? []).filter((entry) => entry.id !== task.id)
    await save()
    notify()
    return {}
  })
}

export function clearFinishedTasks(projectPath: string | null): Promise<TasksResult> {
  return guarded(async () => {
    if (!projectPath) return {}
    const before = tasks?.length ?? 0
    tasks = (tasks ?? []).filter(
      (task) =>
        task.projectPath !== projectPath || task.status === 'running' || task.status === 'waiting'
    )
    if (tasks.length !== before) {
      await save()
      notify()
    }
    return {}
  })
}
