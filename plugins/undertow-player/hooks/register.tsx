import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Source, Track } from '../types'

const USAGE = '/bgm [<link> | play | pause | next | prev | now | vol 0-100 | seek +10 | source spotify|music|youtube | on | off]'
const APPS = {
  spotify: { app: 'Spotify', label: 'SPOTIFY', back: 'previous track', perSecond: 1000 },
  music: { app: 'Music', label: 'APPLE MUSIC', back: 'back track', perSecond: 1 },
} as const
const LABEL: Record<Source, string> = { spotify: 'SPOTIFY', music: 'APPLE MUSIC', youtube: 'YOUTUBE' }
const noApp = (source: Source) => `${LABEL[source]}를 재생하지 못했어요. 앱과 로그인 상태를 확인해 주세요.`
const YOUTUBE_NOTE = 'YouTube는 브라우저에서 조작해요.'

// `is running` first: a bare `tell` would relaunch an app the person just quit. `try`: Music has no current track when stopped.
const nowScript = (source: 'spotify' | 'music') => `if application "${APPS[source].app}" is running then
  tell application "${APPS[source].app}"
    try
      return (player state as text) & tab & (name of current track) & tab & (artist of current track) & tab & (album of current track) & tab & (player position as text) & tab & (duration of current track as text) & tab & (sound volume as text)${source === 'spotify' ? ' & tab & (artwork url of current track)' : ''}
    end try
  end tell
end if`

