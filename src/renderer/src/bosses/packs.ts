import { useEffect, useState } from 'react'
import {
  BOSS_STATES,
  DEFAULT_BOSSES,
  readBossManifest,
  type BossLoop,
  type BossPack,
  type BossStateName
} from '../../../shared/bosses'

// The three default boss packs, bundled with the window (copied from designs/bosses/).
// Nothing is loaded from designs/ at runtime.
const pictures = import.meta.glob('../assets/bosses/*/*.png', {
  eager: true,
  import: 'default'
}) as Record<string, string>
const manifests = import.meta.glob('../assets/bosses/*/manifest.json', {
  eager: true,
  import: 'default'
}) as Record<string, unknown>

function picture(id: string, file: string): string | null {
  return pictures[`../assets/bosses/${id}/${file}`] ?? null
}

function defaultPack(id: string): BossPack | null {
  const read = readBossManifest(manifests[`../assets/bosses/${id}/manifest.json`])
  if (!read.ok) return null
  const { manifest } = read
  const background = picture(id, manifest.background)
  const states: Partial<Record<BossStateName, BossLoop>> = {}
  for (const state of BOSS_STATES) {
    const loop = manifest.states[state]
    const src = loop ? picture(id, loop.file) : null
    if (loop && src) states[state] = { src, frames: loop.frames, fps: loop.fps }
  }
  if (!states.idle || !background) return null
  return {
    id,
    name: manifest.name,
    accent: manifest.accent,
    background,
    states: states as BossPack['states']
  }
}

export const DEFAULT_PACKS: BossPack[] = DEFAULT_BOSSES.flatMap(
  (boss) => defaultPack(boss.id) ?? []
)

// A missing state plays idle.
export function bossLoop(pack: BossPack, state: BossStateName): BossLoop {
  return pack.states[state] ?? pack.states.idle
}

// The defaults, then the user's packs from main (checked there; broken ones never come).
export function useBossPacks(): BossPack[] {
  const [user, setUser] = useState<BossPack[]>([])
  useEffect(() => {
    let disposed = false
    window.mya.bosses
      .packs()
      .then((packs) => {
        if (!disposed) setUser(packs)
      })
      .catch((err: unknown) => console.error('Could not read the boss packs:', err))
    return () => {
      disposed = true
    }
  }, [])
  return [...DEFAULT_PACKS, ...user]
}

export function packById(packs: BossPack[], id: string): BossPack | null {
  return packs.find((pack) => pack.id === id) ?? null
}
