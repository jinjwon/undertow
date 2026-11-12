// UI edit mode: one overlay above the whole window, so while it is open nothing underneath can be clicked or typed into,
// and when it is closed none of this exists. Changes go to the draft in App, which draws them live; only Save keeps them.
// Like an image editor: the boxes are outlines over the real layout, the options sit in one thin bar at the top,
// and holding Space hides the overlay to look at the result.
import { useEffect, useRef, useState, type PointerEvent as PE } from 'react'
import { TOOL_IDS, groupOf, moveTool, parseDocks, type Docks } from './docks'
import { EMPTY, FLOAT_IDS, MAIN_IDS, PRESETS as BUILT_IN, gapsOf, mainDefaults, moveRect, parseLayout, placeRect, resetMain, resizeRect, swapMain, toFrac, toPx, type Cols, type Ctx, type FloatId, type Guides, type Handle, type Id, type Layout, type MainId, type Rect, type Size } from './layout'
import { prefs } from './prefs'

const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const isMain = (id: Id): id is MainId => (MAIN_IDS as string[]).includes(id)
const PRESETS = 'layoutPresets'
const readPresets = (): Record<string, unknown> => {
  try { return JSON.parse(prefs.getItem(PRESETS) ?? '{}') ?? {} } catch { return {} }
}
const writePresets = (p: Record<string, unknown>) => {
  try { prefs.setItem(PRESETS, JSON.stringify(p)) } catch {}
}
type Drag = { id: Id; mode: 'move' | Handle; sx: number; sy: number; start: Rect; live: boolean }

