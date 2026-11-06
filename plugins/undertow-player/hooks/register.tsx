import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Track } from '../types'

const ALBUM = 'spotify:album:20Bf2RVERC5Bc2eo3vyvJv'
const YOUTUBE = 'https://www.youtube.com/watch?v=hWhgrA2dhrk&list=OLAK5uy_kILJykItHLDNnsQnjCPGd6Uzk2NqqUbf4'
const OST = 'Persona 3 Reload'
const USAGE = '/bgm [play | pause | next | prev | now | vol 0-100 | seek +10 | on | off | youtube]'
const NO_APP = 'Spotify를 찾거나 재생하지 못했어요. Spotify 앱 로그인 상태를 확인해 주세요.'

// `is running` first: a bare `tell` would relaunch a Spotify the person just quit.
const NOW = `if application "Spotify" is running then
  tell application "Spotify"
    if current track is missing value then return ""
    return (player state as text) & tab & (name of current track) & tab & (artist of current track) & tab & (album of current track) & tab & (player position as text) & tab & (duration of current track as text) & tab & (sound volume as text) & tab & (artwork url of current track)
  end tell
end if`

type Run = (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
type Sleep = (ms: number) => Promise<void>

const track = atom({ plugin: 'undertow-player', key: 'track' } as const, null)
const didStart = atom({ plugin: 'undertow-player', key: 'didStart' } as const, false)
const note = atom({ plugin: 'undertow-player', key: 'note' } as const, '')
const cover = atom({ plugin: 'undertow-player', key: 'cover' } as const, '')
const isChanging = atom({ plugin: 'undertow-player', key: 'isChanging' } as const, false)

const spotify = (run: Run, script: string) => run(['osascript', '-e', `tell application "Spotify" to ${script}`])

export const now = async (run: Run): Promise<Track | null> => {
  const { exitCode, stdout } = await run(['osascript', '-e', NOW])
  if (exitCode !== 0) return null
  const [state, title, artist, album, position, duration, volume, art] = stdout.replace(/\n$/, '').split('\t')
  if (!title) return null
  return { isPlaying: state === 'playing', title, artist, album, position: Number(position), duration: Number(duration) / 1000, volume: Number(volume), art: art ?? '' }
}

// Spotify reports "playing" a moment after the request, so asking once right away reads as a failure.
const settle = async (run: Run, sleep: Sleep, isDone: (t: Track | null) => boolean) => {
  let t = await now(run)
  for (let i = 0; i < 16 && !isDone(t); i++) {
    await sleep(500)
    t = await now(run)
  }
  return t
}

// -g keeps focus here and -j launches it hidden: the album plays without Spotify coming forward.
export const start = async (run: Run, sleep: Sleep, { keepOther = false } = {}): Promise<Track | null> => {
  let t = await now(run)
  if (t?.isPlaying && (keepOther || t.album.includes(OST))) return t
  if (!t) {
    if ((await run(['open', '-gj', '-a', 'Spotify'])).exitCode !== 0) return null
    t = await settle(run, sleep, Boolean)
  }
  await spotify(run, t?.album.includes(OST) ? 'play' : `play track "${ALBUM}"`)
  return settle(run, sleep, x => Boolean(x?.isPlaying))
}

// Only Spotify's own image host is ever fetched; the id becomes a file name, so it must be plain hex.
export const artId = (url: string) => /^https:\/\/i\.scdn\.co\/image\/([0-9a-f]{16,64})$/.exec(url)?.[1] ?? null

const fetchArt = async (run: Run, root: string, url: string) => {
  const id = artId(url)
  if (!id) return ''
  const file = `${root}/.art/${id}.png`
  if ((await run(['test', '-f', file])).exitCode === 0) return file
  await run(['mkdir', '-p', `${root}/.art`])
  const raw = `${root}/.art/${id}.jpg`
  if ((await run(['curl', '-fsS', '--max-time', '8', '-o', raw, url])).exitCode !== 0) return ''
  const { exitCode } = await run(['sips', '-s', 'format', 'png', raw, '--out', file])
  await run(['rm', '-f', raw])
  return exitCode === 0 ? file : ''
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export const line = (t: Track) => `${t.isPlaying ? '♪' : '■'} ${t.title} - ${t.artist}  ${clock(t.position)}/${clock(t.duration)}  VOL ${t.volume}`
export const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))

