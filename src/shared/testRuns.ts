// Test runs: which shell commands run the project's tests, and what their output
// says. Pure: the output is what the agent already produced; nothing is run here.
// Each format follows real output captured in src/shared/fixtures/test-runs/.

export type TestRef = {
  // The test file, the test class (dotnet, PHPUnit, Pest), or the package (go).
  // Forward slashes. null when the output does not say.
  file: string | null
  name: string
}

export type TestFile = { file: string; failed: number; total: number | null }

export type TestRunner =
  'jest' | 'vitest' | 'node' | 'pytest' | 'go' | 'cargo' | 'dotnet' | 'phpunit' | 'pest' | 'unknown'

export type TestRun = {
  runner: TestRunner
  // Tests that ran: passed + failed. Skipped tests never count. null when unknown.
  total: number | null
  passed: number | null
  failed: number | null
  skipped: number
  failing: TestRef[]
  passing: TestRef[]
  files: TestFile[]
  // full: every failure is named. summary: counts only (or names for some).
  // exit-code: nothing parsed; the exit code says pass or fail.
  parsed: 'full' | 'summary' | 'exit-code'
}

// --- Detecting a test run ---------------------------------------------------------

const RUNNERS = [
  'npm test',
  'npm run test',
  'pnpm test',
  'pnpm run test',
  'yarn test',
  'npx jest',
  'jest',
  'npx vitest',
  'vitest',
  'node --test',
  'pytest',
  'python -m pytest',
  'go test',
  'cargo test',
  'dotnet test',
  'php artisan test',
  'phpunit',
  'vendor/bin/pest'
]

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Whole words: "jest" in "npx jest --ci" and "node_modules/.bin/jest", but not in
// "jester", "my-jest-helper", or "jest.config.js".
const PATTERNS = RUNNERS.map(
  (phrase) =>
    new RegExp(`(^|[^\\w-])${phrase.split(' ').map(escape).join('\\s+')}($|[^\\w/.-])`, 'i')
)

// True when the command runs tests: a usual runner, or the project's own test command
// (matched as a substring).
export function isTestCommand(command: string, own: string | null = null): boolean {
  const ownCommand = own?.trim() ?? ''
  if (ownCommand !== '' && command.includes(ownCommand)) return true
  const unixy = command.replace(/\\/g, '/')
  return PATTERNS.some((pattern) => pattern.test(unixy))
}

// --- Parsing ----------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g

export function cleanOutput(output: string): string[] {
  return output.replace(ANSI, '').replace(/\r\n?/g, '\n').split('\n')
}

function filePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '')
}

const PASS_MARK = '[✓✔√]'
const FAIL_MARK = '[×✕✗✘✖⨯]'

type Counts = { passed: number; failed: number; skipped: number }
type Partial = {
  runner: TestRunner
  counts: Counts | null
  failing: TestRef[]
  passing: TestRef[]
  files: TestFile[]
}

function num(text: string | undefined): number {
  const n = Number.parseInt(text ?? '', 10)
  return Number.isFinite(n) ? n : 0
}

// "3 failed, 1 skipped, 5 passed, 9 total" or "3 failed | 5 passed | 1 skipped".
function countWords(text: string): Map<string, number> {
  const found = new Map<string, number>()
  for (const match of text.matchAll(/(\d+)\s+([a-z]+)/gi)) {
    const word = match[2].toLowerCase()
    found.set(word, (found.get(word) ?? 0) + num(match[1]))
  }
  return found
}

