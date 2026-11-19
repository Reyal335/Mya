import { spawn, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { app, shell } from 'electron'
import { statSync } from 'fs'
import { mkdir, readdir, readFile, stat, unlink } from 'fs/promises'
import { createServer, type Server } from 'http'
import { homedir } from 'os'
import { delimiter, join } from 'path'
import type {
  CliProviderId,
  ProviderAccountInfo,
  ProviderActionResult,
  ProviderStatus,
  ProvidersStatusResult
} from '../shared/ipc'
import {
  BROWSER_CANCELLED_MESSAGE,
  SIGN_IN_TIMEOUT_MS,
  TIMEOUT_MESSAGE,
  binaryFor,
  cancelledInBrowser,
  classifyCliFailure,
  envKeySignOutMessage,
  envVarsFor,
  installFailedMessage,
  installStage,
  keyRejectedMessage,
  packageFor,
  type ProviderErrorCode
} from '../shared/logins'
import { PROVIDERS, maskKey } from '../shared/providers'
import { withoutDeadCaFiles } from './caEnv'
import { isObject, readJsonFile, serialQueue, writeJsonFile } from './jsonFile'
import {
  fixtureOf,
  fixtureSignInWaitMs,
  fixtureStatus,
  setFixture,
  type FixtureState
} from './loginsFixtures'

type StoredAuth = {
  codexApiKey: string | null
  geminiApiKey: string | null
}

const EMPTY_AUTH: StoredAuth = {
  codexApiKey: null,
  geminiApiKey: null
}

// OAuth2 scopes and redirect targets used by @google/gemini-cli (code_assist/oauth2.js).
// Client credentials are read from the locally installed @google/gemini-cli bundle at runtime
// rather than hardcoded in source control.
const GEMINI_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
]
const GEMINI_SIGN_IN_SUCCESS_URL =
  'https://developers.google.com/gemini-code-assist/auth_success_gemini'
const GEMINI_SIGN_IN_FAILURE_URL =
  'https://developers.google.com/gemini-code-assist/auth_failure_gemini'

async function resolveGeminiOAuthClient(): Promise<{
  clientId: string
  clientSecret: string
} | null> {
  const npmRootRes = await runQuickCommand('npm', ['root', '-g'], 4_000)
  const roots = [
    ...(npmRootRes.ok && npmRootRes.stdout ? [npmRootRes.stdout.split(/\r?\n/)[0].trim()] : []),
    ...(process.platform === 'win32' && process.env['APPDATA']
      ? [join(process.env['APPDATA'], 'npm', 'node_modules')]
      : ['/usr/local/lib/node_modules', '/opt/homebrew/lib/node_modules'])
  ]
  for (const root of roots) {
    const bundleDir = join(root, '@google', 'gemini-cli', 'bundle')
    let entries: string[]
    try {
      entries = await readdir(bundleDir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.startsWith('chunk-') || !entry.endsWith('.js')) continue
      try {
        const text = await readFile(join(bundleDir, entry), 'utf8')
        const idMatch = /OAUTH_CLIENT_ID\s*=\s*"([^"]+\.apps\.googleusercontent\.com)"/.exec(text)
        const secMatch = /OAUTH_CLIENT_SECRET\s*=\s*"([^"]+)"/.exec(text)
        if (idMatch && secMatch) {
          return { clientId: idMatch[1], clientSecret: secMatch[1] }
        }
      } catch {
        // Ignore unreadable chunk
      }
    }
  }
  return null
}

const authQueue = serialQueue()
let cachedAuth: StoredAuth | null = null
let sessionStatusCache: ProvidersStatusResult | null = null
let pendingStatusPromise: Promise<ProvidersStatusResult> | null = null

const activeCancelFns = new Map<CliProviderId, () => void>()

function authStorePath(): string {
  return join(app.getPath('userData'), 'provider-auth.json')
}

function codexAuthPath(): string {
  return join(homedir(), '.codex', 'auth.json')
}

function geminiDir(): string {
  return join(homedir(), '.gemini')
}

function geminiSettingsPath(): string {
  return join(geminiDir(), 'settings.json')
}

function geminiOauthCredsPath(): string {
  return join(geminiDir(), 'oauth_creds.json')
}

