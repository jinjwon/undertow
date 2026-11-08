import test from 'node:test'
import assert from 'node:assert'
import { promptVars, iconOf, isImage } from './text.ts'
import { STRINGS, langFrom, tr } from './i18n.ts'

test('promptVars finds each {{ }} variable with its offsets', () => {
  assert.deepStrictEqual(promptVars('Hi {{name}}, see {{ topic }}.'), [
    { start: 3, end: 11 },
    { start: 17, end: 28 },
  ])
  assert.deepStrictEqual(promptVars('{{unclosed and {single}'), [])
  assert.deepStrictEqual(promptVars('{{a}}{{b}}').length, 2)
})

test('promptVars does not run across lines', () => {
  assert.deepStrictEqual(promptVars('{{a\nb}}'), [])
})

test('iconOf names a file by its kind, folders apart', () => {
  assert.deepStrictEqual(iconOf('App.tsx', false), { label: 'TS', kind: 'ts' })
  assert.deepStrictEqual(iconOf('main.cjs', false), { label: 'JS', kind: 'js' })
  assert.deepStrictEqual(iconOf('package.json', false), { label: '{}', kind: 'json' })
  assert.deepStrictEqual(iconOf('README.md', false), { label: 'MD', kind: 'md' })
  assert.deepStrictEqual(iconOf('logo.PNG', false), { label: 'IMG', kind: 'img' })
  assert.deepStrictEqual(iconOf('LICENSE', false), { label: '··', kind: 'file' })
  assert.strictEqual(iconOf('src', true).kind, 'dir')
})

test('isImage knows the formats the preview can show', () => {
  assert.ok(isImage('a/b.png') && isImage('x.SVG') && isImage('y.webp'))
  assert.ok(!isImage('a.ts'))
})

test('every string exists in English, Korean and Japanese', () => {
  const keys = Object.keys(STRINGS.en)
  for (const lang of ['ko', 'ja'] as const) assert.deepStrictEqual(Object.keys(STRINGS[lang]).sort(), [...keys].sort(), lang)
})

test('langFrom picks the system language, English otherwise', () => {
  assert.strictEqual(langFrom('ko-KR'), 'ko')
  assert.strictEqual(langFrom('ja'), 'ja')
  assert.strictEqual(langFrom('fr-FR'), 'en')
  assert.strictEqual(langFrom(undefined), 'en')
})

test('tr fills {n} placeholders', () => {
  assert.strictEqual(tr('en', 'changes', { n: 3 }), 'Changes 3')
})
