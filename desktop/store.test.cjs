const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('./store.cjs')

const fresh = () => fs.mkdtemp(path.join(os.tmpdir(), 'evoke-store-'))

test('a value survives a reload and lands in its own file', async () => {
  const dir = await fresh()
  const s = createStore(dir); await s.load()
  await s.set('theme', 'rebel'); await s.set('layout', '{"main":null}')
  const again = createStore(dir); await again.load()
  assert.deepStrictEqual(again.snapshot().values, { theme: 'rebel', layout: '{"main":null}' })
  assert.deepStrictEqual(JSON.parse(await fs.readFile(path.join(dir, 'theme.json'), 'utf8')), { version: 1, values: { theme: 'rebel' } })
})

test('unknown keys, non-strings and values over 1e6 characters are refused', async () => {
  const s = createStore(await fresh()); await s.load()
  await assert.rejects(s.set('token', 'x'))
  await assert.rejects(s.set('theme', 3))
  await assert.rejects(s.set('layout', 'x'.repeat(1e6 + 1)))
})

test('a broken file loads as empty and leaves the other files alone', async () => {
  const dir = await fresh()
  await fs.writeFile(path.join(dir, 'layout.json'), '{"version":1,"values":')
  await fs.writeFile(path.join(dir, 'theme.json'), JSON.stringify({ version: 1, values: { theme: 'rebel', bogus: 'x', lang: 'ko' } }))
  const s = createStore(dir); await s.load()
  assert.deepStrictEqual(s.snapshot().values, { theme: 'rebel' }) // keys are read only from the file they belong to
})

test('writes leave no temporary file behind and keep the last of two quick writes', async () => {
  const dir = await fresh()
  const s = createStore(dir); await s.load()
  await Promise.all([s.set('lang', 'en'), s.set('lang', 'ja')])
  assert.deepStrictEqual(await fs.readdir(dir), ['settings.json'])
  const again = createStore(dir); await again.load()
  assert.strictEqual(again.snapshot().values.lang, 'ja')
})

test('snapshot lists every key', async () => {
  const s = createStore(await fresh()); await s.load()
  assert.deepStrictEqual(s.snapshot().keys.sort(), ['agents', 'lang', 'layout', 'layoutPresets', 'motion', 'split', 'terminal', 'theme'])
})
