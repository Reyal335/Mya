import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import {
  DEFAULT_BOSSES,
  FALLBACK_BOSS_ID,
  bossXp,
  fightKey,
  poolIds,
  type Fight,
  type FightEvent,
  type FightRound
} from '../shared/bosses'
import { callBlock, type GateAgent } from '../shared/agentGate'
import { IpcChannel, type BossFightData } from '../shared/ipc'
import { parseTestRun } from '../shared/testRuns'
import {
  applyRun,
  escapeFight,
  forgetConversation,
  pickBoss,
  resumeFight,
  startFight,
  type Attacker
} from './bossRules'
import { getChatSession, onSessionEnded } from './chats'
import { isObject, readJsonFile, serialQueue, setAside, writeJsonFile } from './jsonFile'
import { validBosses } from './bossPacks'
import { recordBossVictory } from './progressionStore'
import { getBossesOutOfPool } from './settings'

// Boss fights: one per conversation (project path plus session id), in
// userData/boss-fights.json as { version: 1, fights, past, lastBoss }. `past` keeps the
// fights a conversation already finished, so their notices and end cards stay in its
// history. A fight only reads test output the agent already produced.

const VERSION = 1
const PAST_PER_CONVERSATION = 5

type Store = {
  fights: Record<string, Fight>
  past: Record<string, Fight[]>
  // The boss of each project's last fight, so the next one differs.
  lastBoss: Record<string, string>
}

let store: Store | null = null
let loading: Promise<Store> | null = null
const queue = serialQueue()

function storePath(): string {
  return join(app.getPath('userData'), 'boss-fights.json')
}

// A saved fight is trusted for its shape only after these checks; a bad one is dropped.
function readFight(raw: unknown): Fight | null {
  if (!isObject(raw)) return null
  const ok =
    typeof raw.key === 'string' &&
    typeof raw.projectPath === 'string' &&
    typeof raw.sessionId === 'string' &&
    typeof raw.bossId === 'string' &&
    (raw.status === 'active' || raw.status === 'escaped' || raw.status === 'defeated') &&
    typeof raw.maxHp === 'number' &&
    typeof raw.hp === 'number' &&
    typeof raw.round === 'number' &&
    isObject(raw.files) &&
    Array.isArray(raw.lineup) &&
    Array.isArray(raw.log) &&
    Array.isArray(raw.notices)
  if (!ok) return null
  return {
    ...(raw as unknown as Fight),
    bossName: typeof raw.bossName === 'string' ? raw.bossName : ''
  }
}

function readStore(raw: unknown): Store | null {
  if (!isObject(raw) || raw.version !== VERSION) return null
  const fights: Record<string, Fight> = {}
  if (isObject(raw.fights)) {
    for (const [key, value] of Object.entries(raw.fights)) {
      const fight = readFight(value)
      if (fight) fights[key] = fight
    }
  }
  const past: Record<string, Fight[]> = {}
  if (isObject(raw.past)) {
    for (const [key, value] of Object.entries(raw.past)) {
      if (!Array.isArray(value)) continue
      past[key] = value.flatMap((entry) => {
        const fight = readFight(entry)
        return fight ? [fight] : []
      })
    }
  }
  const lastBoss: Record<string, string> = {}
  if (isObject(raw.lastBoss)) {
    for (const [key, value] of Object.entries(raw.lastBoss)) {
      if (typeof value === 'string') lastBoss[key] = value
    }
  }
  return { fights, past, lastBoss }
}

// A missing file starts empty. One that is not JSON, or not this shape, is kept aside as
// boss-fights.json.bad and the app starts empty.
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
      console.error('[bosses] Could not read boss-fights.json:', err)
    }
    store = loaded ?? { fights: {}, past: {}, lastBoss: {} }
    return store
  })()
  return loading
}

function save(): Promise<void> {
  const current = store ?? { fights: {}, past: {}, lastBoss: {} }
  const snapshot = { version: VERSION, ...current }
  return queue(async () => {
    try {
      await writeJsonFile(storePath(), snapshot)
    } catch (err) {
      console.error('[bosses] Could not save boss-fights.json:', err)
    }
  })
}

