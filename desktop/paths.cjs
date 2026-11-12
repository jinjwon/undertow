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

// Without the plugin nothing saves usage, so the HUD reads the context from the end of the newest session transcript.
// shortcut: the window size is guessed (1M once a turn passes 200k tokens, else 200k); read it from the model name if that guess shows wrong numbers.
const contextOf = tail => {
  for (const line of tail.split('\n').reverse()) {
    try {
      const row = JSON.parse(line)
      const u = row.isSidechain ? null : row.message?.usage
      if (!u) continue
      const tokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
      return Math.min(100, (tokens / (tokens > 200000 ? 1000000 : 200000)) * 100)
    } catch {}
  }
  return null
}

// How often each slash command was typed, from ~/.claude/history.jsonl: the SKILL ranks without the plugin's own count.
const usesOf = history => {
  const uses = {}
  for (const line of history.split('\n')) {
    try {
      const name = /^\/([\w:.-]+)/.exec(JSON.parse(line).display?.trim() ?? '')?.[1]
      if (name) uses[name] = (uses[name] ?? 0) + 1
    } catch {}
  }
  return uses
}

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

// Terminals keep talking while the window closes on quit; output for a destroyed window is dropped, not thrown.
const sendTo = (win, channel, ...args) => {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send(channel, ...args)
}

// Hosts named in ~/.ssh/config, patterns (*, ?, !) left out: the only names the window may hand to ssh, and none can start with '-'.
// shortcut: Include files are not followed, add that when someone keeps their hosts there.
const sshHosts = text =>
  [...new Set(String(text).split(/\r?\n/).flatMap(l => /^\s*Host\s+(.+)$/i.exec(l.replace(/\s+#.*$/, ''))?.[1].trim().split(/\s+/) ?? []))].filter(h => /^\w[\w.-]*$/.test(h))

// Projects Codex trusts, from ~/.codex/config.toml: [projects."<path>"] (or '<path>') tables whose trust_level is "trusted".
const codexTrusted = toml => {
  const out = new Set()
  for (const table of String(toml).split(/^(?=\[)/m)) {
    const head = /^\[projects\.(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\]/.exec(table)
    if (!head || !/^\s*trust_level\s*=\s*"trusted"/m.test(table)) continue
    const at = head[2] ?? head[1].replace(/\\(.)/g, '$1')
    out.add(path.resolve(at).normalize('NFC'))
  }
  return out
}

// DISCOVER: the skills in a GitHub repository, from its git tree (GET /repos/:repo/git/trees/HEAD?recursive=1).
// A skill is a folder holding SKILL.md; its name is the folder's. A SKILL.md at the top makes the whole repository one skill.
const skillDirsOf = (tree, repoName) =>
  tree
    .filter(e => e.type === 'blob' && (e.path === 'SKILL.md' || e.path.endsWith('/SKILL.md')))
    .map(e => e.path.slice(0, -'SKILL.md'.length).replace(/\/$/, ''))
    .map(folder => ({ folder, name: folder ? folder.split('/').pop() : repoName }))
    .filter(s => SKILL_NAME.test(s.name))
    .sort((a, b) => a.folder.localeCompare(b.folder))
const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/ // becomes a folder under ~/.claude/skills, so no separators and no leading dot
// The plain files of one skill, each with its path inside the skill. Symlinks and submodules are left out: an install only ever writes ordinary files.
const skillFiles = (tree, folder) =>
  tree
    .filter(e => e.type === 'blob' && e.mode !== '120000' && (!folder || e.path.startsWith(`${folder}/`)))
    .map(e => ({ path: e.path, rel: folder ? e.path.slice(folder.length + 1) : e.path, size: e.size ?? 0 }))
    .filter(f => f.rel.split('/').every(part => part && part !== '..' && part !== '.git'))
    .sort((a, b) => (b.rel === 'SKILL.md') - (a.rel === 'SKILL.md') || a.rel.localeCompare(b.rel))

module.exports = { skillDirsOf, skillFiles, SKILL_NAME, contextOf, usesOf, codexTrusted, sshHosts, inside, latestUsage, trusted, isSessionId, slugOf, titleOf, frontOf, pluginsOf, mcpOf, sendTo }
