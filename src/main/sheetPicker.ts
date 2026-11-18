import { BrowserWindow, dialog, nativeImage } from 'electron'
import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import type { PickSheetResult, SliceSheetResult } from '../shared/ipc'
import {
  FRAME_SIZE,
  MAX_SHEET_BYTES,
  MAX_SOURCE_SIDE,
  SHEET_NOT_IMAGE,
  SHEET_NOT_PNG,
  sheetSizeProblem,
  sheetTooBigMessage,
  sourceTooLargeMessage
} from '../shared/mascotRules'
import { checkSlice, SLICE_EMPTY_MESSAGE } from '../shared/sliceRules'
import { pngSize, readPngHeader, toPngDataUrl, type PngSize } from './png'
import { PendingFiles } from './pendingFiles'
import { checkSheetBytes, type Decoder, type SheetCheck } from './sheetCheck'
import { cutFrames } from './sheetSlice'

// Picking a spritesheet in a file dialog, slicing a grid into a strip, and the picks that wait
// behind a token until the form that made them saves or drops them. Mascots and bosses each
// make their own picker, so a mascot form and a boss form never share a token.

// The size nativeImage reads, or null when it cannot decode the bytes.
export const nativeDecode: Decoder = (bytes) => {
  const image = nativeImage.createFromBuffer(bytes)
  return image.isEmpty() ? null : image.getSize()
}

// The sheet rules on a whole file, decoded with nativeImage.
export function checkSheet(bytes: Buffer): SheetCheck {
  return checkSheetBytes(bytes, nativeDecode)
}

// Chromium does not load a URL longer than this.
const MAX_URL_LENGTH = 2 * 1024 * 1024

// A legal strip as a data: URL for the window. A strip is at most 1024x64, so a
// file too big for a data: URL is mostly extra chunks; the copy shown is then
// re-encoded without them. The stored file is never changed.
export function stripUrl(bytes: Buffer): string {
  const url = toPngDataUrl(bytes)
  if (url.length <= MAX_URL_LENGTH) return url
  return toPngDataUrl(nativeImage.createFromBuffer(bytes).toPNG())
}

// True when the bytes decode to an image of the size the PNG header gives.
function decodes(bytes: Buffer, size: PngSize): boolean {
  const decoded = nativeDecode(bytes)
  return decoded !== null && decoded.width === size.width && decoded.height === size.height
}

// A sheet in another layout, waiting to be sliced. It stays until the form closes, so it can
// feed several rows. The latest one is enough.
type SourceSheet = { bytes: Buffer; width: number; height: number }

const SLICE_FAILED = 'The sheet could not be cut into frames.'

export type SheetPicker = {
  pick: (window: BrowserWindow | null) => Promise<PickSheetResult>
  // The bytes behind a token, or undefined once it is gone.
  get: (token: string) => Buffer | undefined
  has: (token: string) => boolean
  // Lets a pick go: it was saved, replaced, or its form closed.
  discard: (token: string) => void
  // Lets go of every loaded source sheet.
  dropSources: () => void
  // Lets go of every pick that is still waiting.
  clearPicks: () => void
  // Cuts the picked cells out of a source sheet into a strip that waits behind a token.
  slice: (rawToken: unknown, columns: unknown, rows: unknown, cells: unknown) => SliceSheetResult
}

