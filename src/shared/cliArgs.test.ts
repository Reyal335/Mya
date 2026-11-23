import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  appFolderArg,
  cleanFolderArg,
  notFolderText,
  parseShimArgs,
  tooManyText,
  unknownOptionText,
  usageLines,
  usageText,
  userArgs,
  versionText
} from './cliArgs.ts'

const parse = (...args: string[]): ReturnType<typeof parseShimArgs> => parseShimArgs(args, 'mya')

test('shim args: nothing means open with no folder', () => {
  assert.deepEqual(parse(), { kind: 'open', folder: null })
})

test('shim args: a dot is a folder', () => {
  assert.deepEqual(parse('.'), { kind: 'open', folder: '.' })
})

test('shim args: a stray quote, space, or trailing backslash keeps the right path', () => {
  assert.deepEqual(parse('C:\\x"'), { kind: 'open', folder: 'C:\\x' })
  assert.deepEqual(parse('C:\\x" '), { kind: 'open', folder: 'C:\\x' })
  assert.deepEqual(parse('C:\\x\\'), { kind: 'open', folder: 'C:\\x\\' })
})

test('shim args: a bare drive is read as its root', () => {
  assert.deepEqual(parse('C:"'), { kind: 'open', folder: 'C:\\' })
  assert.equal(cleanFolderArg('d:'), 'd:\\')
  assert.equal(cleanFolderArg('C:\\'), 'C:\\')
})

test('shim args: --version and --help', () => {
  assert.deepEqual(parse('--version'), { kind: 'version' })
  assert.deepEqual(parse('--help'), { kind: 'help' })
  assert.deepEqual(parse('--help', '--version'), { kind: 'help' })
  assert.deepEqual(parse('--version', 'a'), { kind: 'version' })
})

test('shim args: /? is --help, and only that exact text', () => {
  assert.deepEqual(parse('/?'), { kind: 'help' })
  assert.deepEqual(parse('/?', '--version'), { kind: 'help' })
  assert.deepEqual(parse('/?', 'a', 'b'), {
    kind: 'error',
    message: 'mya: give one folder at most'
  })
  assert.deepEqual(parse('/c'), { kind: 'open', folder: '/c' })
  assert.deepEqual(parse('/??'), { kind: 'open', folder: '/??' })
})

test('shim args: two folders are one too many, even with a bad option after them', () => {
  assert.deepEqual(parse('a', 'b'), { kind: 'error', message: 'mya: give one folder at most' })
  assert.deepEqual(parse('a', 'b', '--bogus'), {
    kind: 'error',
    message: 'mya: unknown option "--bogus"'
  })
})

test('shim args: an unknown option fails with its exact text', () => {
  assert.deepEqual(parse('--bogus'), { kind: 'error', message: 'mya: unknown option "--bogus"' })
  assert.deepEqual(parse('--Help'), { kind: 'error', message: 'mya: unknown option "--Help"' })
  assert.deepEqual(parse('-'), { kind: 'error', message: 'mya: unknown option "-"' })
  assert.deepEqual(parse('--version=1'), {
    kind: 'error',
    message: 'mya: unknown option "--version=1"'
  })
})

test('shim args: an empty argument is ignored', () => {
  assert.deepEqual(parse(''), { kind: 'open', folder: null })
  assert.deepEqual(parse('', 'a'), { kind: 'open', folder: 'a' })
})

test('shim args: shell characters in a folder are kept as they are', () => {
  assert.deepEqual(parse('a & b (1) 100% !x'), { kind: 'open', folder: 'a & b (1) 100% !x' })
})

test('app folder: Chromium switches before or after the folder are skipped', () => {
  assert.equal(appFolderArg(['--allow-file-access-from-files', 'C:\\work']), 'C:\\work')
  assert.equal(appFolderArg(['C:\\work', '--allow-file-access-from-files']), 'C:\\work')
  assert.equal(appFolderArg(['--user-data-dir=C:\\data', '.']), '.')
})

test('app folder: switches only, or nothing, is no folder', () => {
  assert.equal(appFolderArg(['--inspect', '--no-sandbox']), null)
  assert.equal(appFolderArg([]), null)
  assert.equal(appFolderArg(['']), null)
})

test('app folder: the first folder wins', () => {
  assert.equal(appFolderArg(['a', 'b']), 'a')
})

test('app folder: a stray quote is cleaned and a bare drive is the root', () => {
  assert.equal(appFolderArg(['C:\\x" ']), 'C:\\x')
  assert.equal(appFolderArg(['C:"']), 'C:\\')
})

test('user args: packaged, everything after the program', () => {
  assert.deepEqual(userArgs(['mya.exe', 'C:\\work'], false), ['C:\\work'])
  assert.deepEqual(userArgs(['mya.exe'], false), [])
})

test('user args: in development the app path is skipped too', () => {
  assert.deepEqual(userArgs(['electron', '.', 'x'], true), ['x'])
  assert.deepEqual(userArgs(['electron', '.'], true), [])
})

test('user args: in development, switches before the app path are skipped', () => {
  assert.deepEqual(userArgs(['electron', '--inspect=1', 'C:\\app', 'x'], true), ['x'])
})

test('texts: the exact wording', () => {
  assert.equal(versionText('1.0.0'), 'Mya 1.0.0')
  assert.equal(notFolderText('C:\\x'), 'Could not open C:\\x. It is not a folder.')
  assert.equal(tooManyText('mya'), 'mya: give one folder at most')
  assert.equal(unknownOptionText('mya-dev', '--x'), 'mya-dev: unknown option "--x"')
  assert.equal(usageText('mya').split('\n')[0], 'Usage: mya [FOLDER]')
})

test('texts: no usage line holds a character a shim script would have to escape', () => {
  for (const line of usageLines('mya')) {
    assert.doesNotMatch(line, /[<>|&^%!"()']/, line)
  }
})