export function LayoutEdit({ value, onChange, ws, cols, top, onSave, onCancel, T }: { value: Layout; onChange: (l: Layout) => void; ws: Size; cols: Cols; top: number; onSave: () => void; onCancel: () => void; T: (key: any, vars?: any) => string }) {
  const [sel, setSel] = useState<Id | null>(null)
  const [guides, setGuides] = useState<Guides>({ v: [], h: [] })
  const [keep, setKeep] = useState(false)
  const [peek, setPeek] = useState(false) // Space held: the overlay steps aside
  const [more, setMore] = useState(false) // the bar's ⋯ menu: numbers, agent panel, presets
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null) // W × H beside the cursor while dragging
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
  const defaults = mainDefaults(ws, cols) // where the dividers were dragged to, so the boxes start on the panels
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
  const docks = (d: Docks) => onChange({ ...value, docks: parseDocks(d) })
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
    if (out) { apply(d.id, out.rect); setGuides(out.guides); setTip({ x: e.clientX, y: e.clientY, text: `${Math.round(out.rect.w)} × ${Math.round(out.rect.h)}` }) }
    setSwapWith(d.mode === 'move' && isMain(d.id) ? pointed(e, d.id) : null)
  }
  const up = (e: PE) => {
    const d = drag.current
    drag.current = null
    setGuides({ v: [], h: [] })
    setSwapWith(null)
    setTip(null)
    if (!d?.live || d.mode !== 'move' || !isMain(d.id)) return
    const other = pointed(e, d.id)
    const swapped = other && swapMain({ ...mains, [d.id]: d.start }, d.id, other)
    if (swapped) onChange({ ...value, main: Object.fromEntries(MAIN_IDS.map(m => [m, toFrac(swapped[m], ws)])) as Record<MainId, Rect> })
  }

  const live = useRef({ sel, rectOf, place, onCancel })
  live.current = { sel, rectOf, place, onCancel }
  useEffect(() => {
    const typing = (e: KeyboardEvent) => ['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)
    const key = (e: KeyboardEvent) => {
      const { sel, rectOf, place, onCancel } = live.current
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        return onCancel()
      }
      if (e.key === ' ' && !typing(e)) {
        e.preventDefault(); e.stopPropagation()
        return setPeek(true)
      }
      if (typing(e) || !sel) return
      const step = e.shiftKey ? 16 : 1
      const by = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key]
      if (!by) return
      e.preventDefault(); e.stopPropagation()
      const r = rectOf(sel)
      place(sel, { ...r, x: r.x + by[0], y: r.y + by[1] })
    }
    const keyUp = (e: KeyboardEvent) => { if (e.key === ' ') setPeek(false) }
    const blur = () => setPeek(false) // a Space released in another window must not leave the overlay hidden
    window.addEventListener('keydown', key, true)
    window.addEventListener('keyup', keyUp, true)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', keyUp, true); window.removeEventListener('blur', blur) }
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

  const presetIds = [...Object.keys(BUILT_IN).map(n => `built:${n}`), ...Object.keys(presets)]
  const pickPreset = (id: string) => onChange(id.startsWith('built:') ? BUILT_IN[id.slice(6) as keyof typeof BUILT_IN] : parseLayout(presets[id]))

  if (peek) return <div className="edit peeking" />
  return (
    <div className="edit" onPointerDown={() => (setSel(null), setMore(false))}>
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
      {tip && <div className="size-tip" style={{ left: tip.x + 14, top: tip.y + 14 }}>{tip.text}</div>}

      {/* The options bar: what is selected and the few things done most; the rest is behind ⋯. */}
      <div className="inspector bar" role="toolbar" aria-label={T('edit.title')} onPointerDown={e => e.stopPropagation()}>
        <h3>{sel ? T(`layout.${sel}`) : T('edit.title')}</h3>
        {sel && current ? (
          <>
            <span className="dims">{Math.round(current.w)} × {Math.round(current.h)}</span>
            <label className="check"><input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} /> {T('edit.lock')}</label>
            <button onClick={() => resetOne(sel)}>{T('edit.resetOne')}</button>
          </>
        ) : <span className="quiet">{T('edit.pick')}</span>}
        <select aria-label={T('edit.presets')} value="" onChange={e => e.target.value && pickPreset(e.target.value)}>
          <option value="">{T('edit.presets')}</option>
          {presetIds.map(id => <option key={id} value={id}>{id.startsWith('built:') ? T(`preset.${id.slice(6)}`) : id}</option>)}
        </select>
        <button aria-expanded={more} aria-label={T('edit.more')} title={T('edit.more')} onClick={() => setMore(m => !m)}>⋯</button>
        <button onClick={onCancel}>{T('edit.cancel')}</button>
        <button className="save" onClick={onSave}>{T('edit.save')}</button>
      </div>

      {more && (
        <div className="inspector more" onPointerDown={e => e.stopPropagation()}>
          {sel && current && <div className="nums">{field('w', 'W')}{field('h', 'H')}{field('x', 'X')}{field('y', 'Y')}</div>}
          {/* The agent panel's tools, for the keyboard as much as for the mouse: show or hide each, pick its group, lay the groups out. */}
          {sel === 'right' && (
            <>
              <h4>{T('edit.dock')}</h4>
              {TOOL_IDS.map(t => (
                <div key={t} className="dock-row">
                  <label className="check">
                    <input type="checkbox" aria-label={`${T('edit.dockShow')}: ${t.toUpperCase()}`} checked={!value.docks.hidden.includes(t)} onChange={e => docks({ ...value.docks, hidden: e.target.checked ? value.docks.hidden.filter(h => h !== t) : [...value.docks.hidden, t] })} /> {t.toUpperCase()}
                  </label>
                  <select aria-label={t.toUpperCase()} value={groupOf(value.docks, t)} onChange={e => docks(moveTool(value.docks, t, Number(e.target.value), Infinity))}>
                    {[0, 1].map(n => <option key={n} value={n}>{T('edit.dockGroup', { n: n + 1 })}</option>)}
                  </select>
                </div>
              ))}
              <div className="dock-dir">
                {(['row', 'col'] as const).map(d => <button key={d} aria-pressed={value.docks.dir === d} onClick={() => docks({ ...value.docks, dir: d })}>{T(`edit.dockDir.${d}`)}</button>)}
              </div>
            </>
          )}
          <h4>{T('edit.presets')}</h4>
          <div className="preset-new">
            <input value={name} placeholder={T('edit.presetName')} onChange={e => setName(e.target.value)} />
            <button disabled={!name.trim()} onClick={() => { const p = { ...presets, [name.trim()]: value }; setPresets(p); writePresets(p); setName('') }}>{T('edit.presetSave')}</button>
          </div>
          {Object.keys(presets).map(n => (
            <div key={n} className="preset">
              <span>{n}</span>
              <button className="x" aria-label={`${T('edit.presetDelete')}: ${n}`} onClick={() => { const { [n]: _, ...p } = presets; setPresets(p); writePresets(p) }}>×</button>
            </div>
          ))}
          <button onClick={() => onChange(EMPTY)}>{T('edit.resetAll')}</button>
          <small>{T('edit.hint')}</small>
        </div>
      )}
    </div>
  )
}
