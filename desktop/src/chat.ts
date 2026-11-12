// The chat panel's transcript, built from the events Claude Code prints in stream-json mode.
export type ChatItem =
  | { kind: 'user' | 'text' | 'error'; text: string }
  | { kind: 'tool'; id: string; name: string; detail: string; failed?: boolean }
  | { kind: 'ask'; requestId: string; name: string; detail: string; input: unknown; answer?: 'allow' | 'deny' }
export type Chat = { items: ChatItem[]; busy: boolean; session: string }
export const EMPTY_CHAT: Chat = { items: [], busy: false, session: '' }

// What a tool is about to touch, in one line: the file, the command, or the pattern.
export const detailOf = (input: any): string => String(input?.file_path ?? input?.command ?? input?.pattern ?? input?.url ?? input?.description ?? '').slice(0, 300)

export const chatReduce = (chat: Chat, event: any): Chat => {
  const add = (...more: ChatItem[]): Chat => ({ ...chat, items: [...chat.items, ...more] })
  if (event?.type === 'system' && event.subtype === 'init') return { ...chat, session: String(event.session_id ?? chat.session) }
  if (event?.type === 'assistant') {
    const blocks: any[] = Array.isArray(event.message?.content) ? event.message.content : []
    return add(...blocks.flatMap((b): ChatItem[] =>
      b.type === 'text' && b.text ? [{ kind: 'text', text: String(b.text) }]
      : b.type === 'tool_use' ? [{ kind: 'tool', id: String(b.id), name: String(b.name), detail: detailOf(b.input) }]
      : []))
  }
  if (event?.type === 'user') {
    const failed = new Set((Array.isArray(event.message?.content) ? event.message.content : []).filter((b: any) => b.type === 'tool_result' && b.is_error).map((b: any) => String(b.tool_use_id)))
    return failed.size ? { ...chat, items: chat.items.map(i => (i.kind === 'tool' && failed.has(i.id) ? { ...i, failed: true } : i)) } : chat
  }
  if (event?.type === 'control_request' && event.request?.subtype === 'can_use_tool') {
    return add({ kind: 'ask', requestId: String(event.request_id), name: String(event.request.display_name ?? event.request.tool_name), detail: detailOf(event.request.input), input: event.request.input })
  }
  if (event?.type === 'result') {
    const done = { ...chat, busy: false }
    return event.is_error ? { ...done, items: [...chat.items, { kind: 'error', text: String(event.result ?? event.subtype ?? 'error') }] } : done
  }
  // The process ended: a turn still running did not finish, and every open question is void.
  if (event?.type === 'exit') {
    const items = chat.items.map(i => (i.kind === 'ask' && !i.answer ? { ...i, answer: 'deny' as const } : i))
    return { ...chat, busy: false, items: chat.busy && event.code ? [...items, { kind: 'error', text: `claude exited (${event.code})` }] : items }
  }
  return chat
}

// An answer's Markdown, cut into parts React draws as elements: fenced code, inline code, bold and plain text.
// No HTML is ever made from Claude's words, so nothing it writes can run in this window.
export type Part = { kind: 'code'; lang: string; text: string } | { kind: 'line'; spans: { kind: 'text' | 'code' | 'bold'; text: string }[] }
const FENCE = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/
const spansOf = (t: string) => t.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).filter(Boolean).map(x =>
  x.length > 2 && x.startsWith('`') && x.endsWith('`') ? { kind: 'code' as const, text: x.slice(1, -1) }
  : x.length > 4 && x.startsWith('**') && x.endsWith('**') ? { kind: 'bold' as const, text: x.slice(2, -2) }
  : { kind: 'text' as const, text: x })
export const partsOf = (text: string): Part[] => {
  const parts: Part[] = []
  let rest = text
  for (let m = FENCE.exec(rest); m && rest; m = FENCE.exec(rest)) {
    if (m.index) parts.push({ kind: 'line', spans: spansOf(rest.slice(0, m.index)) })
    parts.push({ kind: 'code', lang: m[1].trim(), text: m[2].replace(/\n$/, '') })
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) parts.push({ kind: 'line', spans: spansOf(rest) })
  return parts
}
