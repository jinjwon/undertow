// The main process: one window, and the file, git, usage and terminal access the window asks for.
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const pty = require('node-pty')
const { startIde } = require('./ide.cjs')
const { createStore } = require('./store.cjs')
const { claudeLimitsOf, codexLimitsOf, statusLineOf, usageFromStatus, contextOf, usesOf, codexTrusted, sshHosts, inside, latestUsage, trusted, isSessionId, slugOf, titleOf, frontOf, pluginsOf, mcpOf, sendTo } = require('./paths.cjs')
const { start: startPreview } = require('./serve.cjs')
const { walkSkip, fuzzy, searchText, parseStatus } = require('./match.cjs')

const home = os.homedir()
const roots = new Set() // real paths of the folders the window has opened; file access stays inside them
const picked = new Set() // folders you chose in the open dialog
const claudeJson = () => fs.readFile(path.join(home, '.claude.json'), 'utf8').catch(() => '{}')
const codexToml = () => fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8').catch(() => '')
const terms = new Map() // one Claude Code session per project, kept while you switch
let win
const store = createStore(path.join(app.getPath('userData'), 'store'))
// The page reads every setting once, synchronously, before it draws; writes come back one at a time.
ipcMain.on('store:load', e => { e.returnValue = store.snapshot() })
ipcMain.on('store:set', (_, key, value) => { store.set(key, value).catch(() => {}) })

const allowed = target => [...roots].some(root => inside(root, target))
// Real path, so a symlink inside a project cannot reach a file outside it.
const guard = async target => {
  if (!allowed(await fs.realpath(target))) throw new Error(`Outside the open projects: ${target}`)
  return target
}

ipcMain.handle('projects:raw', async () => ({
  home,
  claudeJson: await claudeJson(),
  history: await fs.readFile(path.join(home, '.claude', 'history.jsonl'), 'utf8').catch(() => ''),
  codexProjects: [...codexTrusted(await codexToml())], // so someone who only uses Codex still gets a project list
}))
ipcMain.handle('projects:exists', (_, paths) =>
  Promise.all(paths.map(p => fs.stat(p).then(s => s.isDirectory(), () => false))),
)
ipcMain.handle('project:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  if (canceled) return null
  picked.add(path.resolve(filePaths[0]))
  return filePaths[0]
})
// The window may only open what Claude Code or Codex trusts, or what you picked, so a bug in the page cannot widen file access.
ipcMain.handle('project:open', async (_, root) => {
  const at = path.resolve(String(root))
  const known = picked.has(at) || trusted(await claudeJson()).has(at.normalize('NFC')) || codexTrusted(await codexToml()).has(at.normalize('NFC'))
  if (!known) throw new Error(`Not a known project: ${at}`)
  roots.add(await fs.realpath(at))
  ide?.refresh().catch(() => {}) // Claude Code matches its folder against the lock file's
  return at
})

