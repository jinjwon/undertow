// Small readings of text and names the window draws from.

// Prompt variables like {{name}}: start and end offsets (end exclusive), one line at most.
export const promptVars = (text: string) => {
  const found: { start: number; end: number }[] = []
  for (const m of text.matchAll(/\{\{[^{}\n]+\}\}/g)) found.push({ start: m.index, end: m.index + m[0].length })
  return found
}

// A file's badge: a short label, a kind (its colour, in style.css) and a shape shared by its family,
// so the type reads from colour and outline before the letters.
export type FileShape = 'code' | 'atom' | 'data' | 'page' | 'markup' | 'media' | 'term' | 'test'
const K = (label: string, kind: string, shape: FileShape) => ({ label, kind, shape })
const BY_EXT: Record<string, ReturnType<typeof K>> = {}
const add = (exts: string, label: string, kind: string, shape: FileShape) => { for (const e of exts.split(' ')) BY_EXT[e] = K(label, kind, shape) }
add('ts mts cts', 'TS', 'ts', 'code')
add('js cjs mjs', 'JS', 'js', 'code')
add('py', 'PY', 'py', 'code')
add('rs', 'RS', 'rs', 'code')
add('go', 'GO', 'go', 'code')
add('swift', 'SW', 'swift', 'code')
add('c h cpp hpp cc', 'C', 'c', 'code')
add('java', 'JV', 'java', 'code')
add('kt kts', 'KT', 'kt', 'code')
add('rb', 'RB', 'rb', 'code')
add('php', 'PHP', 'php', 'code')
add('tsx', 'TSX', 'react', 'atom')
add('jsx', 'JSX', 'react', 'atom')
add('vue', 'VUE', 'vue', 'atom')
add('svelte', 'SV', 'svelte', 'atom')
add('json jsonc', '{}', 'json', 'data')
add('yml yaml', 'YML', 'yml', 'data')
add('toml', 'TML', 'toml', 'data')
add('xml plist', 'XML', 'xml', 'data')
add('sql', 'SQL', 'sql', 'data')
add('csv tsv', 'CSV', 'csv', 'data')
add('lock', 'LCK', 'lock', 'data')
add('md mdx markdown', 'MD', 'md', 'page')
add('txt log', 'TXT', 'txt', 'page')
add('pdf', 'PDF', 'pdf', 'page')
add('html htm', '<>', 'html', 'markup')
add('css scss sass less', '#', 'css', 'markup')
add('png jpg jpeg gif svg webp ico', 'IMG', 'img', 'media')
add('mp4 webm mov', 'VID', 'vid', 'media')
add('mp3 wav ogg', 'SND', 'snd', 'media')
add('sh zsh bash fish', '>_', 'sh', 'term')

// Names that say more than their extension.
const byName = (lower: string) =>
  /\.(test|spec)\.[a-z]+$/.test(lower) ? K('T', 'test', 'test')
  : lower === 'dockerfile' || lower.startsWith('docker-compose') ? K('DK', 'docker', 'data')
  : lower.startsWith('.git') ? K('GIT', 'git', 'data')
  : lower === '.env' || lower.startsWith('.env.') ? K('ENV', 'env', 'data')
  : /(^|-)lock\.(json|yaml)$|\.lock$/.test(lower) ? K('LCK', 'lock', 'data')
  : /^(license|licence|copying)(\.|$)/.test(lower) ? K('§', 'license', 'page')
  : null

// Every kind style.css must colour (a test checks it).
export const FILE_KINDS = [...new Set([...Object.values(BY_EXT).map(k => k.kind), 'test', 'docker', 'git', 'env', 'lock', 'license', 'file'])]

export const iconOf = (name: string, dir: boolean) => {
  if (dir) return { label: '', kind: 'dir', shape: 'dir' as const }
  const lower = name.toLowerCase()
  const ext = lower.includes('.') ? lower.split('.').pop()! : ''
  return byName(lower) ?? BY_EXT[ext] ?? K('··', 'file', 'page')
}

export const isImage = (path: string) => /\.(png|jpe?g|gif|svg|webp)$/i.test(path)

// The calendar's weeks start on Sunday, as its month grid does. Built from y/m/d so a daylight-saving day still lands on the right date.
export const weekOf = (t: number) => {
  const d = new Date(t)
  return Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay() + i).getTime())
}
export const stepDate = (t: number, view: 'month' | 'week' | 'day', n: number) => {
  const d = new Date(t)
  return view === 'month' ? new Date(d.getFullYear(), d.getMonth() + n, 1).getTime() : new Date(d.getFullYear(), d.getMonth(), d.getDate() + n * (view === 'week' ? 7 : 1)).getTime()
}

// How a file is previewed: 'direct' files (PDF, video, sound) cannot be edited, so a click opens the preview itself;
// 'live' files (HTML, Markdown) open in the editor and can be shown beside it; null has no preview.
export const previewKind = (path: string): 'direct' | 'live' | null =>
  /\.(pdf|mp4|webm|mov|mp3|wav|ogg)$/i.test(path) ? 'direct' : /\.(html?|md|markdown)$/i.test(path) ? 'live' : null

// The ⌘K search over everything the window knows: every word must appear in the label or detail; labels that start with the query come first.
export const matchItems = <T extends { label: string; detail?: string }>(items: T[], query: string, n = 30): T[] => {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/)
  return items
    .filter(i => { const hay = `${i.label} ${i.detail ?? ''}`.toLowerCase(); return words.every(w => hay.includes(w)) })
    .map((i, at) => ({ i, at, head: i.label.toLowerCase().startsWith(q) ? 0 : 1 }))
    .sort((a, b) => a.head - b.head || a.at - b.at)
    .slice(0, n)
    .map(x => x.i)
}
