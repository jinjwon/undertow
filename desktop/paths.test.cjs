const test = require('node:test')
const assert = require('node:assert')
const { inside, latestUsage, trusted } = require('./paths.cjs')

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
