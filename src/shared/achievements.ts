// Every achievement, in the order the ACHIEVEMENTS screen shows them. Rewards are
// titles and mascot accessories; both are cosmetic.

export type RewardKind = 'title' | 'accessory'

export type Reward = { kind: RewardKind; id: string; name: string }

export type AchievementId =
  | 'first-quest'
  | 'party-of-5'
  | 'night-owl'
  | 'flawless'
  | 'full-party'
  | 'hoarder'
  | 'boss-slayer'
  | 'speedrun'
  | 'second-wind'

export type AchievementDef = {
  id: AchievementId
  name: string
  description: string
  hidden: boolean
  // The number progress counts up to. FULL PARTY's real goal is the party size that
  // day; this is its least.
  goal: number
  reward: Reward
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-quest',
    name: 'FIRST QUEST',
    description: 'An agent finished a task.',
    hidden: false,
    goal: 1,
    reward: { kind: 'title', id: 'rookie', name: 'Rookie' }
  },
  {
    id: 'party-of-5',
    name: 'PARTY OF 5',
    description: 'Have 5 or more agents in the party at once.',
    hidden: false,
    goal: 5,
    reward: { kind: 'accessory', id: 'party-hat', name: 'Party hat' }
  },
  {
    id: 'night-owl',
    name: 'NIGHT OWL',
    description: 'Finish a run or a task between 2:00 and 4:59 at night.',
    hidden: false,
    goal: 1,
    reward: { kind: 'accessory', id: 'nightcap', name: 'Nightcap' }
  },
  {
    id: 'flawless',
    name: 'FLAWLESS',
    description: '10 tasks in a row finish with no errors and nothing denied.',
    hidden: false,
    goal: 10,
    reward: { kind: 'title', id: 'flawless', name: 'Flawless' }
  },
  {
    id: 'full-party',
    name: 'FULL PARTY',
    description: 'Call every agent in the party in one day (at least 2).',
    hidden: false,
    goal: 2,
    reward: { kind: 'title', id: 'leader', name: 'Leader' }
  },
  {
    id: 'hoarder',
    name: 'HOARDER',
    description: 'Your agents have changed 100 files in all.',
    hidden: false,
    goal: 100,
    reward: { kind: 'accessory', id: 'backpack', name: 'Backpack' }
  },
  {
    id: 'boss-slayer',
    name: 'BOSS SLAYER',
    description: 'Defeat a boss.',
    hidden: false,
    goal: 1,
    reward: { kind: 'accessory', id: 'crown', name: 'Crown' }
  },
  {
    id: 'speedrun',
    name: 'SPEEDRUN',
    description: 'An agent finished a task in under 30 seconds.',
    hidden: true,
    goal: 1,
    reward: { kind: 'title', id: 'speedrunner', name: 'Speedrunner' }
  },
  {
    id: 'second-wind',
    name: 'SECOND WIND',
    description: 'An agent finished a task after you denied one of its requests.',
    hidden: true,
    goal: 1,
    reward: { kind: 'title', id: 'persistent', name: 'Persistent' }
  }
]

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((def) => def.id === id)
}

// The achievement whose reward this is, so equipping can check it is unlocked.
export function achievementForReward(kind: RewardKind, id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((def) => def.reward.kind === kind && def.reward.id === id)
}

export function rewardText(reward: Reward): string {
  return reward.kind === 'title' ? `Title "${reward.name}"` : `${reward.name} (accessory)`
}

// One achievement as the window sees it.
export type AchievementState = {
  id: AchievementId
  unlockedAt: number | null
  progress: number
  goal: number
  seen: boolean
}

export type Equipped = { title: string | null; accessory: string | null }

export type AchievementsData = {
  achievements: AchievementState[]
  equipped: Equipped
}

// An unlock as the toast and the popup show it.
export type UnlockNotice = { id: AchievementId; name: string; reward: Reward }
