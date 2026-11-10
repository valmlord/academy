const DAY_MS = 24 * 60 * 60 * 1000

function utcStamp(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

// A local date in any zone lies inside [date - 1 day, date + 2 days) in UTC (offsets are within ±14 h), so the
// page asks for that range and keeps the slots whose start falls on `date` in the invitee's zone.
export function queryRangeFor(date: string): { from: string; to: string } {
  const midnight = Date.parse(`${date}T00:00:00Z`)
  return { from: utcStamp(midnight - DAY_MS), to: utcStamp(midnight + 2 * DAY_MS) }
}

export function localDate(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant))
}

export function localHhmm(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant))
}

export function isValidDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))
}

export function isValidTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name })
    return true
  } catch {
    return false
  }
}
