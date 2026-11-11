// The window's editable layout as plain geometry, so every rule can be tested without a window.
import { DOCKS, parseDocks, type Docks } from './docks.ts'
// Saved rects are fractions of the workspace (the area between the top bar and the HUD), which is what keeps a layout across window sizes.
export type Rect = { x: number; y: number; w: number; h: number }
export type Size = { w: number; h: number }
export type MainId = 'pane' | 'center' | 'right'
export type FloatId = 'calendar' | 'info' | 'clock'
export type Id = MainId | FloatId
export type Layout = { main: Record<MainId, Rect> | null; floats: Partial<Record<FloatId, Rect>>; docks: Docks }
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export type Guides = { v: number[]; h: number[] }
export type Ctx = { id: Id; ws: Size; lines: Rect[]; solid: Rect[]; snap: boolean }

export const MAIN_IDS: MainId[] = ['pane', 'center', 'right']
export const FLOAT_IDS: FloatId[] = ['calendar', 'info', 'clock']
export const EMPTY: Layout = { main: null, floats: {}, docks: DOCKS }
export const GRID = 16
const NEAR = 6
const EPS = 0.5

// The pane's menu art takes about 355px of height at its default width, so it needs room for content under it.
export const LIMITS: Record<Id, { min: Size; max: Size }> = {
  pane: { min: { w: 260, h: 420 }, max: { w: 640, h: 4000 } },
  center: { min: { w: 280, h: 200 }, max: { w: 4000, h: 4000 } },
  right: { min: { w: 320, h: 200 }, max: { w: 4000, h: 4000 } },
  calendar: { min: { w: 260, h: 240 }, max: { w: 640, h: 800 } },
  info: { min: { w: 280, h: 56 }, max: { w: 720, h: 160 } },
  clock: { min: { w: 190, h: 44 }, max: { w: 520, h: 140 } },
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi))
export const toPx = (r: Rect, ws: Size): Rect => ({ x: r.x * ws.w, y: r.y * ws.h, w: r.w * ws.w, h: r.h * ws.h })
export const toFrac = (r: Rect, ws: Size): Rect => ({ x: r.x / ws.w, y: r.y / ws.h, w: r.w / ws.w, h: r.h / ws.h })
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS
const inside = (r: Rect, ws: Size) => r.x >= -EPS && r.y >= -EPS && r.x + r.w <= ws.w + EPS && r.y + r.h <= ws.h + EPS

// The same split the CSS grid draws when nothing has been moved.
export type Cols = { pane?: number; right?: number } // widths dragged at the dividers, in pixels
export const mainDefaults = (ws: Size, cols: Cols = {}): Record<MainId, Rect> => {
  const pane = cols.pane ?? 360
  const right = cols.right ?? Math.max(420, ws.w * 0.36)
  return {
    pane: { x: 0, y: 0, w: pane, h: ws.h },
    center: { x: pane, y: 0, w: Math.max(0, ws.w - pane - right), h: ws.h },
    right: { x: ws.w - right, y: 0, w: right, h: ws.h },
  }
}
// Dragged widths, kept inside each panel's limits; the editor always keeps its minimum, so a smaller window squeezes the sides.
export const fitCols = (cols: Cols, w: number): Required<Cols> => {
  const d = mainDefaults({ w, h: 0 }, cols)
  const right = clamp(d.right.w, LIMITS.right.min.w, w - LIMITS.pane.min.w - LIMITS.center.min.w)
  const pane = clamp(d.pane.w, LIMITS.pane.min.w, Math.min(LIMITS.pane.max.w, w - right - LIMITS.center.min.w))
  return { pane, right }
}

export const clampRect = (r: Rect, id: Id, ws: Size): Rect => {
  const { min, max } = LIMITS[id]
  const w = clamp(r.w, Math.min(min.w, ws.w), Math.min(max.w, ws.w))
  const h = clamp(r.h, Math.min(min.h, ws.h), Math.min(max.h, ws.h))
  return { x: clamp(r.x, 0, ws.w - w), y: clamp(r.y, 0, ws.h - h), w, h }
}

// The nearest free spot beside whatever r landed on, or null when nothing fits.
const free = (r: Rect, solid: Rect[], ws: Size): Rect | null => {
  if (!solid.some(s => overlaps(r, s))) return r
  const dist = (c: Rect) => Math.abs(c.x - r.x) + Math.abs(c.y - r.y)
  return solid
    .flatMap(s => [{ ...r, x: s.x - r.w }, { ...r, x: s.x + s.w }, { ...r, y: s.y - r.h }, { ...r, y: s.y + s.h }])
    .filter(c => inside(c, ws) && !solid.some(s => overlaps(c, s)))
    .sort((a, b) => dist(a) - dist(b))[0] ?? null
}

