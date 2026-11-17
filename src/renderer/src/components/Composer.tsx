import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject
} from 'react'
import { buildMessage, countLines, formatSize, shouldChip } from '../../../shared/composerMessage'
import {
  IMAGE_ERRORS,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_COUNT,
  type ImageMediaType,
  checkImage,
  checkImageCount,
  checkImageTotal,
  formatBytes,
  formatBytesUp
} from '../../../shared/images'
import type { OutgoingImage } from '../hooks/useConversation'
import './Composer.css'

type ComposerProps = {
  // The visually hidden label of the text box.
  label: string
  placeholder: string
  // A run is going: STOP shows. SEND still works and queues the message.
  running: boolean
  // Owned by the screen, so it can move focus here from outside.
  inputRef: RefObject<HTMLTextAreaElement | null>
  // The model picker, then the agent chip while an agent is called.
  picker: ReactNode
  agent: ReactNode
  // The finished message: the typed text, then each pasted chunk as a fenced block. And
  // the pasted images, in paste order, with the blob: URL the history shows them from.
  // Either part may be empty, not both.
  onSend: (message: string, images: OutgoingImage[]) => void
  onStop: () => void
  // Text another part of CHAT puts in the box (a boss's weak point), not sent. A new tick
  // is a new request. It goes after the draft, so nothing typed is lost.
  insert?: { text: string; tick: number } | null
}

// A big paste or a pasted image, held beside the text. What is worked out from it (line
// count, size) is done once, when it arrives, not on every keystroke.
type TextChip = { kind: 'text'; id: number; text: string; lines: number; size: string }
type ImageChip = {
  kind: 'image'
  id: number
  bytes: Uint8Array<ArrayBuffer>
  // Made here from the bytes. Revoked when the chip is removed or the box goes away, but
  // not when the image is sent: the history shows it from the same URL.
  url: string
  width: number
  height: number
  size: string
}
type Attachment = TextChip | ImageChip

// Above this many lines the toolbar shows the count instead of the key hint.
const META_FROM_LINES = 4

// Ctrl+Shift+V and the paste it causes come this close together.
const PLAIN_PASTE_MS = 1000

const HELP = 'Enter sends. Shift plus Enter adds a line.'

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

// One pasted file after the checks that do not depend on what is already in the box.
type Candidate =
  | { ok: false; error: string }
  | {
      ok: true
      bytes: Uint8Array<ArrayBuffer>
      mediaType: ImageMediaType
      width: number
      height: number
    }

// True when the browser decodes the image, not only when its header reads.
async function canDraw(bytes: Uint8Array<ArrayBuffer>, type: ImageMediaType): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type }))
    bitmap.close()
    return true
  } catch {
    return false
  }
}

// What a screen reader says for a chip, in place of its drawn text.
function reading(chip: Attachment): string {
  return chip.kind === 'text'
    ? `Pasted text, ${plural(chip.lines, 'line')}, ${chip.size}`
    : `Pasted image, ${chip.width}x${chip.height}, ${chip.size}`
}

// The image files on the clipboard. Read before the first await: the clipboard is only
// there while the paste event is.
function imageFilesOf(data: DataTransfer): File[] {
  const fromItems = [...data.items]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .flatMap((item) => item.getAsFile() ?? [])
  if (fromItems.length > 0) return fromItems
  return [...data.files].filter((file) => file.type.startsWith('image/'))
}

// A small pixel document, drawn like the title bar's glyphs: crisp edges, currentColor.
function FileGlyph(): React.JSX.Element {
  return (
    <svg
      className="composer-chip__icon"
      width="12"
      height="14"
      viewBox="0 0 12 14"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M0 0H8V2H10V4H12V14H0ZM2 2H6V4H8V6H10V12H2ZM4 8H8V10H4Z"
      />
    </svg>
  )
}

