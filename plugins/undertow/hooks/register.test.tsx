import { expect, test } from 'claude-code/testing'

import { baseName, dayOf, entryOf, fitName, gauge, layoutOf, menuOf, monthOf, moon, openerOf, pageOf, projectsOf, rank, samePath, skillRows, skillsOf, slotsOf, tallied, untilReset } from './data'
import { ART, GRID, ITEM_ROWS } from './tokens.js'

declare const setTimeout: (done: (value?: unknown) => void, ms: number) => void

test('tools land on their menu, ranks cap, the moon is right', async () => {
  expect(menuOf('Bash')).toBe('SYSTEM')
  expect(menuOf('Edit')).toBe('ITEM')
  expect(menuOf('mcp__x__y')).toBe('EQUIP')
  expect(rank(0)).toBe('')
  expect(rank(7)).toBe('RANK 2')
  expect(rank(50)).toBe('MAX')
  expect(moon(Date.UTC(2026, 10, 9, 12))).toBe('New Moon')
  expect(moon(Date.UTC(2026, 10, 24, 12))).toBe('Full Moon')
})

test('the art keeps its shape and hands over its rows', async () => {
  const full = layoutOf(56, 41, ART, GRID)
  expect(full).toEqual({ height: 41, columns: 56, content: 22, footer: 38, scale: 1 })
  expect(layoutOf(56, 60, ART, GRID)?.height).toBe(41) // A taller pane leaves water below, not a stretched picture.
  expect(layoutOf(56, 30, ART, GRID)?.columns).toBe(41) // A shorter one shrinks the picture whole.
  expect(layoutOf(30, 40, ART, GRID)).toBeNull()
  expect(layoutOf(56, 20, ART, GRID)).toBeNull()
})

test('every menu name keeps a row of its own at the smallest art', async () => {
  const small = layoutOf(56, 28, ART, GRID)!
  const rows = ITEM_ROWS.map((r: { y: number }) => Math.round((r.y / ART.cellY - 0.5) * small.scale))
  expect(new Set(rows).size).toBe(ITEM_ROWS.length)
  expect(Math.max(...rows)).toBeLessThan(small.content)
})

test('a tool call shows in the band guide', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('ui.blit', () => ({ value: {} }))
  on('clock.sleep', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 6) }))
  await ($.tool as any).call({ tool: 'Bash', command: 'ls' })
  await new Promise(done => setTimeout(done, 5)) // the cut-in settles the state after the call
  const ui = await $.ui.mount({
    plugin: 'undertow',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as never)
  expect((await ui.find({ type: 'Text', text: /^Bash$/ }))?.text).toBe('Bash')
  await ui.unmount()
})

test('the usage gauge stays in range', async () => {
  expect(gauge(50, 10)).toBe(5)
  expect(gauge(180, 4)).toBe(4)
  expect(gauge(-5, 4)).toBe(0)
})

test('only trusted real project paths are offered, bad data gives none', async () => {
  const json = JSON.stringify({ projects: {
    '/home/me': { hasTrustDialogAccepted: true },
    '/home/me/app': { hasTrustDialogAccepted: true },
    '/home/me/untrusted': {},
    '/home/me/Library/scratch': { hasTrustDialogAccepted: true },
  } })
  expect(projectsOf(json, '/home/me')).toEqual([{ name: 'app', path: '/home/me/app' }])
  expect(projectsOf('not json', '/home/me')).toEqual([])
  const twice = JSON.stringify({ projects: { ['/a/한글']: { hasTrustDialogAccepted: true }, ['/a/한글'.normalize('NFD')]: { hasTrustDialogAccepted: true } } })
  expect(projectsOf(twice, '/x')).toHaveLength(1)
})

test('skills sort by use and leave out Undertow and built-ins', async () => {
  const c = (name: string, source: 'plugin' | 'user' | 'builtin', plugin?: string) => ({ name, description: '', source, plugin })
  const found = skillsOf([c('help', 'builtin'), c('menu', 'plugin', 'undertow'), c('alpha', 'user'), c('x:beta', 'plugin', 'x')], { 'x:beta': 2 })
  expect(found.map(s => s.name)).toEqual(['x:beta', 'alpha'])
  expect(found.map(s => s.plugin)).toEqual(['x', 'personal'])
})

test('reset countdown reads short and hides a past or missing time', async () => {
  const now = Date.UTC(2026, 0, 1)
  expect(untilReset(new Date(now + 5 * 60000).toISOString(), now)).toBe('5m')
  expect(untilReset(new Date(now + 133 * 60000).toISOString(), now)).toBe('2h13m')
  expect(untilReset(new Date(now + 26 * 3600000).toISOString(), now)).toBe('1d2h')
  expect(untilReset(new Date(now - 1000).toISOString(), now)).toBe('')
  expect(untilReset(undefined, now)).toBe('')
})

