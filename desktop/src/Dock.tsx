// One group's head in the agent panel: its tools as chips you click to show or drag to reorder and move, and the terminal tools.
import { Fragment, useRef, useState, type ReactNode } from 'react'
import { TOOL_IDS, type ToolId } from './docks'

export const TOOL_MIME = 'application/x-evoke-tool'
export const toolOf = (e: React.DragEvent): ToolId | null => {
  const t = e.dataTransfer.getData(TOOL_MIME) as ToolId
  return TOOL_IDS.includes(t) ? t : null
}

export function DockHead({ group, tools, active, focused, label, title, chip, onPick, onDrop, onDragState, children }: {
  group: number
  tools: ToolId[] // this group's visible tools, in order
  active: ToolId | null
  focused: boolean
  label: (t: ToolId) => string
  title: (t: ToolId) => string | undefined
  chip: (text: string, on: boolean) => ReactNode
  onPick: (t: ToolId) => void
  onDrop: (t: ToolId, before: ToolId | null) => void
  onDragState: (dragging: boolean) => void
  children: ReactNode
}) {
  const row = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<number | null>(null) // where the insert marker sits, as a chip index
  const [held, setHeld] = useState<ToolId | null>(null)
  // The chip whose left half the pointer is over: the drop lands in front of it.
  const indexAt = (x: number) => {
    const chips = [...(row.current?.querySelectorAll<HTMLElement>('[data-tool]') ?? [])]
    const i = chips.findIndex(c => { const b = c.getBoundingClientRect(); return x < b.left + b.width / 2 })
    return i < 0 ? chips.length : i
  }
  return (
    <div
      ref={row}
      className={`head sides dock-head ${focused ? 'focused' : ''}`}
      data-group={group}
      style={{ gridArea: `h${group}` }}
      onDragOver={e => { if (!e.dataTransfer.types.includes(TOOL_MIME)) return; e.preventDefault(); setAt(indexAt(e.clientX)) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAt(null) }}
      onDrop={e => {
        const t = toolOf(e)
        setAt(null)
        if (!t) return
        e.preventDefault()
        onDrop(t, tools[indexAt(e.clientX)] ?? null)
      }}
    >
      {tools.map((t, i) => (
        <Fragment key={t}>
          {at === i && <i className="insert" aria-hidden="true" />}
          <button
            data-tool={t}
            draggable
            className={`${active === t ? 'on' : ''} ${held === t ? 'dragging' : ''}`}
            title={title(t)}
            onClick={() => onPick(t)}
            onDragStart={e => { e.dataTransfer.setData(TOOL_MIME, t); e.dataTransfer.effectAllowed = 'move'; setHeld(t); onDragState(true) }}
            onDragEnd={() => { setHeld(null); onDragState(false) }}
          >{chip(label(t), active === t)}</button>
        </Fragment>
      ))}
      {at === tools.length && <i className="insert" aria-hidden="true" />}
      <span className="tools">{children}</span>
    </div>
  )
}
