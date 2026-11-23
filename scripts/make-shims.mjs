// Writes the mya command into build/generated/bin for electron-builder (win.extraResources
// -> <install>\resources\bin): mya.cmd (CRLF), mya (sh: LF, no BOM) and mya-path.ps1.
// The version and the help text are baked in, from package.json and src/shared/cliArgs.ts.

// Plain JavaScript, so there are no return types to write.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = dirname(dirname(fileURLToPath(import.meta.url)))
const cli = await import(pathToFileURL(join(repo, 'src', 'shared', 'cliArgs.ts')).href)
const { version } = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
const fail = (message) => {
  console.error(`make-shims: ${message}`)
  process.exit(1)
}

if (!/^[0-9A-Za-z.+-]+$/.test(version))
  fail(`version "${version}" has characters a shim cannot echo`)
const usage = cli.usageLines('mya')
for (const line of usage) {
  if (/[<>|&^%!"()']/.test(line) || /[^\x20-\x7e]/.test(line)) fail(`unsafe help line: ${line}`)
}
const versionLine = cli.versionText(version)
// The shims hard-code these two texts: make sure they still match cliArgs.ts.
if (cli.unknownOptionText('mya', 'X') !== 'mya: unknown option "X"')
  fail('unknownOptionText changed')
if (cli.tooManyText('mya') !== 'mya: give one folder at most') fail('tooManyText changed')
if (cli.WSL_REFUSAL.includes("'")) fail('WSL_REFUSAL has a quote')

// Rules this follows: no parenthesised blocks, goto only; every expansion of a user value
// sits inside quotes, so & and ) are safe; delayed expansion is off, so ! is safe.
const cmd = [
  '@echo off',
  `rem mya: starts Mya from cmd or PowerShell. Made by scripts/make-shims.mjs for Mya ${version}. Do not edit.`,
  'setlocal EnableExtensions DisableDelayedExpansion',
  'set "ELECTRON_RUN_AS_NODE="',
  'rem Before any shift: plain shift moves %1 into %0.',
  'set "MYA_EXE=%~dp0..\\..\\mya.exe"',
  'set "HELP="',
  'set "VERSION="',
  'set "FOLDER="',
  'set "COUNT=0"',
  '',
  ':next',
  'if [%1]==[] goto parsed',
  'set "ARG=%~1"',
  'shift',
  'if not defined ARG goto next',
  'if "%ARG%"=="--help" goto opt_help',
  'if "%ARG%"=="--version" goto opt_version',
  'if "%ARG:~0,1%"=="-" goto opt_unknown',
  'set /a COUNT+=1',
  'if not defined FOLDER set "FOLDER=%ARG%"',
  'goto next',
  '',
  ':opt_help',
  'set "HELP=1"',
  'goto next',
  '',
  ':opt_version',
  'set "VERSION=1"',
  'goto next',
  '',
  ':opt_unknown',
  '>&2 echo mya: unknown option "%ARG%"',
  '>&2 call :usage',
  'exit /b 1',
  '',
  ':parsed',
  'if %COUNT% GTR 1 goto too_many',
  'if defined HELP goto show_help',
  'if defined VERSION goto show_version',
  'if not exist "%MYA_EXE%" goto no_exe',
  'if not defined FOLDER goto launch_bare',
  'rem "C:\\x\\" would reach mya.exe as C:\\x" : double a trailing backslash.',
  'if "%FOLDER:~-1%"=="\\" set "FOLDER=%FOLDER%\\"',
  'if defined MYA_SHIM_DRY_RUN goto dry_folder',
  'start "" "%MYA_EXE%" "%FOLDER%"',
  'exit /b 0',
  '',
  ':launch_bare',
  'if defined MYA_SHIM_DRY_RUN goto dry_bare',
  'start "" "%MYA_EXE%"',
  'exit /b 0',
  '',
  ':dry_folder',
  'echo "%MYA_EXE%" "%FOLDER%"',
  'exit /b 0',
  '',
  ':dry_bare',
  'echo "%MYA_EXE%"',
  'exit /b 0',
  '',
  ':too_many',
  '>&2 echo mya: give one folder at most',
  '>&2 call :usage',
  'exit /b 1',
  '',
  ':show_help',
  'call :usage',
  'exit /b 0',
  '',
  ':show_version',
  `echo ${versionLine}`,
  'exit /b 0',
  '',
  ':no_exe',
  '>&2 echo mya: Mya is not installed next to this command. Reinstall Mya.',
  'exit /b 1',
  '',
  ':usage',
  ...usage.map((l) => (l === '' ? 'echo(' : `echo ${l}`)),
  'exit /b 0'
]

const sh = [
  '#!/bin/sh',
  `# mya: starts Mya from Git Bash or WSL. Made by scripts/make-shims.mjs for Mya ${version}. Do not edit.`,
  'unset ELECTRON_RUN_AS_NODE',
  '',
  'usage() {',
  "  printf '%s\\n' \\",
  usage.map((l) => `    '${l}'`).join(' \\\n'),
  '}',
  '',
  'help=',
  'version=',
  'folder=',
  'count=0',
  'for arg in "$@"; do',
  '  case $arg in',
  "    '') ;;",
  '    --help) help=1 ;;',
  '    --version) version=1 ;;',
  '    -*)',
  `      printf 'mya: unknown option "%s"\\n' "$arg" >&2`,
  '      usage >&2',
  '      exit 1',
  '      ;;',
  '    *)',
  '      count=$((count + 1))',
  '      if [ "$count" -eq 1 ]; then folder=$arg; fi',
  '      ;;',
  '  esac',
  'done',
  'if [ "$count" -gt 1 ]; then',
  "  printf '%s\\n' 'mya: give one folder at most' >&2",
  '  usage >&2',
  '  exit 1',
  'fi',
  'if [ -n "$help" ]; then usage; exit 0; fi',
  `if [ -n "$version" ]; then printf '%s\\n' '${versionLine}'; exit 0; fi`,
  '',
  'where=',
  'case $(uname -s) in',
  '  MINGW*|MSYS*|CYGWIN*) where=msys ;;',
  '  Linux)',
  '    if [ -e /proc/sys/fs/binfmt_misc/WSLInterop ] || [ -e /proc/sys/fs/binfmt_misc/WSLInterop-late ] \\',
  '      || command -v wslpath >/dev/null 2>&1; then',
  '      where=wsl',
  '    fi',
  '    ;;',
  'esac',
  'if [ -z "$where" ]; then',
  "  printf '%s\\n' 'mya: this command starts Mya on Windows. Run it in cmd, PowerShell, Git Bash, or WSL.' >&2",
  '  exit 1',
  'fi',
  '',
  'bin=$(cd "$(dirname "$0")" && pwd -P) || exit 1',
  'exe=$bin/../../mya.exe',
  'if [ ! -f "$exe" ]; then',
  "  printf '%s\\n' 'mya: Mya is not installed next to this command. Reinstall Mya.' >&2",
  '  exit 1',
  'fi',
  '',
  'win=',
  'if [ -n "$folder" ]; then',
  '  if [ "$where" = msys ]; then',
  "    # By full path: another cygpath earlier on PATH (Anaconda's) gives wrong paths.",
  '    win=$(/usr/bin/cygpath -w -a "$folder") || exit 1',
  '  else',
  '    win=$(wslpath -w -a "$folder" 2>/dev/null) || win=',
  '    if [ -z "$win" ]; then',
  '      # wslpath may refuse a folder that does not exist: map /mnt/<drive> by hand.',
  '      abs=$(realpath -m "$folder") || exit 1',
  '      case $abs in',
  '        /mnt/[a-zA-Z]|/mnt/[a-zA-Z]/*)',
  `          drive=$(printf '%s' "$abs" | cut -c6 | tr '[:lower:]' '[:upper:]')`,
  '          rest=${abs#/mnt/?}',
  `          win=$drive:$(printf '%s' "\${rest:-/}" | tr '/' '\\\\')`,
  '          ;;',
  "        *) win='\\\\' ;;",
  '      esac',
  '    fi',
  '    case $win in',
  "      '\\\\'*)",
  `        printf '%s\\n' '${cli.WSL_REFUSAL}' >&2`,
  '        exit 1',
  '        ;;',
  '    esac',
  '  fi',
  'fi',
  '',
  'if [ -n "$win" ]; then set -- "$exe" "$win"; else set -- "$exe"; fi',
  `if [ -n "\${MYA_SHIM_DRY_RUN:-}" ]; then printf '%s\\n' "$@"; exit 0; fi`,
  '# setsid: no controlling terminal, so closing the terminal sends Mya no hangup.',
  'if command -v setsid >/dev/null 2>&1; then set -- setsid "$@"; fi',
  'cd "$bin" || exit 1',
  'if [ "$where" = msys ]; then',
  "  MSYS2_ARG_CONV_EXCL='*'; export MSYS2_ARG_CONV_EXCL",
  '  MSYS_NO_PATHCONV=1; export MSYS_NO_PATHCONV',
  'fi',
  '"$@" </dev/null >/dev/null 2>&1 &',
  'exit 0'
]

const ps1 = readFileSync(join(repo, 'scripts', 'mya-path.ps1'))
if (ps1.some((b) => b > 0x7e && b !== 0x0d && b !== 0x0a)) fail('mya-path.ps1 must be ASCII')

const out = join(repo, 'build', 'generated', 'bin')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'mya.cmd'), cmd.join('\r\n') + '\r\n', 'ascii')
writeFileSync(join(out, 'mya'), sh.join('\n') + '\n', 'utf8') // node never writes a BOM
writeFileSync(join(out, 'mya-path.ps1'), ps1)
console.log(`make-shims: wrote mya.cmd, mya and mya-path.ps1 for ${versionLine} to ${out}`)
