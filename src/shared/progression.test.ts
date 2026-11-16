import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classFor, levelCost, levelFor, MAX_LEVEL, xpFor } from './progression.ts'

test('classFor: the five classes from the DONE list', () => {
  assert.equal(classFor(['Read', 'Grep', 'Glob', 'Bash']).id, 'mage')
  assert.equal(classFor(null).id, 'hero')
  assert.equal(classFor(['Read', 'Write', 'Edit']).id, 'builder')
  assert.equal(classFor(['Edit', 'Bash']).id, 'knight')
  assert.equal(classFor(['Read', 'Grep']).id, 'scout')
})

test('classFor: reasons and deciding tools', () => {
  assert.deepEqual(classFor(['Read', 'Bash']), {
    id: 'mage',
    reason: 'Has Bash, no Edit or Write',
    deciding: ['Bash']
  })
  assert.equal(classFor(null).reason, 'No tools line: inherits every tool')
  assert.equal(classFor(['Read', 'Write', 'Edit']).reason, 'Has Write and Edit, no Bash')
  assert.deepEqual(classFor(['Edit', 'Bash']).deciding, ['Edit', 'Bash'])
  assert.equal(classFor(['Read']).reason, 'No Edit, Write, or Bash: reads only')
  assert.deepEqual(classFor(['Read']).deciding, [])
})

test('classFor: PowerShell is a shell, MultiEdit and NotebookEdit are edits', () => {
  assert.equal(classFor(['PowerShell']).id, 'mage')
  assert.equal(classFor(['MultiEdit', 'PowerShell']).id, 'knight')
  assert.equal(classFor(['NotebookEdit']).id, 'builder')
})

test('classFor: an empty tools line and MCP or Agent tools are SCOUT', () => {
  assert.equal(classFor([]).id, 'scout')
  assert.equal(classFor(['mcp__github__create_issue', 'Agent', 'WebFetch']).id, 'scout')
})

test('classFor: a permission-style entry counts by its tool name', () => {
  assert.equal(classFor(['Bash(git:*)']).id, 'mage')
})

test('levelFor: level 1 from 0, L to L+1 costs 100 + 50L', () => {
  assert.deepEqual(levelFor(0), { level: 1, intoLevel: 0, toNext: 150 })
  assert.deepEqual(levelFor(149), { level: 1, intoLevel: 149, toNext: 150 })
  assert.deepEqual(levelFor(150), { level: 2, intoLevel: 0, toNext: 200 })
  assert.deepEqual(levelFor(350), { level: 3, intoLevel: 0, toNext: 250 })
  assert.deepEqual(levelFor(360), { level: 3, intoLevel: 10, toNext: 250 })
})

test('levelFor: bad input is level 1, and the cap is 99', () => {
  assert.equal(levelFor(-5).level, 1)
  assert.equal(levelFor(Number.NaN).level, 1)
  let total = 0
  for (let level = 1; level < MAX_LEVEL; level++) total += levelCost(level)
  assert.deepEqual(levelFor(total), { level: 99, intoLevel: 0, toNext: 0 })
  assert.deepEqual(levelFor(total + 5000), { level: 99, intoLevel: 5000, toNext: 0 })
  assert.equal(levelFor(total - 1).level, 98)
})

test('xpFor: a BUILDER changing 2 files with no errors earns 85', () => {
  const xp = xpFor({ items: 2, found: 0, clean: true })
  assert.equal(xp.total, 85)
  assert.deepEqual(xp.lines, [
    { label: 'Quest', xp: 50 },
    { label: '2 items', xp: 10 },
    { label: 'No errors', xp: 25 }
  ])
})

test('xpFor: items cap at 50, one item is singular', () => {
  assert.equal(xpFor({ items: 30, found: 0, clean: false }).total, 100)
  assert.deepEqual(xpFor({ items: 1, found: 0, clean: false }).lines[1], {
    label: '1 item',
    xp: 5
  })
})

test('xpFor: a read-only quest earns 2 per file found, at most 20', () => {
  assert.equal(xpFor({ items: 0, found: 3, clean: true }).total, 50 + 6 + 25)
  assert.equal(xpFor({ items: 0, found: 40, clean: true }).total, 50 + 20 + 25)
  assert.deepEqual(xpFor({ items: 0, found: 1, clean: false }).lines[1], {
    label: '1 file found',
    xp: 2
  })
})

test('xpFor: files read do not count when files changed', () => {
  assert.equal(xpFor({ items: 1, found: 5, clean: false }).total, 55)
})

test('xpFor: no clean bonus, nothing found, and a boss bonus', () => {
  assert.deepEqual(xpFor({ items: 0, found: 0, clean: false }), {
    total: 50,
    lines: [{ label: 'Quest', xp: 50 }]
  })
  assert.equal(xpFor({ items: 0, found: 0, clean: true, boss: 100 }).total, 175)
})
