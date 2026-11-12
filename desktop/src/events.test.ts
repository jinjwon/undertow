import test from 'node:test'
import assert from 'node:assert'
import { parseEvents, saveEvent, removeEvent, eventsOn, upcoming, dateKey } from './events.ts'

const ev = (id: string, date: string, time = '', title = id) => ({ id, title, date, time, kind: 'dev' as const, note: '' })

test('parseEvents drops broken rows and repairs bad fields', () => {
  const out = parseEvents([ev('a', '2026-11-12', '09:30'), { id: 'b', title: ' ', date: '2026-11-12' }, { id: 'c', title: 'x', date: 'nope' }, { id: 'd', title: 'y', date: '2026-11-13', time: '25:00', kind: 'party' }, null])
  assert.deepStrictEqual(out.map(e => e.id), ['a', 'd'])
  assert.strictEqual(out[1].time, '')
  assert.strictEqual(out[1].kind, 'dev')
  assert.deepStrictEqual(parseEvents('garbage'), [])
})

test('saveEvent adds, replaces by id and keeps date order; removeEvent deletes', () => {
  let list = saveEvent([], ev('a', '2026-11-14'))
  list = saveEvent(list, ev('b', '2026-11-12', '10:00'))
  list = saveEvent(list, { ...ev('a', '2026-11-11'), title: 'moved' })
  assert.deepStrictEqual(list.map(e => [e.id, e.title]), [['a', 'moved'], ['b', 'b']])
  assert.deepStrictEqual(removeEvent(list, 'a').map(e => e.id), ['b'])
})

test('eventsOn sorts a day by time, all-day first', () => {
  const list = [ev('late', '2026-11-12', '18:00'), ev('all', '2026-11-12'), ev('early', '2026-11-12', '08:00'), ev('other', '2026-11-13')]
  assert.deepStrictEqual(eventsOn(list, '2026-11-12').map(e => e.id), ['all', 'early', 'late'])
})

test('upcoming skips what is past today and caps the count', () => {
  const now = new Date(2026, 10, 12, 12, 0).getTime()
  assert.strictEqual(dateKey(now), '2026-11-12')
  const list = [ev('past', '2026-11-11'), ev('morning', '2026-11-12', '09:00'), ev('allday', '2026-11-12'), ev('noon', '2026-11-12', '12:00'), ev('next', '2026-11-13'), ev('later', '2026-12-01')]
  assert.deepStrictEqual(upcoming(list, now).map(e => e.id), ['allday', 'noon', 'next', 'later'])
  assert.deepStrictEqual(upcoming(list, now, 2).map(e => e.id), ['allday', 'noon'])
})
