// What the interface shows, worked out from real session data. No drawing here.
import type { CommandInfo, SessionRateLimit } from 'claude-code'

const MOONS = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent']
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// Filled cells out of width, kept in range; the drawing picks the glyphs.
export const gauge = (percent: number, width: number) => Math.min(width, Math.round((Math.max(0, percent) / 100) * width))

type Seen = { context: { percent?: number | null }; rateLimits: SessionRateLimit[]; cost?: { usd: number } | null }
export const usageOf = (seen: Seen) => ({
  context: seen.context.percent ?? null,
  limits: seen.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed, resetsAt: l.resetsAt })),
  usd: seen.cost?.usd ?? null,
})

export const untilReset = (iso: string | undefined, now: number) => {
  const ms = iso ? Date.parse(iso) - now : NaN
  if (!(ms > 0)) return ''
  const minutes = Math.ceil(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h${minutes % 60}m`
  return `${Math.floor(minutes / 1440)}d${Math.floor((minutes % 1440) / 60)}h`
}

// The most used come first; Evoke's own commands are not skills worth listing.
export const skillsOf = (commands: CommandInfo[], used: Record<string, number>) =>
  commands
    .filter(c => (c.source === 'plugin' || c.source === 'user') && !c.plugin?.startsWith('evoke'))
    .map(c => ({ name: c.name, description: c.description, plugin: c.name.includes(':') ? c.name.split(':')[0] : 'personal' }))
    .sort((a, b) => (used[b.name] ?? 0) - (used[a.name] ?? 0) || a.name.localeCompare(b.name))

// Windows paths can use either separator and macOS can decompose Korean, so paths are compared and cut in one form.
const slashed = (path: string) => path.replace(/\\/g, '/').normalize('NFC')
export const samePath = (a: string, b: string) => slashed(a) === slashed(b)
export const baseName = (path: string) => slashed(path).split('/').filter(Boolean).pop() ?? path

// What opens a project in a new window, or null when it cannot be opened safely.
export const openerOf = (path: string, isWindows: boolean, terminal?: string) => {
  // wt reads `;` as the start of another command, even inside one argument.
  if (isWindows) return path.includes(';') ? null : ['wt', '-d', path]
  return terminal === 'ghostty' ? ['open', '-na', 'Ghostty.app', '--args', `--working-directory=${path}`] : ['open', '-a', 'Terminal', path]
}

// The file holds every project Claude Code has seen; only trusted, real folders are offered, never scratch space.
export const projectsOf = (json: string, home: string) => {
  try {
    const known = (JSON.parse(json) as { projects?: Record<string, { hasTrustDialogAccepted?: boolean }> }).projects ?? {}
    return Object.entries(known)
      .filter(([path, v]) => v.hasTrustDialogAccepted && /^(\/|[A-Za-z]:[\\/])/.test(path) && !samePath(path, home) && !/\/(Library|AppData)\//.test(slashed(path)))
      .map(([path]) => ({ name: baseName(path), path }))
      // macOS can list one Korean folder twice, composed and decomposed.
      .filter((p, i, all) => all.findIndex(o => samePath(o.path, p.path)) === i)
  } catch {
    return []
  }
}

// When each project last got a prompt, from Claude Code's prompt history. Only paths and times are kept.
export const lastUsedOf = (history: string) => {
  const last = new Map<string, number>()
  for (const line of history.split('\n')) {
    try {
      const { project, timestamp } = JSON.parse(line) as { project?: unknown; timestamp?: unknown }
      if (typeof project === 'string' && typeof timestamp === 'number') last.set(slashed(project), Math.max(timestamp, last.get(slashed(project)) ?? 0))
    } catch {
      // A line cut off mid-write says nothing about the others.
    }
  }
  return last
}

// Key 1 goes to the project most likely wanted: most recent first, and the one already open last.
export const rankProjects = <P extends { path: string }>(list: P[], last: Map<string, number>, cwd: string) =>
  [...list].sort((a, b) => Number(samePath(a.path, cwd)) - Number(samePath(b.path, cwd)) || (last.get(slashed(b.path)) ?? 0) - (last.get(slashed(a.path)) ?? 0))

export const menuOf = (tool: string) => {
  if (tool === 'Skill') return 'SKILL'
  if (['Read', 'Write', 'Edit', 'NotebookEdit'].includes(tool)) return 'ITEM'
  if (tool.startsWith('mcp__')) return 'EQUIP'
  if (tool === 'Agent' || tool === 'Workflow') return 'AGENT'
  if (tool.startsWith('Task') || tool === 'TodoWrite') return 'QUEST'
  if (['WebFetch', 'WebSearch', 'AskUserQuestion', 'SendMessage'].includes(tool)) return 'LINK'
  return 'SYSTEM'
}

export const rank = (n: number) => (n === 0 ? '' : n >= 50 ? 'MAX' : `RANK ${1 + Math.floor(n / 5)}`)

// shortcut: mean synodic month, can be off by up to about a day; fine for a label.
export const moon = (ms: number) => {
  const age = (ms - Date.UTC(2000, 0, 6, 18, 14)) / 86400000
  const phase = ((age % 29.530588) + 29.530588) % 29.530588
  return MOONS[Math.round((phase / 29.530588) * 8) % 8] as string
}

export const dayOf = (ms: number) => {
  const d = new Date(ms)
  return { date: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${DAYS[d.getDay()]}`, moon: moon(ms) }
}

