import { app, BrowserWindow, dialog, shell } from 'electron'
import { randomUUID } from 'crypto'
import { readFile, stat } from 'fs/promises'
import { basename, join } from 'path'
import {
  canLeavePool,
  DEFAULT_BOSSES,
  isBossAccent,
  isBuiltInBoss,
  isCustomBossId,
  bossNameError,
  POOL_LAST_MESSAGE,
  type BossListItem
} from '../shared/bosses'
import { BOSS_BG_MAX_BYTES, BOSS_BG_TOO_BIG } from '../shared/bossBackground'
import {
  IpcChannel,
  type BossBackgroundChange,
  type BossesErrorCode,
  type BossesResult,
  type BossIdleChange,
  type PickBackgroundResult,
  type PickSheetResult,
  type SliceSheetResult
} from '../shared/ipc'
import { isValidFps, MAX_FPS, MIN_FPS } from '../shared/mascotRules'
import { checkBackground } from './bossBackground'
import {
  createBossFolder,
  listBossFolders,
  loadBossFolder,
  updateBossFolder,
  type LoadedBoss,
  type LoadResult,
  type PackDeps,
  type PackPlan
} from './bossPackFiles'
import { toDataUrl, type ImageKind } from './imageFile'
import { isObject, serialQueue } from './jsonFile'
import { PendingFiles } from './pendingFiles'
import { getBossesOutOfPool, setBossesOutOfPool } from './settings'
import { checkSheet, createSheetPicker, nativeDecode, stripUrl } from './sheetPicker'

// The bosses. The three built-in ones are bundled with the window (src/shared/bosses.ts names
// them). The rest are folders userData/bosses/<uuid>/ (see bossPackFiles.ts for what is in one).
// The window names a boss by id only, and an id is checked to be a UUID or a built-in id before
// a path is built from it. A pack that fails a rule is listed as a problem and never picked.

const deps: PackDeps = { decode: nativeDecode, stripUrl }

class BossesFailure extends Error {
  constructor(
    readonly code: BossesErrorCode,
    message: string
  ) {
    super(message)
  }
}

function fail(code: BossesErrorCode, message: string): never {
  throw new BossesFailure(code, message)
}

function invalid(message: string): never {
  fail('invalid', message)
}

// One boss operation at a time, so a save, a delete, and a listing never interleave.
const queue = serialQueue()

async function run<T extends object>(task: () => Promise<T>): Promise<BossesResult<T>> {
  try {
    return { ok: true, ...(await queue(task)) }
  } catch (err) {
    if (err instanceof BossesFailure) {
      return { ok: false, error: { code: err.code, message: err.message } }
    }
    console.error('[bosses]', err)
    return {
      ok: false,
      error: { code: 'io_error', message: 'The boss files could not be read or written.' }
    }
  }
}

function packsDir(): string {
  return join(app.getPath('userData'), 'bosses')
}

// Tells every window to read the bosses again.
function broadcastChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IpcChannel.BossesChanged)
  }
}

// --- Reading ------------------------------------------------------------------------------

type Entry = { id: string; result: LoadResult }

let cache: Entry[] | null = null
// A broken folder is logged once, not on every read.
const reported = new Set<string>()

async function readAll(): Promise<Entry[]> {
  const { ids, skipped } = await listBossFolders(packsDir())
  for (const name of skipped) {
    if (!reported.has(name)) console.error(`[bosses] Skipped "${name}": not a boss pack id.`)
    reported.add(name)
  }
  const entries: Entry[] = []
  for (const id of ids) {
    const result = await loadBossFolder(id, join(packsDir(), id), deps)
    if (!result.ok && !reported.has(id)) {
      console.error(`[bosses] The boss pack "${id}" has a problem: ${result.problem}`)
    }
    reported.add(id)
    entries.push({ id, result })
  }
  cache = entries
  return entries
}

// `fresh` reads the folders again (the manager does, so a pack made by hand shows up); a fight
// uses what was read last.
async function entries(fresh = false): Promise<Entry[]> {
  return fresh || !cache ? readAll() : cache
}

function validCustom(list: Entry[]): LoadedBoss[] {
  return list.flatMap((entry) => (entry.result.ok ? [entry.result.boss] : []))
}

// Every boss a fight could meet: the built-in ones, then the valid custom ones.
export function validBosses(): Promise<{ id: string; name: string }[]> {
  return queue(async () => [
    ...DEFAULT_BOSSES.map(({ id, name }) => ({ id, name })),
    ...validCustom(await entries()).map(({ id, name }) => ({ id, name }))
  ])
}

