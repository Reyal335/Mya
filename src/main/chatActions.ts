import { dialog, type BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { chatToMarkdown, exportFileName } from '../shared/chatExport'
import { searchChats, type SearchableMessage } from '../shared/chatSearch'
import { cleanRename } from '../shared/chatTitle'
import { levelLabel, modelValueLabel, AUTO, type ProviderId } from '../shared/models'
import { PROVIDER_ORDER, providerModels } from '../shared/providers'
import {
  BUSY_MESSAGE,
  PROVIDER_NAMES,
  type ChatStarts,
  type ChatList,
  type ChatSearchResults,
  type ChatsErrorCode,
  type ChatsResult
} from '../shared/chats'
import type { ChatHistory } from '../shared/ipc'
import { isRunning, loadChatHistory } from './agent'
import {
  addFork,
  allChats,
  createChat,
  deleteChatById,
  getChat,
  getOpenChat,
  listProjectChats,
  openChatById,
  pinChatById,
  readChatMessages,
  renameChatById
} from './chats'
import { getModels } from './models'
import { loadSdk } from './sdk'
import { signedIn, startChoice } from './startChoice'

// What HISTORY does with a project's chats. The window names a chat by its id only; every id is
// checked against the project's index here. A chat is never made, opened, or forked while a run is
// going (code busy), and neither is the open chat deleted: the run belongs to it.

const MAX_ID = 64
const MAX_QUERY = 200

function failure(
  code: ChatsErrorCode,
  message: string
): { ok: false; error: { code: ChatsErrorCode; message: string } } {
  return { ok: false, error: { code, message } }
}

const busy = (): ReturnType<typeof failure> => failure('busy', BUSY_MESSAGE)
const noProject = (): ReturnType<typeof failure> => failure('no_project', 'No project is open.')
const notFound = (): ReturnType<typeof failure> =>
  failure('not_found', 'That chat is not in this project.')

function readId(raw: unknown): string | null {
  return typeof raw === 'string' && raw !== '' && raw.length <= MAX_ID ? raw : null
}

async function withList<T extends object>(
  projectPath: string,
  extra?: T
): Promise<ChatsResult<ChatList & T>> {
  const list = await listProjectChats(projectPath)
  return { ok: true, ...list, ...(extra ?? ({} as T)) }
}

export async function chatsList(projectPath: string | null): Promise<ChatsResult<ChatList>> {
  if (!projectPath) return noProject()
  return withList(projectPath)
}

// The open chat's saved messages, as items, for the window to show.
export async function chatsHistory(projectPath: string | null): Promise<ChatHistory> {
  const chat = projectPath ? await getOpenChat(projectPath) : null
  return loadChatHistory(projectPath ?? '', chat)
}

export async function chatsCreate(
  projectPath: string | null,
  rawProvider: unknown,
  // Who is signed in, when the caller has just asked (the `mya` command). Asking again is slow.
  ready?: Record<ProviderId, boolean>
): Promise<ChatsResult<ChatList & { created: boolean }>> {
  if (!projectPath) return noProject()
  if (
    typeof rawProvider !== 'string' ||
    !(PROVIDER_ORDER as readonly string[]).includes(rawProvider)
  ) {
    return failure('invalid', 'That is not a provider.')
  }
  const provider = rawProvider as ProviderId
  if (isRunning()) return busy()
  try {
    // A chat can only start on a provider that is signed in.
    if (!(ready ?? (await signedIn()))[provider]) {
      return failure(
        'not_ready',
        `${PROVIDER_NAMES[provider]} isn't signed in, so a chat can't start on it yet. Sign in on LOGINS.`
      )
    }
    const { created } = await createChat(
      projectPath,
      provider,
      await startChoice(provider, projectPath)
    )
    return withList(projectPath, { created })
  } catch (err) {
    console.error('[chats] Could not make a chat:', err)
    return failure('io_error', 'The chat could not be made.')
  }
}

// What a new chat of each provider starts on, written as the NEW CHAT card says it.
export async function chatsStarts(
  projectPath: string | null
): Promise<ChatsResult<{ starts: ChatStarts }>> {
  if (!projectPath) return noProject()
  try {
    const loaded = await getModels(projectPath)
    const lists = loaded.ok ? loaded.lists : null
    const starts = {} as ChatStarts
    for (const provider of PROVIDER_ORDER) {
      const choice = await startChoice(provider, projectPath)
      const levels =
        choice.model === AUTO
          ? null
          : (providerModels(lists, provider).find((option) => option.value === choice.model)
              ?.effortLevels ?? null)
      const noLevel = levels !== null && levels.length === 0
      starts[provider] = {
        model: modelValueLabel(choice.model, lists),
        level:
          noLevel || (choice.model === AUTO && choice.effort === AUTO)
            ? null
            : levelLabel(choice.effort)
      }
    }
    return { ok: true, starts }
  } catch (err) {
    console.error('[chats] Could not work out where chats start:', err)
    return failure('io_error', 'The starting models could not be read.')
  }
}

export async function chatsOpen(
  projectPath: string | null,
  rawId: unknown
): Promise<ChatsResult<ChatList>> {
  if (!projectPath) return noProject()
  const id = readId(rawId)
  if (id === null) return failure('invalid', 'That is not a chat.')
  const current = await listProjectChats(projectPath)
  // The chat that is already open can always be "opened".
  if (current.openId === id) return { ok: true, ...current }
  if (isRunning()) return busy()
  if (!(await openChatById(projectPath, id))) return notFound()
  return withList(projectPath)
}

export async function chatsRename(
  projectPath: string | null,
  rawId: unknown,
  rawTitle: unknown
): Promise<ChatsResult<ChatList>> {
  if (!projectPath) return noProject()
  const id = readId(rawId)
  if (id === null || typeof rawTitle !== 'string') return failure('invalid', 'That is not a title.')
  const chat = await getChat(projectPath, id)
  if (!chat) return notFound()
  // An empty or unchanged name is no change.
  const title = cleanRename(rawTitle, chat.title)
  if (title !== null) await renameChatById(projectPath, id, title)
  return withList(projectPath)
}

export async function chatsPin(
  projectPath: string | null,
  rawId: unknown,
  pinned: unknown
): Promise<ChatsResult<ChatList>> {
  if (!projectPath) return noProject()
  const id = readId(rawId)
  if (id === null || typeof pinned !== 'boolean') return failure('invalid', 'That is not a pin.')
  if (!(await pinChatById(projectPath, id, pinned))) return notFound()
  return withList(projectPath)
}

export async function chatsRemove(
  projectPath: string | null,
  rawId: unknown
): Promise<ChatsResult<ChatList>> {
  if (!projectPath) return noProject()
  const id = readId(rawId)
  if (id === null) return failure('invalid', 'That is not a chat.')
  const list = await listProjectChats(projectPath)
  if (isRunning() && list.openId === id) return busy()
  try {
    if (!(await deleteChatById(projectPath, id))) return notFound()
  } catch (err) {
    console.error('[chats] Could not delete a chat:', err)
    return failure('io_error', 'The chat could not be deleted.')
  }
  return withList(projectPath)
}

// FORK AS NEW CHAT. Only Claude can: the SDK copies a session into a new one. A chat on another
// provider, or one with no session yet, has nothing to fork.
export async function chatsFork(
  projectPath: string | null,
  rawId: unknown
): Promise<ChatsResult<ChatList>> {
  if (!projectPath) return noProject()
  const id = readId(rawId)
  if (id === null) return failure('invalid', 'That is not a chat.')
  if (isRunning()) return busy()
  const chat = await getChat(projectPath, id)
  if (!chat) return notFound()
  if (chat.provider !== 'claude' || chat.providerSessionId === null) {
    return failure(
      'unsupported',
      `${PROVIDER_NAMES[chat.provider]} chats cannot be forked${chat.provider === 'claude' ? ' before their first reply' : ''}.`
    )
  }
  try {
    const sdk = await loadSdk()
    const forked = await sdk.forkSession(chat.providerSessionId, { dir: projectPath })
    await addFork(projectPath, chat, forked.sessionId)
  } catch (err) {
    console.error('[chats] Could not fork a chat:', err instanceof Error ? err.message : err)
    return failure('io_error', 'The chat could not be forked. Its saved session was not found.')
  }
  return withList(projectPath)
}

// EXPORT .MD: the messages Mya has, written where the save dialog says.
export async function chatsExport(
  projectPath: string | null,
  rawId: unknown,
  window: BrowserWindow | null
): Promise<ChatsResult<{ canceled: boolean }>> {
  if (!projectPath) return noProject()
  const id = readId(rawId)
  if (id === null) return failure('invalid', 'That is not a chat.')
  const chat = await getChat(projectPath, id)
  if (!chat) return notFound()
  try {
    const messages = (await readChatMessages(projectPath, id)) ?? []
    const options: Electron.SaveDialogOptions = {
      title: 'Export chat',
      defaultPath: exportFileName(chat.title),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    }
    const picked = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (picked.canceled || !picked.filePath) return { ok: true, canceled: true }
    await writeFile(
      picked.filePath,
      chatToMarkdown(chat, messages, PROVIDER_NAMES[chat.provider]),
      'utf8'
    )
    return { ok: true, canceled: false }
  } catch (err) {
    console.error('[chats] Could not export a chat:', err instanceof Error ? err.message : err)
    return failure('io_error', 'The chat could not be exported.')
  }
}

// Titles first, then the messages Mya keeps.
export async function chatsSearch(
  projectPath: string | null,
  rawQuery: unknown
): Promise<ChatsResult<{ results: ChatSearchResults }>> {
  if (!projectPath) return noProject()
  if (typeof rawQuery !== 'string') return failure('invalid', 'That is not a search.')
  const query = rawQuery.slice(0, MAX_QUERY)
  const chats = await allChats(projectPath)
  const messages = new Map<string, SearchableMessage[]>()
  if (query.trim() !== '') {
    await Promise.all(
      chats.map(async (chat) => {
        const kept = await readChatMessages(projectPath, chat.id).catch(() => null)
        if (kept)
          messages.set(
            chat.id,
            kept.map((message, index) => ({ index, text: message.text }))
          )
      })
    )
  }
  return { ok: true, results: searchChats(query, chats, messages) }
}
