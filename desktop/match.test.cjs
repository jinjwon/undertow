const test = require('node:test')
const assert = require('node:assert')
const { walkSkip, fuzzy, searchText, parseStatus } = require('./match.cjs')

test('walkSkip skips build and dependency folders only', () => {
  for (const d of ['node_modules', '.git', 'dist', 'release']) assert.ok(walkSkip(d), d)
  assert.ok(!walkSkip('src'))
})

test('fuzzy matches letters in order and prefers file names', () => {
  assert.ok(fuzzy('apx', 'src/App.tsx') > 0)
  assert.strictEqual(fuzzy('zzz', 'src/App.tsx'), 0)
  assert.ok(fuzzy('app', 'src/App.tsx') > fuzzy('app', 'a/p/p.txt'))
  assert.ok(fuzzy('', 'x') > 0)
})

test('searchText finds lines case-insensitively with 1-based positions', () => {
  assert.deepStrictEqual(searchText('a\nfoo bar\nxFOO', 'foo', 10), [
    { line: 2, col: 1, preview: 'foo bar' },
    { line: 3, col: 2, preview: 'xFOO' },
  ])
  assert.strictEqual(searchText('a\nfoo\nfoo\nfoo', 'foo', 2).length, 2)
})

test('searchText skips binary text', () => {
  assert.deepStrictEqual(searchText('x\0foo', 'foo', 10), [])
})

test('parseStatus reads porcelain -z output, renames and Korean names included', () => {
  assert.deepStrictEqual(parseStatus(' M a.ts\0?? 새 파일.md\0R  new.ts\0old.ts\0'), [
    { path: 'a.ts', code: 'M' },
    { path: '새 파일.md', code: '??' },
    { path: 'new.ts', code: 'R' },
  ])
  assert.deepStrictEqual(parseStatus(''), [])
})
