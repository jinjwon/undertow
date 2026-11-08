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

module.exports = { inside, latestUsage, trusted }
