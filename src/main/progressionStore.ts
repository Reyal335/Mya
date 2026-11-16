import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import {
  ACHIEVEMENTS,
  achievementById,
  achievementForReward,
  type AchievementId,
  type AchievementsData,
  type Equipped,
  type RewardKind,
  type UnlockNotice
} from '../shared/achievements'
import { callBlock, type GateAgent } from '../shared/agentGate'
import { IpcChannel, type TaskEndStatus } from '../shared/ipc'
import {
  classFor,
  levelFor,
  xpFor,
  type AgentStats,
  type TaskLoot,
  type TaskXp
} from '../shared/progression'
import {
  applyProgressEvent,
  emptyBook,
  goalOf,
  type AchievementBook,
  type ProgressEvent,
  type StoredAchievement
} from './achievementRules'
import { isObject, readJsonFile, serialQueue, setAside, writeJsonFile } from './jsonFile'
import { isClean, type TaskCall } from './loot'
import { normalizePath } from './pathMap'

// Progression: XP per agent file, achievements, and what is equipped, in
// userData/progression.json as { version: 1, agents, achievements, equipped, counters }.
// Keyed by agent file path, normalized as the icon map does it. Nothing is ever
// written into agent files, and none of it changes what an agent may do.

const VERSION = 1

type AgentEntry = {
  xp: number
  questsByProject: Record<string, number>
  toolUse: Record<string, number>
  itemsTotal: number
  bossesDefeated: number
  joinedAt: number
}

type Store = {
  agents: Record<string, AgentEntry>
  book: AchievementBook
  equipped: Equipped
}

let store: Store | null = null
let loading: Promise<Store> | null = null
const queue = serialQueue()

function storePath(): string {
  return join(app.getPath('userData'), 'progression.json')
}

function emptyStore(): Store {
  return { agents: {}, book: emptyBook(), equipped: { title: null, accessory: null } }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function counts(raw: unknown): Record<string, number> {
  if (!isObject(raw)) return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) {
    const n = count(value)
    if (n > 0) out[key] = n
  }
  return out
}

function strings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : []
}

function readEntry(raw: unknown): AgentEntry | null {
  if (!isObject(raw)) return null
  return {
    xp: count(raw.xp),
    questsByProject: counts(raw.questsByProject),
    toolUse: counts(raw.toolUse),
    itemsTotal: count(raw.itemsTotal),
    bossesDefeated: count(raw.bossesDefeated),
    joinedAt: typeof raw.joinedAt === 'number' ? raw.joinedAt : Date.now()
  }
}

function readAchievement(raw: unknown): StoredAchievement | null {
  if (!isObject(raw)) return null
  return {
    unlockedAt: typeof raw.unlockedAt === 'number' ? raw.unlockedAt : null,
    progress: count(raw.progress),
    seen: raw.seen !== false
  }
}

function readEquipped(raw: unknown, book: AchievementBook): Equipped {
  const pick = (kind: RewardKind, value: unknown): string | null =>
    typeof value === 'string' && rewardUnlocked(book, kind, value) ? value : null
  if (!isObject(raw)) return { title: null, accessory: null }
  return { title: pick('title', raw.title), accessory: pick('accessory', raw.accessory) }
}

function rewardUnlocked(book: AchievementBook, kind: RewardKind, id: string): boolean {
  const def = achievementForReward(kind, id)
  return def !== undefined && (book.achievements[def.id]?.unlockedAt ?? null) !== null
}

function readStore(raw: unknown): Store | null {
  if (!isObject(raw) || raw.version !== VERSION) return null
  const agents: Record<string, AgentEntry> = {}
  if (isObject(raw.agents)) {
    for (const [key, value] of Object.entries(raw.agents)) {
      const entry = readEntry(value)
      if (entry) agents[key] = entry
    }
  }
  const book = emptyBook()
  if (isObject(raw.achievements)) {
    for (const def of ACHIEVEMENTS) {
      const entry = readAchievement(raw.achievements[def.id])
      if (entry) book.achievements[def.id] = entry
    }
  }
  if (isObject(raw.counters)) {
    book.counters = {
      streak: count(raw.counters.streak),
      day: typeof raw.counters.day === 'string' ? raw.counters.day : null,
      calledToday: strings(raw.counters.calledToday),
      runnable: strings(raw.counters.runnable)
    }
  }
  return { agents, book, equipped: readEquipped(raw.equipped, book) }
}