function send(event: FightEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IpcChannel.BossesFightEvent, event)
  }
}

// popupWindow shows a victory or an escape as a popup with the app in the background.
type EndListener = (end: { kind: 'victory' | 'escape'; text: string }) => void
let endListener: EndListener | null = null

export function onFightEnd(listener: EndListener | null): void {
  endListener = listener
}

function announceEnd(kind: 'victory' | 'escape', text: string): void {
  try {
    endListener?.({ kind, text })
  } catch (err) {
    console.error('[bosses] Could not show the end of a fight:', err)
  }
}

// --- Which boss ---------------------------------------------------------------------------

const FALLBACK_NAME =
  DEFAULT_BOSSES.find((boss) => boss.id === FALLBACK_BOSS_ID)?.name ?? 'The Boss'

// What a fight calls its boss: the boss's name now, or, once the boss has been deleted, the
// name the fight saved (the window draws it as The Red Suite).
async function bossNameFor(fight: Fight): Promise<string> {
  const known = (await validBosses()).find((boss) => boss.id === fight.bossId)
  return known?.name ?? (fight.bossName.trim() || FALLBACK_NAME)
}

// --- Test runs from the agent run --------------------------------------------------------

export type TestRunReport = {
  projectPath: string
  sessionId: string
  toolId: string
  taskId: string | null
  command: string
  output: string
  exitCode: number
  attacker: Attacker
  // The party at the start of the run, for the lineup.
  party: (GateAgent & { name: string })[]
}

function partyOf(agents: TestRunReport['party']): Attacker[] {
  return agents
    .filter((agent) => callBlock(agent, agents) === null)
    .map((agent) => ({ id: agent.filePath, name: agent.name }))
}

function archive(current: Store, fight: Fight): void {
  const list = current.past[fight.key] ?? []
  current.past[fight.key] = [...list, fight].slice(-PAST_PER_CONVERSATION)
}

async function victory(fight: Fight): Promise<Fight> {
  const agentFile = (id: string | null): string | null =>
    id !== null && id !== 'main' && !id.startsWith('builtin:') ? id : null
  const xp = await recordBossVictory({
    finalHit: agentFile(fight.finalHit),
    xp: bossXp(fight.maxHp),
    hitters: fight.lineup.filter((m) => m.hits > 0).flatMap((m) => agentFile(m.id) ?? [])
  })
  return { ...fight, xpAwarded: xp }
}

// A test run's result arrived. Starts a fight, or plays a round of the one going.
export async function recordTestRun(report: TestRunReport): Promise<void> {
  try {
    const current = await load()
    const key = fightKey(report.projectPath, report.sessionId)
    const run = parseTestRun(report.command, report.output, report.exitCode)
    const input = {
      run,
      command: report.command,
      exitCode: report.exitCode,
      attacker: report.attacker,
      toolId: report.toolId,
      taskId: report.taskId,
      at: Date.now()
    }
    console.log(
      `[bosses] test run: runner=${run.runner}, parsed=${run.parsed}, failed=${run.failed}, total=${run.total}, files=${run.files.length}`
    )
    const existing = current.fights[key]
    let result: { fight: Fight; round: FightRound } | null
    if (existing && existing.status !== 'defeated') {
      result = applyRun(existing, input, await bossNameFor(existing))
    } else {
      // The valid bosses that are in the pool, leaving out the project's last one when there is a
      // choice. When none is in the pool, every valid boss is.
      const valid = await validBosses()
      const bossId = pickBoss(
        poolIds(
          valid.map((boss) => boss.id),
          await getBossesOutOfPool()
        ),
        current.lastBoss[report.projectPath] ?? null,
        Math.random
      )
      if (!bossId) return
      result = startFight(
        {
          key,
          projectPath: report.projectPath,
          sessionId: report.sessionId,
          bossId,
          bossName: valid.find((boss) => boss.id === bossId)?.name ?? FALLBACK_NAME,
          party: partyOf(report.party)
        },
        input,
        Math.random
      )
      if (!result) return
      // A finished fight in the same conversation moves to its past.
      if (existing) archive(current, existing)
      current.lastBoss[report.projectPath] = bossId
    }
    let { fight } = result
    if (fight.status === 'defeated' && existing?.status !== 'defeated') {
      fight = await victory(fight)
      announceEnd('victory', fight.log[fight.log.length - 1] ?? '')
    }
    current.fights[key] = fight
    await save()
    send({ key, fight, round: result.round })
  } catch (err) {
    console.error('[bosses] Could not record a test run:', err)
  }
}

