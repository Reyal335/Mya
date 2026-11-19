import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { IpcChannel } from '../shared/ipc'
import { makeTitle } from '../shared/chatTitle'
import type { ChatList, TranscriptMessage } from '../shared/chats'
import { type ModelChoice, type ProviderId } from '../shared/models'
import type { ThemeChoice } from '../shared/themes'
import {
  addChat,
  findChat,
  legacyProvider,
  legacyToRecord,
  listOrder,
  loadIndex,
  mostRecent,
  newChatRecord,
  openChatOf,
  openOnly,
  parseLegacyChats,
  patchChat,
  projectId,
  readIndexFile,
  removeChat,
  toSummary,
  withMessage,
  writeIndexFile,
  type ChatIndex,
  type ChatRecord,
  type LegacyChat
} from './chatIndex'
import { transcriptFromSession } from './chatBackfill'
import {
  appendTranscript,
  readTranscript,
  removeTranscript,
  writeTranscript
} from './chatTranscript'
import { readJsonFile, serialQueue } from './jsonFile'
import { loadSdk } from './sdk'

// A project's chats. Each project has an index (userData/chats/<project-id>.json, see
// chatIndex.ts) and, for each chat, the text Mya keeps (userData/chats/<project-id>/<chat
// id>.jsonl, see chatTranscript.ts). One chat is open at a time: the one the window shows and the
// one a message goes to.
//
// Each chat holds its own provider session id (a Claude session, a Codex thread, or a Gemini
// session), its model choice, and its chat theme. The session files themselves stay where the
// providers keep them: deleting a chat here never touches them. The old chats.json, which kept one
// chat per project, is read once to move that chat in, and is never written or deleted.

export type CliProvider = 'codex' | 'gemini'

// What a file in the index says about a project's chat.
export type { ChatRecord }

const queue = serialQueue()
const cache = new Map<string, ChatIndex>()

function chatsDir(): string {
  return join(app.getPath('userData'), 'chats')
}

function indexFile(id: string): string {
  return join(chatsDir(), `${id}.json`)
}

// The folder that holds a project's chat text.
export function transcriptDir(projectPath: string): string {
  return join(chatsDir(), projectId(projectPath))
}

// --- Telling the window -----------------------------------------------------------------

function broadcast(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IpcChannel.ChatsChanged)
  }
}

// Told when a chat's provider session ends: it was replaced by a fresh one, or the chat was
// deleted. The boss fight of that conversation goes with it.
let sessionEnded: ((projectPath: string, sessionId: string) => void) | null = null

export function onSessionEnded(
  listener: ((projectPath: string, sessionId: string) => void) | null
): void {
  sessionEnded = listener
}

function endSession(projectPath: string, sessionId: string | null): void {
  if (sessionId === null || !sessionEnded) return
  try {
    sessionEnded(projectPath, sessionId)
  } catch (err) {
    console.error('[chats] A session listener failed:', err)
  }
}

// --- Today's single chat, from chats.json --------------------------------------------------

let legacyCache: Promise<Record<string, LegacyChat>> | null = null

function legacyChats(): Promise<Record<string, LegacyChat>> {
  legacyCache ??= (async () => {
    try {
      return parseLegacyChats(await readJsonFile(join(app.getPath('userData'), 'chats.json')))
    } catch (err) {
      console.error('[chats] Could not read chats.json:', err)
      return {}
    }
  })()
  return legacyCache
}

