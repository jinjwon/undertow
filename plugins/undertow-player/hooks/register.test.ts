import { expect, test } from 'claude-code/testing'
import { artId, bgm, clamp, now, start } from './register'

const ROW = (state: string, album = 'Persona 3 Reload (Original Soundtrack)') => `${state}\tFull Moon Full Life\tLotus Juice\t${album}\t12.5\t293493\t45\n`
const sleep = async () => {}

// Spotify as a tiny state machine: playing only shows up on the second ask after play.
const fake = (rows: string[]) => {
  const calls: string[] = []
  const run = async (argv: readonly string[]) => {
    calls.push(argv.join(' '))
    const isAsk = argv.join(' ').includes('is running')
    return { exitCode: 0, stdout: isAsk ? (rows.length > 1 ? rows.shift() as string : rows[0]) : '', stderr: '' }
  }
  return { calls, run }
}

test('reads a track', async () => {
  const t = await now(fake([ROW('playing')]).run)
  expect(t?.title).toBe('Full Moon Full Life')
  expect(t?.duration).toBe(293.493)
  expect(t?.volume).toBe(45)
})

test('a late "playing" still counts as started (the old false alarm)', async () => {
  const { run } = fake([ROW('paused'), ROW('paused'), ROW('playing')])
  expect((await start(run, sleep))?.isPlaying).toBe(true)
})

test('launches hidden and without focus when Spotify is not running', async () => {
  const { run, calls } = fake(['', ROW('paused'), ROW('playing')])
  await start(run, sleep)
  expect(calls.some(c => c === 'open -gj -a Spotify')).toBe(true)
  expect(calls.some(c => c.includes('activate'))).toBe(false)
})

test('autostart leaves other music alone, /bgm replaces it', async () => {
  const other = ROW('playing', 'Other Album')
  const kept = fake([other])
  await start(kept.run, sleep, { keepOther: true })
  expect(kept.calls.some(c => c.includes('play track'))).toBe(false)
  const replaced = fake([other, ROW('playing')])
  await start(replaced.run, sleep)
  expect(replaced.calls.some(c => c.includes('play track'))).toBe(true)
})

test('volume and seek stay in range; bad input shows usage', async () => {
  expect(clamp(120, 0, 100)).toBe(100)
  const { run, calls } = fake([ROW('playing')])
  await bgm(run, sleep, 'vol 120')
  expect(calls.some(c => c.includes('set sound volume to 100'))).toBe(true)
  await bgm(run, sleep, 'seek -100')
  expect(calls.some(c => c.includes('set player position to 0'))).toBe(true)
  expect(await bgm(run, sleep, 'vol loud')).toContain('사용법')
})

test('nothing ever opens YouTube unless asked', async () => {
  const { run, calls } = fake([''])
  expect(await bgm(run, sleep, 'next')).toContain('Spotify')
  expect(calls.some(c => c.includes('youtube'))).toBe(false)
})

test('only plain Spotify image URLs are fetched', async () => {
  expect(artId('https://i.scdn.co/image/ab67616d0000b273ffb55e7e9036d352382d4265')).toBe('ab67616d0000b273ffb55e7e9036d352382d4265')
  expect(artId('https://evil.example/image/ab67616d0000b273')).toBe(null)
  expect(artId('https://i.scdn.co/image/../../etc/passwd')).toBe(null)
  expect(artId('https://i.scdn.co/image/abcd1234abcd1234 -o /tmp/x')).toBe(null)
})
