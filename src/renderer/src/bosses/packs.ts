import {
  DEFAULT_BOSSES,
  readBossManifest,
  type BossBackgroundInfo,
  type BossListItem,
  type BossPack
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
  const idle = picture(id, manifest.idle.file)
  if (!idle) return null
  return {
    id,
    name: manifest.name,
    accent: manifest.accent,
    background: manifest.background ? picture(id, manifest.background) : null,
    idle: { src: idle, frames: manifest.idle.frames, fps: manifest.idle.fps }
  }
}

export const DEFAULT_PACKS: BossPack[] = DEFAULT_BOSSES.flatMap(
  (boss) => defaultPack(boss.id) ?? []
)

// One boss as the manager draws it: a pack, or a folder that failed a rule.
export type BossEntry =
  | {
      kind: 'boss'
      pack: BossPack
      builtIn: boolean
      inPool: boolean
      // The stored background's file and size, for the editor's row.
      backgroundInfo: BossBackgroundInfo | null
    }
  | { kind: 'problem'; id: string; problem: string }

// The built-in bosses, in order, then the custom ones as main sent them. A built-in boss takes
// its pictures from the bundle and only its pool setting from main.
export function entriesFrom(items: BossListItem[]): BossEntry[] {
  return items.flatMap((item): BossEntry[] => {
    if (item.problem !== null) return [{ kind: 'problem', id: item.id, problem: item.problem }]
    if (item.builtIn) {
      const pack = DEFAULT_PACKS.find((each) => each.id === item.id)
      return pack
        ? [{ kind: 'boss', pack, builtIn: true, inPool: item.inPool, backgroundInfo: null }]
        : []
    }
    if (!item.idle) return []
    const pack: BossPack = {
      id: item.id,
      name: item.name,
      accent: item.accent,
      background: item.background,
      idle: item.idle
    }
    return [
      {
        kind: 'boss',
        pack,
        builtIn: false,
        inPool: item.inPool,
        backgroundInfo: item.backgroundInfo
      }
    ]
  })
}
