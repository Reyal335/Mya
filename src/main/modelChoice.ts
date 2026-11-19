import type { ModelChoiceResult, ModelsResult } from '../shared/ipc'
import { AUTO, type ModelChoice, type ProviderId } from '../shared/models'
import {
  lockMessage,
  modelFitsChat,
  providerModels,
  resolveProviderChoice
} from '../shared/providers'
import { ensureOpenChat, getOpenChat, setChatChoice } from './chats'
import { isObject } from './jsonFile'
import { getModels } from './models'
import { getProviderDefault, setProviderDefault } from './settings'
import { firstSignedInProvider, startChoice } from './startChoice'

// The open chat's model and thinking choice, checked against what the account can use now. The pure
// rules are in shared/providers.ts; this reads and saves around them.
//
// A chat belongs to one provider from the moment it is made: the NEW CHAT dialog picks it, and
// nothing in a chat changes it. What is saved has to be one of that provider's models, and a saved
// one that is not (an old choice, or a hand-edited file) is replaced by the provider's own start,
// with a line saying so.

const FAILED_LIST = "Couldn't load the model list."
const MAX_MODEL_LENGTH = 200

export async function listModels(cwd: string): Promise<ModelsResult> {
  const loaded = await getModels(cwd)
  return loaded.ok ? { ok: true, ...loaded.lists } : { ok: false, message: FAILED_LIST }
}

// The open chat's saved choice made to fit the models available now. A chat with none yet starts
// from its provider's start. A project with no chat yet reads as the chat its first message would
// make. `listed` is false when the model list could not be loaded: then only the built-in rows are
// known.
async function checkedChoice(cwd: string): Promise<{
  saved: ModelChoice
  choice: ModelChoice
  notices: string[]
  listed: boolean
  provider: ProviderId
}> {
  const chat = await getOpenChat(cwd)
  const provider = chat ? chat.provider : await firstSignedInProvider()
  const saved: ModelChoice = chat?.model
    ? { model: chat.model, effort: chat.effort ?? AUTO }
    : await startChoice(provider, cwd)
  const loaded = await getModels(cwd)
  const start = (await getProviderDefault(provider))?.model
  const { choice, notices } = resolveProviderChoice(
    saved,
    loaded.ok ? loaded.lists : null,
    provider,
    start
  )
  return { saved, choice, notices, listed: loaded.ok, provider }
}

// For the picker: what to show now, and which provider the chat is on. Nothing is saved and no line
// is made, so the run that follows still says what changed.
export async function chatChoice(cwd: string): Promise<ModelChoiceResult> {
  try {
    const { choice, provider } = await checkedChoice(cwd)
    return { ok: true, choice, provider }
  } catch (err) {
    console.error('[modelChoice] Could not read the choice:', err)
    return { ok: false, error: { message: 'The model choice could not be read.' } }
  }
}

// For a run starting: the choice to run with, and a line for each change made to a saved choice
// that no longer fits. A change is saved once the list is known, so its line shows once; while the
// list could not be loaded nothing is saved, so a failed fetch never costs the person their
// choice.
export async function choiceForRun(
  cwd: string
): Promise<{ choice: ModelChoice; notices: string[] }> {
  const { saved, choice, notices, listed } = await checkedChoice(cwd)
  const changed = choice.model !== saved.model || choice.effort !== saved.effort
  if (listed && changed) await setChatChoice(cwd, choice)
  return { choice, notices }
}

// A pick in the picker. Checked again here, since the window is not trusted: the model must be one
// the chat's provider runs (its list, and AUTO on Claude), and the level is made to fit the model.
// "Use for new <Provider> chats too" saves it as that provider's start.
export async function saveChoice(cwd: string, raw: unknown): Promise<ModelChoiceResult> {
  if (
    !isObject(raw) ||
    typeof raw.model !== 'string' ||
    raw.model === '' ||
    raw.model.length > MAX_MODEL_LENGTH ||
    typeof raw.effort !== 'string' ||
    typeof raw.asDefault !== 'boolean'
  ) {
    return { ok: false, error: { message: 'That is not a model choice.' } }
  }
  try {
    const chat = await ensureOpenChat(cwd)
    if (!modelFitsChat(raw.model, chat.provider)) {
      return { ok: false, error: { message: lockMessage(chat.provider, raw.model) } }
    }
    const loaded = await getModels(cwd)
    const lists = loaded.ok ? loaded.lists : null
    const known =
      raw.model === AUTO ||
      providerModels(lists, chat.provider).some((option) => option.value === raw.model)
    if (!known) return { ok: false, error: { message: 'That model is not available.' } }
    const { choice } = resolveProviderChoice(
      { model: raw.model, effort: raw.effort },
      lists,
      chat.provider
    )
    await setChatChoice(cwd, choice)
    if (raw.asDefault) await setProviderDefault(chat.provider, choice)
    return { ok: true, choice, provider: chat.provider }
  } catch (err) {
    console.error('[modelChoice] Could not save the choice:', err)
    return { ok: false, error: { message: 'The model choice could not be saved.' } }
  }
}
