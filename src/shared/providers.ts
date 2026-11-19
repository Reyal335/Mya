// The three providers as one table, and the rules that depend on it. Components ask this table and
// never compare provider ids: what a provider can and cannot do is a row here, so a capability that
// turns true later changes one value and the feature looks like Claude's with no other change.
// Pure: no imports but our own pure modules.

import { PROVIDER_NAMES } from './chats.ts'
import {
  AUTO,
  AUTO_CHOICE,
  EXTRA_MODELS,
  EFFORT_LEVELS,
  LEVEL_LABELS,
  isEffortLevel,
  modelValueLabel,
  providerOf,
  resolveChoice,
  type EffortLevel,
  type ModelChoice,
  type ModelLists,
  type ModelOption,
  type ProviderId
} from './models.ts'
import { PROVIDER_GLYPHS, type GlyphShape } from './providerGlyphs.ts'

export type ProviderCapabilities = {
  // Edits, commands, and web access wait for Approve or Deny.
  approvals: boolean
  // How many agents the provider can bring in by itself. 0: only the ones I call.
  autoAgents: number
  // Session and weekly numbers that Mya can show.
  usage: boolean
  // Pasted images can be sent.
  images: boolean
  // The mascot's voice shapes the replies.
  voice: boolean
  // Earlier messages can be shown again after a restart.
  restoreAfterRestart: boolean
  // A chat can be forked.
  fork: boolean
  // Test runs reach the boss battles.
  boss: boolean
}

export type ProviderInfo = {
  id: ProviderId
  // The capitals shown on tags and cards.
  label: string
  name: string
  glyph: GlyphShape
  // The model a chat of this provider starts on when nothing else says: AUTO for Claude. Codex and
  // Gemini start on the first model their list offers, so this is only the last resort.
  fallbackModel: string
  // What the NEW CHAT card says about the provider, and what is missing there.
  summary: string
  missing: string
  capabilities: ProviderCapabilities
}

const CLI_SUMMARY = 'Edits files and runs commands without asking. Runs only the agents you call.'

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  claude: {
    id: 'claude',
    label: 'CLAUDE',
    name: PROVIDER_NAMES.claude,
    glyph: PROVIDER_GLYPHS.claude,
    fallbackModel: AUTO,
    summary: 'Asks before edits and commands. Can bring in up to 3 agents by itself.',
    missing: 'Everything in Mya works here.',
    capabilities: {
      approvals: true,
      autoAgents: 3,
      usage: true,
      images: true,
      voice: true,
      restoreAfterRestart: true,
      fork: true,
      boss: true
    }
  },
  codex: {
    id: 'codex',
    label: 'CODEX',
    name: PROVIDER_NAMES.codex,
    glyph: PROVIDER_GLYPHS.codex,
    fallbackModel: 'codex:gpt-5.3-codex',
    summary: CLI_SUMMARY,
    missing: 'Usage, images, mascot voice, old messages after a restart.',
    capabilities: {
      approvals: false,
      autoAgents: 0,
      usage: false,
      images: false,
      voice: false,
      restoreAfterRestart: false,
      fork: false,
      boss: false
    }
  },
  gemini: {
    id: 'gemini',
    label: 'GEMINI',
    name: PROVIDER_NAMES.gemini,
    glyph: PROVIDER_GLYPHS.gemini,
    fallbackModel: 'gemini:gemini-2.5-pro',
    summary: CLI_SUMMARY,
    missing: 'Usage, images, mascot voice, old messages after a restart.',
    capabilities: {
      approvals: false,
      autoAgents: 0,
      usage: false,
      images: false,
      voice: false,
      restoreAfterRestart: false,
      fork: false,
      boss: false
    }
  }
}

export const PROVIDER_ORDER: readonly ProviderId[] = ['claude', 'codex', 'gemini']

export function can(provider: ProviderId, capability: keyof ProviderCapabilities): boolean {
  const value = PROVIDERS[provider].capabilities[capability]
  return typeof value === 'number' ? value > 0 : value
}

// The provider a model value belongs to. AUTO and every Claude model are Claude's.
export function providerOfModel(modelId: string): ProviderId {
  return providerOf(modelId)
}

// --- Copy that depends on the provider -----------------------------------------------------------

