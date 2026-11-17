import { randomUUID } from 'crypto'
import type { Dirent } from 'fs'
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  bossManifestText,
  isCustomBossId,
  readBossManifest,
  type BossBackgroundInfo,
  type BossLoop
} from '../shared/bosses.ts'
import { BOSS_BG_MAX_BYTES, BOSS_BG_TOO_BIG } from '../shared/bossBackground.ts'
import { MAX_SHEET_BYTES, sheetTooBigMessage } from '../shared/mascotRules.ts'
import { checkBackground } from './bossBackground.ts'
import { extensionFor, toDataUrl, type ImageKind } from './imageFile.ts'
import { renameWithRetry, writeFileSafely } from './safeWrite.ts'
import { checkSheetBytes, type Decoder } from './sheetCheck.ts'

// A boss pack is a folder userData/bosses/<uuid>/ holding manifest.json, the idle strip, and
// a background when it has one. These functions read and write such a folder with plain
// files, so they are tested without Electron. The decoder and the strip's data URL (which
// re-encodes a strip too big for a URL) are passed in by main.

export type PackDeps = { decode: Decoder; stripUrl: (bytes: Buffer) => string }

// A pack read from its folder: the file names the manifest uses, for editing, and the
// pictures as data URLs.
export type LoadedBoss = {
  id: string
  // 1 for a pack in the first format, which is only upgraded when it is saved in the editor.
  format: 1 | 2
  name: string
  accent: string
  idleFile: string
  idle: BossLoop
  background: (BossBackgroundInfo & { src: string }) | null
}

export type LoadResult = { ok: true; boss: LoadedBoss } | { ok: false; problem: string }

class PackProblem extends Error {}

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff)
const MANIFEST = 'manifest.json'
// A pack is built in .tmp-<uuid>/ and renamed into place when complete.
export const TEMP_PREFIX = '.tmp-'

function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code
}

async function readChecked(path: string, file: string, limit: number): Promise<Buffer | number> {
  try {
    const { size } = await stat(path)
    if (size > limit) return size
    return await readFile(path)
  } catch (err) {
    if (errorCode(err) === 'ENOENT') throw new PackProblem(`${file} is missing.`)
    throw new PackProblem(`${file} could not be read.`)
  }
}

async function readFolder(id: string, folder: string, deps: PackDeps): Promise<LoadedBoss> {
  let text: string
  try {
    text = await readFile(join(folder, MANIFEST), 'utf8')
  } catch (err) {
    throw new PackProblem(
      errorCode(err) === 'ENOENT' ? 'manifest.json is missing.' : 'manifest.json could not be read.'
    )
  }
  let raw: unknown
  try {
    raw = JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text)
  } catch {
    throw new PackProblem('manifest.json is not valid JSON.')
  }
  const read = readBossManifest(raw)
  if (!read.ok) throw new PackProblem(read.message)
  const { manifest } = read

  // The idle strip passes the same rules as a mascot sheet. The image decides the frame
  // count, whatever the manifest says.
  const strip = await readChecked(
    join(folder, manifest.idle.file),
    manifest.idle.file,
    MAX_SHEET_BYTES
  )
  if (typeof strip === 'number') {
    throw new PackProblem(`${manifest.idle.file}: ${sheetTooBigMessage(strip)}`)
  }
  const sheet = checkSheetBytes(strip, deps.decode)
  if (!sheet.ok) throw new PackProblem(`${manifest.idle.file}: ${sheet.message}`)

  let background: LoadedBoss['background'] = null
  if (manifest.background !== null) {
    const file = manifest.background
    const bytes = await readChecked(join(folder, file), file, BOSS_BG_MAX_BYTES)
    if (typeof bytes === 'number') throw new PackProblem(BOSS_BG_TOO_BIG)
    const check = checkBackground(bytes, file, deps.decode)
    if (!check.ok) throw new PackProblem(check.message)
    background = {
      file,
      width: check.width,
      height: check.height,
      src: toDataUrl(bytes, check.kind)
    }
  }

  return {
    id,
    format: read.format,
    name: manifest.name,
    accent: manifest.accent,
    idleFile: manifest.idle.file,
    idle: { src: deps.stripUrl(strip), frames: sheet.frames, fps: manifest.idle.fps },
    background
  }
}

// Reads one pack folder and runs every rule on it. Never throws: anything wrong is the problem,
// in words for the manager's problem card.
export async function loadBossFolder(
  id: string,
  folder: string,
  deps: PackDeps
): Promise<LoadResult> {
  try {
    return { ok: true, boss: await readFolder(id, folder, deps) }
  } catch (err) {
    if (err instanceof PackProblem) return { ok: false, problem: err.message }
    console.error(`[bosses] Could not read the boss pack "${id}":`, err)
    return { ok: false, problem: 'The folder could not be read.' }
  }
}

