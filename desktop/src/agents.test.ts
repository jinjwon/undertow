import test from 'node:test'
import assert from 'node:assert'
import { agentsOf, parseAgents, targetOf } from './agents.ts'

test('agentsOf lists the enabled agents, Claude first', () => {
  assert.deepStrictEqual(agentsOf('both'), ['claude', 'codex'])
  assert.deepStrictEqual(agentsOf('claude'), ['claude'])
  assert.deepStrictEqual(agentsOf('codex'), ['codex'])
})

test('parseAgents falls back to both', () => {
  assert.strictEqual(parseAgents('codex'), 'codex')
  for (const bad of [null, '', 'gpt', 3]) assert.strictEqual(parseAgents(bad), 'both')
})

test('targetOf sends text to the showing agent, or to the first enabled one', () => {
  assert.strictEqual(targetOf('both', 'codex'), 'codex')
  assert.strictEqual(targetOf('both', 'shell'), 'claude')
  assert.strictEqual(targetOf('codex', 'claude'), 'codex')
  assert.strictEqual(targetOf('claude', 'ssh'), 'claude')
})
