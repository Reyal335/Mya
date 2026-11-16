import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PASTE_MAX_CHARS,
  PASTE_MAX_LINES,
  buildMessage,
  countLines,
  fenceFor,
  formatSize,
  shouldChip,
  splitFenced
} from './composerMessage.ts'

const lines = (count: number): string =>
  Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')

test('limits', () => {
  assert.equal(PASTE_MAX_LINES, 20)
  assert.equal(PASTE_MAX_CHARS, 2000)
})

test('countLines: empty is 0 lines', () => {
  assert.equal(countLines(''), 0)
})

test('countLines: no newline, trailing newline, blank lines', () => {
  assert.equal(countLines('a'), 1)
  assert.equal(countLines('a\n'), 1)
  assert.equal(countLines('a\n\n'), 2)
  assert.equal(countLines('a\nb'), 2)
  assert.equal(countLines('a\nb\n'), 2)
  assert.equal(countLines('\n'), 1)
  assert.equal(countLines('a\n\n\nb'), 4)
  assert.equal(countLines('a\n\nb\n'), 3)
})

test('countLines: CRLF and CR only', () => {
  assert.equal(countLines('a\r\nb'), 2)
  assert.equal(countLines('a\r\nb\r\n'), 2)
  assert.equal(countLines('a\r\n\r\nb'), 3)
  assert.equal(countLines('a\rb\rc'), 3)
  assert.equal(countLines('a\rb\rc\r'), 3)
  assert.equal(countLines('a\r\n'), 1)
  assert.equal(countLines('a\r'), 1)
  assert.equal(countLines('a\n\rb'), 3)
})

// The count as it was first written: every break in the text with a trailing one cut off.
function countLinesByMatch(text: string): number {
  if (text === '') return 0
  const body = text.replace(/(?:\r\n|\r|\n)$/, '')
  return (body.match(/\r\n|\r|\n/g)?.length ?? 0) + 1
}

test('countLines: the same count as matching every break, for every short text', () => {
  const parts = ['a', '\n', '\r']
  let level = ['']
  for (let length = 0; length <= 7; length++) {
    for (const text of level)
      assert.equal(countLines(text), countLinesByMatch(text), JSON.stringify(text))
    level = level.flatMap((text) => parts.map((part) => text + part))
  }
})

test('countLines: millions of lines', () => {
  assert.equal(countLines('\n'.repeat(3_000_000)), 3_000_000)
  assert.equal(countLines('a\r\n'.repeat(1_000_000) + 'b'), 1_000_001)
})

test('shouldChip: line boundary', () => {
  assert.equal(shouldChip(lines(20)), false)
  assert.equal(shouldChip(lines(20) + '\n'), false)
  assert.equal(shouldChip(lines(21)), true)
  assert.equal(shouldChip(lines(21) + '\n'), true)
  assert.equal(shouldChip(lines(20) + '\n\n'), true)
})

test('shouldChip: character boundary', () => {
  assert.equal(shouldChip('a'.repeat(2000)), false)
  assert.equal(shouldChip('a'.repeat(2001)), true)
  // The count is characters (UTF-16 units), not bytes.
  assert.equal(shouldChip('é'.repeat(2000)), false)
})

test('shouldChip: empty and short text', () => {
  assert.equal(shouldChip(''), false)
  assert.equal(shouldChip('hello'), false)
})

test('shouldChip: a long text with few lines, and a short one with many', () => {
  assert.equal(shouldChip('a'.repeat(2001) + '\n'), true)
  assert.equal(shouldChip('\n'.repeat(21)), true)
  assert.equal(shouldChip('\n'.repeat(20)), false)
})

test('formatSize: bytes', () => {
  assert.equal(formatSize(''), '0 B')
  assert.equal(formatSize('a'), '1 B')
  assert.equal(formatSize('a'.repeat(512)), '512 B')
  assert.equal(formatSize('a'.repeat(1023)), '1023 B')
})

