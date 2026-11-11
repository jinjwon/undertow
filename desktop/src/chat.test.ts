import test from 'node:test'
import assert from 'node:assert'
import { EMPTY_CHAT, chatReduce, type Chat } from './chat.ts'

const run = (events: unknown[], from: Chat = { ...EMPTY_CHAT, busy: true }) => events.reduce(chatReduce, from)

test('chatReduce turns a stream into text, tools and a question', () => {
  const chat = run([
    { type: 'system', subtype: 'init', session_id: 's1' },
    { type: 'assistant', message: { content: [{ type: 'thinking', thinking: '' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'On it.' }, { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '/p/a.txt', content: 'x' } }] } },
    { type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Write', display_name: 'Write', input: { file_path: '/p/a.txt' } } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'refused' }] } },
  ])
  assert.strictEqual(chat.session, 's1')
  assert.deepStrictEqual(chat.items, [
    { kind: 'text', text: 'On it.' },
    { kind: 'tool', id: 't1', name: 'Write', detail: '/p/a.txt', failed: true },
    { kind: 'ask', requestId: 'r1', name: 'Write', detail: '/p/a.txt', input: { file_path: '/p/a.txt' } },
  ])
  assert.strictEqual(chat.busy, true)
})

test('chatReduce ends the turn on a result or an exit', () => {
  assert.strictEqual(run([{ type: 'result', subtype: 'success', result: 'done' }]).busy, false)
  assert.deepStrictEqual(run([{ type: 'result', is_error: true, result: 'boom' }]).items, [{ kind: 'error', text: 'boom' }])
  const asked = run([{ type: 'control_request', request_id: 'r', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' } } }, { type: 'exit', code: 1 }])
  assert.deepStrictEqual(asked.items.map(i => [i.kind, 'answer' in i ? i.answer : undefined]), [['ask', 'deny'], ['error', undefined]])
  assert.deepStrictEqual(run([{ type: 'exit', code: 0 }], EMPTY_CHAT), EMPTY_CHAT)
})
