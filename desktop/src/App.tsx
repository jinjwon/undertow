// The window: projects on top, files on the left, the editor in the middle, Claude Code on the right, the HUD below.
import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { THEMES, THEME_NAMES, defineThemes, type ThemeName } from './themes'
import { baseName, gauge, lastUsedOf, projectsOf, rankProjects, untilReset } from '../../plugins/evoke/hooks/data'

declare global {
  interface Window { evoke: any }
}
const api = window.evoke

type Project = { name: string; path: string }
type Entry = { name: string; path: string; dir: boolean }
type Tab = { path: string; text: string; saved: string; head?: string } // head: a diff tab against the last commit
type Change = { path: string; code: string }
type Hit = { path: string; rel: string; line?: number; col?: number; preview?: string }
type Finder = { mode: 'files' | 'search'; query: string; hits: Hit[]; at: number }
type Usage = { context: number | null; limits: { kind: string; percent: number; resetsAt?: string }[]; usd: number | null }

const LIMITS: Record<string, string> = { five_hour: '5H', seven_day: '7D', spend_limit: 'SPEND' } // same labels as the pane's HUD
const LANGS: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', cjs: 'javascript', mjs: 'javascript', json: 'json', md: 'markdown', css: 'css', html: 'html', py: 'python', sh: 'shell', yml: 'yaml', yaml: 'yaml', glsl: 'cpp', rs: 'rust', go: 'go', swift: 'swift' }
const langOf = (path: string) => LANGS[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'
const MOD = api.platform === 'darwin' ? '⌘' : 'Ctrl+'
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const stored = (): ThemeName => {
  try { const t = localStorage.getItem('theme') as ThemeName; return THEMES[t] ? t : 'tide' } catch { return 'tide' }
}
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
  const [finder, setFinder] = useState<Finder | null>(null)
  const [side, setSide] = useState<'files' | 'git'>('files')
  const [pane, setPane] = useState<'claude' | 'shell'>('claude')
  const [shells, setShells] = useState<string[]>([]) // projects with a shell open; started on first use
  const [resumes, setResumes] = useState<Record<string, string>>({}) // project -> the session its Claude pane resumed
  const [sessions, setSessions] = useState<{ id: string; title: string; mtime: number }[] | null>(null)
  const showPane = (p: 'claude' | 'shell') => {
    setPane(p)
    if (p === 'shell' && root) setShells(was => (was.includes(root) ? was : [...was, root]))
  }
  const [changes, setChanges] = useState<Change[]>([])
  const refreshGit = useCallback(async () => setChanges(root ? await api.status(root) : []), [root])
  useEffect(() => {
    refreshGit()
    window.addEventListener('focus', refreshGit)
    return () => window.removeEventListener('focus', refreshGit)
  }, [refreshGit])
  const openDiff = async (file: string) => {
    const id = `diff:${file}`
    const [head, now] = await Promise.all([api.head(root, file), api.read(file).catch(() => '')])
    setTabs(ts => [...ts.filter(t => t.path !== id), { path: id, text: now, saved: now, head }])
    setActive(id)
  }
  const editorRef = useRef<any>(null)
  const jump = useRef<{ path: string; line: number; col: number } | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])
  const nextTheme = () => setTheme(t => THEME_NAMES[(THEME_NAMES.indexOf(t) + 1) % THEME_NAMES.length])

  const loadProjects = useCallback(async (cwd: string) => {
    const raw = await api.projectsRaw()
    const found: Project[] = projectsOf(raw.claudeJson, raw.home)
    const real = await api.exists(found.map(p => p.path))
    return rankProjects(found.filter((_, i) => real[i]), lastUsedOf(raw.history), cwd).slice(0, 9)
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

  // Start in the project you used last, as the pane's key 1 would.
  useEffect(() => {
    loadProjects('').then(list => {
      setProjects(list)
      if (list[0]) open(list[0].path)
      else setPicker(true)
    })
  }, [])

  useEffect(() => {
    const tick = async () => {
      setUsage(await api.usage())
      setNow(Date.now())
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [])

  const openFile = async (path: string, line?: number, col = 1) => {
    if (line) jump.current = { path, line, col }
    if (!tabs.some(t => t.path === path)) {
      const text = await api.read(path)
      setTabs(t => [...t, { path, text, saved: text }])
    }
    setActive(path)
    if (path === active) reveal()
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
    if (tab && tab.text !== tab.saved && !confirm(`${baseName(path)}: 저장하지 않은 변경을 버릴까요?`)) return
    const rest = tabs.filter(t => t.path !== path)
    setTabs(rest)
    if (active === path) setActive(rest.at(-1)?.path ?? '')
  }

  // Claude Code edits files on disk: tabs without your own unsaved edits follow the disk when you come back to the window.
  useEffect(() => {
    const sync = async () => {
      const fresh = await Promise.all(tabs.map(t => (t.text === t.saved && t.head === undefined ? api.read(t.path).catch(() => t.saved) : t.saved)))
      setTabs(ts => ts.map((t, i) => (t.text === t.saved && fresh[i] !== undefined && fresh[i] !== t.saved ? { ...t, text: fresh[i], saved: fresh[i] } : t)))
    }
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [tabs])

  // Keys 1-9 and Enter pick a project while the picker is open, like the MENU pane's switcher.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        e.stopPropagation()
        setFinder({ mode: 'files', query: '', hits: [], at: 0 })
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        e.stopPropagation()
        setFinder({ mode: 'search', query: '', hits: [], at: 0 })
      } else if (mod && e.key === 'o') {
        e.preventDefault()
        setPicker(p => !p)
      } else if (picker) {
        const n = e.key === 'Enter' ? 1 : Number(e.key)
        if (e.key === 'Escape') setPicker(false)
        else if (n >= 1 && projects[n - 1]) open(projects[n - 1].path)
      }
    }
    window.addEventListener('keydown', key, true) // capture: before Monaco and xterm take the keys
    return () => window.removeEventListener('keydown', key, true)
  }, [picker, projects, open])

  // Quick open ranks on every key; search waits for a pause, since it reads every file.
  useEffect(() => {
    if (!finder || !root) return
    const { mode, query } = finder
    const id = setTimeout(async () => {
      const hits: Hit[] = mode === 'files' ? await api.files(root, query) : await api.search(root, query)
      setFinder(f => (f && f.mode === mode && f.query === query ? { ...f, hits, at: 0 } : f))
    }, mode === 'files' ? 60 : 250)
    return () => clearTimeout(id)
  }, [finder?.mode, finder?.query, root])
  const pickHit = (h?: Hit) => {
    if (!h) return
    setFinder(null)
    openFile(h.path, h.line, h.col)
  }

  const tab = tabs.find(t => t.path === active)
  const save = async (path: string, text: string) => {
    await api.write(path, text)
    setTabs(ts => ts.map(t => (t.path === path ? { ...t, saved: text } : t)))
    refreshGit()
  }
  const live = useRef({ save, root, active })
  live.current = { save, root, active }

  // ⌘S saves; ⌘L hands the selection to Claude Code as an @file reference with its lines.
  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    requestAnimationFrame(reveal)
    // ⌘S formats first when the language has a formatter (TS/JS, JSON, CSS, HTML), as format-on-save does.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const { save, active } = live.current
      if (!active) return
      const format = editor.getAction('editor.action.formatDocument')
      if (format?.isSupported()) await format.run()
      save(active, editor.getValue())
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => {
      const { root, active } = live.current
      const s = editor.getSelection()
      if (!active || !s) return
      const lines = s.isEmpty() ? '' : `#L${s.startLineNumber}${s.endLineNumber > s.startLineNumber ? `-${s.endLineNumber}` : ''}`
      api.pty.write(`claude:${root}`, `@${relative(root, active)}${lines} `)
      document.querySelector<HTMLElement>('.claude.on .xterm-helper-textarea')?.focus()
    })
  }

  return (
    <div className={`app ${api.platform}`}>
      <header className="top">
        <span className="logo"><img src={THEMES[theme].logo} alt="" />EVOKE</span>
        <button className="project" onClick={() => setPicker(true)} title={`${MOD}O`}>
          <Cut label="PROJECT" /> {root ? baseName(root) : '프로젝트를 고른다'}
        </button>
        <span className="branch">{branch && `⎇ ${branch}`}</span>
        <button className="theme" onClick={nextTheme} title="테마 바꾸기"><Cut label={THEMES[theme].label} ground="var(--sel)" /></button>
        <Clock now={now} />
      </header>

      <aside className="side">
        <div className="head sides">
          <button onClick={() => setSide('files')} className={side === 'files' ? 'on' : ''}><Cut label="ITEM" ground={side === 'files' ? 'var(--sel)' : 'var(--mid)'} /></button>
          <button onClick={() => (setSide('git'), refreshGit())} className={side === 'git' ? 'on' : ''}><Cut label={`GIT ${changes.length || ''}`.trim()} ground={side === 'git' ? 'var(--sel)' : 'var(--mid)'} /></button>
        </div>
        {root && side === 'files' && <Tree key={root} dir={root} depth={0} onOpen={openFile} active={active} />}
        {side === 'git' && (changes.length ? changes.map(c => (
          <div key={c.path} className={`entry change ${active === `diff:${c.path}` ? 'on' : ''}`} onClick={() => openDiff(c.path)} title={relative(root, c.path)}>
            <b className={`code c-${c.code.replace('??', 'U')[0]}`}>{c.code.replace('??', 'U')}</b> {baseName(c.path)} <span className="quiet">{relative(root, c.path).slice(0, -baseName(c.path).length)}</span>
          </div>
        )) : <div className="entry quiet">변경 없음</div>)}
      </aside>

      <main className="center">
        <nav className="tabs">
          {tabs.map(t => (
            <div key={t.path} className={`tab ${t.path === active ? 'on' : ''}`} onClick={() => setActive(t.path)} title={t.path}>
              {t.head !== undefined && 'Δ '}{baseName(t.path)}{t.text !== t.saved && ' ●'}
              <span className="x" onClick={e => (e.stopPropagation(), closeTab(t.path))}>×</span>
            </div>
          ))}
        </nav>
        {tab?.head !== undefined ? (
          <DiffEditor
            original={tab.head}
            modified={tab.text}
            language={langOf(tab.path)}
            theme={`evoke-${theme}`}
            beforeMount={defineThemes}
            options={{ readOnly: true, renderSideBySide: true, fontFamily: 'Iosevka, Menlo, Consolas, monospace', fontSize: 13, minimap: { enabled: false } }}
          />
        ) : tab ? (
          <Editor
            path={tab.path}
            language={langOf(tab.path)}
            value={tab.text}
            theme={`evoke-${theme}`}
            beforeMount={defineThemes}
            onMount={onMount}
            onChange={text => setTabs(ts => ts.map(t => (t.path === tab.path ? { ...t, text: text ?? '' } : t)))}
            options={{
              fontFamily: 'Iosevka, Menlo, Consolas, monospace', fontSize: 14, minimap: { enabled: false }, smoothScrolling: true, padding: { top: 12 },
              bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true }, linkedEditing: true, formatOnPaste: true,
            }}
          />
        ) : (
          <div className="empty">
            <img className="mark" src={THEMES[theme].logo} alt="Evoke" />
            <div className="big">EVOKE</div>
            <p>{MOD}P 파일 열기 · {MOD}⇧F 검색 · {MOD}S 저장 · {MOD}L 선택을 Claude에게 · {MOD}O 프로젝트</p>
          </div>
        )}
      </main>

      <section className="right">
        <div className="head sides">
          <button onClick={() => showPane('claude')} className={pane === 'claude' ? 'on' : ''}><Cut label="AGENT" ground={pane === 'claude' ? 'var(--edge)' : 'var(--mid)'} /></button>
          <button onClick={() => showPane('shell')} className={pane === 'shell' ? 'on' : ''}><Cut label="SHELL" ground={pane === 'shell' ? 'var(--edge)' : 'var(--mid)'} /></button>
          {pane === 'claude' && root && <button className="sessions" onClick={async () => setSessions(await api.sessions(root))}>지난 세션</button>}
        </div>
        {opened.map(path => <Claude key={`claude:${path}:${resumes[path] ?? ''}`} kind="claude" resume={resumes[path]} cwd={path} on={pane === 'claude' && path === root} theme={theme} />)}
        {shells.map(path => <Claude key={`shell:${path}`} kind="shell" cwd={path} on={pane === 'shell' && path === root} theme={theme} />)}
      </section>

      <footer className="hud">
        <Meter label="CTX" percent={usage?.context ?? null} />
        {usage?.limits.map(l => <Meter key={l.kind} label={LIMITS[l.kind] ?? l.kind.slice(0, 4).toUpperCase()} percent={l.percent} reset={untilReset(l.resetsAt, now)} />)}
        <span className="usd">{usage?.usd != null ? `$${usage.usd.toFixed(2)}` : ''}</span>
        {!usage && <span className="quiet">사용량은 Evoke 플러그인이 켜진 세션에서 들어온다</span>}
      </footer>

      {finder && (
        <div className="picker" onClick={() => setFinder(null)}>
          <div className="sheet finder" onClick={e => e.stopPropagation()}>
            <div className="head">
              <Cut label={finder.mode === 'files' ? 'FILES' : 'SEARCH'} />
              <input
                autoFocus
                value={finder.query}
                placeholder={finder.mode === 'files' ? '파일 이름' : '프로젝트에서 찾을 글자 (2자 이상)'}
                onChange={e => setFinder({ ...finder, query: e.target.value })}
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
            <div className="hits">
              {finder.hits.map((h, i) => (
                <button key={`${h.path}:${h.line}`} className={`row ${i === finder.at ? 'on' : ''}`} onClick={() => pickHit(h)}>
                  {h.line ? <><b>{h.line}</b> <span className="preview">{h.preview}</span> <span className="quiet">{h.rel}</span></> : <><b>›</b> {baseName(h.rel)} <span className="quiet">{h.rel}</span></>}
                </button>
              ))}
              {finder.query.length >= (finder.mode === 'files' ? 1 : 2) && !finder.hits.length && <div className="row quiet">결과 없음</div>}
            </div>
          </div>
        </div>
      )}

      {sessions && (
        <div className="picker" onClick={() => setSessions(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="head"><Cut label="SESSIONS" /> 이어서 할 대화를 고른다</div>
            {sessions.map(s => (
              <button key={s.id} className="row" onClick={() => (setResumes(r => ({ ...r, [root]: s.id })), setSessions(null), showPane('claude'))}>
                <b>›</b> {s.title || '(제목 없음)'} <span className="quiet">{new Date(s.mtime).toLocaleString()}</span>
              </button>
            ))}
            {!sessions.length && <div className="row quiet">이 프로젝트의 지난 세션이 없다</div>}
          </div>
        </div>
      )}

      {picker && (
        <div className="picker" onClick={() => setPicker(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="head"><Cut label="PROJECTS" /> 1–9 또는 Enter</div>
            {projects.map((p, i) => (
              <button key={p.path} className={`row ${p.path === root ? 'here' : ''}`} onClick={() => open(p.path)}>
                <b>{i + 1}</b> {p.name} <span className="quiet">{p.path}</span>
              </button>
            ))}
            <button className="row" onClick={async () => { const p = await api.pickProject(); if (p) open(p) }}>
              <b>+</b> 다른 폴더를 연다
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Tree({ dir, depth, onOpen, active }: { dir: string; depth: number; onOpen: (p: string) => void; active: string }) {
  const [items, setItems] = useState<Entry[] | null>(null)
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({})
  useEffect(() => {
    api.list(dir).then(setItems, () => setItems([]))
  }, [dir])
  if (!items) return null
  return (
    <>
      {items.map(e => (
        <div key={e.path}>
          <div
            className={`entry ${e.path === active ? 'on' : ''}`}
            style={{ paddingLeft: 12 + depth * 12 }}
            onClick={() => (e.dir ? setOpenDirs(o => ({ ...o, [e.path]: !o[e.path] })) : onOpen(e.path))}
          >
            {e.dir ? (openDirs[e.path] ? '▾ ' : '▸ ') : '  '}{e.name}
          </div>
          {e.dir && openDirs[e.path] && <Tree dir={e.path} depth={depth + 1} onOpen={onOpen} active={active} />}
        </div>
      ))}
    </>
  )
}

// One terminal per project and kind, kept alive while hidden so switching never ends a session.
function Claude({ kind, cwd, on, theme, resume }: { kind: 'claude' | 'shell'; cwd: string; on: boolean; theme: ThemeName; resume?: string }) {
  const id = `${kind}:${cwd}`
  const box = useRef<HTMLDivElement>(null)
  const fit = useRef<FitAddon>()
  const xterm = useRef<Terminal>()
  const [ended, setEnded] = useState<number | null>(null)
  const [run, setRun] = useState(0)

  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'Iosevka, Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      allowTransparency: true,
      theme: { ...THEMES[theme].xterm },
    })
    xterm.current = term
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
      term.dispose()
    }
  }, [id, run])

  useEffect(() => {
    if (xterm.current) xterm.current.options.theme = { ...THEMES[theme].xterm }
  }, [theme])

  useEffect(() => {
    if (on) requestAnimationFrame(() => fit.current?.fit())
  }, [on])

  return (
    <div className={`claude ${on ? 'on' : ''}`}>
      <div ref={box} className="term" />
      {ended !== null && (
        <button className="restart" onClick={() => setRun(r => r + 1)}>세션 종료 ({ended}) · 다시 시작</button>
      )}
    </div>
  )
}

function Meter({ label, percent, reset }: { label: string; percent: number | null; reset?: string }) {
  const cells = percent == null ? 0 : gauge(percent, 10)
  const hot = (percent ?? 0) >= 85
  return (
    <span className="meter">
      <Cut label={label} ground={hot ? 'var(--hot)' : 'var(--mid)'} />
      <span className="bar" style={{ color: hot ? 'var(--hot)' : 'var(--hi)' }}>{'▰'.repeat(cells)}<span className="quiet">{'▱'.repeat(10 - cells)}</span></span>
      {percent == null ? '—' : `${Math.round(percent)}%`}
      {reset && <span className="quiet"> {reset}</span>}
    </span>
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
