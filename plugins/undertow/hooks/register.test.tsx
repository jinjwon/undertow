import { expect, test } from 'claude-code/testing'

import { fit, gauge, menuOf, moon, projectsOf, rank } from './register'

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

test('the art keeps its shape and leaves room for the footer', async () => {
  expect(fit(43, 44)).toEqual({ columns: 43, rows: 18 })
  expect(fit(56, 44)).toEqual({ columns: 56, rows: 24 })
  expect(fit(90, 20)).toEqual({ columns: 9, rows: 4 })
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
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await new Promise(done => setTimeout(done, 5)) // the cut-in settles the state after the call
  const ui = await $.ui.mount({
    plugin: 'undertow',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  expect((await ui.find({ type: 'Text', text: /^Bash$/ }))?.text).toBe('Bash')
  await ui.unmount()
})

test('the usage gauge stays in range', async () => {
  expect(gauge(50, 10)).toBe('▰▰▰▰▰▱▱▱▱▱')
  expect(gauge(180, 4)).toBe('▰▰▰▰')
  expect(gauge(-5, 4)).toBe('▱▱▱▱')
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
