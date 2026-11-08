import test from 'node:test'
import assert from 'node:assert'
import { clampRect, fitFloat, gapsOf, mainDefaults, moveRect, overlaps, parseLayout, placeRect, resetMain, resizeRect, swapMain, toFrac, toPx, type Ctx } from './layout.ts'

const ws = { w: 1440, h: 800 }
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ id: 'center', ws, lines: [], solid: [], snap: false, ...over })
const box = { x: 400, y: 100, w: 400, h: 300 }

test('the defaults tile the workspace without overlapping', () => {
  const d = mainDefaults(ws)
  assert.ok(!overlaps(d.pane, d.center) && !overlaps(d.center, d.right))
  assert.strictEqual(d.right.x + d.right.w, ws.w)
  assert.strictEqual(d.center.x, 360)
})

test('fractions survive the round trip and scale with the window', () => {
  const f = toFrac(box, ws)
  assert.deepStrictEqual(toPx(f, ws), box)
  assert.strictEqual(toPx(f, { w: 720, h: 400 }).w, 200)
})

test('moving stays inside the workspace', () => {
  assert.deepStrictEqual(moveRect(box, -9999, -9999, ctx())!.rect, { ...box, x: 0, y: 0 })
  assert.deepStrictEqual(moveRect(box, 9999, 9999, ctx())!.rect, { ...box, x: ws.w - 400, y: ws.h - 300 })
})

test('moving snaps to a neighbour and reports the guide', () => {
  const other = { x: 900, y: 500, w: 100, h: 100 }
  const m = moveRect(box, 97, 0, ctx({ lines: [other], snap: true }))! // right edge 897, 3px from 900
  assert.strictEqual(m.rect.x + m.rect.w, 900)
  assert.deepStrictEqual(m.guides.v, [900])
})

test('moving snaps to the grid when no panel is near', () => {
  assert.strictEqual(moveRect({ ...box, x: 402 }, 0, 0, ctx({ snap: true }))!.rect.x, 400)
})

test('moving onto a panel lands beside it, never over it', () => {
  const solid = [{ x: 700, y: 0, w: 300, h: 800 }]
  const r = moveRect(box, 200, 0, ctx({ solid }))!.rect
  assert.ok(!overlaps(r, solid[0]))
  assert.strictEqual(r.x + r.w, 700)
})

test('moving is refused when nothing is free', () => {
  assert.strictEqual(moveRect(box, 10, 0, ctx({ solid: [{ x: 0, y: 0, w: 1440, h: 800 }] })), null)
})

test('each edge resizes alone and keeps the opposite edge', () => {
  assert.deepStrictEqual(resizeRect(box, 'e', 50, 20, ctx(), false)!.rect, { ...box, w: 450 })
  assert.deepStrictEqual(resizeRect(box, 's', 50, 20, ctx(), false)!.rect, { ...box, h: 320 })
  assert.deepStrictEqual(resizeRect(box, 'w', -50, 0, ctx(), false)!.rect, { ...box, x: 350, w: 450 })
  assert.deepStrictEqual(resizeRect(box, 'nw', 10, 10, ctx(), false)!.rect, { x: 410, y: 110, w: 390, h: 290 })
})

test('resizing respects the minimum and maximum', () => {
  assert.strictEqual(resizeRect(box, 'e', -9999, 0, ctx(), false)!.rect.w, 280)
  assert.strictEqual(resizeRect({ x: 0, y: 0, w: 300, h: 500 }, 'e', 9999, 0, ctx({ id: 'pane' }), false)!.rect.w, 640)
})

test('resizing stops at a neighbour', () => {
  assert.strictEqual(resizeRect(box, 'e', 500, 0, ctx({ solid: [{ x: 900, y: 0, w: 100, h: 800 }] }), false)!.rect.w, 500)
})

test('keeping the ratio follows the dragged axis', () => {
  const r = resizeRect(box, 'e', 80, 0, ctx(), true)!.rect
  assert.strictEqual(r.w, 480)
  assert.strictEqual(r.h, 360)
})

test('typed numbers are limited and refused on overlap', () => {
  assert.strictEqual(placeRect({ ...box, w: 10 }, ctx())!.w, 280)
  assert.strictEqual(placeRect(box, ctx({ solid: [{ x: 0, y: 0, w: 1440, h: 800 }] })), null)
})

test('resetting a panel also resets whatever it would land on', () => {
  const d = mainDefaults(ws)
  const moved = { pane: { x: 900, y: 0, w: 360, h: 800 }, center: { x: 0, y: 0, w: 300, h: 800 }, right: { x: 300, y: 0, w: 500, h: 800 } }
  const out = resetMain(moved, 'center', d)
  assert.deepStrictEqual(out.center, d.center)
  assert.ok(!overlaps(out.pane, out.center) && !overlaps(out.center, out.right) && !overlaps(out.pane, out.right))
})

test('swapping trades rects, unless a limit would break', () => {
  const d = mainDefaults(ws)
  assert.deepStrictEqual(swapMain(d, 'pane', 'right')!.pane, d.right)
  assert.strictEqual(swapMain({ ...d, center: { ...d.center, w: 200 } }, 'right', 'center'), null)
})

test('floating widgets stay drawable in a small window', () => {
  assert.strictEqual(toPx(fitFloat({ x: 0.9, y: 0.9, w: 0.05, h: 0.02 }, 'clock', ws), ws).w, 190)
  const small = toPx(fitFloat({ x: 0.9, y: 0.9, w: 0.05, h: 0.02 }, 'clock', ws), ws)
  assert.ok(small.x + small.w <= ws.w)
})

test('gaps measure to the nearest neighbour or edge', () => {
  const g = gapsOf(box, [{ x: 900, y: 0, w: 100, h: 800 }], ws)
  assert.deepStrictEqual(g, { l: 400, r: 100, t: 100, b: 400 })
})

test('parseLayout keeps valid rects and drops the rest', () => {
  const good = { x: 0, y: 0, w: 0.5, h: 1 }
  assert.deepStrictEqual(parseLayout({ main: { pane: good, center: good, right: good }, floats: { clock: good } }), { main: { pane: good, center: good, right: good }, floats: { clock: good } })
  assert.deepStrictEqual(parseLayout({ main: { pane: good }, floats: { clock: { x: 'a' }, nope: good } }), { main: null, floats: {} })
  assert.deepStrictEqual(parseLayout(null), { main: null, floats: {} })
  assert.deepStrictEqual(parseLayout({ floats: { info: { x: 0.9, y: 0, w: 0.5, h: 0.5 } } }), { main: null, floats: {} })
})

test('clampRect keeps a too-small workspace from going negative', () => {
  const r = clampRect(box, 'right', { w: 100, h: 100 })
  assert.ok(r.x >= 0 && r.y >= 0 && r.w <= 100 && r.h <= 100)
})
