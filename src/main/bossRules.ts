// The fight's rules, as pure functions: a test run in, the new fight and the round out.
// No files, no clock, and randomness is passed in, so every rule can be tested.

import {
  fightText,
  type Fight,
  type FightNotice,
  type FightRound,
  type FightTest,
  type FileState,
  type LineupMember,
  type RoundKind
} from '../shared/bosses.ts'
import type { TestRun } from '../shared/testRuns.ts'

export const LINEUP_SIZE = 4
export const FULL_ENERGY = 10
export const LOG_LINES = 100
export const MAX_NOTICES = 200
const HEALTH_FLOOR = 40
const HEALTH_PER_HEAL = 5
const STILL_FAILING = 20

export type Attacker = { id: string; name: string }

export type TestRunInput = {
  run: TestRun
  command: string
  exitCode: number
  attacker: Attacker
  toolId: string | null
  taskId: string | null
  at: number
}

// A number from 0 (inclusive) to 1 (exclusive), like Math.random.
export type Random = () => number

// The run says some tests fail: a count above 0, or a failing exit with nothing parsed.
export function runFails(run: TestRun, exitCode: number): boolean {
  if (run.parsed === 'exit-code') return exitCode !== 0
  return (run.failed ?? 0) > 0
}

function sameCommand(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, ' ') === b.trim().replace(/\s+/g, ' ')
}

// A full run: its total covers the whole suite, or it is the same command that started
// the fight with no extra path or filter arguments.
export function isFullRun(
  fight: Pick<Fight, 'maxHp' | 'command'>,
  run: TestRun,
  command: string
): boolean {
  if (run.total !== null && run.total >= fight.maxHp) return true
  return sameCommand(command, fight.command)
}

// The files a run speaks for, with their failing names (when every failure is named) or
// their counts. A count the files do not explain goes to the '' bucket.
export function filesOfRun(run: TestRun): Record<string, FileState> {
  const named = run.parsed === 'full'
  const files: Record<string, FileState> = {}
  for (const entry of run.files) {
    files[entry.file] = {
      failing: named ? [] : null,
      failedCount: entry.failed,
      total: entry.total
    }
  }
  for (const ref of run.failing) {
    const key = ref.file ?? ''
    files[key] ??= { failing: named ? [] : null, failedCount: 0, total: null }
    files[key].failing?.push(ref.name)
  }
  for (const state of Object.values(files)) {
    if (state.failing) state.failedCount = state.failing.length
  }
  const counted = Object.values(files).reduce((sum, s) => sum + s.failedCount, 0)
  const failed = run.failed ?? 0
  if (counted < failed) {
    const rest = files[''] ?? { failing: null, failedCount: 0, total: null }
    files[''] = { failing: null, failedCount: rest.failedCount + failed - counted, total: null }
  }
  return files
}

function hpOf(files: Record<string, FileState>): number {
  return Object.values(files).reduce((sum, s) => sum + s.failedCount, 0)
}

// Still failing after the round: most failing file first.
function stillFailing(files: Record<string, FileState>): { tests: FightTest[]; count: number } {
  const ordered = Object.entries(files)
    .filter(([, s]) => s.failedCount > 0)
    .sort((a, b) => b[1].failedCount - a[1].failedCount || a[0].localeCompare(b[0]))
  const tests: FightTest[] = []
  let count = 0
  for (const [file, state] of ordered) {
    count += state.failedCount
    const names = state.failing ?? []
    for (const name of names)
      if (tests.length < STILL_FAILING) tests.push({ file: file || null, name })
    for (let i = names.length; i < state.failedCount && tests.length < STILL_FAILING; i++) {
      tests.push({ file: file || null, name: null })
    }
  }
  return { tests, count }
}

function shuffle<T>(items: T[], random: Random): T[] {
  const list = [...items]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

function member(attacker: Attacker): LineupMember {
  return { id: attacker.id, name: attacker.name, energy: 0, health: 100, hits: 0 }
}

// The attacker, then up to 3 other runnable party agents at random.
export function pickLineup(attacker: Attacker, party: Attacker[], random: Random): LineupMember[] {
  const others = shuffle(
    party.filter((agent) => agent.id !== attacker.id),
    random
  ).slice(0, LINEUP_SIZE - 1)
  return [member(attacker), ...others.map(member)]
}

// A later round's attacker who is not in the lineup takes the place of the member with
// the least energy (or a free place).
export function withAttacker(lineup: LineupMember[], attacker: Attacker): LineupMember[] {
  if (lineup.some((m) => m.id === attacker.id)) return lineup
  if (lineup.length < LINEUP_SIZE) return [...lineup, member(attacker)]
  let weakest = 0
  lineup.forEach((m, i) => {
    if (m.energy < lineup[weakest].energy) weakest = i
  })
  return lineup.map((m, i) => (i === weakest ? member(attacker) : m))
}

// Picks a boss uniformly at random, leaving out the project's last one when there is a
// choice of at least two.
export function pickBoss(ids: string[], last: string | null, random: Random): string | null {
  if (ids.length === 0) return null
  const pool = ids.length >= 2 && last !== null ? ids.filter((id) => id !== last) : ids
  const from = pool.length > 0 ? pool : ids
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))]
}

