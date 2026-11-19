import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addChat,
  emptyIndex,
  isLocked,
  legacyProvider,
  legacyToRecord,
  listOrder,
  loadIndex,
  newChatRecord,
  parseIndex,
  parseLegacyChats,
  projectId,
  readIndexFile,
  removeChat,
  withMessage,
  writeIndexFile,
  type ChatRecord,
  type LegacyChat
} from './chatIndex.ts'

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mya-chat-index-'))
}

const record = (id: string, extra: Partial<ChatRecord> = {}): ChatRecord => ({
  ...newChatRecord({ id, provider: 'claude', now: 1000 }),
  ...extra
})

// --- reading ---------------------------------------------------------------------------

test('index: an object with chats is read, with the open chat checked', () => {
  const index = parseIndex({
    version: 1,
    openId: 'b',
    chats: [{ id: 'a', provider: 'codex', title: 'One', createdAt: 5, pinned: true }, { id: 'b' }]
  })
  assert.ok(index)
  assert.equal(index.openId, 'b')
  assert.equal(index.chats[0].provider, 'codex')
  assert.equal(index.chats[0].pinned, true)
  assert.equal(index.chats[0].updatedAt, 5)
  assert.equal(index.chats[1].title, 'New chat')
  assert.equal(index.chats[1].provider, 'claude')
})

test('index: a bare array of chats is read too', () => {
  const index = parseIndex([{ id: 'a' }])
  assert.equal(index?.chats.length, 1)
  assert.equal(index?.openId, null)
})

test('index: a duplicate id, an entry without one, and an unknown open chat are dropped', () => {
  const index = parseIndex({ openId: 'nope', chats: [{ id: 'a' }, { id: 'a' }, { title: 'x' }, 7] })
  assert.equal(index?.chats.length, 1)
  assert.equal(index?.openId, null)
})

test('index: something that is not an index is null', () => {
  assert.equal(parseIndex('text'), null)
  assert.equal(parseIndex({ version: 1 }), null)
  assert.equal(parseIndex(null), null)
})