export const bgm = async (run: Run, sleep: Sleep, args: string): Promise<string> => {
  const [action = 'play', value = ''] = args.trim().toLowerCase().split(/\s+/).filter(Boolean)

  if (action === 'youtube' || action === 'yt') {
    const { exitCode, stderr } = await run(['open', YOUTUBE])
    return exitCode === 0 ? '♪ YouTube에서 재생목록을 열었어요.' : `YouTube를 열지 못했어요: ${stderr.trim()}\n${YOUTUBE}`
  }

  if (action === 'play') {
    const t = await start(run, sleep)
    return t?.isPlaying ? line(t) : NO_APP
  }

  const t = await now(run)
  if (action === 'now') return t ? line(t) : '재생 중인 곡이 없어요. /bgm으로 시작하세요.'

  const number = Number(value)
  const script = new Map<string, string | undefined>([
    ['pause', 'pause'],
    ['toggle', 'playpause'],
    ['next', 'next track'],
    ['prev', 'previous track'],
    ['vol', value && !Number.isNaN(number) ? `set sound volume to ${clamp(number, 0, 100)}` : undefined],
    ['seek', t && value && !Number.isNaN(number) ? `set player position to ${clamp(/^[+-]/.test(value) ? t.position + number : number, 0, t.duration)}` : undefined],
  ]).get(action)
  if (!script) return `사용법: ${USAGE}`
  if (!t) return NO_APP

  const { exitCode } = await spotify(run, script)
  if (exitCode !== 0) return NO_APP
  const after = await now(run)
  return after ? line(after) : NO_APP
}

