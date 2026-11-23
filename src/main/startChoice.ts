import { AUTO_CHOICE, type ModelChoice, type ProviderId } from '../shared/models'
import { resolveProviderChoice } from '../shared/providers'
import { accountData, checkAccount } from './account'
import { allChats, type ChatStart } from './chats'
import { getModels } from './models'
import { getProvidersStatus } from './providerAuth'
import { getProviderDefault } from './settings'

// Where a chat starts: which provider a project's first chat is on, and the model and level any
// new chat of a provider starts on. A chat's provider is picked in the NEW CHAT dialog and never
// changes; this is only for the chat that is made without the dialog.

// Whether each provider could start a chat now. Claude needs the Claude Code login; Codex and
// Gemini need their CLI signed in.
export async function signedIn(): Promise<Record<ProviderId, boolean>> {
  const claude = accountData().account.kind === 'loading' ? await checkAccount() : accountData()
  const providers = await getProvidersStatus()
  return {
    claude: claude.account.kind === 'signed_in',
    codex: providers.codex.installed && providers.codex.loggedIn,
    gemini: providers.gemini.installed && providers.gemini.loggedIn
  }
}

// The first provider that is signed in, Claude first. With none signed in, Claude: its chat then
// says it is not signed in, as before.
export function firstReadyProvider(ready: Record<ProviderId, boolean>): ProviderId {
  if (ready.claude) return 'claude'
  if (ready.codex) return 'codex'
  if (ready.gemini) return 'gemini'
  return 'claude'
}

export async function firstSignedInProvider(): Promise<ProviderId> {
  return firstReadyProvider(await signedIn())
}

// The model and level a new chat of `provider` starts on: the saved default ("Use for new
// <Provider> chats too"), else the model last used with that provider in this project, else the
// first model its list offers (AUTO for Claude). Made to fit the models available now.
export async function startChoice(provider: ProviderId, cwd: string): Promise<ModelChoice> {
  let wanted = await getProviderDefault(provider)
  if (!wanted) {
    const last = (await allChats(cwd))
      .filter((chat) => chat.provider === provider && chat.model)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (last?.model) wanted = { model: last.model, effort: last.effort ?? 'auto' }
  }
  const loaded = await getModels(cwd)
  const base = wanted ?? (provider === 'claude' ? AUTO_CHOICE : { model: '', effort: 'auto' })
  return resolveProviderChoice(base, loaded.ok ? loaded.lists : null, provider).choice
}

export async function firstChatStart(projectPath: string): Promise<ChatStart> {
  const provider = await firstSignedInProvider()
  return { provider, choice: await startChoice(provider, projectPath) }
}
