import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RAIL_BELOW, sidebarModeFor } from './useSidebarMode.ts'

test('sidebar: under 1100px with the party panel open it is a rail', () => {
  assert.equal(sidebarModeFor(960, 'open'), 'rail')
  assert.equal(sidebarModeFor(1099, 'open'), 'rail')
})

test('sidebar: at 1100px and wider it is the full sidebar', () => {
  assert.equal(RAIL_BELOW, 1100)
  assert.equal(sidebarModeFor(1100, 'open'), 'full')
  assert.equal(sidebarModeFor(1366, 'open'), 'full')
})

test('sidebar: with the party panel collapsed it stays full at any width', () => {
  assert.equal(sidebarModeFor(960, 'rail'), 'full')
  assert.equal(sidebarModeFor(1099, 'rail'), 'full')
})