// The chat input: one box with the text on top, and a toolbar under it that holds the
// model picker, the called agent, STOP and SEND. The box owns the typed text and what was
// pasted into it; the screen only gets the finished message.
function Composer({
  label,
  placeholder,
  running,
  inputRef,
  picker,
  agent,
  onSend,
  onStop,
  insert = null
}: ComposerProps): React.JSX.Element {
  const [text, setText] = useState('')
  // The last insert request taken in, so each one lands once.
  const [insertSeen, setInsertSeen] = useState(insert?.tick ?? 0)
  if (insert && insert.tick !== insertSeen) {
    setInsertSeen(insert.tick)
    setText((current) =>
      current.trim() === ''
        ? insert.text
        : `${current}${/\s$/.test(current) ? '' : ' '}${insert.text}`
    )
  }
  const insertTick = insert?.tick ?? 0
  // Focus moves to the box, with the caret after the inserted text.
  useEffect(() => {
    if (insertTick === 0) return
    const box = inputRef.current
    if (!box) return
    box.focus()
    box.setSelectionRange(box.value.length, box.value.length)
  }, [insertTick, inputRef])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  // Why the last pasted image was refused.
  const [error, setError] = useState<string | null>(null)
  // For the polite live region. A new id makes a repeated message read out again.
  const [announcement, setAnnouncement] = useState({ id: 0, text: '' })
  // The list as it is now, also between a change and the render that shows it: a paste
  // that is still reading a file must count the chips that were added meanwhile.
  const latest = useRef<Attachment[]>([])
  const nextId = useRef(0)
  const mounted = useRef(false)
  // When Ctrl+Shift+V (Cmd+Shift+V) went down. The paste event cannot tell it from Ctrl+V.
  const plainPasteAt = useRef<number | null>(null)
  const chipsRef = useRef<HTMLUListElement>(null)
  const id = useId()
  const helpId = `${id}-help`

  const canSend = text.trim() !== '' || attachments.length > 0
  const lines = useMemo(() => countLines(text), [text])

  // The blob: URLs of images that were never sent are given back when the box goes away.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // Read when the box goes away, on purpose: it is whatever is left then.
      for (const chip of latest.current) if (chip.kind === 'image') URL.revokeObjectURL(chip.url)
    }
  }, [])

  // The newest chip is at the end: bring it into view.
  useEffect(() => {
    const list = chipsRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [attachments.length])

  function setList(next: Attachment[]): void {
    latest.current = next
    setAttachments(next)
  }

  function announce(message: string): void {
    setAnnouncement((current) => ({ id: current.id + 1, text: message }))
  }

  function submit(): void {
    if (!canSend) return
    const list = latest.current
    onSend(
      buildMessage(
        text,
        list.flatMap((chip) => (chip.kind === 'text' ? [chip.text] : []))
      ),
      list.flatMap((chip) => (chip.kind === 'image' ? [{ bytes: chip.bytes, url: chip.url }] : []))
    )
    // The images went with the message: their URLs now belong to the history.
    setList([])
    setText('')
    setError(null)
    setAnnouncement({ id: 0, text: '' })
    inputRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // The key and the physical key, so another layout or a Mac Option chord still counts.
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      (event.code === 'KeyV' || event.key.toLowerCase() === 'v')
    ) {
      plainPasteAt.current = event.nativeEvent.timeStamp
    }
    // keyCode 229 is a key an input method editor is still working on.
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault()
      submit()
    }
  }

  // A big text paste becomes a chip, and so does an image that is the whole clipboard.
  // Ctrl+Shift+V pastes as plain text: it goes into the box as it is, at any size, and
  // never attaches an image. A paste with nothing this box handles is left alone.
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const typedAt = plainPasteAt.current
    plainPasteAt.current = null
    if (typedAt !== null && event.nativeEvent.timeStamp - typedAt < PLAIN_PASTE_MS) return

    const data = event.clipboardData
    const pasted = data.getData('text/plain')
    // Text wins over an image: a copy from a spreadsheet carries a picture of the cells.
    if (pasted !== '') {
      setError(null)
      if (!shouldChip(pasted)) return
      event.preventDefault()
      const chip: TextChip = {
        kind: 'text',
        id: nextId.current++,
        text: pasted,
        lines: countLines(pasted),
        size: formatSize(pasted)
      }
      setList([...latest.current, chip])
      announce(`Pasted text added, ${plural(chip.lines, 'line')}`)
      return
    }

    const files = imageFilesOf(data)
    if (files.length === 0) return
    event.preventDefault()
    void addImages(files)
  }

  // Reads the files and checks them, in paste order: size, type, side, that the browser can
  // draw it, then how many, then how big they are together. The first failure of the paste
  // is the error. An image that fails is not added; the ones that pass are, up to the limits.
  // Files are not read once the count is full: anything after can only be refused for that.
  async function addImages(files: File[]): Promise<void> {
    const held = latest.current.filter((chip): chip is ImageChip => chip.kind === 'image')
    let plannedCount = held.length
    let plannedBytes = held.reduce((sum, chip) => sum + chip.bytes.length, 0)

    const checked: Candidate[] = []
    for (const file of files) {
      if (plannedCount >= IMAGE_MAX_COUNT) {
        checked.push({ ok: false, error: IMAGE_ERRORS.tooMany })
        break
      }
      // Too big is known without reading it, and reads as checkImage would say it.
      if (file.size > IMAGE_MAX_BYTES) {
        checked.push({ ok: false, error: IMAGE_ERRORS.tooBig(formatBytesUp(file.size)) })
        continue
      }
      let bytes: Uint8Array<ArrayBuffer>
      try {
        bytes = new Uint8Array(await file.arrayBuffer())
      } catch {
        checked.push({ ok: false, error: IMAGE_ERRORS.wrongType })
        continue
      }
      const header = checkImage(bytes)
      if (!header.ok) {
        checked.push({ ok: false, error: header.error })
        continue
      }
      // A header that reads is not enough: a damaged picture would reach Claude, which
      // replays the images of a chat, and could make every later message fail.
      if (!(await canDraw(bytes, header.mediaType))) {
        checked.push({ ok: false, error: IMAGE_ERRORS.wrongType })
        continue
      }
      const over = checkImageTotal(plannedBytes + bytes.length)
      if (over) {
        checked.push({ ok: false, error: over })
        continue
      }
      plannedCount++
      plannedBytes += bytes.length
      checked.push({ ...header, bytes })
    }
    // The box went away while the files were being read.
    if (!mounted.current) return

    // From here on nothing waits, so two pastes that overlap count each other's chips: this
    // is the check that counts, against the list as it is now.
    const added: ImageChip[] = []
    let refused: string | null = null
    const now = latest.current.filter((chip): chip is ImageChip => chip.kind === 'image')
    let count = now.length
    let bytesNow = now.reduce((sum, chip) => sum + chip.bytes.length, 0)
    for (const item of checked) {
      if (!item.ok) {
        refused ??= item.error
        continue
      }
      const crowded = checkImageCount(count + 1) ?? checkImageTotal(bytesNow + item.bytes.length)
      if (crowded) {
        refused ??= crowded
        continue
      }
      count++
      bytesNow += item.bytes.length
      added.push({
        kind: 'image',
        id: nextId.current++,
        bytes: item.bytes,
        url: URL.createObjectURL(new Blob([item.bytes], { type: item.mediaType })),
        width: item.width,
        height: item.height,
        size: formatBytes(item.bytes.length)
      })
    }
    setError(refused)
    if (added.length === 0) return
    setList([...latest.current, ...added])
    announce(
      added.length === 1
        ? `Pasted image added, ${added[0].width}x${added[0].height}`
        : `${added.length} pasted images added`
    )
  }

  function removeChip(chip: Attachment): void {
    if (chip.kind === 'image') URL.revokeObjectURL(chip.url)
    setList(latest.current.filter((other) => other.id !== chip.id))
    setError(null)
    announce(chip.kind === 'image' ? 'Pasted image removed' : 'Pasted text removed')
    inputRef.current?.focus()
  }

  // A click on the empty part of the box (its padding, the gaps in the toolbar, the room
  // between the chips and the buttons) goes to the text, as in any chat box.
  function handleMouseDown(event: MouseEvent<HTMLFormElement>): void {
    const target = event.target
    if (event.button !== 0 || !(target instanceof Element)) return
    if (target.closest('button, textarea, a, input, [role="dialog"]')) return
    // The chips row's own scrollbar is part of the row: let it scroll.
    if (target === chipsRef.current && event.nativeEvent.offsetX >= target.clientWidth) return
    event.preventDefault()
    inputRef.current?.focus()
  }

  return (
    <form
      className="composer"
      onMouseDown={handleMouseDown}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {attachments.length > 0 && (
        <ul ref={chipsRef} className="composer-attachments" aria-label="Pasted attachments">
          {attachments.map((chip) => (
            <li key={chip.id} className="composer-chip">
              {chip.kind === 'text' ? (
                <FileGlyph />
              ) : (
                <img className="composer-chip__thumb" src={chip.url} alt="" />
              )}
              <span className="composer-chip__label" aria-hidden="true">
                {chip.kind === 'text' ? 'PASTED' : 'IMAGE'}
              </span>
              <span className="composer-chip__detail" aria-hidden="true">
                {chip.kind === 'text'
                  ? `${plural(chip.lines, 'line')} · ${chip.size}`
                  : `${chip.width}x${chip.height} · ${chip.size}`}
              </span>
              <span id={`${id}-chip-${chip.id}`} className="visually-hidden">
                {reading(chip)}
              </span>
              <button
                type="button"
                className="composer-chip__remove"
                aria-label={chip.kind === 'text' ? 'Remove pasted text' : 'Remove pasted image'}
                aria-describedby={`${id}-chip-${chip.id}`}
                onClick={() => removeChip(chip)}
              >
                <span aria-hidden="true">X</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="composer-error">
          {error}
        </p>
      )}

      <label htmlFor="conversation-input" className="visually-hidden">
        {label}
      </label>
      <span id={helpId} className="visually-hidden">
        {HELP}
      </span>
      <textarea
        ref={inputRef}
        id="conversation-input"
        className="composer-input"
        rows={1}
        placeholder={placeholder}
        aria-describedby={helpId}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          plainPasteAt.current = null
        }}
        onPaste={handlePaste}
      />

      <div className="composer-toolbar">
        {picker}
        {agent}
        {/* The room left over. The line count or the key hint shows in it only when it fits
            whole, so it never squeezes the chips and is never cut in half. */}
        <span className="composer-spacer">
          {lines >= META_FROM_LINES ? (
            <span className="composer-meta" data-digits={String(lines).length}>
              {lines} LINES
            </span>
          ) : (
            <span className="composer-hint" aria-hidden="true">
              ⏎ send · ⇧⏎ newline
            </span>
          )}
        </span>
        {running && (
          <button type="button" className="composer-action composer-action--stop" onClick={onStop}>
            STOP
          </button>
        )}
        <button type="submit" className="composer-action composer-action--send" disabled={!canSend}>
          SEND
        </button>
      </div>

      <span role="status" aria-live="polite" className="visually-hidden">
        <span key={announcement.id}>{announcement.text}</span>
      </span>
    </form>
  )
}

export default Composer
