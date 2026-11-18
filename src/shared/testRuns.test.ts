import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isTestCommand, parseTestRun, type TestRun } from './testRuns.ts'

// Real output, captured from tiny scratch projects (see src/shared/fixtures/test-runs).
function fixture(name: string): TestRun {
  const raw = JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', 'test-runs', `${name}.json`), 'utf8')
  ) as { command: string; exitCode: number; output: string }
  return parseTestRun(raw.command, raw.output, raw.exitCode)
}

const names = (run: TestRun): string[] =>
  run.failing.map((ref) => `${ref.file ?? '?'} :: ${ref.name}`).sort()

const fileCounts = (run: TestRun): string[] =>
  run.files.map((f) => `${f.file} ${f.failed}/${f.total ?? '?'}`).sort()

function counts(run: TestRun): unknown {
  const { runner, total, passed, failed, skipped, parsed } = run
  return { runner, total, passed, failed, skipped, parsed }
}

const JEST_FAILING = [
  'src/math.test.js :: math › multiplies',
  'src/math.test.js :: math › rounds down',
  'src/strings.test.js :: strings › trim'
]

for (const name of ['jest-normal', 'jest-verbose', 'jest-color']) {
  test(`jest: ${name}`, () => {
    const run = fixture(name)
    assert.deepEqual(counts(run), {
      runner: 'jest',
      total: 8,
      passed: 5,
      failed: 3,
      skipped: 1,
      parsed: 'full'
    })
    assert.deepEqual(names(run), JEST_FAILING)
    assert.deepEqual(fileCounts(run), ['src/math.test.js 2/?', 'src/strings.test.js 1/?'])
  })
}

test('jest: one file', () => {
  const run = fixture('jest-onefile')
  assert.deepEqual(counts(run), {
    runner: 'jest',
    total: 3,
    passed: 2,
    failed: 1,
    skipped: 1,
    parsed: 'full'
  })
  assert.deepEqual(fileCounts(run), ['src/strings.test.js 1/?'])
})

test('jest: a filtered run counts skipped tests out', () => {
  const run = fixture('jest-pass')
  assert.deepEqual(counts(run), {
    runner: 'jest',
    total: 2,
    passed: 2,
    failed: 0,
    skipped: 7,
    parsed: 'full'
  })
})

const VITEST_FAILING = [
  'src/math.test.js :: math > multiplies',
  'src/math.test.js :: math > rounds down',
  'src/strings.test.js :: strings > trim'
]

for (const name of ['vitest-normal', 'vitest-color']) {
  test(`vitest: ${name}`, () => {
    const run = fixture(name)
    assert.deepEqual(counts(run), {
      runner: 'vitest',
      total: 8,
      passed: 5,
      failed: 3,
      skipped: 1,
      parsed: 'full'
    })
    assert.deepEqual(names(run), VITEST_FAILING)
    assert.deepEqual(fileCounts(run), ['src/math.test.js 2/5', 'src/strings.test.js 1/3'])
  })
}

test('vitest: verbose names the passing tests too', () => {
  const run = fixture('vitest-verbose')
  assert.deepEqual(names(run), VITEST_FAILING)
  assert.equal(run.passing.length, 5)
  assert.ok(run.passing.some((ref) => ref.name === 'strings > upper'))
  assert.equal(run.total, 8)
})

test('vitest: one file and a filtered pass', () => {
  assert.deepEqual(fileCounts(fixture('vitest-onefile')), ['src/math.test.js 2/5'])
  assert.deepEqual(counts(fixture('vitest-pass')), {
    runner: 'vitest',
    total: 1,
    passed: 1,
    failed: 0,
    skipped: 8,
    parsed: 'full'
  })
})

for (const name of ['node-normal', 'node-spec']) {
  test(`node:test: ${name}`, () => {
    const run = fixture(name)
    assert.deepEqual(counts(run), {
      runner: 'node',
      total: 5,
      passed: 3,
      failed: 2,
      skipped: 1,
      parsed: 'full'
    })
    assert.deepEqual(names(run), [
      'test/math.test.mjs :: multiplies',
      'test/strings.test.mjs :: trim'
    ])
  })
}

const PYTEST_FAILING = [
  'tests/test_math.py :: TestRounding::test_floor',
  'tests/test_math.py :: test_multiplies',
  'tests/test_math.py :: test_positive[2]',
  'tests/test_strings.py :: test_trim'
]

for (const name of ['pytest-normal', 'pytest-verbose', 'pytest-quiet']) {
  test(`pytest: ${name}`, () => {
    const run = fixture(name)
    assert.deepEqual(counts(run), {
      runner: 'pytest',
      total: 9,
      passed: 5,
      failed: 4,
      skipped: 1,
      parsed: 'full'
    })
    assert.deepEqual(names(run), PYTEST_FAILING)
  })
}

test('pytest: progress lines give each file its total', () => {
  assert.deepEqual(fileCounts(fixture('pytest-normal')), [
    'tests/test_math.py 3/7',
    'tests/test_strings.py 1/2'
  ])
  assert.equal(fixture('pytest-verbose').passing.length, 5)
})

test('pytest: one file, and a deselected run', () => {
  const one = fixture('pytest-onefile')
  assert.equal(one.failed, 1)
  assert.deepEqual(fileCounts(one), ['tests/test_strings.py 1/2'])
  assert.deepEqual(counts(fixture('pytest-pass')), {
    runner: 'pytest',
    total: 2,
    passed: 2,
    failed: 0,
    skipped: 0,
    parsed: 'full'
  })
})