// How far to move so one of `mine` meets a line: other panels' edges and centres first, then the grid.
const pull = (mine: number[], lines: number[]): { by: number; at: number | null } => {
  let best: { by: number; at: number | null } = { by: 0, at: null }
  let gap = NEAR + 1
  for (const m of mine) for (const l of lines) if (Math.abs(l - m) < gap) { gap = Math.abs(l - m); best = { by: l - m, at: l } }
  if (best.at !== null) return best
  const on = Math.round(mine[0] / GRID) * GRID
  return Math.abs(on - mine[0]) <= NEAR ? { by: on - mine[0], at: null } : best
}
const linesX = (c: Ctx) => [0, c.ws.w, ...c.lines.flatMap(r => [r.x, r.x + r.w / 2, r.x + r.w])]
const linesY = (c: Ctx) => [0, c.ws.h, ...c.lines.flatMap(r => [r.y, r.y + r.h / 2, r.y + r.h])]

export const moveRect = (start: Rect, dx: number, dy: number, c: Ctx): { rect: Rect; guides: Guides } | null => {
  let r = clampRect({ ...start, x: start.x + dx, y: start.y + dy }, c.id, c.ws)
  const guides: Guides = { v: [], h: [] }
  if (c.snap) {
    const x = pull([r.x, r.x + r.w / 2, r.x + r.w], linesX(c))
    const y = pull([r.y, r.y + r.h / 2, r.y + r.h], linesY(c))
    r = clampRect({ ...r, x: r.x + x.by, y: r.y + y.by }, c.id, c.ws)
    if (x.at !== null) guides.v.push(x.at)
    if (y.at !== null) guides.h.push(y.at)
  }
  const placed = free(r, c.solid, c.ws)
  return placed && { rect: placed, guides }
}

// Places a rect exactly as asked (typed numbers, arrow keys), still inside the limits and off the other panels.
export const placeRect = (r: Rect, c: Ctx): Rect | null => free(clampRect(r, c.id, c.ws), c.solid, c.ws)

export const resizeRect = (start: Rect, handle: Handle, dx: number, dy: number, c: Ctx, keepRatio: boolean): { rect: Rect; guides: Guides } | null => {
  const { min, max } = LIMITS[c.id]
  const guides: Guides = { v: [], h: [] }
  const has = (e: string) => handle.includes(e)
  let l = start.x, t = start.y, r = start.x + start.w, b = start.y + start.h
  if (has('e')) r += dx
  if (has('w')) l += dx
  if (has('s')) b += dy
  if (has('n')) t += dy
  if (c.snap && !keepRatio) {
    if (has('e') || has('w')) { const p = pull([has('e') ? r : l], linesX(c)); if (has('e')) r += p.by; else l += p.by; if (p.at !== null) guides.v.push(p.at) }
    if (has('s') || has('n')) { const p = pull([has('s') ? b : t], linesY(c)); if (has('s')) b += p.by; else t += p.by; if (p.at !== null) guides.h.push(p.at) }
  }
  const wMax = Math.min(max.w, c.ws.w), hMax = Math.min(max.h, c.ws.h)
  if (has('e')) r = clamp(r, l + min.w, Math.min(l + wMax, c.ws.w)); if (has('w')) l = clamp(l, Math.max(r - wMax, 0), r - min.w)
  if (has('s')) b = clamp(b, t + min.h, Math.min(t + hMax, c.ws.h)); if (has('n')) t = clamp(t, Math.max(b - hMax, 0), b - min.h)
  for (const s of c.solid) {
    if (!overlaps({ x: l, y: t, w: r - l, h: b - t }, s)) continue
    if (has('e') && start.x + start.w <= s.x + EPS) r = Math.min(r, s.x)
    if (has('w') && start.x >= s.x + s.w - EPS) l = Math.max(l, s.x + s.w)
    if (has('s') && start.y + start.h <= s.y + EPS) b = Math.min(b, s.y)
    if (has('n') && start.y >= s.y + s.h - EPS) t = Math.max(t, s.y + s.h)
  }
  if (keepRatio) {
    const ratio = start.w / start.h
    if (has('e') || has('w')) { const h = (r - l) / ratio; if (has('n')) t = b - h; else b = t + h }
    else { const w = (b - t) * ratio; r = l + w }
  }
  const rect = { x: l, y: t, w: r - l, h: b - t }
  const ok = rect.w >= min.w - EPS && rect.h >= min.h - EPS && rect.w <= wMax + EPS && rect.h <= hMax + EPS && inside(rect, c.ws) && !c.solid.some(s => overlaps(rect, s))
  return ok ? { rect, guides } : null
}

// Puts one panel back; any panel it would land on goes back too, and the defaults never overlap.
export const resetMain = (main: Record<MainId, Rect>, id: MainId, defaults: Record<MainId, Rect>) => {
  const out = { ...main, [id]: defaults[id] }
  const back = new Set<MainId>([id])
  for (let again = true; again;) {
    again = false
    for (const o of MAIN_IDS) if (!back.has(o) && [...back].some(b => overlaps(out[b], out[o]))) { out[o] = defaults[o]; back.add(o); again = true }
  }
  return out
}

// Trading places, for when the panels fill the window and there is no room to drag into. Refused if either would break its limits.
export const swapMain = (main: Record<MainId, Rect>, a: MainId, b: MainId) => {
  const fits = (id: MainId, r: Rect) => r.w >= LIMITS[id].min.w - EPS && r.h >= LIMITS[id].min.h - EPS && r.w <= LIMITS[id].max.w + EPS
  return fits(a, main[b]) && fits(b, main[a]) ? { ...main, [a]: main[b], [b]: main[a] } : null
}

