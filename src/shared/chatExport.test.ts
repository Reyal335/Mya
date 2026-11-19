import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatToMarkdown, exportFileName } from './chatExport.ts'

const at = new Date(2026, 10, 19, 14, 41).getTime()

test('export: a title, a header line, and each message in order', () => {
  const md = chatToMarkdown(
    { title: 'Boss card sizing', provider: 'claude', createdAt: at },
    [
      { role: 'user', text: 'Can you check the cards?', at },
      { role: 'assistant', text: 'They match **DESIGN.md**.', at }
    ],
    'Firefly'
  )
  assert.equal(
    md,
    [
      '# Boss card sizing',
      '',
      'Claude chat · started 2026-11-19 14:41 · 2 messages',
      '',
      '## You · 2026-11-19 14:41',
      '',
      'Can you check the cards?',
      '',
      '## Firefly · 2026-11-19 14:41',
      '',
      'They match **DESIGN.md**.',
      ''
    ].join('\n')
  )
})

test('export: a chat with no messages is still a file', () => {
  const md = chatToMarkdown({ title: 'New chat', provider: 'codex', createdAt: at }, [], 'Mya')
  assert.equal(md, '# New chat\n\nCodex chat · started 2026-11-19 14:41 · 0 messages\n')
})

test('export: an agent call and images are written down', () => {
  const md = chatToMarkdown(
    { title: 't', provider: 'gemini', createdAt: at },
    [{ role: 'user', text: '', at, images: 2, agent: 'Argenti' }],
    'Mya'
  )
  assert.match(md, /_Agent called: Argenti_/)
  assert.match(md, /_2 images attached_/)
})

test('file name: characters a file cannot hold are taken out', () => {
  assert.equal(exportFileName('Fix: a/b\\c?'), 'Fix a b c.md')
  assert.equal(exportFileName('   '), 'chat.md')
  assert.equal(exportFileName('ends with dots...'), 'ends with dots.md')
})

test('file name: cut to 60 characters', () => {
  const name = exportFileName('x'.repeat(100))
  assert.equal(name, `${'x'.repeat(60)}.md`)
})
