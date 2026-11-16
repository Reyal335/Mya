import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'path'
import { callFacts, isClean, lineCount, lootFor, type TaskCall } from './loot.ts'

const project = resolve('/scratch/project')

let next = 0
function call(
  name: string,
  input: Record<string, unknown>,
  extra: Partial<TaskCall> = {}
): TaskCall {
  next += 1
  return {
    toolId: `t${next}`,
    name,
    ...callFacts(name, input, project),
    existed: null,
    state: 'done',
    ...extra
  }
}

test('lineCount: newlines, one trailing newline ignored, empty is 0', () => {
  assert.equal(lineCount(''), 0)
  assert.equal(lineCount('a'), 1)
  assert.equal(lineCount('a\n'), 1)
  assert.equal(lineCount('a\nb'), 2)
  assert.equal(lineCount('a\r\nb\r\n'), 2)
  assert.equal(lineCount('a\n\n'), 2)
  assert.equal(lineCount(undefined), 0)
})

test('callFacts: Edit, MultiEdit, Write, and a relative path', () => {
  assert.deepEqual(
    callFacts('Edit', { file_path: 'a.txt', old_string: 'x', new_string: 'x\ny' }, project),
    {
      path: join(project, 'a.txt'),
      added: 2,
      removed: 1
    }
  )
  const multi = callFacts(
    'MultiEdit',
    {
      file_path: join(project, 'b.ts'),
      edits: [
        { old_string: 'a', new_string: 'b\nc' },
        { old_string: 'd\ne\nf', new_string: '' },
        'junk'
      ]
    },
    project
  )
  assert.deepEqual(multi, { path: join(project, 'b.ts'), added: 2, removed: 4 })
  assert.deepEqual(callFacts('Write', { file_path: 'c.md', content: '# A\n\nB\n' }, project), {
    path: join(project, 'c.md'),
    added: 3,
    removed: 0
  })
  assert.deepEqual(callFacts('Bash', { command: 'ls' }, project), {
    path: null,
    added: 0,
    removed: 0
  })
})

test('lootFor: the DONE example: add a line to notes.txt and create todo.md', () => {
  const loot = lootFor(
    [
      call('Read', { file_path: 'notes.txt' }),
      call('Edit', {
        file_path: 'notes.txt',
        old_string: 'last line',
        new_string: 'last line\nnew line'
      }),
      call(
        'Write',
        { file_path: 'todo.md', content: '# Todo\n\n- one\n- two\n' },
        { existed: false }
      )
    ],
    project
  )
  assert.deepEqual(loot.items, [
    { path: 'notes.txt', added: 2, removed: 1, isNew: false },
    { path: 'todo.md', added: 4, removed: 0, isNew: true }
  ])
  assert.equal(loot.added, 6)
  assert.equal(loot.removed, 1)
  assert.deepEqual(loot.found, [])
})

test('lootFor: several edits to one file add up, in the order of first touch', () => {
  const loot = lootFor(
    [
      call('Edit', { file_path: 'b.ts', old_string: 'a', new_string: 'b' }),
      call('Edit', { file_path: 'a.ts', old_string: 'a', new_string: 'b\nc' }),
      call('Edit', { file_path: 'b.ts', old_string: 'x\ny', new_string: 'z' })
    ],
    project
  )
  assert.deepEqual(
    loot.items.map((item) => [item.path, item.added, item.removed]),
    [
      ['b.ts', 2, 3],
      ['a.ts', 2, 1]
    ]
  )
})

test('lootFor: a Write to a file that existed is not NEW, nor is Edit then Write', () => {
  const loot = lootFor(
    [
      call('Write', { file_path: 'old.md', content: 'a' }, { existed: true }),
      call('Edit', { file_path: 'x.md', old_string: 'a', new_string: 'b' }),
      call('Write', { file_path: 'x.md', content: 'c' }, { existed: false })
    ],
    project
  )
  assert.deepEqual(
    loot.items.map((item) => item.isNew),
    [false, false]
  )
})

test('lootFor: denied, failed, and stopped calls do not count', () => {
  const loot = lootFor(
    [
      call('Write', { file_path: 'denied.md', content: 'a' }, { existed: false, state: 'denied' }),
      call(
        'Edit',
        { file_path: 'failed.md', old_string: 'a', new_string: 'b' },
        { state: 'failed' }
      ),
      call('Write', { file_path: 'stopped.md', content: 'a' }, { state: 'stopped' }),
      // The first Write was denied, so this one is the first touch.
      call('Write', { file_path: 'denied.md', content: 'a\nb' }, { existed: false })
    ],
    project
  )
  assert.deepEqual(loot.items, [{ path: 'denied.md', added: 2, removed: 0, isNew: true }])
})

test('lootFor: a read-only quest lists the distinct files read', () => {
  const loot = lootFor(
    [
      call('Read', { file_path: 'a.ts' }),
      call('Grep', { pattern: 'x' }),
      call('Read', { file_path: join(project, 'a.ts') }),
      call('Read', { file_path: 'src/b.ts' }),
      call('Read', { file_path: 'c.ts' }, { state: 'failed' })
    ],
    project
  )
  assert.deepEqual(loot.items, [])
  assert.deepEqual(loot.found, ['a.ts', 'src/b.ts'])
  assert.equal(loot.foundCount, 2)
})

test('lootFor: a file outside the project keeps its full path', () => {
  const outside = resolve('/elsewhere/notes.txt')
  const loot = lootFor(
    [call('Write', { file_path: outside, content: 'a' }, { existed: true })],
    project
  )
  assert.equal(loot.items[0].path, outside)
})

test('isClean: a failed or denied call takes the bonus away', () => {
  assert.equal(isClean([call('Read', { file_path: 'a' })]), true)
  assert.equal(isClean([call('Read', { file_path: 'a' }, { state: 'failed' })]), false)
  assert.equal(isClean([call('Write', { file_path: 'a' }, { state: 'denied' })]), false)
  assert.equal(isClean([]), true)
})
