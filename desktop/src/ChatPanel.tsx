// Claude Code as a chat, as its VS Code panel shows it: your messages, its answers, the tools it runs,
// and a question with ALLOW and DENY whenever a tool needs permission. One Claude Code process per project, in print mode.
import { useEffect, useRef, useState } from 'react'
import { EMPTY_CHAT, chatReduce, partsOf, type Chat as ChatState } from './chat'

const api = window.evoke

export function Chat({ cwd, group, on, T }: { cwd: string; group: number; on: boolean; T: (key: any, vars?: any) => string }) {
  const id = `chat:${cwd}`
  const [chat, setChat] = useState<ChatState>(EMPTY_CHAT)
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => api.chat.on(id, (event: unknown) => setChat(c => chatReduce(c, event))), [id])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [chat.items.length])
  useEffect(() => { if (on) box.current?.focus() }, [on])

  const send = () => {
    const text = draft.trim()
    if (!text || chat.busy) return
    setDraft('')
    setChat(c => ({ ...c, busy: true, items: [...c.items, { kind: 'user', text }] }))
    api.chat.send(id, cwd, text, chat.session).catch((e: Error) => setChat(c => chatReduce(c, { type: 'result', is_error: true, result: e.message })))
  }
  const answer = (requestId: string, allow: boolean, input: unknown) => {
    api.chat.answer(id, requestId, allow, input)
    setChat(c => ({ ...c, items: c.items.map(i => (i.kind === 'ask' && i.requestId === requestId ? { ...i, answer: allow ? 'allow' : 'deny' } : i)) }))
  }

  return (
    <div className={`claude chat ${on ? 'on' : ''}`} data-group={group} data-term={id} style={{ gridArea: `b${group}` }}>
      <div className="chat-log" role="log" aria-live="polite">
        {!chat.items.length && <p className="quiet">{T('chat.empty')}</p>}
        {chat.items.map((item, i) =>
          item.kind === 'user' ? <div key={i} className="said mine">{item.text}</div>
          // Markdown drawn as React elements (partsOf), so nothing Claude writes can become HTML in this window.
          : item.kind === 'text' ? <div key={i} className="said">{partsOf(item.text).map((p, j) => p.kind === 'code'
            ? <pre key={j} className="said-code" data-lang={p.lang || undefined}><code>{p.text}</code></pre>
            : <span key={j}>{p.spans.map((s, k) => s.kind === 'code' ? <code key={k}>{s.text}</code> : s.kind === 'bold' ? <b key={k}>{s.text}</b> : s.text)}</span>)}</div>
          : item.kind === 'error' ? <div key={i} className="said error" role="alert">{item.text}</div>
          : item.kind === 'tool' ? <div key={i} className={`used ${item.failed ? 'failed' : ''}`}><b>{item.name}</b> <span>{item.detail}</span></div>
          : (
            <div key={i} className={`ask ${item.answer ?? ''}`} role="group" aria-label={T('chat.ask', { tool: item.name })}>
              <p><b>{T('chat.ask', { tool: item.name })}</b></p>
              <pre>{item.detail}</pre>
              {item.answer ? <i>{T(item.answer === 'allow' ? 'chat.allowed' : 'chat.denied')}</i> : (
                <span className="answers">
                  <button className="yes" onClick={() => answer(item.requestId, true, item.input)}>{T('chat.allow')}</button>
                  <button onClick={() => answer(item.requestId, false, item.input)}>{T('chat.deny')}</button>
                </span>
              )}
            </div>
          ))}
        {chat.busy && <div className="state">{T('chat.working')}</div>}
        <div ref={end} />
      </div>
      <form className="chat-box" onSubmit={e => (e.preventDefault(), send())}>
        <textarea
          ref={box}
          value={draft}
          rows={Math.min(8, draft.split('\n').length)}
          placeholder={T('chat.placeholder')}
          aria-label={T('chat.placeholder')}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) (e.preventDefault(), send()) }}
        />
        {chat.busy
          ? <button type="button" onClick={() => api.chat.stop(id)}>{T('chat.stop')}</button>
          : <button type="submit" disabled={!draft.trim()}>{T('chat.send')}</button>}
      </form>
    </div>
  )
}
