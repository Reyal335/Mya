import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  BUSY_MESSAGE,
  PROVIDER_NAMES,
  type ChatSearchResults,
  type ChatSummary,
  type SearchSnippet
} from '../../../shared/chats'
import ProviderGlyph from './ProviderGlyph'
import './ChatSearch.css'

type ChatSearchProps = {
  chats: ChatSummary[]
  openId: string | null
  running: boolean
  search: (query: string) => Promise<ChatSearchResults | null>
  // `anchor` is the start of the message that matched, to scroll the chat to.
  onOpen: (id: string, anchor?: string) => void
  onClose: () => void
}

const DELAY_MS = 150

// The title with the ranges that matched marked with the --waiting fill.
function Marked({ text, ranges }: { text: string; ranges: [number, number][] }): React.JSX.Element {
  const parts: React.ReactNode[] = []
  let at = 0
  ranges.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(<mark key={i}>{text.slice(start, end)}</mark>)
    at = end
  })
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}

function Snippet({ snippet }: { snippet: SearchSnippet }): React.JSX.Element {
  return (
    <>
      {snippet.before}
      <mark>{snippet.match}</mark>
      {snippet.after}
    </>
  )
}

// Search over the chats, from designs/21c-chat-history.html: a field, then the titles that match
// (TITLES · n), then the text of messages Mya has kept (IN MESSAGES · n) with a one-line snippet.
// Escape closes it. Arrow keys move between the field and the results.
function ChatSearch({
  chats,
  openId,
  running,
  search,
  onOpen,
  onClose
}: ChatSearchProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ChatSearchResults | null>(null)
  const [failed, setFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const latest = useRef(0)

  useEffect(() => {
    input.current?.focus()
  }, [])

  // Results for what is typed, a moment after the last key. A slower answer to an older query
  // never replaces a newer one.
  useEffect(() => {
    const request = ++latest.current
    if (query.trim() === '') return
    const timer = setTimeout(() => {
      void search(query).then((found) => {
        if (request !== latest.current) return
        setFailed(found === null)
        setResults(found)
      })
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [query, search])

  const byId = new Map(chats.map((chat) => [chat.id, chat]))
  // An empty field shows nothing, whatever the last answer was.
  const shown = query.trim() === '' ? null : results
  const titles = shown?.titles.filter((hit) => byId.has(hit.chatId)) ?? []
  const messages = shown?.messages.filter((hit) => byId.has(hit.chatId)) ?? []
  const total = titles.length + messages.length

  function rows(): HTMLElement[] {
    return [...(panel.current?.querySelectorAll<HTMLElement>('.chat-search__row') ?? [])]
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const all = rows()
    if (all.length === 0) return
    const at = all.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      all[at < 0 ? 0 : Math.min(all.length - 1, at + 1)]?.focus()
    } else if (at <= 0) {
      event.preventDefault()
      input.current?.focus()
    } else {
      event.preventDefault()
      all[at - 1]?.focus()
    }
  }

  function open(id: string, anchor?: string): void {
    const blocked = running && id !== openId
    if (!blocked) onOpen(id, anchor)
  }

  const rowProps = (
    id: string
  ): React.HTMLAttributes<HTMLElement> & { 'aria-disabled'?: 'true' } => {
    const blocked = running && id !== openId
    return {
      'aria-disabled': blocked ? 'true' : undefined,
      title: blocked ? BUSY_MESSAGE : undefined
    }
  }

  return (
    <div ref={panel} className="chat-search" onKeyDown={onKeyDown}>
      <label className="chat-search__field">
        <span className="visually-hidden">Search chats</span>
        <input
          ref={input}
          type="search"
          className="chat-search__input"
          value={query}
          placeholder="Search chats"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value)
            if (event.target.value.trim() === '') {
              setResults(null)
              setFailed(false)
            }
          }}
        />
        <span className="chat-search__esc" aria-hidden="true">
          ESC
        </span>
      </label>

      <div className="chat-search__status" role="status">
        {shown && failed
          ? 'The search did not work.'
          : shown && total === 0
            ? 'No chats match.'
            : shown
              ? `${total} ${total === 1 ? 'result' : 'results'}`
              : ''}
      </div>

      {titles.length > 0 && (
        <>
          <h2 className="chat-search__heading">TITLES · {titles.length}</h2>
          <ul className="chat-search__list">
            {titles.map((hit) => {
              const chat = byId.get(hit.chatId)
              if (!chat) return null
              return (
                <li key={hit.chatId}>
                  <button
                    type="button"
                    className="chat-search__row"
                    aria-label={`${chat.title}, ${PROVIDER_NAMES[chat.provider]} chat`}
                    {...rowProps(hit.chatId)}
                    onClick={() => open(hit.chatId)}
                  >
                    <ProviderGlyph provider={chat.provider} />
                    <span className="chat-search__title">
                      <Marked text={chat.title} ranges={hit.ranges} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {messages.length > 0 && (
        <>
          <h2 className="chat-search__heading">IN MESSAGES · {messages.length}</h2>
          <ul className="chat-search__list">
            {messages.map((hit) => {
              const chat = byId.get(hit.chatId)
              if (!chat) return null
              return (
                <Fragment key={hit.chatId}>
                  <li>
                    <button
                      type="button"
                      className="chat-search__row chat-search__row--stacked"
                      aria-label={`${chat.title}, ${PROVIDER_NAMES[chat.provider]} chat`}
                      {...rowProps(hit.chatId)}
                      onClick={() => open(hit.chatId, hit.anchor)}
                    >
                      <span className="chat-search__title">{chat.title}</span>
                      <span className="chat-search__snippet" aria-hidden="true">
                        <Snippet snippet={hit.snippet} />
                      </span>
                    </button>
                  </li>
                </Fragment>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

export default ChatSearch