test('the skillbook draws its skills', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  on('command.list', () => ({ value: [{ name: 'x:beta', description: 'does beta', source: 'plugin', plugin: 'x' }] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'skillbook', args: '' } as never)
  const ui = await $.ui.mount({
    plugin: 'undertow',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'undertow-skills',
    props: { title: 'SKILLBOOK', isFocused: true, bodyColumns: 56, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  expect((await ui.find({ type: 'Text', text: /x:beta/ }))?.text).toContain('x:beta')
  await ui.unmount()
})

test('a tool call is logged by what it worked on', async () => {
  expect(entryOf('Read', { file_path: '/a/b/c.ts' })).toBe('c.ts')
  expect(entryOf('Bash', { command: 'ls -la\nrm x' })).toBe('Bash ls -la')
  expect(entryOf('TaskList', {})).toBe('TaskList')
  expect(entryOf('Bash', { command: 'a\u001b]0;b\u0007c' })).toBe('Bash a ]0;b c')
})

const skill = (name: string, plugin = 'x') => ({ name, description: `does ${name}`, plugin })

test('skills page by what fits and a group never ends a page', async () => {
  const rows = skillRows([skill('x:a'), skill('x:b'), skill('x:c'), skill('y:d', 'y')])
  const first = pageOf(rows, 7, 0)
  expect(first.pages).toBe(2)
  expect(first.rows.map(r => (r.kind === 'group' ? r.name : r.skill.name))).toEqual(['x', 'x:a', 'x:b', 'x:c'])
  expect(pageOf(rows, 7, 1).rows.map(r => (r.kind === 'group' ? r.name : r.skill.name))).toEqual(['y', 'y:d'])
  expect(pageOf(rows, 7, 2).page).toBe(0) // The pages wrap around.
  expect(pageOf(rows, 7, -1).page).toBe(1)
  expect(pageOf([], 7, 0).pages).toBe(1)
})

test('long names are cut to their row, short ones left alone', async () => {
  expect(fitName('abc', 5)).toBe('abc')
  expect(fitName('abcdefgh', 5)).toBe('abcd…')
})

test('the logs fold into what each menu shows', async () => {
  expect(tallied(['a', 'b', 'a'])).toEqual([{ name: 'a', count: 2 }, { name: 'b', count: 1 }])
  expect(slotsOf(['mcp__figma__use x', 'mcp__figma__old', 'mcp__a_b__c', 'Bash ls'])).toEqual([
    { server: 'figma', tool: 'use', count: 2 },
    { server: 'a_b', tool: 'c', count: 1 },
  ])
})

test('the month starts on its real weekday', async () => {
  const m = monthOf(new Date(2026, 10, 6).getTime())
  expect(m.weeks[0]).toEqual([1, 2, 3, 4, 5, 6, 7]) // November 2026 opens on a Sunday.
  expect(m.today).toBe(6)
  expect(m.weeks.flat().filter(Boolean)).toHaveLength(30)
  expect(dayOf(new Date(2026, 10, 6, 12).getTime()).date).toBe('11/06 FRI')
})

test('each menu draws its own content at every size, however long its log', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('ui.blit', () => ({ value: {} }))
  on('clock.sleep', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 6) }))
  const long = 'x'.repeat(400)
  const calls: [Record<string, unknown>, RegExp][] = [
    [{ tool: 'Read', file_path: `/a/${long}.ts` }, /xxx/],
    [{ tool: 'mcp__figma__use', query: long }, /figma/],
    [{ tool: 'Agent', description: long }, /LATEST/],
    [{ tool: 'TaskList' }, /TaskList/],
    [{ tool: 'WebFetch', url: `https://a.b/${long}` }, /a\.b/],
    [{ tool: 'Bash', command: `ls ${long}` }, /ls x/],
  ]
  for (const [call, shows] of calls) {
    await ($.tool as any).call(call)
    await new Promise(done => setTimeout(done, 5))
    for (const [bodyColumns, bodyRows] of [[56, 41], [56, 30], [30, 40], [56, 12], [200, 90]] as const) {
      const ui = await ($.ui as any).mount({
        plugin: 'undertow',
        surface: 'terminal',
        component: 'Pane',
        requestId: 'undertow',
        props: { title: 'UNDERTOW', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
      })
      expect(await ui.find({ type: 'Text', text: shows })).toBeTruthy()
      await ui.unmount()
    }
  }
})

