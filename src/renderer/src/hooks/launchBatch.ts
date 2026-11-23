import type { LaunchEvent } from '../../../shared/ipc'

// What a batch of launch events asks of the window. Several starts can queue up before the window
// takes them: only the last folder request and the last notice count, the rest are stale.
export type LaunchBatch = { notice: string | null; openId: string | null }

export function launchBatch(events: readonly LaunchEvent[]): LaunchBatch {
  let notice: string | null = null
  let openId: string | null = null
  for (const event of events) {
    if (event.kind === 'notice') notice = event.text
    else openId = event.id
  }
  return { notice, openId }
}