function notice(
  input: Pick<TestRunInput, 'toolId' | 'taskId' | 'at'>,
  kind: RoundKind,
  line: string
): FightNotice {
  return { kind, line, toolId: input.toolId, taskId: input.taskId, at: input.at }
}

function withLines(fight: Fight, lines: string[], notices: FightNotice[]): Fight {
  return {
    ...fight,
    log: [...fight.log, ...lines].slice(-LOG_LINES),
    notices: [...fight.notices, ...notices].slice(-MAX_NOTICES)
  }
}

export type Encounter = {
  key: string
  projectPath: string
  sessionId: string
  bossId: string
  bossName: string
  party: Attacker[]
}

// The first failing test run in a conversation with no active fight.
export function startFight(
  encounter: Encounter,
  input: TestRunInput,
  random: Random
): { fight: Fight; round: FightRound } | null {
  const { run } = input
  if (!runFails(run, input.exitCode)) return null
  const files = filesOfRun(run)
  const hp = run.failed ?? Math.max(1, hpOf(files))
  const maxHp = Math.max(run.total ?? 0, hp)
  if (run.parsed === 'exit-code') files[''] = { failing: null, failedCount: hp, total: null }
  const still = stillFailing(files)
  const round: FightRound = {
    n: 1,
    kind: 'encounter',
    attacker: input.attacker.id,
    hits: [],
    heals: [],
    clearedFiles: [],
    stillFailing: still.tests,
    stillFailingCount: still.count,
    hpBefore: hp,
    hpAfter: hp,
    brokenFiles: [],
    passed: run.passed,
    total: run.total
  }
  const line = fightText.appears(encounter.bossName, hp, maxHp)
  const fight: Fight = {
    key: encounter.key,
    projectPath: encounter.projectPath,
    sessionId: encounter.sessionId,
    bossId: encounter.bossId,
    status: 'active',
    maxHp,
    hp,
    startHp: hp,
    round: 1,
    runner: run.runner,
    command: input.command,
    files,
    lineup: pickLineup(input.attacker, encounter.party, random),
    active: input.attacker.id,
    log: [line],
    notices: [notice(input, 'encounter', line)],
    lastRound: round,
    startedAt: input.at,
    endedAt: null,
    finalHit: null,
    xpAwarded: 0
  }
  return { fight, round }
}

function names(list: string[] | null): Set<string> {
  return new Set(list ?? [])
}