test('the keys still move the menu, fill the prompt and turn the page', async ($, on) => {
  const filled: string[] = []
  on('ui.blit', () => ({ value: {} }))
  on('clock.sleep', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 6) }))
  on('store.get', () => ({ value: undefined }))
  on('prompt.fill', (_$, e) => {
    filled.push(e.text)
    return { isFilled: true } as never
  })
  on('command.list', () => ({ value: Array.from({ length: 30 }, (_, i) => ({ name: `x:skill${i}`, description: 'd', source: 'plugin', plugin: 'x' })) }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'skillbook', args: '' } as never) // loads the skills
  const ui = await $.ui.mount({
    plugin: 'undertow',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'undertow',
    props: { title: 'UNDERTOW', isFocused: true, bodyColumns: 56, placement: 'dock', scroll: { offset: 0, bodyRows: 41 }, view: {} },
  })
  const shows = async (text: RegExp) => expect(await ui.find({ type: 'Text', text })).toBeTruthy()
  await shows(/^\/skills/)
  await shows(/skill0$/)
  await ui.press({ key: 'pageNext' })
  expect(await ui.find({ type: 'Text', text: /skill0$/ })).toBeUndefined()
  await ui.press({ key: 'down' })
  await shows(/^\/context/)
  await ui.press({ key: 'up' })
  await shows(/^\/skills/)
  await shows(/skill0$/) // A menu change goes back to the first page.
  await ui.press({ key: 'run' })
  expect(filled).toEqual(['/skills'])
  await ui.press({ key: 'SYSTEM' })
  await shows(/^\/config/)
  expect(filled).toEqual(['/skills', '/config'])
  await ui.press({ key: 'projects' })
  await ui.press({ key: 'skillbook' })
  expect(filled.slice(-2)).toEqual(['/projects', '/skillbook'])
  await ui.unmount()
})

test('windows paths are understood and an unsafe one is not opened', async () => {
  expect(baseName('C:\\Users\\me\\a.ts')).toBe('a.ts')
  expect(baseName('/a/b/')).toBe('b')
  expect(samePath('C:\\a\\b', 'C:/a/b')).toBe(true)
  const json = JSON.stringify({ projects: {
    'C:/Users/me': { hasTrustDialogAccepted: true },
    'C:/Users/me/app': { hasTrustDialogAccepted: true },
    'C:/Users/me/AppData/Local/Temp/x': { hasTrustDialogAccepted: true },
    'relative/path': { hasTrustDialogAccepted: true },
  } })
  expect(projectsOf(json, 'C:\\Users\\me')).toEqual([{ name: 'app', path: 'C:/Users/me/app' }])
  expect(openerOf('C:/a', true)).toEqual(['wt', '-d', 'C:/a'])
  expect(openerOf('C:/a; calc', true)).toBeNull()
  expect(openerOf('/a', false, 'ghostty')?.[0]).toBe('open')
})

test('a windows session starts with no unix tools and no git, and opens a project in Windows Terminal', async ($: any, on: any) => {
  const ran: string[][] = []
  const env: Record<string, string> = { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\me' }
  on('process.run', (_: any, e: any) => {
    ran.push([...e.argv])
    if (e.argv[0] !== 'wt') throw new Error(`spawn ${e.argv[0]} ENOENT`)
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('env.get', (_: any, e: any) => ({ value: env[e.name] }))
  on('fs.read', () => ({ value: JSON.stringify({ projects: { 'C:/Users/me/app': { hasTrustDialogAccepted: true } } }) }))
  on('fs.exists', () => ({ value: true }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { context: {}, rateLimits: [] } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  on('command.list', () => ({ value: [] }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 6) }))
  await $.session.start({ cwd: 'C:\\Users\\me\\app', surface: 'terminal', isInteractive: true })
  const props = (title: string, bodyColumns = 56) => ({ title, isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 41 }, view: {} })
  const pane = await $.ui.mount({ plugin: 'undertow', surface: 'terminal', component: 'Pane', requestId: 'undertow', props: props('UNDERTOW') })
  expect(await pane.findAll({ type: 'Image' })).toHaveLength(0) // Windows Terminal draws plain rows.
  expect(await pane.find({ type: 'Text', text: /SKILL/ })).toBeTruthy()
  await pane.unmount()
  await $.command.run({ command: 'projects', args: '' })
  const picker = await $.ui.mount({ plugin: 'undertow', surface: 'terminal', component: 'Pane', requestId: 'undertow-projects', props: props('PROJECT') })
  expect((await picker.find({ type: 'Text', text: /NOW/ }))?.text).toContain('app')
  await picker.press({ key: 'C:/Users/me/app' })
  expect(ran.at(-1)).toEqual(['wt', '-d', 'C:/Users/me/app'])
  await picker.unmount()
})
