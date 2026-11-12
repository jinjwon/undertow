const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { typeOf, inject, start } = require('./serve.cjs')

// A project folder, a secret beside it, and a symlink inside the project that points out.
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'evoke-serve-')))
const root = path.join(base, 'project')
fs.mkdirSync(path.join(root, 'sub'), { recursive: true })
fs.mkdirSync(path.join(base, 'outside'))
fs.writeFileSync(path.join(base, 'outside', 'secret'), 'SECRET')
fs.writeFileSync(path.join(root, 'index.html'), '<body><h1>home</h1></body>')
fs.writeFileSync(path.join(root, 'no-body.html'), '<p>bare')
fs.writeFileSync(path.join(root, 'doc.md'), '# T\n\n<script>window.x=1</script>\n')
fs.writeFileSync(path.join(root, 'a.pdf'), '0123456789')
fs.writeFileSync(path.join(root, 'sub', 'index.html'), '<body>in sub</body>')
fs.writeFileSync(path.join(root, 'x'), 'not served through ..')
fs.symlinkSync(path.join(base, 'outside'), path.join(root, 'out'))

const inside = (r, t) => { const rel = path.relative(r, t); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)) }
const guard = async file => { if (!inside(root, await fs.promises.realpath(file))) throw new Error('outside'); return file }
const md = text => text.replace(/^# (.*)$/m, '<h1>$1</h1>') // stands in for marked: headings only, raw HTML passes through
let srv
test.before(async () => { srv = await start({ roots: () => [root], guard, markdown: md }) })
test.after(() => { srv.close(); fs.rmSync(base, { recursive: true, force: true }) })

// A raw request, so the path and the Host header go out exactly as written.
const get = (target, { headers = {}, method = 'GET' } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: srv.port, path: target, method, headers }, res => {
    const chunks = []
    res.on('data', c => chunks.push(c))
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }))
  })
  req.on('error', reject)
  req.end()
})
const pathOf = file => new URL(srv.urlOf(file)).pathname

test('typeOf knows the previewed kinds', () => {
  assert.strictEqual(typeOf('a.PDF'), 'application/pdf')
  assert.strictEqual(typeOf('a.html'), 'text/html; charset=utf-8')
  assert.strictEqual(typeOf('m.mp4'), 'video/mp4')
  assert.strictEqual(typeOf('a.xyz'), 'application/octet-stream')
})

test('inject adds the reload script once, with or without </body>', () => {
  assert.match(inject('<body>a</body>', 'N', '/l'), /a<script nonce="N">.*EventSource\("\/l"\).*<\/script><\/body>$/s)
  assert.match(inject('<p>a', 'N', '/l'), /^<p>a<script nonce="N">/)
  assert.strictEqual(inject('<body>a</body>', 'N', '/l').split('<script').length, 2)
})

test('serves a file, a folder index and a byte range', async () => {
  const page = await get(pathOf(path.join(root, 'index.html')))
  assert.strictEqual(page.status, 200)
  assert.strictEqual(page.headers['content-type'], 'text/html; charset=utf-8')
  assert.match(page.body, /<h1>home<\/h1>/)
  assert.match(page.body, /EventSource/)
  assert.strictEqual(page.headers['cache-control'], 'no-store')
  assert.match((await get(pathOf(path.join(root, 'no-body.html')))).body, /^<p>bare<script nonce=/)
  assert.match((await get(pathOf(path.join(root, 'sub')))).body, /in sub/)
  const part = await get(pathOf(path.join(root, 'a.pdf')), { headers: { Range: 'bytes=2-5' } })
  assert.strictEqual(part.status, 206)
  assert.strictEqual(part.headers['content-range'], 'bytes 2-5/10')
  assert.strictEqual(part.body, '2345')
  const whole = await get(pathOf(path.join(root, 'a.pdf')))
  assert.deepStrictEqual([whole.status, whole.headers['content-type'], whole.body], [200, 'application/pdf', '0123456789'])
})

test('Markdown is drawn in the theme the URL asks for, TIDE otherwise', async () => {
  assert.match((await get(pathOf(path.join(root, 'doc.md')))).body, /<html data-theme="tide">.*<style>/s)
  assert.match((await get(`${pathOf(path.join(root, 'doc.md'))}?theme=rebel`)).body, /<html data-theme="rebel">/)
  assert.match((await get(`${pathOf(path.join(root, 'doc.md'))}?theme="><x`)).body, /<html data-theme="tide">/)
})

test('Markdown is rendered and its scripts cannot run', async () => {
  const res = await get(pathOf(path.join(root, 'doc.md')))
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8')
  assert.match(res.body, /<h1>T<\/h1>/)
  const nonce = /^script-src 'nonce-([0-9a-f]+)'$/.exec(res.headers['content-security-policy'])?.[1]
  assert.ok(nonce, 'a nonce-only script policy')
  assert.ok(res.body.includes(`<script nonce="${nonce}">`), 'the reload script carries the nonce')
  assert.ok(res.body.includes('<script>window.x=1</script>'), 'the document script is there, without the nonce, so the policy blocks it')
})

test('nothing outside the project is served', async () => {
  const t = `/t/${srv.token}`
  for (const p of [`${t}/0/../x`, `${t}/0/sub/%2e%2e/x`, `${t}/0/..%5Cx`, `${t}/0/sub%2F..%2Fx`, `${t}/0/out/secret`, `${t}/9/index.html`, `${t}/0/missing`, `${t}/0/a%00b`]) {
    const res = await get(p)
    assert.strictEqual(res.status, 404, p)
    assert.ok(!res.body.includes('SECRET') && !res.body.includes('not served'), p)
  }
  assert.strictEqual((await get('/t/wrong/0/index.html')).status, 403)
  assert.strictEqual((await get('/')).status, 403)
  assert.strictEqual((await get(pathOf(path.join(root, 'index.html')), { headers: { Host: 'evil.test' } })).status, 403)
  assert.strictEqual((await get(pathOf(path.join(root, 'index.html')), { method: 'POST' })).status, 405)
  assert.strictEqual(srv.urlOf(path.join(base, 'outside', 'secret')), null)
})

test('changed() reaches an open live stream', async () => {
  const got = await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: srv.port, path: `/t/${srv.token}/__live` }, res => {
      assert.strictEqual(res.headers['content-type'], 'text/event-stream')
      res.on('data', c => { if (String(c).includes('data: reload')) { req.destroy(); resolve(true) } })
      setTimeout(() => srv.changed(), 50)
    })
    req.on('error', e => e.code === 'ECONNRESET' || reject(e))
    setTimeout(() => reject(new Error('no reload within 1s')), 1000).unref()
  })
  assert.ok(got)
})