// Loads progression.json once. A missing file starts empty. A file that is not JSON,
// or not this shape, is kept aside as progression.json.bad and the app starts empty.
function load(): Promise<Store> {
  if (store) return Promise.resolve(store)
  loading ??= (async () => {
    let loaded: Store | null = null
    try {
      const raw = await readJsonFile(storePath())
      if (raw !== undefined) {
        loaded = readStore(raw)
        if (!loaded) await setAside(storePath())
      }
    } catch (err) {
      console.error('[progression] Could not read progression.json:', err)
    }
    store = loaded ?? emptyStore()
    return store
  })()
  return loading
}

export function loadProgression(): Promise<void> {
  return load().then(() => undefined)
}

function save(): Promise<void> {
  const current = store ?? emptyStore()
  const snapshot = {
    version: VERSION,
    agents: current.agents,
    achievements: current.book.achievements,
    equipped: current.equipped,
    counters: current.book.counters
  }
  return queue(async () => {
    try {
      await writeJsonFile(storePath(), snapshot)
    } catch (err) {
      console.error('[progression] Could not save progression.json:', err)
    }
  })
}

function notifyChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IpcChannel.ProgressionChanged)
  }
}

// popupWindow decides where an unlock shows: a popup in the background, a toast in front.
let unlockListener: ((notice: UnlockNotice) => void) | null = null

export function onUnlock(listener: ((notice: UnlockNotice) => void) | null): void {
  unlockListener = listener
}

function announce(ids: AchievementId[]): void {
  for (const id of ids) {
    const def = achievementById(id)
    if (!def) continue
    console.log(`[progression] Unlocked ${def.name}`)
    try {
      unlockListener?.({ id: def.id, name: def.name, reward: def.reward })
    } catch (err) {
      console.error('[progression] Could not show an unlock:', err)
    }
  }
}

// `changed` says the caller changed something else (an agent's XP) that must be saved.
async function apply(event: ProgressEvent, changed = false): Promise<void> {
  const current = await load()
  const { book, unlocked } = applyProgressEvent(current.book, event)
  // Nothing changed (a party list loaded again, the same as before): nothing is saved
  // or sent, so a window that reloads on a change does not start a loop.
  if (!changed && JSON.stringify(book) === JSON.stringify(current.book)) return
  current.book = book
  await save()
  notifyChanged()
  announce(unlocked)
}

// A progression failure never touches a run or a task.
async function safely<T>(what: string, work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work()
  } catch (err) {
    console.error(`[progression] ${what} failed:`, err)
    return fallback
  }
}

// --- Events from runs and tasks -----------------------------------------------

export type TaskEnd = {
  status: TaskEndStatus
  // The agent's file and its tools line, or null for a built-in agent.
  agent: { filePath: string; tools: string[] | null } | null
  projectPath: string
  calls: TaskCall[]
  loot: TaskLoot | null
  startedAt: number
  endedAt: number
}

// A task ended. Returns the XP it earned, or null: only an agent file's task that
// ended as done earns XP. Every task counts toward achievements.
export function recordTaskEnd(end: TaskEnd): Promise<TaskXp | null> {
  return safely(
    'Recording a task',
    async () => {
      const current = await load()
      let earned: TaskXp | null = null
      const clean = isClean(end.calls)
      if (end.status === 'done' && end.agent) {
        const key = normalizePath(end.agent.filePath)
        const entry: AgentEntry = current.agents[key] ?? {
          xp: 0,
          questsByProject: {},
          toolUse: {},
          itemsTotal: 0,
          bossesDefeated: 0,
          joinedAt: end.endedAt
        }
        const items = end.loot?.items.length ?? 0
        const gained = xpFor({ items, found: end.loot?.foundCount ?? 0, clean })
        const before = levelFor(entry.xp)
        entry.xp += gained.total
        const project = normalizePath(end.projectPath)
        entry.questsByProject[project] = (entry.questsByProject[project] ?? 0) + 1
        for (const call of end.calls) entry.toolUse[call.name] = (entry.toolUse[call.name] ?? 0) + 1
        entry.itemsTotal += items
        current.agents[key] = entry
        earned = {
          total: gained.total,
          lines: gained.lines,
          classId: classFor(end.agent.tools).id,
          before,
          after: levelFor(entry.xp)
        }
      }
      const itemsTotal = Object.values(current.agents).reduce((sum, a) => sum + a.itemsTotal, 0)
      await apply(
        {
          type: 'task_ended',
          status: end.status,
          clean,
          denied: end.calls.some((call) => call.state === 'denied'),
          startedAt: end.startedAt,
          at: end.endedAt,
          itemsTotal
        },
        earned !== null
      )
      return earned
    },
    null
  )
}

