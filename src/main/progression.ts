import type { ProgressionResult } from '../shared/ipc'
import type { AgentProgress, AgentStats } from '../shared/progression'
import { listAgents } from './agents'
import { progressOf, recordPartyLoaded } from './progressionStore'

// What the window asks about progression. The window names an agent by a file path
// from the agent list; main checks it is one the list has before answering.

const UNKNOWN = 'This agent is not in the party.'

// Class and level for each agent file in the list, keyed by its filePath as listed.
// The party list loading is also when PARTY OF 5 and FULL PARTY are checked.
export async function agentsSummary(): Promise<
  ProgressionResult<{ agents: Record<string, AgentProgress> }>
> {
  const listed = await listAgents()
  if (!listed.ok) return { ok: false, error: { message: listed.error.message } }
  const agents: Record<string, AgentProgress> = {}
  for (const agent of listed.agents) {
    const { classId, level, intoLevel, toNext } = await progressOf(agent)
    agents[agent.filePath] = { classId, level, intoLevel, toNext }
  }
  void recordPartyLoaded(listed.agents)
  return { ok: true, agents }
}

export async function agentStats(
  rawPath: unknown
): Promise<ProgressionResult<{ stats: AgentStats }>> {
  if (typeof rawPath !== 'string') return { ok: false, error: { message: UNKNOWN } }
  const listed = await listAgents()
  if (!listed.ok) return { ok: false, error: { message: listed.error.message } }
  const agent = listed.agents.find((entry) => entry.filePath === rawPath)
  if (!agent) return { ok: false, error: { message: UNKNOWN } }
  return { ok: true, stats: await progressOf(agent) }
}