// A saved layout with panels folded away: each panel left on screen grows over a folded neighbour it shares a whole edge with.
// Works in fractions or pixels; a panel grows only where nothing else on screen is in the way.
export const fillHidden = (main: Record<MainId, Rect>, hidden: MainId[]): Record<MainId, Rect> => {
  const out = { ...main }
  const seen = MAIN_IDS.filter(id => !hidden.includes(id))
  const eps = 1e-3 * Math.max(...MAIN_IDS.map(id => main[id].x + main[id].w), 1)
  const near = (a: number, b: number) => Math.abs(a - b) <= eps
  for (const h of hidden.map(id => main[id])) for (const id of seen) {
    const v = out[id]
    const within = (lo: number, len: number, hLo: number, hLen: number) => lo >= hLo - eps && lo + len <= hLo + hLen + eps
    let grown: Rect | null = null
    if (within(v.y, v.h, h.y, h.h)) {
      if (near(v.x + v.w, h.x)) grown = { ...v, w: v.w + h.w }
      else if (near(v.x, h.x + h.w)) grown = { ...v, x: h.x, w: v.w + h.w }
    } else if (within(v.x, v.w, h.x, h.w)) {
      if (near(v.y + v.h, h.y)) grown = { ...v, h: v.h + h.h }
      else if (near(v.y, h.y + h.h)) grown = { ...v, y: h.y, h: v.h + h.h }
    }
    if (grown && !seen.some(o => o !== id && grown!.x < out[o].x + out[o].w - eps && out[o].x < grown!.x + grown!.w - eps && grown!.y < out[o].y + out[o].h - eps && out[o].y < grown!.y + grown!.h - eps)) out[id] = grown
  }
  return out
}

// A small window must not squeeze a floating widget below what it can draw.
export const fitFloat = (r: Rect, id: FloatId, ws: Size): Rect => toFrac(clampRect(toPx(r, ws), id, ws), ws)

// Distance from r to the nearest panel or workspace edge on each side.
export const gapsOf = (r: Rect, others: Rect[], ws: Size) => {
  const across = (o: Rect) => o.y < r.y + r.h && r.y < o.y + o.h
  const along = (o: Rect) => o.x < r.x + r.w && r.x < o.x + o.w
  return {
    l: Math.min(r.x, ...others.filter(o => across(o) && o.x + o.w <= r.x + EPS).map(o => r.x - o.x - o.w)),
    r: Math.min(ws.w - r.x - r.w, ...others.filter(o => across(o) && o.x >= r.x + r.w - EPS).map(o => o.x - r.x - r.w)),
    t: Math.min(r.y, ...others.filter(o => along(o) && o.y + o.h <= r.y + EPS).map(o => r.y - o.y - o.h)),
    b: Math.min(ws.h - r.y - r.h, ...others.filter(o => along(o) && o.y >= r.y + r.h - EPS).map(o => o.y - r.y - r.h)),
  }
}

const rectOf = (v: any): Rect | null => {
  const ok = v && [v.x, v.y, v.w, v.h].every(n => Number.isFinite(n)) && v.x >= 0 && v.y >= 0 && v.w > 0 && v.h > 0 && v.x + v.w <= 1.001 && v.y + v.h <= 1.001
  return ok ? { x: v.x, y: v.y, w: v.w, h: v.h } : null
}
// Whatever is in storage may be old or hand-edited: anything that is not a valid layout falls back to the default.
export const parseLayout = (raw: unknown): Layout => {
  const v = raw as any
  const rects = MAIN_IDS.map(id => rectOf(v?.main?.[id]))
  const main = rects.every(Boolean) ? (Object.fromEntries(MAIN_IDS.map((id, i) => [id, rects[i]])) as Record<MainId, Rect>) : null
  const floats: Layout['floats'] = {}
  for (const id of FLOAT_IDS) { const r = rectOf(v?.floats?.[id]); if (r) floats[id] = r }
  return { main, floats, docks: parseDocks(v?.docks) }
}

// Layouts that ship with the app. VIBE gives the agents half the window, Claude above Codex and the shell; REVIEW gives it to the editor.
export const PRESETS: Record<'default' | 'vibe' | 'review', Layout> = {
  default: EMPTY,
  vibe: {
    main: { pane: { x: 0, y: 0, w: 0.19, h: 1 }, center: { x: 0.19, y: 0, w: 0.31, h: 1 }, right: { x: 0.5, y: 0, w: 0.5, h: 1 } },
    floats: {},
    docks: { groups: [['claude', 'chat', 'ssh'], ['codex', 'shell']], dir: 'col', ratio: 0.6, hidden: [] },
  },
  review: {
    main: { pane: { x: 0, y: 0, w: 0.2, h: 1 }, center: { x: 0.2, y: 0, w: 0.55, h: 1 }, right: { x: 0.75, y: 0, w: 0.25, h: 1 } },
    floats: {},
    docks: DOCKS,
  },
}
