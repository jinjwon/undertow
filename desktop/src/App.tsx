// The window: projects on top, files on the left, the editor in the middle, Claude Code on the right, the HUD below.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { EmptyArt } from './EmptyArt'
import { THEMES, THEME_NAMES, defineThemes, type ThemeName } from './themes'
import { Pane, UsageStrip } from './Pane'
import { Chat } from './ChatPanel'
import { LANGS as UI_LANGS, STRINGS, langFrom, tr, type Lang } from './i18n'
import { agentsOf, parseAgents, targetOf, type Agent, type Agents } from './agents'
import { iconOf, isImage, matchItems, previewKind, promptVars, stepDate, weekOf } from './text'
import { MENUS } from '../../plugins/evoke/hooks/tokens.js'
import { EMPTY, FLOAT_IDS, fillHidden, fitCols, fitFloat, parseLayout, type Cols, type FloatId, type Layout, type MainId, type Rect } from './layout'
import { LayoutEdit } from './LayoutEdit'
import { DockHead, toolOf } from './Dock'
import { TOOL_IDS, withTop, dockGrid, dropSide, groupOf, moveBefore, moveTool, parseDocks, pickActive, showIn, splitDocks, type Docks, type ToolId } from './docks'
import { prefs } from './prefs'
import { KINDS, dateKey, eventsOn, parseEvents, removeEvent, saveEvent, upcoming, type Event } from './events'
import { baseName, lastUsedOf, projectsOf, rank, rankProjects, samePath } from '../../plugins/evoke/hooks/data'

declare global {
  interface Window { evoke: any }
}
const api = window.evoke

type Project = { name: string; path: string }
type Entry = { name: string; path: string; dir: boolean }
// web: a preview page's address on the preview server (a PDF, a video, or the live view of an HTML or Markdown file, whose tab is named live:<path>);
// head: a diff tab against the last commit; image: a picture shown instead of text; preview: replaced by the next single click, as in VS Code
// proposal: an edit Claude Code offers through the IDE link, shown as a diff of this file until it is accepted or rejected
// skill: a read-only look at a skill from GitHub before it is installed (DISCOVER in the SKILL menu)
type Tab = { path: string; text: string; saved: string; head?: string; image?: string; web?: string; preview?: boolean; proposal?: string; skill?: { repo: string; folder: string; files: number; installed: boolean; note?: string } }
type Repo = { repo: string; description: string; stars: number }
type Found = { folder: string; name: string; installed: boolean }
type Change = { path: string; code: string }
// group and run: a ⌘K hit that is not a file (a menu, a tool, a project, an event) carries its own action.
type Hit = { path: string; rel: string; line?: number; col?: number; preview?: string; group?: string; run?: () => void }
// opts: the search sheet's toggles and file filters; replace: the text Replace all puts in.
type SearchOpts = { caseSensitive?: boolean; word?: boolean; regex?: boolean; include?: string; exclude?: string }
type Finder = { mode: 'files' | 'search' | 'all'; query: string; hits: Hit[]; at: number; opts?: SearchOpts; replace?: string }
type Usage = { context: number | null; limits: { kind: string; percent: number; resetsAt?: string }[]; usd: number | null }

const LIMITS: Record<string, string> = { five_hour: '5H', seven_day: '7D', spend_limit: 'SPEND' } // same labels as the pane's HUD
const LANGS: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', cjs: 'javascript', mjs: 'javascript', json: 'json', md: 'markdown', css: 'css', html: 'html', py: 'python', sh: 'shell', yml: 'yaml', yaml: 'yaml', glsl: 'cpp', rs: 'rust', go: 'go', swift: 'swift' }
const langOf = (path: string) => LANGS[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'
const MOD = api.platform === 'darwin' ? '⌘' : 'Ctrl+'
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const stored = (): ThemeName => {
  try { const t = prefs.getItem('theme') as ThemeName; return THEMES[t] ? t : 'tide' } catch { return 'tide' }
}
const storedAgents = (): Agents => {
  try { return parseAgents(prefs.getItem('agents')) } catch { return 'both' }
}
const storedLang = (): Lang => {
  try { return langFrom(prefs.getItem('lang') ?? navigator.language) } catch { return langFrom(navigator.language) }
}
const storedLayout = (): Layout => {
  try { return parseLayout(JSON.parse(prefs.getItem('layout') ?? 'null')) } catch { return EMPTY }
}
// The dividers and the collapsed panels of the default split; a saved custom layout draws its own rects instead.
type Split = Cols & { hidePane?: boolean; hideRight?: boolean }
const storedSplit = (): Split => {
  try {
    const v = JSON.parse(prefs.getItem('split') ?? '{}') ?? {}
    const px = (n: unknown) => (typeof n === 'number' && n > 0 && Number.isFinite(n) ? n : undefined)
    return { pane: px(v.pane), right: px(v.right), hidePane: v.hidePane === true, hideRight: v.hideRight === true }
  } catch { return {} }
}
type TermPrefs = { size: number; blink: boolean }
const storedTerm = (): TermPrefs => {
  try { const v = JSON.parse(prefs.getItem('terminal') ?? 'null'); return { size: Math.min(22, Math.max(10, Number(v?.size) || 13)), blink: v?.blink !== false } } catch { return { size: 13, blink: true } }
}
// The live terminals by id, so the toolbar can reach the one on screen.
const TERMS = new Map<string, Terminal>()
// A rect in workspace fractions as CSS: percent-based, so a saved layout follows the window without any code running.
const rectStyle = (r: Rect): CSSProperties => ({
  position: 'absolute',
  gridArea: 'auto', // or the percentages would be of the grid cell, not the window
  left: `${r.x * 100}%`,
  width: `${r.w * 100}%`,
  top: `calc(var(--t) + ${r.y} * (100% - var(--t) - var(--b)))`,
  height: `calc(${r.h} * (100% - var(--t) - var(--b)))`,
})
// The badge in front of a file name: its kind in two or three letters, coloured per theme.
const FileIcon = ({ name, dir = false }: { name: string; dir?: boolean }) => {
  const { label, kind, shape } = iconOf(name, dir)
  return <i className={`fi fi-${kind} fs-${shape}`} aria-hidden="true">{label}</i>
}
// A thief's domino mask, drawn here (not taken from any game): REBEL's alert and folder mark.
const Mask = () => (
  <svg className="mask" viewBox="0 0 64 28" aria-hidden="true">
    <path d="M2 4 Q16 0 32 9 Q48 0 62 4 Q60 20 46 24 Q36 26 32 17 Q28 26 18 24 Q4 20 2 4Z M12 10 Q18 7 25 12 Q19 16 12 10Z M39 12 Q46 7 52 10 Q45 16 39 12Z" fillRule="evenodd" />
  </svg>
)
// Once the terminal is on screen (the next frame), its keyboard input takes focus.
const focusTerm = (id: string) => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-term="${CSS.escape(id)}"] .xterm-helper-textarea`)?.focus())
// Text typed into a terminal for you: no control characters, so a file or skill name can never press Enter or send keys.
const typed = (text: string) => text.replace(/[\x00-\x1f\x7f]/g, '')
const fileUrl = (path: string) => encodeURI(`file://${path.startsWith('/') ? '' : '/'}${path.replace(/\\/g, '/')}`)
const isFile = (t: { path: string; head?: string; web?: string; image?: string; skill?: unknown }) => t.head === undefined && t.web === undefined && t.image === undefined && !t.skill
const relative = (root: string, path: string) => path.slice(root.length).replace(/^[\\/]/, '')

const Cut = ({ label, ground = 'var(--chip)', ink = 'var(--chip-ink)' }: { label: string; ground?: string; ink?: string }) => (
  // One span per letter: REBEL cuts the label up like a ransom note; TIDE ignores them.
  <span className="cut" style={{ background: ground, color: ink }} aria-label={label}>{[...label].map((c, i) => <span key={i}>{c}</span>)}</span>
)