ipcMain.handle('fs:list', async (_, dir) => {
  const entries = await fs.readdir(await guard(dir), { withFileTypes: true })
  return entries
    .filter(e => e.name !== '.git' && e.name !== '.DS_Store')
    .map(e => ({ name: e.name, path: path.join(dir, e.name), dir: e.isDirectory() }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
})
// Every file of a project, skipping build and dependency folders; symlinks are not followed, so the walk stays inside.
const listFiles = async root => {
  const out = []
  const dirs = [root]
  while (dirs.length && out.length < 20000) {
    const dir = dirs.pop()
    for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) walkSkip(e.name) || dirs.push(path.join(dir, e.name))
      else if (e.isFile()) out.push(path.join(dir, e.name))
    }
  }
  return out
}
const walks = new Map() // root -> { at, files }: quick open asks on every key, so one walk serves ten seconds
const filesOf = async root => {
  const seen = walks.get(root)
  if (seen && Date.now() - seen.at < 10000) return seen.files
  const files = await listFiles(root)
  walks.set(root, { at: Date.now(), files })
  return files
}
// Ranked here, next to the file list, so the window gets 50 rows instead of 20000 paths.
ipcMain.handle('fs:files', async (_, root, query) => {
  await guard(root)
  return (await filesOf(root))
    .map(file => ({ path: file, rel: path.relative(root, file) }))
    .map(f => ({ ...f, score: fuzzy(String(query), f.rel) }))
    .filter(f => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
})
ipcMain.handle('fs:search', async (_, root, query) => {
  await guard(root)
  const q = String(query)
  if (q.length < 2) return []
  const hits = []
  for (const file of await filesOf(root)) {
    if (hits.length >= 500) break
    const stat = await fs.stat(file).catch(() => null)
    if (!stat || stat.size > 1e6) continue
    const text = await fs.readFile(file, 'utf8').catch(() => '')
    for (const h of searchText(text, q, 500 - hits.length)) hits.push({ path: file, rel: path.relative(root, file), ...h })
  }
  return hits
})
ipcMain.handle('fs:read', async (_, file) => fs.readFile(await guard(file), 'utf8'))
// Images for the preview tab, as a data URL the page's CSP allows (img-src data:).
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }
ipcMain.handle('fs:image', async (_, file) => {
  const type = IMAGE_TYPES[path.extname(String(file)).slice(1).toLowerCase()]
  if (!type) throw new Error(`Not an image: ${file}`)
  const stat = await fs.stat(await guard(file))
  if (stat.size > 20e6) throw new Error(`Image too large: ${file}`)
  return `data:${type};base64,${(await fs.readFile(file)).toString('base64')}`
})
// Previews: one loopback server for every open project, started with the first preview (see serve.cjs).
let preview // a promise, so two first previews share one server
let previewBase = '' // http://127.0.0.1:<port>/t/<secret>/ once it runs
const watchers = new Map() // root -> its watcher; a change reloads the open preview pages
let reloadTimer
const reloadSoon = () => {
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => preview?.then(p => p.changed()), 150)
}
ipcMain.handle('preview:url', async (_, file) => {
  const real = await fs.realpath(await guard(file))
  preview ??= startPreview({ roots: () => [...roots], guard, markdown: text => require('marked').marked.parse(text) })
  const server = await preview
  previewBase = `http://127.0.0.1:${server.port}/t/${server.token}/`
  const url = server.urlOf(real)
  if (!url) throw new Error(`Outside the open projects: ${file}`)
  const root = [...roots].find(r => inside(r, real))
  if (!watchers.has(root)) {
    // Git's own files and installed packages change in bursts that no preview shows.
    watchers.set(root, require('node:fs').watch(root, { recursive: true }, (_event, name) => /(^|[\\/])(\.git|node_modules)([\\/]|$)/.test(String(name)) || reloadSoon()))
  }
  return url
})
// The same page in the real browser. Only this server's own addresses are handed to the system.
ipcMain.on('preview:open', (_, url) => {
  if (previewBase && String(url).startsWith(previewBase)) shell.openExternal(String(url))
})

ipcMain.handle('fs:write', async (_, file, text) => fs.writeFile(await guard(file), String(text), 'utf8'))

ipcMain.handle('git:branch', async (_, root) => {
  await guard(root)
  return new Promise(resolve => execFile('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], (err, out) => resolve(err ? '' : out.trim())))
})

const git = (root, args) =>
  new Promise(resolve => execFile('git', ['-C', root, ...args], { maxBuffer: 16e6 }, (err, out) => resolve(err ? null : out)))
ipcMain.handle('git:status', async (_, root) => {
  await guard(root)
  const out = await git(root, ['status', '--porcelain=v1', '-z', '-uall'])
  return out == null ? [] : parseStatus(out).map(c => ({ ...c, path: path.join(root, c.path) }))
})
// The file as of the last commit: '' for a new file. A deleted file has no real path, so this checks the name only.
ipcMain.handle('git:head', async (_, root, file) => {
  await guard(root)
  if (!inside(root, String(file))) throw new Error(`Outside the project: ${file}`)
  const rel = path.relative(root, String(file)).split(path.sep).join('/')
  return (await git(root, ['show', `HEAD:${rel}`])) ?? ''
})

// SKILL: your own skills and those of enabled plugins, with how often the Evoke plugin saw each used.
const readFrom = file => fs.readFile(file, 'utf8').catch(() => '')
const skillsIn = async (dir, plugin) => {
  const names = await fs.readdir(dir).catch(() => [])
  const found = await Promise.all(names.map(async n => ({ ...frontOf(await readFrom(path.join(dir, n, 'SKILL.md'))), folder: n })))
  return found.filter(s => s.name || s.description).map(s => ({ name: plugin ? `${plugin}:${s.name || s.folder}` : s.name || s.folder, description: s.description, plugin }))
}
ipcMain.handle('skills:list', async () => {
  const plugins = pluginsOf(await readFrom(path.join(home, '.claude', 'plugins', 'installed_plugins.json')), await readFrom(path.join(home, '.claude', 'settings.json')))
  const lists = await Promise.all([skillsIn(path.join(home, '.claude', 'skills'), ''), ...plugins.map(p => skillsIn(path.join(p.path, 'skills'), p.name))])
  const store = path.join(home, '.claude', 'plugins', 'store')
  const uses = usesOf(await readFrom(path.join(home, '.claude', 'history.jsonl')))
  for (const n of (await fs.readdir(store).catch(() => [])).filter(n => n.startsWith('evoke_'))) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(await readFrom(path.join(store, n))).uses ?? {})) uses[k] = Math.max(uses[k] ?? 0, Number(v) || 0)
    } catch {}
  }
  return lists.flat().map(s => ({ ...s, uses: uses[s.name] ?? 0 })).sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
})
// EQUIP: what Claude Code carries into this project.
ipcMain.handle('equip:list', async (_, root) => ({
  mcp: mcpOf(await claudeJson(), String(root)),
  plugins: pluginsOf(await readFrom(path.join(home, '.claude', 'plugins', 'installed_plugins.json')), await readFrom(path.join(home, '.claude', 'settings.json'))).map(p => p.name),
}))