type Run = (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
type Sleep = (ms: number) => Promise<void>

const track = atom({ plugin: 'undertow-player', key: 'track' } as const, null)
const didStart = atom({ plugin: 'undertow-player', key: 'didStart' } as const, false)
const note = atom({ plugin: 'undertow-player', key: 'note' } as const, '')
const cover = atom({ plugin: 'undertow-player', key: 'cover' } as const, '')
const isChanging = atom({ plugin: 'undertow-player', key: 'isChanging' } as const, false)
const source = atom({ plugin: 'undertow-player', key: 'source' } as const, 'spotify')
const pick = atom({ plugin: 'undertow-player', key: 'pick' } as const, '')

const tell = (run: Run, from: 'spotify' | 'music', script: string) => run(['osascript', '-e', `tell application "${APPS[from].app}" to ${script}`])

// A link becomes a command argument and an AppleScript string, so only these exact shapes get through.
export const parseLink = (text: string): { source: Source; pick: string } | null => {
  const link = text.trim()
  const uri = /^spotify:(album|playlist|track|artist|show|episode):[A-Za-z0-9]{10,40}$/.exec(link)
  if (uri) return { source: 'spotify', pick: link }
  const web = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?(album|playlist|track|artist|show|episode)\/([A-Za-z0-9]{10,40})(?:\?[\w=&%-]*)?$/.exec(link)
  if (web) return { source: 'spotify', pick: `spotify:${web[1]}:${web[2]}` }
  if (/^https:\/\/music\.apple\.com\/[a-z]{2}\/(album|playlist|song|station)\/[\w%.~/-]+(\?[\w=&%.-]*)?$/.test(link)) return { source: 'music', pick: link }
  if (/^https:\/\/((www|music)\.)?youtube\.com\/(watch|playlist)\?[\w=&%.-]+$/.test(link) || /^https:\/\/youtu\.be\/[\w-]{6,}(\?[\w=&%.-]*)?$/.test(link)) return { source: 'youtube', pick: link }
  return null
}

export const now = async (run: Run, from: Source): Promise<Track | null> => {
  if (from === 'youtube') return null
  const { exitCode, stdout } = await run(['osascript', '-e', nowScript(from)])
  if (exitCode !== 0) return null
  const [state, title, artist, album, position, duration, volume, art] = stdout.replace(/\n$/, '').split('\t')
  if (!title) return null
  return { isPlaying: state === 'playing', title, artist, album, position: Number(position), duration: Number(duration) / (from === 'spotify' ? 1000 : 1), volume: Number(volume), art: art ?? '' }
}

// Apps report "playing" a moment after the request, so asking once right away reads as a failure.
const settle = async (run: Run, sleep: Sleep, from: Source, isDone: (t: Track | null) => boolean) => {
  let t = await now(run, from)
  for (let i = 0; i < 16 && !isDone(t); i++) {
    await sleep(500)
    t = await now(run, from)
  }
  return t
}

const playPick = async (run: Run, from: 'spotify' | 'music', chosen: string) => {
  if (!chosen) return tell(run, from, 'play')
  if (from === 'spotify') return tell(run, from, `play track "${chosen}"`)
  await run(['open', '-g', chosen.replace(/^https:/, 'music:')])
  return tell(run, from, 'play')
}

// -g keeps focus here and -j launches it hidden: music plays without the app coming forward.
export const start = async (run: Run, sleep: Sleep, from: 'spotify' | 'music', chosen: string, { isNew = false, keepPlaying = false } = {}): Promise<Track | null> => {
  let t = await now(run, from)
  if (t?.isPlaying && !isNew && (keepPlaying || !chosen)) return t
  if (!t) {
    if ((await run(['open', '-gj', '-a', APPS[from].app])).exitCode !== 0) return null
    t = await settle(run, sleep, from, Boolean)
  }
  // An app already holding a track resumes it; the saved link starts only when nothing is loaded, or was just set.
  await playPick(run, from, isNew || !t ? chosen : '')
  return settle(run, sleep, from, x => Boolean(x?.isPlaying))
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

export const bgm = async (run: Run, sleep: Sleep, from: Source, chosen: string, args: string): Promise<string> => {
  const [action = 'play', value = ''] = args.trim().split(/\s+/).filter(Boolean).map((w, i) => (i === 0 ? w.toLowerCase() : w))

  if (from === 'youtube') {
    if (action !== 'play') return YOUTUBE_NOTE
    if (!chosen) return 'YouTube 링크를 먼저 넣어 주세요: /bgm <링크>'
    const { exitCode, stderr } = await run(['open', chosen])
    return exitCode === 0 ? '♪ 브라우저에서 YouTube를 열었어요.' : `YouTube를 열지 못했어요: ${stderr.trim()}`
  }

  if (action === 'play') {
    const t = await start(run, sleep, from, chosen)
    return t?.isPlaying ? line(t) : noApp(from)
  }

  const t = await now(run, from)
  if (action === 'now') return t ? line(t) : '재생 중인 곡이 없어요. /bgm으로 시작하세요.'

  const number = Number(value)
  const script = new Map<string, string | undefined>([
    ['pause', 'pause'],
    ['toggle', 'playpause'],
    ['next', 'next track'],
    ['prev', APPS[from].back],
    ['vol', value && !Number.isNaN(number) ? `set sound volume to ${clamp(number, 0, 100)}` : undefined],
    ['seek', t && value && !Number.isNaN(number) ? `set player position to ${clamp(/^[+-]/.test(value) ? t.position + number : number, 0, t.duration)}` : undefined],
  ]).get(action)
  if (!script) return `사용법: ${USAGE}`
  if (!t) return noApp(from)

  const { exitCode } = await tell(run, from, script)
  if (exitCode !== 0) return noApp(from)
  const after = await now(run, from)
  return after ? line(after) : noApp(from)
}

export const register: Register = on => {
  let isPolling = false
  let lastTitle = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'bgm', description: `Music player: ${USAGE}` })
    const run: Run = argv => $.process.run(argv)
    const sleep: Sleep = ms => $.clock.sleep(ms)
    const savedSource = (await $.store.get('source')) as Source | undefined
    const savedPick = (await $.store.get('pick')) as string | undefined
    if (savedSource) await update($, source, () => savedSource)
    if (savedPick) await update($, pick, () => savedPick)

    $.clock.every(1000, async () => {
      if (isPolling) return
      isPolling = true
      try {
        const t = await now(run, await read($, source))
        const key = t?.title ?? ''
        await update($, isChanging, () => key !== lastTitle)
        if (key !== lastTitle) {
          const file = t ? await fetchArt(run, $.plugin.root, t.art) : ''
          await update($, cover, () => file)
        }
        lastTitle = key
        await update($, track, () => t)
      } finally {
        isPolling = false
      }
    })

    // Nothing plays until the person has chosen music. A reload runs this again; only the first run may press play.
    const from = await read($, source)
    const chosen = await read($, pick)
    if (chosen && from !== 'youtube' && !(await read($, didStart)) && (await $.store.get('autoplay')) !== false) {
      await update($, didStart, () => true)
      void start(run, sleep, from, chosen, { keepPlaying: true }).then(t => {
        if (!t?.isPlaying) void update($, note, () => noApp(from))
      })
    }

    return next(e)
  })

  on('command.run', { command: 'bgm' }, async ($, e) => {
    const run: Run = argv => $.process.run(argv)
    const sleep: Sleep = ms => $.clock.sleep(ms)
    const text = e.args.trim()
    const [word, value] = text.toLowerCase().split(/\s+/)

    if (word === 'on' || word === 'off') {
      await $.store.set('autoplay', word === 'on')
      return { text: word === 'on' ? '다음 실행부터 자동 재생해요.' : '다음 실행부터 자동 재생하지 않아요.' }
    }
    if (word === 'source') {
      if (value !== 'spotify' && value !== 'music' && value !== 'youtube') return { text: `사용법: ${USAGE}` }
      await update($, source, () => value)
      await update($, pick, () => '')
      await $.store.set('source', value)
      await $.store.set('pick', '')
      return { text: `${LABEL[value]}로 바꿨어요.` }
    }
    if (/^(https?:|spotify:)/i.test(text)) {
      const chosen = parseLink(text)
      if (!chosen) return { text: '지원하지 않는 링크예요. Spotify, Apple Music, YouTube 링크를 넣어 주세요.' }
      await update($, source, () => chosen.source)
      await update($, pick, () => chosen.pick)
      await $.store.set('source', chosen.source)
      await $.store.set('pick', chosen.pick)
      if (chosen.source === 'youtube') return { text: await bgm(run, sleep, 'youtube', chosen.pick, 'play') }
      const t = await start(run, sleep, chosen.source, chosen.pick, { isNew: true })
      return { text: t?.isPlaying ? line(t) : noApp(chosen.source) }
    }
    return { text: await bgm(run, sleep, await read($, source), await read($, pick), text) }
  })

  on('session.end', async ($, e, next) => {
    const from = await read($, source)
    if (e.reason !== 'clear' && from !== 'youtube' && (await read($, didStart))) await tell(argv => $.process.run(argv), from, 'pause')
    return next(e)
  })

  // Drawn inside the menu pane as its own device: a chassis, a lit display, physical keys.
  on('ui.render', { component: 'Pane', requestId: 'undertow' }, async ($, e, next) => {
    const inner = await next(e)
    const t = await read($, track)
    const message = await read($, note)
    const art = await read($, cover)
    const isFlash = await read($, isChanging)
    const from = await read($, source)
    const chosen = await read($, pick)
    const { Box, Button, Image, Text } = $.ui.resolve(e)
    const press = (args: string) => async () => {
      const said = await bgm(argv => $.process.run(argv), ms => $.clock.sleep(ms), from, chosen, args)
      await update($, note, () => (said === noApp(from) ? said : ''))
      const fresh = await now(argv => $.process.run(argv), from)
      await update($, track, () => fresh)
    }
    const choose = (next_: Source) => async () => {
      await update($, source, () => next_)
      await update($, pick, () => '')
      await update($, note, () => '')
      await $.store.set('source', next_)
      await $.store.set('pick', '')
    }
    const LCD = isFlash ? '#FFFFFF' : '#BFF3FF'
    const INK = '#050B4A'
    const BODY = '#0A0F2A'
    const width = Math.max(6, e.props.bodyColumns - 16)
    const at = t?.duration ? Math.min(width - 1, Math.floor((t.position / t.duration) * width)) : 0
    const vol = t ? clamp(Math.round(t.volume / 10), 0, 10) : 0
    const gap = (n: number) => <Text backgroundColor={BODY}>{' '.repeat(n)}</Text>
    const isBrowser = from === 'youtube'
    const status = isBrowser ? 'YOUTUBE · 브라우저 재생' : t ? (t.isPlaying ? `▶ ${LABEL[from]}` : `■ ${LABEL[from]}`) : `${LABEL[from]} 대기`
    const empty = chosen ? '▶을 누르면 재생해요' : '/bgm <링크>로 음악을 고르세요'

    const device = (
      <Box flexDirection="column" borderStyle="round" borderColor="#FFFFFF" backgroundColor={BODY}>
        <Box backgroundColor={BODY}>
          {(['spotify', 'music', 'youtube'] as const).map(s => (
            <Box backgroundColor={s === from ? '#E8101E' : BODY} marginRight={1}>
              <Button key={`src-${s}`} plain label={` ${LABEL[s]} `} onPress={choose(s)} />
            </Box>
          ))}
        </Box>
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
            <Text backgroundColor={LCD} color={INK} bold wrap="truncate"> {status}</Text>
            <Text backgroundColor={LCD} color={INK} bold wrap="truncate"> {t?.title ?? empty}</Text>
            <Text backgroundColor={LCD} color={INK} wrap="truncate"> {t?.artist ?? (isBrowser ? YOUTUBE_NOTE : '')}</Text>
            <Text backgroundColor={LCD} color={message ? '#E8101E' : INK} wrap="truncate"> {message || (t ? `${clock(t.position)} / ${clock(t.duration)}` : '')}</Text>
          </Box>
        </Box>
        {isBrowser ? (
          <Box backgroundColor={BODY}>
            {gap(1)}
            <Button key="open" plain label="▶ 브라우저에서 열기" onPress={press('play')} />
          </Box>
        ) : (
          <Box flexDirection="column" backgroundColor={BODY}>
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
        )}
      </Box>
    )

    return <Box flexDirection="column">{inner}{device}</Box>
  })
}
