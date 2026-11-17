// When each achievement unlocks, as a pure function: the saved book and one event in,
// the new book and the ids just unlocked out. No files and no clock of its own, so
// every trigger can be tested with fake events. Unlocks are never taken back.

import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements.ts'
import type { TaskEndStatus } from '../shared/ipc'

export const NIGHT_FROM_HOUR = 2
export const NIGHT_TO_HOUR = 4
export const SPEEDRUN_MS = 30_000

export type StoredAchievement = {
  unlockedAt: number | null
  progress: number
  // Set false at unlock; true once the ACHIEVEMENTS screen has been opened.
  seen: boolean
}

export type Counters = {
  // Tasks in a row that ended as done with the clean bonus.
  streak: number
  // The local day calledToday belongs to, as YYYY-MM-DD.
  day: string | null
  // Agent files with a task started today (normalized paths).
  calledToday: string[]
  // The agents in the party that can be called, as last seen (normalized paths).
  runnable: string[]
}

export type AchievementBook = {
  achievements: Partial<Record<AchievementId, StoredAchievement>>
  counters: Counters
}

export type ProgressEvent =
  | {
      type: 'task_ended'
      status: TaskEndStatus
      // No tool call failed and no request was denied.
      clean: boolean
      // At least one request was denied.
      denied: boolean
      startedAt: number
      at: number
      // Changed files over all agents, after this task.
      itemsTotal: number
    }
  | { type: 'run_ended'; done: boolean; at: number }
  // A task started for an agent file (null for a built-in agent).
  | { type: 'task_started'; agentKey: string | null; runnable: string[]; at: number }
  | { type: 'party_loaded'; size: number; runnable: string[]; at: number }
  // Step 18.
  | { type: 'boss_defeated'; at: number }

export function emptyBook(): AchievementBook {
  return {
    achievements: {},
    counters: { streak: 0, day: null, calledToday: [], runnable: [] }
  }
}

export function localDay(at: number): string {
  const date = new Date(at)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function atNight(at: number): boolean {
  const hour = new Date(at).getHours()
  return hour >= NIGHT_FROM_HOUR && hour <= NIGHT_TO_HOUR
}

export function goalOf(id: AchievementId, book: AchievementBook): number {
  const def = ACHIEVEMENTS.find((entry) => entry.id === id)
  const base = def?.goal ?? 1
  if (id === 'full-party') return Math.max(base, book.counters.runnable.length)
  return base
}

function copy(book: AchievementBook): AchievementBook {
  const achievements: AchievementBook['achievements'] = {}
  for (const [id, entry] of Object.entries(book.achievements)) {
    if (entry) achievements[id as AchievementId] = { ...entry }
  }
  return {
    achievements,
    counters: {
      ...book.counters,
      calledToday: [...book.counters.calledToday],
      runnable: [...book.counters.runnable]
    }
  }
}

export function applyProgressEvent(
  saved: AchievementBook,
  event: ProgressEvent
): { book: AchievementBook; unlocked: AchievementId[] } {
  const book = copy(saved)
  const unlocked: AchievementId[] = []
  const counters = book.counters

  const entry = (id: AchievementId): StoredAchievement => {
    const existing = book.achievements[id]
    if (existing) return existing
    const made: StoredAchievement = { unlockedAt: null, progress: 0, seen: true }
    book.achievements[id] = made
    return made
  }
  // Progress only moves while locked; it stops at the goal.
  const progress = (id: AchievementId, value: number): void => {
    const target = entry(id)
    if (target.unlockedAt === null) target.progress = Math.max(0, Math.min(value, goalOf(id, book)))
  }
  const unlock = (id: AchievementId): void => {
    const target = entry(id)
    if (target.unlockedAt !== null) return
    target.unlockedAt = event.at
    target.progress = goalOf(id, book)
    target.seen = false
    unlocked.push(id)
  }

  // A new local day starts FULL PARTY over.
  const day = localDay(event.at)
  if (counters.day !== day) {
    counters.day = day
    counters.calledToday = []
  }

  switch (event.type) {
    case 'task_ended': {
      if (event.status === 'stopped') break
      const done = event.status === 'done'
      counters.streak = done && event.clean ? counters.streak + 1 : 0
      progress('flawless', counters.streak)
      if (counters.streak >= goalOf('flawless', book)) unlock('flawless')
      if (!done) break
      progress('first-quest', 1)
      unlock('first-quest')
      if (atNight(event.at)) unlock('night-owl')
      if (event.at - event.startedAt < SPEEDRUN_MS) unlock('speedrun')
      if (event.denied) unlock('second-wind')
      progress('hoarder', event.itemsTotal)
      if (event.itemsTotal >= goalOf('hoarder', book)) unlock('hoarder')
      break
    }
    case 'run_ended':
      if (event.done && atNight(event.at)) unlock('night-owl')
      break
    case 'task_started':
      counters.runnable = [...new Set(event.runnable)]
      if (event.agentKey !== null && !counters.calledToday.includes(event.agentKey)) {
        counters.calledToday.push(event.agentKey)
      }
      break
    case 'party_loaded':
      counters.runnable = [...new Set(event.runnable)]
      progress('party-of-5', event.size)
      if (event.size >= goalOf('party-of-5', book)) unlock('party-of-5')
      break
    case 'boss_defeated':
      unlock('boss-slayer')
      break
  }

  // FULL PARTY: every agent that can be called, called today. Needs at least 2.
  if (event.type === 'task_started' || event.type === 'party_loaded') {
    const called = counters.runnable.filter((key) => counters.calledToday.includes(key)).length
    progress('full-party', called)
    if (counters.runnable.length >= 2 && called === counters.runnable.length) unlock('full-party')
  }

  return { book, unlocked }
}