test('formatSize: kilobytes', () => {
  assert.equal(formatSize('a'.repeat(1024)), '1.0 KB')
  assert.equal(formatSize('a'.repeat(1536)), '1.5 KB')
  assert.equal(formatSize('a'.repeat(10 * 1024)), '10.0 KB')
})

test('formatSize: megabytes', () => {
  assert.equal(formatSize('a'.repeat(1024 * 1024)), '1.0 MB')
  assert.equal(formatSize('a'.repeat(2411725)), '2.3 MB')
})

test('formatSize: the KB to MB rounding edge steps up the unit', () => {
  // 1048524 bytes is 1023.949 KB, which still rounds to 1023.9.
  assert.equal(formatSize('a'.repeat(1048524)), '1023.9 KB')
  // 1048525 bytes is 1023.950 KB, which would print as "1024.0 KB".
  assert.equal(formatSize('a'.repeat(1048525)), '1.0 MB')
  assert.equal(formatSize('a'.repeat(1048575)), '1.0 MB')
})

test('formatSize: counts UTF-8 bytes, not characters', () => {
  assert.equal(formatSize('é'), '2 B')
  assert.equal(formatSize('€'), '3 B')
  assert.equal(formatSize('😀'), '4 B')
  // 512 two-byte characters are 1024 bytes.
  assert.equal(formatSize('é'.repeat(512)), '1.0 KB')
})

test('fenceFor: no backticks gives 3', () => {
  assert.equal(fenceFor(''), '```')
  assert.equal(fenceFor('plain text'), '```')
})

test('fenceFor: inline single and double backticks give 3', () => {
  assert.equal(fenceFor('use `x` here'), '```')
  assert.equal(fenceFor('``x``'), '```')
})

test('fenceFor: a run of 3 gives 4, a run of 5 gives 6', () => {
  assert.equal(fenceFor('```'), '````')
  assert.equal(fenceFor('a\n```js\nb\n```\n'), '````')
  assert.equal(fenceFor('`````'), '``````')
})

test('fenceFor: several separate runs use the longest', () => {
  assert.equal(fenceFor('` `` ```` ``'), '`````')
  assert.equal(fenceFor('``` and ``'), '````')
  assert.equal(fenceFor('`a``b```c`'), '````')
})

test('buildMessage: no chunks returns typed unchanged', () => {
  assert.equal(buildMessage('hello', []), 'hello')
  assert.equal(buildMessage('  hello\n', []), '  hello\n')
  assert.equal(buildMessage('', []), '')
  assert.equal(buildMessage('   ', []), '   ')
})

test('buildMessage: typed and one chunk', () => {
  assert.equal(buildMessage('look at this', ['a\nb']), 'look at this\n\n```\na\nb\n```')
})

test('buildMessage: typed is used exactly as typed', () => {
  assert.equal(buildMessage('  hi  ', ['x']), '  hi  \n\n```\nx\n```')
})

test('buildMessage: blank typed has no leading separator', () => {
  assert.equal(buildMessage('', ['a']), '```\na\n```')
  assert.equal(buildMessage('   \n ', ['a']), '```\na\n```')
})

test('buildMessage: two chunks keep their order', () => {
  assert.equal(buildMessage('t', ['one', 'two']), 't\n\n```\none\n```\n\n```\ntwo\n```')
  assert.equal(buildMessage('', ['one', 'two']), '```\none\n```\n\n```\ntwo\n```')
})

test('buildMessage: a chunk with a 3-backtick run gets a 4-backtick fence', () => {
  assert.equal(buildMessage('', ['```js\nx\n```']), '````\n```js\nx\n```\n````')
})

test('buildMessage: a chunk with a 4-backtick run gets a 5-backtick fence', () => {
  assert.equal(buildMessage('', ['````\nx\n````']), '`````\n````\nx\n````\n`````')
})

test('buildMessage: each chunk gets its own fence', () => {
  assert.equal(buildMessage('', ['```', 'plain']), '````\n```\n````\n\n```\nplain\n```')
})

