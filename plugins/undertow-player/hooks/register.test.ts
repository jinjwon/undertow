import { expect, test } from 'claude-code/testing'
import { artId, bgm, clamp, now, parseLink, start } from './register'

const SONG = 'spotify:album:abcdefghij1234567890'
const ROW = (state: string, ms = '180000') => `${state}\tSong\tArtist\tAlbum\t12.5\t${ms}\t45\n`
const sleep = async () => {}

// The app as a tiny state machine: each status ask reads the next row, then the last one forever.
const fake = (rows: string[]) => {
  const calls: string[] = []
  const run = async (argv: readonly string[]) => {
    calls.push(argv.join(' '))
    const isAsk = argv.join(' ').includes('is running')
    return { exitCode: 0, stdout: isAsk ? (rows.length > 1 ? rows.shift() as string : rows[0]) : '', stderr: '' }
  }
  return { calls, run }
}

test('reads a track, in each app\'s duration unit', async () => {
  expect((await now(fake([ROW('playing')]).run, 'spotify'))?.duration).toBe(180)
  expect((await now(fake([ROW('playing', '180')]).run, 'music'))?.duration).toBe(180)
  expect(await now(fake([ROW('playing')]).run, 'youtube')).toBe(null)
})

test('a late "playing" still counts as started', async () => {
  const { run } = fake([ROW('paused'), ROW('paused'), ROW('playing')])
  expect((await start(run, sleep, 'spotify', SONG))?.isPlaying).toBe(true)
})

test('launches hidden and without focus when the app is not running', async () => {
  const { run, calls } = fake(['', ROW('paused'), ROW('playing')])
  await start(run, sleep, 'music', '')
  expect(calls).toContain('open -gj -a Music')
  expect(calls.some(c => c.includes('activate'))).toBe(false)
})

test('a new link replaces what plays; autostart leaves it alone', async () => {
  const kept = fake([ROW('playing')])
  await start(kept.run, sleep, 'spotify', SONG, { keepPlaying: true })
  expect(kept.calls.some(c => c.includes('play track'))).toBe(false)
  const replaced = fake([ROW('playing')])
  await start(replaced.run, sleep, 'spotify', SONG, { isNew: true })
  expect(replaced.calls.some(c => c.includes(`play track "${SONG}"`))).toBe(true)
})

test('each app gets its own back command, ranges hold, bad input shows usage', async () => {
  expect(clamp(120, 0, 100)).toBe(100)
  const { run, calls } = fake([ROW('playing')])
  await bgm(run, sleep, 'music', '', 'prev')
  expect(calls.some(c => c.includes('application "Music" to back track'))).toBe(true)
  await bgm(run, sleep, 'spotify', '', 'vol 120')
  expect(calls.some(c => c.includes('set sound volume to 100'))).toBe(true)
  await bgm(run, sleep, 'spotify', '', 'seek -100')
  expect(calls.some(c => c.includes('set player position to 0'))).toBe(true)
  expect(await bgm(run, sleep, 'spotify', '', 'vol loud')).toContain('사용법')
})

test('YouTube only opens the chosen link, and only when asked', async () => {
  const { run, calls } = fake([''])
  expect(await bgm(run, sleep, 'youtube', '', 'play')).toContain('링크')
  expect(await bgm(run, sleep, 'youtube', 'https://youtu.be/abcdefg', 'next')).toContain('브라우저')
  expect(calls).toHaveLength(0)
  await bgm(run, sleep, 'youtube', 'https://youtu.be/abcdefg', 'play')
  expect(calls).toEqual(['open https://youtu.be/abcdefg'])
})

test('links resolve to their service; anything that could inject is refused', async () => {
  expect(parseLink('https://open.spotify.com/intl-ko/album/abcdefghij1234567890?si=x1')).toEqual({ source: 'spotify', pick: SONG })
  expect(parseLink(SONG)?.source).toBe('spotify')
  expect(parseLink('https://music.apple.com/kr/album/some-album/123456789')?.source).toBe('music')
  expect(parseLink('https://www.youtube.com/watch?v=abc123&list=xyz')?.source).toBe('youtube')
  expect(parseLink('https://youtu.be/abc123def')?.source).toBe('youtube')
  expect(parseLink('spotify:album:abc" to quit')).toBe(null)
  expect(parseLink('https://music.apple.com/kr/album/x"; do shell script "id')).toBe(null)
  expect(parseLink('https://evil.example/watch?v=1')).toBe(null)
  expect(parseLink('https://youtube.com.evil.example/watch?v=1')).toBe(null)
  expect(parseLink('file:///etc/passwd')).toBe(null)
})

test('only plain Spotify image URLs are fetched', async () => {
  expect(artId('https://i.scdn.co/image/ab67616d0000b273ffb55e7e9036d352382d4265')).toBe('ab67616d0000b273ffb55e7e9036d352382d4265')
  expect(artId('https://evil.example/image/ab67616d0000b273')).toBe(null)
  expect(artId('https://i.scdn.co/image/abcd1234abcd1234 -o /tmp/x')).toBe(null)
})
