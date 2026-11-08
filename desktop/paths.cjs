// What the main process trusts from the window: file access stays inside the open project.
const path = require('node:path')

const inside = (root, target) => {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// The plugin's store files, newest first, give the HUD the last usage any session measured.
const latestUsage = files =>
  [...files]
    .sort((a, b) => b.mtime - a.mtime)
    .map(f => {
      try {
        return JSON.parse(f.text).usage ?? null
      } catch {
        return null
      }
    })
    .find(Boolean) ?? null

// Projects Claude Code already trusts, from ~/.claude.json: the only folders the window may open without the folder dialog.
const trusted = json => {
  try {
    const known = JSON.parse(json).projects ?? {}
    return new Set(Object.keys(known).filter(p => known[p]?.hasTrustDialogAccepted).map(p => path.resolve(p).normalize('NFC')))
  } catch {
    return new Set()
  }
}

// Only a session UUID may become an argument to claude.
const isSessionId = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)
// Claude Code keeps a project's sessions in ~/.claude/projects/<slug>, every other character turned into '-'.
const slugOf = p => p.replace(/[^A-Za-z0-9]/g, '-')

// A session's name in the list: the first prompt you typed, not slash commands or system lines.
const titleOf = jsonl => {
  for (const line of jsonl.split('\n')) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry?.type !== 'user') continue
    const content = entry.message?.content
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.find(c => c?.type === 'text')?.text ?? '' : ''
    if (text.trim() && !text.trim().startsWith('<')) return text.trim().replace(/\s+/g, ' ').slice(0, 60)
  }
  return ''
}

module.exports = { inside, latestUsage, trusted, isSessionId, slugOf, titleOf }
