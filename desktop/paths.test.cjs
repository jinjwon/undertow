const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { codexTrusted, sshHosts, inside, latestUsage, trusted, isSessionId, slugOf, titleOf, frontOf, pluginsOf, mcpOf, sendTo } = require('./paths.cjs')

test('inside keeps paths within the project', () => {
  assert.ok(inside('/a/proj', '/a/proj'))
  assert.ok(inside('/a/proj', '/a/proj/src/x.ts'))
  assert.ok(!inside('/a/proj', '/a/proj/../other'))
  assert.ok(!inside('/a/proj', '/a/project2/x'))
  assert.ok(!inside('/a/proj', '/etc/passwd'))
})

test('latestUsage takes the newest file that has usage', () => {
  const files = [
    { mtime: 3, text: '{"uses":{}}' },
    { mtime: 2, text: '{"usage":{"context":40}}' },
    { mtime: 5, text: 'not json' },
    { mtime: 1, text: '{"usage":{"context":10}}' },
  ]
  assert.deepStrictEqual(latestUsage(files), { context: 40 })
  assert.strictEqual(latestUsage([]), null)
})

test('sshHosts lists named hosts only, never a pattern or an option', () => {
  const config = 'Host web db\n  HostName 10.0.0.1\nhost *.corp !bad\nHost -oProxyCommand=evil\n  Host   stage # old\nHost web\n'
  assert.deepStrictEqual(sshHosts(config), ['web', 'db', 'stage'])
  assert.deepStrictEqual(sshHosts(''), [])
})

test('codexTrusted reads the trusted projects of ~/.codex/config.toml', () => {
  const toml = 'model = "x"\n[projects."/a/ok"]\ntrust_level = "trusted"\n[projects."/a/no"]\ntrust_level = "untrusted"\n[projects."C:\\\\Users\\\\a\\\\p"]\ntrust_level = "trusted"\n[projects.\'D:\\lit\']\ntrust_level = "trusted"\n[other]\ntrust_level = "trusted"\n'
  assert.deepStrictEqual([...codexTrusted(toml)].sort(), [path.resolve('/a/ok'), path.resolve('C:\\Users\\a\\p'), path.resolve('D:\\lit')].sort())
  assert.strictEqual(codexTrusted('').size, 0)
})

test('trusted lists only projects whose trust dialog was accepted', () => {
  const json = JSON.stringify({ projects: { '/a/ok': { hasTrustDialogAccepted: true }, '/a/no': {}, '/a/false': { hasTrustDialogAccepted: false } } })
  assert.deepStrictEqual([...trusted(json)], ['/a/ok'])
  assert.strictEqual(trusted('not json').size, 0)
})

test('isSessionId lets only UUIDs reach claude --resume', () => {
  assert.ok(isSessionId('3f2a9c1e-8b4d-4e6f-9a1b-2c3d4e5f6a7b'))
  assert.ok(!isSessionId('--help'))
  assert.ok(!isSessionId('x; rm -rf ~'))
  assert.ok(!isSessionId(undefined))
})

test('slugOf names a project folder the way Claude Code does', () => {
  assert.strictEqual(slugOf('/Users/a/my proj'), '-Users-a-my-proj')
  assert.strictEqual(slugOf('C:\\work\\app'), 'C--work-app')
})

test('titleOf takes the first typed prompt, skipping command and meta lines', () => {
  const lines = [
    { type: 'mode', mode: 'normal' },
    { type: 'user', message: { content: '<command-name>/menu</command-name>' } },
    { type: 'user', message: { content: [{ type: 'text', text: '로그인 버그 고쳐줘' }] } },
    { type: 'user', message: { content: 'later' } },
  ].map(l => JSON.stringify(l)).join('\n') + '\n{broken'
  assert.strictEqual(titleOf(lines), '로그인 버그 고쳐줘')
  assert.strictEqual(titleOf(''), '')
})

test('frontOf reads name and description, quoted or folded', () => {
  assert.deepStrictEqual(frontOf('---\nname: caveman\ndescription: "Terse: voice"\n---\nbody'), { name: 'caveman', description: 'Terse: voice' })
  assert.deepStrictEqual(frontOf('---\nname: x\ndescription: >\n  line one\n  line two\n---\n'), { name: 'x', description: 'line one line two' })
  assert.deepStrictEqual(frontOf('no front matter'), { name: '', description: '' })
})

test('pluginsOf lists enabled plugins with their install folder', () => {
  const installed = JSON.stringify({ plugins: { 'a@m': [{ installPath: '/p/a' }], 'b@m': [{ installPath: '/p/b' }] } })
  const settings = JSON.stringify({ enabledPlugins: { 'a@m': true, 'b@m': false } })
  assert.deepStrictEqual(pluginsOf(installed, settings), [{ name: 'a', path: '/p/a' }])
  assert.deepStrictEqual(pluginsOf('bad', '{}'), [])
})

test('mcpOf merges global and project MCP servers', () => {
  const json = JSON.stringify({ mcpServers: { g: {} }, projects: { '/r': { mcpServers: { p: {}, g: {} } } } })
  assert.deepStrictEqual(mcpOf(json, '/r'), ['g', 'p'])
  assert.deepStrictEqual(mcpOf('{}', '/r'), [])
})

test('sendTo drops messages for a closed window instead of throwing', () => {
  const sent = []
  const live = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send: (...a) => sent.push(a) } }
  const closed = { isDestroyed: () => true, webContents: { send: () => { throw new TypeError('Object has been destroyed') } } }
  const closing = { isDestroyed: () => false, webContents: { isDestroyed: () => true, send: () => { throw new TypeError('Object has been destroyed') } } }
  sendTo(live, 'pty:data:x', 'hi')
  assert.doesNotThrow(() => sendTo(closed, 'pty:data:x', 'late output'))
  assert.doesNotThrow(() => sendTo(closing, 'pty:exit:x', 0))
  assert.doesNotThrow(() => sendTo(undefined, 'pty:exit:x', 0))
  assert.deepStrictEqual(sent, [['pty:data:x', 'hi']])
})
