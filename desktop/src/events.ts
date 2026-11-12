// CALENDAR events: your own schedule, kept in the settings store. Plain data, so every rule is tested without a window.
export type Kind = 'meeting' | 'dev' | 'personal'
export const KINDS: Kind[] = ['meeting', 'dev', 'personal']
// date is local 'YYYY-MM-DD'; time is 'HH:MM' or '' for all day.
export type Event = { id: string; title: string; date: string; time: string; kind: Kind; note: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const pad = (n: number) => String(n).padStart(2, '0')
export const dateKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Anything in storage is repaired, never trusted: a row without a title or a real date is dropped.
export const parseEvents = (raw: unknown): Event[] =>
  (Array.isArray(raw) ? raw : []).flatMap((v: any) => {
    const title = typeof v?.title === 'string' ? v.title.trim() : ''
    if (!title || !DATE.test(v?.date) || typeof v?.id !== 'string') return []
    return [{ id: v.id, title, date: v.date, time: TIME.test(v?.time) ? v.time : '', kind: KINDS.includes(v?.kind) ? v.kind : 'dev', note: typeof v?.note === 'string' ? v.note : '' }]
  })

const order = (a: Event, b: Event) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title)

// Adds the event, or replaces the one with the same id; the list stays in date order.
export const saveEvent = (list: Event[], e: Event): Event[] => parseEvents([...list.filter(x => x.id !== e.id), e]).sort(order)
export const removeEvent = (list: Event[], id: string): Event[] => list.filter(x => x.id !== id)

export const eventsOn = (list: Event[], date: string) => list.filter(e => e.date === date).sort(order)

// Today's events still ahead (all-day ones count all day), then the following days, up to n.
export const upcoming = (list: Event[], now: number, n = 5) => {
  const today = dateKey(now)
  const clock = `${pad(new Date(now).getHours())}:${pad(new Date(now).getMinutes())}`
  return [...list].sort(order).filter(e => e.date > today || (e.date === today && (!e.time || e.time >= clock))).slice(0, n)
}