// One later test run: hits for tests that now pass, heals for tests that broke.
export function applyRun(
  saved: Fight,
  input: TestRunInput,
  bossName: string
): { fight: Fight; round: FightRound } {
  const { run } = input
  let fight: Fight = { ...saved, files: { ...saved.files } }
  const lines: string[] = []
  const notices: FightNotice[] = []
  // Any test run brings a boss that got away back.
  if (fight.status === 'escaped') {
    fight.status = 'active'
    const back = fightText.back(bossName, fight.hp, fight.maxHp)
    lines.push(back)
    notices.push(notice(input, 'resume', back))
  }
  const hpBefore = fight.hp
  const full = isFullRun(fight, run, input.command)
  const hits: FightTest[] = []
  const heals: FightTest[] = []
  const cleared: string[] = []
  const broken: string[] = []
  let kind: RoundKind = 'round'

  if (run.parsed === 'exit-code') {
    // Nothing parsed: no counts to score, so nothing changes.
  } else if (run.parsed === 'summary') {
    if (!full) {
      // Counts without every name, from part of the suite: nothing is confirmed yet.
      kind = 'partial'
    } else {
      // Summary on a full run: damage from the counts, no names.
      const failed = run.failed ?? 0
      for (let i = 0; i < Math.max(0, hpBefore - failed); i++) hits.push({ file: null, name: null })
      for (let i = 0; i < Math.max(0, failed - hpBefore); i++)
        heals.push({ file: null, name: null })
      // Counts with no file details that match what the fight knows say nothing new:
      // the named failing tests stay, so later named runs still score named hits.
      if (run.files.length > 0 || run.failing.length > 0 || failed !== hpBefore) {
        fight.files = filesOfRun(run)
      }
    }
  } else {
    // Every failure is named. A full run speaks for every file (one it does not list is
    // passing); a partial run only for the files in its output.
    const now = filesOfRun(run)
    const keys = full
      ? new Set([...Object.keys(fight.files), ...Object.keys(now)])
      : new Set(Object.keys(now))
    for (const key of keys) {
      // A file the fight has not seen failing had nothing failing: its list is empty.
      const before = fight.files[key] ?? { failing: [], failedCount: 0, total: null }
      const after = now[key] ?? { failing: [], failedCount: 0, total: before.total }
      const file = key || null
      if (before?.failing && after.failing) {
        const was = names(before.failing)
        const is = names(after.failing)
        for (const name of was) if (!is.has(name)) hits.push({ file, name })
        for (const name of is) if (!was.has(name)) heals.push({ file, name })
      } else {
        const diff = (before?.failedCount ?? 0) - after.failedCount
        for (let i = 0; i < diff; i++) hits.push({ file, name: null })
        for (let i = 0; i < -diff; i++) heals.push({ file, name: null })
      }
      if ((before?.failedCount ?? 0) > 0 && after.failedCount === 0 && file) cleared.push(file)
      if (file && !broken.includes(file) && heals.some((h) => h.file === file)) broken.push(file)
      if (after.failedCount > 0) fight.files[key] = after
      else delete fight.files[key]
    }
  }

  if (kind !== 'partial' && run.parsed !== 'exit-code') {
    // HP is every file's failing count; a full run's own count says the same.
    fight.hp = full && run.failed !== null ? run.failed : hpOf(fight.files)
    if (full && run.total !== null && run.total > fight.maxHp) fight.maxHp = run.total
  }
  fight.round += 1

  // The lineup: the attacker is active, earns energy for each hit, and the active member
  // loses cosmetic health for each heal.
  const lineup = withAttacker(fight.lineup, input.attacker).map((m) =>
    m.id === input.attacker.id
      ? {
          ...m,
          name: input.attacker.name || m.name,
          energy: Math.min(FULL_ENERGY, m.energy + hits.length),
          hits: m.hits + hits.length,
          health: Math.max(HEALTH_FLOOR, m.health - HEALTH_PER_HEAL * heals.length)
        }
      : m
  )
  fight.lineup = lineup
  fight.active = input.attacker.id

  const victory = full && run.failed === 0 && (run.total ?? 0) >= 1 && run.parsed !== 'exit-code'
  if (victory) {
    kind = 'victory'
    fight.hp = 0
    fight.status = 'defeated'
    fight.endedAt = input.at
    fight.finalHit = input.attacker.id
  }

  // What the history says about this round.
  let line: string
  if (kind === 'partial') {
    line =
      run.passed !== null && run.total !== null
        ? fightText.partial(run.passed, run.total)
        : fightText.noChange(fight.hp)
  } else if (victory) {
    line = fightText.defeated(bossName, run.total ?? 0)
  } else if (hits.length === 0 && heals.length === 0) {
    line = fightText.noChange(fight.hp)
  } else {
    const parts: string[] = []
    if (hits.length > 0) parts.push(fightText.combo(hits.length, fight.hp, fight.maxHp))
    if (heals.length > 0) {
      parts.push(fightText.healed(bossName, heals.length, broken[0] ?? null))
      if (hits.length === 0) parts.push(`${fight.hp} of ${fight.maxHp} tests left.`)
    }
    line = parts.join(' ')
  }
  lines.push(line)
  notices.push(notice(input, kind, line))

  const still = stillFailing(fight.files)
  const round: FightRound = {
    n: fight.round,
    kind,
    attacker: input.attacker.id,
    hits,
    heals,
    clearedFiles: cleared,
    stillFailing: victory ? [] : still.tests,
    stillFailingCount: victory ? 0 : still.count,
    hpBefore,
    hpAfter: fight.hp,
    brokenFiles: broken,
    passed: run.passed,
    total: run.total
  }
  if (victory) fight.files = {}
  fight.lastRound = round
  fight = withLines(fight, lines, notices)
  return { fight, round }
}

// The run ended with the fight still going: the boss gets away until the next test run
// or FIGHT ON.
export function escapeFight(saved: Fight, bossName: string, at: number): Fight | null {
  if (saved.status !== 'active' || saved.hp <= 0) return null
  const line = fightText.escaped(bossName, saved.hp)
  const fight: Fight = { ...saved, status: 'escaped', endedAt: at }
  const last = saved.notices[saved.notices.length - 1]
  return withLines(
    fight,
    [line],
    [{ kind: 'escape', line, toolId: last?.toolId ?? null, taskId: last?.taskId ?? null, at }]
  )
}

// NEW CHAT or a fresh-context restart: the conversation's fight ends without a result.
export function forgetConversation(
  fights: Record<string, Fight>,
  key: string
): Record<string, Fight> {
  const left = { ...fights }
  delete left[key]
  return left
}

// FIGHT ON: the same boss, HP, and lineup, active again.
export function resumeFight(saved: Fight): Fight | null {
  if (saved.status !== 'escaped') return null
  return { ...saved, status: 'active', endedAt: null }
}