export function noApprovalsLine(provider: ProviderId): string {
  return `${PROVIDER_NAMES[provider]} edits files and runs commands without asking. STOP ends it.`
}

export const NO_APPROVALS_HINT = 'To approve each step, start a Claude chat.'

// --- Agents: which chats can call which agent ---------------------------------------------------

// The provider an agent file's `model` pins it to, or null when it follows the chat: no model line
// or `inherit`. A Claude alias (sonnet, opus, haiku, fable) or any other plain value is Claude's.
export function agentPin(model: string | null | undefined): ProviderId | null {
  const value = (model ?? '').trim()
  if (value === '' || value === 'inherit') return null
  return providerOf(value)
}

export type CallCheck = { ok: true } | { ok: false; reason: string; hint: string }

// Whether an agent can be called in a chat of `chatProvider`: an agent pinned to another provider
// cannot, with the short reason the row shows and the line the hover card adds.
export function canCallAgent(
  agent: { model: string | null | undefined },
  chatProvider: ProviderId
): CallCheck {
  const pin = agentPin(agent.model)
  if (pin === null || pin === chatProvider) return { ok: true }
  const name = PROVIDER_NAMES[pin]
  return { ok: false, reason: `Set to run on ${name}`, hint: `Start a ${name} chat to call it.` }
}

export type AgentModelGroup = {
  provider: ProviderId
  models: { value: string; label: string }[]
}

// The model dropdown on AGENTS: the models an agent file may name, grouped by the provider each
// belongs to, in the providers' order. "inherit" is not in a group (it is "Follow the chat"). The
// label drops the provider prefix, since the group already names the provider. A value the file has
// that the list does not know stays in its provider's group, so opening and saving never loses it.
export function agentModelGroups(choices: readonly string[], current: string): AgentModelGroup[] {
  const values = choices.filter((choice) => choice !== 'inherit')
  if (current !== '' && current !== 'inherit' && !values.includes(current)) values.push(current)
  const groups: AgentModelGroup[] = []
  for (const provider of PROVIDER_ORDER) {
    const models = values
      .filter((value) => providerOf(value) === provider)
      .map((value) => ({ value, label: value.replace(/^(codex|gemini):/, '') }))
    if (models.length > 0) groups.push({ provider, models })
  }
  return groups
}

// The line under the dropdown for an agent pinned to a provider, or null when it follows the chat.
export function pinnedNote(model: string | null | undefined): string | null {
  const pin = agentPin(model)
  if (pin === null) return null
  const name = PROVIDER_NAMES[pin]
  return `Pinned to ${name}. It can only be called in ${name} chats.`
}

// --- Where a new chat starts ---------------------------------------------------------------------

// What settings.json says a new chat of `provider` starts on, or null when it says nothing. The
// choice saved for the provider (providerDefaults, written by "Use for new <Provider> chats too")
// wins. Before there was one default per provider, settings.json held a single defaultModel and
// defaultEffort: it counts as the default of the provider its model belongs to. Claude's start with
// nothing saved is AUTO, which the old single default also meant. Anything of another provider's, or
// not text, is ignored.
export function savedDefault(
  settings: Record<string, unknown>,
  provider: ProviderId
): ModelChoice | null {
  const { providerDefaults, defaultModel, defaultEffort } = settings
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null
  if (providerDefaults !== null && typeof providerDefaults === 'object') {
    const saved = (providerDefaults as Record<string, unknown>)[provider]
    if (saved !== null && typeof saved === 'object') {
      const { model, effort } = saved as Record<string, unknown>
      const name = text(model)
      if (name !== null && providerOf(name) === provider) {
        return { model: name, effort: text(effort) ?? AUTO }
      }
    }
  }
  const legacy = text(defaultModel)
  if (legacy !== null && legacy !== AUTO && providerOf(legacy) === provider) {
    return { model: legacy, effort: text(defaultEffort) ?? AUTO }
  }
  return provider === 'claude' ? { model: AUTO, effort: AUTO } : null
}

// --- Keys ----------------------------------------------------------------------------------------

// A key as the window may see it: the first 4 and last 4 characters ("sk-a...9f2c"). A key of 8
// characters or fewer shows nothing of itself. The full key never crosses to the window.
export function maskKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

