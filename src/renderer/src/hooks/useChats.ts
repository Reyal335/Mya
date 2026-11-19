import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProviderId } from '../../../shared/models'
import type {
  ChatList,
  ChatSearchResults,
  ChatSummary,
  ChatsError,
  ChatsResult
} from '../../../shared/chats'

export type ChatsStore = {
  chats: ChatSummary[]
  openId: string | null
  loaded: boolean
  // The message of the last action that was refused or failed, read out as a status. Cleared by
  // the next action that works.
  error: string | null
  clearError: () => void
  // Each returns true when it worked. A chat that became the open one is reported to `onSwitched`
  // first, so the conversation on screen is replaced before anything else happens.
  open: (id: string) => Promise<boolean>
  create: (provider: ProviderId) => Promise<{ ok: boolean; created: boolean }>
  rename: (id: string, title: string) => Promise<boolean>
  pin: (id: string, pinned: boolean) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  fork: (id: string) => Promise<boolean>
  exportChat: (id: string) => Promise<boolean>
  search: (query: string) => Promise<ChatSearchResults | null>
}

const EMPTY: ChatSearchResults = { titles: [], messages: [] }
const NO_CHATS: ChatSummary[] = []

// The list as main last said it, and the project it belongs to.
type Snapshot = { path: string; chats: ChatSummary[]; openId: string | null }

// The open project's chats. Main keeps them: this holds the list as main last said it, asks for
// changes, and reads the list again whenever main says it changed (a title made from a first
// message, a count, a delete). `onSwitched` is told when an action I made changed which chat is
// open, never for a change main made by itself (the first message of a project with no chats makes
// one, and the conversation on screen is already that chat's).
export function useChats(
  projectPath: string | null,
  onSwitched: (openId: string | null) => void
): ChatsStore {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)
  const switched = useRef(onSwitched)
  const openIdRef = useRef<string | null>(null)
  const pathRef = useRef(projectPath)

  useEffect(() => {
    switched.current = onSwitched
    pathRef.current = projectPath
  })

  // What a change of project leaves behind is never shown: the list is of the open project only.
  const current = snapshot && snapshot.path === projectPath ? snapshot : null

  const take = useCallback((path: string, next: ChatList): void => {
    setSnapshot({ path, chats: next.chats, openId: next.openId })
    openIdRef.current = next.openId
  }, [])

  const refresh = useCallback((): void => {
    if (!projectPath) return
    const request = ++latest.current
    window.mya.chats
      .list()
      .then((result) => {
        if (request !== latest.current) return
        if (result.ok) take(projectPath, result)
        else console.error('Could not read the chats:', result.error.message)
      })
      .catch((err: unknown) => console.error('Could not read the chats:', err))
  }, [projectPath, take])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => window.mya.chats.onChanged(refresh), [refresh])

  // Runs a call that hands back the list. Reports a failure, keeps the list, and says whether the
  // open chat changed.
  const act = useCallback(
    async <T extends object>(
      call: () => Promise<ChatsResult<ChatList & T>>
    ): Promise<{ ok: true; result: ChatList & T } | { ok: false }> => {
      const path = pathRef.current
      let result: ChatsResult<ChatList & T>
      try {
        result = await call()
      } catch (err) {
        console.error('A chat action failed:', err)
        setError('Something went wrong. Try again.')
        return { ok: false }
      }
      if (!result.ok) {
        setError((result.error as ChatsError).message)
        return { ok: false }
      }
      setError(null)
      const before = openIdRef.current
      // A newer refresh must not overwrite this answer.
      latest.current++
      if (path) take(path, result)
      if (result.openId !== before) switched.current(result.openId)
      return { ok: true, result }
    },
    [take]
  )

  const open = useCallback(
    async (id: string): Promise<boolean> => (await act(() => window.mya.chats.open(id))).ok,
    [act]
  )

  const create = useCallback(
    async (provider: ProviderId): Promise<{ ok: boolean; created: boolean }> => {
      const done = await act(() => window.mya.chats.create(provider))
      return done.ok ? { ok: true, created: done.result.created } : { ok: false, created: false }
    },
    [act]
  )

  const rename = useCallback(
    async (id: string, title: string): Promise<boolean> =>
      (await act(() => window.mya.chats.rename(id, title))).ok,
    [act]
  )

  const pin = useCallback(
    async (id: string, pinned: boolean): Promise<boolean> =>
      (await act(() => window.mya.chats.pin(id, pinned))).ok,
    [act]
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => (await act(() => window.mya.chats.remove(id))).ok,
    [act]
  )

  const fork = useCallback(
    async (id: string): Promise<boolean> => (await act(() => window.mya.chats.fork(id))).ok,
    [act]
  )

  const exportChat = useCallback(async (id: string): Promise<boolean> => {
    try {
      const result = await window.mya.chats.export(id)
      if (!result.ok) {
        setError(result.error.message)
        return false
      }
      return true
    } catch (err) {
      console.error('Could not export the chat:', err)
      setError('The chat could not be exported.')
      return false
    }
  }, [])

  const search = useCallback(async (query: string): Promise<ChatSearchResults | null> => {
    if (query.trim() === '') return EMPTY
    try {
      const result = await window.mya.chats.search(query)
      return result.ok ? result.results : null
    } catch (err) {
      console.error('Could not search the chats:', err)
      return null
    }
  }, [])

  return {
    chats: current ? current.chats : NO_CHATS,
    openId: current ? current.openId : null,
    // With no project there is nothing to wait for.
    loaded: projectPath === null || current !== null,
    error,
    clearError: () => setError(null),
    open,
    create,
    rename,
    pin,
    remove,
    fork,
    exportChat,
    search
  }
}
