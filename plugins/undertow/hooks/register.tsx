import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { ART, COLOR as K, GRID, ITEM_ROWS } from './tokens.js'
import { baseName, dayOf, entryOf, layoutOf, menuOf, openerOf, projectsOf, samePath, skillsOf, usageOf } from './data'
import { action, content, cut, hud, limitName } from './views'
import type { View } from './views'

const PANE = 'undertow'
// Transparent: the water runs on under the pane, so transcript and menu are one surface.
const PANE_ARGS = { id: PANE, title: 'UNDERTOW', columns: 56, backgroundColor: 'transparent' }
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
// What pressing each menu is for, shown in the action bar.
const SAYS: Record<keyof typeof MENU, string> = {
  SKILL: '스킬을 고른다',
  ITEM: '컨텍스트를 살핀다',
  EQUIP: 'MCP 서버를 관리한다',
  AGENT: '에이전트를 살핀다',
  STATUS: '세션 상태를 본다',
  QUEST: '작업 목록을 본다',
  LINK: '지난 세션을 잇는다',
  CALENDAR: '사용량을 확인한다',
  SYSTEM: '설정을 연다',
}
// Terminals that draw pictures; elsewhere the menu falls back to plain rows.
const ART_TERMINALS = ['ghostty', 'kitty', 'iTerm.app', 'WezTerm']
const SPINNER = { requesting: 'Calling', thinking: 'Analyzing', responding: 'Reporting', 'tool-input': 'Preparing', 'tool-use': 'Running' } as const

const counts = atom({ plugin: 'undertow', key: 'counts' } as const, {})
const last = atom({ plugin: 'undertow', key: 'last' } as const, null)
const day = atom({ plugin: 'undertow', key: 'day' } as const, '')
const usage = atom({ plugin: 'undertow', key: 'usage' } as const, null)
const projects = atom({ plugin: 'undertow', key: 'projects' } as const, [])
const place = atom({ plugin: 'undertow', key: 'place' } as const, { cwd: '', branch: '', art: true })
const page = atom({ plugin: 'undertow', key: 'page' } as const, 0)

const skills = atom({ plugin: 'undertow', key: 'skills' } as const, [])
const uses = atom({ plugin: 'undertow', key: 'uses' } as const, {})
const log = atom({ plugin: 'undertow', key: 'log' } as const, {})

const PROJECTS = 'undertow-projects'
const BOOK = 'undertow-skills'
// More small frames instead of a few large ones: an Image swap is cheap, so the cut-in reads as motion.
const FRAMES = [25, 50, 75, 90]
const scene = (root: string, menu: string, frame: number) => ({ file: `${root}/scenes/${menu}_${frame}.png`, format: 'png' as const })

const today = async ($: { clock: { now: () => Promise<number> } }) => {
  const { date, moon } = dayOf(await $.clock.now())
  return `${date}  ${moon}`
}

let isMoving = false
const warned = new Set<string>()

const loadSkills = async ($: EngineInterface) => {
  const used = ((await $.store.get('uses')) ?? {}) as Record<string, number>
  await update($, uses, () => used)
  const all = skillsOf(await $.command.list(), used)
  await update($, skills, () => all)
}