// The one chat a project had, as a record for the index. A Claude session is read once, for the
// title, the times, and the text Mya will keep from now on.
async function migrateProject(projectPath: string): Promise<ChatRecord | null> {
  const all = await legacyChats()
  const wanted = projectId(projectPath)
  const key = Object.keys(all).find((path) => path === projectPath || projectId(path) === wanted)
  const legacy = key ? all[key] : undefined
  if (!legacy) return null

  const id = randomUUID()
  const { provider, sessionId } = legacyProvider(legacy)
  const now = Date.now()
  let title: string | null = null
  let createdAt = now
  let updatedAt = now
  let messages: TranscriptMessage[] = []

  if (provider === 'claude' && sessionId) {
    try {
      const sdk = await loadSdk()
      const info = await sdk.getSessionInfo(sessionId, { dir: projectPath }).catch(() => undefined)
      const saved = await sdk.getSessionMessages(sessionId, { dir: projectPath }).catch(() => [])
      messages = transcriptFromSession(saved as Parameters<typeof transcriptFromSession>[0])
      const firstText = messages.find((m) => m.role === 'user' && m.text.trim() !== '')
      title = firstText
        ? makeTitle(firstText.text)
        : info?.firstPrompt
          ? makeTitle(info.firstPrompt)
          : null
      if (info) {
        updatedAt = info.lastModified
        createdAt = info.createdAt ?? info.lastModified
      }
    } catch (err) {
      console.error('[chats] Could not read the saved session to move it in:', err)
    }
  } else {
    // Nothing else says when a Codex or Gemini chat was last used.
    try {
      const file = await stat(join(app.getPath('userData'), 'chats.json'))
      updatedAt = createdAt = Math.floor(file.mtimeMs)
    } catch {
      // The time stays now.
    }
  }

  const record = legacyToRecord(legacy, {
    id,
    title,
    createdAt,
    updatedAt,
    messageCount: messages.length
  })
  if (messages.length > 0) {
    try {
      await writeTranscript(transcriptDir(projectPath), id, messages)
    } catch (err) {
      console.error('[chats] Could not write the moved chat text:', err)
      return { ...record, messageCount: 0 }
    }
  }
  return record
}

// --- Loading and changing an index -----------------------------------------------------------

// The open chat is the saved one, else the most recent; an index of chats with none open opens
// the most recent in memory.
function settled(index: ChatIndex): ChatIndex {
  if (index.openId !== null || index.chats.length === 0) return index
  const recent = mostRecent(index.chats)
  return recent ? { ...index, openId: recent.id } : index
}

async function load(projectPath: string): Promise<ChatIndex> {
  const id = projectId(projectPath)
  const held = cache.get(id)
  if (held) return held
  const index = settled(await loadIndex(indexFile(id), () => migrateProject(projectPath)))
  cache.set(id, index)
  return index
}

// One read-change-write at a time. `change` returns the new index (the same object for no
// change) and what to hand back.
function mutate<T>(
  projectPath: string,
  change: (index: ChatIndex) => { index: ChatIndex; result: T }
): Promise<T> {
  return queue(async () => {
    const before = await load(projectPath)
    const { index, result } = change(before)
    if (index !== before) {
      const id = projectId(projectPath)
      cache.set(id, index)
      try {
        await writeIndexFile(indexFile(id), index)
      } catch (err) {
        // The chats still work for this session; they just might not come back.
        console.error('[chats] Could not save the chat index:', err)
      }
    }
    return { result, changed: index !== before }
  }).then(({ result, changed }) => {
    if (changed) broadcast()
    return result
  })
}

function read<T>(projectPath: string, pick: (index: ChatIndex) => T): Promise<T> {
  return queue(async () => pick(await load(projectPath)))
}

// --- The list ------------------------------------------------------------------------------

export function listProjectChats(projectPath: string): Promise<ChatList> {
  return read(projectPath, (index) => ({
    chats: listOrder(index.chats).map(toSummary),
    openId: index.openId
  }))
}

export function getChat(projectPath: string, chatId: string): Promise<ChatRecord | null> {
  return read(projectPath, (index) => findChat(index, chatId))
}

export function getOpenChat(projectPath: string): Promise<ChatRecord | null> {
  return read(projectPath, openChatOf)
}

// The chat that holds a provider session, for a task saved before tasks named their chat.
export function chatIdForSession(projectPath: string, sessionId: string): Promise<string | null> {
  return read(
    projectPath,
    (index) => index.chats.find((chat) => chat.providerSessionId === sessionId)?.id ?? null
  )
}

export function allChats(projectPath: string): Promise<ChatRecord[]> {
  return read(projectPath, (index) => index.chats)
}

// What a project's first chat starts on: its provider, and the model and level. The first
// message, or the first pick in the model picker, in a project with no chat makes that chat. The
// provider is the first one that is signed in, and the choice is that provider's saved start. Set
// once at startup (startChoice.ts), so this file needs neither the accounts nor the model lists.
export type ChatStart = { provider: ProviderId; choice: ModelChoice }

let firstChatStart: (projectPath: string) => Promise<ChatStart> = async () => ({
  provider: 'claude',
  choice: { model: 'auto', effort: 'auto' }
})

export function setFirstChatStart(next: (projectPath: string) => Promise<ChatStart>): void {
  firstChatStart = next
}

