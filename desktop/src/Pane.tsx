// The MENU pane as a column: the HUD on its dark band, the nine menu names as buttons on rows from ITEM_ROWS,
// the menu's content below. Each theme draws the ground and the names in CSS (see style.css).
import type { CSSProperties, ReactNode } from 'react'
import { MENUS, ITEM_ROWS, ART, GRID } from '../../plugins/evoke/hooks/tokens.js'
import { dayOf, gauge, untilReset } from '../../plugins/evoke/hooks/data'

export type Usage = { context: number | null; limits: { kind: string; percent: number; resetsAt?: string; stale?: boolean }[]; usd: number | null }

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

// Above the terminals: context, every limit Claude Code reports (model limits included), and the session's cost.
// The 5-hour and 7-day rows are always there, so the strip keeps its shape before the first reading.
export function UsageStrip({ usage, now, label }: { usage: Usage | null; now: number; label: (kind: string) => string }) {
  const kinds = [...new Set(['five_hour', 'seven_day', ...(usage?.limits.map(l => l.kind) ?? [])])]
  return (
    <div className="usage-strip">
      <Gauge label={label('context')} percent={usage?.context} />
      {kinds.map(k => {
        const l = usage?.limits.find(x => x.kind === k)
        return <Gauge key={k} label={l?.stale ? `${label(k)} ${label('stale')}` : label(k)} percent={l?.percent} reset={untilReset(l?.resetsAt, now)} />
      })}
      <span className="usd"><i>{label('cost')}</i> <b>{usage?.usd != null ? `$${usage.usd.toFixed(2)}` : '--'}</b></span>
    </div>
  )
}

export function Pane({ menu, onMenu, now, hint, style, wrapInfo, children }: { menu: string; onMenu: (m: string) => void; now: number; hint: string; style?: CSSProperties; wrapInfo: (info: ReactNode) => ReactNode; children: ReactNode }) {
  const { date, moon } = dayOf(now)
  return (
    <aside className="pane" style={style}>
      <div className="art">
        <div className="cutin" key={menu} aria-hidden="true"><b>{menu}</b></div>
        {wrapInfo(
          <div className="pane-hud">
            <div className="day"><b>{date}</b> <i>{moon}</i></div>
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
          ><span>{[...m].map((c, j) => <i key={j}>{c}</i>)}</span></button>
        ))}
      </div>
      <div className="pane-body" style={{ top: `calc(100cqw * ${ART.height / ART.width} * ${GRID.content / GRID.rows})` }}>
        <div className="pane-content" key={menu}>{children}</div>
        <div className="pane-hint">{hint}</div>
      </div>
    </aside>
  )
}