// Play the scene's cut-in, then settle the state so the redraw lands on its last frame.
async function show($: EngineInterface, menu: string, tool: string) {
  const was = (await read($, last))?.menu
  if (was !== menu && !isMoving) {
    isMoving = true
    try {
      for (const frame of FRAMES) {
        await $.ui.blit({ requestId: PANE, key: 'scene', source: scene($.plugin.root, menu, frame) })
        await $.clock.sleep(24)
      }
    } catch {
      // A cut-in that cannot play must not lose the menu change below.
    } finally {
      isMoving = false
    }
  }
  if (was !== menu) await update($, page, () => 0)
  await update($, last, () => ({ menu, tool }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'menu', description: 'Open the MENU pane' })
    await $.command.register({ name: 'projects', description: 'Pick a project and open it in a new window' })
    await $.command.register({ name: 'skillbook', description: 'Browse skills, most used first, and pick one' })
    await loadSkills($)
    // No git on the machine only costs the branch name.
    const git = await $.process.run(['git', '-C', e.cwd, 'rev-parse', '--abbrev-ref', 'HEAD']).catch(() => null)
    const terminal = await $.env.get('TERM_PROGRAM')
    await update($, place, () => ({ cwd: e.cwd, branch: git?.exitCode === 0 ? git.stdout.trim() : '', art: ART_TERMINALS.includes(terminal ?? '') }))
    const seen = await $.session.usage()
    await update($, usage, () => usageOf(seen))
    void $.ui.open(PANE_ARGS)
    // The date is read fresh while drawing; this only redraws it when the day turns over.
    $.clock.every(60000, async () => {
      const now = await today($)
      await update($, day, () => now)
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const seen = usageOf(e)
    await update($, usage, () => seen)
    const meters = [{ kind: 'context', percent: seen.context ?? 0 }, ...seen.limits]
    for (const { kind, percent } of meters) {
      if (percent < 85) warned.delete(kind)
      else if (!warned.has(kind)) {
        warned.add(kind)
        $.ui.toast(kind === 'context' ? `컨텍스트 ${Math.round(percent)}%: /compact 추천` : `${limitName(kind)} 한도 ${Math.round(percent)}%`)
      }
    }
    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    const used = ((await $.store.get('uses')) ?? {}) as Record<string, number>
    const more = { ...used, [e.skill]: (used[e.skill] ?? 0) + 1 }
    await $.store.set('uses', more)
    await update($, uses, () => more)
    return next(e)
  })

  on('command.run', { command: 'skillbook' }, async $ => {
    await loadSkills($)
    await $.ui.open({ id: BOOK, title: 'SKILLBOOK', columns: 56, backgroundColor: K.NAVY, focus: true, closeOnEscape: true })
    return { text: '스킬을 고르면 프롬프트에 채워요.' }
  })

  on('ui.render', { component: 'Pane', requestId: BOOK }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, skills)
    const used = await read($, uses)
    const groups = [...new Set(list.map(s => s.plugin))]
    return (
      <Box flexDirection="column">
        {cut(Text, `SKILLBOOK ${list.length}`, K.WHITE, K.BLACK)}
        {list.length === 0 ? <Text color={K.ICE}>쓸 수 있는 스킬이 없어요.</Text> : null}
        {groups.map(group => (
          <Box key={group} flexDirection="column" marginTop={1}>
            {cut(Text, group.toUpperCase(), K.ICE, K.BLACK)}
            {list.filter(s => s.plugin === group).map(s => (
              <Box key={s.name} flexDirection="column">
                <Button
                  key={s.name}
                  plain
                  onPress={async () => {
                    await $.prompt.fill({ text: `/${s.name} ` })
                    await $.ui.close({ id: BOOK })
                  }}
                >
                  <Text color={K.WHITE} bold italic>▸ {s.name}</Text><Text color={K.PINK}>{used[s.name] ? `  ×${used[s.name]}` : ''}</Text>
                </Button>
                <Text color={K.ICE} wrap="truncate">  {s.description}</Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'projects' }, async $ => {
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
    const found = projectsOf(await $.fs.read(`${home}/.claude.json`), home)
    const real = await Promise.all(found.map(async p => ((await $.fs.exists(p.path).catch(() => false)) ? p : null)))
    await update($, projects, () => real.filter(p => p !== null).slice(0, 9))
    await $.ui.open({ id: PROJECTS, title: 'PROJECT', columns: 56, backgroundColor: K.NAVY, focus: true, closeOnEscape: true })
    return { text: '프로젝트를 고르면 새 창으로 열어요.' }
  })

  on('ui.render', { component: 'Pane', requestId: PROJECTS }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, projects)
    const { cwd } = await read($, place)
    return (
      <Box flexDirection="column">
        {cut(Text, 'PROJECT', K.WHITE, K.BLACK)}
        {list.length === 0 ? <Text color={K.ICE}>열 수 있는 프로젝트가 없어요.</Text> : null}
        {list.map((p, i) => {
          const isHere = samePath(p.path, cwd)
          const ground = isHere ? K.WHITE : K.ABYSS
          return (
            <Box backgroundColor={ground} marginTop={1} flexDirection="column">
              <Button
                key={p.path}
                plain
                hotkey={String(i + 1)}
                onPress={async () => {
                  const opener = openerOf(p.path, (await $.env.get('OS')) === 'Windows_NT', await $.env.get('TERM_PROGRAM'))
                  // A terminal that is not installed rejects rather than exiting non-zero.
                  const { exitCode, stderr } = opener ? await $.process.run(opener).catch(e => ({ exitCode: 1, stderr: String(e) })) : { exitCode: 1, stderr: '이 경로는 열 수 없어요.' }
                  if (exitCode !== 0) $.ui.toast(`열지 못했어요: ${stderr.trim()}`)
                  else await $.ui.close({ id: PROJECTS })
                }}
              >
                <Text backgroundColor={ground} color={isHere ? K.RED : K.WHITE} bold italic>{p.name}{isHere ? '  ◀ NOW' : ''}</Text>
              </Button>
              <Text backgroundColor={ground} color={isHere ? K.BLACK : K.ICE} wrap="truncate">   {p.path}</Text>
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
    const entry = entryOf(e.tool, e as unknown as Record<string, unknown>)
    await update($, log, l => ({ ...l, [menu]: [entry, ...(l[menu] ?? [])].slice(0, 20) }))
    void show($, menu, e.tool)
    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    return { ...box, decorations: [...(box.decorations ?? []), { start: 0, end: box.text.length, color: K.ICE, bold: true, italic: true }] }
  })

  on('ui.render', { component: 'Spinner' }, (_, e, next) =>
    next({ ...e, props: { ...e.props, word: SPINNER[e.props.mode] } }),
  )

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const chip = e.props.isErrored ? K.RED : K.WHITE
    return (
      <Box>
        <Box flexShrink={0} width={12}>{cut(Text, menuOf(e.props.tool).padEnd(8), chip, K.BLACK)}</Box>
        <Text> </Text>
        <Box flexGrow={1}>{await next(e)}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Image } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Image source={{ file: `${$.plugin.root}/scenes/tag-you.png`, format: 'png' }} columns={12} rows={2} alt="YOU" />
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!e.props.isFirstOfReply || e.surface !== 'terminal') return next(e)
    const { Box, Image } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Image source={{ file: `${$.plugin.root}/scenes/tag-claude.png`, format: 'png' }} columns={12} rows={2} alt="CLAUDE" />
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {cut(Text, 'QUESTION', K.RED, K.WHITE)}
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, (_, e, next) => next({ ...e, props: { ...e.props, word: 'CLEAR' } }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { Box, Text } = $.ui.resolve(e)
    const now = await read($, last)
    const tally = await read($, counts)
    const total = Object.values(tally).reduce((a, b) => a + b, 0)
    const where = await read($, place)
    const guide = e.props.isWorking && now ? now.tool : '무엇을 할까?'

    return (
      <Box flexDirection="column">
        {below}
        <Box justifyContent="space-between">
          <Box flexShrink={1}>
            <Box flexShrink={0}>{cut(Text, e.props.isWorking ? 'ACTIVE ' : 'STANDBY', e.props.isWorking ? K.RED : K.WHITE, e.props.isWorking ? K.WHITE : K.BLACK)}</Box>
            <Text wrap="truncate">
              <Text color={K.WHITE} bold italic> {baseName(where.cwd)}</Text>
              <Text color={K.ICE} italic>{where.branch ? ` / ${where.branch}` : ''}</Text>
              <Text color={K.GRAY}>  TOOLS {total}</Text>
            </Text>
          </Box>
          <Box flexShrink={0} marginLeft={2}>
            <Text color={K.WHITE} bold italic>{guide}</Text>
            <Text> </Text>
            {cut(Text, e.props.isWorking ? 'ESC 중단' : '⏎ 결정', K.OCEAN, K.WHITE)}
          </Box>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const tally = await read($, counts)
    const now = await read($, last)
    await read($, day)
    const on_ = (now?.menu ?? 'SKILL') as keyof typeof MENU
    const ms = await $.clock.now()
    const where = await read($, place)
    const history = await read($, log)
    const layout = e.surface !== 'terminal' || where.art === false ? null : layoutOf(e.props.bodyColumns, e.props.scroll.bodyRows, ART, GRID)
    const width = e.props.bodyColumns - 2
    const step = (by: number) => () => {
      const m = MENUS[(MENUS.indexOf(on_) + by + MENUS.length) % MENUS.length] as keyof typeof MENU
      return show($, m, MENU[m])
    }
    const pick = async (m: keyof typeof MENU) => {
      await show($, m, MENU[m])
      await $.prompt.fill({ text: MENU[m] })
    }
    const view: View = {
      ui: { Box, Text, Button },
      menu: on_,
      command: MENU[on_],
      width,
      rows: layout ? layout.footer - layout.content : Math.max(8, e.props.scroll.bodyRows - MENUS.length - 6),
      now: ms,
      page: await read($, page),
      tally,
      total: Object.values(tally).reduce((a, b) => a + b, 0),
      ai: await read($, usage),
      list: await read($, skills),
      used: await read($, uses),
      entries: history[on_] ?? [],
      where,
      fill: text => void $.prompt.fill({ text }),
      turn: by => void update($, page, p => p + by),
    }
    const keys = (
      <Box>
        <Button key="down" plain hotkey="j" label="다음" onPress={step(1)} />
        <Text>  </Text>
        <Button key="up" plain hotkey="k" label="이전" onPress={step(-1)} />
        <Text>  </Text>
        <Button key="run" plain hotkey="e" label="실행" onPress={() => $.prompt.fill({ text: MENU[on_] })} />
        <Text>  </Text>
        <Button key="projects" plain hotkey="p" label="프로젝트" onPress={() => $.prompt.fill({ text: '/projects' })} />
        <Text>  </Text>
        <Button key="skillbook" plain hotkey="s" label="스킬북" onPress={() => $.prompt.fill({ text: '/skillbook' })} />
      </Box>
    )

    // Too small for the composition, or a terminal with no pictures: the same content in plain rows.
    if (!layout || e.surface !== 'terminal') {
      return (
        <Box flexDirection="column" paddingX={1}>
          {hud(view, dayOf(ms))}
          <Box flexWrap="wrap" marginTop={1}>
            {MENUS.map((m, i) => (
              <Box key={m} marginRight={1}>
                <Button key={m} plain hotkey={String(i + 1)} onPress={() => pick(m)}>
                  {m === on_ ? cut(Text, m, K.RED, K.WHITE) : <Text color={K.ICE} bold italic>{m}</Text>}
                </Button>
              </Box>
            ))}
          </Box>
          <Box marginTop={1}>{content(view)}</Box>
          {action(view, SAYS[on_], keys)}
        </Box>
      )
    }

    // One picture is the whole pane; the text lies on it in the art's grid. A row's text clears the picture from its first cell to the pane's edge, so text keeps to open water and the keys stand at the art's right edge.
    const { Image } = $.ui.resolve(e)
    // An absolute Box only overwrites the cells it draws, so what it held before would show through a shorter text: new content gets a new Box.
    const stamp = JSON.stringify([on_, view.page, view.total, view.list.length, view.entries.length, view.entries[0], view.ai?.usd, where.branch, Math.floor(ms / 60000)])
    const keyColumn = Math.ceil(layout.columns * 0.93)
    return (
      <Box height={layout.height} width={e.props.bodyColumns}>
        <Image key="scene" source={scene($.plugin.root, on_, 100)} columns={layout.columns} rows={layout.height} alt={on_} />
        <Box position="absolute" top={0} left={0}>{hud(view, dayOf(ms))}</Box>
        {MENUS.map((m, i) => (
          <Box key={m} position="absolute" top={Math.round(((ITEM_ROWS[i] as { y: number }).y / ART.cellY - 0.5) * layout.scale)} left={keyColumn}>
            <Button key={m} plain hotkey={String(i + 1)} label={m} onPress={() => pick(m)}><Text> </Text></Button>
          </Box>
        ))}
        <Box key={stamp} position="absolute" top={layout.content} left={1} height={view.rows} overflow="hidden">{content(view)}</Box>
        <Box key={`footer${on_}`} position="absolute" top={layout.footer} left={1}>{action(view, SAYS[on_], keys)}</Box>
      </Box>
    )
  })
}