async function createdTime(path: string): Promise<number> {
  try {
    const info = await stat(path)
    return info.birthtimeMs || info.mtimeMs
  } catch {
    return 0
  }
}

// The pack folders in `root`, oldest first. A folder whose name is not a UUID is not a pack
// (it could not be named by an id that is checked before a path is built) and is skipped.
// A folder a crash left half built (.tmp-<uuid>) is removed.
export async function listBossFolders(root: string): Promise<{ ids: string[]; skipped: string[] }> {
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return { ids: [], skipped: [] }
    throw err
  }
  const skipped: string[] = []
  const found: { id: string; time: number }[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (
      entry.name.startsWith(TEMP_PREFIX) &&
      isCustomBossId(entry.name.slice(TEMP_PREFIX.length))
    ) {
      await rm(join(root, entry.name), { recursive: true, force: true }).catch(() => {})
    } else if (isCustomBossId(entry.name)) {
      found.push({ id: entry.name, time: await createdTime(join(root, entry.name)) })
    } else {
      skipped.push(entry.name)
    }
  }
  found.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
  return { ids: found.map((item) => item.id), skipped }
}

// --- Writing ------------------------------------------------------------------------------

export type IdleWrite =
  { type: 'keep'; frames: number; file: string } | { type: 'write'; bytes: Buffer; frames: number }
export type BackgroundWrite =
  | { type: 'none' }
  | { type: 'keep'; file: string }
  | { type: 'write'; bytes: Buffer; kind: ImageKind }

export type PackPlan = {
  name: string
  accent: string
  fps: number
  idle: IdleWrite
  background: BackgroundWrite
}

// The files the plan leaves in the pack and what its manifest says.
function layout(plan: PackPlan): {
  idleFile: string
  backgroundFile: string | null
  manifest: string
} {
  const idleFile = plan.idle.type === 'keep' ? plan.idle.file : 'idle.png'
  const backgroundFile =
    plan.background.type === 'none'
      ? null
      : plan.background.type === 'keep'
        ? plan.background.file
        : `background.${extensionFor(plan.background.kind)}`
  const manifest = bossManifestText({
    name: plan.name,
    accent: plan.accent,
    background: backgroundFile,
    idle: { file: idleFile, frames: plan.idle.frames, fps: plan.fps }
  })
  return { idleFile, backgroundFile, manifest }
}

// A new pack: built in a temporary folder, manifest last, then renamed into place, so a half
// written pack never appears.
export async function createBossFolder(root: string, id: string, plan: PackPlan): Promise<void> {
  if (plan.idle.type !== 'write' || plan.background.type === 'keep') {
    throw new Error('A new boss pack has nothing to keep.')
  }
  const { idleFile, backgroundFile, manifest } = layout(plan)
  await mkdir(root, { recursive: true })
  const temp = join(root, `${TEMP_PREFIX}${randomUUID()}`)
  await mkdir(temp)
  try {
    await writeFile(join(temp, idleFile), plan.idle.bytes)
    if (plan.background.type === 'write' && backgroundFile) {
      await writeFile(join(temp, backgroundFile), plan.background.bytes)
    }
    await writeFileSafely(join(temp, MANIFEST), manifest)
    await renameWithRetry(temp, join(root, id))
  } catch (err) {
    await rm(temp, { recursive: true, force: true }).catch(() => {})
    throw err
  }
}

// An existing pack: new pictures first, each through a temporary file, then the manifest, then
// the files the manifest no longer uses (a removed background, a replaced file of another
// name). Always written as format 2. `previous` names the files the old manifest used.
export async function updateBossFolder(
  folder: string,
  plan: PackPlan,
  previous: { idleFile: string; backgroundFile: string | null }
): Promise<void> {
  const { idleFile, backgroundFile, manifest } = layout(plan)
  if (plan.idle.type === 'write') await writeFileSafely(join(folder, idleFile), plan.idle.bytes)
  if (plan.background.type === 'write' && backgroundFile) {
    await writeFileSafely(join(folder, backgroundFile), plan.background.bytes)
  }
  await writeFileSafely(join(folder, MANIFEST), manifest)
  // The manifest no longer lists these, so a failure here only leaves a stray file.
  const stale = [previous.idleFile, previous.backgroundFile].filter(
    (file): file is string => file !== null && file !== idleFile && file !== backgroundFile
  )
  for (const file of stale) {
    await unlink(join(folder, file)).catch((err: unknown) => {
      if (errorCode(err) !== 'ENOENT') console.error('[bosses] Could not remove a file:', err)
    })
  }
}
