import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  launchDataOf,
  launchFolder,
  launchRequestOf,
  readLaunchData,
  samePath,
  secondInstanceRequest
} from './launchRules.ts'

// These paths are Windows paths: on another system they would resolve against its own roots.
const onWindows = { skip: process.platform !== 'win32' }

test('launch request: the arguments after the program, and the folder', () => {
  assert.deepEqual(launchRequestOf(['mya.exe', 'C:\\work'], false, 'C:\\here'), {
    args: ['C:\\work'],
    cwd: 'C:\\here'
  })
  assert.deepEqual(launchRequestOf(['electron', '.', 'x'], true, 'C:\\here'), {
    args: ['x'],
    cwd: 'C:\\here'
  })
})

test('launch data: marked with mya 1 and carries the request', () => {
  assert.deepEqual(launchDataOf({ args: ['a'], cwd: 'C:\\here' }), {
    mya: 1,
    args: ['a'],
    cwd: 'C:\\here'
  })
})

test('launch data: the good shape is read', onWindows, () => {
  assert.deepEqual(readLaunchData({ mya: 1, args: ['a', 'b'], cwd: 'C:\\here' }), {
    args: ['a', 'b'],
    cwd: 'C:\\here'
  })
  assert.deepEqual(readLaunchData({ mya: 1, args: [], cwd: 'C:\\here' }), {
    args: [],
    cwd: 'C:\\here'
  })
})

test('launch data: a bad shape is null', onWindows, () => {
  const good = { mya: 1, args: ['a'], cwd: 'C:\\here' }
  assert.equal(readLaunchData(null), null)
  assert.equal(readLaunchData(undefined), null)
  assert.equal(readLaunchData('x'), null)
  assert.equal(readLaunchData([good]), null)
  assert.equal(readLaunchData({ args: ['a'], cwd: 'C:\\here' }), null)
  assert.equal(readLaunchData({ ...good, mya: 2 }), null)
  assert.equal(readLaunchData({ ...good, args: 'a' }), null)
  assert.equal(readLaunchData({ ...good, args: ['a', 1] }), null)
  assert.equal(readLaunchData({ ...good, args: new Array(65).fill('a') }), null)
  assert.equal(readLaunchData({ ...good, args: ['a'.repeat(32768)] }), null)
  assert.equal(readLaunchData({ ...good, cwd: 'here' }), null)
  assert.equal(readLaunchData({ ...good, cwd: '' }), null)
  assert.equal(readLaunchData({ ...good, cwd: 5 }), null)
  assert.equal(readLaunchData({ mya: 1, args: ['a'] }), null)
})

test('launch data: 64 arguments are still fine', onWindows, () => {
  const args = new Array(64).fill('a')
  assert.deepEqual(readLaunchData({ mya: 1, args, cwd: 'C:\\here' }), { args, cwd: 'C:\\here' })
})

test('second instance: what it sent wins', onWindows, () => {
  const sent = { mya: 1, args: ['.'], cwd: 'C:\\sent' }
  assert.deepEqual(secondInstanceRequest(['mya.exe', 'x'], 'C:\\lock', sent, false), {
    args: ['.'],
    cwd: 'C:\\sent'
  })
})

test('second instance: with nothing usable it falls back to argv and the working folder', () => {
  assert.deepEqual(secondInstanceRequest(['mya.exe', 'x'], 'C:\\lock', undefined, false), {
    args: ['x'],
    cwd: 'C:\\lock'
  })
  assert.deepEqual(secondInstanceRequest(['mya.exe', 'x'], 'C:\\lock', { mya: 2 }, false), {
    args: ['x'],
    cwd: 'C:\\lock'
  })
  assert.deepEqual(secondInstanceRequest(['electron', '.', 'x'], 'C:\\lock', null, true), {
    args: ['x'],
    cwd: 'C:\\lock'
  })
})

test('launch folder: a dot is the folder the command ran in', onWindows, () => {
  assert.equal(launchFolder({ args: ['.'], cwd: 'C:\\work' }), 'C:\\work')
})

test('launch folder: a relative path is read from that folder', onWindows, () => {
  assert.equal(launchFolder({ args: ['..\\x'], cwd: 'C:\\work\\a' }), 'C:\\work\\x')
  assert.equal(launchFolder({ args: ['sub'], cwd: 'C:\\work' }), 'C:\\work\\sub')
})

test('launch folder: an absolute path passes through', onWindows, () => {
  assert.equal(launchFolder({ args: ['D:\\other\\proj'], cwd: 'C:\\work' }), 'D:\\other\\proj')
})

test('launch folder: a switch is skipped and no folder is null', onWindows, () => {
  assert.equal(launchFolder({ args: ['--inspect', 'sub'], cwd: 'C:\\work' }), 'C:\\work\\sub')
  assert.equal(launchFolder({ args: [], cwd: 'C:\\work' }), null)
  assert.equal(launchFolder({ args: ['--inspect'], cwd: 'C:\\work' }), null)
})

test('launch folder: a bare drive is the root of that drive', onWindows, () => {
  assert.equal(launchFolder({ args: ['D:"'], cwd: 'C:\\work' }), 'D:\\')
})

test('same path: on Windows case and a trailing separator do not matter', onWindows, () => {
  assert.equal(samePath('C:\\Work\\Proj', 'c:\\work\\proj\\', 'win32'), true)
  assert.equal(samePath('C:\\Work\\Proj', 'C:\\Work\\Other', 'win32'), false)
})

test('same path: elsewhere case matters', () => {
  assert.equal(samePath('/work/Proj', '/work/proj', 'linux'), false)
  assert.equal(samePath('/work/proj', '/work/proj/', 'linux'), true)
})
