import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const CYAN = '#6FE3FF'
const WHITE = '#FFFFFF'
const BLACK = '#000000'

const PANE = 'undertow'
const PANE_ARGS = { id: PANE, title: 'UNDERTOW', columns: 56, backgroundColor: '#06127A' }
// Each menu entry is a real slash command: pressing it fills the prompt, Enter runs it.
const MENU = {
  SKILL: '/skills',
  ITEM: '/context',
  EQUIP: '/mcp',
  AGENT: '/agents',
  STATUS: '/status',
  QUEST: '/tasks',
  LINK: '/resume',
  CALENDAR: '/usage',
  SYSTEM: '/config',
}
const MENUS = Object.keys(MENU) as (keyof typeof MENU)[]
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MOONS = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent']
const SPINNER = { requesting: 'Calling', thinking: 'Analyzing', responding: 'Reporting', 'tool-input': 'Preparing', 'tool-use': 'Running' } as const

const counts = atom({ plugin: 'undertow', key: 'counts' } as const, {})
const last = atom({ plugin: 'undertow', key: 'last' } as const, null)
const day = atom({ plugin: 'undertow', key: 'day' } as const, '')
const usage = atom({ plugin: 'undertow', key: 'usage' } as const, null)
const projects = atom({ plugin: 'undertow', key: 'projects' } as const, [])
const place = atom({ plugin: 'undertow', key: 'place' } as const, { cwd: '', branch: '' })

const PROJECTS = 'undertow-projects'

export const gauge = (percent: number, width: number) => {
  const on = Math.min(width, Math.round((Math.max(0, percent) / 100) * width))
  return '▰'.repeat(on) + '▱'.repeat(width - on)
}

const LIMITS: Record<string, string> = { five_hour: '5H', seven_day: '7D', spend_limit: 'SPEND' }

// The file holds every project Claude Code has seen; only trusted, real folders are offered, never scratch space.
export const projectsOf = (json: string, home: string) => {
  try {
    const known = (JSON.parse(json) as { projects?: Record<string, { hasTrustDialogAccepted?: boolean }> }).projects ?? {}
    return Object.entries(known)
      .filter(([path, v]) => v.hasTrustDialogAccepted && path.startsWith('/') && path !== home && !path.includes('/Library/'))
      .map(([path]) => ({ name: (path.split('/').pop() as string).normalize('NFC'), path }))
      // macOS can list one Korean folder twice, composed and decomposed.
      .filter((p, i, all) => all.findIndex(o => o.path.normalize('NFC') === p.path.normalize('NFC')) === i)
  } catch {
    return []
  }
}

export const menuOf = (tool: string) => {
  if (tool === 'Skill') return 'SKILL'
  if (['Read', 'Write', 'Edit', 'NotebookEdit'].includes(tool)) return 'ITEM'
  if (tool.startsWith('mcp__')) return 'EQUIP'
  if (tool === 'Agent' || tool === 'Workflow') return 'AGENT'
  if (tool.startsWith('Task') || tool === 'TodoWrite') return 'QUEST'
  if (['WebFetch', 'WebSearch', 'AskUserQuestion', 'SendMessage'].includes(tool)) return 'LINK'
  return 'SYSTEM'
}

export const rank = (n: number) => (n === 0 ? '' : n >= 50 ? 'MAX' : `RANK ${1 + Math.floor(n / 5)}`)

// shortcut: mean synodic month, can be off by up to about a day; fine for a label.
export const moon = (ms: number) => {
  const age = (ms - Date.UTC(2000, 0, 6, 18, 14)) / 86400000
  const phase = ((age % 29.530588) + 29.530588) % 29.530588
  return MOONS[Math.round((phase / 29.530588) * 8) % 8]
}

// shortcut: assumes Iosevka 14's measured cell (14x35.5 px); another font stretches the art slightly.
const CELL = 0.394
const ART = 1400 / 1500
const FOOTER = 17 // date, usage, menu rows, keys, and the player the music mod draws
export const fit = (bodyColumns: number, bodyRows: number) => {
  const room = Math.max(4, bodyRows - FOOTER)
  const rows = Math.round((bodyColumns * CELL) / ART)
  if (rows <= room) return { columns: bodyColumns, rows }
  return { columns: Math.round((room * ART) / CELL), rows: room }
}

const scene = (root: string, menu: string, frame: number) => ({ file: `${root}/scenes/${menu}_${frame}.png`, format: 'png' as const })

