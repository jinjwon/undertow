// Finding things in a project: used by main (walk, search) and the window (fuzzy ranking).
const SKIP = new Set(['node_modules', '.git', 'dist', 'release', '.next', 'build', 'out', '.venv', '__pycache__', '.superpowers'])
const walkSkip = name => SKIP.has(name)

// Letters of the query in order; runs of consecutive letters and hits in the file name score higher.
const fuzzy = (query, path) => {
  const q = query.toLowerCase()
  const p = path.toLowerCase()
  const nameAt = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1
  let score = 1
  let at = -1
  for (const ch of q) {
    const next = p.indexOf(ch, at + 1)
    if (next < 0) return 0
    score += (next === at + 1 ? 3 : 1) + (next >= nameAt ? 2 : 0)
    at = next
  }
  return score - p.length / 1000 // shorter paths win ties
}

const searchText = (text, query, limit) => {
  if (!query || text.includes('\0')) return []
  const q = query.toLowerCase()
  const hits = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length && hits.length < limit; i++) {
    const col = lines[i].toLowerCase().indexOf(q)
    if (col >= 0) hits.push({ line: i + 1, col: col + 1, preview: lines[i].trim().slice(0, 200) })
  }
  return hits
}

// `git status --porcelain=v1 -z`: "XY path" records split by NUL; a rename or copy carries its old path as the next record.
const parseStatus = z => {
  const parts = z.split('\0')
  const out = []
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length < 4) continue
    const code = parts[i].slice(0, 2).trim()
    out.push({ path: parts[i].slice(3), code })
    if (/[RC]/.test(parts[i].slice(0, 2))) i++
  }
  return out
}

module.exports = { walkSkip, fuzzy, searchText, parseStatus }