export function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [root, setRoot] = useState('')
  const [opened, setOpened] = useState<string[]>([]) // projects with a live Claude Code session
  const [picker, setPicker] = useState(false)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState('')
  const [branch, setBranch] = useState('')
  const [usage, setUsage] = useState<Usage | null>(null)
  const [now, setNow] = useState(Date.now())
  const [theme, setTheme] = useState<ThemeName>(stored)
  const [lang, setLang] = useState<Lang>(storedLang)
  const [settings, setSettings] = useState(false)
  const [calm, setCalm] = useState(() => { try { return prefs.getItem('motion') === 'reduce' } catch { return false } })
  useEffect(() => {
    document.documentElement.dataset.motion = calm ? 'reduce' : 'full'
    try { prefs.setItem('motion', calm ? 'reduce' : 'full') } catch {}
  }, [calm])
  const [settingsTab, setSettingsTab] = useState<'general' | 'appearance' | 'keys' | 'terminal'>('general')
  const [layout, setLayout] = useState<Layout>(storedLayout)
  const [draft, setDraft] = useState<Layout | null>(null) // set while UI edit mode is open; only Save copies it to layout
  const shown = draft ?? layout
  const [split, setSplit] = useState<Split>(storedSplit)
  useEffect(() => { try { prefs.setItem('split', JSON.stringify(split)) } catch {} }, [split])
  const splitDrag = useRef<{ which: 'pane' | 'right'; sx: number; start: Required<Cols> } | null>(null)
  const [ws, setWs] = useState({ w: window.innerWidth, h: window.innerHeight, top: 0 })
  const [floatHost, setFloatHost] = useState<HTMLElement | null>(null)
  const [termPrefs, setTermPrefs] = useState<TermPrefs>(storedTerm)
  const setTerm = (p: Partial<TermPrefs>) => setTermPrefs(was => {
    const next = { ...was, ...p, size: Math.min(22, Math.max(10, p.size ?? was.size)) }
    try { prefs.setItem('terminal', JSON.stringify(next)) } catch {}
    return next
  })
  const T = (key: Parameters<typeof tr>[1], vars?: Record<string, string | number>) => tr(lang, key, vars)
  // A limit Claude Code adds later (a model's own weekly limit, say) still gets a readable name: seven_day_opus is "Weekly OPUS".
  const usageLabel = (kind: string) => {
    const key = `usage.${kind}` as Parameters<typeof tr>[1]
    if (key in STRINGS.en) return T(key)
    if (kind.startsWith('model:')) return T('usage.model', { name: kind.slice(6) })
    return kind.startsWith('seven_day_') ? `${T('usage.seven_day')} ${kind.slice(10).toUpperCase()}` : kind.replace(/_/g, ' ').toUpperCase()
  }
  const [finder, setFinder] = useState<Finder | null>(null)
  const [menu, setMenu] = useState('ITEM')
  const [skills, setSkills] = useState<{ name: string; description: string; plugin: string; uses: number }[]>([])
  // DISCOVER: null while loading, a string when GitHub could not be reached. One repository is open at a time.
  const [repos, setRepos] = useState<Repo[] | null | string>(null)
  const [shelf, setShelf] = useState<{ repo: string; skills: Found[] | null | string }>()
  const [equip, setEquip] = useState<{ mcp: string[]; plugins: string[] }>({ mcp: [], plugins: [] })
  const [quests, setQuests] = useState<Hit[] | null>(null)
  const [day, setDay] = useState<string | null>(null) // CALENDAR: the picked day, 'YYYY-MM-DD'
  // Your own schedule, for every project. Written on each change, so the calendar and the store never disagree.
  const [events, setEvents] = useState<Event[]>(() => { try { return parseEvents(JSON.parse(prefs.getItem('events') ?? '[]')) } catch { return [] } })
  const changeEvents = (f: (list: Event[]) => Event[]) => setEvents(list => {
    const next = f(list)
    try { prefs.setItem('events', JSON.stringify(next)) } catch {}
    return next
  })
  const [toast, setToast] = useState('')
  const warned = useRef(new Set<string>())
  const [agents, setAgents] = useState<Agents>(storedAgents)
  const [picked, setPicked] = useState<(ToolId | null)[]>(() => [agentsOf(storedAgents())[0], null]) // the tool each dock group was last asked to show
  const [focus, setFocus] = useState(0) // the group skills and ⌘L type into
  const [dragging, setDragging] = useState(false)
  const [dropAt, setDropAt] = useState<{ group: number; side: 'row' | 'col' | null } | null>(null)
  const [hosts, setHosts] = useState<string[]>([]) // LINK: the hosts of ~/.ssh/config
  const [remotes, setRemotes] = useState<string[]>([]) // hosts with an ssh terminal open
  const [remote, setRemote] = useState('')
  // The agent panel: what each group can show, and the one tool on screen in each.
  const docks = shown.docks
  const visible = TOOL_IDS.filter(t => !(agents === 'codex' && (t === 'claude' || t === 'chat')) && !(agents === 'claude' && t === 'codex') && !(t === 'ssh' && !remotes.length))
  const act = pickActive(docks, picked, visible)
  const shownGroups = act.flatMap((t, i) => (t ? [i] : []))
  const focused = shownGroups.includes(focus) ? focus : shownGroups[0] ?? 0
  const pane: ToolId = act[focused] ?? 'shell'
  const isOn = (t: ToolId) => act[groupOf(docks, t)] === t
  // A dock change shows at once; outside edit mode it is also kept, inside it waits for Save like the rest of the draft.
  const setDocks = (next: Docks) => {
    if (draft) return setDraft(d => d && { ...d, docks: next })
    setLayout(l => {
      const out = { ...l, docks: next }
      try { prefs.setItem('layout', JSON.stringify(out)) } catch {}
      return out
    })
  }
  const connect = (host: string) => {
    setRemotes(was => (was.includes(host) ? was : [...was, host]))
    setRemote(host)
    showPane('ssh')
    setSplit(s => ({ ...s, hideRight: false }))
  }
  const [shells, setShells] = useState<string[]>([]) // projects with a shell open; started on first use
  const [resumes, setResumes] = useState<Record<string, string>>({}) // project -> the session its Claude pane resumed
  const [sessions, setSessions] = useState<{ id: string; title: string; mtime: number }[]>([])
  const [codexes, setCodexes] = useState<string[]>([]) // projects with Codex open; started on first use, like the shell
  const [chatting, setChatting] = useState<string[]>([]) // projects with the chat panel open; started on first use
  // `under` is the dock the tool is shown in; after a drag, pass the docks the drop produced, not the ones on screen.
  const showPane = (p: ToolId, under: Docks = docks) => {
    const next = showIn(under, picked, p)
    setPicked(next.picked)
    setFocus(next.focus)
    if (p === 'chat' && root) setChatting(was => (was.includes(root) ? was : [...was, root]))
    if (p === 'shell' && root) setShells(was => (was.includes(root) ? was : [...was, root]))
    if (p === 'codex' && root) setCodexes(was => (was.includes(root) ? was : [...was, root]))
  }
  // A tool on screen in any group starts the way a click on it would, so a second group never shows an empty body.
  // Driven by the saved layout, so trying a preset in edit mode starts nothing that Cancel would leave running.
  const liveAct = pickActive(layout.docks, picked, visible)
  useEffect(() => {
    if (!root) return
    const start = (on: boolean, set: (f: (was: string[]) => string[]) => void) => on && set(was => (was.includes(root) ? was : [...was, root]))
    start(liveAct.includes('chat'), setChatting)
    start(liveAct.includes('shell'), setShells)
    start(liveAct.includes('codex'), setCodexes)
  }, [liveAct.join(), root])
  const calendarOut = Boolean(shown.floats.calendar)
  const [changes, setChanges] = useState<Change[]>([])
  const [commits, setCommits] = useState<{ hash: string; subject: string; author: string; at: number }[]>([])
  const refreshGit = useCallback(async () => {
    setChanges(root ? await api.status(root) : [])
    setCommits(root ? await api.log(root) : [])
  }, [root])
  useEffect(() => {
    refreshGit()
    window.addEventListener('focus', refreshGit)
    return () => window.removeEventListener('focus', refreshGit)
  }, [refreshGit])
  // Each menu loads what it shows when you open it, as the pane's menus refresh on entry.
  useEffect(() => {
    if (menu === 'LINK') api.sshHosts().then(setHosts, () => setHosts([]))
    if (!root) return
    if (menu === 'SKILL') (api.skills().then(setSkills), api.discover.repos().then(setRepos, () => setRepos(T('discover.failed'))))
    if (menu === 'EQUIP') api.equip(root).then(setEquip)
    if (agents !== 'codex' && (menu === 'AGENT' || menu === 'CALENDAR' || calendarOut)) api.sessions(root).then(setSessions)
    if (menu === 'STATUS') refreshGit()
    if (menu === 'QUEST') (setQuests(null), api.search(root, 'TODO').then(setQuests))
  }, [menu, root, calendarOut])
  // Codex alone starts with each project, as Claude Code does; beside Claude Code it waits for its tab.
  const claudeOn = agents === 'codex' ? [] : opened
  const codexOn = agents === 'codex' ? opened : agents === 'both' ? codexes : []
  // Turning an agent off ends its sessions, so nothing keeps running where it cannot be seen.
  const pickAgents = (next: Agents) => {
    const live: Record<Agent, string[]> = { claude: claudeOn, codex: codexOn }
    for (const a of agentsOf(agents)) if (!agentsOf(next).includes(a)) for (const path of live[a]) api.pty.kill(`${a}:${path}`)
    if (next !== 'both') setCodexes([])
    if (next === 'codex') for (const path of chatting) api.chat.stop(`chat:${path}`)
    if (pane === 'chat' ? next === 'codex' : (pane === 'claude' || pane === 'codex') && !agentsOf(next).includes(pane)) showPane(agentsOf(next)[0])
    setAgents(next)
    try { prefs.setItem('agents', next) } catch {}
  }
  const say = (text: string) => {
    const to = targetOf(agents, pane)
    api.pty.write(`${to}:${root}`, typed(text))
    showPane(to)
    focusTerm(`${to}:${root}`)
  }
  const resume = (id: string) => { if (agents !== 'codex') (setResumes(r => ({ ...r, [root]: id })), showPane('claude')) } // only Claude Code has sessions to resume here

  // The pane's toast: once per limit when it passes 85%, again only after it falls back.
  useEffect(() => {
    const meters = [{ kind: 'CTX', percent: usage?.context ?? 0 }, ...(usage?.limits ?? []).map(l => ({ kind: LIMITS[l.kind] ?? l.kind, percent: l.percent }))]
    for (const { kind, percent } of meters) {
      if (percent < 85) warned.current.delete(kind)
      else if (!warned.current.has(kind)) {
        warned.current.add(kind)
        setToast(kind === 'CTX' ? T('toast.context', { n: Math.round(percent) }) : T('toast.limit', { kind, n: Math.round(percent) }))
        setTimeout(() => setToast(''), 5000)
      }
    }
  }, [usage])

  const openDiff = async (file: string) => {
    const id = `diff:${file}`
    const [head, now] = await Promise.all([api.head(root, file), api.read(file).catch(() => '')])
    setTabs(ts => [...ts.filter(t => t.path !== id), { path: id, text: now, saved: now, head }])
    setActive(id)
  }
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  // Claude Code's open proposals by tab name: answering one lets its edit go ahead or stops it.
  const proposals = useRef(new Map<string, (answer: string[]) => void>())
  const settle = (name: string, accept: boolean) => {
    const id = `claude:${name}`
    const tab = live.current.tabs.find(t => t.path === id)
    proposals.current.get(name)?.(accept && tab ? ['FILE_SAVED', tab.text] : ['DIFF_REJECTED', name])
    proposals.current.delete(name)
    setTabs(ts => ts.filter(t => t.path !== id))
    setActive(a => (a === id ? tab?.proposal ?? '' : a))
  }
  // The selection as the IDE link reports it: 0-based lines, the end just after the last character.
  const selectionOf = () => {
    const e = editorRef.current
    const s = e?.getSelection()
    const at = live.current.tabs.find(t => t.path === live.current.active)
    if (!e || !s || !at || !isFile(at)) return null
    return {
      success: true, text: e.getModel()?.getValueInRange(s) ?? '', filePath: at.path, fileUrl: fileUrl(at.path),
      selection: { start: { line: s.startLineNumber - 1, character: s.startColumn - 1 }, end: { line: s.endLineNumber - 1, character: s.endColumn - 1 }, isEmpty: s.isEmpty() },
    }
  }
  // What Claude Code may ask of the editor. File access still goes through the main process, which keeps it inside the open projects.
  const ideTools: Record<string, (a: any) => unknown> = {
    openFile: async a => { await api.read(String(a.filePath)); await openFile(String(a.filePath), undefined, 1, !a.preview); return `Opened file: ${a.filePath}` },
    openDiff: async a => {
      const name = String(a.tab_name)
      const head = await api.read(String(a.old_file_path)).catch(() => '')
      const text = String(a.new_file_contents)
      proposals.current.get(name)?.(['DIFF_REJECTED', name]) // the same name again replaces the diff
      setTabs(ts => [...ts.filter(t => t.path !== `claude:${name}`), { path: `claude:${name}`, text, saved: text, head, proposal: String(a.new_file_path) }])
      setActive(`claude:${name}`)
      return new Promise<string[]>(done => proposals.current.set(name, done))
    },
    close_tab: a => { proposals.current.delete(String(a.tab_name)); setTabs(ts => ts.filter(t => t.path !== `claude:${a.tab_name}`)); setActive(x => (x === `claude:${a.tab_name}` ? '' : x)); return 'TAB_CLOSED' },
    closeAllDiffTabs: () => {
      const n = live.current.tabs.filter(t => t.head !== undefined).length
      for (const done of proposals.current.values()) done(['DIFF_REJECTED', ''])
      proposals.current.clear()
      setTabs(ts => ts.filter(t => t.head === undefined))
      setActive(x => (/^(claude|diff):/.test(x) ? '' : x))
      return `CLOSED_${n}_DIFF_TABS`
    },
    getCurrentSelection: () => selectionOf() ?? { success: false, message: 'No active editor found' },
    getLatestSelection: () => selectionOf() ?? { success: false, message: 'No selection available' },
    getOpenEditors: () => ({ tabs: live.current.tabs.filter(isFile).map(t => ({ uri: fileUrl(t.path), isActive: t.path === live.current.active, label: baseName(t.path), languageId: langOf(t.path), isDirty: t.text !== t.saved })) }),
    getDiagnostics: a => {
      const marks: any[] = monacoRef.current?.editor.getModelMarkers({}) ?? []
      const byFile = new Map<string, any[]>()
      for (const m of marks) {
        const uri = fileUrl(m.resource.path)
        if (a.uri && a.uri !== uri) continue
        byFile.set(uri, [...(byFile.get(uri) ?? []), { message: m.message, severity: ({ 8: 'Error', 4: 'Warning', 2: 'Information', 1: 'Hint' } as Record<number, string>)[m.severity], range: { start: { line: m.startLineNumber - 1, character: m.startColumn - 1 }, end: { line: m.endLineNumber - 1, character: m.endColumn - 1 } }, source: m.source ?? m.owner }])
      }
      return [...byFile].map(([uri, diagnostics]) => ({ uri, diagnostics }))
    },
    checkDocumentDirty: a => {
      const t = live.current.tabs.find(t => t.path === a.filePath)
      return t ? { success: true, filePath: t.path, isDirty: t.text !== t.saved, isUntitled: false } : { success: false, message: `Document not open: ${a.filePath}` }
    },
    saveDocument: async a => {
      const t = live.current.tabs.find(t => t.path === a.filePath)
      if (!t) return { success: false, message: `Document not open: ${a.filePath}` }
      await live.current.save(t.path, t.text)
      return { success: true, filePath: t.path, saved: true, message: 'Document saved successfully' }
    },
  }
  const ideRef = useRef(ideTools)
  ideRef.current = ideTools
  useEffect(() => api.ide.onCall(async (id: number, name: string, args: any) => {
    try { api.ide.reply(id, await ideRef.current[name]?.(args ?? {}) ?? { success: false, message: `Not supported: ${name}` }) }
    catch (e) { api.ide.reply(id, null, String((e as Error)?.message ?? e)) }
  }), [])
  const jump = useRef<{ path: string; line: number; col: number } | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    api.setTheme(theme)
    try { prefs.setItem('theme', theme) } catch {}
  }, [theme])
  useEffect(() => {
    document.documentElement.lang = lang
    try { prefs.setItem('lang', lang) } catch {}
  }, [lang])
  const nextTheme = () => setTheme(t => THEME_NAMES[(THEME_NAMES.indexOf(t) + 1) % THEME_NAMES.length])

  const loadProjects = useCallback(async (cwd: string) => {
    const raw = await api.projectsRaw()
    const fromClaude: Project[] = projectsOf(raw.claudeJson, raw.home)
    // Codex's projects go through the same rules (no home folder, no Library, one entry per folder); its own scratch folders under ~/.codex are left out.
    const codexJson = JSON.stringify({ projects: Object.fromEntries((raw.codexProjects as string[]).map(p => [p, { hasTrustDialogAccepted: true }])) })
    const fromCodex: Project[] = projectsOf(codexJson, raw.home).filter((p: Project) => !/\/\.codex\//.test(p.path.replace(/\\/g, '/')) && !fromClaude.some(f => samePath(f.path, p.path)))
    const found = [...fromClaude, ...fromCodex]
    const real = await api.exists(found.map(p => p.path))
    const ranked = rankProjects(found.filter((_, i) => real[i]), lastUsedOf(raw.history), cwd)
    // Nine rows, and the open project is always one of them (it ranks last, so a tenth project used to push it out).
    const here = ranked.find(p => samePath(p.path, cwd))
    return here ? [...ranked.filter(p => p !== here).slice(0, 8), here] : ranked.slice(0, 9)
  }, [])

  const open = useCallback(async (path: string) => {
    const at = await api.openProject(path)
    setRoot(at)
    setOpened(was => (was.includes(at) ? was : [...was, at]))
    setTabs([])
    setActive('')
    setPicker(false)
    setBranch(await api.branch(at))
    setProjects(await loadProjects(at))
  }, [loadProjects])

  // Start on the welcome page with recent projects, as VS Code does; nothing opens until you pick.
  useEffect(() => {
    loadProjects('').then(setProjects)
  }, [])
  const openFolder = async () => {
    const p = await api.pickProject()
    if (p) open(p)
  }

  useEffect(() => {
    const tick = async () => {
      setUsage(await api.usage(root).catch(() => null))
      setNow(Date.now())
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [root])

  // A single click previews (the tab is replaced by the next preview); a double click, an edit or a jump keeps it.
  const openFile = async (path: string, line?: number, col = 1, keep = Boolean(line)) => {
    if (line) jump.current = { path, line, col }
    const had = tabs.find(t => t.path === path)
    if (!had) {
      const image = isImage(path) ? await api.image(path).catch(() => '') : undefined
      const web = previewKind(path) === 'direct' ? await api.previewUrl(path).catch(() => '') : undefined
      const text = image === undefined && web === undefined ? await api.read(path).catch(() => '') : ''
      setTabs(ts => [...ts.filter(t => keep || !(t.preview && t.text === t.saved)), { path, text, saved: text, image, web, preview: !keep }])
    } else if (keep && had.preview) setTabs(ts => ts.map(t => (t.path === path ? { ...t, preview: false } : t)))
    setActive(path)
    if (path === active) reveal()
  }
  // The live view of an HTML or Markdown file, in a tab of its own beside the file's editor tab.
  const openLive = async (path: string) => {
    const id = `live:${path}`
    if (!tabs.some(t => t.path === id)) {
      const web = await api.previewUrl(path).catch(() => '')
      setTabs(ts => (ts.some(t => t.path === id) ? ts : [...ts, { path: id, text: '', saved: '', web }]))
    }
    setActive(id)
  }
  // Puts the cursor on the line a search result or quick open asked for, once that file is the editor's model.
  const reveal = () => {
    const e = editorRef.current
    const j = jump.current
    if (!e || !j || j.path !== live.current.active) return
    jump.current = null
    e.revealLineInCenter(j.line)
    e.setPosition({ lineNumber: j.line, column: j.col })
    e.focus()
  }
  useEffect(() => { requestAnimationFrame(reveal) }, [active])
  const closeTab = (path: string) => {
    const tab = tabs.find(t => t.path === path)
    if (tab && tab.text !== tab.saved && !confirm(T('discard', { name: baseName(path) }))) return
    if (tab?.proposal) return settle(path.slice('claude:'.length), false)
    const rest = tabs.filter(t => t.path !== path)
    setTabs(rest)
    if (active === path) setActive(rest.at(-1)?.path ?? '')
  }

  // Claude Code edits files on disk: tabs without your own unsaved edits follow the disk when you come back to the window.
  useEffect(() => {
    const sync = async () => {
      const fresh = await Promise.all(tabs.map(t => (t.text === t.saved && isFile(t) ? api.read(t.path).catch(() => t.saved) : t.saved)))
      setTabs(ts => ts.map((t, i) => (t.text === t.saved && fresh[i] !== undefined && fresh[i] !== t.saved ? { ...t, text: fresh[i], saved: fresh[i] } : t)))
    }
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [tabs])

  // Keys 1-9 and Enter pick a project while the picker is open, like the MENU pane's switcher.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (draft) return // edit mode owns the keyboard
      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        e.stopPropagation()
        setFinder({ mode: 'files', query: '', hits: [], at: 0 })
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setFinder({ mode: 'all', query: '', hits: [], at: 0 })
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        e.stopPropagation()
        setFinder({ mode: 'search', query: '', hits: [], at: 0 })
      } else if ((api.platform === 'darwin' ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'j')) {
        // Not Ctrl on macOS: Ctrl+B and Ctrl+J belong to the shell and tmux in the terminal.
        e.preventDefault()
        e.stopPropagation()
        setSplit(s => (e.key === 'b' ? { ...s, hidePane: !s.hidePane } : { ...s, hideRight: !s.hideRight }))
      } else if (mod && !e.shiftKey && e.key === 'w' && active) {
        e.preventDefault()
        e.stopPropagation()
        closeTab(active)
      } else if (e.ctrlKey && e.key === 'Tab' && tabs.length > 1) {
        e.preventDefault()
        e.stopPropagation()
        const i = tabs.findIndex(t => t.path === active)
        setActive(tabs[(i + (e.shiftKey ? tabs.length - 1 : 1)) % tabs.length].path)
      } else if (mod && e.key === ',') {
        e.preventDefault()
        e.stopPropagation()
        setSettingsTab('keys') // the list of shortcuts is what a key press is most likely after
        setSettings(s => !s)
      } else if (mod && e.key === 'o') {
        e.preventDefault()
        setPicker(p => !p)
      } else if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).matches?.('.entry, .tab')) {
        e.preventDefault()
        ;(e.target as HTMLElement).click() // rows and tabs are not buttons: the keyboard picks them as a click does
      } else if (picker) {
        const n = e.key === 'Enter' ? 1 : Number(e.key)
        if (e.key === 'Escape') setPicker(false)
        else if (n >= 1 && projects[n - 1]) open(projects[n - 1].path)
      }
    }
    window.addEventListener('keydown', key, true) // capture: before Monaco and xterm take the keys
    return () => window.removeEventListener('keydown', key, true)
  }, [picker, projects, open, draft, tabs, active])

  // The workspace in pixels: only edit mode and widget minimums need it; the panels themselves are percentages.
  useLayoutEffect(() => {
    const measure = () => {
      const top = document.querySelector('.top')?.getBoundingClientRect().height ?? 0
      const hud = document.querySelector('.hud')?.getBoundingClientRect().height ?? 0
      setWs({ w: window.innerWidth, h: window.innerHeight - top - hud, top })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [theme])

  const startEdit = () => {
    (document.activeElement as HTMLElement | null)?.blur() // or the arrow keys would also reach the terminal
    setSettings(false)
    setDraft(layout)
  }
  const saveEdit = () => {
    if (!draft) return
    setLayout(draft)
    try { prefs.setItem('layout', JSON.stringify(draft)) } catch {}
    setDraft(null)
  }
  // Edit mode shows every panel, so a collapsed one can still be placed.
  const hidePane = Boolean(split.hidePane) && !draft
  const hideRight = Boolean(split.hideRight) && !draft
  const cols = fitCols(split, ws.w)
  const customCols = split.pane !== undefined || split.right !== undefined || hidePane || hideRight
  const mainStyle = (id: MainId): CSSProperties => ({
    ...(shown.main ? rectStyle(fillHidden(shown.main, [...(hidePane ? ['pane' as const] : []), ...(hideRight ? ['right' as const] : [])])[id]) : undefined),
    ...((id === 'pane' && hidePane) || (id === 'right' && hideRight) ? { display: 'none' } : undefined), // hidden, not unmounted: the terminals keep running
  })
  const divider = (which: 'pane' | 'right') => (
    <div
      className="split"
      title={T('split.drag')}
      style={{ left: which === 'pane' ? cols.pane : ws.w - cols.right }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); splitDrag.current = { which, sx: e.clientX, start: cols } }}
      onPointerMove={e => {
        const d = splitDrag.current
        if (!d) return
        const by = (e.clientX - d.sx) * (d.which === 'pane' ? 1 : -1)
        setSplit(s => ({ ...s, [d.which]: fitCols({ ...d.start, [d.which]: d.start[d.which] + by }, ws.w)[d.which] })) // only the dragged side becomes a fixed width
      }}
      onPointerUp={() => { splitDrag.current = null }}
      onPointerCancel={() => { splitDrag.current = null }}
      onDoubleClick={() => setSplit(s => ({ ...s, [which]: undefined }))}
    />
  )
  // A widget stays where the app puts it until it is given a rect; then it floats above the panels.
  const widget = (id: FloatId, node: ReactNode) => {
    const r = shown.floats[id]
    if (!r) return <div data-edit={id} style={{ display: 'contents' }}>{node}</div>
    return floatHost && createPortal(<div className={`float float-${id}`} style={rectStyle(fitFloat(r, id, ws))}>{node}</div>, floatHost)
  }

  // Quick open ranks on every key; search waits for a pause, since it reads every file.
  useEffect(() => {
    if (!finder || (!root && finder.mode !== 'all')) return
    const { mode, query } = finder
    const id = setTimeout(async () => {
      const hits: Hit[] = mode === 'all' ? [...everywhere(query), ...(root && query.trim() ? (await api.files(root, query)).slice(0, 10).map((h: Hit) => ({ ...h, group: 'FILE' })) : [])]
        : mode === 'files' ? await api.files(root, query) : await api.search(root, query, finder.opts)
      setFinder(f => (f && f.mode === mode && f.query === query ? { ...f, hits, at: 0 } : f))
    }, mode === 'files' ? 60 : 250)
    return () => clearTimeout(id)
  }, [finder?.mode, finder?.query, JSON.stringify(finder?.opts), root])
  const pickHit = (h?: Hit) => {
    if (!h) return
    setFinder(null)
    if (h.run) h.run()
    else openFile(h.path, h.line, h.col)
  }
  // Replace all, after a confirm: files open with unsaved edits are skipped; clean open tabs then reload from disk.
  const replaceAll = async () => {
    if (!finder || !root || !finder.hits.length) return
    const files = new Set(finder.hits.map(h => h.path)).size
    if (!window.confirm(T('replace.confirm', { n: finder.hits.length, files, text: finder.replace ?? '' }))) return
    const dirty = tabs.filter(t => t.text !== t.saved).map(t => t.path)
    try {
      const done = await api.replace(root, finder.query, finder.replace ?? '', finder.opts ?? {}, dirty)
      const fresh = await Promise.all(tabs.map(t => (t.text === t.saved && isFile(t) ? api.read(t.path).catch(() => t.saved) : t.saved)))
      setTabs(ts => ts.map((t, i) => (t.text === t.saved && fresh[i] !== undefined ? { ...t, text: fresh[i], saved: fresh[i] } : t)))
      setToast(T('replace.done', { n: done.n, files: done.files }) + (dirty.length ? ` ${T('replace.skipped', { n: dirty.length })}` : ''))
      setFinder(f => f && { ...f, hits: [] })
      refreshGit()
    } catch (e) { setToast(String((e as Error).message ?? e)) }
  }
  const [message, setMessage] = useState('')
  const commit = async () => {
    if (!root || !message.trim()) return
    const r = await api.commit(root, message).catch((e: Error) => ({ ok: false, error: e.message }))
    if (r.ok) setMessage('')
    setToast(r.ok ? T('commit.done') : r.error)
    refreshGit()
  }
  // ⌘K: what the window already holds, matched by name. Files come from the project on top of these.
  const everywhere = (query: string): Hit[] => {
    const goMenu = (m: string) => () => (setMenu(m), setSplit(s => ({ ...s, hidePane: false })))
    const items: (Hit & { label: string; detail?: string })[] = [
      ...MENUS.map((m: string) => ({ group: 'MENU', label: m, detail: T(`hint.${m}` as Parameters<typeof tr>[1]), run: goMenu(m) })),
      ...visible.map(t => ({ group: 'TOOL', label: t.toUpperCase(), detail: t === 'ssh' ? remote : t, run: () => (showPane(t), setSplit(s => ({ ...s, hideRight: false }))) })),
      ...projects.map(p => ({ group: 'PROJECT', label: p.name, detail: p.path, run: () => open(p.path) })),
      ...events.map(e => ({ group: 'EVENT', label: e.title, detail: `${e.date} ${e.time} ${T(`kind.${e.kind}`)} ${e.note}`, run: () => (setDay(e.date), goMenu('CALENDAR')()) })),
      ...(quests ?? []).map(q => ({ group: 'TODO', label: q.preview ?? '', detail: q.rel, path: q.path, rel: q.rel, line: q.line, col: q.col })),
      ...changes.map(c => ({ group: 'CHANGE', label: baseName(c.path), detail: relative(root, c.path), run: () => openDiff(c.path) })),
      ...THEME_NAMES.map(t => ({ group: 'THEME', label: THEMES[t].label, detail: T('theme'), run: () => setTheme(t) })),
      { group: 'SYSTEM', label: T('settings'), detail: 'settings', run: () => setSettings(true) },
    ].map(i => ({ path: '', rel: i.detail ?? '', ...i }))
    return matchItems(items, query)
  }

  const openShelf = (repo: string) => {
    if (shelf?.repo === repo) return setShelf(undefined)
    setShelf({ repo, skills: null })
    api.discover.skills(repo).then((skills: Found[]) => setShelf(s => (s?.repo === repo ? { repo, skills } : s)), () => setShelf(s => (s?.repo === repo ? { repo, skills: T('discover.failed') } : s)))
  }
  const skillTab = (repo: string, folder: string) => `skill:${repo}/${folder}`
  const openSkill = async (repo: string, s: Found) => {
    const id = skillTab(repo, s.folder)
    const got = await api.discover.preview(repo, s.folder).catch(() => undefined)
    if (!got) return setShelf(x => (x?.repo === repo ? { repo, skills: T('discover.failed') } : x))
    setTabs(ts => [...ts.filter(t => t.path !== id), { path: id, text: got.text, saved: got.text, skill: { repo, folder: s.folder, files: got.files, installed: got.installed } }])
    setActive(id)
  }
  // Copies the skill into ~/.claude/skills and nothing else: it runs only when you later call it in a session.
  const installSkill = async (t: Tab) => {
    if (!t.skill) return
    const { repo, folder } = t.skill
    const mark = (skill: Partial<NonNullable<Tab['skill']>>) => setTabs(ts => ts.map(x => (x.path === t.path && x.skill ? { ...x, skill: { ...x.skill, ...skill } } : x)))
    try {
      await api.discover.install(repo, folder)
      mark({ installed: true, note: undefined })
      api.skills().then(setSkills)
      api.discover.skills(repo).then((skills: Found[]) => setShelf(s => (s?.repo === repo ? { repo, skills } : s)), () => {})
    } catch (e) {
      mark({ note: T(String(e).includes('exists') ? 'discover.exists' : 'discover.failed') })
    }
  }
  const tab = tabs.find(t => t.path === active)
  const save = async (path: string, text: string) => {
    await api.write(path, text)
    setTabs(ts => ts.map(t => (t.path === path ? { ...t, saved: text } : t)))
    refreshGit()
  }
  const live = useRef({ save, root, active, pane, agents, tabs })
  live.current = { save, root, active, pane, agents, tabs }

  // ⌘S saves; ⌘L hands the selection to Claude Code as an @file reference with its lines.
  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    requestAnimationFrame(reveal)
    // Claude Code follows the selection, as it does in VS Code: told once the cursor has rested.
    let told: ReturnType<typeof setTimeout>
    editor.onDidChangeCursorSelection(() => {
      clearTimeout(told)
      told = setTimeout(() => { const s = selectionOf(); if (s) api.ide.notify('selection_changed', s) }, 150)
    })
    // Prompt variables ({{name}}) get one decoration per letter, so REBEL can cut each from a different page.
    const vars = editor.createDecorationsCollection()
    const mark = () => {
      const model = editor.getModel()
      if (!model) return vars.clear()
      const text = model.getValue()
      const decos = []
      for (const v of promptVars(text).slice(0, 2000)) {
        for (let i = v.start; i < v.end; i++) {
          const a = model.getPositionAt(i)
          decos.push({ range: new monaco.Range(a.lineNumber, a.column, a.lineNumber, a.column + 1), options: { inlineClassName: `pv pv${(i - v.start) % 5}` } })
        }
      }
      vars.set(decos)
    }
    mark()
    editor.onDidChangeModelContent(mark)
    editor.onDidChangeModel(mark)
    // ⌘S formats first when the language has a formatter (TS/JS, JSON, CSS, HTML), as format-on-save does.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const { save, active } = live.current
      if (!active) return
      const format = editor.getAction('editor.action.formatDocument')
      if (format?.isSupported()) await format.run()
      save(active, editor.getValue())
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => {
      const { root, active, pane, agents } = live.current
      const s = editor.getSelection()
      if (!active || !s) return
      const lines = s.isEmpty() ? '' : `#L${s.startLineNumber}${s.endLineNumber > s.startLineNumber ? `-${s.endLineNumber}` : ''}`
      const to = targetOf(agents, pane)
      api.pty.write(`${to}:${root}`, typed(`@${relative(root, active)}${lines} `)) // to the agent on screen, else the first one enabled
      focusTerm(`${to}:${root}`)
    })
  }

  const grid = withTop(dockGrid(docks, shownGroups), 'usage')
  const termOf = (t: ToolId) => (t === 'ssh' ? `ssh:${remote}` : `${t}:${root}`)
  const calendar = <Calendar now={now} sessions={sessions} events={events} onSave={e => changeEvents(l => saveEvent(l, e))} onRemove={id => changeEvents(l => removeEvent(l, id))} day={day} onDay={setDay} onPick={resume} T={T} />
  return (
    <div className={`app ${api.platform} ${shown.main ? 'custom' : ''}`} style={customCols ? { gridTemplateColumns: `${hidePane ? 0 : cols.pane}px 1fr ${hideRight ? 0 : cols.right}px` } : undefined}>
      <header className="top">
        <button className="project" onClick={() => setPicker(true)} title={`${MOD}O`}>
          <Cut label="PROJECT" /> {root ? baseName(root) : T('pickProject')}
        </button>
        <span className="branch">{branch && `⎇ ${branch}`}</span>
        <button className="find-open" onClick={() => setFinder({ mode: 'all', query: '', hits: [], at: 0 })} title={`${T('key.K')} (${MOD}K)`}>⌕ <span>{T('find.all')}</span> <kbd>{MOD}K</kbd></button>
        <button className="theme" onClick={nextTheme} title={T('theme')}><Cut label={THEMES[theme].label} ground="var(--sel)" /></button>
        <button className="edit-open" onClick={startEdit} title={T('edit.open')}><Cut label="UI" ground="var(--chip)" /></button>
        <button className="gear fold" onClick={() => setSplit(s => ({ ...s, hidePane: !s.hidePane }))} aria-pressed={!hidePane} title={`${T('key.B')} (${MOD}B)`} aria-label={T('key.B')}>◧</button>
        <button className="gear fold" onClick={() => setSplit(s => ({ ...s, hideRight: !s.hideRight }))} aria-pressed={!hideRight} title={`${T('key.J')} (${MOD}J)`} aria-label={T('key.J')}>◨</button>
        <button className="gear" onClick={() => setSettings(true)} title={T('settings')} aria-label={T('settings')}>⚙</button>
        {widget('clock', <Clock now={now} />)}
      </header>

      <Pane menu={menu} onMenu={setMenu} now={now} hint={T(`hint.${menu}` as Parameters<typeof tr>[1])} style={mainStyle('pane')} wrapInfo={info => widget('info', info)}>
        {/* Every menu's content starts under a section header, as the terminal pane's does. */}
        {menu === 'ITEM' && root && <div className="group">FILES</div>}
        {menu === 'ITEM' && root && <Tree key={root} dir={root} depth={0} onOpen={openFile} active={active} />}
        {menu === 'STATUS' && branch && (
          <form className="commit-box" onSubmit={e => (e.preventDefault(), commit())}>
            <input value={message} onChange={e => setMessage(e.target.value)} placeholder={T('commit.placeholder', { branch })} onKeyDown={e => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && (e.preventDefault(), commit())} />
            <button type="submit" disabled={!message.trim() || !changes.some(c => c.code !== '??')} title={T('commit.hint')}>✓ COMMIT</button>
          </form>
        )}
        {menu === 'STATUS' && <div className="group">CHANGES <span>{changes.length}</span></div>}
        {menu === 'STATUS' && (changes.length ? changes.map(c => (
          <div tabIndex={0} key={c.path} className={`entry change ${active === `diff:${c.path}` ? 'on' : ''}`} onClick={() => openDiff(c.path)} title={relative(root, c.path)}>
            <b className={`code c-${c.code.replace('??', 'U')[0]}`}>{c.code.replace('??', 'U')}</b> {baseName(c.path)} <span className="quiet">{relative(root, c.path).slice(0, -baseName(c.path).length)}</span>
          </div>
        )) : <div className="entry quiet">{branch ? T('noChanges', { branch }) : T('noGit')}</div>)}
        {menu === 'STATUS' && commits.length > 0 && <div className="group">COMMITS <span>{commits.length}</span></div>}
        {menu === 'STATUS' && commits.map(c => (
          <div key={c.hash} className="entry commit" title={`${c.hash} · ${c.author} · ${new Date(c.at).toLocaleString()}`}>
            <b className="rank">{c.hash}</b> {c.subject} <div className="desc">{c.author} · {new Date(c.at).toLocaleDateString()}</div>
          </div>
        ))}
        {menu === 'SKILL' && [...new Set(skills.map(s => s.plugin))].flatMap(group => {
          const own = skills.filter(s => s.plugin === group)
          return [
            <div key={`group:${group}`} className="group">{group} <span>{own.length}</span></div>,
            ...own.map(s => (
              <div tabIndex={0} key={s.name} className="entry skill" onClick={() => say(`/${s.name} `)} title={s.description}>
                <span>▸ {s.name}</span> {s.uses > 0 && <b className="rank">{rank(s.uses)}</b>}
                <div className="desc">{s.description}</div>
              </div>
            )),
          ]
        })}
        {menu === 'SKILL' && (
          <>
            <div className="group">DISCOVER <span>{Array.isArray(repos) ? repos.length : ''}</span></div>
            {repos === null && <div className="entry quiet">{T('searching')}</div>}
            {typeof repos === 'string' && <div className="entry quiet">{repos}</div>}
            {Array.isArray(repos) && repos.flatMap(r => [
              <div tabIndex={0} key={r.repo} className="entry skill" onClick={() => openShelf(r.repo)} title={r.description} aria-expanded={shelf?.repo === r.repo}>
                <span>{shelf?.repo === r.repo ? '▾' : '▸'} {r.repo}</span> <b className="rank">★{r.stars >= 1000 ? `${(r.stars / 1000).toFixed(1)}k` : r.stars}</b>
                <div className="desc">{r.description}</div>
              </div>,
              ...(shelf?.repo !== r.repo ? [] : !Array.isArray(shelf.skills)
                ? [<div key={`${r.repo}:state`} className="entry sub quiet">{shelf.skills ?? T('searching')}</div>]
                : shelf.skills.length ? shelf.skills.map(s => (
                  <div tabIndex={0} key={`${r.repo}/${s.folder}`} className={`entry sub ${active === skillTab(r.repo, s.folder) ? 'on' : ''}`} onClick={() => openSkill(r.repo, s)} title={s.folder}>
                    {s.name} {s.installed && <b className="got" aria-label={T('discover.installed')}>✓</b>}
                    <div className="desc">{s.folder.split('/').slice(0, -1).join('/')}</div>
                  </div>
                )) : [<div key={`${r.repo}:none`} className="entry sub quiet">{T('discover.none')}</div>]),
            ])}
          </>
        )}
        {menu === 'EQUIP' && (
          <>
            <div className="group">MCP <span>{equip.mcp.length}</span></div>
            {equip.mcp.length ? equip.mcp.map(m => <div key={m} className="entry">◆ {m}</div>) : <div className="entry quiet">{T('noMcp')}</div>}
            <div className="group">PLUGINS <span>{equip.plugins.length}</span></div>
            {equip.plugins.map(m => <div key={m} className="entry">◆ {m}</div>)}
          </>
        )}
        {agents === 'codex' && menu === 'AGENT' && <div className="entry quiet">{T('claudeOnly')}</div>}
        {menu === 'AGENT' && agents !== 'codex' && (
          <>
            <div className="group">SESSIONS <span>{sessions.length}</span></div>
            {sessions.slice(0, 10).map(s => (
              <div tabIndex={0} key={s.id} className="entry" onClick={() => resume(s.id)}>▸ {s.title || T('untitled')} <div className="desc">{new Date(s.mtime).toLocaleString()}</div></div>
            ))}
            {!sessions.length && <div className="entry quiet">{T('noSessions')}</div>}
          </>
        )}
        {menu === 'QUEST' && <div className="group">TODO <span>{quests?.length}</span></div>}
        {menu === 'QUEST' && (quests === null ? <div className="entry quiet">{T('searching')}</div> : quests.length ? quests.map(q => (
          <div tabIndex={0} key={`${q.path}:${q.line}`} className="entry" onClick={() => openFile(q.path, q.line, q.col)}>▸ {q.preview} <div className="desc">{q.rel}:{q.line}</div></div>
        )) : <div className="entry quiet">{T('noTodo')}</div>)}
        {menu === 'LINK' && (
          <>
            <div className="group">PROJECTS <span>{projects.length}</span></div>
            {projects.map((p, i) => (
              <div tabIndex={0} key={p.path} className={`entry ${p.path === root ? 'on' : ''}`} onClick={() => open(p.path)}><b className="rank">{i + 1}</b> {p.name} <div className="desc">{p.path}</div></div>
            ))}
            <div tabIndex={0} className="entry" onClick={openFolder}>{T('openOther')}</div>
            <div className="group">{T('servers')} <span>{hosts.length}</span></div>
            {hosts.length ? hosts.map(h => (
              <div tabIndex={0} key={h} className={`entry ${pane === 'ssh' && h === remote ? 'on' : ''}`} onClick={() => connect(h)}>▸ {h} <div className="desc">ssh {h}</div></div>
            )) : <div className="entry quiet">{T('noServers')}</div>}
          </>
        )}
        {menu === 'CALENDAR' && (calendarOut ? <div className="entry quiet">{T('calendarFloating')}</div> : widget('calendar', calendar))}
        {menu === 'SYSTEM' && (
          <>
            <div className="group">{T('theme')}</div>
            {THEME_NAMES.map(t => <div tabIndex={0} key={t} className={`entry ${t === theme ? 'on' : ''}`} onClick={() => setTheme(t)}>◆ {THEMES[t].label}</div>)}
            <div className="group">{T('language')}</div>
            {UI_LANGS.map(l => <div tabIndex={0} key={l.id} className={`entry ${l.id === lang ? 'on' : ''}`} onClick={() => setLang(l.id)}>◆ {l.label}</div>)}
            <div className="group">{T('keys')}</div>
            {(['K', 'P', 'F', 'S', 'L', 'O', 'B', 'J'] as const).map(k => <div key={k} className="entry"><b className="rank">{MOD}{k === 'F' ? '⇧F' : k}</b> {T(`key.${k}`)}</div>)}
          </>
        )}
      </Pane>

      <main className="center" style={mainStyle('center')}>
        <nav className="tabs">
          {tabs.map(t => (
            <div tabIndex={0} key={t.path} className={`tab ${t.path === active ? 'on' : ''} ${t.preview ? 'preview' : ''}`} onClick={() => setActive(t.path)} onDoubleClick={() => openFile(t.path, undefined, 1, true)} title={t.preview ? `${T('preview')}: ${t.path}` : t.path}>
              <FileIcon name={t.proposal ?? t.path} />{t.head !== undefined && 'Δ '}{t.path.startsWith('live:') && '◉ '}{baseName(t.proposal ?? t.path)}{t.text !== t.saved && ' ●'}
              <span className="x" onClick={e => (e.stopPropagation(), closeTab(t.path))}>×</span>
            </div>
          ))}
          {tab && tab.head === undefined && tab.web === undefined && previewKind(tab.path) === 'live' && (
            <button className="live" onClick={() => openLive(tab.path)} title={T('live.open')} aria-label={T('live.open')}><Cut label="LIVE" ground="var(--edge)" /></button>
          )}
        </nav>
        {tab?.web !== undefined ? (
          <WebView key={tab.path} url={tab.web} T={T} />
        ) : tab?.head !== undefined ? (<>
          {tab.proposal && (
            <div className="web-bar proposal" role="group" aria-label={T('ide.proposal')}>
              <span>{T('ide.proposal')}: {relative(root, tab.proposal)}</span>
              <button onClick={() => settle(tab.path.slice('claude:'.length), true)}><Cut label={T('ide.accept')} ground="var(--sel)" ink="var(--sel-ink)" /></button>
              <button onClick={() => settle(tab.path.slice('claude:'.length), false)}><Cut label={T('ide.reject')} /></button>
            </div>
          )}
          <DiffEditor
            original={tab.head}
            modified={tab.text}
            language={langOf(tab.proposal ?? tab.path)}
            theme={`evoke-${theme}`}
            beforeMount={defineThemes}
            loading={<div className="state">{T('loading')}</div>}
            options={{ readOnly: true, renderSideBySide: true, fontFamily: 'Iosevka, Menlo, Consolas, monospace', fontSize: 13, minimap: { enabled: false } }}
          />
        </>
        ) : tab?.image !== undefined ? (
          <div className="image-view">{tab.image ? <img src={tab.image} alt={baseName(tab.path)} /> : <p className="quiet">{T('binary')}</p>}</div>
        ) : tab?.skill ? (<>
          <div className="web-bar proposal" role="group" aria-label={T('discover.preview')}>
            <span>{tab.skill.repo}/{tab.skill.folder} · {T('discover.files', { n: tab.skill.files })}{tab.skill.note && ` · ${tab.skill.note}`}</span>
            {tab.skill.installed
              ? <b className="got">✓ {T('discover.installed')}</b>
              : <button onClick={() => installSkill(tab)}><Cut label={T('discover.install')} ground="var(--sel)" ink="var(--sel-ink)" /></button>}
          </div>
          <Editor
            path={tab.path}
            language="markdown"
            value={tab.text}
            theme={`evoke-${theme}`}
            beforeMount={defineThemes}
            loading={<div className="state">{T('loading')}</div>}
            options={{ readOnly: true, wordWrap: 'on', fontFamily: 'Iosevka, Menlo, Consolas, monospace', fontSize: 14, minimap: { enabled: false }, padding: { top: 12 } }}
          />
        </>
        ) : tab ? (
          <Editor
            path={tab.path}
            language={langOf(tab.path)}
            value={tab.text}
            theme={`evoke-${theme}`}
            beforeMount={defineThemes}
            onMount={onMount}
            loading={<div className="state">{T('loading')}</div>}
            onChange={text => setTabs(ts => ts.map(t => (t.path === tab.path ? { ...t, text: text ?? '', preview: false } : t)))}
            options={{
              fontFamily: 'Iosevka, Menlo, Consolas, monospace', fontSize: 14, minimap: { enabled: true, renderCharacters: false, scale: 1 }, smoothScrolling: true, padding: { top: 12 },
              bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true }, linkedEditing: true, formatOnPaste: true,
            }}
          />
        ) : (
          <div className="empty">
            <EmptyArt theme={theme} />
            <img className="mark" src={THEMES[theme].logo} alt="Evoke" />
            <div className="big">EVOKE</div>
            {root ? (
              <p className="keys">{T('emptyHint', { mod: MOD }).split(' · ').map(k => <span key={k}>{k}</span>)}</p>
            ) : (
              <div className="welcome">
                <div className="group">{T('welcome')}</div>
                <button className="row" onClick={openFolder}><b>+</b> {T('openFolder')} <span className="quiet">{MOD}O</span></button>
                <div className="group">{T('recent')}</div>
                {projects.map((p, i) => (
                  <button key={p.path} className="row" onClick={() => open(p.path)}><b>{i + 1}</b> {p.name} <span className="quiet">{p.path}</span></button>
                ))}
                <p className="quiet">{T('welcomeHint')}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* The agent panel: one or two dock groups on a grid. Every terminal stays a child of this section, so moving a tool never restarts it. */}
      <section
        className="right"
        style={{ ...mainStyle('right'), gridTemplateColumns: grid.columns, gridTemplateRows: grid.rows, gridTemplateAreas: grid.areas }}
        onPointerDown={e => { const g = (e.target as HTMLElement).closest('[data-group]')?.getAttribute('data-group'); if (g) setFocus(Number(g)) }}
      >
        <UsageStrip usage={usage} now={now} label={usageLabel} />
        {shownGroups.map(g => (
          <DockHead
            key={g}
            group={g}
            focused={shownGroups.length > 1 && g === focused}
            tools={docks.groups[g].filter(t => visible.includes(t) && !docks.hidden.includes(t))}
            active={act[g]}
            label={t => (t === 'ssh' ? `SSH ${remote}` : t.toUpperCase())}
            title={t => (t === 'chat' ? T('chat.title') : T('dock.split'))}
            chip={(text, on) => <Cut label={text} ground={on ? 'var(--edge)' : 'var(--mid)'} />}
            onPick={showPane}
            dragging={dragging}
            onDrop={(t, before) => {
              const next = moveBefore(docks, t, g, before)
              setDocks(next)
              showPane(t, next)
              setDragging(false) // the dragged chip may have left this head's DOM, so its dragend never reaches React
              setDropAt(null)
            }}
            onDragState={on => { setDragging(on); if (!on) setDropAt(null) }}
          >
            <button onClick={() => setTerm({ size: termPrefs.size - 1 })} title={T('term.smaller')} aria-label={T('term.smaller')}><Cut label="A-" ground="var(--mid)" /></button>
            <button onClick={() => setTerm({ size: termPrefs.size + 1 })} title={T('term.larger')} aria-label={T('term.larger')}><Cut label="A+" ground="var(--mid)" /></button>
            <button onClick={() => act[g] && TERMS.get(termOf(act[g]!))?.clear()} title={T('term.clear')} aria-label={T('term.clear')}><Cut label="CLEAR" ground="var(--mid)" /></button>
          </DockHead>
        ))}
        {shownGroups.length > 1 && (
          <div
            className={`dock-split ${docks.dir}`}
            style={{ gridArea: 'split' }}
            title={T('dock.ratio')}
            onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={e => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
              const b = e.currentTarget.parentElement!.getBoundingClientRect()
              setDocks(parseDocks({ ...docks, ratio: docks.dir === 'row' ? (e.clientX - b.left) / b.width : (e.clientY - b.top) / b.height }))
            }}
            onDoubleClick={() => setDocks({ ...docks, ratio: 0.5 })}
          />
        )}
        {claudeOn.map(path => <Claude key={`claude:${path}:${resumes[path] ?? ''}`} kind="claude" resume={resumes[path]} cwd={path} group={groupOf(docks, 'claude')} on={isOn('claude') && path === root} theme={theme} prefs={termPrefs} endedLabel={code => T('ended', { code })} />)}
        {remotes.map(host => <Claude key={`ssh:${host}`} kind="ssh" cwd={host} group={groupOf(docks, 'ssh')} on={isOn('ssh') && host === remote} theme={theme} prefs={termPrefs} endedLabel={code => T('ended', { code })} />)}
        {codexOn.map(path => <Claude key={`codex:${path}`} kind="codex" cwd={path} group={groupOf(docks, 'codex')} on={isOn('codex') && path === root} theme={theme} prefs={termPrefs} endedLabel={code => T('ended', { code })} />)}
        {agents !== 'codex' && chatting.map(path => <Chat key={`chat:${path}`} cwd={path} group={groupOf(docks, 'chat')} on={isOn('chat') && path === root} T={T} />)}
        {shells.map(path => <Claude key={`shell:${path}`} kind="shell" cwd={path} group={groupOf(docks, 'shell')} on={isOn('shell') && path === root} theme={theme} prefs={termPrefs} endedLabel={code => T('ended', { code })} />)}
        {/* While a chip is dragged, each body takes the drop: its right or bottom edge splits, the rest moves the tool into that group. */}
        {dragging && shownGroups.map(g => (
          <div
            key={`drop${g}`}
            className="drop"
            data-group={g}
            data-side={dropAt?.group === g ? dropAt.side ?? 'in' : undefined}
            style={{ gridArea: `b${g}` }}
            onDragOver={e => {
              e.preventDefault()
              const b = e.currentTarget.getBoundingClientRect()
              const side = dropSide(e.clientX - b.left, e.clientY - b.top, b.width, b.height)
              if (dropAt?.group !== g || dropAt.side !== side) setDropAt({ group: g, side })
            }}
            onDragLeave={() => setDropAt(null)}
            onDrop={e => {
              e.preventDefault()
              const t = toolOf(e)
              const b = e.currentTarget.getBoundingClientRect()
              const side = dropSide(e.clientX - b.left, e.clientY - b.top, b.width, b.height)
              if (t) {
                const next = side ? splitDocks(docks, t, side) : moveTool(docks, t, g, Infinity)
                setDocks(next)
                showPane(t, next)
              }
              setDragging(false)
              setDropAt(null)
            }}
          ><span>{T('dock.split')}</span></div>
        ))}
      </section>

      {/* The status band, as above the terminal's prompt. */}
      <footer className="hud">
        <Cut label={menu} ground="var(--chip)" />
        <b className="band">{root ? baseName(root) : '—'}</b>{branch && <i className="hud-branch">⎇ {branch}</i>}
        <span className={`hud-changes ${changes.length ? 'dirty' : ''}`}>{T('changes', { n: changes.length })}</span>
        {!usage && <span className="quiet usd">{T('noUsage')}</span>}
      </footer>
      {!shown.main && !draft && !hidePane && divider('pane')}
      {!shown.main && !draft && !hideRight && divider('right')}
      <div className="floats" ref={setFloatHost} />
      {calendarOut && widget('calendar', calendar)}
      {toast && <div className="toast" role="alert"><Mask /><Cut label="ALERT" /> {toast}</div>}

      {finder && (
        <div className="picker" onClick={() => setFinder(null)}>
          <div className="sheet finder" onClick={e => e.stopPropagation()}>
            <div className="head">
              <Cut label={finder.mode === 'files' ? 'FILES' : finder.mode === 'all' ? 'FIND' : 'SEARCH'} />
              <input
                autoFocus
                value={finder.query}
                placeholder={finder.mode === 'files' ? T('fileName') : finder.mode === 'all' ? T('find.all') : T('searchText')}
                onChange={e => { const query = e.target.value; setFinder(f => f && { ...f, query }) }}
                onKeyDown={e => {
                  const n = finder.hits.length
                  if (e.key === 'Escape') setFinder(null)
                  else if (e.key === 'Enter') pickHit(finder.hits[finder.at])
                  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    setFinder({ ...finder, at: n ? (finder.at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n : 0 })
                  }
                }}
              />
            </div>
            {finder.mode === 'search' && (
              <div className="search-opts">
                <span className="ev-line">
                  <input value={finder.replace ?? ''} placeholder={T('replace.with')} onChange={e => { const replace = e.target.value; setFinder(f => f && { ...f, replace }) }} />
                  {([['caseSensitive', 'Aa'], ['word', 'ab'], ['regex', '.*']] as const).map(([k, label]) => (
                    <button key={k} type="button" className={finder.opts?.[k] ? 'on' : ''} aria-pressed={!!finder.opts?.[k]} title={T(`search.${k}`)} onClick={() => setFinder(f => f && { ...f, opts: { ...f.opts, [k]: !f.opts?.[k] } })}>{label}</button>
                  ))}
                  <button type="button" disabled={!finder.hits.length} onClick={replaceAll} title={T('replace.all')}>{T('replace.all')}</button>
                </span>
                <span className="ev-line">
                  <input value={finder.opts?.include ?? ''} placeholder={T('search.include')} onChange={e => { const include = e.target.value; setFinder(f => f && { ...f, opts: { ...f.opts, include } }) }} />
                  <input value={finder.opts?.exclude ?? ''} placeholder={T('search.exclude')} onChange={e => { const exclude = e.target.value; setFinder(f => f && { ...f, opts: { ...f.opts, exclude } }) }} />
                </span>
              </div>
            )}
            <div className="hits">
              {finder.hits.map((h, i) => (
                <button key={`${h.group}:${h.path}:${h.line}:${h.rel}:${i}`} className={`row ${i === finder.at ? 'on' : ''}`} onClick={() => pickHit(h)}>
                  {h.group && <b className="kind">{h.group}</b>}
                  {h.run || h.group === 'TODO' ? <>{(h as any).label} <span className="quiet">{h.rel}</span></> : h.line ? <><b>{h.line}</b> <span className="preview">{h.preview}</span> <span className="quiet">{h.rel}</span></> : <><FileIcon name={h.rel} /> {baseName(h.rel)} <span className="quiet">{h.rel}</span></>}
                </button>
              ))}
              {finder.query.trim().length >= (finder.mode === 'search' ? 2 : 1) && !finder.hits.length && <div className="row quiet">{T('noResults')}</div>}
            </div>
          </div>
        </div>
      )}

      {settings && (
        <div className="picker" onClick={() => setSettings(false)}>
          <div className="sheet settings" onClick={e => e.stopPropagation()}>
            <div className="head"><Cut label="SETTINGS" /> {T('settings')}</div>
            <nav className="set-tabs">
              {(['general', 'appearance', 'keys', 'terminal'] as const).map(k => (
                <button key={k} className={settingsTab === k ? 'on' : ''} onClick={() => setSettingsTab(k)}>{k === 'keys' ? T('keys') : T(`tab.${k}`)}</button>
              ))}
            </nav>
            {settingsTab === 'general' && (
              <>
                <div className="group">{T('language')}</div>
                {UI_LANGS.map(l => <button key={l.id} className={`row ${l.id === lang ? 'on' : ''}`} onClick={() => setLang(l.id)}><b>◆</b> {l.label}</button>)}
                <div className="group">{T('agents')}</div>
                {(['both', 'claude', 'codex'] as const).map(a => <button key={a} className={`row ${a === agents ? 'on' : ''}`} onClick={() => pickAgents(a)}><b>◆</b> {T(`agents.${a}`)}</button>)}
              </>
            )}
            {settingsTab === 'appearance' && (
              <>
                <div className="group">{T('theme')}</div>
                {THEME_NAMES.map(t => <button key={t} className={`row ${t === theme ? 'on' : ''}`} onClick={() => setTheme(t)}><b>◆</b> {THEMES[t].label}</button>)}
                <button className={`row ${calm ? 'on' : ''}`} aria-pressed={calm} onClick={() => setCalm(c => !c)}><b>◆</b> {T('motion.reduce')}</button>
                <div className="group">{T('edit.title')}</div>
                <button className="row" onClick={startEdit}><b>▸</b> {T('edit.open')}</button>
              </>
            )}
            {settingsTab === 'keys' && (['K', 'P', 'F', 'S', 'L', 'O', 'B', 'J', 'W', 'Tab', ','] as const).map(k => <div key={k} className="row"><b className="key">{k === 'Tab' ? 'Ctrl+Tab' : `${MOD}${k === 'F' ? '⇧F' : k}`}</b> {T(`key.${k}`)}</div>)}
            {settingsTab === 'terminal' && (
              <>
                <div className="row"><b>◆</b> {T('term.size')}
                  <span className="stepper">
                    <button onClick={() => setTerm({ size: termPrefs.size - 1 })} aria-label={T('term.smaller')}>−</button>
                    <output>{termPrefs.size}</output>
                    <button onClick={() => setTerm({ size: termPrefs.size + 1 })} aria-label={T('term.larger')}>+</button>
                  </span>
                </div>
                <button className={`row ${termPrefs.blink ? 'on' : ''}`} aria-pressed={termPrefs.blink} onClick={() => setTerm({ blink: !termPrefs.blink })}><b>◆</b> {T('term.blink')}</button>
              </>
            )}
          </div>
        </div>
      )}

      {draft && <LayoutEdit value={draft} onChange={setDraft} ws={ws} cols={split.pane !== undefined || split.right !== undefined ? cols : {}} top={ws.top} onSave={saveEdit} onCancel={() => setDraft(null)} T={T} />}

      {picker && (
        <div className="picker" onClick={() => setPicker(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="head"><Cut label="PROJECTS" /> {T('pickerHint')}</div>
            {projects.map((p, i) => (
              <button key={p.path} className={`row ${p.path === root ? 'here' : ''}`} onClick={() => open(p.path)}>
                <b>{i + 1}</b> {p.name} <span className="quiet">{p.path}</span>
              </button>
            ))}
            <button className="row" onClick={openFolder}>
              <b>+</b> {T('openOther').replace(/^\+ /, '')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Tree({ dir, depth, onOpen, active }: { dir: string; depth: number; onOpen: (p: string, line?: number, col?: number, keep?: boolean) => void; active: string }) {
  const [items, setItems] = useState<Entry[] | null>(null)
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({})
  useEffect(() => {
    api.list(dir).then(setItems, () => setItems([]))
  }, [dir])
  if (!items) return depth ? null : <div className="state">{tr(storedLang(), 'loading')}</div>
  return (
    <>
      {items.map(e => (
        <div key={e.path}>
          <div
            tabIndex={0}
            aria-expanded={e.dir ? Boolean(openDirs[e.path]) : undefined}
            className={`entry ${e.path === active ? 'on' : ''}`}
            style={{ paddingLeft: 12 + depth * 12 }}
            onClick={() => (e.dir ? setOpenDirs(o => ({ ...o, [e.path]: !o[e.path] })) : onOpen(e.path))}
            onDoubleClick={() => e.dir || onOpen(e.path, undefined, 1, true)}
          >
            {e.dir ? (openDirs[e.path] ? '▾ ' : '▸ ') : '  '}<FileIcon name={e.name} dir={e.dir} />{e.name}
          </div>
          {e.dir && openDirs[e.path] && <Tree dir={e.path} depth={depth + 1} onOpen={onOpen} active={active} />}
        </div>
      ))}
    </>
  )
}

// A preview page in a frame. It is another origin with no preload, so it cannot reach the app; no sandbox attribute, because Chromium refuses its PDF viewer in a sandboxed frame.
function WebView({ url, T }: { url: string; T: (key: any, vars?: any) => string }) {
  const [run, setRun] = useState(0)
  return (
    <div className="web-view">
      <div className="web-bar">
        <span>{url}</span>
        <button onClick={() => setRun(r => r + 1)} title={T('live.reload')} aria-label={T('live.reload')}>↻</button>
        <button onClick={() => api.previewOpen(url)} title={T('live.browser')} aria-label={T('live.browser')}>↗</button>
      </div>
      {url ? <iframe key={run} src={url} title={T('live.open')} /> : <p className="quiet">{T('binary')}</p>}
    </div>
  )
}

// One terminal per project and kind, kept alive while hidden so switching never ends a session. For ssh, cwd is the host.
function Claude({ kind, cwd, group, on, theme, prefs, resume, endedLabel }: { kind: 'claude' | 'codex' | 'shell' | 'ssh'; cwd: string; group: number; on: boolean; theme: ThemeName; prefs: TermPrefs; resume?: string; endedLabel: (code: number) => string }) {
  const id = `${kind}:${cwd}`
  const box = useRef<HTMLDivElement>(null)
  const fit = useRef<FitAddon>()
  const xterm = useRef<Terminal>()
  const [ended, setEnded] = useState<number | null>(null)
  const [run, setRun] = useState(0)

  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'Iosevka, Menlo, monospace',
      fontSize: prefs.size,
      cursorBlink: prefs.blink,
      allowTransparency: true,
      theme: { ...THEMES[theme].xterm },
    })
    xterm.current = term
    TERMS.set(id, term)
    const f = new FitAddon()
    fit.current = f
    term.loadAddon(f)
    term.open(box.current!)
    f.fit()
    setEnded(null)
    const offData = api.pty.onData(id, (d: string) => term.write(d))
    const offExit = api.pty.onExit(id, (code: number) => setEnded(code))
    term.onData(d => api.pty.write(id, d))
    term.onResize(({ cols, rows }) => api.pty.resize(id, cols, rows))
    api.pty.spawn(id, cwd, term.cols, term.rows, kind, run ? undefined : resume)
    const seen = new ResizeObserver(() => box.current?.offsetParent && f.fit())
    seen.observe(box.current!)
    return () => {
      seen.disconnect()
      offData()
      offExit()
      TERMS.delete(id)
      term.dispose()
    }
  }, [id, run])

  useEffect(() => {
    if (xterm.current) xterm.current.options.theme = { ...THEMES[theme].xterm }
  }, [theme])

  useEffect(() => {
    if (on) requestAnimationFrame(() => fit.current?.fit())
  }, [on])

  useEffect(() => {
    if (!xterm.current) return
    xterm.current.options.fontSize = prefs.size
    xterm.current.options.cursorBlink = prefs.blink
    if (box.current?.offsetParent) fit.current?.fit()
  }, [prefs])

  return (
    <div className={`claude ${on ? 'on' : ''}`} data-group={group} data-term={id} style={{ gridArea: `b${group}` }}>
      <div ref={box} className="term" />
      {ended !== null && (
        <button className="restart" onClick={() => setRun(r => r + 1)}>{endedLabel(ended)}</button>
      )}
    </div>
  )
}

// CALENDAR: month, week or day. Each day shows your own events (by kind) and a mark for each talk with Claude in this project.
type Draft = Partial<Event> & { date: string }
function Calendar({ now, sessions, events, onSave, onRemove, day, onDay, onPick, T }: { now: number; sessions: { id: string; title: string; mtime: number }[]; events: Event[]; onSave: (e: Event) => void; onRemove: (id: string) => void; day: string | null; onDay: (d: string) => void; onPick: (id: string) => void; T: (key: any, vars?: any) => string }) {
  const [view, setView] = useState<'month' | 'week' | 'day'>('month')
  const [at, setAt] = useState(now)
  const [draft, setDraft] = useState<Draft | null>(null)
  const d = new Date(at)
  const y = d.getFullYear()
  const m = d.getMonth()
  const today = dateKey(now)
  const count = new Map<string, number>()
  for (const s of sessions) count.set(dateKey(s.mtime), (count.get(dateKey(s.mtime)) ?? 0) + 1)
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const pick = (k: string) => (onDay(k), setAt(new Date(`${k}T12:00`).getTime()), setDraft(null))
  const shown = view === 'day' ? dateKey(at) : day ?? today
  const picked = sessions.filter(s => dateKey(s.mtime) === shown).sort((a, b) => a.mtime - b.mtime)
  const dayEvents = eventsOn(events, shown)
  const next = upcoming(events, now).filter(e => e.date !== shown)
  const week = weekOf(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  const label = view === 'month' ? `${y}.${pad(m + 1)}` : view === 'week' ? `${pad(new Date(week[0]).getMonth() + 1)}.${pad(new Date(week[0]).getDate())} – ${pad(new Date(week[6]).getMonth() + 1)}.${pad(new Date(week[6]).getDate())}` : `${y}.${pad(m + 1)}.${pad(d.getDate())} ${DAYS[d.getDay()]}`
  const dots = (k: string) => KINDS.filter(kind => events.some(e => e.date === k && e.kind === kind)).map(kind => <i key={kind} className={`dot k-${kind}`} />)
  const save = () => {
    if (!draft?.title?.trim()) return
    onSave({ id: draft.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: draft.title, date: draft.date, time: draft.time ?? '', kind: draft.kind ?? 'dev', note: draft.note ?? '' })
    setDraft(null)
  }
  const row = (e: Event, withDate = false) => (
    <div tabIndex={0} key={e.id} className={`entry event k-${e.kind}`} onClick={() => (withDate && pick(e.date), setDraft(e))} title={e.note}>
      <i className={`dot k-${e.kind}`} /> <b className="rank">{withDate ? `${e.date.slice(5).replace('-', '/')} ` : ''}{e.time || T('ev.allDay')}</b> {e.title}
      {e.note && <div className="desc">{e.note}</div>}
    </div>
  )
  return (
    <div className="calendar">
      <div className="cal-bar">
        <button onClick={() => setAt(stepDate(at, view, -1))} aria-label="previous">‹</button>
        <b>{label}</b>
        <button onClick={() => setAt(stepDate(at, view, 1))} aria-label="next">›</button>
        <button className="today-btn" onClick={() => (setAt(now), onDay(today))}>{T('today')}</button>
        <span className="views">
          {(['month', 'week', 'day'] as const).map(v => <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>{v.toUpperCase()}</button>)}
        </span>
      </div>
      {view === 'month' && (
        <div className="month">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <i key={i}>{w}</i>)}
          {Array.from({ length: first }, (_, i) => <span key={`x${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const k = dateKey(new Date(y, m, i + 1).getTime())
            const n = count.get(k) ?? 0
            return (
              <button key={k} className={`${n ? 'has' : ''} ${k === shown ? 'on' : ''} ${k === today ? 'today' : ''}`} onClick={() => pick(k)} title={n ? T('talks', { n }) : ''}>
                {i + 1}<span className="dots">{dots(k)}</span>
              </button>
            )
          })}
        </div>
      )}
      {view === 'week' && (
        <div className="week">
          {week.map(t => {
            const k = dateKey(t)
            const n = count.get(k) ?? 0
            return (
              <button key={k} className={`${n ? 'has' : ''} ${k === shown ? 'on' : ''} ${k === today ? 'today' : ''}`} onClick={() => pick(k)}>
                <b>{DAYS[new Date(t).getDay()]}</b> {new Date(t).getDate()} <span className="dots">{dots(k)}</span> <span className="quiet">{n ? T('talks', { n }) : ''}</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="group">{shown.slice(5).replace('-', '/')} {shown === today ? T('today') : ''} <span>{dayEvents.length}</span></div>
      {dayEvents.map(e => row(e))}
      {draft ? (
        <form className="ev-form" onSubmit={e => (e.preventDefault(), save())} onKeyDown={e => e.key === 'Escape' && setDraft(null)}>
          <input autoFocus required value={draft.title ?? ''} placeholder={T('ev.title')} onChange={e => setDraft({ ...draft, title: e.target.value })} />
          <span className="ev-line">
            <input type="date" required value={draft.date} onChange={e => e.target.value && setDraft({ ...draft, date: e.target.value })} />
            <input type="time" value={draft.time ?? ''} onChange={e => setDraft({ ...draft, time: e.target.value })} aria-label={T('ev.time')} />
          </span>
          <span className="views kinds">
            {KINDS.map(k => <button type="button" key={k} className={`k-${k} ${(draft.kind ?? 'dev') === k ? 'on' : ''}`} onClick={() => setDraft({ ...draft, kind: k })}>{T(`kind.${k}`)}</button>)}
          </span>
          <input value={draft.note ?? ''} placeholder={T('ev.note')} onChange={e => setDraft({ ...draft, note: e.target.value })} />
          <span className="ev-line">
            <button type="submit" className="on">{T('ev.save')}</button>
            {draft.id && <button type="button" onClick={() => (onRemove(draft.id!), setDraft(null))}>{T('ev.delete')}</button>}
            <button type="button" onClick={() => setDraft(null)}>{T('ev.cancel')}</button>
          </span>
        </form>
      ) : (
        <div tabIndex={0} className="entry" onClick={() => setDraft({ date: shown })}>＋ {T('ev.add')}</div>
      )}
      {picked.length > 0 && <div className="group">SESSIONS <span>{picked.length}</span></div>}
      {picked.map(s => <div tabIndex={0} key={s.id} className="entry" onClick={() => onPick(s.id)}>▸ {new Date(s.mtime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {s.title || T('untitled')}</div>)}
      <div className="group">UPCOMING <span>{next.length}</span></div>
      {next.length ? next.map(e => row(e, true)) : <div className="entry quiet">{T('ev.none')}</div>}
    </div>
  )
}

// The date plate in the corner, as the game HUDs this look comes from keep one.
function Clock({ now }: { now: number }) {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <span className="clock">
      {pad(d.getMonth() + 1)}/{pad(d.getDate())} <b>{DAYS[d.getDay()]}</b> {pad(d.getHours())}:{pad(d.getMinutes())}
    </span>
  )
}
