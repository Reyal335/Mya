import { createHash } from 'crypto'
import { mkdir, readFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { DEFAULT_CHAT_TITLE, type ChatSummary } from '../shared/chats.ts'
import { providerOf, type ProviderId } from '../shared/models.ts'
import { isValidFade } from '../shared/themes.ts'
import { isObject, setAside, writeJsonFile } from './jsonFile.ts'

// A project's chat index, kept in userData/chats/<project-id>.json:
//   { version: 1, openId, chats: [{ id, provider, title, createdAt, updatedAt, messageCount,
//     pinned, providerSessionId, model, effort, themeId, fade }] }
// `model`, `effort`, `themeId` and `fade` are the chat's own model choice and chat theme (null
// when it has none), which used to live in chats.json. A bare array of chats is read too.
// Pure apart from reading and writing the one file it is given: nothing here imports Electron,
// so it is tested on its own.

const VERSION = 1

export const PROVIDER_IDS: readonly ProviderId[] = ['claude', 'codex', 'gemini']

export type ChatRecord = {
  id: string
  // Set when the chat is made. It can change only while the chat has no message and no session.
  provider: ProviderId
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
  pinned: boolean
  // The provider's own id for this chat: a Claude session, a Codex thread, or a Gemini session.
  providerSessionId: string | null
  model: string | null
  effort: string | null
  themeId: string | null
  fade: number | null
}

export type ChatIndex = { version: 1; openId: string | null; chats: ChatRecord[] }

export function emptyIndex(): ChatIndex {
  return { version: VERSION, openId: null, chats: [] }
}

// A short stable name for a project's folder. Case does not matter on Windows.
export function projectId(projectPath: string): string {
  const resolved = resolve(projectPath).replace(/\\/g, '/')
  const normal = process.platform === 'win32' ? resolved.toLowerCase() : resolved
  return createHash('sha1').update(normal).digest('hex').slice(0, 16)
}

// --- Reading what the file says ----------------------------------------------------------

function whole(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

function optString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function parseRecord(raw: unknown): ChatRecord | null {
  if (!isObject(raw)) return null
  const id = optString(raw.id)
  if (id === null) return null
  const provider = (PROVIDER_IDS as readonly unknown[]).includes(raw.provider)
    ? (raw.provider as ProviderId)
    : 'claude'
  const createdAt = whole(raw.createdAt, 0)
  const title =
    typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title : DEFAULT_CHAT_TITLE
  return {
    id,
    provider,
    title,
    createdAt,
    updatedAt: whole(raw.updatedAt, createdAt),
    messageCount: whole(raw.messageCount, 0),
    pinned: raw.pinned === true,
    providerSessionId: optString(raw.providerSessionId),
    model: optString(raw.model),
    effort: optString(raw.effort),
    themeId: optString(raw.themeId),
    fade: isValidFade(raw.fade) ? raw.fade : null
  }
}

// null when the value is not an index at all.
export function parseIndex(raw: unknown): ChatIndex | null {
  const list = Array.isArray(raw)
    ? raw
    : isObject(raw) && Array.isArray(raw.chats)
      ? raw.chats
      : null
  if (list === null) return null
  const seen = new Set<string>()
  const chats: ChatRecord[] = []
  for (const entry of list) {
    const record = parseRecord(entry)
    if (!record || seen.has(record.id)) continue
    seen.add(record.id)
    chats.push(record)
  }
  const wanted = isObject(raw) ? optString(raw.openId) : null
  return {
    version: VERSION,
    openId: wanted !== null && seen.has(wanted) ? wanted : null,
    chats
  }
}

export type IndexRead = { index: ChatIndex; state: 'missing' | 'ok' | 'corrupt' }

const BOM = String.fromCharCode(0xfeff)

// A missing or corrupt file is an empty list, never a crash. A file that cannot be parsed is kept
// aside as <name>.bad.
export async function readIndexFile(path: string): Promise<IndexRead> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { index: emptyIndex(), state: 'missing' }
    }
    console.error('[chats] Could not read the chat index:', err)
    return { index: emptyIndex(), state: 'corrupt' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text.startsWith(BOM) ? text.slice(1) : text)
  } catch {
    await setAside(path)
    return { index: emptyIndex(), state: 'corrupt' }
  }
  const index = parseIndex(raw)
  if (!index) {
    await setAside(path)
    return { index: emptyIndex(), state: 'corrupt' }
  }
  return { index, state: 'ok' }
}