// `inFights` holds the id of every boss a saved fight (current or finished) was against.
export function listBosses(
  inFights: ReadonlySet<string>
): Promise<BossesResult<{ bosses: BossListItem[] }>> {
  return run(async () => {
    const custom = await entries(true)
    const out = new Set(await getBossesOutOfPool())
    const bosses: BossListItem[] = DEFAULT_BOSSES.map((boss) => ({
      id: boss.id,
      name: boss.name,
      accent: boss.accent,
      builtIn: true,
      inPool: !out.has(boss.id),
      problem: null,
      idle: null,
      idleFile: null,
      background: null,
      backgroundInfo: null,
      inFight: inFights.has(boss.id)
    }))
    for (const { id, result } of custom) {
      if (!result.ok) {
        bosses.push({ id, builtIn: false, inPool: false, problem: result.problem })
        continue
      }
      const { boss } = result
      bosses.push({
        id,
        name: boss.name,
        accent: boss.accent,
        builtIn: false,
        inPool: !out.has(id),
        problem: null,
        idle: boss.idle,
        idleFile: boss.idleFile,
        inFight: inFights.has(id),
        background: boss.background?.src ?? null,
        backgroundInfo: boss.background
          ? {
              file: boss.background.file,
              width: boss.background.width,
              height: boss.background.height
            }
          : null
      })
    }
    return { bosses }
  })
}

// --- Picking ------------------------------------------------------------------------------

// An idle strip is picked like a mascot sheet. A form has one, so a few slots are enough.
const picker = createSheetPicker({ title: 'Choose an idle loop: a PNG strip or grid', maxPicks: 5 })

type PickedBackground = { bytes: Buffer; kind: ImageKind; fileName: string }
const backgrounds = new PendingFiles<PickedBackground>(3)

export function pickIdle(window: BrowserWindow | null): Promise<PickSheetResult> {
  return picker.pick(window)
}

export function sliceIdle(
  token: unknown,
  columns: unknown,
  rows: unknown,
  cells: unknown
): SliceSheetResult {
  return picker.slice(token, columns, rows, cells)
}

// The editor closed: its source sheet and every pick it did not save go.
export function dropBossPicks(): void {
  picker.dropSources()
  picker.clearPicks()
  backgrounds.clear()
}

