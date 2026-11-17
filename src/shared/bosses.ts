// Boss battles for test runs: the fight as main keeps it and the window draws it, the
// pack format, and every message. All of it is cosmetic: a fight only reads test output
// the agent already produced, and never changes what an agent may do.

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

export const BOSS_STATES = ['idle', 'hit', 'heal', 'defeated'] as const
export type BossStateName = (typeof BOSS_STATES)[number]

export type BossLoop = { src: string; frames: number; fps: number }

// A pack as the window draws it. src values are asset URLs (defaults) or data URLs.
export type BossPack = {
  id: string
  name: string
  accent: string
  background: string
  states: { idle: BossLoop } & Partial<Record<Exclude<BossStateName, 'idle'>, BossLoop>>
}

// The three packs that ship with the app (assets/bosses/<id>/). They cannot be edited or
// deleted. Their names and accents match their manifests (a test checks).
export const DEFAULT_BOSSES: { id: string; name: string; accent: string }[] = [
  { id: 'red-suite', name: 'The Red Suite', accent: '#F0706A' },
  { id: 'flaky-golem', name: 'The Flaky Golem', accent: '#B98CF0' },
  { id: 'null-wraith', name: 'The Null Wraith', accent: '#5BC0BE' }
]

// Pack format v1, as manifest.json says it.
export type BossManifest = {
  version: 1
  name: string
  accent: string
  background: string
  states: { idle: ManifestLoop } & Partial<Record<Exclude<BossStateName, 'idle'>, ManifestLoop>>
}
type ManifestLoop = { file: string; frames: number; fps: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const FILE_NAME = /^[\w.-]+\.(png|jpe?g)$/i

function readLoop(raw: unknown): ManifestLoop | string {
  if (!isRecord(raw)) return 'must be an object'
  const { file, frames, fps } = raw
  if (typeof file !== 'string' || !/^[\w.-]+\.png$/i.test(file)) return 'needs a PNG file name'
  if (typeof frames !== 'number' || !Number.isInteger(frames) || frames < 1 || frames > 16) {
    return 'frames must be a whole number from 1 to 16'
  }
  if (typeof fps !== 'number' || !(fps > 0) || fps > 60) return 'fps must be from 1 to 60'
  return { file, frames, fps }
}

// Checks a manifest's shape. The files themselves are checked by main.
export function readBossManifest(
  raw: unknown
): { ok: true; manifest: BossManifest } | { ok: false; message: string } {
  if (!isRecord(raw)) return { ok: false, message: 'manifest.json is not an object.' }
  if (raw.version !== 1) return { ok: false, message: 'manifest.json must have version 1.' }
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name === '' || name.length > 32)
    return { ok: false, message: 'The name must be 1 to 32 characters.' }
  if (typeof raw.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.accent)) {
    return { ok: false, message: 'The accent must be a color like #F0706A.' }
  }
  if (typeof raw.background !== 'string' || !FILE_NAME.test(raw.background)) {
    return { ok: false, message: 'The background must be a PNG or JPG file name.' }
  }
  if (!isRecord(raw.states)) return { ok: false, message: 'states is missing.' }
  const states: Record<string, ManifestLoop> = {}
  for (const state of BOSS_STATES) {
    const value = raw.states[state]
    if (value === undefined) {
      if (state === 'idle') return { ok: false, message: 'The idle state is required.' }
      continue
    }
    const loop = readLoop(value)
    if (typeof loop === 'string') return { ok: false, message: `The ${state} state ${loop}.` }
    states[state] = loop
  }
  return {
    ok: true,
    manifest: {
      version: 1,
      name,
      accent: raw.accent.toUpperCase(),
      background: raw.background,
      states: states as BossManifest['states']
    }
  }
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