// Tool input is model-written text and these rows are drawn beside the transcript: no control characters reach the terminal.
const printable = (text: string) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')

// What a tool call worked on, short enough for a row: a file's name, else its command or query.
export const entryOf = (tool: string, input: Record<string, unknown>) => {
  const file = input.file_path ?? input.notebook_path
  if (typeof file === 'string') return printable(baseName(file))
  const said = [input.skill, input.command, input.query, input.url, input.description, input.prompt].find(v => typeof v === 'string' && v)
  return said ? printable(`${tool} ${String(said).split('\n')[0]}`) : tool
}

// The pane's rows from its size. The engine does not report a cell's pixels, so the cell's width over its height is Iosevka 14's measured 7 x 17.5 pt unless EVOKE_CELL names another font's.
export const CELL = 0.4
export const cellOf = (said: string | undefined) => {
  const cell = Number(said)
  return cell >= 0.3 && cell <= 0.7 ? cell : CELL // Outside what a terminal font can be, the art would only break.
}
export const layoutOf = (columns: number, rows: number, art: { width: number; height: number }, grid: { rows: number; content: number; footer: number }, cell = CELL) => {
  const perRow = art.width / art.height / cell
  const height = Math.min(rows, Math.floor(columns / perRow))
  if (height < 28) return null // Too small for the name column to keep one row each: the pane falls back to plain rows.
  const scale = height / grid.rows
  const content = Math.round(grid.content * scale)
  const footer = height - (grid.rows - grid.footer)
  return { height, columns: Math.round(height * perRow), content, footer, scale }
}

export const fitName = (name: string, width: number) => (name.length > width ? `${name.slice(0, Math.max(1, width - 1))}…` : name)

type Skill = { name: string; description: string; plugin: string }
export type SkillRow = { kind: 'group'; name: string; count: number } | { kind: 'skill'; skill: Skill }

// Skills under their plugin, groups ordered by their most used skill.
export const skillRows = (list: Skill[]): SkillRow[] =>
  [...new Set(list.map(s => s.plugin))].flatMap(group => {
    const own = list.filter(s => s.plugin === group)
    return [{ kind: 'group' as const, name: group, count: own.length }, ...own.map(skill => ({ kind: 'skill' as const, skill }))]
  })

// Cuts rows into pages of at most `room` lines: a skill takes two, and a group's name never ends a page alone.
export const pageOf = (rows: SkillRow[], room: number, page: number) => {
  let current: SkillRow[] = []
  const pages = [current]
  let used = 0
  rows.forEach((row, i) => {
    const cost = row.kind === 'group' ? 1 : 2
    const needs = row.kind === 'group' && rows[i + 1] ? cost + 2 : cost
    if (used + needs > room && used > 0) {
      current = []
      pages.push(current)
      used = 0
    }
    current.push(row)
    used += cost
  })
  const at = ((page % pages.length) + pages.length) % pages.length
  return { rows: pages[at] as SkillRow[], page: at, pages: pages.length }
}

// Repeats folded into one row with a count, newest first.
export const tallied = (entries: string[]) => {
  const seen = new Map<string, number>()
  for (const e of entries) seen.set(e, (seen.get(e) ?? 0) + 1)
  return [...seen].map(([name, count]) => ({ name, count }))
}

// MCP calls by server: `mcp__server__tool ...`.
export const slotsOf = (entries: string[]) => {
  const slots = new Map<string, { server: string; tool: string; count: number }>()
  for (const e of entries) {
    const [, server, tool] = (e.split(' ')[0] ?? '').match(/^mcp__(.+?)__(.+)$/) ?? []
    if (!server || !tool) continue
    const was = slots.get(server)
    slots.set(server, { server, tool: was?.tool ?? tool, count: (was?.count ?? 0) + 1 })
  }
  return [...slots.values()]
}

// `Tool the rest` into its two parts; an entry may be the tool's name alone.
export const callOf = (entry: string) => {
  const at = entry.indexOf(' ')
  return at < 0 ? { tool: entry, said: '' } : { tool: entry.slice(0, at), said: entry.slice(at + 1) }
}

// A month as weeks of day numbers, Sunday first, 0 outside the month. In local time, as the date above it.
export const monthOf = (ms: number) => {
  const d = new Date(ms)
  const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const cells = [...Array<number>(first).fill(0), ...Array.from({ length: last }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(0)
  return { year: d.getFullYear(), month: d.getMonth(), today: d.getDate(), weeks: Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7)) }
}
