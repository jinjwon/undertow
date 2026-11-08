const test = require('node:test')
const assert = require('node:assert')
const { inside, latestUsage, trusted, isSessionId, slugOf, titleOf } = require('./paths.cjs')

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