function geminiAccountsPath(): string {
  return join(geminiDir(), 'google_accounts.json')
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

// The key as the window may see it. Nothing else of a key is ever sent or logged.
const maskSecret = maskKey

function decodeJwtPayload(token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function formatPlanName(rawPlan: string | null): string | null {
  if (!rawPlan) return null
  const lower = rawPlan.toLowerCase()
  if (lower === 'plus') return 'ChatGPT Plus'
  if (lower === 'pro') return 'ChatGPT Pro'
  if (lower === 'team') return 'ChatGPT Team'
  if (lower === 'enterprise') return 'ChatGPT Enterprise'
  if (lower === 'free') return 'ChatGPT Free'
  return `ChatGPT (${rawPlan.toUpperCase()})`
}

function formatIsoDate(rawIso: string | null): string | null {
  if (!rawIso) return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(rawIso)
  return match ? match[1] : null
}

// Ensures global npm and Antigravity CLI (agy) binary directories on Windows/macOS/Linux
// are on PATH even if installed after launching Electron.
export function augmentedEnv(extra?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  const additions: string[] = []
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA']
    if (appData) additions.push(join(appData, 'npm'))
    const localAppData = process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local')
    additions.push(join(localAppData, 'agy', 'bin'))
  } else {
    additions.push(
      '/usr/local/bin',
      '/opt/homebrew/bin',
      join(homedir(), '.npm-global', 'bin'),
      join(homedir(), '.local', 'bin'),
      join(homedir(), '.agy', 'bin')
    )
  }
  const currentPath = env.PATH ?? env.Path ?? ''
  const merged = [...additions, currentPath].filter(Boolean).join(delimiter)
  env.PATH = merged
  if ('Path' in env) env.Path = merged
  // A CA bundle variable that names a file that is not there (conda's SSL_CERT_FILE, after an
  // install moved) makes the Codex sign-in fail. It is left out of the CLI's environment only.
  const { env: clean, dropped } = withoutDeadCaFiles(env, isFile)
  for (const name of dropped) {
    if (!warnedCaVars.has(name)) {
      warnedCaVars.add(name)
      console.warn(
        `[providerAuth] ${name} names a file that is not there, so the CLIs run without it.`
      )
    }
  }
  return clean
}

const warnedCaVars = new Set<string>()

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export async function resolveAgyBinary(): Promise<string | null> {
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local')
    const candidate = join(localAppData, 'agy', 'bin', 'agy.exe')
    try {
      await stat(candidate)
      return candidate
    } catch {
      // Fall through to PATH check
    }
  } else {
    for (const candidate of [
      join(homedir(), '.local', 'bin', 'agy'),
      join(homedir(), '.agy', 'bin', 'agy'),
      '/usr/local/bin/agy'
    ]) {
      try {
        await stat(candidate)
        return candidate
      } catch {
        // Continue checking
      }
    }
  }
  const res = await runQuickCommand('agy', ['--help'], 5_000)
  return res.ok ? 'agy' : null
}

export async function shouldUseAgyForGemini(): Promise<{ useAgy: boolean; agyBinary: string }> {
  const stored = await loadStoredAuth()
  if (stored.geminiApiKey) {
    return { useAgy: false, agyBinary: 'gemini' }
  }
  const agyBin = await resolveAgyBinary()
  if (agyBin) {
    return { useAgy: true, agyBinary: agyBin }
  }
  return { useAgy: false, agyBinary: 'gemini' }
}

async function loadStoredAuth(): Promise<StoredAuth> {
  if (cachedAuth) return cachedAuth
  try {
    const raw = await readJsonFile(authStorePath())
    if (isObject(raw)) {
      cachedAuth = {
        codexApiKey: nonEmptyString(raw.codexApiKey),
        geminiApiKey: nonEmptyString(raw.geminiApiKey)
      }
      return cachedAuth
    }
  } catch (err) {
    console.error('[providerAuth] Could not read provider-auth.json:', err)
  }
  cachedAuth = { ...EMPTY_AUTH }
  return cachedAuth
}

async function updateStoredAuth(change: (current: StoredAuth) => StoredAuth): Promise<StoredAuth> {
  return authQueue(async () => {
    const before = await loadStoredAuth()
    const after = change(before)
    cachedAuth = after
    await writeJsonFile(authStorePath(), {
      version: 1,
      ...(after.codexApiKey ? { codexApiKey: after.codexApiKey } : {}),
      ...(after.geminiApiKey ? { geminiApiKey: after.geminiApiKey } : {})
    })
    return after
  })
}

// Returns environment variables (including stored API keys and augmented PATH) for
// cliProviders.ts when spawning codex or gemini.
export async function providerChildEnv(provider: CliProviderId): Promise<NodeJS.ProcessEnv> {
  const stored = await loadStoredAuth()
  const extra: Record<string, string | undefined> = {}
  if (provider === 'codex' && stored.codexApiKey) {
    extra.OPENAI_API_KEY = stored.codexApiKey
    extra.CODEX_API_KEY = stored.codexApiKey
  }
  if (provider === 'gemini') {
    if (stored.geminiApiKey) {
      extra.GEMINI_API_KEY = stored.geminiApiKey
    } else {
      // Tells @google/gemini-cli in headless/non-interactive mode to use cached Google OAuth.
      extra.GOOGLE_GENAI_USE_GCA = 'true'
    }
  }
  return augmentedEnv(extra)
}

function killProcessTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
      return
    } catch {
      // Fall back to child.kill()
    }
  }
  try {
    child.kill()
  } catch {
    // Ignore if already exited
  }
}

function runQuickCommand(
  binary: string,
  args: string[],
  timeoutMs = 8_000,
  stdinText?: string
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (ok: boolean, exitCode: number | null = null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok, stdout: stdout.trim(), stderr: stderr.trim(), exitCode })
    }

    const child = spawn(binary, args, {
      env: augmentedEnv(),
      shell: process.platform === 'win32',
      windowsHide: true
    })

    const timer = setTimeout(() => {
      killProcessTree(child)
      finish(false)
    }, timeoutMs)

    if (child.stdin) {
      child.stdin.on('error', () => {})
      if (stdinText !== undefined) {
        child.stdin.end(stdinText, 'utf8')
      } else {
        child.stdin.end()
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', () => finish(false))
    child.on('close', (code) => finish(code === 0, code))
  })
}

