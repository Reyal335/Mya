// Boss battles for test runs: the fight as main keeps it and the window draws it, the
// pack format, and every message. All of it is cosmetic: a fight only reads test output
// the agent already produced, and never changes what an agent may do.

import { MAX_FRAMES, isValidFps } from './mascotRules.ts'
import type { TestRunner } from './testRuns'

export type FightStatus = 'active' | 'escaped' | 'defeated'

export const MAIN_MEMBER = 'main'

// A member of the lineup: an agent file path, 'main' (the main speaker, drawn with the
// mascot), or 'builtin:<name>' for a built-in agent such as general-purpose.
export type LineupMember = {
  id: string
  // The agent's name; empty for 'main' (the window names it after the mascot).
  name: string
  // 0 to 10. Each hit adds 1.
  energy: number
  // Cosmetic, 40 to 100 (percent). The active member loses 5 on each heal.
  health: number
  // Hits landed in this fight.
  hits: number
}

export type FightTest = { file: string | null; name: string | null }

export type FileState = {
  // The failing test names, or null when only a count is known.
  failing: string[] | null
  failedCount: number
  total: number | null
}

export type RoundKind = 'encounter' | 'round' | 'partial' | 'victory' | 'escape' | 'resume'

// One line of the fight, for the CHAT history: placed after the tool call (or the
// task) whose test run made it.
export type FightNotice = {
  kind: RoundKind
  line: string
  toolId: string | null
  taskId: string | null
  at: number
}

// The latest round, for the test log and the replay.
export type FightRound = {
  n: number
  kind: RoundKind
  attacker: string
  hits: FightTest[]
  heals: FightTest[]
  clearedFiles: string[]
  // Up to 20 still failing after the round, most failing file first.
  stillFailing: FightTest[]
  stillFailingCount: number
  hpBefore: number
  hpAfter: number
  // Files that broke this round, for "<Boss> healed <n>! <file> broke."
  brokenFiles: string[]
  passed: number | null
  total: number | null
}

export type Fight = {
  key: string
  projectPath: string
  sessionId: string
  bossId: string
  // The boss's name when the fight last spoke of it. A fight whose boss was deleted keeps
  // using it; an empty string means a fight saved before this was kept.
  bossName: string
  status: FightStatus
  maxHp: number
  hp: number
  startHp: number
  round: number
  runner: TestRunner
  // The command that started the fight: the same command again is a full run.
  command: string
  files: Record<string, FileState>
  lineup: LineupMember[]
  active: string
  log: string[]
  notices: FightNotice[]
  lastRound: FightRound | null
  startedAt: number
  endedAt: number | null
  finalHit: string | null
  xpAwarded: number
}

export type FightEvent = { key: string; fight: Fight | null; round: FightRound | null }

// --- Packs --------------------------------------------------------------------------
//
// A boss is a name, an accent color, one idle loop, and an optional background. Every effect
// (the white hit flash, the green heal tint, the defeat) is drawn by the window, the same for
// every boss, so a pack has no other strips.

export type BossLoop = { src: string; frames: number; fps: number }

// A pack as the window draws it. src values are asset URLs (defaults) or data URLs.
export type BossPack = {
  id: string
  name: string
  accent: string
  // The picture, or null: the battle uses plain navy.
  background: string | null
  idle: BossLoop
}

// The three packs that ship with the app (assets/bosses/<id>/). They cannot be edited or
// deleted. Their names and accents match their manifests (a test checks).
export const DEFAULT_BOSSES: { id: string; name: string; accent: string }[] = [
  { id: 'red-suite', name: 'The Red Suite', accent: '#F0706A' },
  { id: 'flaky-golem', name: 'The Flaky Golem', accent: '#B98CF0' },
  { id: 'null-wraith', name: 'The Null Wraith', accent: '#5BC0BE' }
]

// A fight whose boss is gone is drawn as this one.
export const FALLBACK_BOSS_ID = 'red-suite'

