import test from 'node:test'
import assert from 'node:assert'
import { NO_LOOK, parseLook } from './look.ts'

test('parseLook keeps known colours and a sane size, drops the rest', () => {
  assert.deepStrictEqual(parseLook(null), NO_LOOK)
  assert.deepStrictEqual(parseLook('{'), NO_LOOK)
  assert.deepStrictEqual(parseLook(JSON.stringify({ vars: { '--sel': '#FF0000', '--text': 'red', '--evil': '#000000' }, size: 15 })), { vars: { '--sel': '#FF0000' }, size: 15 })
  assert.deepStrictEqual(parseLook(JSON.stringify({ vars: {}, size: 40 })), { vars: {} })
})
