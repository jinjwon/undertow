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

// The search sheet's toggles (match case, whole word, regular expression) as one RegExp; null when a typed regex does not compile.
const patternOf = (query, { caseSensitive = false, word = false, regex = false } = {}) => {
  let src = regex ? String(query) : String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (word) src = `\\b(?:${src})\\b`
  try {
    const re = new RegExp(src, caseSensitive ? 'g' : 'gi')
    return re.test('') ? null : re // a pattern that matches nothing at all would hit every position
  } catch { return null }
}

const searchText = (text, query, limit, opts) => {
  const re = query && patternOf(query, opts)
  if (!re || text.includes('\0')) return []
  const hits = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length && hits.length < limit; i++) {
    re.lastIndex = 0
    const m = re.exec(lines[i])
    if (m) hits.push({ line: i + 1, col: m.index + 1, preview: lines[i].trim().slice(0, 200) })
  }
  return hits
}

// Replace every match in a file's text; n is how many. $1-style groups work only in regex mode, as in VS Code.
const replaceText = (text, query, replacement, opts = {}) => {
  const re = query && patternOf(query, opts)
  if (!re || text.includes('\0')) return { text, n: 0 }
  let n = 0
  const out = text.replace(re, (...m) => (n++, opts.regex ? m[0].replace(new RegExp(re.source, re.flags.replace('g', '')), replacement) : replacement))
  return { text: out, n }
}

// "files to include / exclude": comma-separated, * is any run of characters, matched anywhere in the project path.
const globs = list => String(list ?? '').split(',').map(s => s.trim()).filter(Boolean)
  .map(g => new RegExp(g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i'))
const pathAllowed = (rel, include, exclude) => {
  const p = rel.split('\\').join('/')
  const inc = globs(include)
  return (!inc.length || inc.some(r => r.test(p))) && !globs(exclude).some(r => r.test(p))
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

module.exports = { walkSkip, fuzzy, searchText, replaceText, pathAllowed, parseStatus }