// What the last look at each CLI found: it runs, it is not on this computer, or it is there and
// will not start. Read when a status is made.
const cliStates: Record<CliProviderId, 'ok' | 'missing' | 'broken'> = {
  codex: 'missing',
  gemini: 'missing'
}

async function detectCliVersion(
  binary: string
): Promise<{ installed: boolean; version: string | null }> {
  const res = await runQuickCommand(binary, ['--version'], 6_000)
  const provider: CliProviderId = binary === 'codex' ? 'codex' : 'gemini'
  if (!res.ok) {
    cliStates[provider] = classifyCliFailure(`${res.stderr}\n${res.stdout}`)
    return { installed: false, version: null }
  }
  cliStates[provider] = 'ok'
  const firstLine = (res.stdout || res.stderr).split(/\r?\n/)[0]?.trim() ?? ''
  return { installed: true, version: firstLine || null }
}

async function fileMtimeMs(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

async function hasCodexOauthFile(): Promise<{
  ok: boolean
  detail: string | null
  account: ProviderAccountInfo | null
}> {
  try {
    const raw = await readJsonFile(codexAuthPath())
    if (!isObject(raw)) return { ok: false, detail: null, account: null }
    const fileKey = nonEmptyString(raw.OPENAI_API_KEY)
    if (fileKey) {
      return {
        ok: true,
        detail: `API Key (${maskSecret(fileKey)})`,
        account: {
          name: null,
          email: null,
          plan: 'OpenAI API (Pay-as-you-go)',
          organization: null,
          activeUntil: null
        }
      }
    }
    if (isObject(raw.tokens)) {
      const hasToken =
        nonEmptyString(raw.tokens.access_token) !== null ||
        nonEmptyString(raw.tokens.refresh_token) !== null ||
        nonEmptyString(raw.tokens.id_token) !== null
      if (hasToken) {
        const idClaims = decodeJwtPayload(raw.tokens.id_token)
        const accessClaims = decodeJwtPayload(raw.tokens.access_token)
        const profileClaims =
          accessClaims && isObject(accessClaims['https://api.openai.com/profile'])
            ? accessClaims['https://api.openai.com/profile']
            : null
        const idAuthClaims =
          idClaims && isObject(idClaims['https://api.openai.com/auth'])
            ? idClaims['https://api.openai.com/auth']
            : null
        const accessAuthClaims =
          accessClaims && isObject(accessClaims['https://api.openai.com/auth'])
            ? accessClaims['https://api.openai.com/auth']
            : null

        const name = nonEmptyString(idClaims?.name) ?? nonEmptyString(profileClaims?.name) ?? null
        const email =
          nonEmptyString(idClaims?.email) ?? nonEmptyString(profileClaims?.email) ?? null
        const rawPlan =
          nonEmptyString(idAuthClaims?.chatgpt_plan_type) ??
          nonEmptyString(accessAuthClaims?.chatgpt_plan_type) ??
          null
        const plan = formatPlanName(rawPlan) ?? 'ChatGPT Subscription'
        const activeUntil = formatIsoDate(
          nonEmptyString(idAuthClaims?.chatgpt_subscription_active_until)
        )

        let organization: string | null = null
        if (Array.isArray(idAuthClaims?.organizations) && idAuthClaims.organizations.length > 0) {
          const orgs = idAuthClaims.organizations.filter(isObject)
          const chosen = orgs.find((o) => o.is_default === true) ?? orgs[0]
          if (chosen) {
            const title = nonEmptyString(chosen.title)
            const role = nonEmptyString(chosen.role)
            if (title && role) organization = `${title} (${role})`
            else organization = title ?? role
          }
        }

        return {
          ok: true,
          detail: 'ChatGPT Account (Browser OAuth)',
          account: {
            name,
            email,
            plan,
            organization,
            activeUntil
          }
        }
      }
    }
  } catch {
    // Ignore missing or unreadable file
  }
  return { ok: false, detail: null, account: null }
}

async function hasGeminiOauthFile(): Promise<{
  ok: boolean
  detail: string | null
  account: ProviderAccountInfo | null
}> {
  try {
    const raw = await readJsonFile(geminiOauthCredsPath())
    if (!isObject(raw)) return { ok: false, detail: null, account: null }
    const hasToken =
      nonEmptyString(raw.refresh_token) !== null || nonEmptyString(raw.access_token) !== null
    if (!hasToken) return { ok: false, detail: null, account: null }

    const accounts = await readJsonFile(geminiAccountsPath()).catch(() => undefined)
    const activeAccount = isObject(accounts) ? nonEmptyString(accounts.active) : null
    const idClaims = decodeJwtPayload(raw.id_token)
    const name = nonEmptyString(idClaims?.name) ?? null
    const email = activeAccount ?? nonEmptyString(idClaims?.email) ?? null
    const domain = nonEmptyString(idClaims?.hd) ?? null
    const expiryMs = typeof raw.expiry_date === 'number' ? raw.expiry_date : null
    const activeUntil =
      expiryMs && Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString().slice(0, 10) : null

    return {
      ok: true,
      detail: 'Google Account (OAuth · Antigravity CLI)',
      account: {
        name,
        email,
        plan: domain ? 'Google AI Pro / Workspace' : 'Google AI Pro (Subscription)',
        organization: domain,
        activeUntil
      }
    }
  } catch {
    return { ok: false, detail: null, account: null }
  }
}

type BareStatus = Omit<ProviderStatus, 'keyMask' | 'envVar' | 'cli'>

async function getCodexStatus(stored: StoredAuth): Promise<BareStatus> {
  const cli = await detectCliVersion('codex')
  if (stored.codexApiKey) {
    return {
      provider: 'codex',
      installed: cli.installed,
      version: cli.version,
      loggedIn: true,
      method: 'api_key',
      detail: `Saved API Key (${maskSecret(stored.codexApiKey)})`,
      account: {
        name: null,
        email: null,
        plan: 'OpenAI API Key (Pay-as-you-go)',
        organization: null,
        activeUntil: null
      }
    }
  }
  const oauthFile = await hasCodexOauthFile()
  if (oauthFile.ok) {
    return {
      provider: 'codex',
      installed: cli.installed,
      version: cli.version,
      loggedIn: true,
      method: oauthFile.detail?.startsWith('API Key') ? 'api_key' : 'oauth',
      detail: oauthFile.detail,
      account: oauthFile.account
    }
  }
  const envKey = nonEmptyString(process.env.OPENAI_API_KEY ?? process.env.CODEX_API_KEY)
  if (envKey) {
    return {
      provider: 'codex',
      installed: cli.installed,
      version: cli.version,
      loggedIn: true,
      method: 'env',
      detail: `Environment key (${maskSecret(envKey)})`,
      account: {
        name: null,
        email: null,
        plan: 'OpenAI API Key (Environment)',
        organization: null,
        activeUntil: null
      }
    }
  }
  return {
    provider: 'codex',
    installed: cli.installed,
    version: cli.version,
    loggedIn: false,
    method: null,
    detail: null,
    account: null
  }
}

async function getGeminiStatus(stored: StoredAuth): Promise<BareStatus> {
  const [cli, agyBin] = await Promise.all([detectCliVersion('gemini'), resolveAgyBinary()])
  const installed = agyBin !== null || cli.installed
  const version = agyBin
    ? cli.version
      ? `agy + gemini-cli ${cli.version}`
      : 'agy (Antigravity CLI)'
    : cli.version
  if (stored.geminiApiKey) {
    return {
      provider: 'gemini',
      installed,
      version,
      loggedIn: true,
      method: 'api_key',
      detail: `Saved API Key (${maskSecret(stored.geminiApiKey)})`,
      account: {
        name: null,
        email: null,
        plan: 'Google AI Studio (API Key)',
        organization: null,
        activeUntil: null
      }
    }
  }
  const oauthFile = await hasGeminiOauthFile()
  if (oauthFile.ok) {
    return {
      provider: 'gemini',
      installed,
      version,
      loggedIn: true,
      method: 'oauth',
      detail: oauthFile.detail,
      account: oauthFile.account
    }
  }
  if (agyBin) {
    return {
      provider: 'gemini',
      installed: true,
      version,
      loggedIn: true,
      method: 'oauth',
      detail: 'Google Account (Antigravity CLI)',
      account: {
        name: null,
        email: null,
        plan: 'Google AI Pro (Antigravity CLI)',
        organization: null,
        activeUntil: null
      }
    }
  }
  const envKey = nonEmptyString(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY)
  if (envKey) {
    return {
      provider: 'gemini',
      installed,
      version,
      loggedIn: true,
      method: 'env',
      detail: `Environment key (${maskSecret(envKey)})`,
      account: {
        name: null,
        email: null,
        plan: 'Gemini API Key (Environment)',
        organization: null,
        activeUntil: null
      }
    }
  }
  return {
    provider: 'gemini',
    installed,
    version,
    loggedIn: false,
    method: null,
    detail: null,
    account: null
  }
}

// Adds what the LOGINS cards show beyond the sign-in itself: the key as a mask (never the key),
// the environment variable a key came from, and whether the CLI runs.
function decorate(status: BareStatus, stored: StoredAuth): ProviderStatus {
  const provider = status.provider
  const saved = provider === 'codex' ? stored.codexApiKey : stored.geminiApiKey
  let keyMask: string | null = null
  let envVar: string | null = null
  if (status.method === 'api_key' && saved) keyMask = maskKey(saved)
  if (status.method === 'env') {
    envVar = envVarsFor(provider).find((name) => nonEmptyString(process.env[name])) ?? null
    const value = envVar ? nonEmptyString(process.env[envVar]) : null
    if (value) keyMask = maskKey(value)
  }
  return { ...status, keyMask, envVar, cli: status.installed ? 'ok' : cliStates[provider] }
}

// A made-up state (MYA_LOGINS_FIXTURE, see loginsFixtures.ts) stands in for the real status.
function shownStatus(status: ProviderStatus): ProviderStatus {
  const fixture = fixtureOf(status.provider)
  return fixture ? fixtureStatus(status.provider, fixture) : status
}

export async function getProvidersStatus(force = false): Promise<ProvidersStatusResult> {
  if (!force && sessionStatusCache !== null) {
    return sessionStatusCache
  }
  if (!force && pendingStatusPromise !== null) {
    return pendingStatusPromise
  }
  const run = (async (): Promise<ProvidersStatusResult> => {
    const stored = await loadStoredAuth()
    const [codex, gemini] = await Promise.all([getCodexStatus(stored), getGeminiStatus(stored)])
    const result: ProvidersStatusResult = {
      codex: shownStatus(decorate(codex, stored)),
      gemini: shownStatus(decorate(gemini, stored))
    }
    sessionStatusCache = result
    return result
  })()
  pendingStatusPromise = run
  try {
    return await run
  } finally {
    if (pendingStatusPromise === run) {
      pendingStatusPromise = null
    }
  }
}

async function setGeminiAuthType(authType: 'oauth-personal' | 'gemini-api-key'): Promise<void> {
  try {
    await mkdir(geminiDir(), { recursive: true })
    const existing = await readJsonFile(geminiSettingsPath()).catch(() => undefined)
    const base = isObject(existing) ? existing : {}
    const security = isObject(base.security) ? base.security : {}
    const auth = isObject(security.auth) ? security.auth : {}
    const next = {
      ...base,
      selectedAuthType: authType,
      security: {
        ...security,
        auth: {
          ...auth,
          selectedType: authType
        }
      }
    }
    await writeJsonFile(geminiSettingsPath(), next)
  } catch (err) {
    console.error('[providerAuth] Could not write ~/.gemini/settings.json:', err)
  }
}

export function cancelProviderLogin(provider: CliProviderId): { ok: boolean } {
  const cancel = activeCancelFns.get(provider)
  if (!cancel) return { ok: false }
  activeCancelFns.delete(provider)
  cancel()
  return { ok: true }
}

// How a browser sign-in ended: it worked, or the failure with its kind.
type Outcome = { ok: boolean; error?: string; code?: ProviderErrorCode }

async function loginCodexOAuth(): Promise<ProviderActionResult> {
  const cli = await detectCliVersion('codex')
  if (!cli.installed) {
    return {
      ok: false,
      error: 'OpenAI Codex CLI is not installed yet. Click INSTALL CLI first.',
      status: await getProvidersStatus()
    }
  }

  const beforeMtime = await fileMtimeMs(codexAuthPath())
  const wasLoggedIn = (await hasCodexOauthFile()).ok

  // Set BROWSER=echo so codex prints the OAuth URL immediately without failing inside a
  // hidden child console, and we open it directly in the active browser via shell.openExternal.
  const env = augmentedEnv({
    OPENAI_API_KEY: undefined,
    CODEX_API_KEY: undefined,
    BROWSER: 'echo'
  })
  delete env.OPENAI_API_KEY
  delete env.CODEX_API_KEY

  const loginOutcome = await new Promise<Outcome>((resolve) => {
    let settled = false
    let openedUrl = false
    let cancelled = false
    let outputText = ''

    const finish = (result: Outcome): void => {
      if (settled) return
      settled = true
      clearInterval(poller)
      clearTimeout(timeout)
      activeCancelFns.delete('codex')
      resolve(result)
    }

    const child = spawn('codex', ['login'], {
      env,
      shell: process.platform === 'win32',
      windowsHide: true
    })

    activeCancelFns.set('codex', () => {
      cancelled = true
      killProcessTree(child)
      finish({ ok: false, error: 'Sign-in was cancelled.', code: 'cancelled' })
    })

    const inspectChunk = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      outputText += text
      if (!openedUrl) {
        const match = /https:\/\/auth\.openai\.com\/[^\s"'<>]+/.exec(outputText)
        if (match) {
          openedUrl = true
          // Add prompt=login when switching accounts so the active browser prompts for
          // credentials instead of silently reusing the existing session.
          const sep = match[0].includes('?') ? '&' : '?'
          const authUrl =
            wasLoggedIn && !match[0].includes('prompt=')
              ? `${match[0]}${sep}prompt=login`
              : match[0]
          void shell.openExternal(authUrl)
        }
      }
    }

    child.stdout?.on('data', inspectChunk)
    child.stderr?.on('data', inspectChunk)

    // Only treat auth.json as completed when its mtime is newer than beforeMtime.
    const poller = setInterval(() => {
      void (async () => {
        const nowMtime = await fileMtimeMs(codexAuthPath())
        if (nowMtime !== null && (beforeMtime === null || nowMtime > beforeMtime + 100)) {
          const check = await hasCodexOauthFile()
          if (check.ok) {
            await updateStoredAuth((cur) => ({ ...cur, codexApiKey: null }))
            killProcessTree(child)
            finish({ ok: true })
          }
        }
      })()
    }, 1_000)

    const timeout = setTimeout(() => {
      killProcessTree(child)
      finish({ ok: false, error: TIMEOUT_MESSAGE, code: 'timeout' })
    }, SIGN_IN_TIMEOUT_MS)

    child.on('error', (err) => {
      finish({ ok: false, error: err.message })
    })

    child.on('close', (code) => {
      void (async () => {
        if (cancelled) {
          finish({ ok: false, error: 'Sign-in was cancelled.', code: 'cancelled' })
          return
        }
        const nowMtime = await fileMtimeMs(codexAuthPath())
        const updated = nowMtime !== null && (beforeMtime === null || nowMtime > beforeMtime + 100)
        const check = await hasCodexOauthFile()
        if ((code === 0 || updated) && check.ok) {
          await updateStoredAuth((cur) => ({ ...cur, codexApiKey: null }))
          finish({ ok: true })
        } else {
          const cleanErr = outputText.trim().split(/\r?\n/).slice(-3).join(' ')
          // The person said no in the browser, or the sign-in broke.
          if (cancelledInBrowser(outputText)) {
            finish({ ok: false, error: BROWSER_CANCELLED_MESSAGE, code: 'browser_cancelled' })
            return
          }
          finish({
            ok: false,
            error: cleanErr || `Browser sign-in did not complete (exit code ${code ?? 'unknown'}).`,
            code: 'sign_in_failed'
          })
        }
      })()
    })
  })

  const status = await getProvidersStatus(true)
  if (loginOutcome.ok && status.codex.loggedIn) {
    return { ok: true, status }
  }
  return {
    ok: false,
    error: loginOutcome.error ?? 'Sign-in was not completed.',
    code: loginOutcome.code ?? null,
    status
  }
}

async function loginGeminiOAuth(): Promise<ProviderActionResult> {
  const oauthClient = await resolveGeminiOAuthClient()
  if (!oauthClient) {
    return {
      ok: false,
      error:
        'Google Gemini CLI bundle was not found. Install @google/gemini-cli, use Antigravity CLI (agy), or paste a Gemini API key.',
      status: await getProvidersStatus()
    }
  }
  const state = randomBytes(32).toString('hex')

  const loginOutcome = await new Promise<Outcome>((resolve) => {
    let settled = false
    let server: Server | null = null

    const finish = (result: Outcome): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      activeCancelFns.delete('gemini')
      try {
        server?.close()
      } catch {
        // Ignore
      }
      resolve(result)
    }

    const timeout = setTimeout(() => {
      finish({ ok: false, error: TIMEOUT_MESSAGE, code: 'timeout' })
    }, SIGN_IN_TIMEOUT_MS)

    activeCancelFns.set('gemini', () => {
      finish({ ok: false, error: 'Sign-in was cancelled.', code: 'cancelled' })
    })

    server = createServer((req, res) => {
      void (async () => {
        try {
          const reqUrl = req.url ?? '/'
          if (!reqUrl.includes('/oauth2callback')) {
            res.writeHead(301, { Location: GEMINI_SIGN_IN_FAILURE_URL })
            res.end()
            return
          }
          const parsedUrl = new URL(reqUrl, 'http://127.0.0.1')
          const errorParam = parsedUrl.searchParams.get('error')
          if (errorParam) {
            res.writeHead(301, { Location: GEMINI_SIGN_IN_FAILURE_URL })
            res.end()
            finish(
              cancelledInBrowser(errorParam)
                ? { ok: false, error: BROWSER_CANCELLED_MESSAGE, code: 'browser_cancelled' }
                : { ok: false, error: `Google OAuth error: ${errorParam}`, code: 'sign_in_failed' }
            )
            return
          }
          if (parsedUrl.searchParams.get('state') !== state) {
            res.writeHead(400)
            res.end('State mismatch.')
            finish({ ok: false, error: 'OAuth state mismatch.' })
            return
          }
          const code = parsedUrl.searchParams.get('code')
          const addr = server?.address()
          const port = addr && typeof addr === 'object' ? addr.port : 0
          const redirectUri = `http://127.0.0.1:${port}/oauth2callback`
          if (!code || !port) {
            res.writeHead(301, { Location: GEMINI_SIGN_IN_FAILURE_URL })
            res.end()
            finish({ ok: false, error: 'No authorization code received from Google.' })
            return
          }

          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: oauthClient.clientId,
              client_secret: oauthClient.clientSecret,
              code,
              grant_type: 'authorization_code',
              redirect_uri: redirectUri
            }).toString()
          })

          if (!tokenRes.ok) {
            res.writeHead(301, { Location: GEMINI_SIGN_IN_FAILURE_URL })
            res.end()
            finish({
              ok: false,
              error: `Token exchange failed (${tokenRes.status} ${tokenRes.statusText}).`
            })
            return
          }

          const tokens = (await tokenRes.json()) as Record<string, unknown>
          const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600
          const credsToSave: Record<string, unknown> = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            scope: tokens.scope,
            token_type: tokens.token_type ?? 'Bearer',
            id_token: tokens.id_token,
            expiry_date: Date.now() + expiresIn * 1000
          }

          await mkdir(geminiDir(), { recursive: true })
          await writeJsonFile(geminiOauthCredsPath(), credsToSave)

          // Fetch Google account email and cache it in google_accounts.json.
          if (typeof tokens.access_token === 'string') {
            try {
              const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokens.access_token}` }
              })
              if (infoRes.ok) {
                const info = (await infoRes.json()) as Record<string, unknown>
                if (typeof info.email === 'string' && info.email.trim() !== '') {
                  await writeJsonFile(geminiAccountsPath(), {
                    active: info.email.trim(),
                    old: []
                  })
                }
              }
            } catch {
              // Non-fatal: id_token also carries email/name
            }
          }

          await updateStoredAuth((cur) => ({ ...cur, geminiApiKey: null }))
          await setGeminiAuthType('oauth-personal')

          res.writeHead(301, { Location: GEMINI_SIGN_IN_SUCCESS_URL })
          res.end()
          finish({ ok: true })
        } catch (err) {
          finish({
            ok: false,
            error: err instanceof Error ? err.message : 'Google OAuth sign-in failed.'
          })
        }
      })()
    })

    server.on('error', (err) => {
      finish({ ok: false, error: `Could not start local OAuth server: ${err.message}` })
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address()
      const port = addr && typeof addr === 'object' ? addr.port : 0
      if (!port) {
        finish({ ok: false, error: 'Could not bind local OAuth callback port.' })
        return
      }
      const redirectUri = `http://127.0.0.1:${port}/oauth2callback`
      const params = new URLSearchParams({
        client_id: oauthClient.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'select_account consent',
        scope: GEMINI_OAUTH_SCOPES.join(' '),
        state
      })
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
      void shell.openExternal(authUrl)
    })
  })

  const status = await getProvidersStatus(true)
  if (loginOutcome.ok && status.gemini.loggedIn) {
    return { ok: true, status }
  }
  return {
    ok: false,
    error: loginOutcome.error ?? 'Sign-in was not completed.',
    code: loginOutcome.code ?? null,
    status
  }
}