test('buildMessage: removes one trailing newline, \\n or \\r\\n', () => {
  assert.equal(buildMessage('', ['a\n']), '```\na\n```')
  assert.equal(buildMessage('', ['a\r\n']), '```\na\n```')
  assert.equal(buildMessage('', ['a\n\n']), '```\na\n\n```')
  assert.equal(buildMessage('', ['a\r\n\r\n']), '```\na\r\n\n```')
})

test('buildMessage: a chunk with no trailing newline is kept as is', () => {
  assert.equal(buildMessage('', ['a\nb']), '```\na\nb\n```')
  assert.equal(buildMessage('', ['a  ']), '```\na  \n```')
})

test('buildMessage: typed text left in an unclosed fence gets it closed before the chunk', () => {
  const message = buildMessage('```\nfoo', ['chunk'])
  assert.equal(message, '```\nfoo\n```\n\n```\nchunk\n```')
  assert.deepEqual(splitFenced(message), [
    { kind: 'code', text: 'foo', language: null },
    { kind: 'code', text: 'chunk', language: null }
  ])
})

test('buildMessage: the closing fence matches the opener, with text and a language before', () => {
  const four = buildMessage('````\nfoo', ['chunk'])
  assert.equal(four, '````\nfoo\n````\n\n```\nchunk\n```')
  assert.deepEqual(splitFenced(four), [
    { kind: 'code', text: 'foo', language: null },
    { kind: 'code', text: 'chunk', language: null }
  ])

  const lang = buildMessage('see this:\n\n```js\nconst a = 1', ['chunk'])
  assert.deepEqual(splitFenced(lang), [
    { kind: 'text', text: 'see this:' },
    { kind: 'code', text: 'const a = 1', language: 'js' },
    { kind: 'code', text: 'chunk', language: null }
  ])

  // A shorter fence inside does not close the longer one, so the closing fence is 4.
  assert.equal(buildMessage('````\nx\n```', ['c']), '````\nx\n```\n````\n\n```\nc\n```')
})

test('buildMessage: typed text that ends in a line break gets no extra blank line', () => {
  assert.equal(buildMessage('```\nfoo\n', ['chunk']), '```\nfoo\n```\n\n```\nchunk\n```')
  assert.equal(buildMessage('```\r\nfoo\r\n', ['chunk']), '```\r\nfoo\r\n```\n\n```\nchunk\n```')
  assert.deepEqual(splitFenced(buildMessage('```\nfoo\n', ['chunk'])), [
    { kind: 'code', text: 'foo', language: null },
    { kind: 'code', text: 'chunk', language: null }
  ])
})

test('buildMessage: a chunk with fences of its own stays apart from an unclosed typed fence', () => {
  const chunk = '```js\nx\n```'
  assert.deepEqual(splitFenced(buildMessage('```\nfoo', [chunk, 'plain'])), [
    { kind: 'code', text: 'foo', language: null },
    { kind: 'code', text: chunk, language: null },
    { kind: 'code', text: 'plain', language: null }
  ])
})

test('buildMessage: typed text with a closed fence is not changed', () => {
  assert.equal(buildMessage('```\nfoo\n```', ['chunk']), '```\nfoo\n```\n\n```\nchunk\n```')
  assert.equal(
    buildMessage('a\n\n```js\nfoo\n```\nb', ['c']),
    'a\n\n```js\nfoo\n```\nb\n\n```\nc\n```'
  )
})

test('buildMessage: inline triple backticks are not a fence', () => {
  assert.equal(buildMessage('use ```x``` here', ['c']), 'use ```x``` here\n\n```\nc\n```')
  assert.equal(buildMessage('```js```', ['c']), '```js```\n\n```\nc\n```')
  assert.equal(buildMessage('a ``` b\nc', ['c']), 'a ``` b\nc\n\n```\nc\n```')
})