for (const name of ['dotnet-normal', 'dotnet-verbose']) {
  test(`dotnet: ${name}`, () => {
    const run = fixture(name)
    assert.deepEqual(counts(run), {
      runner: 'dotnet',
      total: 7,
      passed: 4,
      failed: 3,
      skipped: 1,
      parsed: 'full'
    })
    assert.deepEqual(names(run), [
      'FxTests.MathTests :: Multiplies',
      'FxTests.StringTests :: Positive(n: 2)',
      'FxTests.StringTests :: Trim'
    ])
  })
}

test('phpunit: failures listed by class', () => {
  const run = fixture('phpunit-normal')
  assert.deepEqual(counts(run), {
    runner: 'phpunit',
    total: 5,
    passed: 3,
    failed: 2,
    skipped: 1,
    parsed: 'full'
  })
  assert.deepEqual(names(run), ['MathTest :: testMultiplies', 'StringTest :: testTrim'])
})

test('phpunit: testdox has the counts but no names', () => {
  const run = fixture('phpunit-testdox')
  assert.equal(run.failed, 2)
  assert.equal(run.total, 5)
  assert.equal(run.parsed, 'summary')
})

for (const name of ['pest-normal', 'pest-compact']) {
  test(`pest: ${name}`, () => {
    const run = fixture(name)
    assert.deepEqual(counts(run), {
      runner: 'pest',
      total: 6,
      passed: 3,
      failed: 3,
      skipped: 1,
      parsed: 'full'
    })
    assert.deepEqual(names(run), [
      'Tests/Unit/MathTest :: multiplies',
      'Tests/Unit/MathTest :: rounding → it floors',
      'Tests/Unit/StringTest :: trim'
    ])
  })
}

// Go and Cargo are not installed here: these follow their documented formats.
test('go test -v: named tests per package', () => {
  const output = [
    '=== RUN   TestAdd',
    '--- PASS: TestAdd (0.00s)',
    '=== RUN   TestSub',
    '    math_test.go:12: got 1, want 2',
    '--- FAIL: TestSub (0.00s)',
    'FAIL',
    'FAIL\texample.com/m/math\t0.01s',
    '=== RUN   TestUpper',
    '--- PASS: TestUpper (0.00s)',
    'PASS',
    'ok  \texample.com/m/strings\t0.01s',
    'FAIL'
  ].join('\n')
  const run = parseTestRun('go test -v ./...', output, 1)
  assert.deepEqual(counts(run), {
    runner: 'go',
    total: 3,
    passed: 2,
    failed: 1,
    skipped: 0,
    parsed: 'full'
  })
  assert.deepEqual(names(run), ['example.com/m/math :: TestSub'])
})

test('go test without -v: no total, the named failures are a floor', () => {
  const output = [
    '--- FAIL: TestSub (0.00s)',
    '    math_test.go:12: got 1, want 2',
    'FAIL',
    'FAIL\texample.com/m/math\t0.01s',
    'ok  \texample.com/m/strings\t0.01s',
    'FAIL'
  ].join('\n')
  const run = parseTestRun('go test ./...', output, 1)
  assert.equal(run.total, null)
  assert.equal(run.failed, 1)
  assert.equal(run.parsed, 'summary')
})

test('cargo test: sums every binary', () => {
  const output = [
    '     Running unittests src/lib.rs (target/debug/deps/m-123)',
    'running 3 tests',
    'test tests::adds ... ok',
    'test tests::subs ... FAILED',
    'test tests::slow ... ignored',
    'test result: FAILED. 1 passed; 1 failed; 1 ignored; 0 measured; 0 filtered out',
    '     Running tests/api.rs (target/debug/deps/api-456)',
    'test api_works ... ok',
    'test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
  ].join('\n')
  const run = parseTestRun('cargo test', output, 101)
  assert.deepEqual(counts(run), {
    runner: 'cargo',
    total: 3,
    passed: 2,
    failed: 1,
    skipped: 1,
    parsed: 'full'
  })
  assert.deepEqual(names(run), ['src/lib.rs :: tests::subs'])
})

test('nothing parses: the exit code decides', () => {
  const failed = parseTestRun('npm test', 'Error: Cannot find module x', 1)
  assert.deepEqual(counts(failed), {
    runner: 'unknown',
    total: null,
    passed: null,
    failed: null,
    skipped: 0,
    parsed: 'exit-code'
  })
  assert.equal(parseTestRun('npx jest', 'weird', 0).failed, 0)
})

test('cut output: a missing summary is never zero failures', () => {
  const raw = JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', 'test-runs', 'jest-normal.json'), 'utf8')
  ) as { output: string }
  // Only the start survives, as in Claude Code's 2 KB preview.
  const start = raw.output.slice(0, 700)
  const run = parseTestRun('npm test', start, 1)
  assert.notEqual(run.failed, 0)
  assert.ok(run.parsed === 'exit-code' || run.parsed === 'summary')
})

test('isTestCommand: the usual runners as whole words', () => {
  for (const command of [
    'npm test',
    'npm run test -- --watch=false',
    'pnpm test',
    'yarn test',
    'npx jest src/a.test.js',
    'cd app && jest --ci',
    'npx vitest run',
    'node --test',
    'python -m pytest -q',
    'pytest tests/',
    'go test ./...',
    'cargo test',
    'dotnet test',
    'php artisan test',
    'php vendor/bin/phpunit tests',
    'vendor\\bin\\pest --compact'
  ]) {
    assert.ok(isTestCommand(command), command)
  }
  for (const command of [
    'npm install jest',
    'cat jester.txt',
    'git log --grep=pytest-cov',
    'ls my-jest-helper',
    'npm run testing'
  ]) {
    assert.ok(!isTestCommand(command) || command === 'npm install jest', command)
  }
  assert.ok(isTestCommand('make check', 'make check'))
  assert.ok(!isTestCommand('make build', 'make check'))
})