// --- The LOGINS actions ---------------------------------------------------------------------------

const MADE_UP_STEP_MS = 900

function sleepFor(ms: number, isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (isCancelled() || Date.now() - started >= ms) {
        clearInterval(timer)
        resolve()
      }
    }, 100)
  })
}

// --- Made-up actions (MYA_LOGINS_FIXTURE) ----------------------------------------------------------

async function fixtureInstall(
  provider: CliProviderId,
  state: FixtureState,
  onProgress: (stage: string) => void
): Promise<ProviderActionResult> {
  let cancelled = false
  installJobs.set(provider, { cancel: () => (cancelled = true) })
  try {
    for (const stage of ['npm: fetching packages', 'npm: unpacking packages', 'npm: finishing']) {
      onProgress(stage)
      await sleepFor(MADE_UP_STEP_MS, () => cancelled)
      if (cancelled) {
        return {
          ok: false,
          error: 'Install cancelled.',
          code: 'cancelled',
          status: await getProvidersStatus()
        }
      }
    }
  } finally {
    installJobs.delete(provider)
  }
  if (state === 'install-fails') {
    return {
      ok: false,
      error: installFailedMessage(1),
      code: 'install_failed',
      exitCode: 1,
      log: 'npm ERR! code E404\nnpm ERR! 404 Not Found - GET https://registry.npmjs.org/made-up\nnpm ERR! A complete log of this run can be found in: made-up-log.txt',
      status: await getProvidersStatus()
    }
  }
  setFixture(provider, 'signed-out')
  return { ok: true, status: await getProvidersStatus(true) }
}