// The HUD's usage, from the first source that has it:
// 1. the status line JSON of sessions Evoke started (see pty:spawn): context, 5-hour and 7-day limits and cost, no plugin needed;
// 2. the Evoke plugin's store file, when the plugin is on;
// 3. the context from the end of the project's newest transcript (limits stay empty).
const usageDir = path.join(app.getPath('userData'), 'usage')
const lastGood = new Map() // file -> its last whole reading, for a tick that catches Claude Code mid-write
const statusUsage = async root => {
  const names = (await fs.readdir(usageDir).catch(() => [])).filter(n => n.endsWith('.json'))
  const found = []
  for (const n of names) {
    const file = path.join(usageDir, n)
    const [stat, text] = await Promise.all([fs.stat(file), fs.readFile(file, 'utf8')]).catch(() => [null, ''])
    const u = (stat && usageFromStatus(text)) ?? lastGood.get(file)
    if (!stat || !u) continue
    lastGood.set(file, u)
    found.push({ ...u, mtime: stat.mtimeMs })
  }
  found.sort((a, b) => b.mtime - a.mtime)
  if (!found.length) return null
  const here = root ? found.find(u => u.project && inside(root, u.project)) : found[0]
  // Limits belong to the account, so the newest reading from any session counts.
  return { context: here?.context ?? null, usd: here?.usd ?? null, limits: found.find(u => u.limits.length)?.limits ?? [] }
}
const transcriptContext = async root => {
  const dir = path.join(home, '.claude', 'projects', slugOf(path.resolve(root)))
  const names = (await fs.readdir(dir).catch(() => [])).filter(n => n.endsWith('.jsonl') && isSessionId(n.slice(0, -6)))
  const found = await Promise.all(names.map(async n => ({ file: path.join(dir, n), mtime: (await fs.stat(path.join(dir, n))).mtimeMs })))
  const newest = found.sort((a, b) => b.mtime - a.mtime)[0]
  if (!newest) return null
  const handle = await fs.open(newest.file)
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, 262144)
    const { buffer } = await handle.read(Buffer.alloc(length), 0, length, size - length)
    return contextOf(buffer.toString('utf8'))
  } finally { await handle.close() }
}
// Account limits before any work, read with the tokens Claude Code and Codex already keep on this machine.
// The tokens stay inside these functions: never logged, never stored, never sent to the page, and sent only to
// their own vendor's fixed address with redirects refused. An expired token is skipped, not refreshed, so the
// CLIs' own sign-in is never disturbed. Only the percentages and reset times are kept, in usage/account.json.
const ACCOUNT_TTL = 120_000
const accountFile = path.join(usageDir, 'account.json')
let account = { at: 0, limits: [] }
const getJson = async (url, headers) => {
  const res = await fetch(url, { headers: { ...headers, 'User-Agent': 'evoke-desktop' }, redirect: 'error', signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`) // the status only: never the request
  return res.json()
}
const claudeToken = async () => {
  const raw = process.platform === 'darwin'
    ? await new Promise(done => execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 5000 }, (e, out) => done(e ? '' : out)))
    : await readFrom(path.join(home, '.claude', '.credentials.json'))
  let oauth
  try { oauth = JSON.parse(raw)?.claudeAiOauth } catch { return null }
  if (typeof oauth?.accessToken !== 'string' || (Number.isFinite(oauth.expiresAt) && oauth.expiresAt < Date.now())) return null
  return oauth.accessToken
}
const claudeAccount = async () => {
  const token = await claudeToken()
  if (!token) return []
  return claudeLimitsOf(await getJson('https://api.anthropic.com/api/oauth/usage', { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }))
}
const codexAccount = async () => {
  let auth
  try { auth = JSON.parse(await readFrom(path.join(home, '.codex', 'auth.json'))) } catch { return [] }
  const { access_token: token, account_id: id } = auth?.tokens ?? {}
  if (typeof token !== 'string' || typeof id !== 'string') return [] // an API key has no plan limits to show
  return codexLimitsOf(await getJson('https://chatgpt.com/backend-api/wham/usage', { Authorization: `Bearer ${token}`, 'ChatGPT-Account-Id': id }))
}
const accountLimits = async () => {
  if (Date.now() - account.at < ACCOUNT_TTL) return account.limits
  account.at = Date.now()
  const [claude, codex] = await Promise.all([claudeAccount().catch(() => []), codexAccount().catch(() => [])])
  const fresh = [...claude, ...codex]
  if (fresh.length) {
    account.limits = fresh
    await fs.mkdir(usageDir, { recursive: true })
    await fs.writeFile(accountFile, JSON.stringify({ at: account.at, limits: fresh }), { mode: 0o600 }).catch(() => {})
  } else if (!account.limits.length) {
    // Offline or signed out: the last numbers we had, marked as old, rather than nothing.
    try { account.limits = (JSON.parse(await fs.readFile(accountFile, 'utf8')).limits ?? []).filter(l => typeof l?.kind === 'string' && Number.isFinite(l?.percent)).map(l => ({ kind: l.kind, percent: l.percent, ...(typeof l.resetsAt === 'string' ? { resetsAt: l.resetsAt } : {}), stale: true })) } catch {}
  }
  return account.limits
}

// Usage for the strip: the account's limits when they could be read, then whatever the session itself reports.
ipcMain.handle('usage:get', async (_, root) => {
  const [local, limits] = await Promise.all([localUsage(root), accountLimits()])
  if (!limits.length) return local
  const known = new Set(limits.map(l => l.kind))
  return { context: local?.context ?? null, usd: local?.usd ?? null, limits: [...limits, ...(local?.limits ?? []).filter(l => !known.has(l.kind))] }
})
const localUsage = async root => {
  if (root) await guard(root)
  const status = await statusUsage(root)
  if (status && (status.context !== null || status.limits.length)) {
    if (status.context === null && root) status.context = await transcriptContext(root)
    return status
  }
  const plugins = pluginsOf(await readFrom(path.join(home, '.claude', 'plugins', 'installed_plugins.json')), await readFrom(path.join(home, '.claude', 'settings.json')))
  if (plugins.some(p => p.name === 'evoke')) {
    const dir = path.join(home, '.claude', 'plugins', 'store')
    const names = (await fs.readdir(dir).catch(() => [])).filter(n => n.startsWith('evoke_') && n.endsWith('.json'))
    const files = await Promise.all(
      names.map(async n => {
        const file = path.join(dir, n)
        const [stat, text] = await Promise.all([fs.stat(file), fs.readFile(file, 'utf8')])
        return { mtime: stat.mtimeMs, text }
      }),
    )
    return latestUsage(files)
  }
  if (!root) return null
  const context = await transcriptContext(root)
  return context === null ? null : { context, limits: [], usd: null }
}

// Past Claude Code sessions of a project, newest first, named by their first prompt.
ipcMain.handle('sessions:list', async (_, root) => {
  await guard(root)
  const dir = path.join(home, '.claude', 'projects', slugOf(path.resolve(root)))
  const names = (await fs.readdir(dir).catch(() => [])).filter(n => n.endsWith('.jsonl') && isSessionId(n.slice(0, -6)))
  const found = await Promise.all(names.map(async n => ({ id: n.slice(0, -6), file: path.join(dir, n), mtime: (await fs.stat(path.join(dir, n))).mtimeMs })))
  // All of them for the calendar; only the newest ten are opened for a title.
  const newest = found.sort((a, b) => b.mtime - a.mtime).slice(0, 200)
  return Promise.all(newest.map(async (s, i) => {
    if (i >= 10) return { id: s.id, mtime: s.mtime, title: '' }
    const handle = await fs.open(s.file)
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(262144), 0, 262144, 0).finally(() => handle.close())
    return { id: s.id, mtime: s.mtime, title: titleOf(buffer.subarray(0, bytesRead).toString('utf8')) }
  }))
})

// Claude Code, Codex, or a plain shell, in a login shell so it finds the same PATH as your terminal does when the app starts from Finder.
const knownHosts = async () => sshHosts(await readFrom(path.join(home, '.ssh', 'config')))
ipcMain.handle('ssh:hosts', knownHosts)
ipcMain.handle('pty:spawn', async (_, id, cwd, cols, rows, kind, resume) => {
  if (!['claude', 'codex', 'shell', 'ssh'].includes(kind)) throw new Error(`Unknown terminal: ${kind}`)
  const again = kind === 'claude' && isSessionId(resume) // only a UUID reaches the command line
  if (terms.has(id) && !again) return
  // An ssh terminal has no folder: cwd carries the host, and only one named in ~/.ssh/config reaches the command line.
  const remote = kind === 'ssh'
  if (!remote) await guard(cwd)
  else if (!(await knownHosts()).includes(cwd)) throw new Error(`Not a host in ~/.ssh/config: ${cwd}`)
  if (again) {
    terms.get(id)?.kill()
    terms.delete(id)
  }
  const windows = process.platform === 'win32'
  const claude = kind === 'codex' ? 'codex' : again ? `claude --resume ${resume}` : 'claude' // the agent's command line: Claude Code or Codex
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  // Claude Code's status line feeds the HUD (see usage:get). The settings ride on --settings, so your own settings file is never touched.
  // shortcut: macOS and Linux only; Windows' cmd.exe line would need its own quoting, so Windows keeps the transcript fallback.
  let settings = ''
  if (kind === 'claude' && !windows) {
    const extra = path.join(app.getPath('userData'), 'claude-statusline.json')
    await fs.writeFile(extra, JSON.stringify({ statusLine: { type: 'command', command: statusLineOf(await readFrom(path.join(home, '.claude', 'settings.json'))) } }))
    await fs.mkdir(usageDir, { recursive: true })
    env.EVOKE_USAGE_FILE = path.join(usageDir, `${slugOf(cwd)}.json`)
    settings = ` --settings '${extra.replace(/'/g, "'\\''")}'`
  }
  const [file, args] =
    remote ? [windows ? 'ssh.exe' : 'ssh', [cwd]]
    : kind === 'shell'
      ? windows ? ['powershell.exe', ['-NoLogo']] : [process.env.SHELL || '/bin/zsh', ['-il']]
      : windows ? ['cmd.exe', ['/c', ...claude.split(' ')]] : [process.env.SHELL || '/bin/zsh', ['-ilc', claude + settings]]
  // Claude Code connects to the editor through these, as it does in VS Code's terminal.
  if (kind === 'claude' && ide) Object.assign(env, { CLAUDE_CODE_SSE_PORT: String(ide.port), ENABLE_IDE_INTEGRATION: 'true' })
  delete env.TERM_PROGRAM // xterm.js draws no images: the Evoke pane falls back to plain rows
  const term = pty.spawn(file, args, { name: 'xterm-256color', cwd: remote ? home : cwd, cols, rows, env })
  terms.set(id, term)
  term.onData(data => sendTo(win, `pty:data:${id}`, data))
  term.onExit(({ exitCode }) => {
    if (terms.get(id) !== term) return // a resumed session replaced this one
    terms.delete(id)
    sendTo(win, `pty:exit:${id}`, exitCode)
  })
})
// The chat panel: Claude Code in print mode, one process per project. It prints one JSON event per line and reads the same;
// a tool that needs permission arrives as a question, and the window's answer goes back on stdin.
const chats = new Map()
ipcMain.handle('chat:send', async (_, id, cwd, text, session) => {
  await guard(cwd)
  let chat = chats.get(id)
  if (!chat) {
    const again = isSessionId(session) ? ` --resume ${session}` : '' // only a UUID reaches the command line
    const line = `claude -p --output-format stream-json --input-format stream-json --verbose --permission-prompt-tool stdio${again}`
    const [file, args] = process.platform === 'win32' ? ['cmd.exe', ['/c', ...line.split(' ')]] : [process.env.SHELL || '/bin/zsh', ['-ilc', line]]
    chat = require('node:child_process').spawn(file, args, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'ignore'] })
    chats.set(id, chat)
    let rest = ''
    chat.stdout.on('data', data => {
      const lines = (rest + data).split('\n')
      rest = lines.pop()
      for (const l of lines) {
        try { sendTo(win, `chat:event:${id}`, JSON.parse(l)) } catch {} // a login shell may print lines of its own
      }
    })
    const ended = code => {
      if (chats.get(id) !== chat) return
      chats.delete(id)
      sendTo(win, `chat:event:${id}`, { type: 'exit', code: code ?? 1 })
    }
    chat.on('exit', ended)
    chat.on('error', () => ended(1))
    chat.stdin.on('error', () => {})
  }
  chat.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: String(text) } }) + '\n')
})
ipcMain.on('chat:answer', (_, id, requestId, allow, input) => {
  const response = allow ? { behavior: 'allow', updatedInput: input ?? {} } : { behavior: 'deny', message: 'The user refused this.' }
  chats.get(id)?.stdin.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: String(requestId), response } }) + '\n')
})
// Stop ends the process; the next message resumes the same session.
ipcMain.on('chat:stop', (_, id) => chats.get(id)?.kill())

