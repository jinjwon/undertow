// The main process: one window, and the file, git, usage and terminal access the window asks for.
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const pty = require('node-pty')
const { inside, latestUsage, trusted } = require('./paths.cjs')

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
ipcMain.handle('fs:read', async (_, file) => fs.readFile(await guard(file), 'utf8'))
ipcMain.handle('fs:write', async (_, file, text) => fs.writeFile(await guard(file), String(text), 'utf8'))

ipcMain.handle('git:branch', async (_, root) => {
  await guard(root)
  return new Promise(resolve => execFile('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], (err, out) => resolve(err ? '' : out.trim())))
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

// Claude Code in a login shell, so it finds the same PATH as your terminal does when the app starts from Finder.
ipcMain.handle('pty:spawn', async (_, id, cwd, cols, rows) => {
  if (terms.has(id)) return
  await guard(cwd)
  const windows = process.platform === 'win32'
  const [file, args] = windows ? ['cmd.exe', ['/c', 'claude']] : [process.env.SHELL || '/bin/zsh', ['-ilc', 'claude']]
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  delete env.TERM_PROGRAM // xterm.js draws no images: the Evoke pane falls back to plain rows
  const term = pty.spawn(file, args, { name: 'xterm-256color', cwd, cols, rows, env })
  terms.set(id, term)
  term.onData(data => win?.webContents.send(`pty:data:${id}`, data))
  term.onExit(({ exitCode }) => {
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
