// Small readings of text and names the window draws from.

// Prompt variables like {{name}}: start and end offsets (end exclusive), one line at most.
export const promptVars = (text: string) => {
  const found: { start: number; end: number }[] = []
  for (const m of text.matchAll(/\{\{[^{}\n]+\}\}/g)) found.push({ start: m.index, end: m.index + m[0].length })
  return found
}

const KINDS: Record<string, [string, string]> = {
  ts: ['TS', 'ts'], tsx: ['TS', 'ts'], js: ['JS', 'js'], jsx: ['JS', 'js'], cjs: ['JS', 'js'], mjs: ['JS', 'js'],
  json: ['{}', 'json'], css: ['#', 'css'], scss: ['#', 'css'], html: ['<>', 'html'], md: ['MD', 'md'],
  py: ['PY', 'py'], sh: ['SH', 'sh'], zsh: ['SH', 'sh'], yml: ['YML', 'yml'], yaml: ['YML', 'yml'],
  png: ['IMG', 'img'], jpg: ['IMG', 'img'], jpeg: ['IMG', 'img'], gif: ['IMG', 'img'], svg: ['IMG', 'img'], webp: ['IMG', 'img'],
  rs: ['RS', 'rs'], go: ['GO', 'go'], swift: ['SW', 'swift'], txt: ['TXT', 'file'],
}

// The badge in front of a name in the tree and on tabs.
export const iconOf = (name: string, dir: boolean) => {
  if (dir) return { label: '', kind: 'dir' }
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const [label, kind] = KINDS[ext] ?? ['··', 'file']
  return { label, kind }
}

export const isImage = (path: string) => /\.(png|jpe?g|gif|svg|webp)$/i.test(path)
