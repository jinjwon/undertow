// The main process: one window, and the file, git, usage and terminal access the window asks for.
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const pty = require('node-pty')
const { inside, latestUsage, trusted, isSessionId, slugOf, titleOf } = require('./paths.cjs')
const { walkSkip, fuzzy, searchText, parseStatus } = require('./match.cjs')

const home = os.homedir()
const roots = new Set() // real paths of the folders the window has opened; file access stays inside them
const picked = new Set() // folders you chose in the open dialog
const claudeJson = () => fs.readFile(path.join(home, '.claude.json'), 'utf8').catch(() => '{}')
const terms = new Map() // one Claude Code session per project, kept while you switch
let win

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
// The window may only open what Claude Code trusts or what you picked, so a bug in the page cannot widen file access.
ipcMain.handle('project:open', async (_, root) => {
  const at = path.resolve(String(root))
  if (!picked.has(at) && !trusted(await claudeJson()).has(at.normalize('NFC'))) throw new Error(`Not a known project: ${at}`)
  roots.add(await fs.realpath(at))
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

// The Evoke plugin saves its last usage in its store file; the newest one wins.
ipcMain.handle('usage:get', async () => {
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
})

// Past Claude Code sessions of a project, newest first, named by their first prompt.
ipcMain.handle('sessions:list', async (_, root) => {
  await guard(root)
  const dir = path.join(home, '.claude', 'projects', slugOf(path.resolve(root)))
  const names = (await fs.readdir(dir).catch(() => [])).filter(n => n.endsWith('.jsonl') && isSessionId(n.slice(0, -6)))
  const found = await Promise.all(names.map(async n => ({ id: n.slice(0, -6), file: path.join(dir, n), mtime: (await fs.stat(path.join(dir, n))).mtimeMs })))
  const newest = found.sort((a, b) => b.mtime - a.mtime).slice(0, 10)
  return Promise.all(newest.map(async s => {
    const handle = await fs.open(s.file)
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(262144), 0, 262144, 0).finally(() => handle.close())
    return { id: s.id, mtime: s.mtime, title: titleOf(buffer.subarray(0, bytesRead).toString('utf8')) }
  }))
})

// Claude Code, or a plain shell, in a login shell so it finds the same PATH as your terminal does when the app starts from Finder.
ipcMain.handle('pty:spawn', async (_, id, cwd, cols, rows, kind, resume) => {
  if (kind !== 'claude' && kind !== 'shell') throw new Error(`Unknown terminal: ${kind}`)
  const again = kind === 'claude' && isSessionId(resume) // only a UUID reaches the command line
  if (terms.has(id) && !again) return
  await guard(cwd)
  if (again) {
    terms.get(id)?.kill()
    terms.delete(id)
  }
  const windows = process.platform === 'win32'
  const claude = again ? `claude --resume ${resume}` : 'claude'
  const [file, args] =
    kind === 'shell'
      ? windows ? ['powershell.exe', ['-NoLogo']] : [process.env.SHELL || '/bin/zsh', ['-il']]
      : windows ? ['cmd.exe', ['/c', ...claude.split(' ')]] : [process.env.SHELL || '/bin/zsh', ['-ilc', claude]]
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  delete env.TERM_PROGRAM // xterm.js draws no images: the Evoke pane falls back to plain rows
  const term = pty.spawn(file, args, { name: 'xterm-256color', cwd, cols, rows, env })
  terms.set(id, term)
  term.onData(data => win?.webContents.send(`pty:data:${id}`, data))
  term.onExit(({ exitCode }) => {
    if (terms.get(id) !== term) return // a resumed session replaced this one
    terms.delete(id)
    win?.webContents.send(`pty:exit:${id}`, exitCode)
  })
})
ipcMain.on('pty:write', (_, id, data) => terms.get(id)?.write(data))
ipcMain.on('pty:resize', (_, id, cols, rows) => terms.get(id)?.resize(Math.max(cols, 2), Math.max(rows, 2)))
ipcMain.on('pty:kill', (_, id) => terms.get(id)?.kill())

app.whenReady().then(() => {
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
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', e => e.preventDefault())
  win.loadFile(path.join(__dirname, 'dist', 'index.html'))
})
app.on('window-all-closed', () => {
  for (const term of terms.values()) term.kill()
  app.quit()
})
