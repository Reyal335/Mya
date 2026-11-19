import { appendFile, mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import type { TranscriptMessage } from '../shared/chats.ts'
import { isObject, serialQueue } from './jsonFile.ts'
import { writeFileSafely } from './safeWrite.ts'

// The text of a chat that Mya keeps itself, one file per chat: userData/chats/<project-id>/<chat
// id>.jsonl, one JSON line per message. It holds what I typed and what the replies said, as plain
// text: no tool cards, no images, no tool output. It feeds search, EXPORT .MD, and the message
// count, and it goes when the chat is deleted. The providers' own files are never touched.

const queue = serialQueue()

// A chat id is made by Mya (a UUID), but the file name comes from it, so it is checked.
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/

export function isSafeChatId(id: string): boolean {
  return SAFE_ID.test(id)
}

export function transcriptFile(dir: string, chatId: string): string {
  if (!isSafeChatId(chatId)) throw new Error('That is not a chat id.')
  return join(dir, `${chatId}.jsonl`)
}

function encode(message: TranscriptMessage): string {
  return JSON.stringify({
    r: message.role === 'user' ? 'u' : 'a',
    t: message.at,
    x: message.text,
    ...(message.images ? { i: message.images } : {}),
    ...(message.agent ? { c: message.agent } : {})
  })
}

// null for a line that is not a message.
export function decode(line: string): TranscriptMessage | null {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }
  if (!isObject(raw) || (raw.r !== 'u' && raw.r !== 'a') || typeof raw.x !== 'string') return null
  return {
    role: raw.r === 'u' ? 'user' : 'assistant',
    text: raw.x,
    at: typeof raw.t === 'number' && Number.isFinite(raw.t) ? raw.t : 0,
    ...(typeof raw.i === 'number' && raw.i > 0 ? { images: Math.floor(raw.i) } : {}),
    ...(typeof raw.c === 'string' && raw.c !== '' ? { agent: raw.c } : {})
  }
}

export function appendTranscript(
  dir: string,
  chatId: string,
  message: TranscriptMessage
): Promise<void> {
  return queue(async () => {
    const file = transcriptFile(dir, chatId)
    await mkdir(dir, { recursive: true })
    await appendFile(file, `${encode(message)}\n`, 'utf8')
  })
}

// Every message in order, or null when the chat has no file. A line that cannot be read, such as
// one cut short by a crash, is skipped.
export function readTranscript(dir: string, chatId: string): Promise<TranscriptMessage[] | null> {
  return queue(async () => {
    let text: string
    try {
      text = await readFile(transcriptFile(dir, chatId), 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
    const messages: TranscriptMessage[] = []
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      const message = decode(line)
      if (message) messages.push(message)
    }
    return messages
  })
}

// Replaces a chat's whole file. A fork copies its parent's this way, and a chat made before
// Mya kept text is filled from its saved session.
export function writeTranscript(
  dir: string,
  chatId: string,
  messages: TranscriptMessage[]
): Promise<void> {
  return queue(async () => {
    const file = transcriptFile(dir, chatId)
    await mkdir(dir, { recursive: true })
    await writeFileSafely(file, messages.map((message) => `${encode(message)}\n`).join(''))
  })
}

export function removeTranscript(dir: string, chatId: string): Promise<void> {
  return queue(async () => {
    await rm(transcriptFile(dir, chatId), { force: true })
  })
}