// Written through a temporary file and a rename, so the index is never left half written.
export async function writeIndexFile(path: string, index: ChatIndex): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeJsonFile(path, {
    version: VERSION,
    openId: index.openId,
    chats: index.chats
  })
}

// --- Changing an index (pure) --------------------------------------------------------------

export function newChatRecord(args: {
  id: string
  provider: ProviderId
  now: number
  model?: string | null
  effort?: string | null
  title?: string
}): ChatRecord {
  return {
    id: args.id,
    provider: args.provider,
    title: args.title ?? DEFAULT_CHAT_TITLE,
    createdAt: args.now,
    updatedAt: args.now,
    messageCount: 0,
    pinned: false,
    providerSessionId: null,
    model: args.model ?? null,
    effort: args.effort ?? null,
    themeId: null,
    fade: null
  }
}

// A chat with a message or a provider session belongs to its provider for good. Until then
// the provider follows the model picked for it.
export function isLocked(chat: ChatRecord): boolean {
  return chat.messageCount > 0 || chat.providerSessionId !== null
}

export function findChat(index: ChatIndex, id: string | null): ChatRecord | null {
  return id === null ? null : (index.chats.find((chat) => chat.id === id) ?? null)
}

export function openChatOf(index: ChatIndex): ChatRecord | null {
  return findChat(index, index.openId)
}

// The most recently active chat, or null.
export function mostRecent(chats: readonly ChatRecord[]): ChatRecord | null {
  let best: ChatRecord | null = null
  for (const chat of chats) {
    if (best === null || chat.updatedAt > best.updatedAt) best = chat
  }
  return best
}

// Adds a chat and, unless told not to, opens it.
export function addChat(index: ChatIndex, record: ChatRecord, open = true): ChatIndex {
  return {
    ...index,
    openId: open ? record.id : index.openId,
    chats: [...index.chats.filter((chat) => chat.id !== record.id), record]
  }
}

export function patchChat(
  index: ChatIndex,
  id: string,
  patch: Partial<Omit<ChatRecord, 'id'>>
): ChatIndex {
  if (!findChat(index, id)) return index
  return {
    ...index,
    chats: index.chats.map((chat) => (chat.id === id ? { ...chat, ...patch } : chat))
  }
}

export function openOnly(index: ChatIndex, id: string): ChatIndex {
  return findChat(index, id) && index.openId !== id ? { ...index, openId: id } : index
}

// Removing the open chat opens the most recent one left, or none.
export function removeChat(index: ChatIndex, id: string): ChatIndex {
  if (!findChat(index, id)) return index
  const chats = index.chats.filter((chat) => chat.id !== id)
  return {
    ...index,
    openId: index.openId === id ? (mostRecent(chats)?.id ?? null) : index.openId,
    chats
  }
}

// A message arrived. It counts, moves the chat's time, and, when it is the first with text of
// mine, gives an untitled chat its title.
export function withMessage(
  index: ChatIndex,
  id: string,
  args: { at: number; title: string | null }
): ChatIndex {
  const chat = findChat(index, id)
  if (!chat) return index
  return patchChat(index, id, {
    messageCount: chat.messageCount + 1,
    updatedAt: Math.max(chat.updatedAt, args.at),
    ...(args.title !== null && chat.title === DEFAULT_CHAT_TITLE ? { title: args.title } : {})
  })
}

// Pinned chats first, then the rest; each group newest first.
export function listOrder(chats: readonly ChatRecord[]): ChatRecord[] {
  return [...chats].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.updatedAt - a.updatedAt ||
      b.createdAt - a.createdAt ||
      (a.id < b.id ? -1 : 1)
  )
}