test('buildMessage: without chunks an unclosed fence is left as typed', () => {
  assert.equal(buildMessage('```\nfoo', []), '```\nfoo')
})
test('splitFenced: no fences', () => {
  assert.deepEqual(splitFenced('just words'), [{ kind: 'text', text: 'just words' }])
  assert.deepEqual(splitFenced('a\n\nb\n'), [{ kind: 'text', text: 'a\n\nb\n' }])
  assert.deepEqual(splitFenced('inline `code` and ``more``'), [
    { kind: 'text', text: 'inline `code` and ``more``' }
  ])
  assert.deepEqual(splitFenced('```js```'), [{ kind: 'text', text: '```js```' }])
})

test('splitFenced: empty message has no segments', () => {
  assert.deepEqual(splitFenced(''), [])
})

test('splitFenced: one block with a language', () => {
  assert.deepEqual(splitFenced('```ts\nconst a = 1\nconst b = 2\n```'), [
    { kind: 'code', text: 'const a = 1\nconst b = 2', language: 'ts' }
  ])
})

test('splitFenced: language is the first word of the info string', () => {
  assert.deepEqual(splitFenced('```  python   title="x"  \nprint(1)\n```'), [
    { kind: 'code', text: 'print(1)', language: 'python' }
  ])
})

test('splitFenced: a block with no language', () => {
  assert.deepEqual(splitFenced('```\nx\n```'), [{ kind: 'code', text: 'x', language: null }])
})

test('splitFenced: two blocks with text between and around', () => {
  assert.deepEqual(splitFenced('before\n\n```js\na\n```\n\nmiddle\n\n```\nb\n```\n\nafter'), [
    { kind: 'text', text: 'before' },
    { kind: 'code', text: 'a', language: 'js' },
    { kind: 'text', text: 'middle' },
    { kind: 'code', text: 'b', language: null },
    { kind: 'text', text: 'after' }
  ])
})

test('splitFenced: two blocks back to back drop the empty text between', () => {
  assert.deepEqual(splitFenced('```\na\n```\n\n```\nb\n```'), [
    { kind: 'code', text: 'a', language: null },
    { kind: 'code', text: 'b', language: null }
  ])
  assert.deepEqual(splitFenced('```\na\n```\n```\nb\n```'), [
    { kind: 'code', text: 'a', language: null },
    { kind: 'code', text: 'b', language: null }
  ])
})

test('splitFenced: text keeps its characters, only the block separators go', () => {
  assert.deepEqual(splitFenced('  indented  \n\nsecond line  \n\n\n```\nx\n```\n\n\n  tail\n'), [
    { kind: 'text', text: '  indented  \n\nsecond line  ' },
    { kind: 'code', text: 'x', language: null },
    { kind: 'text', text: '  tail\n' }
  ])
})

test('splitFenced: text before and after', () => {
  assert.deepEqual(splitFenced('hello\n```\nx\n```\nbye'), [
    { kind: 'text', text: 'hello' },
    { kind: 'code', text: 'x', language: null },
    { kind: 'text', text: 'bye' }
  ])
})

test('splitFenced: a closing fence at the very end with a trailing newline', () => {
  assert.deepEqual(splitFenced('```\nx\n```\n'), [{ kind: 'code', text: 'x', language: null }])
})

test('splitFenced: an unclosed fence stays text', () => {
  assert.deepEqual(splitFenced('```js\nconst a = 1'), [
    { kind: 'text', text: '```js\nconst a = 1' }
  ])
  assert.deepEqual(splitFenced('before\n\n```\nnever closed\n'), [
    { kind: 'text', text: 'before\n\n```\nnever closed\n' }
  ])
})

test('splitFenced: a shorter fence does not close a longer one', () => {
  assert.deepEqual(splitFenced('````\nx\n```'), [{ kind: 'text', text: '````\nx\n```' }])
})

test('splitFenced: a closing line with other text does not close', () => {
  assert.deepEqual(splitFenced('```\nx\n``` not yet\ny\n```'), [
    { kind: 'code', text: 'x\n``` not yet\ny', language: null }
  ])
})

test('splitFenced: an unclosed fence before a good block keeps its text', () => {
  assert.deepEqual(splitFenced('````\nx\n\n```\ny\n```'), [
    { kind: 'text', text: '````\nx' },
    { kind: 'code', text: 'y', language: null }
  ])
})

