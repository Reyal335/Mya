import { useEffect, useRef } from 'react'
import { launchBatch } from './launchBatch'

export type LaunchHandlers = {
  onNotice: (text: string) => void
  onOpenFolder: (id: string) => void
}

// What the `mya` command left for this window. Main pokes (onLaunch) and the window pulls
// (takeLaunches), and also pulls once on mount, so a start that came before the window was ready
// is not lost. Only a pull empties the queue, so nothing is taken twice. The handlers are read
// through a ref: the effect has no "alive" gate on purpose, because under StrictMode the first
// mount's pull must still be answered.
export function useLaunches(handlers: LaunchHandlers): void {
  const ref = useRef(handlers)

  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    const take = (): void => {
      window.mya.ui
        .takeLaunches()
        .then((events) => {
          const batch = launchBatch(events)
          if (batch.notice !== null) ref.current.onNotice(batch.notice)
          if (batch.openId !== null) ref.current.onOpenFolder(batch.openId)
        })
        .catch((err: unknown) => console.error('Could not read the command line:', err))
    }
    const off = window.mya.ui.onLaunch(take)
    take()
    return off
  }, [])
}
