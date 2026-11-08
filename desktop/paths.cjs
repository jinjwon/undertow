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

module.exports = { inside, latestUsage }