const today = async ($: { clock: { now: () => Promise<number> } }) => {
  const ms = await $.clock.now()
  const d = new Date(ms)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${DAYS[d.getDay()]}  ${moon(ms)}`
}

let isMoving = false

// Play the scene's cut-in, then settle the state so the redraw lands on its last frame.
async function show($: EngineInterface, menu: string, tool: string) {
  const was = (await read($, last))?.menu
  if (was !== menu && !isMoving) {
    isMoving = true
    try {
      for (const frame of [30, 55, 80]) {
        await $.ui.blit({ requestId: PANE, key: 'scene', source: scene($.plugin.root, menu, frame) })
        await $.clock.sleep(45)
      }
    } catch {
      // A cut-in that cannot play must not lose the menu change below.
    } finally {
      isMoving = false
    }
  }
  await update($, last, () => ({ menu, tool }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'menu', description: 'Open the MENU pane' })
    await $.command.register({ name: 'projects', description: 'Pick a project and open it in a new window' })
    const { stdout, exitCode } = await $.process.run(['git', '-C', e.cwd, 'rev-parse', '--abbrev-ref', 'HEAD'])
    await update($, place, () => ({ cwd: e.cwd, branch: exitCode === 0 ? stdout.trim() : '' }))
    const seen = await $.session.usage()
    await update($, usage, () => ({ context: seen.context.percent ?? null, limits: seen.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed })), usd: seen.cost?.usd ?? null }))
    void $.ui.open(PANE_ARGS)
    // The date is read fresh while drawing; this only redraws it when the day turns over.
    $.clock.every(60000, async () => {
      const now = await today($)
      await update($, day, () => now)
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => ({ context: e.context.percent ?? null, limits: e.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed })), usd: e.cost?.usd ?? null }))
    return next(e)
  })

  on('command.run', { command: 'projects' }, async $ => {
    const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
    const found = projectsOf(await $.fs.read(`${home}/.claude.json`), home)
    const real = await Promise.all(found.map(async p => ((await $.process.run(['test', '-d', p.path])).exitCode === 0 ? p : null)))
    await update($, projects, () => real.filter(p => p !== null).slice(0, 9))
    await $.ui.open({ id: PROJECTS, title: 'PROJECT', columns: 56, backgroundColor: '#06127A', focus: true, closeOnEscape: true })
    return { text: '프로젝트를 고르면 새 창으로 열어요.' }
  })

  on('ui.render', { component: 'Pane', requestId: PROJECTS }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, projects)
    const { cwd } = await read($, place)
    return (
      <Box flexDirection="column">
        <Text backgroundColor={BLACK} color={WHITE} bold> PROJECT </Text>
        {list.length === 0 ? <Text color={CYAN}>열 수 있는 프로젝트가 없어요.</Text> : null}
        {list.map((p, i) => {
          const isHere = p.path === cwd
          const ground = isHere ? WHITE : BLACK
          return (
            <Box backgroundColor={ground} marginTop={1} flexDirection="column">
              <Button
                key={p.path}
                plain
                hotkey={String(i + 1)}
                onPress={async () => {
                  const { exitCode, stderr } = await $.process.run(['open', '-na', 'Ghostty.app', '--args', `--working-directory=${p.path}`])
                  if (exitCode !== 0) $.ui.toast(`열지 못했어요: ${stderr.trim()}`)
                  else await $.ui.close(PROJECTS)
                }}
              >
                <Text backgroundColor={ground} color={isHere ? '#E8101E' : WHITE} bold>{p.name}{isHere ? '  ◀ NOW' : ''}</Text>
              </Button>
              <Text backgroundColor={ground} color={isHere ? BLACK : CYAN} wrap="truncate">   {p.path}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })

  on('command.run', { command: 'menu' }, async $ => {
    const { isPlaced } = await $.ui.open(PANE_ARGS)
    return { text: isPlaced ? 'MENU opened.' : 'MENU is waiting for room: widen the terminal.' }
  })

  on('tool.call', async ($, e, next) => {
    const menu = menuOf(e.tool)
    await update($, counts, c => ({ ...c, [menu]: (c[menu] ?? 0) + 1 }))
    void show($, menu, e.tool)
    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    return { ...box, decorations: [...(box.decorations ?? []), { start: 0, end: box.text.length, color: CYAN, bold: true, italic: true }] }
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: SPINNER[e.props.mode] } }),
  )

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const chip = e.props.isErrored ? '#E8101E' : CYAN
    return (
      <Box>
        <Text backgroundColor={chip} color={BLACK} bold> {menuOf(e.props.tool).padEnd(8)}</Text>
        <Text> </Text>
        <Box flexGrow={1}>{await next(e)}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, async ($, e, next) => {
    const { Box, Image } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Image source={{ file: `${$.plugin.root}/scenes/tag-you.png`, format: 'png' }} columns={12} rows={2} alt="YOU" />
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!e.props.isFirstOfReply) return next(e)
    const { Box, Image } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Image source={{ file: `${$.plugin.root}/scenes/tag-claude.png`, format: 'png' }} columns={12} rows={2} alt="CLAUDE" />
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { Box, Text } = $.ui.resolve(e)
    const now = await read($, last)
    const tally = await read($, counts)
    const total = Object.values(tally).reduce((a, b) => a + b, 0)
    const where = await read($, place)
    const ai = await read($, usage)
    const guide = e.props.isWorking && now ? now.tool : '무엇을 할까?'

    return (
      <Box flexDirection="column">
        {below}
        <Box justifyContent="space-between">
          <Text>
            <Text backgroundColor={e.props.isWorking ? '#E8101E' : BLACK} color={WHITE} bold> {e.props.isWorking ? 'ACTIVE' : 'STANDBY'} </Text>
            <Text color={CYAN} bold> {where.cwd.split('/').pop()}{where.branch ? ` · ${where.branch}` : ''}</Text>
            <Text dimColor> · TOOLS {total}{ai?.context != null ? ` · CTX ${ai.context}%` : ''}</Text>
          </Text>
          <Box>
            <Text color={CYAN} bold>{guide}</Text>
            <Text color={WHITE}> ──── GUIDE  {e.props.isWorking ? 'esc 중단' : '⏎ 결정'} </Text>
          </Box>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const player = await next(e)
    const { Box, Text, Button, Image } = $.ui.resolve(e)
    const tally = await read($, counts)
    const now = await read($, last)
    await read($, day)
    const on_ = (now?.menu ?? 'SKILL') as keyof typeof MENU
    const ai = await read($, usage)
    const meter = (label: string, percent: number | null | undefined) => (
      <Text backgroundColor={BLACK} wrap="truncate">
        <Text backgroundColor={BLACK} color={WHITE} bold> {label.padEnd(4)}</Text>
        <Text backgroundColor={BLACK} color={(percent ?? 0) >= 80 ? '#FF2E88' : CYAN}>{gauge(percent ?? 0, 10)}</Text>
        <Text backgroundColor={BLACK} color={WHITE} bold> {percent == null ? ' --' : `${Math.round(percent)}%`.padStart(4)} </Text>
      </Text>
    )
    const limit = (kind: string) => ai?.limits.find(l => l.kind === kind)?.percent
    const { columns, rows } = fit(e.props.bodyColumns, e.props.scroll.bodyRows)
    const step = (by: number) => () => {
      const m = MENUS[(MENUS.indexOf(on_) + by + MENUS.length) % MENUS.length]
      return show($, m, MENU[m])
    }

    return (
      <Box flexDirection="column">
        <Box backgroundColor={BLACK} justifyContent="space-between">
          <Text backgroundColor={BLACK} color={WHITE} bold> {await today($)}</Text>
          <Text backgroundColor="#E8101E" color={WHITE} bold> AI USAGE {ai?.usd != null ? `$${ai.usd.toFixed(2)} ` : ''}</Text>
        </Box>
        <Box backgroundColor={BLACK} flexWrap="wrap">
          {meter('CTX', ai?.context)}
          {meter('5H', limit('five_hour'))}
          {meter('7D', limit('seven_day'))}
          {(ai?.limits ?? []).filter(l => !LIMITS[l.kind] || l.kind === 'spend_limit').map(l => meter(LIMITS[l.kind] ?? l.kind.slice(0, 4), l.percent))}
        </Box>
        <Image key="scene" source={scene($.plugin.root, on_, 100)} columns={columns} rows={rows} alt={on_} />
        {player}
        <Box flexWrap="wrap" backgroundColor={BLACK}>
          {MENUS.map((m, i) => {
            const isOn = m === on_
            const ground = isOn ? WHITE : BLACK
            return (
              <Box width={Math.floor(e.props.bodyColumns / 3)} backgroundColor={ground}>
                <Button
                  key={m}
                  plain
                  hotkey={String(i + 1)}
                  onPress={async () => {
                    await show($, m, MENU[m])
                    await $.prompt.fill({ text: MENU[m] })
                  }}
                >
                  <Text backgroundColor={ground} color={isOn ? '#E8101E' : WHITE} bold>{m}</Text> <Text backgroundColor={ground} color={isOn ? BLACK : CYAN}>{rank(tally[m] ?? 0)}</Text>
                </Button>
              </Box>
            )
          })}
        </Box>
        <Box>
          <Button key="down" plain hotkey="j" label="다음" onPress={step(1)} />
          <Text>  </Text>
          <Button key="up" plain hotkey="k" label="이전" onPress={step(-1)} />
          <Text>  </Text>
          <Button key="run" plain hotkey="e" label="실행" onPress={() => $.prompt.fill({ text: MENU[on_] })} />
          <Text>  </Text>
          <Button key="projects" plain hotkey="p" label="프로젝트" onPress={() => $.prompt.fill({ text: '/projects' })} />
        </Box>
      </Box>
    )
  })
}