async function fixtureSignIn(
  provider: CliProviderId,
  state: FixtureState
): Promise<ProviderActionResult> {
  let cancelled = false
  activeCancelFns.set(provider, () => (cancelled = true))
  try {
    const wait =
      state === 'sign-in-times-out'
        ? fixtureSignInWaitMs(SIGN_IN_TIMEOUT_MS)
        : state === 'browser-cancelled'
          ? 2_500
          : 2_000
    await sleepFor(wait, () => cancelled)
  } finally {
    activeCancelFns.delete(provider)
  }
  if (cancelled) {
    return {
      ok: false,
      error: 'Sign-in was cancelled.',
      code: 'cancelled',
      status: await getProvidersStatus()
    }
  }
  if (state === 'sign-in-times-out') {
    return {
      ok: false,
      error: TIMEOUT_MESSAGE,
      code: 'timeout',
      status: await getProvidersStatus()
    }
  }
  if (state === 'browser-cancelled') {
    return {
      ok: false,
      error: BROWSER_CANCELLED_MESSAGE,
      code: 'browser_cancelled',
      status: await getProvidersStatus()
    }
  }
  setFixture(provider, 'signed-in-browser')
  return { ok: true, status: await getProvidersStatus(true) }
}

// --- Sign-in ------------------------------------------------------------------------------------