export function isBuiltInBoss(id: string): boolean {
  return DEFAULT_BOSSES.some((boss) => boss.id === id)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The only ids a pack folder can have: a UUID, or a built-in id. Checked before any path
// is built from one.
export function isBossId(value: unknown): value is string {
  return typeof value === 'string' && (UUID.test(value) || isBuiltInBoss(value))
}

export function isCustomBossId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

// What the window gets from main for each folder: a pack, or why a folder was refused.
// A built-in boss carries no pictures (idle and background are null): the window bundles
// them. `backgroundInfo` is what the editor's row says about the stored file.
export type BossBackgroundInfo = { file: string; width: number; height: number }

export type BossListItem =
  | {
      id: string
      name: string
      accent: string
      builtIn: boolean
      inPool: boolean
      problem: null
      idle: BossLoop | null
      // The stored strip's file name, for the editor's row (null for a built-in boss).
      idleFile: string | null
      background: string | null
      backgroundInfo: BossBackgroundInfo | null
      // A saved fight, in any project, was against this boss: deleting it changes how that fight
      // is drawn.
      inFight: boolean
    }
  | { id: string; builtIn: false; inPool: false; problem: string }

// --- Names, colors, and the manifest ---

export const BOSS_NAME_MAX = 24
// Pack format 1 allowed a longer name; such a pack still loads.
const BOSS_NAME_MAX_V1 = 32
export const DEFAULT_BOSS_FPS = 4
export const DEFAULT_BOSS_ACCENT = '#F0706A'
// The editor's swatches, in order.
export const BOSS_ACCENTS = [
  '#F0706A',
  '#F2B84B',
  '#6FCF7F',
  '#5BC0BE',
  '#B98CF0',
  '#F4A9C0',
  '#A9B6C6',
  '#F2F4F8'
] as const

export function isBossAccent(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

// A name as the editor and main both check it: 1 to 24 characters once trimmed.
export function bossNameError(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'Name is required.'
  if (trimmed.length > BOSS_NAME_MAX) return `Name must be at most ${BOSS_NAME_MAX} characters.`
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return 'Name cannot contain line breaks or tabs.'
  return null
}

type ManifestLoop = { file: string; frames: number; fps: number }

// Pack format 2, as manifest.json says it and as main writes it.
export type BossManifest = {
  version: 2
  name: string
  accent: string
  // A PNG or JPG file name in the pack's folder, or null for none.
  background: string | null
  idle: ManifestLoop
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const FILE_NAME = /^[\w.-]+\.(png|jpe?g)$/i

function readLoop(raw: unknown, wholeFps: boolean): ManifestLoop | string {
  if (!isRecord(raw)) return 'must be an object'
  const { file, frames, fps } = raw
  if (typeof file !== 'string' || !/^[\w.-]+\.png$/i.test(file)) return 'needs a PNG file name'
  if (
    typeof frames !== 'number' ||
    !Number.isInteger(frames) ||
    frames < 1 ||
    frames > MAX_FRAMES
  ) {
    return `frames must be a whole number from 1 to ${MAX_FRAMES}`
  }
  if (wholeFps) {
    if (!isValidFps(fps)) return 'fps must be a whole number from 1 to 30'
  } else if (typeof fps !== 'number' || !(fps > 0) || fps > 60) {
    return 'fps must be from 1 to 60'
  }
  return { file, frames, fps: fps as number }
}

export type ReadManifest =
  { ok: true; format: 1 | 2; manifest: BossManifest } | { ok: false; message: string }

// Checks a manifest's shape. The files themselves are checked by main.
//
// Format 2: { version: 2, name, accent, background (a file name or null), idle }. Format 1
// (the first boss packs): { version: 1, name, accent, background, states: { idle, ... } }.
// Only states.idle of a format 1 pack is used; its other states are ignored, not checked.
// The result is always the format 2 shape, so everything after reading treats them alike.
export function readBossManifest(raw: unknown): ReadManifest {
  if (!isRecord(raw)) return { ok: false, message: 'manifest.json is not an object.' }
  if (raw.version !== 1 && raw.version !== 2) {
    return { ok: false, message: 'manifest.json must have version 1 or 2.' }
  }
  const format = raw.version
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (format === 2) {
    const problem = typeof raw.name === 'string' ? bossNameError(raw.name) : 'Name is required.'
    if (problem) return { ok: false, message: problem }
  } else if (name === '' || name.length > BOSS_NAME_MAX_V1) {
    return { ok: false, message: `The name must be 1 to ${BOSS_NAME_MAX_V1} characters.` }
  }
  if (!isBossAccent(raw.accent)) {
    return { ok: false, message: 'The accent must be a color like #F0706A.' }
  }
  let background: string | null
  if (raw.background === null && format === 2) {
    background = null
  } else if (typeof raw.background === 'string' && FILE_NAME.test(raw.background)) {
    background = raw.background
  } else {
    return {
      ok: false,
      message:
        format === 2
          ? 'The background must be null or a PNG or JPG file name.'
          : 'The background must be a PNG or JPG file name.'
    }
  }

  let idleRaw: unknown
  if (format === 2) {
    idleRaw = raw.idle
    if (idleRaw === undefined) return { ok: false, message: 'The idle loop is required.' }
  } else {
    if (!isRecord(raw.states)) return { ok: false, message: 'states is missing.' }
    idleRaw = raw.states.idle
    if (idleRaw === undefined) return { ok: false, message: 'The idle state is required.' }
  }
  const idle = readLoop(idleRaw, format === 2)
  if (typeof idle === 'string') return { ok: false, message: `The idle loop ${idle}.` }
  return {
    ok: true,
    format,
    manifest: { version: 2, name, accent: raw.accent.toUpperCase(), background, idle }
  }
}

// The text main writes for a pack: format 2, in this order of keys.
export function bossManifestText(manifest: Omit<BossManifest, 'version'>): string {
  const { name, accent, background, idle } = manifest
  const text = { version: 2, name, accent, background, idle }
  return `${JSON.stringify(text, null, 2)}\n`
}

// --- The pool and a fight's boss ---

export const POOL_LAST_MESSAGE = 'At least one boss stays in the pool.'

// The bosses a new fight draws from: the valid ones in the pool, or every valid one when none
// is in the pool (a hand-edited settings file cannot leave a fight without a boss).
export function poolIds(valid: readonly string[], outOfPool: readonly string[]): string[] {
  const out = new Set(outOfPool)
  const inPool = valid.filter((id) => !out.has(id))
  return inPool.length > 0 ? inPool : [...valid]
}

// Whether `id` may leave the pool: some other valid boss has to stay in.
export function canLeavePool(
  valid: readonly string[],
  outOfPool: readonly string[],
  id: string
): boolean {
  const out = new Set(outOfPool)
  return valid.some((other) => other !== id && !out.has(other))
}

// The pack a saved fight is drawn with. A boss that no longer exists is drawn as The Red Suite
// (its sprite, accent, and background) under the name the fight saved; its HP, rounds, and log
// are untouched. Null only when even The Red Suite is missing.
export function fightPack(
  packs: readonly BossPack[],
  fight: Pick<Fight, 'bossId' | 'bossName'>
): BossPack | null {
  const found = packs.find((pack) => pack.id === fight.bossId)
  if (found) return found
  const fallback = packs.find((pack) => pack.id === FALLBACK_BOSS_ID)
  if (!fallback) return null
  return fight.bossName.trim() === '' ? fallback : { ...fallback, name: fight.bossName }
}

// --- Messages -------------------------------------------------------------------------

export const FIGHT_ON_MESSAGE = 'Keep going until all the tests pass.'

export const fightText = {
  appears: (boss: string, hp: number, maxHp: number): string =>
    `A wild ${boss} appears! ${hp} of ${maxHp} tests left.`,
  combo: (hits: number, hp: number, maxHp: number): string =>
    `${hits} hit combo! ${hp} of ${maxHp} tests left.`,
  healed: (boss: string, heals: number, file: string | null): string =>
    file ? `${boss} healed ${heals}! ${file} broke.` : `${boss} healed ${heals}!`,
  noChange: (hp: number): string => `No change. ${hp} tests still failing.`,
  partial: (passed: number, total: number): string =>
    `Partial run: ${passed} / ${total} passed. It counts once a full run confirms it.`,
  defeated: (boss: string, total: number): string =>
    `${boss} is defeated! All ${total} tests pass.`,
  escaped: (boss: string, hp: number): string => `${boss} got away. ${hp} tests still failing.`,
  back: (boss: string, hp: number, maxHp: number): string =>
    `${boss} is back! ${hp} of ${maxHp} tests left.`,
  noBoss: 'No boss yet. One appears when a test run fails.',
  testCommandHint: 'Leave empty to use the usual runners.'
}

// The XP for the final hit: maxHp x 5, at most 500.
export function bossXp(maxHp: number): number {
  return Math.min(500, Math.max(0, maxHp) * 5)
}

// The key of a conversation: the project path plus its Claude Code session id.
export function fightKey(projectPath: string, sessionId: string): string {
  return `${projectPath}\u0000${sessionId}`
}