// The agents in the party that can be called now, as normalized paths.
function runnableKeys(agents: GateAgent[]): string[] {
  return agents
    .filter((agent) => callBlock(agent, agents) === null)
    .map((agent) => normalizePath(agent.filePath))
}

export function recordTaskStart(filePath: string | null, party: GateAgent[]): Promise<void> {
  return safely(
    'Recording a task start',
    () =>
      apply({
        type: 'task_started',
        agentKey: filePath === null ? null : normalizePath(filePath),
        runnable: runnableKeys(party),
        at: Date.now()
      }),
    undefined
  )
}

export function recordRunEnd(done: boolean): Promise<void> {
  return safely(
    'Recording a run end',
    () => apply({ type: 'run_ended', done, at: Date.now() }),
    undefined
  )
}

export function recordPartyLoaded(party: GateAgent[]): Promise<void> {
  return safely(
    'Recording the party',
    () =>
      apply({
        type: 'party_loaded',
        size: party.length,
        runnable: runnableKeys(party),
        at: Date.now()
      }),
    undefined
  )
}

// --- Agent files moving and going ------------------------------------------------

// The step 5 module moved an agent to the other scope: its XP goes with it.
export function moveProgress(fromPath: string, toPath: string): Promise<void> {
  return safely(
    'Moving progress',
    async () => {
      const current = await load()
      const from = normalizePath(fromPath)
      const to = normalizePath(toPath)
      if (from === to || !current.agents[from]) return
      current.agents[to] = current.agents[from]
      delete current.agents[from]
      await save()
      notifyChanged()
    },
    undefined
  )
}

export function forgetProgress(agentPath: string): Promise<void> {
  return safely(
    'Forgetting progress',
    async () => {
      const current = await load()
      const key = normalizePath(agentPath)
      if (!current.agents[key]) return
      delete current.agents[key]
      await save()
      notifyChanged()
    },
    undefined
  )
}

// --- Reads for the window ----------------------------------------------------------

export type ProgressAgent = { filePath: string; tools: string[] | null }

export async function progressOf(agent: ProgressAgent): Promise<AgentStats> {
  const current = await load()
  const entry = current.agents[normalizePath(agent.filePath)]
  const level = levelFor(entry?.xp ?? 0)
  const project = projectKey()
  const top = Object.entries(entry?.toolUse ?? {}).sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)
  )[0]
  return {
    classId: classFor(agent.tools).id,
    ...level,
    xp: entry?.xp ?? 0,
    questsTotal: Object.values(entry?.questsByProject ?? {}).reduce((sum, n) => sum + n, 0),
    questsHere: project ? (entry?.questsByProject[project] ?? 0) : 0,
    bossesDefeated: entry?.bossesDefeated ?? 0,
    topSkill: top ? { name: top[0], count: top[1] } : null,
    joinedAt: entry?.joinedAt ?? null
  }
}

let currentProject: () => string | null = () => null

// settings.ts owns the open project; main wires it in at startup.
export function useProjectFrom(get: () => string | null): void {
  currentProject = get
}

function projectKey(): string | null {
  const path = currentProject()
  return path ? normalizePath(path) : null
}

export async function achievementsData(): Promise<AchievementsData> {
  const current = await load()
  return {
    achievements: ACHIEVEMENTS.map((def) => {
      const stored = current.book.achievements[def.id]
      return {
        id: def.id,
        unlockedAt: stored?.unlockedAt ?? null,
        progress: stored?.progress ?? 0,
        goal: goalOf(def.id, current.book),
        seen: stored?.seen ?? true
      }
    }),
    equipped: { ...current.equipped }
  }
}

export async function equippedNow(): Promise<Equipped> {
  return { ...(await load()).equipped }
}

export async function markAllSeen(): Promise<void> {
  const current = await load()
  let changed = false
  for (const entry of Object.values(current.book.achievements)) {
    if (entry && !entry.seen) {
      entry.seen = true
      changed = true
    }
  }
  if (!changed) return
  await save()
  notifyChanged()
}

// Equips one unlocked reward of its kind, or takes that kind off with id null.
// Returns false for anything that is not an unlocked reward.
export async function equip(raw: unknown): Promise<boolean> {
  if (!isObject(raw)) return false
  const { kind, id } = raw
  if (kind !== 'title' && kind !== 'accessory') return false
  if (id !== null && typeof id !== 'string') return false
  const current = await load()
  if (id !== null && !rewardUnlocked(current.book, kind, id)) return false
  current.equipped = { ...current.equipped, [kind]: id }
  await save()
  notifyChanged()
  return true
}