// The open chat, made when the project has none yet.
export async function ensureOpenChat(projectPath: string): Promise<ChatRecord> {
  const open = await getOpenChat(projectPath)
  if (open) return open
  const start = await firstChatStart(projectPath)
  return mutate(projectPath, (index) => {
    const again = openChatOf(index)
    if (again) return { index, result: again }
    const record = newChatRecord({
      id: randomUUID(),
      provider: start.provider,
      now: Date.now(),
      model: start.choice.model,
      effort: start.choice.effort
    })
    return { index: addChat(index, record), result: record }
  })
}

// NEW CHAT: an empty chat of `provider`, starting on `choice`, opened. The open chat moves to
// HISTORY, unless it is still empty: an empty chat of the same provider is already what is asked
// for and is kept (`created` is false), and an empty chat of another provider has nothing in it to
// keep, so it is replaced.
export async function createChat(
  projectPath: string,
  provider: ProviderId,
  choice: ModelChoice
): Promise<{ chat: ChatRecord; created: boolean }> {
  const open = await getOpenChat(projectPath)
  const emptyOpen = open && open.messageCount === 0 && open.providerSessionId === null
  if (open && emptyOpen && open.provider === provider) {
    return { chat: open, created: false }
  }
  return mutate(projectPath, (index) => {
    const record = newChatRecord({
      id: randomUUID(),
      provider,
      now: Date.now(),
      model: choice.model,
      effort: choice.effort
    })
    const base = open && emptyOpen ? removeChat(index, open.id) : index
    return { index: addChat(base, record), result: { chat: record, created: true } }
  })
}

export function openChatById(projectPath: string, chatId: string): Promise<ChatRecord | null> {
  return mutate(projectPath, (index) => {
    const chat = findChat(index, chatId)
    return chat ? { index: openOnly(index, chatId), result: chat } : { index, result: null }
  })
}

export function renameChatById(
  projectPath: string,
  chatId: string,
  title: string
): Promise<boolean> {
  return mutate(projectPath, (index) =>
    findChat(index, chatId)
      ? { index: patchChat(index, chatId, { title }), result: true }
      : { index, result: false }
  )
}

// Pinning moves a chat to the top of the list without touching its time.
export function pinChatById(
  projectPath: string,
  chatId: string,
  pinned: boolean
): Promise<boolean> {
  return mutate(projectPath, (index) =>
    findChat(index, chatId)
      ? { index: patchChat(index, chatId, { pinned }), result: true }
      : { index, result: false }
  )
}

// DELETE: the chat leaves the index and Mya's own text. The provider's files stay. The boss fight
// of its Claude session is forgotten with it.
export async function deleteChatById(
  projectPath: string,
  chatId: string
): Promise<ChatRecord | null> {
  const gone = await mutate(projectPath, (index) => {
    const chat = findChat(index, chatId)
    return chat ? { index: removeChat(index, chatId), result: chat } : { index, result: null }
  })
  if (!gone) return null
  await removeTranscript(transcriptDir(projectPath), chatId).catch((err: unknown) =>
    console.error('[chats] Could not delete the chat text:', err)
  )
  endSession(projectPath, gone.providerSessionId)
  return gone
}

// FORK AS NEW CHAT: a chat that carries the old one's context. Claude only: `sessionId` is the
// forked Claude session. The old chat's text is copied, and the fork opens.
export async function addFork(
  projectPath: string,
  source: ChatRecord,
  sessionId: string
): Promise<ChatRecord> {
  const id = randomUUID()
  const now = Date.now()
  const copy = await readTranscript(transcriptDir(projectPath), source.id).catch(() => null)
  if (copy && copy.length > 0) {
    await writeTranscript(transcriptDir(projectPath), id, copy)
  }
  const record: ChatRecord = {
    ...source,
    id,
    title: `${source.title} (fork)`,
    createdAt: now,
    updatedAt: now,
    messageCount: copy ? copy.length : source.messageCount,
    pinned: false,
    providerSessionId: sessionId
  }
  return mutate(projectPath, (index) => ({ index: addChat(index, record), result: record }))
}

// --- Sessions: the provider's own id for a chat ---------------------------------------------

export function getChatSession(projectPath: string, chatId: string): Promise<string | null> {
  return read(projectPath, (index) => findChat(index, chatId)?.providerSessionId ?? null)
}