export function toSummary(chat: ChatRecord): ChatSummary {
  return {
    id: chat.id,
    provider: chat.provider,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: chat.messageCount,
    pinned: chat.pinned
  }
}

// --- Today's single chat per project, from chats.json --------------------------------------

// What the old chats.json kept for a project's one chat.
export type LegacyChat = {
  sessionId: string | null
  codexSessionId: string | null
  geminiSessionId: string | null
  model: string | null
  effort: string | null
  themeId: string | null
  fade: number | null
}

// { version: 1, chats: { <project path>: { sessionId?, codexSessionId?, ... } } }, as written
// before there were many chats. Anything that is not that reads as no chats.
export function parseLegacyChats(raw: unknown): Record<string, LegacyChat> {
  const out: Record<string, LegacyChat> = {}
  if (!isObject(raw) || raw.version !== 1 || !isObject(raw.chats)) return out
  for (const [path, entry] of Object.entries(raw.chats)) {
    if (!isObject(entry)) continue
    out[path] = {
      sessionId: optString(entry.sessionId),
      codexSessionId: optString(entry.codexSessionId),
      geminiSessionId: optString(entry.geminiSessionId),
      model: optString(entry.model),
      effort: optString(entry.effort),
      themeId: optString(entry.themeId),
      fade: isValidFade(entry.fade) ? entry.fade : null
    }
  }
  return out
}

// Which provider the old chat belonged to, and its session. The provider of the saved model
// when that provider has a session; else the first provider that has one; else the saved
// model's provider (AUTO is Claude).
export function legacyProvider(legacy: LegacyChat): {
  provider: ProviderId
  sessionId: string | null
} {
  const sessions: Record<ProviderId, string | null> = {
    claude: legacy.sessionId,
    codex: legacy.codexSessionId,
    gemini: legacy.geminiSessionId
  }
  const wanted = legacy.model ? providerOf(legacy.model) : 'claude'
  if (sessions[wanted] !== null) return { provider: wanted, sessionId: sessions[wanted] }
  const first = PROVIDER_IDS.find((provider) => sessions[provider] !== null)
  if (first) return { provider: first, sessionId: sessions[first] }
  return { provider: wanted, sessionId: null }
}

export function legacyToRecord(
  legacy: LegacyChat,
  extra: {
    id: string
    title: string | null
    createdAt: number
    updatedAt: number
    messageCount: number
  }
): ChatRecord {
  const { provider, sessionId } = legacyProvider(legacy)
  // A saved model of another provider cannot carry over: the chat belongs to its own.
  const modelFits = legacy.model !== null && providerOf(legacy.model) === provider
  return {
    id: extra.id,
    provider,
    title: extra.title && extra.title.trim() !== '' ? extra.title : DEFAULT_CHAT_TITLE,
    createdAt: extra.createdAt,
    updatedAt: Math.max(extra.updatedAt, extra.createdAt),
    messageCount: extra.messageCount,
    pinned: false,
    providerSessionId: sessionId,
    model: modelFits ? legacy.model : null,
    effort: modelFits ? legacy.effort : null,
    themeId: legacy.themeId,
    fade: legacy.themeId !== null ? legacy.fade : null
  }
}

// Reads a project's index. A missing file is where the old single chat moves in: `migrate`
// makes its record (or null when the project had none), and the index is written at once. A
// corrupt file is an empty list and is not migrated over.
export async function loadIndex(
  path: string,
  migrate: () => Promise<ChatRecord | null>
): Promise<ChatIndex> {
  const read = await readIndexFile(path)
  if (read.state !== 'missing') return read.index
  let record: ChatRecord | null = null
  try {
    record = await migrate()
  } catch (err) {
    console.error('[chats] Could not migrate the saved chat:', err)
  }
  if (!record) return read.index
  const index = addChat(read.index, record)
  try {
    await writeIndexFile(path, index)
  } catch (err) {
    console.error('[chats] Could not write the chat index:', err)
  }
  return index
}