test('index file: a missing file is an empty list', async () => {
  const dir = await scratch()
  try {
    const read = await readIndexFile(join(dir, 'none.json'))
    assert.equal(read.state, 'missing')
    assert.deepEqual(read.index, emptyIndex())
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('index file: a corrupt file is an empty list, kept aside, and never a crash', async () => {
  const dir = await scratch()
  try {
    const path = join(dir, 'p.json')
    await writeFile(path, '{ "chats": [ {"id": "a"')
    const read = await readIndexFile(path)
    assert.equal(read.state, 'corrupt')
    assert.deepEqual(read.index.chats, [])
    assert.deepEqual((await readdir(dir)).sort(), ['p.json.bad'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('index file: valid JSON of the wrong shape is also kept aside', async () => {
  const dir = await scratch()
  try {
    const path = join(dir, 'p.json')
    await writeFile(path, '"just a string"')
    const read = await readIndexFile(path)
    assert.equal(read.state, 'corrupt')
    assert.ok((await readdir(dir)).includes('p.json.bad'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('index file: a byte order mark does not matter', async () => {
  const dir = await scratch()
  try {
    const path = join(dir, 'p.json')
    await writeFile(path, `\uFEFF${JSON.stringify({ chats: [{ id: 'a' }] })}`)
    const read = await readIndexFile(path)
    assert.equal(read.state, 'ok')
    assert.equal(read.index.chats.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// --- writing ---------------------------------------------------------------------------

test('index file: a write comes back as it went in and leaves no temporary file', async () => {
  const dir = await scratch()
  try {
    const path = join(dir, 'nested', 'p.json')
    const index = addChat(addChat(emptyIndex(), record('a')), record('b', { pinned: true }), false)
    await writeIndexFile(path, index)
    const read = await readIndexFile(path)
    assert.equal(read.state, 'ok')
    assert.deepEqual(read.index, index)
    assert.deepEqual(await readdir(join(dir, 'nested')), ['p.json'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('index file: a second write replaces the first whole', async () => {
  const dir = await scratch()
  try {
    const path = join(dir, 'p.json')
    await writeIndexFile(path, addChat(emptyIndex(), record('a')))
    await writeIndexFile(path, addChat(emptyIndex(), record('b')))
    const read = await readIndexFile(path)
    assert.deepEqual(
      read.index.chats.map((chat) => chat.id),
      ['b']
    )
    assert.deepEqual(await readdir(dir), ['p.json'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('index file: a write that fails leaves the file as it was and no temporary file', async () => {
  const dir = await scratch()
  try {
    // A folder where the file should go: the rename cannot replace it.
    const path = join(dir, 'p.json')
    await mkdir(path)
    await writeFile(join(path, 'keep.txt'), 'kept')
    await assert.rejects(writeIndexFile(path, addChat(emptyIndex(), record('a'))))
    assert.deepEqual((await readdir(dir)).sort(), ['p.json'])
    assert.equal(await readFile(join(path, 'keep.txt'), 'utf8'), 'kept')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// --- migration -------------------------------------------------------------------------

const legacy = (extra: Partial<LegacyChat> = {}): LegacyChat => ({
  sessionId: null,
  codexSessionId: null,
  geminiSessionId: null,
  model: null,
  effort: null,
  themeId: null,
  fade: null,
  ...extra
})

test('migration: chats.json is read per project', () => {
  const found = parseLegacyChats({
    version: 1,
    chats: {
      'C:/work/app': {
        sessionId: 's1',
        model: 'sonnet',
        effort: 'high',
        themeId: 'tokyo-night',
        fade: 60
      },
      'C:/work/other': { codexSessionId: 'c1' },
      'C:/work/bad': 'nope'
    }
  })
  assert.deepEqual(Object.keys(found), ['C:/work/app', 'C:/work/other'])
  assert.equal(found['C:/work/app'].sessionId, 's1')
  assert.equal(found['C:/work/app'].fade, 60)
  assert.equal(found['C:/work/other'].codexSessionId, 'c1')
})

test('migration: anything else in chats.json is no chats', () => {
  assert.deepEqual(parseLegacyChats(undefined), {})
  assert.deepEqual(parseLegacyChats({ version: 2, chats: { a: {} } }), {})
  assert.deepEqual(parseLegacyChats([]), {})
})

test("migration: the provider is the saved model's when it has a session", () => {
  assert.deepEqual(
    legacyProvider(legacy({ sessionId: 's', codexSessionId: 'c', model: 'codex:o4-mini' })),
    { provider: 'codex', sessionId: 'c' }
  )
  assert.deepEqual(legacyProvider(legacy({ sessionId: 's', model: 'sonnet' })), {
    provider: 'claude',
    sessionId: 's'
  })
})

test("migration: else the first provider with a session, else the model's provider", () => {
  assert.deepEqual(legacyProvider(legacy({ sessionId: 's', model: 'gemini:gemini-2.5-pro' })), {
    provider: 'claude',
    sessionId: 's'
  })
  assert.deepEqual(legacyProvider(legacy({ geminiSessionId: 'g' })), {
    provider: 'gemini',
    sessionId: 'g'
  })
  assert.deepEqual(legacyProvider(legacy({ model: 'codex:o4-mini' })), {
    provider: 'codex',
    sessionId: null
  })
  assert.deepEqual(legacyProvider(legacy()), { provider: 'claude', sessionId: null })
})

test('migration: the record keeps the choice and theme, and drops a model of another provider', () => {
  const extra = { id: 'x', title: 'Fix it', createdAt: 10, updatedAt: 20, messageCount: 6 }
  const kept = legacyToRecord(
    legacy({ sessionId: 's', model: 'opus', effort: 'max', themeId: 't', fade: 40 }),
    extra
  )
  assert.equal(kept.provider, 'claude')
  assert.equal(kept.providerSessionId, 's')
  assert.equal(kept.model, 'opus')
  assert.equal(kept.effort, 'max')
  assert.equal(kept.themeId, 't')
  assert.equal(kept.fade, 40)
  assert.equal(kept.title, 'Fix it')
  assert.equal(kept.messageCount, 6)
  assert.equal(kept.pinned, false)

  const dropped = legacyToRecord(
    legacy({ sessionId: 's', model: 'codex:o4-mini', effort: 'low' }),
    extra
  )
  assert.equal(dropped.provider, 'claude')
  assert.equal(dropped.model, null)
  assert.equal(dropped.effort, null)
})

test('migration: no title makes it "New chat"', () => {
  const made = legacyToRecord(legacy(), {
    id: 'x',
    title: null,
    createdAt: 1,
    updatedAt: 0,
    messageCount: 0
  })
  assert.equal(made.title, 'New chat')
  assert.equal(made.updatedAt, 1)
})

test('migration: a missing index takes the old chat in once and opens it', async () => {
  const dir = await scratch()
  try {
    const path = join(dir, 'chats', 'p.json')
    let calls = 0
    const migrate = async (): Promise<ChatRecord> => {
      calls++
      return record('old', { title: 'Old chat', providerSessionId: 's' })
    }
    const first = await loadIndex(path, migrate)
    assert.equal(first.openId, 'old')
    assert.equal(first.chats[0].title, 'Old chat')
    // It was written: the second start finds it and migrates nothing.
    const second = await loadIndex(path, migrate)
    assert.equal(calls, 1)
    assert.deepEqual(second, first)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('migration: a project with no old chat gets no file', async () => {
  const dir = await scratch()
  try {
    const path = join(dir, 'p.json')
    const index = await loadIndex(path, async () => null)
    assert.deepEqual(index, emptyIndex())
    assert.deepEqual(await readdir(dir), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('migration: a corrupt index is not migrated over', async () => {
  const dir = await scratch()
  try {
    const path = join(dir, 'p.json')
    await writeFile(path, 'not json')
    let calls = 0
    const index = await loadIndex(path, async () => {
      calls++
      return record('old')
    })
    assert.equal(calls, 0)
    assert.deepEqual(index.chats, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('migration: a migration that throws is an empty list', async () => {
  const dir = await scratch()
  try {
    const index = await loadIndex(join(dir, 'p.json'), async () => {
      throw new Error('session file unreadable')
    })
    assert.deepEqual(index, emptyIndex())
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// --- changing an index -------------------------------------------------------------------

test('chats: the first message with text titles an untitled chat, only once', () => {
  let index = addChat(emptyIndex(), record('a'))
  index = withMessage(index, 'a', { at: 2000, title: 'Fix the tests' })
  assert.equal(index.chats[0].title, 'Fix the tests')
  assert.equal(index.chats[0].messageCount, 1)
  assert.equal(index.chats[0].updatedAt, 2000)
  index = withMessage(index, 'a', { at: 3000, title: 'Something else' })
  assert.equal(index.chats[0].title, 'Fix the tests')
  assert.equal(index.chats[0].messageCount, 2)
})

test('chats: a renamed chat keeps its name when a message arrives', () => {
  let index = addChat(emptyIndex(), record('a', { title: 'Mine' }))
  index = withMessage(index, 'a', { at: 2000, title: 'From the message' })
  assert.equal(index.chats[0].title, 'Mine')
})

test('chats: a reply (no title) counts but does not title', () => {
  let index = addChat(emptyIndex(), record('a'))
  index = withMessage(index, 'a', { at: 2000, title: null })
  assert.equal(index.chats[0].title, 'New chat')
  assert.equal(index.chats[0].messageCount, 1)
})

test('chats: a chat is locked once it has a message or a session', () => {
  assert.equal(isLocked(record('a')), false)
  assert.equal(isLocked(record('a', { messageCount: 1 })), true)
  assert.equal(isLocked(record('a', { providerSessionId: 's' })), true)
})

test('chats: removing the open chat opens the most recent one left', () => {
  let index = addChat(emptyIndex(), record('a', { updatedAt: 10 }))
  index = addChat(index, record('b', { updatedAt: 30 }), false)
  index = addChat(index, record('c', { updatedAt: 20 }), true)
  assert.equal(index.openId, 'c')
  const after = removeChat(index, 'c')
  assert.equal(after.openId, 'b')
  assert.deepEqual(
    after.chats.map((chat) => chat.id),
    ['a', 'b']
  )
  // Removing a chat that is not open keeps the open one.
  assert.equal(removeChat(index, 'a').openId, 'c')
  assert.equal(removeChat(removeChat(removeChat(index, 'a'), 'b'), 'c').openId, null)
})

test('chats: pinned chats come first, each group newest first', () => {
  const order = listOrder([
    record('old', { updatedAt: 1 }),
    record('new', { updatedAt: 9 }),
    record('pinOld', { updatedAt: 2, pinned: true }),
    record('pinNew', { updatedAt: 8, pinned: true })
  ]).map((chat) => chat.id)
  assert.deepEqual(order, ['pinNew', 'pinOld', 'new', 'old'])
})

test('project id: the same folder always gets the same short name', () => {
  assert.equal(projectId('/work/app'), projectId('/work/app'))
  assert.notEqual(projectId('/work/app'), projectId('/work/other'))
  assert.match(projectId('/work/app'), /^[0-9a-f]{16}$/)
})
