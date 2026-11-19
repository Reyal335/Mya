import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendTranscript,
  decode,
  isSafeChatId,
  readTranscript,
  removeTranscript,
  writeTranscript
} from './chatTranscript.ts'

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mya-transcript-'))
}

test('transcript: messages come back in the order they were added', async () => {
  const dir = await scratch()
  try {
    await appendTranscript(dir, 'chat-1', { role: 'user', text: 'hello', at: 1 })
    await appendTranscript(dir, 'chat-1', { role: 'assistant', text: 'hi\nthere', at: 2 })
    await appendTranscript(dir, 'chat-1', {
      role: 'user',
      text: '',
      at: 3,
      images: 2,
      agent: 'Argenti'
    })
    assert.deepEqual(await readTranscript(dir, 'chat-1'), [
      { role: 'user', text: 'hello', at: 1 },
      { role: 'assistant', text: 'hi\nthere', at: 2 },
      { role: 'user', text: '', at: 3, images: 2, agent: 'Argenti' }
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('transcript: a chat with no file is null, not an empty list', async () => {
  const dir = await scratch()
  try {
    assert.equal(await readTranscript(dir, 'nothing'), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('transcript: a line cut short by a crash is skipped', async () => {
  const dir = await scratch()
  try {
    await appendTranscript(dir, 'c', { role: 'user', text: 'one', at: 1 })
    await writeFile(
      join(dir, 'c.jsonl'),
      `${JSON.stringify({ r: 'u', t: 1, x: 'one' })}\n{"r":"a","t":2,"x":"cut o`
    )
    assert.deepEqual(await readTranscript(dir, 'c'), [{ role: 'user', text: 'one', at: 1 }])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('transcript: many appends at once all land, in order', async () => {
  const dir = await scratch()
  try {
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        appendTranscript(dir, 'c', { role: 'user', text: `m${i}`, at: i })
      )
    )
    const read = await readTranscript(dir, 'c')
    assert.deepEqual(
      read?.map((m) => m.text),
      Array.from({ length: 25 }, (_, i) => `m${i}`)
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('transcript: writing a whole file replaces it, and deleting removes it', async () => {
  const dir = await scratch()
  try {
    await appendTranscript(dir, 'c', { role: 'user', text: 'old', at: 1 })
    await writeTranscript(dir, 'c', [{ role: 'assistant', text: 'new', at: 5 }])
    assert.deepEqual(await readTranscript(dir, 'c'), [{ role: 'assistant', text: 'new', at: 5 }])
    await removeTranscript(dir, 'c')
    assert.equal(await readTranscript(dir, 'c'), null)
    assert.deepEqual(await readdir(dir), [])
    // Deleting what is not there is fine.
    await removeTranscript(dir, 'c')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('transcript: an id that could leave the folder is refused', async () => {
  const dir = await scratch()
  try {
    assert.equal(isSafeChatId('3f2a-9c'), true)
    assert.equal(isSafeChatId('../x'), false)
    assert.equal(isSafeChatId('a/b'), false)
    assert.equal(isSafeChatId(''), false)
    await assert.rejects(appendTranscript(dir, '../escape', { role: 'user', text: 'x', at: 1 }))
    await assert.rejects(readTranscript(dir, 'a\\b'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('transcript: a line that is not a message decodes to null', () => {
  assert.equal(decode('nope'), null)
  assert.equal(decode('{"r":"x","x":"a"}'), null)
  assert.equal(decode('{"r":"u"}'), null)
  assert.deepEqual(decode('{"r":"a","x":"ok"}'), { role: 'assistant', text: 'ok', at: 0 })
})
