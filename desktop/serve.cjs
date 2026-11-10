// The preview server: files of the open projects over loopback HTTP, for the preview tabs' iframes.
// Every URL carries a secret made at start, and the Host header must be this server's, so another web page on the machine cannot read a project.
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const TYPES = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', markdown: 'text/markdown; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  woff: 'font/woff', woff2: 'font/woff2',
}
const extOf = name => path.extname(String(name)).slice(1).toLowerCase()
const typeOf = name => TYPES[extOf(name)] ?? 'application/octet-stream'

// The page reloads itself when the server says a file changed.
const inject = (html, nonce, liveUrl) => {
  const script = `<script nonce="${nonce}">new EventSource(${JSON.stringify(liveUrl)}).onmessage = () => location.reload()</script>`
  const at = html.toLowerCase().lastIndexOf('</body>')
  return at < 0 ? html + script : html.slice(0, at) + script + html.slice(at)
}

const PAGE_LIMIT = 5e6 // a page is read whole to add the reload script; past this it goes out as plain text
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const start = ({ roots, guard, markdown }) => new Promise((resolve, reject) => {
  const token = crypto.randomBytes(16).toString('hex')
  const prefix = `/t/${token}/`
  const streams = new Set() // open live streams, one per preview page
  const end = (res, status, text = '') => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(text) }

  const serve = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return end(res, 405)
    if (req.headers.host !== `127.0.0.1:${server.address().port}`) return end(res, 403)
    const target = req.url.split('?')[0]
    if (!target.startsWith(prefix)) return end(res, 403)
    const rest = target.slice(prefix.length)
    if (rest === '__live') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
      res.write(': open\n\n')
      streams.add(res)
      return void req.on('close', () => streams.delete(res))
    }
    const [index, ...raw] = rest.split('/')
    const root = /^\d+$/.test(index) ? roots()[Number(index)] : undefined
    if (!root) return end(res, 404)
    if (raw.at(-1) === '') raw.pop() // a folder's trailing slash
    let parts
    try { parts = raw.map(decodeURIComponent) } catch { return end(res, 404) }
    if (parts.some(p => p === '' || p === '.' || p === '..' || /[/\\\0]/.test(p))) return end(res, 404)
    let file = path.join(root, ...parts)
    let stat
    try {
      stat = await fs.promises.stat(await guard(file))
      if (stat.isDirectory()) stat = await fs.promises.stat(await guard((file = path.join(file, 'index.html'))))
    } catch { return end(res, 404) }

    const ext = extOf(file)
    const isMarkdown = ext === 'md' || ext === 'markdown'
    if ((isMarkdown || ext === 'html' || ext === 'htm') && stat.size <= PAGE_LIMIT) {
      const text = await fs.promises.readFile(file, 'utf8')
      const nonce = crypto.randomBytes(16).toString('hex')
      const page = isMarkdown ? `<!doctype html><meta charset="utf-8"><title>${escapeHtml(path.basename(file))}</title><body>${markdown(text)}</body>` : text
      const headers = { 'Content-Type': TYPES.html, 'Cache-Control': 'no-store' }
      if (isMarkdown) headers['Content-Security-Policy'] = `script-src 'nonce-${nonce}'` // only the reload script may run in a rendered document
      res.writeHead(200, headers)
      return res.end(req.method === 'HEAD' ? undefined : inject(page, nonce, `${prefix}__live`))
    }

    const headers = { 'Content-Type': isMarkdown || ext === 'html' || ext === 'htm' ? TYPES.txt : typeOf(file), 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' }
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '') // one range, as the PDF viewer and video seeking ask for
    const from = range ? Number(range[1]) : 0
    const to = range && range[2] !== '' ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1
    const partial = Boolean(range) && from <= to
    if (partial) headers['Content-Range'] = `bytes ${from}-${to}/${stat.size}`
    headers['Content-Length'] = partial ? to - from + 1 : stat.size
    res.writeHead(partial ? 206 : 200, headers)
    if (req.method === 'HEAD' || stat.size === 0) return res.end()
    fs.createReadStream(file, partial ? { start: from, end: to } : {}).on('error', () => res.destroy()).pipe(res)
  }

  const server = http.createServer((req, res) => serve(req, res).catch(() => (res.headersSent ? res.destroy() : end(res, 500))))
  server.on('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    resolve({
      port,
      token,
      // The address of a file inside an open project, or null when it is in none of them.
      urlOf: file => {
        const index = roots().findIndex(r => { const rel = path.relative(r, file); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)) })
        if (index < 0) return null
        const rel = path.relative(roots()[index], file).split(path.sep).filter(Boolean).map(encodeURIComponent).join('/')
        return `http://127.0.0.1:${port}${prefix}${index}/${rel}`
      },
      changed: () => { for (const res of streams) res.write('data: reload\n\n') },
      close: () => { for (const res of streams) res.destroy(); server.close(); server.closeAllConnections?.() },
    })
  })
})

module.exports = { typeOf, inject, start }