export function createSheetPicker(options: { title: string; maxPicks: number }): SheetPicker {
  const pendingSheets = new PendingFiles<Buffer>(options.maxPicks)
  const pendingSources = new PendingFiles<SourceSheet>(1)

  async function pick(window: BrowserWindow | null): Promise<PickSheetResult> {
    const dialogOptions: Electron.OpenDialogOptions = {
      title: options.title,
      properties: ['openFile'],
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    }
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled || result.filePaths.length === 0) return { ok: true, canceled: true }

    const path = result.filePaths[0]
    const fileName = basename(path)
    const refuse = (message: string): PickSheetResult => ({
      ok: false,
      error: { code: 'invalid', message }
    })
    try {
      // Refusals, in order. Only the header and the file size are read before
      // the file is known to be a PNG under the size limit.
      const header = pngSize(await readPngHeader(path))
      if (!header) return refuse(SHEET_NOT_PNG)
      const { size } = await stat(path)
      if (size > MAX_SHEET_BYTES) return refuse(sheetTooBigMessage(size))
      if (header.width > MAX_SOURCE_SIDE || header.height > MAX_SOURCE_SIDE) {
        return refuse(sourceTooLargeMessage(header.width, header.height))
      }
      const bytes = await readFile(path)
      if (bytes.length > MAX_SHEET_BYTES) return refuse(sheetTooBigMessage(bytes.length))
      if (!decodes(bytes, header)) return refuse(SHEET_NOT_IMAGE)

      // A legal strip is used as it is; the slicer never opens.
      if (sheetSizeProblem(header.width, header.height) === null) {
        const check = checkSheet(bytes)
        if (!check.ok) return refuse(check.message)
        return {
          ok: true,
          canceled: false,
          kind: 'strip',
          token: pendingSheets.add(bytes),
          preview: stripUrl(bytes),
          frames: check.frames,
          width: check.width,
          fileName
        }
      }

      // Anything else is cut up in the slicer first.
      return {
        ok: true,
        canceled: false,
        kind: 'needs_slice',
        sourceToken: pendingSources.add({ bytes, width: header.width, height: header.height }),
        fileName,
        width: header.width,
        height: header.height,
        bytes
      }
    } catch (err) {
      console.error('Could not read the sheet:', err)
      return {
        ok: false,
        error: { code: 'io_error', message: 'The sheet file could not be read.' }
      }
    }
  }

  // Every argument is checked again; nothing is written to disk.
  function slice(
    rawToken: unknown,
    columns: unknown,
    rows: unknown,
    cells: unknown
  ): SliceSheetResult {
    const source = typeof rawToken === 'string' ? pendingSources.get(rawToken) : undefined
    if (!source) {
      return {
        ok: false,
        error: { code: 'not_found', message: 'This sheet is no longer loaded. Upload it again.' }
      }
    }
    const status = checkSlice(source.width, source.height, columns, rows, cells)
    if (!status.canUse) {
      const message = status.level === 'error' ? status.message : SLICE_EMPTY_MESSAGE
      return { ok: false, error: { code: 'invalid_slice', message } }
    }
    // checkSlice has proved these are whole numbers in range.
    const grid = { columns: columns as number, rows: rows as number, cells: cells as number[] }
    try {
      const bitmap = nativeImage.createFromBuffer(source.bytes).toBitmap()
      if (bitmap.length !== source.width * source.height * 4)
        throw new Error('Unexpected bitmap size')
      const cellWidth = source.width / grid.columns
      const cellHeight = source.height / grid.rows
      const strip = cutFrames(bitmap, source.width, grid.columns, cellWidth, cellHeight, grid.cells)
      const png = nativeImage
        .createFromBitmap(strip, { width: FRAME_SIZE * grid.cells.length, height: FRAME_SIZE })
        .toPNG()
      // The cut must pass the same rules as any picked sheet. If not, it is a bug in the cut.
      const check = checkSheet(png)
      if (!check.ok || check.frames !== grid.cells.length) {
        throw new Error(
          `Sliced sheet failed the sheet rules: ${check.ok ? 'frame count' : check.message}`
        )
      }
      return {
        ok: true,
        token: pendingSheets.add(png),
        frames: check.frames,
        preview: toPngDataUrl(png)
      }
    } catch (err) {
      console.error('[sheets] Could not slice the sheet:', err)
      return { ok: false, error: { code: 'io_error', message: SLICE_FAILED } }
    }
  }

  return {
    pick,
    get: (token) => pendingSheets.get(token),
    has: (token) => pendingSheets.has(token),
    discard: (token) => pendingSheets.delete(token),
    dropSources: () => pendingSources.clear(),
    clearPicks: () => pendingSheets.clear(),
    slice
  }
}