function uniqueRefs(refs: TestRef[]): TestRef[] {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const key = `${ref.file ?? ''}\u0000${ref.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function filesFromRefs(failing: TestRef[], known: TestFile[]): TestFile[] {
  const files = new Map<string, TestFile>()
  for (const entry of known) files.set(entry.file, { ...entry })
  for (const ref of failing) {
    if (ref.file === null) continue
    const entry = files.get(ref.file)
    if (!entry) files.set(ref.file, { file: ref.file, failed: 1, total: null })
    else if (!known.some((k) => k.file === ref.file)) entry.failed += 1
  }
  return [...files.values()]
}

// Jest: "PASS <file>" / "FAIL <file>", "● <suite> › <test>", and
// "Tests:       3 failed, 1 skipped, 5 passed, 9 total".
function jest(lines: string[]): Partial | null {
  const summary = lines.find((line) => /^Tests:\s.*\btotal\b/.test(line))
  if (!summary && !lines.some((line) => /^ ?(PASS|FAIL)\s+\S/.test(line))) return null
  if (!summary && !lines.some((line) => /^Test Suites:/.test(line))) return null
  const failing: TestRef[] = []
  const files: TestFile[] = []
  let current: string | null = null
  for (const line of lines) {
    // A colored header keeps a space before PASS or FAIL once the colors are gone.
    const header = /^ ?(PASS|FAIL)\s+(\S.*?)(?:\s+\([\d.]+\s*m?s\))?\s*$/.exec(line)
    if (header) {
      current = filePath(header[2])
      if (!files.some((f) => f.file === current))
        files.push({ file: current, failed: 0, total: null })
      continue
    }
    const failure = /^\s+● (.+)$/.exec(line)
    if (failure && current) {
      const name = failure[1].trim()
      if (/^Test suite failed to run$/.test(name) || /^Console$/.test(name)) continue
      failing.push({ file: current, name })
    }
  }
  const unique = uniqueRefs(failing)
  for (const entry of files) entry.failed = unique.filter((ref) => ref.file === entry.file).length
  let counts: Counts | null = null
  if (summary) {
    const words = countWords(summary.replace(/^Tests:/, ''))
    counts = {
      passed: words.get('passed') ?? 0,
      failed: words.get('failed') ?? 0,
      skipped: (words.get('skipped') ?? 0) + (words.get('todo') ?? 0)
    }
  }
  return { runner: 'jest', counts, failing: unique, passing: [], files }
}

// Vitest: "❯ <file> (4 tests | 1 failed | 1 skipped)", "FAIL  <file> > <suite> > <test>",
// verbose "✓ <file> > <suite> > <test>", and "Tests  3 failed | 5 passed | 1 skipped (9)".
function vitest(lines: string[]): Partial | null {
  const summary = lines.find((line) => /^\s*Tests\s{2,}.*\(\d+\)\s*$/.test(line))
  const hasFiles = lines.some((line) => /^\s*Test Files\s{2,}/.test(line))
  if (!summary && !hasFiles) return null
  const failing: TestRef[] = []
  const passing: TestRef[] = []
  const files: TestFile[] = []
  for (const line of lines) {
    const file = new RegExp(
      `^\\s*(?:${PASS_MARK}|${FAIL_MARK}|❯|↓)\\s+(\\S+)\\s+\\((\\d+) tests?((?:\\s*\\|\\s*\\d+ \\w+)*)\\)`
    ).exec(line)
    if (file) {
      const words = countWords(file[3])
      const total = num(file[2]) - (words.get('skipped') ?? 0) - (words.get('todo') ?? 0)
      files.push({ file: filePath(file[1]), failed: words.get('failed') ?? 0, total })
      continue
    }
    const fail = /^\s*FAIL\s+(\S+) > (.+?)\s*$/.exec(line)
    if (fail) {
      failing.push({ file: filePath(fail[1]), name: fail[2] })
      continue
    }
    const verbose = new RegExp(
      `^\\s*(${PASS_MARK}|${FAIL_MARK})\\s+(\\S+) > (.+?)(?:\\s+\\d+ms)?\\s*$`
    ).exec(line)
    if (verbose) {
      const ref = { file: filePath(verbose[2]), name: verbose[3] }
      if (new RegExp(PASS_MARK).test(verbose[1])) passing.push(ref)
      else failing.push(ref)
    }
  }
  let counts: Counts | null = null
  if (summary) {
    const words = countWords(summary.replace(/\(\d+\)\s*$/, ''))
    counts = {
      passed: words.get('passed') ?? 0,
      failed: words.get('failed') ?? 0,
      skipped: (words.get('skipped') ?? 0) + (words.get('todo') ?? 0)
    }
  }
  const unique = uniqueRefs(failing)
  return {
    runner: 'vitest',
    counts,
    failing: unique,
    passing: uniqueRefs(passing),
    files: filesFromRefs(unique, files)
  }
}

// node:test (spec reporter): "ℹ tests 6", "ℹ pass 3", "ℹ fail 2", "ℹ skipped 1", and under
// "✖ failing tests:", "test at <file>:5:3" then "✖ <test> (2.3ms)".
function nodeTest(lines: string[]): Partial | null {
  const info = (key: string): number | null => {
    const line = lines.find((l) => new RegExp(`^ℹ ${key} \\d+\\s*$`).test(l))
    return line ? num(line.split(' ')[2]) : null
  }
  const pass = info('pass')
  const fail = info('fail')
  if (pass === null || fail === null) return null
  const failing: TestRef[] = []
  const start = lines.findIndex((line) => /^✖ failing tests:/.test(line))
  if (start >= 0) {
    let file: string | null = null
    for (const line of lines.slice(start + 1)) {
      const at = /^test at (.+?):\d+:\d+\s*$/.exec(line)
      if (at) {
        file = filePath(at[1])
        continue
      }
      const failed = new RegExp(`^${FAIL_MARK} (.+?)(?: \\([\\d.]+m?s\\))?\\s*$`).exec(line)
      if (failed && file !== null) {
        failing.push({ file, name: failed[1] })
        file = null
      }
    }
  }
  const unique = uniqueRefs(failing)
  return {
    runner: 'node',
    counts: {
      passed: pass,
      failed: fail + (info('cancelled') ?? 0),
      skipped: (info('skipped') ?? 0) + (info('todo') ?? 0)
    },
    failing: unique,
    passing: [],
    files: filesFromRefs(unique, [])
  }
}

// pytest: "FAILED <file>::<test> - <reason>", verbose "<file>::<test> PASSED", progress
// "<file> .FF..F.", and "4 failed, 5 passed, 1 skipped in 0.89s".
function pytest(lines: string[]): Partial | null {
  const summary = [...lines]
    .reverse()
    .find((line) =>
      /\b\d+ (passed|failed|errors?|skipped|deselected|xfailed|xpassed|no tests ran)\b.* in [\d.]+s/.test(
        line
      )
    )
  const named = lines.some((line) => /^(FAILED|ERROR) \S+::/.test(line))
  if (!summary && !named) return null
  const failing: TestRef[] = []
  const passing: TestRef[] = []
  const files: TestFile[] = []
  let last: TestFile | null = null
  for (const line of lines) {
    const failed = /^(?:FAILED|ERROR) (\S+?)::(.+?)(?: - .*)?\s*$/.exec(line)
    if (failed) {
      failing.push({ file: filePath(failed[1]), name: failed[2] })
      continue
    }
    const verbose = /^(\S+?\.py)::(\S.*?) (PASSED|FAILED|ERROR|XPASS|XFAIL)\b/.exec(line)
    if (verbose) {
      const ref = { file: filePath(verbose[1]), name: verbose[2] }
      if (verbose[3] === 'FAILED' || verbose[3] === 'ERROR') failing.push(ref)
      else passing.push(ref)
      continue
    }
    const progress = /^(\S+\.py) ([.FEsxX]+)\s*(?:\[\s*\d+%\])?\s*$/.exec(line)
    const more = /^([.FEsxX]+)\s+\[\s*\d+%\]\s*$/.exec(line)
    const marks = progress ? progress[2] : more && last ? more[1] : null
    if (marks === null) continue
    if (progress) {
      last = { file: filePath(progress[1]), failed: 0, total: 0 }
      files.push(last)
    }
    if (!last) continue
    for (const mark of marks) {
      if (mark === 's') continue
      last.total = (last.total ?? 0) + 1
      if (mark === 'F' || mark === 'E') last.failed += 1
    }
  }
  let counts: Counts | null = null
  if (summary) {
    const words = countWords(summary)
    counts = {
      passed:
        (words.get('passed') ?? 0) + (words.get('xfailed') ?? 0) + (words.get('xpassed') ?? 0),
      failed: (words.get('failed') ?? 0) + (words.get('error') ?? 0) + (words.get('errors') ?? 0),
      skipped: words.get('skipped') ?? 0
    }
  }
  const unique = uniqueRefs(failing)
  return {
    runner: 'pytest',
    counts,
    failing: unique,
    passing: uniqueRefs(passing),
    files: filesFromRefs(unique, files)
  }
}

// go test: "--- FAIL: TestX (0.00s)", verbose "--- PASS: TestX", then the package line
// "FAIL\t<pkg>\t0.01s" or "ok  \t<pkg>\t0.01s". Without -v the total is unknown.
function goTest(lines: string[]): Partial | null {
  const packageLine =
    /^(ok|FAIL|---)\s+(\S+)\s+([\d.]+s|\(cached\)|\[no test files\]|\[build failed\])/
  const hasPackages = lines.some(
    (line) => /^(ok|FAIL)\s+\S+\s+/.test(line) && packageLine.test(line)
  )
  const hasTests = lines.some((line) => /^--- (FAIL|PASS|SKIP): /.test(line))
  if (!hasPackages && !hasTests) return null
  const failing: TestRef[] = []
  const passing: TestRef[] = []
  const skipped: TestRef[] = []
  let pending: { ref: TestRef; kind: 'fail' | 'pass' | 'skip' }[] = []
  const files: TestFile[] = []
  for (const line of lines) {
    // Top-level tests only: subtests are indented.
    const test = /^--- (FAIL|PASS|SKIP): (\S+)/.exec(line)
    if (test) {
      const kind = test[1] === 'FAIL' ? 'fail' : test[1] === 'PASS' ? 'pass' : 'skip'
      pending.push({ ref: { file: null, name: test[2] }, kind })
      continue
    }
    const pkg = /^(ok|FAIL)\s+(\S+)\s+/.exec(line)
    if (pkg && packageLine.test(line)) {
      const file = pkg[2]
      for (const entry of pending) entry.ref.file = file
      const failedHere = pending.filter((e) => e.kind === 'fail').length
      const ran = pending.filter((e) => e.kind !== 'skip').length
      files.push({ file, failed: failedHere, total: ran > failedHere ? ran : null })
      for (const entry of pending) {
        if (entry.kind === 'fail') failing.push(entry.ref)
        else if (entry.kind === 'pass') passing.push(entry.ref)
        else skipped.push(entry.ref)
      }
      pending = []
    }
  }
  for (const entry of pending) {
    if (entry.kind === 'fail') failing.push(entry.ref)
    else if (entry.kind === 'pass') passing.push(entry.ref)
  }
  // Without -v only failures are named, so there is no count: the named failures are a
  // floor. A failing package with no named test (a build error) is not a count either.
  const verbose = passing.length > 0
  return {
    runner: 'go',
    counts: verbose
      ? { passed: passing.length, failed: failing.length, skipped: skipped.length }
      : null,
    failing: uniqueRefs(failing),
    passing: uniqueRefs(passing),
    files: verbose ? files : files.map((f) => ({ ...f, total: null }))
  }
}

// cargo test: "Running unittests src/lib.rs (...)", "test a::b ... FAILED", and per binary
// "test result: FAILED. 37 passed; 3 failed; 0 ignored; ...".
function cargo(lines: string[]): Partial | null {
  const results = lines.filter((line) => /^test result: (ok|FAILED)\./.test(line))
  if (results.length === 0) return null
  const failing: TestRef[] = []
  const passing: TestRef[] = []
  let file: string | null = null
  for (const line of lines) {
    const running = /^\s*Running (?:unittests )?(\S+)/.exec(line)
    if (running) {
      file = filePath(running[1])
      continue
    }
    const test = /^test (\S+) \.\.\. (ok|FAILED)\s*$/.exec(line)
    if (test) (test[2] === 'ok' ? passing : failing).push({ file, name: test[1] })
  }
  const counts: Counts = { passed: 0, failed: 0, skipped: 0 }
  for (const line of results) {
    const words = countWords(line)
    counts.passed += words.get('passed') ?? 0
    counts.failed += words.get('failed') ?? 0
    counts.skipped += words.get('ignored') ?? 0
  }
  const unique = uniqueRefs(failing)
  return {
    runner: 'cargo',
    counts,
    failing: unique,
    passing: uniqueRefs(passing),
    files: filesFromRefs(unique, [])
  }
}

// dotnet test: "  Failed FxTests.MathTests.Multiplies [1 ms]" (the class stands in for the
// file), and per project "Failed!  - Failed:     3, Passed:     4, Skipped:     1, Total:     8".
function dotnet(lines: string[]): Partial | null {
  const results = lines.filter((line) =>
    /Failed:\s*\d+,\s*Passed:\s*\d+,\s*Skipped:\s*\d+,\s*Total:\s*\d+/.test(line)
  )
  // Verbose logging prints a block instead: "Total tests: 8", then "Passed: 4", "Failed: 3".
  const block = lines.findIndex((line) => /^Total tests: \d+/.test(line))
  if (results.length === 0 && block < 0) return null
  const failing: TestRef[] = []
  const passing: TestRef[] = []
  for (const line of lines) {
    const test = /^\s+(Failed|Passed)\s(\S.*?) \[[^\]]*\]\s*$/.exec(line)
    if (!test) continue
    const full = test[2]
    const params = full.indexOf('(')
    const head = params >= 0 ? full.slice(0, params) : full
    const dot = head.lastIndexOf('.')
    const ref =
      dot > 0 ? { file: head.slice(0, dot), name: full.slice(dot + 1) } : { file: null, name: full }
    ;(test[1] === 'Failed' ? failing : passing).push(ref)
  }
  const counts: Counts = { passed: 0, failed: 0, skipped: 0 }
  for (const line of results) {
    const m = /Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+)/.exec(line)
    if (!m) continue
    counts.failed += num(m[1])
    counts.passed += num(m[2])
    counts.skipped += num(m[3])
  }
  if (results.length === 0) {
    for (const line of lines.slice(block + 1, block + 6)) {
      const m = /^\s+(Passed|Failed|Skipped): (\d+)/.exec(line)
      if (!m) continue
      if (m[1] === 'Passed') counts.passed += num(m[2])
      else if (m[1] === 'Failed') counts.failed += num(m[2])
      else counts.skipped += num(m[2])
    }
  }
  const unique = uniqueRefs(failing)
  return {
    runner: 'dotnet',
    counts,
    failing: unique,
    passing: uniqueRefs(passing),
    files: filesFromRefs(unique, [])
  }
}

// Pest (and php artisan test): " FAIL  Tests\Unit\MathTest", " FAILED  Tests\Unit\MathTest >
// multiplies", and "Tests:    3 failed, 1 skipped, 3 passed (6 assertions)".
function pest(lines: string[]): Partial | null {
  const summary = lines.find((line) => /^\s*Tests:\s+.*\(\d+ assertions?\)/.test(line))
  if (!summary) return null
  const failing: TestRef[] = []
  for (const line of lines) {
    const failed = /^\s*FAILED\s+(\S+)\s+>\s+(.+?)\s*$/.exec(line)
    if (failed) failing.push({ file: filePath(failed[1]), name: failed[2].replace(/`/g, '') })
  }
  const words = countWords(summary.replace(/\(\d+ assertions?\)/, ''))
  const unique = uniqueRefs(failing)
  return {
    runner: 'pest',
    counts: {
      passed: words.get('passed') ?? 0,
      failed: (words.get('failed') ?? 0) + (words.get('errors') ?? 0) + (words.get('error') ?? 0),
      skipped:
        (words.get('skipped') ?? 0) + (words.get('todos') ?? 0) + (words.get('incomplete') ?? 0)
    },
    failing: unique,
    passing: [],
    files: filesFromRefs(unique, [])
  }
}

