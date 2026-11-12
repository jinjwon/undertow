import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { COLOR as K, ITEM_ROWS } from './tokens.js'
import { baseName, dayOf, entryOf, fitName, lastUsedOf, menuOf, openerOf, projectsOf, rankProjects, samePath, skillsOf, usageOf } from './data'
import { action, content, cut, hud, limitName, section } from './views'
import type { View } from './views'

const PANE = 'evoke'
// Transparent: the water runs on under the pane, so transcript and menu are one surface.
const PANE_ARGS = { id: PANE, title: 'EVOKE', columns: 56, backgroundColor: 'transparent' }
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
const SPINNER = { requesting: 'Calling', thinking: 'Analyzing', responding: 'Reporting', 'tool-input': 'Preparing', 'tool-use': 'Running' } as const

const counts = atom({ plugin: 'evoke', key: 'counts' } as const, {})
const last = atom({ plugin: 'evoke', key: 'last' } as const, null)
const day = atom({ plugin: 'evoke', key: 'day' } as const, '')
const usage = atom({ plugin: 'evoke', key: 'usage' } as const, null)
const projects = atom({ plugin: 'evoke', key: 'projects' } as const, [])
const place = atom({ plugin: 'evoke', key: 'place' } as const, { cwd: '', branch: '' })
const page = atom({ plugin: 'evoke', key: 'page' } as const, 0)

const skills = atom({ plugin: 'evoke', key: 'skills' } as const, [])
const uses = atom({ plugin: 'evoke', key: 'uses' } as const, {})
const log = atom({ plugin: 'evoke', key: 'log' } as const, {})

const PROJECTS = 'evoke-projects'
const BOOK = 'evoke-skills'
// What the plain rows spend around the content: the HUD's 4, the menu's 3, the action bar's 3 and their 2 gaps.
const PLAIN_ROWS = 12

const today = async ($: { clock: { now: () => Promise<number> } }) => {
  const { date, moon } = dayOf(await $.clock.now())
  return `${date}  ${moon}`
}

const warned = new Set<string>()

const loadSkills = async ($: EngineInterface) => {
  const used = ((await $.store.get('uses')) ?? {}) as Record<string, number>
  await update($, uses, () => used)
  const all = skillsOf(await $.command.list(), used)
  await update($, skills, () => all)
}

// Settle the menu; a new menu starts on its first page.
async function show($: EngineInterface, menu: string, tool: string) {
  const was = (await read($, last))?.menu
  if (was !== menu) await update($, page, () => 0)
  await update($, last, () => ({ menu, tool }))
}

const openProjects = async ($: EngineInterface) => {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
  const found = projectsOf(await $.fs.read(`${home}/.claude.json`), home)
  const real = (await Promise.all(found.map(async p => ((await $.fs.exists(p.path).catch(() => false)) ? p : null)))).filter(p => p !== null)
  // shortcut: a history over the 4 MiB read limit leaves the file's own order, read its tail if that ever matters.
  const last = lastUsedOf(await $.fs.read(`${home}/.claude/history.jsonl`).catch(() => ''))
  const { cwd } = await read($, place)
  await update($, projects, () => rankProjects(real, last, cwd).slice(0, 9))
  await $.ui.open({ id: PROJECTS, title: 'PROJECT', columns: 56, backgroundColor: K.NAVY, focus: true, closeOnEscape: true })
}