export const register: Register = on => {
  let isPolling = false
  let lastTitle = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'bgm', description: `Spotify player: ${USAGE}` })
    const run: Run = argv => $.process.run(argv)
    const sleep: Sleep = ms => $.clock.sleep(ms)

    $.clock.every(1000, async () => {
      if (isPolling) return
      isPolling = true
      try {
        const t = await now(run)
        const key = t?.title ?? ''
        await update($, isChanging, () => key !== lastTitle)
        if (key !== lastTitle && t) {
          const file = await fetchArt(run, $.plugin.root, t.art)
          await update($, cover, () => file)
        }
        lastTitle = key
        await update($, track, () => t)
      } finally {
        isPolling = false
      }
    })

    // A reload runs session.start again; only the first one may press play.
    if (!(await read($, didStart)) && (await $.store.get('autoplay')) !== false) {
      await update($, didStart, () => true)
      void start(run, sleep, { keepOther: true }).then(t => {
        if (!t?.isPlaying) void update($, note, () => NO_APP)
      })
    }

    return next(e)
  })

  on('command.run', { command: 'bgm' }, async ($, e) => {
    const action = e.args.trim().toLowerCase()
    if (action === 'on' || action === 'off') {
      await $.store.set('autoplay', action === 'on')
      return { text: action === 'on' ? '다음 실행부터 자동 재생해요.' : '다음 실행부터 자동 재생하지 않아요.' }
    }
    return { text: await bgm(argv => $.process.run(argv), ms => $.clock.sleep(ms), e.args) }
  })

  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear' && (await read($, didStart))) await spotify(argv => $.process.run(argv), 'pause')
    return next(e)
  })

  // Drawn inside the menu pane as its own device: a chassis, a lit display, physical keys.
  on('ui.render', { component: 'Pane', requestId: 'undertow' }, async ($, e, next) => {
    const inner = await next(e)
    const t = await read($, track)
    const message = await read($, note)
    const art = await read($, cover)
    const isFlash = await read($, isChanging)
    const { Box, Button, Image, Text } = $.ui.resolve(e)
    const press = (args: string) => async () => {
      const said = await bgm(argv => $.process.run(argv), ms => $.clock.sleep(ms), args)
      await update($, note, () => (said === NO_APP ? NO_APP : ''))
      const fresh = await now(argv => $.process.run(argv))
      await update($, track, () => fresh)
    }
    const LCD = isFlash ? '#FFFFFF' : '#BFF3FF'
    const INK = '#050B4A'
    const BODY = '#0A0F2A'
    const width = Math.max(6, e.props.bodyColumns - 16)
    const at = t?.duration ? Math.min(width - 1, Math.floor((t.position / t.duration) * width)) : 0
    const vol = t ? clamp(Math.round(t.volume / 10), 0, 10) : 0
    const gap = (n: number) => <Text backgroundColor={BODY}>{' '.repeat(n)}</Text>

    const device = (
      <Box flexDirection="column" borderStyle="round" borderColor="#FFFFFF" backgroundColor={BODY}>
        <Box backgroundColor={BODY}>
          {art ? (
            <Image key="cover" source={{ file: art, format: 'png' }} columns={10} rows={4} alt="album" />
          ) : (
            <Box width={10} height={4} backgroundColor="#0D35D0" justifyContent="center" alignItems="center">
              <Text backgroundColor="#0D35D0" color="#FFFFFF" bold>♪</Text>
            </Box>
          )}
          {gap(1)}
          <Box flexDirection="column" flexGrow={1} backgroundColor={LCD}>
            <Text backgroundColor={LCD} color={t ? INK : '#E8101E'} bold wrap="truncate"> {t ? (t.isPlaying ? '▶ PLAYING' : '■ PAUSED') : '✕ SPOTIFY 연결 안 됨'}</Text>
            <Text backgroundColor={LCD} color={INK} bold wrap="truncate"> {t?.title ?? (message || 'Spotify 앱이 꺼져 있어요')}</Text>
            <Text backgroundColor={LCD} color={INK} wrap="truncate"> {t?.artist ?? '아래 ▶로 연결'}</Text>
            <Text backgroundColor={LCD} color={message ? '#E8101E' : INK} wrap="truncate"> {message || (t ? `${clock(t.position)} / ${clock(t.duration)}` : '')}</Text>
          </Box>
        </Box>
        <Box backgroundColor={BODY}>
          <Text backgroundColor={BODY} color="#6FE3FF">{t ? clock(t.position).padStart(5) : ' -:--'} </Text>
          {Array.from({ length: width }, (_, i) => (
            <Button key={`seek${i}`} plain label={i === at ? '◆' : i < at ? '━' : '─'} onPress={press(`seek ${Math.round(((t?.duration ?? 0) * i) / width)}`)} />
          ))}
          <Text backgroundColor={BODY} color="#6FE3FF"> {t ? clock(t.duration) : '-:--'}</Text>
        </Box>
        <Box backgroundColor={BODY}>
          {gap(1)}
          <Button key="prev" plain label="⏮" onPress={press('prev')} />
          {gap(2)}
          <Button key="toggle" plain label={t?.isPlaying ? '⏸' : '▶'} onPress={press(t ? 'toggle' : 'play')} />
          {gap(2)}
          <Button key="next" plain label="⏭" onPress={press('next')} />
          {gap(3)}
          <Button key="down" plain label="−" onPress={press(`vol ${(t?.volume ?? 0) - 10}`)} />
          <Text backgroundColor={BODY} color="#FF2E88"> {'▮'.repeat(vol)}</Text>
          <Text backgroundColor={BODY} color="#6FE3FF">{'▯'.repeat(10 - vol)} </Text>
          <Button key="up" plain label="+" onPress={press(`vol ${(t?.volume ?? 0) + 10}`)} />
        </Box>
      </Box>
    )

    return <Box flexDirection="column">{inner}{device}</Box>
  })
}
