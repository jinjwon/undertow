// The empty editor's backdrop, drawn here as SVG: no game art is used. REBEL is a calling card torn open
// (a ray burst, a jagged star, white shards); TIDE is light through water (ripples, shafts, bubbles).
import type { ThemeName } from './themes'

const RAYS = Array.from({ length: 24 }, (_, i) => i)
// Fixed, hand-picked jitter so the shapes look torn but never change between renders.
const STAR = [0, 1.25, 0.55, 1.1, 0.5, 1.3, 0.6, 1.05, 0.45, 1.2, 0.58, 1.15, 0.5, 1.28, 0.62, 1.08]
const SHARDS = [[96, 120, -18], [690, 90, 24], [742, 470, -40], [130, 500, 32], [600, 540, 12], [250, 70, 50]]
const BUBBLES = [[640, 520, 14], [700, 440, 8], [610, 380, 5], [730, 330, 11], [560, 470, 6], [680, 250, 4], [760, 200, 7]]

const star = (cx: number, cy: number, r: number) =>
  STAR.map((k, i) => {
    const a = (i / STAR.length) * Math.PI * 2 - Math.PI / 2
    return `${(cx + Math.cos(a) * r * k).toFixed(1)},${(cy + Math.sin(a) * r * k).toFixed(1)}`
  }).join(' ')

export function EmptyArt({ theme }: { theme: ThemeName }) {
  return theme === 'rebel' ? (
    <svg className="empty-art" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="ea-dots" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="5" cy="5" r="2.4" fill="#B8001F" />
        </pattern>
      </defs>
      <g className="ea-rays">
        {RAYS.map(i => {
          const a = (i / RAYS.length) * Math.PI * 2
          const b = a + Math.PI / RAYS.length
          return <polygon key={i} points={`400,300 ${400 + Math.cos(a) * 900},${300 + Math.sin(a) * 900} ${400 + Math.cos(b) * 900},${300 + Math.sin(b) * 900}`} fill={i % 3 ? '#000000' : '#B8001F'} opacity={i % 3 ? 0.55 : 0.22} />
        })}
      </g>
      <circle cx="660" cy="120" r="170" fill="url(#ea-dots)" opacity=".7" />
      <circle cx="120" cy="520" r="140" fill="url(#ea-dots)" opacity=".5" />
      <polygon points={star(400, 300, 250)} fill="#B8001F" />
      <polygon points={star(410, 292, 210)} fill="#000000" transform="rotate(8 400 300)" />
      <polygon points="120,250 690,190 700,250 660,262 720,300 140,370 160,320 96,300" fill="#FFFFFF" transform="rotate(-8 400 300)" />
      <polygon points="138,268 672,210 680,244 646,256 702,290 154,352 170,318 118,300" fill="#000000" transform="rotate(-8 400 300)" />
      <rect x="-40" y="438" width="900" height="22" fill="#B8001F" transform="rotate(-14 400 450)" />
      <rect x="-40" y="468" width="900" height="6" fill="#FFFFFF" transform="rotate(-14 400 450)" />
      {SHARDS.map(([x, y, r], i) => <polygon key={i} points={`${x},${y} ${x + 34},${y + 8} ${x + 6},${y + 26}`} fill={i % 2 ? '#FFFFFF' : '#B8001F'} transform={`rotate(${r} ${x} ${y})`} />)}
    </svg>
  ) : (
    <svg className="empty-art" viewBox="0 0 800 600" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <g fill="#FFFFFF">
        <polygon points="470,0 530,0 420,600 330,600" opacity=".08" />
        <polygon points="580,0 610,0 540,600 500,600" opacity=".06" />
        <polygon points="690,0 760,0 720,600 640,600" opacity=".07" />
      </g>
      <g fill="none" stroke="#FFFFFF" className="ea-ripples">
        {[60, 120, 190, 270, 360].map((r, i) => <ellipse key={r} cx="640" cy="470" rx={r} ry={r * 0.32} strokeWidth={3 - i * 0.4} opacity={0.5 - i * 0.08} />)}
      </g>
      <g className="ea-bubbles">
        {BUBBLES.map(([x, y, r], i) => (
          <g key={i} style={{ animationDelay: `${i * -1.3}s` }}>
            <circle cx={x} cy={y} r={r} fill="#16D9F533" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx={x - r * 0.35} cy={y - r * 0.35} r={r * 0.25} fill="#FFFFFF" />
          </g>
        ))}
      </g>
    </svg>
  )
}