test('splitFenced: a 4-backtick block holds a 3-backtick line', () => {
  assert.deepEqual(splitFenced('````md\n```js\nx\n```\n````'), [
    { kind: 'code', text: '```js\nx\n```', language: 'md' }
  ])
})

test('splitFenced: indented fences', () => {
  assert.deepEqual(splitFenced('  ```js\n  code\n  ```'), [
    { kind: 'code', text: '  code', language: 'js' }
  ])
  assert.deepEqual(splitFenced('   ```\nx\n   ```   '), [
    { kind: 'code', text: 'x', language: null }
  ])
  // Four spaces of indent is an indented code block, not a fence.
  assert.deepEqual(splitFenced('    ```\nx\n    ```'), [
    { kind: 'text', text: '    ```\nx\n    ```' }
  ])
})

test('splitFenced: an empty code block', () => {
  assert.deepEqual(splitFenced('```\n```'), [{ kind: 'code', text: '', language: null }])
  assert.deepEqual(splitFenced('a\n\n```js\n```\n\nb'), [
    { kind: 'text', text: 'a' },
    { kind: 'code', text: '', language: 'js' },
    { kind: 'text', text: 'b' }
  ])
})

test('splitFenced: keeps blank lines and CRLF inside a block', () => {
  assert.deepEqual(splitFenced('```\r\na\r\n\r\nb\r\n```'), [
    { kind: 'code', text: 'a\r\n\r\nb', language: null }
  ])
})

test('splitFenced: many unclosed fences of one size stay text, in time that grows with the lines', () => {
  // 20000 lines take about 20 ms. A scan that starts again from every opener takes
  // about 16 s here, so a bound of 2 s tells them apart with room on both sides.
  const message = Array.from({ length: 20_000 }, () => '```js').join('\n')
  const started = performance.now()
  const segments = splitFenced(message)
  const elapsed = performance.now() - started
  assert.deepEqual(segments, [{ kind: 'text', text: message }])
  assert.ok(elapsed < 2000, `took ${Math.round(elapsed)} ms`)
})

test('round trip: typed text then one code block per chunk', () => {
  const chunks = ['one\ntwo\n', 'three', 'a\r\nb\r\n', 'x\n\ny\n\n']
  const message = buildMessage('please read these', chunks)
  assert.deepEqual(splitFenced(message), [
    { kind: 'text', text: 'please read these' },
    { kind: 'code', text: 'one\ntwo', language: null },
    { kind: 'code', text: 'three', language: null },
    { kind: 'code', text: 'a\r\nb', language: null },
    { kind: 'code', text: 'x\n\ny\n', language: null }
  ])
})

test('round trip: blank typed text gives only code blocks', () => {
  assert.deepEqual(splitFenced(buildMessage('  \n', ['a', 'b\n'])), [
    { kind: 'code', text: 'a', language: null },
    { kind: 'code', text: 'b', language: null }
  ])
})

test('round trip: chunks that hold fences of their own', () => {
  const three = '```js\nconst a = 1\n```\n'
  const four = '````\n```\ninner\n```\n````'
  const lone = '```'
  const message = buildMessage('look:', [three, four, lone, 'plain'])
  assert.deepEqual(splitFenced(message), [
    { kind: 'text', text: 'look:' },
    { kind: 'code', text: '```js\nconst a = 1\n```', language: null },
    { kind: 'code', text: four, language: null },
    { kind: 'code', text: '```', language: null },
    { kind: 'code', text: 'plain', language: null }
  ])
})

test('round trip: typed text that keeps its inner blank lines and spaces', () => {
  const typed = '  first  \n\nsecond with `code`'
  assert.deepEqual(splitFenced(buildMessage(typed, ['x'])), [
    { kind: 'text', text: typed },
    { kind: 'code', text: 'x', language: null }
  ])
})

test('round trip: no chunks gives the typed text back as one segment', () => {
  assert.deepEqual(splitFenced(buildMessage('just typed', [])), [
    { kind: 'text', text: 'just typed' }
  ])
})