ipcMain.on('pty:write', (_, id, data) => terms.get(id)?.write(data))
ipcMain.on('pty:resize', (_, id, cols, rows) => terms.get(id)?.resize(Math.max(cols, 2), Math.max(rows, 2)))
ipcMain.on('pty:kill', (_, id) => terms.get(id)?.kill())

// The Dock (macOS) and taskbar (Windows) icon follow the theme, so the app looks like the window it opens.
const THEME_ICONS = ['tide', 'rebel']
// The Dock wants Apple's icon grid (margins included); the Windows taskbar wants the tile edge to edge.
const iconOf = theme => path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'assets'), `${process.platform === 'darwin' ? 'icon' : 'logo'}-${theme}.png`)
ipcMain.on('theme:set', (_, theme) => {
  if (!THEME_ICONS.includes(theme)) return
  if (process.platform === 'darwin') app.dock?.setIcon(iconOf(theme))
  else win?.setIcon(iconOf(theme))
})

// The IDE link: Claude Code's tool calls go to the window, which owns the editor, and come back as its answers.
let ide
const asked = new Map()
let askId = 0
const askWindow = (name, args) => {
  if (name === 'getWorkspaceFolders') {
    const folders = [...roots].map(p => ({ name: path.basename(p), uri: require('node:url').pathToFileURL(p).href, path: p }))
    return { success: true, folders, rootPath: folders[0]?.path ?? '' }
  }
  if (!win || win.isDestroyed()) throw new Error('The editor window is closed')
  return new Promise((done, fail) => {
    const id = ++askId
    asked.set(id, { done, fail })
    sendTo(win, 'ide:call', id, name, args)
  })
}
ipcMain.on('ide:reply', (_, id, result, error) => {
  const waiting = asked.get(id)
  asked.delete(id)
  if (waiting) error ? waiting.fail(new Error(String(error))) : waiting.done(result)
})
ipcMain.on('ide:notify', (_, method, params) => {
  if (method === 'selection_changed' || method === 'at_mentioned') ide?.notify(method, params)
})
ipcMain.handle('ide:connected', () => ide?.connected() ?? 0)

app.whenReady().then(async () => {
  await store.load()
  ide = await startIde({ call: askWindow, folders: () => [...roots], dir: path.join(home, '.claude', 'ide') }).catch(() => undefined) // without it Claude Code still runs, only unlinked
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0B1648',
    // macOS keeps its traffic lights at the left; Windows draws its buttons over the top bar at the right.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#050A24', symbolColor: '#D6F4FF', height: 40 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  // The page is local and never navigates: no new windows, no leaving index.html.
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, answer) => answer(false)) // no camera, mic, location
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', e => e.preventDefault())
  // A preview frame cannot leave the preview server: the page's own policy (frame-src in index.html) refuses any other address before a request is made.
  win.loadFile(path.join(__dirname, 'dist', 'index.html'))
})
app.on('before-quit', () => {
  ide?.close().catch(() => {}) // takes the lock file with it
  for (const w of watchers.values()) w.close()
  preview?.then(p => p.close())
  for (const term of terms.values()) term.kill()
  terms.clear()
  for (const chat of chats.values()) chat.kill()
})
app.on('window-all-closed', () => {
  for (const term of terms.values()) term.kill()
  app.quit()
})