// Saves the chat's session id, or forgets it with null. A session that is replaced ends.
export async function setChatSession(
  projectPath: string,
  chatId: string,
  sessionId: string | null
): Promise<void> {
  const ended = await mutate(projectPath, (index) => {
    const chat = findChat(index, chatId)
    if (!chat || chat.providerSessionId === sessionId) return { index, result: null }
    return {
      index: patchChat(index, chatId, { providerSessionId: sessionId }),
      result: { old: chat.providerSessionId }
    }
  })
  if (ended) endSession(projectPath, ended.old)
}

// --- The chat's own model choice and theme -------------------------------------------------

// The open chat's saved choice, or null when it has none yet.
export function getChatChoice(projectPath: string): Promise<ModelChoice | null> {
  return read(projectPath, (index) => {
    const chat = openChatOf(index)
    return chat?.model ? { model: chat.model, effort: chat.effort ?? 'auto' } : null
  })
}

// Saves the open chat's choice. A chat's provider is set when it is made and never changes, so a
// pick of another provider's model is not saved (the caller checks first and says why).
export async function setChatChoice(projectPath: string, choice: ModelChoice): Promise<void> {
  await mutate(projectPath, (index) => {
    const chat = openChatOf(index)
    if (!chat) return { index, result: undefined }
    if (chat.model === choice.model && chat.effort === choice.effort) {
      return { index, result: undefined }
    }
    return {
      index: patchChat(index, chat.id, { model: choice.model, effort: choice.effort }),
      result: undefined
    }
  })
}

export function getChatTheme(projectPath: string): Promise<ThemeChoice | null> {
  return read(projectPath, (index) => {
    const chat = openChatOf(index)
    return chat?.themeId && chat.fade !== null ? { themeId: chat.themeId, fade: chat.fade } : null
  })
}

// Saves the open chat's own theme, or clears it with null (ALL CHATS).
export async function setChatTheme(projectPath: string, theme: ThemeChoice | null): Promise<void> {
  if (theme !== null) await ensureOpenChat(projectPath)
  await mutate(projectPath, (index) => {
    const chat = openChatOf(index)
    if (!chat) return { index, result: undefined }
    const same =
      (chat.themeId ?? null) === (theme?.themeId ?? null) && chat.fade === (theme?.fade ?? null)
    if (same) return { index, result: undefined }
    return {
      index: patchChat(index, chat.id, {
        themeId: theme?.themeId ?? null,
        fade: theme?.fade ?? null
      }),
      result: undefined
    }
  })
}

// A theme was deleted: every chat in every project that held it goes back to the default theme.
export function dropThemeFromChats(themeId: string): Promise<void> {
  return queue(async () => {
    let names: string[]
    try {
      names = await readdir(chatsDir())
    } catch {
      return
    }
    const changed: string[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const id = name.slice(0, -'.json'.length)
      const held = cache.get(id)
      const read = held ? null : await readIndexFile(indexFile(id))
      if (read && read.state !== 'ok') continue
      const index = held ?? settled((read as { index: ChatIndex }).index)
      if (!index.chats.some((chat) => chat.themeId === themeId)) continue
      const next: ChatIndex = {
        ...index,
        chats: index.chats.map((chat) =>
          chat.themeId === themeId ? { ...chat, themeId: null, fade: null } : chat
        )
      }
      cache.set(id, next)
      try {
        await writeIndexFile(indexFile(id), next)
        changed.push(id)
      } catch (err) {
        console.error('[chats] Could not save the chat index:', err)
      }
    }
    if (changed.length > 0) broadcast()
  })
}

// --- Messages -----------------------------------------------------------------------------

// A message of mine or a reply, kept as text. It counts, moves the chat's time, and titles an
// untitled chat from the first message of mine that has text.
export async function recordMessage(
  projectPath: string,
  chatId: string,
  message: TranscriptMessage
): Promise<void> {
  const title =
    message.role === 'user' && message.text.trim() !== '' ? makeTitle(message.text) : null
  const exists = await mutate(projectPath, (index) =>
    findChat(index, chatId)
      ? { index: withMessage(index, chatId, { at: message.at, title }), result: true }
      : { index, result: false }
  )
  if (!exists) return
  try {
    await appendTranscript(transcriptDir(projectPath), chatId, message)
  } catch (err) {
    console.error('[chats] Could not keep a message:', err)
  }
}

export function readChatMessages(
  projectPath: string,
  chatId: string
): Promise<TranscriptMessage[] | null> {
  return readTranscript(transcriptDir(projectPath), chatId)
}