export async function pickBackground(window: BrowserWindow | null): Promise<PickBackgroundResult> {
  const options: Electron.OpenDialogOptions = {
    title: 'Choose a background: a PNG or JPG',
    properties: ['openFile'],
    filters: [{ name: 'PNG or JPG image', extensions: ['png', 'jpg', 'jpeg'] }]
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return { ok: true, canceled: true }

  const path = result.filePaths[0]
  const fileName = basename(path)
  const refuse = (message: string): PickBackgroundResult => ({
    ok: false,
    error: { code: 'invalid', message }
  })
  try {
    // The size first, so a file over the limit is never read.
    if ((await stat(path)).size > BOSS_BG_MAX_BYTES) return refuse(BOSS_BG_TOO_BIG)
    const bytes = await readFile(path)
    const check = checkBackground(bytes, fileName, nativeDecode)
    if (!check.ok) return refuse(check.message)
    return {
      ok: true,
      canceled: false,
      token: backgrounds.add({ bytes, kind: check.kind, fileName }),
      fileName,
      width: check.width,
      height: check.height,
      preview: toDataUrl(bytes, check.kind)
    }
  } catch (err) {
    console.error('[bosses] Could not read the background:', err)
    return {
      ok: false,
      error: { code: 'io_error', message: 'The background file could not be read.' }
    }
  }
}

// --- Changing -----------------------------------------------------------------------------

type CleanDraft = {
  name: string
  accent: string
  fps: number
  idle: BossIdleChange
  background: BossBackgroundChange
}

function readTokenChange(raw: unknown, allowRemove: boolean): BossBackgroundChange | null {
  if (!isObject(raw)) return null
  if (raw.type === 'keep' || (allowRemove && raw.type === 'remove')) return { type: raw.type }
  if (raw.type === 'token' && typeof raw.token === 'string') {
    return { type: 'token', token: raw.token }
  }
  return null
}

// Checks every field of a draft from the window.
function readDraft(raw: unknown): CleanDraft {
  if (!isObject(raw)) invalid('The boss details are missing.')
  if (typeof raw.name !== 'string') invalid('Name is required.')
  const nameError = bossNameError(raw.name)
  if (nameError) invalid(nameError)
  if (!isBossAccent(raw.accent)) invalid('The accent must be a color like #F0706A.')
  if (!isValidFps(raw.fps)) invalid(`FPS must be a whole number from ${MIN_FPS} to ${MAX_FPS}.`)
  const idle = readTokenChange(raw.idle, false)
  if (!idle || idle.type === 'remove') invalid('The idle loop change is not valid.')
  const background = readTokenChange(raw.background, true)
  if (!background) invalid('The background change is not valid.')
  return {
    name: raw.name.trim(),
    accent: raw.accent.toUpperCase(),
    fps: raw.fps,
    idle,
    background
  }
}

// What to write for the picked files. Picked files are checked again here.
function pickedIdle(draft: CleanDraft): { bytes: Buffer; frames: number } | null {
  if (draft.idle.type !== 'token') return null
  const bytes = picker.get(draft.idle.token)
  if (!bytes) invalid('The idle loop is no longer available. Upload it again.')
  const check = checkSheet(bytes)
  if (!check.ok) invalid(`Idle loop: ${check.message}`)
  return { bytes, frames: check.frames }
}

function pickedBackground(draft: CleanDraft): PickedBackground | null {
  if (draft.background.type !== 'token') return null
  const picked = backgrounds.get(draft.background.token)
  if (!picked) invalid('The background is no longer available. Upload it again.')
  const check = checkBackground(picked.bytes, picked.fileName, nativeDecode)
  if (!check.ok) invalid(check.message)
  return picked
}

function release(draft: CleanDraft): void {
  if (draft.idle.type === 'token') picker.discard(draft.idle.token)
  if (draft.background.type === 'token') backgrounds.delete(draft.background.token)
}

// The id of a custom boss the window sent. A built-in boss cannot be changed.
function customId(raw: unknown, action: string): string {
  if (typeof raw === 'string' && isBuiltInBoss(raw)) {
    fail('built_in', `The built-in bosses cannot be ${action}.`)
  }
  if (!isCustomBossId(raw)) invalid('That is not a boss id.')
  return raw
}

export function createBoss(rawDraft: unknown): Promise<BossesResult<{ id: string }>> {
  return run(async () => {
    const draft = readDraft(rawDraft)
    const idle = pickedIdle(draft)
    if (!idle) invalid('Idle loop is required.')
    const background = pickedBackground(draft)
    const plan: PackPlan = {
      name: draft.name,
      accent: draft.accent,
      fps: draft.fps,
      idle: { type: 'write', ...idle },
      background: background
        ? { type: 'write', bytes: background.bytes, kind: background.kind }
        : { type: 'none' }
    }
    const id = randomUUID()
    await createBossFolder(packsDir(), id, plan)
    release(draft)
    cache = null
    broadcastChanged()
    return { id }
  })
}

export function updateBoss(
  rawId: unknown,
  rawDraft: unknown
): Promise<BossesResult<{ id: string }>> {
  return run(async () => {
    const id = customId(rawId, 'edited')
    const found = (await entries(true)).find((entry) => entry.id === id)
    if (!found) fail('not_found', 'This boss no longer exists.')
    if (!found.result.ok) invalid(`This boss cannot be edited. ${found.result.problem}`)
    const { boss } = found.result
    const draft = readDraft(rawDraft)
    const idle = pickedIdle(draft)
    const background = pickedBackground(draft)
    const plan: PackPlan = {
      name: draft.name,
      accent: draft.accent,
      fps: draft.fps,
      idle: idle
        ? { type: 'write', ...idle }
        : { type: 'keep', file: boss.idleFile, frames: boss.idle.frames },
      background: background
        ? { type: 'write', bytes: background.bytes, kind: background.kind }
        : draft.background.type === 'keep' && boss.background
          ? { type: 'keep', file: boss.background.file }
          : { type: 'none' }
    }
    await updateBossFolder(join(packsDir(), id), plan, {
      idleFile: boss.idleFile,
      backgroundFile: boss.background?.file ?? null
    })
    release(draft)
    cache = null
    broadcastChanged()
    return { id }
  })
}

export function removeBoss(rawId: unknown): Promise<BossesResult> {
  return run(async () => {
    const id = customId(rawId, 'deleted')
    // A folder with a problem can be deleted too, so it is the folder that has to exist.
    const folder = join(packsDir(), id)
    try {
      if (!(await stat(folder)).isDirectory()) fail('not_found', 'This boss no longer exists.')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        fail('not_found', 'This boss no longer exists.')
      }
      throw err
    }
    await shell.trashItem(folder)
    // A deleted boss's id leaves the pool list; a fight that used it is drawn as The Red Suite.
    const out = await getBossesOutOfPool()
    if (out.includes(id)) await setBossesOutOfPool(out.filter((other) => other !== id))
    cache = null
    broadcastChanged()
    return {}
  })
}

export function setBossInPool(
  rawId: unknown,
  on: unknown
): Promise<BossesResult<{ inPool: boolean }>> {
  return run(async () => {
    if (typeof rawId !== 'string' || typeof on !== 'boolean') invalid('That is not a boss.')
    const valid = [
      ...DEFAULT_BOSSES.map((boss) => boss.id),
      ...validCustom(await entries(true)).map((boss) => boss.id)
    ]
    if (!valid.includes(rawId)) fail('not_found', 'This boss no longer exists.')
    const out = await getBossesOutOfPool()
    if (!on && !canLeavePool(valid, out, rawId)) fail('last_in_pool', POOL_LAST_MESSAGE)
    const next = on
      ? out.filter((id) => id !== rawId)
      : [...out.filter((id) => id !== rawId), rawId]
    await setBossesOutOfPool(next)
    broadcastChanged()
    return { inPool: on }
  })
}
