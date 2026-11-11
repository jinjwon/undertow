import test from 'node:test'
import assert from 'node:assert'
import { promptVars, iconOf, isImage, previewKind, stepDate, weekOf } from './text.ts'
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

test('weekOf is seven days from Sunday, across a month end', () => {
  const w = weekOf(new Date(2026, 10, 30, 15).getTime()).map(t => new Date(t))
  assert.strictEqual(w.length, 7)
  assert.strictEqual(w[0].getDay(), 0)
  assert.deepStrictEqual([w[0].getDate(), w[6].getMonth(), w[6].getDate()], [29, 11, 5])
})

test('stepDate moves by the view, and months do not skip from the 31st', () => {
  const jan31 = new Date(2026, 0, 31).getTime()
  assert.strictEqual(new Date(stepDate(jan31, 'month', 1)).getMonth(), 1)
  assert.strictEqual(new Date(stepDate(jan31, 'week', 1)).getDate(), 7)
  assert.strictEqual(new Date(stepDate(jan31, 'day', -1)).getDate(), 30)
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

test('previewKind sorts files into opened-as-preview, previewable, and neither', () => {
  for (const p of ['a.pdf', 'A.PDF', 'm.mp4', 'm.webm', 'm.mov', 's.mp3', 's.wav', 's.ogg']) assert.strictEqual(previewKind(p), 'direct')
  for (const p of ['i.html', 'i.htm', 'r.md', 'R.MARKDOWN']) assert.strictEqual(previewKind(p), 'live')
  for (const p of ['a.ts', 'a.png', 'pdf', 'a.docx']) assert.strictEqual(previewKind(p), null)
})

test('Korean permission and chat copy reads right for any tool name', () => {
  assert.strictEqual(tr('ko', 'chat.ask', { tool: 'Bash' }), 'Bash 사용을 허용할까요?')
  assert.strictEqual(tr('ko', 'chat.ask', { tool: 'Write' }), 'Write 사용을 허용할까요?')
  assert.ok(tr('ko', 'chat.empty').includes('허락을 구해요'))
})