// PHPUnit: "Tests: 6, Assertions: 5, Failures: 2, Skipped: 1." or "OK (6 tests, 5 assertions)",
// with "1) MathTest::testMultiplies" under "There were 2 failures:" and "There was 1 error:".
function phpunit(lines: string[]): Partial | null {
  const summary = [...lines].reverse().find((line) => /Tests: \d+, Assertions: \d+/.test(line))
  const ok = [...lines].reverse().find((line) => /^OK \(\d+ tests?, \d+ assertions?\)/.test(line))
  if (!summary && !ok) return null
  const failing: TestRef[] = []
  let inFailures = false
  for (const line of lines) {
    if (/^There (were|was) \d+ (failures?|errors?):/.test(line)) {
      inFailures = true
      continue
    }
    if (/^There (were|was) \d+ /.test(line) || /^(FAILURES!|ERRORS!|OK)/.test(line)) {
      inFailures = false
      continue
    }
    const entry = inFailures ? /^\d+\) (\S+?)::(\S+)/.exec(line) : null
    if (entry) failing.push({ file: filePath(entry[1]), name: entry[2] })
  }
  let counts: Counts
  if (summary) {
    const field = (key: string): number => num(new RegExp(`${key}: (\\d+)`).exec(summary)?.[1])
    const skipped = field('Skipped') + field('Incomplete')
    const failed = field('Failures') + field('Errors')
    counts = { passed: Math.max(0, field('Tests') - failed - skipped), failed, skipped }
  } else {
    counts = { passed: num(/OK \((\d+)/.exec(ok ?? '')?.[1]), failed: 0, skipped: 0 }
  }
  const unique = uniqueRefs(failing)
  return {
    runner: 'phpunit',
    counts,
    failing: unique,
    passing: [],
    files: filesFromRefs(unique, [])
  }
}

