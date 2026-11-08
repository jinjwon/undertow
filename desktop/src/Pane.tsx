// The MENU pane from the terminal, as a column: the scene art is the whole pane, the HUD sits on its dark band,
// the nine menu names drawn in the art are the buttons, and the menu's content lies on the open water below.
// TIDE hides the art and shows the buttons' own text and .cutin instead (see style.css).
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { MENUS, ITEM_ROWS, ART, GRID } from '../../plugins/evoke/hooks/tokens.js'
import { dayOf, gauge, untilReset } from '../../plugins/evoke/hooks/data'

const SCENES = import.meta.glob('../../plugins/evoke/scenes/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const scene = (menu: string, frame: number) => SCENES[`../../plugins/evoke/scenes/${menu}_${frame}.png`]
const FRAMES = [25, 50, 75, 90, 100] // the cut-in, as the pane plays it

export type Usage = { context: number | null; limits: { kind: string; percent: number; resetsAt?: string }[]; usd: number | null }

function Gauge({ label, percent, reset }: { label: string; percent: number | null | undefined; reset?: string }) {
  const on = gauge(percent ?? 0, 10)
  const hot = (percent ?? 0) >= 80
  return (
    <span className="gauge">
      <span className="g-top"><i>{label}</i> <b className={hot ? 'hot' : ''}>{percent == null ? '--' : `${Math.round(percent)}%`}</b> <span className="quiet">{reset}</span></span>
      <span className="g-bar"><span className={hot ? 'hot' : ''}>{'━'.repeat(on)}</span><span className="quiet">{'─'.repeat(10 - on)}</span></span>
    </span>
  )
}

export function Pane({ menu, onMenu, usage, now, hint, style, wrapInfo, children }: { menu: string; onMenu: (m: string) => void; usage: Usage | null; now: number; hint: string; style?: CSSProperties; wrapInfo: (info: ReactNode) => ReactNode; children: ReactNode }) {
  const [frame, setFrame] = useState(100)
  useEffect(() => {
    for (const m of MENUS) for (const f of FRAMES) new Image().src = scene(m, f) // decoded ahead, so the cut-in never flashes
  }, [])
  useEffect(() => {
    let i = 0
    setFrame(FRAMES[0])
    const id = setInterval(() => {
      i += 1
      setFrame(FRAMES[Math.min(i, FRAMES.length - 1)])
      if (i >= FRAMES.length - 1) clearInterval(id)
    }, 40)
    return () => clearInterval(id)
  }, [menu])

  const { date, moon } = dayOf(now)
  const limit = (kind: string) => usage?.limits.find(l => l.kind === kind)
  return (
    <aside className="pane" style={style}>
      <div className="art">
        <img src={scene(menu, frame)} alt={menu} draggable={false} />
        <div className="cutin" key={menu} aria-hidden="true"><b>{menu}</b></div>
        {wrapInfo(
          <div className="pane-hud">
            <div className="day"><b>{date}</b> <i>{moon}</i><span className="usd"><i>AI USAGE</i> <b>{usage?.usd != null ? `$${usage.usd.toFixed(2)}` : '--'}</b></span></div>
            <div className="gauges">
              <Gauge label="CTX" percent={usage?.context} />
              <Gauge label="5H" percent={limit('five_hour')?.percent} reset={untilReset(limit('five_hour')?.resetsAt, now)} />
              <Gauge label="7D" percent={limit('seven_day')?.percent} reset={untilReset(limit('seven_day')?.resetsAt, now)} />
            </div>
          </div>
        )}
        {MENUS.map((m: string, i: number) => (
          <button
            key={m}
            className={`hot-menu ${m === menu ? 'on' : ''}`}
            title={`${m} (${i + 1})`}
            aria-label={m}
            style={{ top: `${((ITEM_ROWS[i].y - 84) / ART.height) * 100}%`, height: `${(78 / ART.height) * 100}%`, ['--x' as string]: `${((ITEM_ROWS[i].x - 430) / ART.width) * 100}cqw` }}
            onClick={() => onMenu(m)}
          ><span>{m}</span></button>
        ))}
      </div>
      <div className="pane-body" style={{ top: `calc(100cqw * ${ART.height / ART.width} * ${GRID.content / GRID.rows})` }}>
        <div className="pane-content" key={menu}>{children}</div>
        <div className="pane-hint">{hint}</div>
      </div>
    </aside>
  )
}
