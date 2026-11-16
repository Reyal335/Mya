// Progression rules shared by main and the window: an agent's class from its tools
// line, its level from its total XP, and the XP a finished task earns. Pure: no
// files, no clock. All of it is cosmetic and never changes what an agent may do.

export type ClassId = 'scout' | 'builder' | 'mage' | 'knight' | 'hero'

export const CLASS_NAMES: Record<ClassId, string> = {
  scout: 'SCOUT',
  builder: 'BUILDER',
  mage: 'MAGE',
  knight: 'KNIGHT',
  hero: 'HERO'
}

// Each class's rule in one line, for a card that keeps only the class.
export const CLASS_RULES: Record<ClassId, string> = {
  scout: 'No Edit, Write, or Bash: reads only',
  builder: 'Has an edit tool, no shell tool',
  mage: 'Has a shell tool, no Edit or Write',
  knight: 'Has an edit tool and a shell tool',
  hero: 'No tools line: inherits every tool'
}

export const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']
export const SHELL_TOOLS = ['Bash', 'PowerShell']

export type AgentClass = {
  id: ClassId
  // One short line for the badge's tooltip.
  reason: string
  // The tools that decided the class, as written in the file. Starred on the status sheet.
  deciding: string[]
}

// "Bash(git:*)" is still Bash.
function toolName(tool: string): string {
  return tool.split('(')[0].trim()
}

function listed(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// null means the file has no tools line, so the agent inherits every tool.
export function classFor(tools: string[] | null): AgentClass {
  if (tools === null) {
    return { id: 'hero', reason: 'No tools line: inherits every tool', deciding: [] }
  }
  const edits = tools.filter((tool) => EDIT_TOOLS.includes(toolName(tool)))
  const shells = tools.filter((tool) => SHELL_TOOLS.includes(toolName(tool)))
  if (edits.length > 0 && shells.length > 0) {
    return {
      id: 'knight',
      reason: `Has ${listed([...edits, ...shells])}`,
      deciding: [...edits, ...shells]
    }
  }
  if (edits.length > 0) {
    return { id: 'builder', reason: `Has ${listed(edits)}, no Bash`, deciding: edits }
  }
  if (shells.length > 0) {
    return { id: 'mage', reason: `Has ${listed(shells)}, no Edit or Write`, deciding: shells }
  }
  return { id: 'scout', reason: 'No Edit, Write, or Bash: reads only', deciding: [] }
}

// --- Levels -------------------------------------------------------------------

export const MAX_LEVEL = 99

export type Level = {
  level: number
  // XP into this level, and what this level costs in all. toNext is 0 at the cap.
  intoLevel: number
  toNext: number
}

// Going from level L to L + 1 costs 100 + 50 * L.
export function levelCost(level: number): number {
  return 100 + 50 * level
}

export function levelFor(xp: number): Level {
  let left = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0
  let level = 1
  while (level < MAX_LEVEL && left >= levelCost(level)) {
    left -= levelCost(level)
    level += 1
  }
  return { level, intoLevel: left, toNext: level < MAX_LEVEL ? levelCost(level) : 0 }
}

// --- XP from one task ---------------------------------------------------------

export const XP_QUEST = 50
export const XP_PER_ITEM = 5
export const XP_ITEMS_MAX = 50
export const XP_PER_FILE_FOUND = 2
export const XP_FOUND_MAX = 20
export const XP_CLEAN = 25

export type XpLine = { label: string; xp: number }

export type XpInput = {
  // Changed files.
  items: number
  // Distinct files read. Counts only when nothing was changed.
  found: number
  // No tool call failed and no request was denied.
  clean: boolean
  // Step 18 adds a boss bonus here.
  boss?: number
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

// The XP a task that ended as done earns, line by line. A task that ends as error or
// stopped earns nothing and never reaches this.
export function xpFor(input: XpInput): { total: number; lines: XpLine[] } {
  const lines: XpLine[] = [{ label: 'Quest', xp: XP_QUEST }]
  if (input.items > 0) {
    lines.push({
      label: plural(input.items, 'item', 'items'),
      xp: Math.min(XP_ITEMS_MAX, XP_PER_ITEM * input.items)
    })
  } else if (input.found > 0) {
    lines.push({
      label: plural(input.found, 'file found', 'files found'),
      xp: Math.min(XP_FOUND_MAX, XP_PER_FILE_FOUND * input.found)
    })
  }
  if (input.clean) lines.push({ label: 'No errors', xp: XP_CLEAN })
  if (input.boss && input.boss > 0) lines.push({ label: 'Boss', xp: input.boss })
  return { total: lines.reduce((sum, line) => sum + line.xp, 0), lines }
}

// --- What a finished task saves -------------------------------------------------

export type LootItem = { path: string; added: number; removed: number; isNew: boolean }

export type TaskLoot = {
  // Changed files, in the order of first touch. Paths relative to the project when inside.
  items: LootItem[]
  added: number
  removed: number
  // A read-only quest: the distinct files read, in order. Empty when items is not.
  found: string[]
  foundCount: number
}

// The XP side of a QUEST CLEAR card, saved with the task so the card looks the same
// after a restart.
export type TaskXp = {
  total: number
  lines: XpLine[]
  classId: ClassId
  before: Level
  after: Level
}

// What the party list needs per agent file.
export type AgentProgress = { classId: ClassId } & Level

// The STATUS sheet's numbers.
export type AgentStats = AgentProgress & {
  xp: number
  questsTotal: number
  questsHere: number
  bossesDefeated: number
  // The tool used most, or null before any quest.
  topSkill: { name: string; count: number } | null
  // When the agent first earned XP, or null before.
  joinedAt: number | null
}