// Most specific first: vitest before jest (both print "Tests"), Pest before PHPUnit.
const PARSERS = [vitest, jest, nodeTest, pytest, cargo, dotnet, pest, phpunit, goTest]

export function parseTestRun(command: string, output: string, exitCode: number): TestRun {
  const lines = cleanOutput(output)
  for (const parser of PARSERS) {
    const found = parser(lines)
    if (!found) continue
    const { counts } = found
    if (!counts) {
      // Names without a summary (cut output, go without -v): the named failures are a
      // floor, never a count of zero.
      if (found.failing.length === 0) continue
      return {
        runner: found.runner,
        total: null,
        passed: null,
        failed: found.failing.length,
        skipped: 0,
        failing: found.failing,
        passing: found.passing,
        files: found.files,
        parsed: 'summary'
      }
    }
    const complete = counts.failed === 0 || found.failing.length >= counts.failed
    return {
      runner: found.runner,
      total: counts.passed + counts.failed,
      passed: counts.passed,
      failed: counts.failed,
      skipped: counts.skipped,
      failing: found.failing,
      passing: found.passing,
      files: found.files,
      parsed: complete ? 'full' : 'summary'
    }
  }
  return {
    runner: runnerOfCommand(command),
    total: null,
    passed: null,
    failed: exitCode === 0 ? 0 : null,
    skipped: 0,
    failing: [],
    passing: [],
    files: [],
    parsed: 'exit-code'
  }
}

function runnerOfCommand(command: string): TestRunner {
  const text = command.toLowerCase()
  if (/\bvitest\b/.test(text)) return 'vitest'
  if (/\bjest\b/.test(text)) return 'jest'
  if (/node\s+--test/.test(text)) return 'node'
  if (/pytest/.test(text)) return 'pytest'
  if (/go\s+test/.test(text)) return 'go'
  if (/cargo\s+test/.test(text)) return 'cargo'
  if (/dotnet\s+test/.test(text)) return 'dotnet'
  if (/\bpest\b|artisan\s+test/.test(text)) return 'pest'
  if (/phpunit/.test(text)) return 'phpunit'
  return 'unknown'
}

// The runner's name as the fight shows it.
export const RUNNER_NAMES: Record<TestRunner, string> = {
  jest: 'jest',
  vitest: 'vitest',
  node: 'node:test',
  pytest: 'pytest',
  go: 'go test',
  cargo: 'cargo test',
  dotnet: 'dotnet test',
  phpunit: 'phpunit',
  pest: 'pest',
  unknown: 'tests'
}