// Where the session is. A pane drawn in a session whose start never got here
// (or failed part way) would otherwise keep the defaults: no skills, no branch.
// So the next event that may write state sets it up instead.
let isSetUp = false
const setUp = async ($: EngineInterface, cwd?: string) => {
  isSetUp = true
  await loadSkills($).catch(() => {})
  const at = cwd ?? (await $.env.get('PWD').catch(() => undefined)) ?? ''
  // No git on the machine only costs the branch name.
  const git = at ? await $.process.run(['git', '-C', at, 'rev-parse', '--abbrev-ref', 'HEAD']).catch(() => null) : null
  await update($, place, () => ({ cwd: at, branch: git?.exitCode === 0 ? git.stdout.trim() : '' }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // One command that cannot register must not cost the others or the setup below.
    for (const c of [
      { name: 'menu', description: 'Open the MENU pane' },
      { name: 'projects', description: 'Pick a project and open it in a new window' },
      { name: 'skillbook', description: 'Browse skills, most used first, and pick one' },
    ]) await $.command.register(c).catch(() => {})
    await setUp($, e.cwd)
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
    if (!isSetUp) await setUp($)
    const seen = usageOf(e)
    await update($, usage, () => seen)
    await $.store.set('usage', seen) // the Evoke desktop app reads the newest saved usage for its HUD
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
    await openProjects($)
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
                autoFocus={i === 0 ? true : undefined}
                onPress={async () => {
                  if (isHere) return $.ui.close({ id: PROJECTS }) // Already here: a second window helps nobody.
                  const opener = openerOf(p.path, (await $.env.get('OS')) === 'Windows_NT', await $.env.get('TERM_PROGRAM'))
                  // A terminal that is not installed rejects rather than exiting non-zero.
                  const { exitCode, stderr } = opener ? await $.process.run(opener).catch(e => ({ exitCode: 1, stderr: String(e) })) : { exitCode: 1, stderr: '이 경로는 열 수 없어요.' }
                  if (exitCode !== 0) $.ui.toast(`열지 못했어요: ${stderr.trim()}`)
                  else await $.ui.close({ id: PROJECTS })
                }}
              >
                <Text backgroundColor={ground} color={isHere ? K.RED : K.WHITE} bold italic>{fitName(p.name, e.props.bodyColumns - 12)}{isHere ? '  ◀ NOW' : ''}</Text>
              </Button>
              <Text backgroundColor={ground} color={isHere ? K.BLACK : K.ICE} wrap="truncate">   {p.path}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })

  on('command.run', { command: 'menu' }, async $ => {
    if (!isSetUp) await setUp($)
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
    const width = e.props.bodyColumns - 2
    // With room for it, the names stand in a crooked column, one to a row.
    const isTall = e.props.scroll.bodyRows >= 28
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
      rows: Math.max(8, e.props.scroll.bodyRows - PLAIN_ROWS - (isTall ? MENUS.length - 1 : 0)),
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
        <Button key="projects" plain hotkey="p" label="프로젝트" onPress={() => openProjects($)} />
        <Text>  </Text>
        <Button key="skillbook" plain hotkey="s" label="스킬북" onPress={() => $.prompt.fill({ text: '/skillbook' })} />
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        {hud(view, dayOf(ms))}
        <Box marginTop={1}>{section({ Box, Text, Button }, width, <Text backgroundColor={K.MIDNIGHT} color={K.WHITE} bold>MENU</Text>, `${MENUS.indexOf(on_) + 1}/${MENUS.length}`)}</Box>
        <Box flexWrap="wrap" flexDirection={isTall ? 'column' : 'row'}>
          {MENUS.map((m, i) => (
            <Box key={m} marginRight={1} marginLeft={isTall ? Math.round(((ITEM_ROWS[i] as { x: number }).x - 440) / 25) : 0}>
              <Button key={m} plain hotkey={String(i + 1)} onPress={() => pick(m)}>
                {/* The art's selection: a white plate, black name, pink edge. */}
                {m === on_ ? cut(Text, m, K.WHITE, K.BLACK) : <Text color={[K.CYAN, K.ICE, '#2FC6FA'][i % 3]} bold italic>{m}</Text>}
              </Button>
              {m === on_ ? <Text color={K.PINK} bold>◣</Text> : null}
            </Box>
          ))}
        </Box>
        {/* The keys stand above the content: a short pane (inline, under 110 columns) cuts its last rows, and those must be the log's, not the controls'. */}
        {action(view, SAYS[on_], keys, e.props.isFocused)}
        <Box marginTop={1}>{content(view)}</Box>
      </Box>
    )
  })
}
