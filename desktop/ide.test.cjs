const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { WebSocket } = require('ws')
const { startIde } = require('./ide.cjs')

const open = (port, token) => new Promise((done, fail) => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { headers: token ? { 'x-claude-code-ide-authorization': token } : {} })
  socket.once('open', () => done(socket))
  socket.once('error', fail)
})
const ask = (socket, id, method, params) => new Promise(done => {
  socket.once('message', data => done(JSON.parse(String(data))))
  socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
})

test('the IDE link answers Claude Code only with the lock file token', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'evoke-ide-'))
  const ide = await startIde({ dir, folders: () => ['/a/proj'], call: async (name, args) => (name === 'openDiff' ? ['FILE_SAVED', args.new_file_contents] : { success: true, name }) })
  try {
    const lock = JSON.parse(await fs.readFile(path.join(dir, `${ide.port}.lock`), 'utf8'))
    assert.deepStrictEqual([lock.ideName, lock.transport, lock.workspaceFolders, lock.pid], ['Evoke', 'ws', ['/a/proj'], process.pid])
    await assert.rejects(open(ide.port, ''))
    await assert.rejects(open(ide.port, 'f'.repeat(32)))

    const socket = await open(ide.port, lock.authToken)
    assert.strictEqual((await ask(socket, 1, 'initialize', { protocolVersion: '2025-03-26' })).result.protocolVersion, '2025-03-26')
    assert.ok((await ask(socket, 2, 'tools/list')).result.tools.some(t => t.name === 'openDiff'))
    assert.deepStrictEqual((await ask(socket, 3, 'tools/call', { name: 'getOpenEditors' })).result, { content: [{ type: 'text', text: '{"success":true,"name":"getOpenEditors"}' }] })
    assert.deepStrictEqual((await ask(socket, 4, 'tools/call', { name: 'openDiff', arguments: { new_file_contents: 'x' } })).result.content.map(c => c.text), ['FILE_SAVED', 'x'])
    assert.deepStrictEqual((await ask(socket, 6, 'tools/call', { name: 'getDiagnostics' })).result.content[0].text, '{"success":true,"name":"getDiagnostics"}')
    assert.strictEqual((await ask(socket, 5, 'tools/call', { name: 'rm' })).error.code, -32602)

    const told = new Promise(done => socket.once('message', data => done(JSON.parse(String(data)))))
    ide.notify('selection_changed', { text: 'a' })
    assert.deepStrictEqual(await told, { jsonrpc: '2.0', method: 'selection_changed', params: { text: 'a' } })
  } finally {
    await ide.close()
  }
  await assert.rejects(fs.access(path.join(dir, `${ide.port}.lock`)))
})
