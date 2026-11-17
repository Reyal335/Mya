import type { Fight } from '../../../shared/bosses'

// How the BOSS tab and the history word a fight.

export type WeakPoint = { file: string; count: number }

// Files with failing tests, most failing first.
export function weakPoints(fight: Fight): WeakPoint[] {
  return Object.entries(fight.files)
    .filter(([, state]) => state.failedCount > 0)
    .map(([file, state]) => ({ file, count: state.failedCount }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
}

export function fileLabel(file: string): string {
  return file === '' ? 'Other tests' : file
}

export function durationText(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}
