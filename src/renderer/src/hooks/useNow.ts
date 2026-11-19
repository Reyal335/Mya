import { useEffect, useState } from 'react'

// The time, read again every minute and when the window comes back to the front, so "2:41p" and
// "Wed" in HISTORY stay right in an app that is left open.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = (): void => setNow(Date.now())
    const timer = window.setInterval(tick, intervalMs)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs])
  return now
}