// --- Models and thinking levels for one provider -------------------------------------------------

// A provider's models from the full list. Claude's include AUTO as the window's own first row.
export function providerModels(lists: ModelLists | null, provider: ProviderId): ModelOption[] {
  const found = lists?.models.filter((option) => providerOf(option.value) === provider) ?? []
  if (found.length > 0 || provider === 'claude') return found
  // The list could not be loaded (it comes from Claude Code): the built-in rows stand in.
  return EXTRA_MODELS.filter((option) => providerOf(option.value) === provider)
}

// The level a chat starts at on a Codex or Gemini model, which have no AUTO level: MED when the
// model has it, else its first level, else none.
export function defaultLevel(levels: readonly EffortLevel[]): EffortLevel | null {
  if (levels.includes('medium')) return 'medium'
  return levels[0] ?? null
}

// The level a model has that is nearest to `level`. Between two equally near, the lower one.
export function nearestLevel(
  level: EffortLevel,
  supported: readonly EffortLevel[]
): EffortLevel | null {
  const at = EFFORT_LEVELS.indexOf(level)
  let best: EffortLevel | null = null
  let bestDistance = Infinity
  for (const candidate of EFFORT_LEVELS) {
    if (!supported.includes(candidate)) continue
    const distance = Math.abs(EFFORT_LEVELS.indexOf(candidate) - at)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

// A saved choice made to fit a chat of `provider`. Claude's follows step 10's rules (AUTO, and the
// nearest level below). On Codex and Gemini there is no AUTO: a model of another provider, or one
// that is gone, is replaced by `start` (or the first model the list offers), a level the model does
// not take drops to the nearest it has, and a model with levels always has one. Each change comes
// with a line to show once.
export function resolveProviderChoice(
  saved: ModelChoice,
  lists: ModelLists | null,
  provider: ProviderId,
  start?: string
): { choice: ModelChoice; notices: string[] } {
  const name = PROVIDER_NAMES[provider]
  if (provider === 'claude') {
    if (providerOf(saved.model) !== 'claude') {
      const fitted = resolveChoice(AUTO_CHOICE, lists)
      return {
        choice: fitted.choice,
        notices: [`This chat runs on ${name}. Using AUTO.`, ...fitted.notices]
      }
    }
    return resolveChoice(saved, lists)
  }

  const known = providerModels(lists, provider)
  const notices: string[] = []
  let model = saved.model
  if (providerOf(model) !== provider || !known.some((option) => option.value === model)) {
    const replacement =
      (start && known.some((option) => option.value === start) ? start : null) ??
      known[0]?.value ??
      model
    const label = modelValueLabel(replacement, lists)
    notices.push(
      providerOf(saved.model) !== provider
        ? `This chat runs on ${name}. Using ${label}.`
        : `${modelValueLabel(saved.model, lists)} isn't available right now. Using ${label}.`
    )
    model = replacement
  }

  const option = known.find((entry) => entry.value === model)
  const levels = option?.effortLevels ?? null
  let effort = saved.effort
  if (levels === null) {
    // The levels are not known: a saved level stays, anything else is left to the CLI.
    if (!isEffortLevel(effort)) effort = AUTO
  } else if (levels.length === 0) {
    effort = AUTO
  } else if (!isEffortLevel(effort)) {
    effort = defaultLevel(levels) ?? AUTO
  } else if (!levels.includes(effort)) {
    const near = nearestLevel(effort, levels)
    notices.push(
      `${LEVEL_LABELS[effort]} isn't available on ${modelValueLabel(model, lists)}. Using ${
        near ? LEVEL_LABELS[near] : 'AUTO'
      }.`
    )
    effort = near ?? AUTO
  }
  return { choice: { model, effort }, notices }
}

// --- The lock ----------------------------------------------------------------------------------

// Whether a model may run in a chat of `provider`. The picker only offers a chat's own models, and
// main checks again, since the window is not trusted.
export function modelFitsChat(model: string, provider: ProviderId): boolean {
  return providerOf(model) === provider
}

export function lockMessage(provider: ProviderId, model: string): string {
  return `This chat runs on ${PROVIDER_NAMES[provider]}, so it cannot use ${PROVIDER_NAMES[providerOf(model)]} models.`
}