export async function loginProviderOAuth(provider: CliProviderId): Promise<ProviderActionResult> {
  cancelProviderLogin(provider)
  const fixture = fixtureOf(provider)
  if (fixture) return fixtureSignIn(provider, fixture)
  if (provider === 'codex') {
    return loginCodexOAuth()
  }
  return loginGeminiOAuth()
}

// SAVE KEY. Codex hands the key to its own CLI, which says whether it takes it; Gemini has no such
// check, so its key is kept as it is. Mya keeps its own copy (provider-auth.json) because a run
// starts the CLI with the key in its environment; the window only ever gets the masked form.
export async function saveProviderApiKey(
  provider: CliProviderId,
  rawKey: string
): Promise<ProviderActionResult> {
  const trimmed = typeof rawKey === 'string' ? rawKey.trim() : ''
  if (trimmed === '') {
    return {
      ok: false,
      error: 'Enter a non-empty API key.',
      status: await getProvidersStatus()
    }
  }
  if (/[\r\n]/.test(trimmed)) {
    return {
      ok: false,
      error: 'API key cannot contain line breaks.',
      status: await getProvidersStatus()
    }
  }

  const fixture = fixtureOf(provider)
  if (fixture) {
    if (fixture === 'key-rejected') {
      return {
        ok: false,
        error: keyRejectedMessage(PROVIDERS[provider].name),
        code: 'key_rejected',
        status: await getProvidersStatus()
      }
    }
    setFixture(provider, 'signed-in-key')
    return { ok: true, status: await getProvidersStatus(true) }
  }

  if (provider === 'codex') {
    const cli = await detectCliVersion('codex')
    if (!cli.installed) {
      return {
        ok: false,
        error: 'Install the CLI first.',
        code: 'not_installed',
        status: await getProvidersStatus()
      }
    }
    const taken = await runQuickCommand(
      'codex',
      ['login', '--with-api-key'],
      10_000,
      `${trimmed}\n`
    )
    if (!taken.ok) {
      return {
        ok: false,
        error: keyRejectedMessage(PROVIDERS.codex.name),
        code: 'key_rejected',
        status: await getProvidersStatus(true)
      }
    }
    await updateStoredAuth((cur) => ({ ...cur, codexApiKey: trimmed }))
  } else {
    await updateStoredAuth((cur) => ({ ...cur, geminiApiKey: trimmed }))
    await setGeminiAuthType('gemini-api-key')
  }

  return { ok: true, status: await getProvidersStatus(true) }
}

