// UI edit mode: one overlay above the whole window, so while it is open nothing underneath can be clicked or typed into,
// and when it is closed none of this exists. Changes go to the draft in App, which draws them live; only Save keeps them.
import { useEffect, useRef, useState, type PointerEvent as PE } from 'react'
import { EMPTY, FLOAT_IDS, MAIN_IDS, gapsOf, mainDefaults, moveRect, parseLayout, placeRect, resetMain, resizeRect, swapMain, toFrac, toPx, type Ctx, type FloatId, type Guides, type Handle, type Id, type Layout, type MainId, type Rect, type Size } from './layout'

const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const isMain = (id: Id): id is MainId => (MAIN_IDS as string[]).includes(id)
const PRESETS = 'layoutPresets'
const readPresets = (): Record<string, unknown> => {
  try { return JSON.parse(localStorage.getItem(PRESETS) ?? '{}') ?? {} } catch { return {} }
}
const writePresets = (p: Record<string, unknown>) => {
  try { localStorage.setItem(PRESETS, JSON.stringify(p)) } catch {}
}
type Drag = { id: Id; mode: 'move' | Handle; sx: number; sy: number; start: Rect; live: boolean }

export function LayoutEdit({ value, onChange, ws, top, onSave, onCancel, T }: { value: Layout; onChange: (l: Layout) => void; ws: Size; top: number; onSave: () => void; onCancel: () => void; T: (key: any, vars?: any) => string }) {
  const [sel, setSel] = useState<Id | null>(null)
  const [guides, setGuides] = useState<Guides>({ v: [], h: [] })
  const [keep, setKeep] = useState(false)
  const [preview, setPreview] = useState(false)
  const [swapWith, setSwapWith] = useState<MainId | null>(null)
  const [presets, setPresets] = useState(readPresets)
  const [name, setName] = useState('')
  const drag = useRef<Drag | null>(null)
  // Where the docked widgets sit now; read once, because undocking one removes it from there.
  const [docked] = useState(() => {
    const out: Partial<Record<FloatId, Rect>> = {}
    for (const id of FLOAT_IDS) {
      const el = document.querySelector(`[data-edit=${id}]`)?.firstElementChild
      const b = el?.getBoundingClientRect()
      if (b?.width) out[id] = { x: b.left, y: b.top - top, w: b.width, h: b.height }
    }
    return out
  })
  const defaults = mainDefaults(ws)
  const mains = value.main ? (Object.fromEntries(MAIN_IDS.map(id => [id, toPx(value.main![id], ws)])) as Record<MainId, Rect>) : defaults
  const floatRect = (id: FloatId) => (value.floats[id] ? toPx(value.floats[id]!, ws) : docked[id] ?? { x: 20, y: ws.h - 290, w: 320, h: 270 })
  const rectOf = (id: Id) => (isMain(id) ? mains[id] : floatRect(id))
  const all: Id[] = [...MAIN_IDS, ...FLOAT_IDS]

  const ctxOf = (id: Id, snap: boolean): Ctx => ({
    id, ws, snap,
    lines: all.filter(o => o !== id).map(rectOf),
    // Main panels tile; widgets float over them and only keep clear of each other.
    solid: isMain(id) ? MAIN_IDS.filter(o => o !== id).map(o => mains[o]) : FLOAT_IDS.filter(o => o !== id && value.floats[o]).map(floatRect),
  })
  const apply = (id: Id, r: Rect) => {
    const f = toFrac(r, ws)
    if (isMain(id)) onChange({ ...value, main: { ...(value.main ?? Object.fromEntries(MAIN_IDS.map(m => [m, toFrac(defaults[m], ws)])) as Record<MainId, Rect>), [id]: f } })
    else onChange({ ...value, floats: { ...value.floats, [id]: f } })
  }
  const place = (id: Id, r: Rect) => { const p = placeRect(r, ctxOf(id, false)); if (p) apply(id, p) }

  const resetOne = (id: Id) => {
    if (!isMain(id)) { const { [id]: _, ...floats } = value.floats; return onChange({ ...value, floats }) }
    if (!value.main) return
    const out = resetMain(mains, id, defaults)
    onChange({ ...value, main: Object.fromEntries(MAIN_IDS.map(m => [m, toFrac(out[m], ws)])) as Record<MainId, Rect> })
  }

  const down = (e: PE, id: Id, mode: Drag['mode']) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSel(id)
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, start: rectOf(id), live: false }
  }
  const pointed = (e: PE, id: Id) => MAIN_IDS.find(o => { const r = mains[o]; const y = e.clientY - top; return o !== id && e.clientX >= r.x && e.clientX <= r.x + r.w && y >= r.y && y <= r.y + r.h }) ?? null
  const move = (e: PE) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.live && Math.abs(dx) + Math.abs(dy) < 3) return // a click only selects, and never undocks a widget
    d.live = true
    const c = ctxOf(d.id, !e.altKey) // Alt: place freely, off the grid
    const out = d.mode === 'move' ? moveRect(d.start, dx, dy, c) : resizeRect(d.start, d.mode, dx, dy, c, keep || e.shiftKey)
    if (out) { apply(d.id, out.rect); setGuides(out.guides) }
    setSwapWith(d.mode === 'move' && isMain(d.id) ? pointed(e, d.id) : null)
  }
  const up = (e: PE) => {
    const d = drag.current
    drag.current = null
    setGuides({ v: [], h: [] })
    setSwapWith(null)
    if (!d?.live || d.mode !== 'move' || !isMain(d.id)) return
    const other = pointed(e, d.id)
    const swapped = other && swapMain({ ...mains, [d.id]: d.start }, d.id, other)
    if (swapped) onChange({ ...value, main: Object.fromEntries(MAIN_IDS.map(m => [m, toFrac(swapped[m], ws)])) as Record<MainId, Rect> })
  }

  const live = useRef({ sel, preview, rectOf, place, onCancel })
  live.current = { sel, preview, rectOf, place, onCancel }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { sel, preview, rectOf, place, onCancel } = live.current
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        return preview ? setPreview(false) : onCancel()
      }
      if ((e.target as HTMLElement).tagName === 'INPUT' || !sel || preview) return
      const step = e.shiftKey ? 16 : 1
      const by = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key]
      if (!by) return
      e.preventDefault(); e.stopPropagation()
      const r = rectOf(sel)
      place(sel, { ...r, x: r.x + by[0], y: r.y + by[1] })
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])

  const current = sel && rectOf(sel)
  const gaps = sel && current && gapsOf(current, isMain(sel) ? MAIN_IDS.filter(o => o !== sel).map(o => mains[o]) : FLOAT_IDS.filter(o => o !== sel && value.floats[o]).map(floatRect), ws)
  const field = (k: 'x' | 'y' | 'w' | 'h', label: string) => (
    <label key={k}>{label}
      {/* Applied on Enter or blur: typing 400 must not be refused at its first digit. */}
      <input
        key={`${sel}:${Math.round(current![k])}`}
        type="number"
        defaultValue={Math.round(current![k])}
        onBlur={e => { const n = Number(e.target.value); if (Number.isFinite(n) && Math.round(current![k]) !== n) place(sel!, { ...current!, [k]: n }) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )

  if (preview) return (
    <div className="edit previewing">
      <div className="edit-bar"><b>{T('edit.previewing')}</b> <button onClick={() => setPreview(false)}>{T('edit.back')}</button></div>
    </div>
  )
  return (
    <div className="edit" onPointerDown={() => setSel(null)}>
      <div className="edit-ws" style={{ top, height: ws.h }}>
        {all.map(id => {
          const r = rectOf(id)
          const floating = !isMain(id) && Boolean(value.floats[id])
          const docks = !isMain(id) && !floating
          return (
            <div
              key={id}
              className={`box ${sel === id ? 'on' : ''} ${docks ? 'docked' : ''} ${swapWith === id ? 'swap' : ''}`}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
              onPointerDown={e => down(e, id, 'move')}
              onPointerMove={move}
              onPointerUp={up}
            >
              <b>{T(`layout.${id}`)}</b>
              <i>{Math.round(r.w)} × {Math.round(r.h)}</i>
              {sel === id && HANDLES.map(h => <span key={h} className={`hd hd-${h}`} onPointerDown={e => down(e, id, h)} onPointerMove={move} onPointerUp={up} />)}
              {sel === id && gaps && (['l', 'r', 't', 'b'] as const).map(s => gaps[s] > 0 && <em key={s} className={`gap gap-${s}`}>{Math.round(gaps[s])}</em>)}
            </div>
          )
        })}
        {guides.v.map(x => <div key={`v${x}`} className="guide v" style={{ left: x }} />)}
        {guides.h.map(y => <div key={`h${y}`} className="guide h" style={{ top: y }} />)}
      </div>

      <div className={`inspector ${current && current.x + current.w / 2 > ws.w / 2 ? 'left' : ''}`} onPointerDown={e => e.stopPropagation()}>
        <h3>{sel ? T(`layout.${sel}`) : T('edit.title')}</h3>
        {sel && current ? (
          <>
            <div className="nums">{field('w', 'W')}{field('h', 'H')}{field('x', 'X')}{field('y', 'Y')}</div>
            <label className="check"><input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} /> {T('edit.lock')}</label>
            <button onClick={() => resetOne(sel)}>{T('edit.resetOne')}</button>
          </>
        ) : <p>{T('edit.pick')}</p>}
        <button onClick={() => onChange(EMPTY)}>{T('edit.resetAll')}</button>
        <h4>{T('edit.presets')}</h4>
        <div className="preset-new">
          <input value={name} placeholder={T('edit.presetName')} onChange={e => setName(e.target.value)} />
          <button disabled={!name.trim()} onClick={() => { const p = { ...presets, [name.trim()]: value }; setPresets(p); writePresets(p); setName('') }}>{T('edit.presetSave')}</button>
        </div>
        {Object.keys(presets).map(n => (
          <div key={n} className="preset">
            <button onClick={() => onChange(parseLayout(presets[n]))}>{n}</button>
            <button className="x" aria-label={`${T('edit.presetDelete')}: ${n}`} onClick={() => { const { [n]: _, ...p } = presets; setPresets(p); writePresets(p) }}>×</button>
          </div>
        ))}
        <div className="actions">
          <button onClick={() => setPreview(true)}>{T('edit.preview')}</button>
          <button onClick={onCancel}>{T('edit.cancel')}</button>
          <button className="save" onClick={onSave}>{T('edit.save')}</button>
        </div>
        <small>{T('edit.hint')}</small>
      </div>
    </div>
  )
}
