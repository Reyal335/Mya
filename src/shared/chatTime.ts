// The times in HISTORY and in the RESUMED line. Local time, English names, no locale data,
// so the same input reads the same on every machine.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Whole calendar days from `then` to `now` in local time. DST never shifts it.
function daysBetween(then: Date, now: Date): number {
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate())
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((b - a) / 86_400_000)
}

function parts(hours: number): { hour: number; pm: boolean } {
  return { hour: hours % 12 === 0 ? 12 : hours % 12, pm: hours >= 12 }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// "2:41p" today, a weekday name within the last 7 days ("Wed"), else "Nov 12".
export function timeLabel(at: number, now: number): string {
  const then = new Date(at)
  const today = new Date(now)
  const days = daysBetween(then, today)
  if (days <= 0) {
    const { hour, pm } = parts(then.getHours())
    return `${hour}:${pad(then.getMinutes())}${pm ? 'p' : 'a'}`
  }
  if (days < 7) return WEEKDAYS[then.getDay()]
  return `${MONTHS[then.getMonth()]} ${then.getDate()}`
}

// "9:30 PM".
export function clockLabel(at: number): string {
  const then = new Date(at)
  const { hour, pm } = parts(then.getHours())
  return `${hour}:${pad(then.getMinutes())} ${pm ? 'PM' : 'AM'}`
}

// "Wed 9:30 PM" for a chat from the last week (today included), else "Nov 12 9:30 PM".
export function dayClockLabel(at: number, now: number): string {
  const then = new Date(at)
  const days = daysBetween(then, new Date(now))
  const day =
    days >= 0 && days < 7 ? WEEKDAYS[then.getDay()] : `${MONTHS[then.getMonth()]} ${then.getDate()}`
  return `${day} ${clockLabel(at)}`
}

// The RESUMED line's text: "Wed 9:30 PM · 44 messages".
export function resumedLabel(at: number, now: number, messages: number): string {
  return `${dayClockLabel(at, now)} · ${messages} ${messages === 1 ? 'message' : 'messages'}`
}
