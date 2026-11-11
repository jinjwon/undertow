import test from 'node:test'
import assert from 'node:assert'
import { DOCKS, dockGrid, dropSide, groupOf, moveBefore, moveTool, parseDocks, pickActive, showIn, splitDocks } from './docks.ts'

test('parseDocks repairs whatever storage holds', () => {
  assert.deepStrictEqual(parseDocks(null), DOCKS)
  assert.deepStrictEqual(parseDocks({ groups: [['shell', 'shell', 'nope'], [], ['claude']], dir: 'diag', ratio: 0.95, hidden: ['codex', 'x'] }),
    { groups: [['shell', 'chat', 'codex', 'ssh'], ['claude']], dir: 'row', ratio: 0.8, hidden: ['codex'] })
})

test('moveTool reorders inside a group, opens a second one, and closes an emptied one', () => {
  const two = moveTool(DOCKS, 'shell', 1, 0)
  assert.deepStrictEqual(two.groups, [['claude', 'chat', 'codex', 'ssh'], ['shell']])
  assert.deepStrictEqual(moveTool(two, 'ssh', 0, 0).groups[0], ['ssh', 'claude', 'chat', 'codex'])
  assert.deepStrictEqual(moveTool(two, 'shell', 0, 9).groups, [['claude', 'chat', 'codex', 'ssh', 'shell']])
  assert.deepStrictEqual(moveTool(two, 'claude', 2, 0), two) // no third group
})

test('splitDocks puts the tool in group 2 with the direction asked', () => {
  const d = splitDocks(DOCKS, 'codex', 'col')
  assert.deepStrictEqual([d.groups, d.dir], [[['claude', 'chat', 'shell', 'ssh'], ['codex']], 'col'])
  assert.strictEqual(groupOf(d, 'codex'), 1)
})

test('pickActive keeps a visible choice and falls back to the first visible tool, or null', () => {
  const d = splitDocks(DOCKS, 'shell', 'row')
  assert.deepStrictEqual(pickActive(d, ['chat', null], ['claude', 'chat', 'shell']), ['chat', 'shell'])
  assert.deepStrictEqual(pickActive(d, ['codex', 'shell'], ['claude', 'shell']), ['claude', 'shell'])
  assert.deepStrictEqual(pickActive({ ...d, hidden: ['shell'] }, [null, 'shell'], ['claude', 'shell']), ['claude', null])
})

test('dockGrid lays out one group, two side by side, or two stacked', () => {
  const d = { ...splitDocks(DOCKS, 'shell', 'row'), ratio: 0.6 }
  assert.deepStrictEqual(dockGrid(d, [0]), { columns: '1fr', rows: 'auto 1fr', areas: '"h0" "b0"' })
  assert.deepStrictEqual(dockGrid(d, [1]), { columns: '1fr', rows: 'auto 1fr', areas: '"h1" "b1"' })
  assert.deepStrictEqual(dockGrid(d, [0, 1]), { columns: '0.6fr 6px 0.4fr', rows: 'auto 1fr', areas: '"h0 split h1" "b0 split b1"' })
  assert.deepStrictEqual(dockGrid({ ...d, dir: 'col' }, [0, 1]), { columns: '1fr', rows: 'auto 0.6fr 6px auto 0.4fr', areas: '"h0" "b0" "split" "h1" "b1"' })
})

test('dropSide splits on the right or bottom 30%, else drops into the group', () => {
  assert.strictEqual(dropSide(380, 100, 400, 600), 'row')
  assert.strictEqual(dropSide(100, 580, 400, 600), 'col')
  assert.strictEqual(dropSide(395, 590, 400, 600), 'row') // corner: the nearer edge, by share of its side
  assert.strictEqual(dropSide(200, 300, 400, 600), null)
})

test('moveBefore drops a tool in front of another, at the end for null, and ignores a drop on itself', () => {
  const d = splitDocks(DOCKS, 'shell', 'row')
  assert.deepStrictEqual(moveBefore(d, 'ssh', 0, 'chat').groups[0], ['claude', 'ssh', 'chat', 'codex'])
  assert.deepStrictEqual(moveBefore(d, 'claude', 0, null).groups[0], ['chat', 'codex', 'ssh', 'claude'])
  assert.deepStrictEqual(moveBefore(d, 'codex', 1, 'shell').groups[1], ['codex', 'shell'])
  assert.deepStrictEqual(moveBefore(d, 'chat', 0, 'chat'), d)
})

test('showIn shows a moved tool in the group it moved to and focuses that group', () => {
  const two = splitDocks(DOCKS, 'codex', 'row')
  const next = moveTool(two, 'shell', 1, Infinity)
  assert.deepStrictEqual(showIn(next, ['claude', 'codex'], 'shell'), { picked: ['claude', 'shell'], focus: 1 })
  assert.deepStrictEqual(showIn(next, ['claude', 'codex'], 'chat'), { picked: ['chat', 'codex'], focus: 0 })
})
