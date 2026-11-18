import { useEffect, useRef, useState } from 'react'
import type { PickSheetResult, SliceSheetResult } from '../../../shared/ipc'
import type { SliceGrid, SliceSource } from './SheetSlicer'

// The calls a form makes to main to pick and cut spritesheets. The mascot editor and the boss
// editor each pass their own; the flow around them is the same.
export type SheetApi = {
  pick: () => Promise<PickSheetResult>
  slice: (
    sourceToken: string,
    columns: number,
    rows: number,
    cells: number[]
  ) => Promise<SliceSheetResult>
  // Drops a pick that will not be saved. Without it, picks wait until dropSources.
  discard?: (token: string) => Promise<void>
  // Drops every loaded source sheet (and, for bosses, every pick not saved).
  dropSources: () => Promise<void>
}

// A strip that waits in main behind `token`.
export type PickedStrip = { token: string; preview: string; frames: number; fileName: string }

type Handlers<K extends string> = {
  // The speed a new strip in this row starts at.
  startingFps: (row: K) => string
  // Whether the loop of a new strip in this row starts reversed.
  startingReverse: (row: K) => boolean
  // A strip is ready for this row.
  onStrip: (row: K, strip: PickedStrip, fps: string, reverse: boolean) => void
  // A message for the row, or null to clear it.
  onError: (row: K, message: string | null) => void
}

export type SlicingState<K extends string> = {
  row: K
  // The row's fps text while it slices, for the preview.
  fps: string
  // Whether the slicer opens with REVERSE AT END on.
  reverse: boolean
  // Gives each opening a fresh slicer.
  opening: number
}

export type SheetPickerState<K extends string> = {
  // The latest sheet picked in another layout. It stays loaded in main until the form closes,
  // so REUSE SHEET can slice it for another row. `grid` is the grid last confirmed for it.
  source: (SliceSource & { grid: SliceGrid | null }) | null
  // The one row that is slicing.
  slicing: SlicingState<K> | null
  setSlicingFps: (fps: string) => void
  closeSlicer: () => void
  // Opens the slicer on the loaded source for one row. Only one row slices at a time.
  openSlicer: (row: K) => void
  pick: (row: K) => Promise<void>
  // USE N FRAMES: main cuts the strip. Resolves to an error message, or null when it worked.
  confirmSlice: (
    row: K,
    fps: string,
    grid: SliceGrid,
    cells: number[],
    reverse: boolean
  ) => Promise<string | null>
  // A strip waiting in main that a row now holds.
  release: (token: string) => void
  // The form saved: main already let go of the saved strips.
  forgetPending: () => void
}

// Picking a spritesheet, slicing a grid into a strip, and the tokens of what waits in main.
// Closing the form drops the picks that were not saved and every loaded source sheet.
export function useSheetPicker<K extends string>(
  api: SheetApi,
  handlers: Handlers<K>
): SheetPickerState<K> {
  const [source, setSource] = useState<SheetPickerState<K>['source']>(null)
  const [slicing, setSlicing] = useState<SlicingState<K> | null>(null)
  const openings = useRef(0)
  // The blob: URL the source sheet is shown from.
  const sourceUrl = useRef<string | null>(null)
  // Tokens of picked strips not yet saved. Read through refs, so the latest value is known
  // after an await and on unmount.
  const pending = useRef(new Set<string>())
  const apiRef = useRef(api)
  const handlersRef = useRef(handlers)
  useEffect(() => {
    apiRef.current = api
    handlersRef.current = handlers
  })

  useEffect(
    () => () => {
      for (const token of pending.current) void apiRef.current.discard?.(token)
      pending.current.clear()
      void apiRef.current.dropSources()
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current)
      sourceUrl.current = null
    },
    []
  )

  function openSlicer(row: K): void {
    const { startingFps, startingReverse, onError } = handlersRef.current
    openings.current += 1
    setSlicing({
      row,
      fps: startingFps(row),
      reverse: startingReverse(row),
      opening: openings.current
    })
    onError(row, null)
  }

  function fill(row: K, strip: PickedStrip, fps: string, reverse: boolean): void {
    pending.current.add(strip.token)
    handlersRef.current.onStrip(row, strip, fps, reverse)
  }

  async function pick(row: K): Promise<void> {
    const onError = (message: string | null): void => handlersRef.current.onError(row, message)
    try {
      const result = await apiRef.current.pick()
      // A refused sheet leaves the row as it was, slicer and all.
      if (!result.ok) {
        onError(result.error.message)
        return
      }
      if (result.canceled) return
      if (result.kind === 'strip') {
        // A legal strip is used as it is.
        // The speed and direction are read now, after the dialog, so they are the latest.
        const { startingFps, startingReverse } = handlersRef.current
        fill(row, result, startingFps(row), startingReverse(row))
        setSlicing((current) => (current?.row === row ? null : current))
        return
      }
      // Only the latest sheet is kept, so the previous one's URL is let go.
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current)
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(result.bytes)], { type: 'image/png' })
      )
      sourceUrl.current = url
      setSource({
        token: result.sourceToken,
        fileName: result.fileName,
        width: result.width,
        height: result.height,
        url,
        grid: null
      })
      openSlicer(row)
    } catch (err) {
      console.error('Could not pick a sheet:', err)
      onError('The sheet could not be opened.')
    }
  }

  async function confirmSlice(
    row: K,
    fps: string,
    grid: SliceGrid,
    cells: number[],
    reverse: boolean
  ): Promise<string | null> {
    if (!source) return 'This sheet is no longer loaded. Upload it again.'
    try {
      const result = await apiRef.current.slice(source.token, grid.columns, grid.rows, cells)
      if (!result.ok) return result.error.message
      fill(
        row,
        { ...result, fileName: `${source.fileName} · sliced ${grid.columns} x ${grid.rows}` },
        fps,
        reverse
      )
      const token = source.token
      setSource((current) => (current?.token === token ? { ...current, grid } : current))
      setSlicing(null)
      return null
    } catch (err) {
      console.error('Could not slice the sheet:', err)
      return 'The sheet could not be cut into frames.'
    }
  }

  return {
    source,
    slicing,
    setSlicingFps: (fps) => setSlicing((current) => current && { ...current, fps }),
    closeSlicer: () => setSlicing(null),
    openSlicer,
    pick,
    confirmSlice,
    release: (token) => {
      pending.current.delete(token)
      void apiRef.current.discard?.(token)
    },
    forgetPending: () => pending.current.clear()
  }
}
