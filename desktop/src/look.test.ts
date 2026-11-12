import test from 'node:test'
import assert from 'node:assert'
import { NO_LOOK, parseLook } from './look.ts'

test('parseLook keeps known colours and a sane size, drops the rest', () => {
  assert.deepStrictEqual(parseLook(null), NO_LOOK)
  assert.deepStrictEqual(parseLook('{'), NO_LOOK)
  assert.deepStrictEqual(parseLook(JSON.stringify({ vars: { '--sel': '#FF0000', '--text': 'red', '--evil': '#000000' }, size: 15 })), { vars: { '--sel': '#FF0000' }, size: 15 })
  assert.deepStrictEqual(parseLook(JSON.stringify({ vars: {}, size: 40 })), { vars: {} })
  assert.deepStrictEqual(parseLook(JSON.stringify({ vars: {}, list: 18, menu: 130 })), { vars: {}, list: 18, menu: 130 })
  assert.deepStrictEqual(parseLook(JSON.stringify({ vars: {}, list: 99, menu: 1.5 })), { vars: {} })
})