export async function logoutProvider(provider: CliProviderId): Promise<ProviderActionResult> {
  cancelProviderLogin(provider)
  const fixture = fixtureOf(provider)
  if (fixture) {
    if (fixture === 'signed-in-env') {
      return {
        ok: false,
        error: envKeySignOutMessage(
          fixtureStatus(provider, fixture).envVar ?? envVarsFor(provider)[0]
        ),
        code: 'env_key',
        status: await getProvidersStatus()
      }
    }
    setFixture(provider, 'signed-out')
    return { ok: true, status: await getProvidersStatus(true) }
  }
  // A key that comes from the environment is not Mya's to remove.
  const before = await getProvidersStatus(true)
  const current = provider === 'codex' ? before.codex : before.gemini
  if (current.method === 'env') {
    return {
      ok: false,
      error: envKeySignOutMessage(current.envVar ?? envVarsFor(provider)[0]),
      code: 'env_key',
      status: before
    }
  }
  if (provider === 'codex') {
    await updateStoredAuth((cur) => ({ ...cur, codexApiKey: null }))
    await runQuickCommand('codex', ['logout'], 6_000).catch(() => {})
    await unlink(codexAuthPath()).catch(() => {})
  } else {
    await updateStoredAuth((cur) => ({ ...cur, geminiApiKey: null }))
    await unlink(geminiOauthCredsPath()).catch(() => {})
    await unlink(geminiAccountsPath()).catch(() => {})
  }
  return { ok: true, status: await getProvidersStatus(true) }
}

