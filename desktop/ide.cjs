// Claude Code's IDE link, as its VS Code extension offers it: a WebSocket server on this machine that speaks MCP,
// found by Claude Code through a lock file in ~/.claude/ide and the port in its environment.
// Claude asks for the selection, the open tabs and diagnostics, and shows its edits as a diff to accept or reject.
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { WebSocketServer } = require('ws')

const text = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] })
const file = { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] }
const none = { type: 'object', properties: {} }
// The tools Claude Code calls by these exact names.
const TOOLS = [
  { name: 'openFile', description: 'Open a file in the editor', inputSchema: { type: 'object', properties: { filePath: { type: 'string' }, preview: { type: 'boolean' }, startText: { type: 'string' }, endText: { type: 'string' }, makeFrontmost: { type: 'boolean' } }, required: ['filePath'] } },
  { name: 'openDiff', description: 'Show proposed changes to a file as a diff and wait for the user to accept or reject them', inputSchema: { type: 'object', properties: { old_file_path: { type: 'string' }, new_file_path: { type: 'string' }, new_file_contents: { type: 'string' }, tab_name: { type: 'string' } }, required: ['old_file_path', 'new_file_path', 'new_file_contents', 'tab_name'] } },
  { name: 'getCurrentSelection', description: 'Get the current text selection in the active editor', inputSchema: none },
  { name: 'getLatestSelection', description: 'Get the most recent text selection', inputSchema: none },
  { name: 'getOpenEditors', description: 'Get the open editor tabs', inputSchema: none },
  { name: 'getWorkspaceFolders', description: 'Get the open project folders', inputSchema: none },
  { name: 'getDiagnostics', description: 'Get language diagnostics for a file, or for every open file', inputSchema: { type: 'object', properties: { uri: { type: 'string' } } } },
  { name: 'checkDocumentDirty', description: 'Check if a document has unsaved changes', inputSchema: file },
  { name: 'saveDocument', description: 'Save a document with unsaved changes', inputSchema: file },
  { name: 'close_tab', description: 'Close a diff tab by name', inputSchema: { type: 'object', properties: { tab_name: { type: 'string' } }, required: ['tab_name'] } },
  { name: 'closeAllDiffTabs', description: 'Close all diff tabs', inputSchema: none },
]

// call(name, args) answers a tool: a string or an object for the result text, or it throws.
// dir is where the lock file goes; folders() lists the open projects.
const startIde = async ({ call, folders, dir }) => {
  const token = crypto.randomBytes(16).toString('hex')
  const sockets = new Set()
  // Only this machine can connect, and only with the token from the lock file, which only this user can read.
  const server = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    verifyClient: ({ req }) => {
      const given = Buffer.from(String(req.headers['x-claude-code-ide-authorization'] ?? ''))
      return given.length === token.length && crypto.timingSafeEqual(given, Buffer.from(token))
    },
  })
  await new Promise((done, fail) => (server.once('listening', done), server.once('error', fail)))
  const { port } = server.address()
  const lock = path.join(dir, `${port}.lock`)
  const writeLock = async () => {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(lock, JSON.stringify({ pid: process.pid, workspaceFolders: folders(), ideName: 'Evoke', transport: 'ws', runningInWindows: process.platform === 'win32', authToken: token }), { mode: 0o600 })
  }
  await writeLock()

  const answer = async ({ method, params }) => {
    if (method === 'initialize') return { protocolVersion: params?.protocolVersion ?? '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'evoke', version: '1' } }
    if (method === 'tools/list') return { tools: TOOLS }
    if (method === 'prompts/list') return { prompts: [] }
    if (method === 'resources/list') return { resources: [] }
    if (method === 'ping') return {}
    if (method === 'tools/call') {
      if (!TOOLS.some(t => t.name === params?.name)) throw Object.assign(new Error(`Unknown tool: ${params?.name}`), { code: -32602 })
      const result = await call(params.name, params.arguments ?? {})
      // Several texts are several content items (openDiff's verdict and file text); anything else is one JSON text.
      return Array.isArray(result) && result.length && result.every(t => typeof t === 'string') ? { content: result.map(t => ({ type: 'text', text: t })) } : text(result)
    }
    throw Object.assign(new Error(`Unknown method: ${method}`), { code: -32601 })
  }
  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => sockets.delete(socket))
    socket.on('message', async data => {
      let message
      try { message = JSON.parse(String(data)) } catch { return }
      if (message.id === undefined || !message.method) return // a notification, or an answer to nothing we asked
      const reply = await answer(message).then(result => ({ result }), error => ({ error: { code: error.code ?? -32000, message: String(error.message ?? error) } }))
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, ...reply }))
    })
  })

  return {
    port,
    connected: () => sockets.size,
    // Tells every connected Claude Code something, such as the selection having moved.
    notify: (method, params) => {
      const message = JSON.stringify({ jsonrpc: '2.0', method, params })
      for (const socket of sockets) if (socket.readyState === socket.OPEN) socket.send(message)
    },
    refresh: writeLock, // after the open projects change
    close: async () => {
      for (const socket of sockets) socket.terminate()
      await fs.rm(lock, { force: true })
      await new Promise(done => server.close(done))
    },
  }
}

module.exports = { startIde, TOOLS }
