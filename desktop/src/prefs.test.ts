import test from 'node:test'
import assert from 'node:assert'
import { toMigrate } from './prefs.ts'

test('toMigrate copies only keys the store lacks and localStorage has', () => {
  const local = (k: string) => ({ theme: 'rebel', lang: 'ko', split: '{"pane":300}' } as Record<string, string>)[k] ?? null
  assert.deepStrictEqual(toMigrate({ keys: ['theme', 'lang', 'split', 'motion'], values: { lang: 'en' } }, local), [['theme', 'rebel'], ['split', '{"pane":300}']])
})

test('toMigrate survives a localStorage that throws', () => {
  assert.deepStrictEqual(toMigrate({ keys: ['theme'], values: {} }, () => { throw new Error('blocked') }), [])
})
