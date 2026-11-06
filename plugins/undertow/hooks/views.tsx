// The drawing: the HUD, each menu's own content and the action bar. It reads what it is handed and keeps no state.
import { COLOR as K, MENUS } from './tokens.js'
import { callOf, fitName, gauge, monthOf, pageOf, rank, skillRows, slotsOf, tallied, untilReset } from './data'

type Parts = { Box: (p: any) => any; Text: (p: any) => any; Button: (p: any) => any }
export type View = {
  ui: Parts
  menu: string
  command: string
  width: number
  rows: number
  now: number
  page: number
  tally: Record<string, number>
  total: number
  ai: { context: number | null; limits: { kind: string; percent: number; resetsAt?: string }[]; usd: number | null } | null
  list: { name: string; description: string; plugin: string }[]
  used: Record<string, number>
  entries: string[]
  where: { cwd: string; branch: string }
  fill: (text: string) => void
  turn: (by: number) => void
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const LIMITS: Record<string, string> = { five_hour: '5H', seven_day: '7D', spend_limit: 'SPEND' }
export const limitName = (kind: string) => LIMITS[kind] ?? kind.slice(0, 4).toUpperCase()

// A slanted label: the shared shape for every chip and heading. It never shrinks, or its corners wrap onto a row of their own.
export const cut = (Text: Parts['Text'], label: string, ground: string, ink: string, under?: string) => (
  <Text backgroundColor={under} wrap="truncate">
    <Text backgroundColor={under} color={ground}>◢</Text>
    <Text backgroundColor={ground} color={ink} bold italic> {label} </Text>
    <Text backgroundColor={under} color={ground}>◤</Text>
  </Text>
)

const tone = (percent: number | null | undefined) => ((percent ?? 0) >= 80 ? K.RED : K.CYAN)

// One gauge of the HUD, as the runs of its two rows: the number stands on its bar, always in the same columns.
const meter = ({ Text }: Parts, label: string, percent: number | null | undefined, reset: string, width: number) => {
  const on = gauge(percent ?? 0, width - 1)
  const value = (percent == null ? '--' : `${Math.round(percent)}%`).padStart(4)
  const left = reset ? ` ${reset}` : ''
  return {
    number: (
      <Text key={label}>
        <Text color={K.ICE} italic>{label.padEnd(4)}</Text>
        <Text color={(percent ?? 0) >= 80 ? K.RED : K.WHITE} bold italic>{value}</Text>
        <Text color={K.GRAY}>{left.slice(0, Math.max(0, width - 9)).padEnd(Math.max(0, width - 8))}</Text>
      </Text>
    ),
    bar: (
      <Text key={label}><Text color={tone(percent)}>{'━'.repeat(on)}</Text><Text color={K.GRAY}>{'─'.repeat(width - 1 - on)}</Text><Text> </Text></Text>
    ),
  }
}

export const hud = (v: View, day: { date: string; moon: string }) => {
  const { Box, Text } = v.ui
  const limit = (kind: string) => v.ai?.limits.find(l => l.kind === kind)
  const others = (v.ai?.limits ?? []).filter(l => l.kind !== 'five_hour' && l.kind !== 'seven_day')
  const cell = Math.floor(v.width / 3)
  const left = (kind: string) => untilReset(limit(kind)?.resetsAt, v.now)
  const cost = v.ai?.usd != null ? `$${v.ai.usd.toFixed(2)}` : '--'
  const meters = [
    meter(v.ui, 'CTX', v.ai?.context, '', cell),
    meter(v.ui, '5H', limit('five_hour')?.percent, left('five_hour'), cell),
    meter(v.ui, '7D', limit('seven_day')?.percent, left('seven_day'), cell),
  ]
  return (
    <Box flexDirection="column" width={v.width + 2} paddingX={1} backgroundColor={K.INK}>
      <Text wrap="truncate" backgroundColor={K.INK}>
        <Text color={K.WHITE} bold italic>{day.date}</Text>
        <Text color={K.ICE} italic>{`  ${day.moon}`.padEnd(Math.max(0, v.width - day.date.length - cost.length - 9))}</Text>
        <Text color={K.GRAY} italic>AI USAGE </Text><Text color={K.WHITE} bold italic>{cost}</Text>
      </Text>
      <Text wrap="truncate" backgroundColor={K.INK}>{meters.map(m => m.number)}</Text>
      <Text wrap="truncate" backgroundColor={K.INK}>{meters.map(m => m.bar)}</Text>
      {others.length > 0 ? (
        <Text wrap="truncate" backgroundColor={K.INK} color={K.ICE} italic>{others.map(l => `${limitName(l.kind)} ${Math.round(l.percent)}% ${untilReset(l.resetsAt, v.now)}`.trim()).join('   ')}</Text>
      ) : null}
    </Box>
  )
}

const heading = ({ Box, Text }: Parts, v: View, right: string) => (
  <Box justifyContent="space-between" width={v.width}>
    <Text wrap="truncate"><Text color={K.WHITE} bold italic>{v.command}</Text><Text color={K.PINK} bold italic>  {rank(v.tally[v.menu] ?? 0)}</Text></Text>
    <Text color={K.ICE} italic wrap="truncate">{right}</Text>
  </Box>
)

const nothing = ({ Text }: Parts) => <Text color={K.GRAY} italic>아직 기록이 없어요.</Text>

const more = ({ Text }: Parts, hidden: number) => (hidden > 0 ? <Text color={K.GRAY} italic>+{hidden} 더 있어요</Text> : null)

const skill = (v: View) => {
  const { Box, Text, Button } = v.ui
  const cut_ = pageOf(skillRows(v.list), v.rows - 2, v.page)
  return (
    <Box flexDirection="column" width={v.width}>
      {heading(v.ui, v, `${v.list.length} SKILLS`)}
      {v.list.length === 0 ? <Text color={K.GRAY} italic>쓸 수 있는 스킬이 없어요.</Text> : null}
      <Box flexDirection="column" height={v.rows - 2} overflow="hidden">
        {cut_.rows.map(row => {
          if (row.kind === 'group') {
            const name = row.name.toUpperCase()
            return (
              <Text key={`g${row.name}`} wrap="truncate">
                <Text color={K.CYAN} bold italic>{name} </Text>
                <Text color={K.GRAY}>{'─'.repeat(Math.max(0, v.width - name.length - String(row.count).length - 2))} {row.count}</Text>
              </Text>
            )
          }
          const s = row.skill
          const times = v.used[s.name] ? ` ×${v.used[s.name]}` : ''
          const short = s.name.includes(':') ? s.name.slice(s.name.indexOf(':') + 1) : s.name
          return (
            <Box key={s.name} flexDirection="column">
              {/* A Button wraps what is too long, so its words are cut to the row first. */}
              <Button key={s.name} plain onPress={() => v.fill(`/${s.name} `)}>
                <Text color={K.WHITE} bold={!!times} italic>▸ {fitName(short, v.width - 3 - times.length)}</Text><Text color={K.PINK} bold>{times}</Text>
              </Button>
              <Text color={K.ICE} dimColor wrap="truncate">  {s.description || ' '}</Text>
            </Box>
          )
        })}
      </Box>
      <Box justifyContent="space-between" width={v.width}>
        <Text wrap="truncate">
          <Text color={K.WHITE} bold italic>{cut_.page + 1}</Text><Text color={K.GRAY}>/{cut_.pages}  </Text>
          <Text color={K.CYAN}>{'━'.repeat(cut_.page + 1)}</Text><Text color={K.GRAY}>{'─'.repeat(Math.max(0, cut_.pages - cut_.page - 1))}</Text>
        </Text>
        {cut_.pages > 1 ? (
          <Box>
            <Button key="pageNext" plain hotkey="n" label="다음쪽" onPress={() => v.turn(1)} />
            <Text>  </Text>
            <Button key="pagePrev" plain hotkey="b" label="이전쪽" onPress={() => v.turn(-1)} />
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

// An inventory: two columns of what was worked on, repeats stacked.
const item = (v: View) => {
  const { Box, Text } = v.ui
  const all = tallied(v.entries)
  const shown = all.slice(0, (v.rows - 2) * 2)
  const column = Math.floor(v.width / 2)
  return (
    <Box flexDirection="column" width={v.width}>
      {heading(v.ui, v, `${all.length} FILES`)}
      {all.length === 0 ? nothing(v.ui) : null}
      <Box flexWrap="wrap" width={v.width}>
        {shown.map((f, i) => (
          <Box key={f.name} width={column}>
            <Text wrap="truncate">
              <Text color={K.GRAY}>{String(i + 1).padStart(2, '0')} </Text>
              <Text color={i === 0 ? K.WHITE : K.ICE} bold={i === 0} italic>{fitName(f.name, column - 7)}</Text>
              <Text color={K.PINK}>{f.count > 1 ? ` ×${f.count}` : ''}</Text>
            </Text>
          </Box>
        ))}
      </Box>
      {more(v.ui, all.length - shown.length)}
    </Box>
  )
}

// Equipped servers: a slot per MCP server, and the tool it last did.
const equip = (v: View) => {
  const { Box, Text } = v.ui
  const slots = slotsOf(v.entries)
  const shown = slots.slice(0, Math.floor((v.rows - 1) / 2))
  return (
    <Box flexDirection="column" width={v.width}>
      {heading(v.ui, v, `${slots.length} SLOTS`)}
      {slots.length === 0 ? nothing(v.ui) : null}
      {shown.map((s, i) => (
        <Box key={s.server} flexDirection="column">
          <Box justifyContent="space-between" width={v.width}>
            <Text wrap="truncate"><Text color={K.CYAN}>{String.fromCharCode(65 + i)} </Text><Text color={K.WHITE} bold italic>{fitName(s.server, v.width - 10)}</Text></Text>
            <Text color={K.GRAY}>×{s.count}</Text>
          </Box>
          <Text color={K.ICE} wrap="truncate">  └ {s.tool}</Text>
        </Box>
      ))}
    </Box>
  )
}

// The party: a band per call, the latest in front in white.
const agent = (v: View) => {
  const { Box, Text } = v.ui
  const shown = v.entries.slice(0, v.rows - 2)
  return (
    <Box flexDirection="column" width={v.width}>
      {heading(v.ui, v, `${v.entries.length} CALLS`)}
      {v.entries.length === 0 ? nothing(v.ui) : null}
      {shown.map((entry, i) => {
        const { tool, said } = callOf(entry)
        const ground = i === 0 ? K.WHITE : i % 2 ? K.MIDNIGHT : K.ABYSS
        return (
          <Box key={`${i}${entry}`} backgroundColor={ground} width={v.width}>
            <Text backgroundColor={ground} wrap="truncate">
              <Text backgroundColor={i === 0 ? K.BLACK : ground} color={i === 0 ? K.WHITE : K.CYAN} bold italic> {i === 0 ? 'LATEST' : tool.slice(0, 6).padEnd(6)} </Text>
              <Text backgroundColor={ground} color={i === 0 ? K.BLACK : K.WHITE} italic> {said || tool}</Text>
            </Text>
          </Box>
        )
      })}
      {more(v.ui, v.entries.length - shown.length)}
    </Box>
  )
}

// A character sheet: who and where, then how much of each menu this session used.
const status = (v: View) => {
  const { Box, Text } = v.ui
  const facts: [string, string][] = [
    ['PROJECT', v.where.cwd.split('/').pop() ?? ''],
    ['BRANCH', v.where.branch || '--'],
    ['TOOLS', String(v.total)],
    ['COST', v.ai?.usd != null ? `$${v.ai.usd.toFixed(2)}` : '--'],
  ]
  const most = Math.max(1, ...MENUS.map(m => v.tally[m] ?? 0))
  const width = Math.max(4, v.width - 15)
  const room = Math.max(0, v.rows - facts.length - 2)
  return (
    <Box flexDirection="column" width={v.width}>
      {heading(v.ui, v, 'THIS SESSION')}
      {facts.map(([label, value]) => (
        <Text key={label} wrap="truncate"><Text color={K.ICE} italic>{label.padEnd(9)}</Text><Text color={K.WHITE} bold>{value}</Text></Text>
      ))}
      <Text> </Text>
      {MENUS.filter(m => m !== 'CALENDAR').slice(0, room).map(m => {
        const n = v.tally[m] ?? 0
        const on = gauge((n / most) * 100, width)
        return (
          <Text key={m} wrap="truncate">
            <Text color={n ? K.WHITE : K.GRAY} italic>{m.padEnd(9)}</Text>
            <Text color={K.CYAN}>{'━'.repeat(on)}</Text><Text color={K.GRAY}>{'─'.repeat(width - on)}</Text>
            <Text color={n ? K.WHITE : K.GRAY} bold> {String(n).padStart(3)}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

// A log of objectives: the newest is the one in hand.
const quest = (v: View) => {
  const { Box, Text } = v.ui
  const shown = v.entries.slice(0, v.rows - 2)
  return (
    <Box flexDirection="column" width={v.width}>
      {heading(v.ui, v, `${v.entries.length} LOGGED`)}
      {v.entries.length === 0 ? nothing(v.ui) : null}
      {shown.map((entry, i) => (
        <Text key={`${i}${entry}`} wrap="truncate">
          <Text color={i === 0 ? K.RED : K.GRAY}>{i === 0 ? '◆ ' : '◇ '}</Text>
          <Text color={i === 0 ? K.WHITE : K.ICE} bold={i === 0} italic>{entry}</Text>
        </Text>
      ))}
      {more(v.ui, v.entries.length - shown.length)}
    </Box>
  )
}

// Who was reached: the channel, then where it went.
const link = (v: View) => {
  const { Box, Text } = v.ui
  const shown = v.entries.slice(0, Math.floor((v.rows - 1) / 2))
  return (
    <Box flexDirection="column" width={v.width}>
      {heading(v.ui, v, `${v.entries.length} CONTACTS`)}
      {v.entries.length === 0 ? nothing(v.ui) : null}
      {shown.map((entry, i) => {
        const { tool, said } = callOf(entry)
        return (
          <Box key={`${i}${entry}`} flexDirection="column">
            <Text wrap="truncate"><Text color={K.CYAN}>○─ </Text><Text color={K.WHITE} bold italic>{tool}</Text></Text>
            <Text color={K.ICE} wrap="truncate">   {said || ' '}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

// The real month: today in red, each limit's reset marked on the day it falls.
const calendar = (v: View) => {
  const { Box, Text } = v.ui
  const m = monthOf(v.now)
  const cell = Math.floor(v.width / 7)
  const resets = (v.ai?.limits ?? []).filter(l => l.resetsAt).map(l => ({ name: limitName(l.kind), at: new Date(l.resetsAt as string), left: untilReset(l.resetsAt, v.now) }))
  const marked = (d: number) => resets.some(r => r.at.getFullYear() === m.year && r.at.getMonth() === m.month && r.at.getDate() === d)
  return (
    <Box flexDirection="column" width={v.width}>
      {heading(v.ui, v, `${MONTHS[m.month]} ${m.year}`)}
      <Box>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Box key={i} width={cell}><Text color={i === 0 ? K.PINK : K.GRAY} italic>{d.padStart(2)}</Text></Box>)}
      </Box>
      {m.weeks.map((week, w) => (
        <Box key={w}>
          {week.map((d, i) => (
            <Box key={i} width={cell}>
              {d === m.today
                ? <Text backgroundColor={K.RED} color={K.WHITE} bold>{String(d).padStart(2)}</Text>
                : <Text color={d === 0 ? K.GRAY : K.ICE}>{d === 0 ? '' : String(d).padStart(2)}</Text>}
              {d && marked(d) ? <Text color={K.CYAN}>◆</Text> : null}
            </Box>
          ))}
        </Box>
      ))}
      {resets.map(r => (
        <Text key={r.name} wrap="truncate"><Text color={K.CYAN}>◆ </Text><Text color={K.ICE} italic>{r.name} 리셋 </Text><Text color={K.WHITE} bold>{r.left || '--'}</Text></Text>
      ))}
    </Box>
  )
}

// A console: shell commands read as commands, anything else by its tool.
const system = (v: View) => {
  const { Box, Text } = v.ui
  const shown = v.entries.slice(0, v.rows - 2)
  return (
    <Box flexDirection="column" width={v.width}>
      {heading(v.ui, v, `${v.entries.length} LINES`)}
      {v.entries.length === 0 ? nothing(v.ui) : null}
      {shown.map((entry, i) => {
        const { tool, said } = callOf(entry)
        return (
          <Text key={`${i}${entry}`} wrap="truncate">
            <Text color={i === 0 ? K.RED : K.GRAY}>{tool === 'Bash' ? '$ ' : '› '}</Text>
            <Text color={i === 0 ? K.WHITE : K.ICE}>{tool === 'Bash' ? said : entry}</Text>
          </Text>
        )
      })}
      {more(v.ui, v.entries.length - shown.length)}
    </Box>
  )
}

const CONTENT: Record<string, (v: View) => any> = { SKILL: skill, ITEM: item, EQUIP: equip, AGENT: agent, STATUS: status, QUEST: quest, LINK: link, CALENDAR: calendar, SYSTEM: system }
export const content = (v: View) => (CONTENT[v.menu] as (v: View) => any)(v)

// What the selected menu does, then the keys, as the row under every screen.
export const action = (v: View, says: string, keys: any) => {
  const { Box, Text } = v.ui
  return (
    <Box flexDirection="column" width={v.width}>
      <Box justifyContent="flex-end"><Text color={K.WHITE} bold italic wrap="truncate">{says}</Text></Box>
      <Text wrap="truncate"><Text color={K.ICE} italic>Command </Text><Text color={K.GRAY}>{'─'.repeat(Math.max(0, v.width - 8))}</Text></Text>
      {keys}
    </Box>
  )
}
