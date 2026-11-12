// The agent panel's arrangement: its tools in one or two groups, side by side or stacked. Plain data, so every rule is tested without a window.
export type ToolId = 'claude' | 'chat' | 'codex' | 'shell' | 'ssh'
export const TOOL_IDS: ToolId[] = ['claude', 'chat', 'codex', 'shell', 'ssh']
export type Dir = 'row' | 'col'
// ratio: group 0's share of the panel. hidden: tools you turned off; their sessions are untouched.
export type Docks = { groups: ToolId[][]; dir: Dir; ratio: number; hidden: ToolId[] }
export const DOCKS: Docks = { groups: [TOOL_IDS], dir: 'row', ratio: 0.5, hidden: [] }
// shortcut: two groups cover side-by-side agents; a tree when someone needs three.
const MAX_GROUPS = 2

const isTool = (t: unknown): t is ToolId => TOOL_IDS.includes(t as ToolId)

// Every tool exactly once, in at most two non-empty groups; anything else in storage is repaired, never trusted.
export const parseDocks = (raw: unknown): Docks => {
  const v = raw as any
  const seen = new Set<ToolId>()
  const groups = (Array.isArray(v?.groups) ? v.groups : [])
    .map((g: unknown) => (Array.isArray(g) ? g : []).filter(t => isTool(t) && !seen.has(t) && (seen.add(t), true)) as ToolId[])
    .filter((g: ToolId[]) => g.length)
    .slice(0, MAX_GROUPS)
  // Tools dropped by the cut above, or never placed, join the first group.
  const placed = new Set(groups.flat())
  const missing = TOOL_IDS.filter(t => !placed.has(t))
  if (!groups.length) groups.push([])
  groups[0] = [...groups[0], ...missing]
  const ratio = Number.isFinite(v?.ratio) ? Math.min(0.8, Math.max(0.2, v.ratio)) : 0.5
  return { groups, dir: v?.dir === 'col' ? 'col' : 'row', ratio, hidden: TOOL_IDS.filter(t => Array.isArray(v?.hidden) && v.hidden.includes(t)) }
}

export const groupOf = (d: Docks, tool: ToolId) => Math.max(0, d.groups.findIndex(g => g.includes(tool)))

// group may be one past the last group, which opens a new one; an emptied group closes.
export const moveTool = (d: Docks, tool: ToolId, group: number, index: number): Docks => {
  if (group > d.groups.length || group >= MAX_GROUPS) return d
  const groups = d.groups.map(g => g.filter(t => t !== tool))
  if (group === groups.length) groups.push([])
  const to = groups[group]
  to.splice(Math.min(Math.max(0, index), to.length), 0, tool)
  return parseDocks({ ...d, groups })
}

// A chip dropped in a group's head lands in front of `before` (the chip under the marker), or last when it is null.
export const moveBefore = (d: Docks, tool: ToolId, group: number, before: ToolId | null): Docks => {
  if (before === tool) return d
  const rest = (d.groups[group] ?? []).filter(t => t !== tool)
  return moveTool(d, tool, group, before ? rest.indexOf(before) : rest.length)
}

export const splitDocks =(d: Docks, tool: ToolId, dir: Dir): Docks => {
  // Splitting off the only tool of group 0 while group 1 exists would just swap them; keep it in place instead.
  const rest = d.groups.map(g => g.filter(t => t !== tool)).filter(g => g.length)
  return parseDocks({ ...d, dir, groups: [rest[0] ?? [], [...(rest[1] ?? []), tool]] })
}

// What each group shows: the tool picked there if it can still be seen, else its first visible tool, or null when nothing is.
export const pickActive = (d: Docks, active: (ToolId | null)[], visible: ToolId[]): (ToolId | null)[] =>
  d.groups.map((g, i) => {
    const can = g.filter(t => visible.includes(t) && !d.hidden.includes(t))
    const want = active[i]
    return want && can.includes(want) ? want : can[0] ?? null
  })

// Showing a tool: it becomes the pick of the group it is in under `d` (pass the docks after a move, not before) and that group takes focus.
export const showIn = (d: Docks, picked: (ToolId | null)[], tool: ToolId): { picked: (ToolId | null)[]; focus: number } => {
  const focus = groupOf(d, tool)
  return { picked: Object.assign([...picked], { [focus]: tool }), focus }
}

const fr = (n: number) => `${Number(n.toFixed(3))}fr`
// The panel's CSS grid: a head row and a body per shown group, and a divider between two.
export const dockGrid = (d: Docks, shown: number[]): { columns: string; rows: string; areas: string } => {
  if (shown.length < 2) {
    const g = shown[0] ?? 0
    return { columns: '1fr', rows: 'auto 1fr', areas: `"h${g}" "b${g}"` }
  }
  return d.dir === 'row'
    ? { columns: `${fr(d.ratio)} 6px ${fr(1 - d.ratio)}`, rows: 'auto 1fr', areas: '"h0 split h1" "b0 split b1"' }
    : { columns: '1fr', rows: `auto ${fr(d.ratio)} 6px auto ${fr(1 - d.ratio)}`, areas: '"h0" "b0" "split" "h1" "b1"' }
}

// The same grid with one full-width row on top, for the usage strip above the dock heads.
export const withTop = (g: { columns: string; rows: string; areas: string }, area: string) => {
  const cols = (/"([^"]*)"/.exec(g.areas)?.[1] ?? area).trim().split(/\s+/).length
  return { ...g, rows: `auto ${g.rows}`, areas: `"${Array(cols).fill(area).join(' ')}" ${g.areas}` }
}

// Where a tool dropped on a group's body goes: the right or bottom 30% splits that way, the rest drops into the group.
export const dropSide = (x: number, y: number, w: number, h: number): Dir | null => {
  const right = (w - x) / w
  const bottom = (h - y) / h
  if (right >= 0.3 && bottom >= 0.3) return null
  return right <= bottom ? 'row' : 'col'
}
