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

// A SKILL.md's name and description from its front matter; a folded (> or |) value joins its indented lines.
const frontOf = md => {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)?.[1] ?? ''
  const lines = block.split(/\r?\n/)
  const field = key => {
    const at = lines.findIndex(l => l.startsWith(`${key}:`))
    if (at < 0) return ''
    const value = lines[at].slice(key.length + 1).trim()
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const rest = []
      for (const l of lines.slice(at + 1)) {
        if (!/^\s/.test(l)) break
        rest.push(l.trim())
      }
      return rest.join(' ')
    }
    return value.replace(/^(["'])(.*)\1$/, '$2')
  }
  return { name: field('name'), description: field('description') }
}

// Plugins switched on in ~/.claude/settings.json, with the folder their skills live in.
const pluginsOf = (installedJson, settingsJson) => {
  try {
    const installed = JSON.parse(installedJson).plugins ?? {}
    const enabled = JSON.parse(settingsJson).enabledPlugins ?? {}
    return Object.keys(installed)
      .filter(id => enabled[id] === true && installed[id]?.[0]?.installPath)
      .map(id => ({ name: id.split('@')[0], path: installed[id][0].installPath }))
  } catch {
    return []
  }
}

// MCP servers Claude Code starts in this project: the global ones plus the project's own.
const mcpOf = (claudeJson, root) => {
  try {
    const json = JSON.parse(claudeJson)
    return [...new Set([...Object.keys(json.mcpServers ?? {}), ...Object.keys(json.projects?.[root]?.mcpServers ?? {})])]
  } catch {
    return []
  }
}

module.exports = { inside, latestUsage, trusted, isSessionId, slugOf, titleOf, frontOf, pluginsOf, mcpOf }