// The run ended (done, error, or STOP) with the fight still going: the boss gets away.
export async function runEnded(projectPath: string, sessionId: string | null): Promise<void> {
  if (!sessionId) return
  try {
    const current = await load()
    const key = fightKey(projectPath, sessionId)
    const fight = current.fights[key]
    if (!fight) return
    const escaped = escapeFight(fight, await bossNameFor(fight), Date.now())
    if (!escaped) return
    current.fights[key] = escaped
    await save()
    send({ key, fight: escaped, round: null })
    announceEnd('escape', escaped.log[escaped.log.length - 1] ?? '')
  } catch (err) {
    console.error('[bosses] Could not end a fight:', err)
  }
}

// NEW CHAT, a lost session, or a fresh-context restart: the fight ends without a result.
async function conversationEnded(projectPath: string, sessionId: string): Promise<void> {
  const current = await load()
  const key = fightKey(projectPath, sessionId)
  if (!current.fights[key] && !current.past[key]) return
  current.fights = forgetConversation(current.fights, key)
  delete current.past[key]
  await save()
  send({ key, fight: null, round: null })
}

export function watchConversations(): void {
  onSessionEnded((projectPath, sessionId) => {
    void conversationEnded(projectPath, sessionId).catch((err: unknown) =>
      console.error('[bosses] Could not forget a fight:', err)
    )
  })
}

// --- For the window ---------------------------------------------------------------------

async function openKey(projectPath: string | null): Promise<string | null> {
  if (!projectPath) return null
  const session = await getChatSession(projectPath)
  return session ? fightKey(projectPath, session) : null
}

// The open conversation's fight and the ones it finished before.
export async function fightFor(projectPath: string | null): Promise<BossFightData> {
  const key = await openKey(projectPath)
  if (!key) return { key: null, current: null, past: [] }
  const current = await load()
  return { key, current: current.fights[key] ?? null, past: current.past[key] ?? [] }
}

// FIGHT ON: the boss that got away is active again. The window then sends the message.
export async function fightOn(projectPath: string | null): Promise<{ ok: boolean }> {
  const key = await openKey(projectPath)
  if (!key) return { ok: false }
  const current = await load()
  const fight = current.fights[key]
  const resumed = fight ? resumeFight(fight) : null
  if (!resumed) return { ok: false }
  current.fights[key] = resumed
  await save()
  send({ key, fight: resumed, round: null })
  return { ok: true }
}

// DISMISS on a defeated fight: it leaves the BOSS tab. Its notices stay in the history.
export async function dismissFight(projectPath: string | null): Promise<{ ok: boolean }> {
  const key = await openKey(projectPath)
  if (!key) return { ok: false }
  const current = await load()
  const fight = current.fights[key]
  if (!fight || fight.status !== 'defeated') return { ok: false }
  archive(current, fight)
  delete current.fights[key]
  await save()
  send({ key, fight: null, round: null })
  return { ok: true }
}

// The id of every boss a saved fight was against: the manager warns before deleting one.
export async function bossIdsInFights(): Promise<Set<string>> {
  const current = await load()
  const ids = new Set<string>()
  for (const fight of Object.values(current.fights)) ids.add(fight.bossId)
  for (const list of Object.values(current.past)) for (const fight of list) ids.add(fight.bossId)
  return ids
}

export async function loadBosses(): Promise<void> {
  await load()
  // The custom packs are read once now; a fight uses what was read last.
  await validBosses()
}
