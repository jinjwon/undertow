// The window: projects on top, files on the left, the editor in the middle, Claude Code on the right, the HUD below.
import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { THEMES, THEME_NAMES, defineThemes, type ThemeName } from './themes'
import { Pane } from './Pane'
import { LANGS as UI_LANGS, langFrom, tr, type Lang } from './i18n'
import { iconOf, isImage, promptVars } from './text'
import { baseName, lastUsedOf, projectsOf, rank, rankProjects } from '../../plugins/evoke/hooks/data'

declare global {
  interface Window { evoke: any }
}
const api = window.evoke

type Project = { name: string; path: string }
type Entry = { name: string; path: string; dir: boolean }
// head: a diff tab against the last commit; image: a picture shown instead of text; preview: replaced by the next single click, as in VS Code
type Tab = { path: string; text: string; saved: string; head?: string; image?: string; preview?: boolean }
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
const storedLang = (): Lang => {
  try { return langFrom(localStorage.getItem('lang') ?? navigator.language) } catch { return langFrom(navigator.language) }
}
// The badge in front of a file name: its kind in two or three letters, coloured per theme.
const FileIcon = ({ name, dir = false }: { name: string; dir?: boolean }) => {
  const { label, kind } = iconOf(name, dir)
  return <i className={`fi fi-${kind}`} aria-hidden="true">{label}</i>
}
// A thief's domino mask, drawn here (not taken from any game): REBEL's alert and folder mark.
const Mask = () => (
  <svg className="mask" viewBox="0 0 64 28" aria-hidden="true">
    <path d="M2 4 Q16 0 32 9 Q48 0 62 4 Q60 20 46 24 Q36 26 32 17 Q28 26 18 24 Q4 20 2 4Z M12 10 Q18 7 25 12 Q19 16 12 10Z M39 12 Q46 7 52 10 Q45 16 39 12Z" fillRule="evenodd" />
  </svg>
)
// Text typed into a terminal for you: no control characters, so a file or skill name can never press Enter or send keys.
const typed = (text: string) => text.replace(/[\x00-\x1f\x7f]/g, '')
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
  const T = (key: Parameters<typeof tr>[1], vars?: Record<string, string | number>) => tr(lang, key, vars)
  const [finder, setFinder] = useState<Finder | null>(null)
  const [menu, setMenu] = useState('ITEM')
  const [skills, setSkills] = useState<{ name: string; description: string; plugin: string; uses: number }[]>([])
  const [equip, setEquip] = useState<{ mcp: string[]; plugins: string[] }>({ mcp: [], plugins: [] })
  const [quests, setQuests] = useState<Hit[] | null>(null)
  const [day, setDay] = useState<string | null>(null) // CALENDAR: the day whose sessions are listed
  const [toast, setToast] = useState('')
  const warned = useRef(new Set<string>())
  const [pane, setPane] = useState<'claude' | 'shell'>('claude')
  const [shells, setShells] = useState<string[]>([]) // projects with a shell open; started on first use
  const [resumes, setResumes] = useState<Record<string, string>>({}) // project -> the session its Claude pane resumed
  const [sessions, setSessions] = useState<{ id: string; title: string; mtime: number }[]>([])
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
  // Each menu loads what it shows when you open it, as the pane's menus refresh on entry.
  useEffect(() => {
    if (!root) return
    if (menu === 'SKILL') api.skills().then(setSkills)
    if (menu === 'EQUIP') api.equip(root).then(setEquip)
    if (menu === 'AGENT' || menu === 'CALENDAR') api.sessions(root).then(setSessions)
    if (menu === 'STATUS') refreshGit()
    if (menu === 'QUEST') (setQuests(null), api.search(root, 'TODO').then(setQuests))
  }, [menu, root])
  const say = (text: string) => {
    api.pty.write(`claude:${root}`, typed(text))
    showPane('claude')
    document.querySelector<HTMLElement>('.claude.on .xterm-helper-textarea')?.focus()
  }
  const resume = (id: string) => (setResumes(r => ({ ...r, [root]: id })), showPane('claude'))

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
  const jump = useRef<{ path: string; line: number; col: number } | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])
  useEffect(() => {
    document.documentElement.lang = lang
    try { localStorage.setItem('lang', lang) } catch {}
  }, [lang])
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
      setUsage(await api.usage())
      setNow(Date.now())
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [])

  // A single click previews (the tab is replaced by the next preview); a double click, an edit or a jump keeps it.
  const openFile = async (path: string, line?: number, col = 1, keep = Boolean(line)) => {
    if (line) jump.current = { path, line, col }
    const had = tabs.find(t => t.path === path)
    if (!had) {
      const image = isImage(path) ? await api.image(path).catch(() => '') : undefined
      const text = image === undefined ? await api.read(path).catch(() => '') : ''
      setTabs(ts => [...ts.filter(t => keep || !(t.preview && t.text === t.saved)), { path, text, saved: text, image, preview: !keep }])
    } else if (keep && had.preview) setTabs(ts => ts.map(t => (t.path === path ? { ...t, preview: false } : t)))
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
    if (tab && tab.text !== tab.saved && !confirm(T('discard', { name: baseName(path) }))) return
    const rest = tabs.filter(t => t.path !== path)
    setTabs(rest)
    if (active === path) setActive(rest.at(-1)?.path ?? '')
  }

  // Claude Code edits files on disk: tabs without your own unsaved edits follow the disk when you come back to the window.
  useEffect(() => {
    const sync = async () => {
      const fresh = await Promise.all(tabs.map(t => (t.text === t.saved && t.head === undefined && t.image === undefined ? api.read(t.path).catch(() => t.saved) : t.saved)))
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
      const { root, active } = live.current
      const s = editor.getSelection()
      if (!active || !s) return
      const lines = s.isEmpty() ? '' : `#L${s.startLineNumber}${s.endLineNumber > s.startLineNumber ? `-${s.endLineNumber}` : ''}`
      api.pty.write(`claude:${root}`, typed(`@${relative(root, active)}${lines} `))
      document.querySelector<HTMLElement>('.claude.on .xterm-helper-textarea')?.focus()
    })
  }

  return (
    <div className={`app ${api.platform}`}>
      <header className="top">
        <span className="logo"><img src={THEMES[theme].logo} alt="" />EVOKE</span>
        <button className="project" onClick={() => setPicker(true)} title={`${MOD}O`}>
          <Cut label="PROJECT" /> {root ? baseName(root) : T('pickProject')}
        </button>
        <span className="branch">{branch && `⎇ ${branch}`}</span>
        <button className="theme" onClick={nextTheme} title={T('theme')}><Cut label={THEMES[theme].label} ground="var(--sel)" /></button>
        <button className="gear" onClick={() => setSettings(true)} title={T('settings')} aria-label={T('settings')}>⚙</button>
        <Clock now={now} />
      </header>

      <Pane menu={menu} onMenu={setMenu} usage={usage} now={now} hint={T(`hint.${menu}` as Parameters<typeof tr>[1])}>
        {menu === 'ITEM' && root && <Tree key={root} dir={root} depth={0} onOpen={openFile} active={active} />}
        {menu === 'STATUS' && (changes.length ? changes.map(c => (
          <div key={c.path} className={`entry change ${active === `diff:${c.path}` ? 'on' : ''}`} onClick={() => openDiff(c.path)} title={relative(root, c.path)}>
            <b className={`code c-${c.code.replace('??', 'U')[0]}`}>{c.code.replace('??', 'U')}</b> {baseName(c.path)} <span className="quiet">{relative(root, c.path).slice(0, -baseName(c.path).length)}</span>
          </div>
        )) : <div className="entry quiet">{branch ? T('noChanges', { branch }) : T('noGit')}</div>)}
        {menu === 'SKILL' && skills.map(s => (
          <div key={s.name} className="entry skill" onClick={() => say(`/${s.name} `)} title={s.description}>
            <span>▸ {s.name}</span> {s.uses > 0 && <b className="rank">{rank(s.uses)}</b>}
            <div className="desc">{s.description}</div>
          </div>
        ))}
        {menu === 'EQUIP' && (
          <>
            <div className="group">MCP <span>{equip.mcp.length}</span></div>
            {equip.mcp.length ? equip.mcp.map(m => <div key={m} className="entry">◆ {m}</div>) : <div className="entry quiet">{T('noMcp')}</div>}
            <div className="group">PLUGINS <span>{equip.plugins.length}</span></div>
            {equip.plugins.map(m => <div key={m} className="entry">◆ {m}</div>)}
          </>
        )}
        {menu === 'AGENT' && (
          <>
            {sessions.slice(0, 10).map(s => (
              <div key={s.id} className="entry" onClick={() => resume(s.id)}>▸ {s.title || T('untitled')} <div className="desc">{new Date(s.mtime).toLocaleString()}</div></div>
            ))}
            {!sessions.length && <div className="entry quiet">{T('noSessions')}</div>}
          </>
        )}
        {menu === 'QUEST' && (quests === null ? <div className="entry quiet">{T('searching')}</div> : quests.length ? quests.map(q => (
          <div key={`${q.path}:${q.line}`} className="entry" onClick={() => openFile(q.path, q.line, q.col)}>▸ {q.preview} <div className="desc">{q.rel}:{q.line}</div></div>
        )) : <div className="entry quiet">{T('noTodo')}</div>)}
        {menu === 'LINK' && (
          <>
            {projects.map((p, i) => (
              <div key={p.path} className={`entry ${p.path === root ? 'on' : ''}`} onClick={() => open(p.path)}><b className="rank">{i + 1}</b> {p.name} <div className="desc">{p.path}</div></div>
            ))}
            <div className="entry" onClick={openFolder}>{T('openOther')}</div>
          </>
        )}
        {menu === 'CALENDAR' && <Calendar now={now} sessions={sessions} day={day} onDay={setDay} onPick={resume} talks={n => T('talks', { n })} />}
        {menu === 'SYSTEM' && (
          <>
            <div className="group">{T('theme')}</div>
            {THEME_NAMES.map(t => <div key={t} className={`entry ${t === theme ? 'on' : ''}`} onClick={() => setTheme(t)}>◆ {THEMES[t].label}</div>)}
            <div className="group">{T('language')}</div>
            {UI_LANGS.map(l => <div key={l.id} className={`entry ${l.id === lang ? 'on' : ''}`} onClick={() => setLang(l.id)}>◆ {l.label}</div>)}
            <div className="group">{T('keys')}</div>
            {(['P', 'F', 'S', 'L', 'O'] as const).map(k => <div key={k} className="entry"><b className="rank">{MOD}{k === 'F' ? '⇧F' : k}</b> {T(`key.${k}`)}</div>)}
          </>
        )}
      </Pane>

      <main className="center">
        <nav className="tabs">
          {tabs.map(t => (
            <div key={t.path} className={`tab ${t.path === active ? 'on' : ''} ${t.preview ? 'preview' : ''}`} onClick={() => setActive(t.path)} onDoubleClick={() => openFile(t.path, undefined, 1, true)} title={t.preview ? `${T('preview')}: ${t.path}` : t.path}>
              <FileIcon name={t.path} />{t.head !== undefined && 'Δ '}{baseName(t.path)}{t.text !== t.saved && ' ●'}
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
        ) : tab?.image !== undefined ? (
          <div className="image-view">{tab.image ? <img src={tab.image} alt={baseName(tab.path)} /> : <p className="quiet">{T('binary')}</p>}</div>
        ) : tab ? (
          <Editor
            path={tab.path}
            language={langOf(tab.path)}
            value={tab.text}
            theme={`evoke-${theme}`}
            beforeMount={defineThemes}
            onMount={onMount}
            onChange={text => setTabs(ts => ts.map(t => (t.path === tab.path ? { ...t, text: text ?? '', preview: false } : t)))}
            options={{
              fontFamily: 'Iosevka, Menlo, Consolas, monospace', fontSize: 14, minimap: { enabled: true, renderCharacters: false, scale: 1 }, smoothScrolling: true, padding: { top: 12 },
              bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true }, linkedEditing: true, formatOnPaste: true,
            }}
          />
        ) : (
          <div className="empty">
            <img className="mark" src={THEMES[theme].logo} alt="Evoke" />
            <div className="big">EVOKE</div>
            {root ? (
              <p>{T('emptyHint', { mod: MOD })}</p>
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

      <section className="right">
        <div className="head sides">
          <button onClick={() => showPane('claude')} className={pane === 'claude' ? 'on' : ''}><Cut label="CLAUDE" ground={pane === 'claude' ? 'var(--edge)' : 'var(--mid)'} /></button>
          <button onClick={() => showPane('shell')} className={pane === 'shell' ? 'on' : ''}><Cut label="SHELL" ground={pane === 'shell' ? 'var(--edge)' : 'var(--mid)'} /></button>
        </div>
        {opened.map(path => <Claude key={`claude:${path}:${resumes[path] ?? ''}`} kind="claude" resume={resumes[path]} cwd={path} on={pane === 'claude' && path === root} theme={theme} endedLabel={code => T('ended', { code })} />)}
        {shells.map(path => <Claude key={`shell:${path}`} kind="shell" cwd={path} on={pane === 'shell' && path === root} theme={theme} endedLabel={code => T('ended', { code })} />)}
      </section>

      {/* The status band, as above the terminal's prompt. */}
      <footer className="hud">
        <Cut label={menu} ground="var(--chip)" />
        <b className="band">{root ? baseName(root) : '—'}</b>{branch && <i className="quiet"> / {branch}</i>}
        <span className="quiet">{T('changes', { n: changes.length })}</span>
        {!usage && <span className="quiet usd">{T('noUsage')}</span>}
      </footer>
      {toast && <div className="toast" role="alert"><Mask /><Cut label="ALERT" /> {toast}</div>}

      {finder && (
        <div className="picker" onClick={() => setFinder(null)}>
          <div className="sheet finder" onClick={e => e.stopPropagation()}>
            <div className="head">
              <Cut label={finder.mode === 'files' ? 'FILES' : 'SEARCH'} />
              <input
                autoFocus
                value={finder.query}
                placeholder={finder.mode === 'files' ? T('fileName') : T('searchText')}
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
                  {h.line ? <><b>{h.line}</b> <span className="preview">{h.preview}</span> <span className="quiet">{h.rel}</span></> : <><FileIcon name={h.rel} /> {baseName(h.rel)} <span className="quiet">{h.rel}</span></>}
                </button>
              ))}
              {finder.query.length >= (finder.mode === 'files' ? 1 : 2) && !finder.hits.length && <div className="row quiet">{T('noResults')}</div>}
            </div>
          </div>
        </div>
      )}

      {settings && (
        <div className="picker" onClick={() => setSettings(false)}>
          <div className="sheet settings" onClick={e => e.stopPropagation()}>
            <div className="head"><Cut label="SETTINGS" /> {T('settings')}</div>
            <div className="group">{T('theme')}</div>
            {THEME_NAMES.map(t => <button key={t} className={`row ${t === theme ? 'on' : ''}`} onClick={() => setTheme(t)}><b>◆</b> {THEMES[t].label}</button>)}
            <div className="group">{T('language')}</div>
            {UI_LANGS.map(l => <button key={l.id} className={`row ${l.id === lang ? 'on' : ''}`} onClick={() => setLang(l.id)}><b>◆</b> {l.label}</button>)}
          </div>
        </div>
      )}

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
  if (!items) return null
  return (
    <>
      {items.map(e => (
        <div key={e.path}>
          <div
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

// One terminal per project and kind, kept alive while hidden so switching never ends a session.
function Claude({ kind, cwd, on, theme, resume, endedLabel }: { kind: 'claude' | 'shell'; cwd: string; on: boolean; theme: ThemeName; resume?: string; endedLabel: (code: number) => string }) {
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
        <button className="restart" onClick={() => setRun(r => r + 1)}>{endedLabel(ended)}</button>
      )}
    </div>
  )
}

// CALENDAR: this month, with a mark on each day you talked to Claude in this project.
function Calendar({ now, sessions, day, onDay, onPick, talks }: { now: number; sessions: { id: string; title: string; mtime: number }[]; day: string | null; onDay: (d: string) => void; onPick: (id: string) => void; talks: (n: number) => string }) {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = d.getMonth()
  const keyOf = (t: number) => new Date(t).toDateString()
  const count = new Map<string, number>()
  for (const s of sessions) count.set(keyOf(s.mtime), (count.get(keyOf(s.mtime)) ?? 0) + 1)
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const picked = sessions.filter(s => keyOf(s.mtime) === day)
  return (
    <div className="calendar">
      <div className="group">{y}.{String(m + 1).padStart(2, '0')}</div>
      <div className="month">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <i key={i}>{w}</i>)}
        {Array.from({ length: first }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const k = new Date(y, m, i + 1).toDateString()
          const n = count.get(k) ?? 0
          return (
            <button key={k} className={`${n ? 'has' : ''} ${k === day ? 'on' : ''} ${k === d.toDateString() ? 'today' : ''}`} onClick={() => onDay(k)} title={n ? talks(n) : ''}>
              {i + 1}
            </button>
          )
        })}
      </div>
      {picked.map(s => <div key={s.id} className="entry" onClick={() => onPick(s.id)}>▸ {s.title || new Date(s.mtime).toLocaleTimeString()}</div>)}
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
