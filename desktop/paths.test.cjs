const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { claudeLimitsOf, codexLimitsOf, statusLineOf, usageFromStatus, contextOf, usesOf, codexTrusted, sshHosts, inside, latestUsage, trusted, isSessionId, slugOf, titleOf, frontOf, pluginsOf, mcpOf, sendTo } = require('./paths.cjs')

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

test('contextOf reads the last main-thread turn of a transcript', () => {
  const row = (tokens, side = false) => JSON.stringify({ isSidechain: side, message: { usage: { input_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: tokens - 2 } } })
  assert.strictEqual(contextOf([row(50000), '{"type":"user"}', row(100000), row(9, true), 'cut off {'].join('\n')), 50)
  assert.strictEqual(contextOf(row(250000)), 25)
  assert.strictEqual(contextOf('{"type":"user"}\n'), null)
})

test('usesOf counts typed slash commands', () => {
  const line = display => JSON.stringify({ display })
  assert.deepStrictEqual(usesOf([line('/caveman'), line(' /caveman ultra'), line('/figma:figma-use x'), line('fix /this'), 'bad'].join('\n')), { caveman: 2, 'figma:figma-use': 1 })
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

test('statusLineOf copies the status JSON for Evoke and still feeds your own status line', () => {
  assert.strictEqual(statusLineOf('{}'), 'cat > "$EVOKE_USAGE_FILE"')
  assert.strictEqual(statusLineOf('not json'), 'cat > "$EVOKE_USAGE_FILE"')
  assert.strictEqual(statusLineOf(JSON.stringify({ statusLine: { type: 'command', command: 'cat > ~/.figmon/claude_status.json' } })), 'tee "$EVOKE_USAGE_FILE" | { cat > ~/.figmon/claude_status.json; }')
})

test('usageFromStatus reads context, every limit and cost from the status line JSON', () => {
  const status = {
    cwd: '/p', workspace: { project_dir: '/p' },
    context_window: { used_percentage: 8 },
    cost: { total_cost_usd: 0.5 },
    rate_limits: { five_hour: { used_percentage: 23.5, resets_at: 1738425600 }, seven_day: { used_percentage: 41.2, resets_at: 1738857600 } },
  }
  assert.deepStrictEqual(usageFromStatus(JSON.stringify(status)), {
    project: '/p', context: 8, usd: 0.5,
    limits: [{ kind: 'five_hour', percent: 23.5, resetsAt: '2025-02-01T16:00:00.000Z' }, { kind: 'seven_day', percent: 41.2, resetsAt: '2025-02-06T16:00:00.000Z' }],
  })
  assert.strictEqual(usageFromStatus('{"cwd": "/p", "context'), null) // read while Claude Code was still writing it
  assert.deepStrictEqual(usageFromStatus('{"cwd":"/q"}'), { project: '/q', context: null, usd: null, limits: [] })
  // A session that has not sent anything yet has used none of its window, not an unknown amount.
  assert.strictEqual(usageFromStatus(JSON.stringify({ cwd: '/q', context_window: { total_input_tokens: 0, used_percentage: null } })).context, 0)
})

test('claudeLimitsOf reads the limits list: session, weekly, and a model limit by its name', () => {
  const body = {
    five_hour: { utilization: 1 },
    limits: [
      { kind: 'session', group: 'g', percent: 93, resets_at: '2026-11-12T04:50:00Z', scope: null },
      { kind: 'weekly_all', group: 'g', percent: 57, resets_at: '2026-11-16T18:00:00Z', scope: null },
      { kind: 'weekly_scoped', group: 'g', percent: 78, resets_at: null, scope: { model: { id: null, display_name: 'Fable' }, surface: null } },
      { kind: 'weekly_scoped', percent: 5, scope: { model: { display_name: '<script>' } } },
      { kind: 'session', percent: 'x' },
    ],
  }
  assert.deepStrictEqual(claudeLimitsOf(body), [
    { kind: 'five_hour', percent: 93, resetsAt: '2026-11-12T04:50:00.000Z' },
    { kind: 'seven_day', percent: 57, resetsAt: '2026-11-16T18:00:00.000Z' },
    { kind: 'model:Fable', percent: 78 },
  ])
})

test('claudeLimitsOf falls back to the older five_hour / seven_day objects', () => {
  const body = {
    five_hour: { utilization: 85, resets_at: '2026-11-12T04:50:00Z' },
    seven_day: { utilization: 53.5, resets_at: null },
    seven_day_overage_included: { utilization: 77, resets_at: '2026-11-17T18:00:00Z' },
    seven_day_opus: null,
    extra_usage: { is_enabled: false, utilization: 12 },
  }
  assert.deepStrictEqual(claudeLimitsOf(body), [
    { kind: 'five_hour', percent: 85, resetsAt: '2026-11-12T04:50:00.000Z' },
    { kind: 'seven_day', percent: 53.5 },
    { kind: 'seven_day_overage_included', percent: 77, resetsAt: '2026-11-17T18:00:00.000Z' },
  ])
  assert.deepStrictEqual(claudeLimitsOf(null), [])
})

test('codexLimitsOf names each window by its length', () => {
  const body = { rate_limit: { primary_window: { used_percent: 12, limit_window_seconds: 18000, reset_at: 1762923000 }, secondary_window: { used_percent: 40, limit_window_seconds: 604800 } } }
  assert.deepStrictEqual(codexLimitsOf(body), [
    { kind: 'codex_five_hour', percent: 12, resetsAt: '2025-11-12T04:50:00.000Z' },
    { kind: 'codex_seven_day', percent: 40 },
  ])
  assert.deepStrictEqual(codexLimitsOf({ rate_limit: { primary_window: { used_percent: 100, limit_window_seconds: 2592000 }, secondary_window: null } }), [{ kind: 'codex_thirty_day', percent: 100 }])
  assert.deepStrictEqual(codexLimitsOf({}), [])
})