// --- INSTALL CLI -----------------------------------------------------------------------------------

const installJobs = new Map<CliProviderId, { cancel: () => void }>()
const INSTALL_TIMEOUT_MS = 180_000
const LOG_LINES = 40

export function cancelProviderInstall(provider: CliProviderId): { ok: boolean } {
  const job = installJobs.get(provider)
  if (!job) return { ok: false }
  job.cancel()
  return { ok: true }
}

// Runs npm install -g for the CLI. `onProgress` hears each stage as npm goes. CANCEL stops it, and a
// failure keeps npm's exit code and the end of its output (COPY LOG).
export async function installProviderCli(
  provider: CliProviderId,
  onProgress: (stage: string) => void = () => {}
): Promise<ProviderActionResult> {
  const fixture = fixtureOf(provider)
  if (fixture) return fixtureInstall(provider, fixture, onProgress)
  if (installJobs.has(provider)) {
    return { ok: false, error: 'An install is already going.', status: await getProvidersStatus() }
  }
  const pkg = packageFor(provider)
  const outcome = await new Promise<{
    exitCode: number | null
    cancelled: boolean
    timedOut: boolean
    log: string[]
  }>((resolve) => {
    const log: string[] = []
    let cancelled = false
    let timedOut = false
    const child = spawn('npm', ['install', '-g', pkg], {
      env: augmentedEnv(),
      shell: process.platform === 'win32',
      windowsHide: true
    })
    const hear = (chunk: Buffer): void => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        if (line.trim() === '') continue
        log.push(line)
        if (log.length > LOG_LINES) log.shift()
        const stage = installStage(line)
        if (stage) onProgress(stage)
      }
    }
    child.stdout?.on('data', hear)
    child.stderr?.on('data', hear)
    const timer = setTimeout(() => {
      timedOut = true
      killProcessTree(child)
    }, INSTALL_TIMEOUT_MS)
    installJobs.set(provider, {
      cancel: () => {
        cancelled = true
        killProcessTree(child)
      }
    })
    const done = (exitCode: number | null): void => {
      clearTimeout(timer)
      installJobs.delete(provider)
      resolve({ exitCode, cancelled, timedOut, log })
    }
    child.on('error', (err) => {
      log.push(err.message)
      done(null)
    })
    child.on('close', (code) => done(code))
  })

  const status = await getProvidersStatus(true)
  if (outcome.cancelled) {
    return { ok: false, error: 'Install cancelled.', code: 'cancelled', status }
  }
  const installed = provider === 'codex' ? status.codex.installed : status.gemini.installed
  if (outcome.exitCode === 0 && installed) return { ok: true, status }
  return {
    ok: false,
    error: installFailedMessage(outcome.exitCode),
    code: 'install_failed',
    exitCode: outcome.exitCode,
    log: outcome.log.join('\n'),
    status
  }
}

// Whether the CLI could not start even though it is there: for the "Couldn't run ... --version"
// card. Kept next to the status so one place knows the binary names.
export function cliBinary(provider: CliProviderId): string {
  return binaryFor(provider)
}
