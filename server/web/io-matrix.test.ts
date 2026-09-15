import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { profileDraftFromGet, profilePatchBody } from '../../client/storefront/src/accountProfile.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const serverRoot = path.join(repoRoot, 'server')
const tokensPath = path.join(repoRoot, 'client', 'ui', 'tokens.css')
const baseCssPath = path.join(repoRoot, 'client', 'ui', 'base.css')
const storefrontAppPath = path.join(repoRoot, 'client', 'storefront', 'src', 'App.tsx')
const adminAppPath = path.join(repoRoot, 'client', 'admin', 'src', 'App.tsx')

const COLOR_ROLES = [
  'surface-base',
  'surface-raised',
  'surface-sunken',
  'text-primary',
  'text-secondary',
  'text-on-accent',
  'border-default',
  'border-strong',
  'focus-ring',
  'focus-ring-offset',
  'accent-primary',
  'accent-primary-hover',
  'accent-quiet',
  'danger',
  'warning',
  'success',
  'info',
  'danger-tint',
  'warn-tint',
  'success-tint',
  'info-tint',
] as const

const PORT = String(18765)
const baseUrl = `http://127.0.0.1:${PORT}`

function cssCustomProperty(source: string, name: string, scope: 'root' | 'dark'): string {
  const block =
    scope === 'root'
      ? source.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1]
      : source.match(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)?.[1]
  assert.ok(block, `missing ${scope} token block`)
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`))
  assert.ok(match, `missing --${name} in ${scope}`)
  return match[1].trim()
}

async function waitForListening(
  child: ReturnType<typeof spawn>,
  timeoutMs = 15000,
): Promise<string> {
  let output = ''
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for listen. Output:\n${output}`))
    }, timeoutMs)
    const onData = (chunk: Buffer): void => {
      output += chunk.toString()
      if (/listening on /.test(output)) {
        clearTimeout(timer)
        resolve(output)
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`server exited ${code} before listen. Output:\n${output}`))
    })
  })
}

function recoveryCodes(text: string): string[] {
  return [...text.matchAll(/Admin recovery code \(single-use\): ([A-Z0-9-]+)/g)].map(
    (match) => match[1] ?? '',
  )
}

const IDENTITY_PORT = String(18766)
const identityBaseUrl = `http://127.0.0.1:${IDENTITY_PORT}`
const PARENT_PORT = String(18769)
const parentBaseUrl = `http://127.0.0.1:${PARENT_PORT}`
const ACCOUNT_PORT = String(18771)
const accountBaseUrl = `http://127.0.0.1:${ACCOUNT_PORT}`
const UPGRADE_PORT = String(18770)

type Spawned = {
  child: ReturnType<typeof spawn>
  output: { text: string }
}

function attachOutput(child: ReturnType<typeof spawn>): { text: string } {
  const output = { text: '' }
  const onData = (chunk: Buffer): void => {
    output.text += chunk.toString()
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  return output
}

async function waitForOutput(
  output: { text: string },
  child: ReturnType<typeof spawn>,
  timeoutMs = 20000,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for listen. Output:\n${output.text}`))
    }, timeoutMs)
    const check = (): void => {
      if (/listening on /.test(output.text)) {
        clearTimeout(timer)
        resolve()
      }
    }
    check()
    const onData = (): void => check()
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`server exited ${code} before listen. Output:\n${output.text}`))
    })
  })
}

async function startIdentityServer(
  dbPath: string,
  port: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<Spawned> {
  const child = spawn(process.execPath, ['dist/web/index.js'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: port,
      DATABASE_PATH: dbPath,
      SESSION_SECRET: 'test-secret',
      ADMIN_EMAIL: 'owner@example.com',
      ADMIN_PASSWORD: 'test-password',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = attachOutput(child)
  await waitForOutput(output, child)
  return { child, output }
}

async function stopChild(child: ReturnType<typeof spawn>, timeoutMs = 5000): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill()
  })
}

function sidCookie(headers: Headers): string | undefined {
  return headers.getSetCookie().find((value) => value.startsWith('booklist.sid='))
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walkFiles(full)))
    else files.push(full)
  }
  return files
}

function cookieHeader(setCookie: string): string {
  return setCookie.split(';', 1)[0] ?? ''
}

describe('I/O & edge-case matrix', () => {
  describe('Missing env var', () => {
    it('refuses to start and names every missing variable on one stderr line', () => {
      const env = { ...process.env, PORT: '1', SESSION_SECRET: 's', ADMIN_EMAIL: 'a', ADMIN_PASSWORD: 'p' }
      delete env.DATABASE_PATH
      const result = spawnSync(process.execPath, ['dist/web/index.js'], {
        cwd: serverRoot,
        env,
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0)
      const errLine = (result.stderr || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /DATABASE_PATH/.test(line))
      assert.ok(errLine, `stderr must name DATABASE_PATH. Got:\n${result.stderr}`)
      assert.equal(errLine.split('\n').length, 1)
    })
  })

  describe('Healthy boot, unknown routes', () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-matrix-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const env = {
        ...process.env,
        PORT,
        DATABASE_PATH: dbPath,
        SESSION_SECRET: 'test-secret',
        ADMIN_EMAIL: 'owner@example.com',
        ADMIN_PASSWORD: 'test-password',
      }
      child = spawn(process.execPath, ['dist/web/index.js'], {
        cwd: serverRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      await waitForListening(child)
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('listens, opens one WAL connection, applies identity migrations, and mounts the three apps', async () => {
      const db = new Database(dbPath, { readonly: true })
      try {
        assert.equal(db.pragma('journal_mode', { simple: true }), 'wal')
        const applied = db.prepare('SELECT COUNT(*) AS n FROM applied_migrations').get() as { n: number }
        assert.equal(applied.n, 2)
      } finally {
        db.close()
      }

      const storefront = await fetch(`${baseUrl}/`)
      const admin = await fetch(`${baseUrl}/admin`)
      const api = await fetch(`${baseUrl}/api/nope`)
      assert.equal(storefront.status, 200)
      assert.equal(admin.status, 200)
      assert.equal(api.status, 404)
      const storefrontHtml = await storefront.text()
      const adminHtml = await admin.text()
      assert.match(storefrontHtml, /<title>Book List<\/title>/)
      assert.match(adminHtml, /<title>Book List — Admin<\/title>/)
      assert.doesNotMatch(storefrontHtml, /\/admin\/assets\//)
      assert.match(adminHtml, /\/admin\/assets\//)
    })

    it('does not treat /adminfoo as the admin app', async () => {
      const response = await fetch(`${baseUrl}/adminfoo`)
      assert.equal(response.status, 200)
      const html = await response.text()
      assert.match(html, /<title>Book List<\/title>/)
      assert.doesNotMatch(html, /<title>Book List — Admin<\/title>/)
    })

    it('returns an empty unknown page for storefront and admin', async () => {
      const storefrontApp = await readFile(storefrontAppPath, 'utf8')
      const adminApp = await readFile(adminAppPath, 'utf8')
      for (const source of [storefrontApp, adminApp]) {
        assert.match(source, /function BlankPage\(\) \{\s*return null\s*\}/)
        assert.match(source, /path="\*"/)
        assert.doesNotMatch(source, /not found/i)
        assert.doesNotMatch(source, /refresh/i)
        assert.doesNotMatch(source, /go back/i)
      }

      for (const url of [`${baseUrl}/nonsense`, `${baseUrl}/admin/nonsense`]) {
        const response = await fetch(url)
        assert.equal(response.status, 200)
        const html = await response.text()
        assert.match(html, /<div id="root"><\/div>/)
        assert.doesNotMatch(html, /not found/i)
        assert.doesNotMatch(html, /refresh/i)
        assert.doesNotMatch(html, /go back/i)
      }
    })

    it('returns a JSON 404 envelope for an unknown API route', async () => {
      const response = await fetch(`${baseUrl}/api/nope`)
      assert.equal(response.status, 404)
      assert.match(response.headers.get('content-type') ?? '', /json/)
      const body = (await response.json()) as { error: { code: string; message: string } }
      assert.equal(typeof body.error.code, 'string')
      assert.ok(body.error.code.length > 0)
      assert.equal(typeof body.error.message, 'string')
      assert.match(body.error.message, /[A-Za-z]/)
      assert.doesNotMatch(body.error.code, / /)
    })
  })

  describe('Storefront, admin, motion, and dark tokens', () => {
    it('uses a 56px bottom tab bar under 760px with Browse as a mustard fill block', async () => {
      const css = await readFile(baseCssPath, 'utf8')
      const tokens = await readFile(tokensPath, 'utf8')
      const storefrontApp = await readFile(storefrontAppPath, 'utf8')
      assert.equal(cssCustomProperty(tokens, 'space-tabbar-h', 'root'), '56px')
      assert.match(
        css,
        /\.storefront-tabbar\s*\{[\s\S]*height:\s*calc\(var\(--space-tabbar-h\)\s*\+\s*env\(safe-area-inset-bottom/,
      )
      assert.match(css, /@media \(min-width: 760px\)[\s\S]*\.storefront-tabbar\s*\{[\s\S]*display:\s*none/)
      assert.doesNotMatch(css, /@media \(max-width: 759px\)[\s\S]*\.storefront-tabbar[\s\S]*display:\s*none/)
      assert.match(
        css,
        /\.tabbar-item\.is-active\s*\{[\s\S]*background:\s*var\(--color-accent-primary\)[\s\S]*border-color:\s*var\(--color-border-strong\)[\s\S]*color:\s*var\(--color-text-on-accent\)/,
      )
      assert.match(storefrontApp, /<Route index element=\{<Page title="Browse" \/>\} \/>/)
    })

    it('switches to a top nav at 760px and caps the content column at 760px', async () => {
      const css = await readFile(baseCssPath, 'utf8')
      const tokens = await readFile(tokensPath, 'utf8')
      assert.equal(cssCustomProperty(tokens, 'space-storefront-max', 'root'), '760px')
      assert.match(css, /@media \(min-width: 760px\)[\s\S]*\.storefront-topnav\s*\{[\s\S]*display:\s*flex/)
      assert.match(css, /\.storefront-main\s*\{[\s\S]*max-width:\s*var\(--space-storefront-max\)/)
    })

    it('keeps a 214px ink sidebar on a narrow admin viewport', async () => {
      const css = await readFile(baseCssPath, 'utf8')
      const tokens = await readFile(tokensPath, 'utf8')
      const adminShell = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'Shell.tsx'),
        'utf8',
      )
      assert.equal(cssCustomProperty(tokens, 'space-admin-sidebar-w', 'root'), '214px')
      assert.match(
        css,
        /\.admin-sidebar\s*\{[\s\S]*width:\s*var\(--space-admin-sidebar-w\)[\s\S]*flex:\s*0 0 var\(--space-admin-sidebar-w\)/,
      )
      assert.equal((css.match(/\.admin-sidebar\s*\{/g) ?? []).length, 1)
      assert.match(adminShell, /className="admin-sidebar chrome"/)
    })

    it('removes shimmer, press travel, and transitions when motion is reduced', async () => {
      const css = await readFile(baseCssPath, 'utf8')
      const reduce = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)$/)?.[1]
      assert.ok(reduce)
      assert.match(reduce, /animation:\s*none\s*!important/)
      assert.match(reduce, /transition:\s*none\s*!important/)
      assert.match(reduce, /\.press-travel:active\s*\{[\s\S]*transform:\s*none/)
      assert.match(reduce, /\.skeleton-bar\s*\{[\s\S]*background-image:\s*none/)
    })

    it('sets data-theme from prefers-color-scheme before paint in both apps', async () => {
      const storefrontHtml = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'index.html'),
        'utf8',
      )
      const adminHtml = await readFile(path.join(repoRoot, 'client', 'admin', 'index.html'), 'utf8')
      for (const html of [storefrontHtml, adminHtml]) {
        assert.match(html, /dataset\.theme/)
        assert.match(html, /prefers-color-scheme/)
      }
    })

    it('resolves every colour role to its designed -dark peer under data-theme=dark', async () => {
      const tokens = await readFile(tokensPath, 'utf8')
      assert.equal(COLOR_ROLES.length, 21)
      for (const role of COLOR_ROLES) {
        const designedDark = cssCustomProperty(tokens, `color-${role}-dark`, 'root')
        const resolved = cssCustomProperty(tokens, `color-${role}`, 'dark')
        assert.equal(resolved, designedDark, `${role} must equal its -dark peer`)
      }
    })
  })

  describe('Admin seed, session, and recovery', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let output: { text: string }
    let dbDir: string
    let dbPath: string

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-identity-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, IDENTITY_PORT)
      child = started.child
      output = started.output
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('seeds one scrypt admin and prints one recovery code on first boot', async () => {
      const codes = recoveryCodes(output.text)
      assert.equal(codes.length, 1)
      const code = codes[0]
      assert.ok(code)

      const db = new Database(dbPath, { readonly: true })
      try {
        const admins = db.prepare('SELECT email, password_hash FROM admins').all() as Array<{
          email: string
          password_hash: string
        }>
        assert.equal(admins.length, 1)
        assert.equal(admins[0]?.email, 'owner@example.com')
        assert.match(admins[0]?.password_hash ?? '', /^scrypt\$/)
        assert.equal(admins[0]?.password_hash.includes('test-password'), false)
        const recovery = db.prepare('SELECT code_hash FROM admin_recovery').all() as Array<{
          code_hash: string
        }>
        assert.equal(recovery.length, 1)
        assert.match(recovery[0]?.code_hash ?? '', /^scrypt\$/)
        assert.equal(recovery[0]?.code_hash.includes(code), false)
      } finally {
        db.close()
      }
    })

    it('sets booklist.sid with the Always flags and creates a session row on login', async () => {
      const response = await fetch(`${identityBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const body = (await response.json()) as { role: string; email: string }
      assert.equal(body.role, 'admin')
      assert.equal(body.email, 'owner@example.com')
      const cookie = sidCookie(response.headers)
      assert.ok(cookie, `Set-Cookie missing. Got:\n${response.headers.getSetCookie().join('\n')}`)
      assert.match(cookie, /HttpOnly/i)
      assert.match(cookie, /Path=\//)
      assert.match(cookie, /SameSite=Lax/i)
      assert.match(cookie, /Max-Age=1209600/)
      assert.doesNotMatch(cookie, /Secure/)

      const db = new Database(dbPath, { readonly: true })
      try {
        const sessions = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }
        assert.equal(sessions.n, 1)
      } finally {
        db.close()
      }
    })

    it('returns the admin session on GET /api/session', async () => {
      const login = await fetch(`${identityBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(login.status, 200)
      const cookie = sidCookie(login.headers)
      assert.ok(cookie)
      const response = await fetch(`${identityBaseUrl}/api/session`, {
        headers: { cookie: cookieHeader(cookie) },
      })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as { role: string; email: string }
      assert.equal(body.role, 'admin')
      assert.equal(body.email, 'owner@example.com')
    })

    it('sets Secure on booklist.sid when X-Forwarded-Proto is https', async () => {
      const response = await fetch(`${identityBaseUrl}/api/session`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      assert.match(cookie, /Secure/)
    })

    it('rejects wrong credentials with JSON and no session cookie', async () => {
      const wrongPassword = await fetch(`${identityBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'nope' }),
      })
      assert.equal(wrongPassword.status, 401)
      const body = (await wrongPassword.json()) as { error: { code: string; message: string } }
      assert.equal(body.error.code, 'invalid_credentials')
      assert.match(body.error.message, /[A-Za-z]/)
      assert.equal(sidCookie(wrongPassword.headers), undefined)

      const unknown = await fetch(`${identityBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'parent@example.com', password: 'test-password' }),
      })
      assert.equal(unknown.status, 401)
      const unknownBody = (await unknown.json()) as { error: { code: string; message: string } }
      assert.equal(unknownBody.error.code, 'invalid_credentials')
      assert.equal(sidCookie(unknown.headers), undefined)
    })

    it('rejects admin identity routes without an admin session', async () => {
      const response = await fetch(`${identityBaseUrl}/api/session`)
      assert.equal(response.status, 401)
      const body = (await response.json()) as { error: { code: string; message: string } }
      assert.equal(body.error.code, 'unauthenticated')
      assert.match(body.error.message, /[A-Za-z]/)
      assert.equal(sidCookie(response.headers), undefined)

      const tampered = await fetch(`${identityBaseUrl}/api/session`, {
        headers: { cookie: 'booklist.sid=tampered.not-a-mac' },
      })
      assert.equal(tampered.status, 401)
      assert.equal(sidCookie(tampered.headers), undefined)
    })

    it('deletes the session row and clears the cookie on logout', async () => {
      const login = await fetch(`${identityBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      const cookie = sidCookie(login.headers)
      assert.ok(cookie)
      const token = cookieHeader(cookie).slice('booklist.sid='.length)
      const sessionId = token.split('.')[0]
      const logout = await fetch(`${identityBaseUrl}/api/session`, {
        method: 'DELETE',
        headers: { cookie: cookieHeader(cookie) },
      })
      assert.equal(logout.status, 204)
      const cleared = sidCookie(logout.headers)
      assert.ok(cleared)
      assert.match(cleared, /Max-Age=0/)
      assert.match(cleared, /Path=\//)
      assert.match(cleared, /HttpOnly/i)

      const db = new Database(dbPath, { readonly: true })
      try {
        const row = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId)
        assert.equal(row, undefined)
      } finally {
        db.close()
      }
    })

    it('redeems the recovery code, prints a new one, and rejects the old code', async () => {
      const before = new Database(dbPath, { readonly: true })
      const previousHash = (
        before.prepare('SELECT password_hash FROM admins').get() as { password_hash: string }
      ).password_hash
      const previousRecovery = (
        before.prepare('SELECT code_hash FROM admin_recovery WHERE id = 1').get() as {
          code_hash: string
        }
      ).code_hash
      before.close()

      const oldCode = recoveryCodes(output.text)[0]
      assert.ok(oldCode)
      const beforeCount = recoveryCodes(output.text).length

      const existing = await fetch(`${identityBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      const existingCookie = sidCookie(existing.headers)
      assert.ok(existingCookie)

      const redeem = await fetch(`${identityBaseUrl}/api/admin/recovery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: oldCode, password: 'fresh-password' }),
      })
      assert.equal(redeem.status, 200)

      const after = new Database(dbPath, { readonly: true })
      try {
        const sessions = after.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }
        assert.equal(sessions.n, 0)
      } finally {
        after.close()
      }
      const stale = await fetch(`${identityBaseUrl}/api/session`, {
        headers: { cookie: cookieHeader(existingCookie) },
      })
      assert.equal(stale.status, 401)

      const started = Date.now()
      while (recoveryCodes(output.text).length < beforeCount + 1 && Date.now() - started < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      const codes = recoveryCodes(output.text)
      assert.equal(codes.length, beforeCount + 1)
      const nextCode = codes[codes.length - 1]
      assert.ok(nextCode)
      assert.notEqual(nextCode, oldCode)

      const db = new Database(dbPath, { readonly: true })
      try {
        const admin = db.prepare('SELECT password_hash FROM admins').get() as { password_hash: string }
        const recovery = db.prepare('SELECT code_hash FROM admin_recovery').all() as Array<{
          code_hash: string
        }>
        assert.notEqual(admin.password_hash, previousHash)
        assert.equal(recovery.length, 1)
        assert.notEqual(recovery[0]?.code_hash, previousRecovery)
        assert.equal(recovery[0]?.code_hash.includes(nextCode), false)
      } finally {
        db.close()
      }

      const replay = await fetch(`${identityBaseUrl}/api/admin/recovery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: oldCode, password: 'another-password' }),
      })
      assert.equal(replay.status, 401)
      const replayBody = (await replay.json()) as { error: { code: string; message: string } }
      assert.equal(replayBody.error.code, 'invalid_recovery_code')

      const oldLogin = await fetch(`${identityBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(oldLogin.status, 401)
      assert.equal(sidCookie(oldLogin.headers), undefined)

      const newLogin = await fetch(`${identityBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'fresh-password' }),
      })
      assert.equal(newLogin.status, 200)
      assert.ok(sidCookie(newLogin.headers))
    })
  })

  describe('Parent register, login, and auth gates', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string

    const registration = {
      name: 'Nimali Perera',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '+94 77 123 4567',
      secondPhone: '071 765 4321',
      email: 'nimali@example.com',
      password: 'evening-order',
    }

    function register(body: Record<string, unknown>): Promise<Response> {
      return fetch(`${parentBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    function login(email: string, password: string): Promise<Response> {
      return fetch(`${parentBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    }

    function parentCount(): number {
      const db = new Database(dbPath, { readonly: true })
      try {
        return (db.prepare('SELECT COUNT(*) AS n FROM parents').get() as { n: number }).n
      } finally {
        db.close()
      }
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-parents-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, PARENT_PORT)
      child = started.child
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('registers a parent, stores a normalised number, and signs them in', async () => {
      const response = await register({ ...registration, secondPhone: undefined })
      assert.equal(response.status, 201)
      const body = (await response.json()) as { role: string; email: string }
      assert.equal(body.role, 'parent')
      assert.equal(body.email, 'nimali@example.com')

      const cookie = sidCookie(response.headers)
      assert.ok(cookie, `Set-Cookie missing. Got:\n${response.headers.getSetCookie().join('\n')}`)
      assert.match(cookie, /HttpOnly/i)
      assert.match(cookie, /Path=\//)
      assert.match(cookie, /SameSite=Lax/i)
      assert.match(cookie, /Max-Age=1209600/)

      const db = new Database(dbPath, { readonly: true })
      try {
        const parents = db
          .prepare('SELECT id, email, password_hash, name, delivery_address, whatsapp, second_phone FROM parents')
          .all() as Array<{
          id: number
          email: string
          password_hash: string
          name: string
          delivery_address: string
          whatsapp: string
          second_phone: string | null
        }>
        assert.equal(parents.length, 1)
        const parent = parents[0]
        assert.ok(parent)
        assert.equal(parent.email, 'nimali@example.com')
        assert.equal(parent.name, 'Nimali Perera')
        assert.equal(parent.delivery_address, '12 Temple Road, Nugegoda')
        assert.equal(parent.whatsapp, '+94771234567')
        assert.equal(parent.second_phone, null)
        assert.match(parent.password_hash, /^scrypt\$/)
        assert.equal(parent.password_hash.includes(registration.password), false)

        const session = db
          .prepare('SELECT admin_id, parent_id FROM sessions WHERE parent_id = ?')
          .get(parent.id) as { admin_id: number | null; parent_id: number | null } | undefined
        assert.ok(session)
        assert.equal(session.admin_id, null)
        assert.equal(session.parent_id, parent.id)
      } finally {
        db.close()
      }

      const probe = await fetch(`${parentBaseUrl}/api/session`, {
        headers: { cookie: cookieHeader(cookie) },
      })
      assert.equal(probe.status, 200)
      assert.equal(probe.headers.get('cache-control'), 'no-store')
      const probeBody = (await probe.json()) as { role: string; email: string }
      assert.equal(probeBody.role, 'parent')
      assert.equal(probeBody.email, 'nimali@example.com')
    })

    it('refuses an email already held by a parent or by the admin, whatever the casing', async () => {
      const before = parentCount()

      const duplicate = await register({ ...registration, email: 'NIMALI@Example.COM' })
      assert.equal(duplicate.status, 409)
      const duplicateBody = (await duplicate.json()) as {
        error: { code: string; message: string; field?: string }
      }
      assert.equal(duplicateBody.error.code, 'email_taken')
      assert.match(duplicateBody.error.message, /[A-Za-z]/)
      assert.equal(duplicateBody.error.field, 'email')
      assert.equal(sidCookie(duplicate.headers), undefined)

      const asAdmin = await register({ ...registration, email: 'Owner@Example.com' })
      assert.equal(asAdmin.status, 409)
      const asAdminBody = (await asAdmin.json()) as { error: { code: string } }
      assert.equal(asAdminBody.error.code, 'email_taken')
      assert.equal(sidCookie(asAdmin.headers), undefined)

      assert.equal(parentCount(), before)
    })

    it('refuses a bad field with one message naming it, and writes nothing', async () => {
      const before = parentCount()
      const cases: Array<[Record<string, unknown>, RegExp, string]> = [
        [{ name: '   ' }, /name/i, 'name'],
        [{ deliveryAddress: '' }, /address/i, 'deliveryAddress'],
        [{ whatsapp: '0712345' }, /whatsapp/i, 'whatsapp'],
        [{ secondPhone: '12345' }, /second phone/i, 'secondPhone'],
        [{ email: 'nimali-at-example' }, /email/i, 'email'],
        [{ password: 'short' }, /password/i, 'password'],
      ]

      for (const [override, names, field] of cases) {
        const response = await register({
          ...registration,
          email: 'fresh@example.com',
          ...override,
        })
        assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(override)}`)
        const body = (await response.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(body.error.code, 'invalid_input')
        assert.match(body.error.message, names)
        assert.equal(body.error.field, field)
        assert.equal(sidCookie(response.headers), undefined)
      }

      assert.equal(parentCount(), before)
    })

    it('refuses a wrong-typed value rather than coercing it away', async () => {
      const before = parentCount()
      const wrongTypes: Array<[Record<string, unknown>, RegExp, string]> = [
        [{ secondPhone: 712345678 }, /second phone/i, 'secondPhone'],
        [{ name: 12345 }, /name/i, 'name'],
        [{ whatsapp: ['0771234567'] }, /whatsapp/i, 'whatsapp'],
        [{ email: { address: 'nimali@example.com' } }, /email/i, 'email'],
        [{ password: 123456 }, /password/i, 'password'],
      ]

      for (const [override, names, field] of wrongTypes) {
        const response = await register({
          ...registration,
          email: 'typed@example.com',
          ...override,
        })
        assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(override)}`)
        const body = (await response.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(body.error.code, 'invalid_input')
        assert.match(body.error.message, names)
        assert.equal(body.error.field, field)
        assert.equal(sidCookie(response.headers), undefined)
      }

      assert.equal(parentCount(), before)
    })

    it('caps the password length so an anonymous request cannot drive scrypt', async () => {
      const before = parentCount()

      const tooLong = await register({
        ...registration,
        email: 'long@example.com',
        password: 'a'.repeat(129),
      })
      assert.equal(tooLong.status, 400)
      const tooLongBody = (await tooLong.json()) as {
        error: { code: string; message: string; field?: string }
      }
      assert.equal(tooLongBody.error.code, 'invalid_input')
      assert.match(tooLongBody.error.message, /password/i)
      assert.equal(tooLongBody.error.field, 'password')
      assert.equal(sidCookie(tooLong.headers), undefined)
      assert.equal(parentCount(), before)

      const atTheLimit = await register({
        ...registration,
        email: 'at-the-limit@example.com',
        password: 'a'.repeat(128),
      })
      assert.equal(atTheLimit.status, 201)
      assert.equal(parentCount(), before + 1)
    })

    it('logs a parent in, leaves admin login unchanged, and rejects wrong credentials', async () => {
      const parent = await login(registration.email, registration.password)
      assert.equal(parent.status, 200)
      const parentBody = (await parent.json()) as { role: string; email: string }
      assert.equal(parentBody.role, 'parent')
      assert.equal(parentBody.email, 'nimali@example.com')
      assert.ok(sidCookie(parent.headers))

      const admin = await login('owner@example.com', 'test-password')
      assert.equal(admin.status, 200)
      const adminBody = (await admin.json()) as { role: string; email: string }
      assert.equal(adminBody.role, 'admin')
      assert.equal(adminBody.email, 'owner@example.com')

      const wrongPassword = await login(registration.email, 'not-the-password')
      assert.equal(wrongPassword.status, 401)
      const wrongBody = (await wrongPassword.json()) as { error: { code: string } }
      assert.equal(wrongBody.error.code, 'invalid_credentials')
      assert.equal(sidCookie(wrongPassword.headers), undefined)

      const unknown = await login('nobody@example.com', registration.password)
      assert.equal(unknown.status, 401)
      const unknownBody = (await unknown.json()) as { error: { code: string } }
      assert.equal(unknownBody.error.code, 'invalid_credentials')
      assert.equal(sidCookie(unknown.headers), undefined)
    })

    it('keeps two device sessions independent and resolved to the same parent', async () => {
      const first = await login(registration.email, registration.password)
      const second = await login(registration.email, registration.password)
      const firstCookie = sidCookie(first.headers)
      const secondCookie = sidCookie(second.headers)
      assert.ok(firstCookie)
      assert.ok(secondCookie)
      assert.notEqual(cookieHeader(firstCookie), cookieHeader(secondCookie))

      for (const cookie of [firstCookie, secondCookie]) {
        const probe = await fetch(`${parentBaseUrl}/api/session`, {
          headers: { cookie: cookieHeader(cookie) },
        })
        assert.equal(probe.status, 200)
        const body = (await probe.json()) as { role: string; email: string }
        assert.equal(body.role, 'parent')
        assert.equal(body.email, 'nimali@example.com')
      }

      const logout = await fetch(`${parentBaseUrl}/api/session`, {
        method: 'DELETE',
        headers: { cookie: cookieHeader(firstCookie) },
      })
      assert.equal(logout.status, 204)

      const survivor = await fetch(`${parentBaseUrl}/api/session`, {
        headers: { cookie: cookieHeader(secondCookie) },
      })
      assert.equal(survivor.status, 200)
    })

    it('deletes the session row and clears the cookie on parent logout', async () => {
      const signedIn = await login(registration.email, registration.password)
      const cookie = sidCookie(signedIn.headers)
      assert.ok(cookie)
      const sessionId = cookieHeader(cookie).slice('booklist.sid='.length).split('.')[0]

      const logout = await fetch(`${parentBaseUrl}/api/session`, {
        method: 'DELETE',
        headers: { cookie: cookieHeader(cookie) },
      })
      assert.equal(logout.status, 204)
      const cleared = sidCookie(logout.headers)
      assert.ok(cleared)
      assert.match(cleared, /Max-Age=0/)
      assert.match(cleared, /HttpOnly/i)

      const db = new Database(dbPath, { readonly: true })
      try {
        assert.equal(db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId), undefined)
      } finally {
        db.close()
      }

      const gated = await fetch(`${parentBaseUrl}/api/session`, {
        headers: { cookie: cookieHeader(cookie) },
      })
      assert.equal(gated.status, 401)
      const gatedBody = (await gated.json()) as { error: { code: string } }
      assert.equal(gatedBody.error.code, 'unauthenticated')
    })

    it('rejects a tampered parent cookie without clearing anything', async () => {
      const tampered = await fetch(`${parentBaseUrl}/api/session`, {
        headers: { cookie: 'booklist.sid=tampered.not-a-mac' },
      })
      assert.equal(tampered.status, 401)
      assert.equal(sidCookie(tampered.headers), undefined)
    })

    it('deletes a parent session past expires_at and clears the cookie', async () => {
      const signedIn = await login(registration.email, registration.password)
      const cookie = sidCookie(signedIn.headers)
      assert.ok(cookie)
      const sessionId = cookieHeader(cookie).slice('booklist.sid='.length).split('.')[0]
      assert.ok(sessionId)

      const writer = new Database(dbPath)
      try {
        writer
          .prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
          .run(new Date(Date.now() - 60_000).toISOString(), sessionId)
      } finally {
        writer.close()
      }

      const probe = await fetch(`${parentBaseUrl}/api/session`, {
        headers: { cookie: cookieHeader(cookie) },
      })
      assert.equal(probe.status, 401)
      const body = (await probe.json()) as { error: { code: string } }
      assert.equal(body.error.code, 'unauthenticated')
      const cleared = sidCookie(probe.headers)
      assert.ok(cleared, 'an expired session must clear the cookie')
      assert.match(cleared, /Max-Age=0/)
      assert.match(cleared, /Path=\//)

      const db = new Database(dbPath, { readonly: true })
      try {
        assert.equal(db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId), undefined)
      } finally {
        db.close()
      }
    })

    it('stores an optional second phone normalised and keeps email unique per parent', async () => {
      const response = await register({
        ...registration,
        email: 'gothami.parent@example.com',
        whatsapp: '0712345678',
        secondPhone: '+94 71-765 4321',
      })
      assert.equal(response.status, 201)

      const db = new Database(dbPath, { readonly: true })
      try {
        const row = db
          .prepare('SELECT whatsapp, second_phone FROM parents WHERE email = ?')
          .get('gothami.parent@example.com') as { whatsapp: string; second_phone: string | null }
        assert.equal(row.whatsapp, '+94712345678')
        assert.equal(row.second_phone, '+94717654321')
      } finally {
        db.close()
      }
    })

    it('reports the parent role so the admin app shows only its login form', async () => {
      const signedIn = await login(registration.email, registration.password)
      const cookie = sidCookie(signedIn.headers)
      assert.ok(cookie)
      const probe = await fetch(`${parentBaseUrl}/api/session`, {
        headers: { cookie: cookieHeader(cookie) },
      })
      const body = (await probe.json()) as { role: string }
      assert.equal(body.role, 'parent')

      const gate = await readFile(path.join(repoRoot, 'client', 'admin', 'src', 'AdminGate.tsx'), 'utf8')
      assert.match(gate, /body\.role !== 'admin'/)
    })

    it('refuses the other app\u2019s account at both login success paths', async () => {
      // The contract both clients branch on: a shared 200 that carries a cookie and a role.
      const asParent = await login(registration.email, registration.password)
      assert.equal(asParent.status, 200)
      assert.ok(sidCookie(asParent.headers))
      assert.equal(((await asParent.json()) as { role: string }).role, 'parent')

      const asAdmin = await login('owner@example.com', 'test-password')
      assert.equal(asAdmin.status, 200)
      const adminCookie = sidCookie(asAdmin.headers)
      assert.ok(adminCookie, 'the admin login sets a cookie the storefront must refuse to honour')
      assert.equal(((await asAdmin.json()) as { role: string }).role, 'admin')

      // A refused cross-app login must leave no live session behind.
      const discarded = await fetch(`${parentBaseUrl}/api/session`, {
        method: 'DELETE',
        headers: { cookie: cookieHeader(adminCookie) },
      })
      assert.equal(discarded.status, 204)
      const replay = await fetch(`${parentBaseUrl}/api/session`, {
        headers: { cookie: cookieHeader(adminCookie) },
      })
      assert.equal(replay.status, 401)

      const loginForm = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'LoginForm.tsx'),
        'utf8',
      )
      const auth = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'auth.tsx'),
        'utf8',
      )

      // The success paths, not only the mount probes, must check the role.
      assert.match(loginForm, /as \{ role\?: string; email\?: string \}/)
      assert.match(loginForm, /body\.role !== 'admin'/)
      assert.match(loginForm, /await discardSession\(\)/)
      assert.match(loginForm, /method: 'DELETE'/)

      assert.equal(
        (auth.match(/body\.role !== 'parent'/g) ?? []).length,
        3,
        'the probe, logIn and register must each refuse a non-parent role',
      )
      assert.equal((auth.match(/await discardSession\(\)/g) ?? []).length, 2)
    })

    it('gates cart, orders, and account in place and lands on Browse after either action', async () => {
      const app = await readFile(storefrontAppPath, 'utf8')
      const gate = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'AuthGate.tsx'),
        'utf8',
      )
      const auth = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'auth.tsx'),
        'utf8',
      )
      const shell = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'Shell.tsx'),
        'utf8',
      )
      const css = await readFile(baseCssPath, 'utf8')

      const gated = app.match(/<Route element=\{<AuthGate \/>\}>([\s\S]*?)<\/Route>/)?.[1]
      assert.ok(gated, 'storefront routes must nest the protected tabs under AuthGate')
      for (const tab of ['cart', 'orders', 'account']) {
        assert.match(gated, new RegExp(`path="${tab}"`))
      }
      assert.doesNotMatch(app, /<Route index element=\{<AuthGate/)
      assert.match(app, /<Route index element=\{<Page title="Browse" \/>\} \/>/)

      assert.match(gate, /navigate\('\/', \{ replace: true \}\)/)
      assert.match(gate, /Log in/)
      assert.match(gate, /Create account/)
      assert.match(gate, /role="status"/)
      assert.match(gate, /htmlFor=\{id\}/)
      assert.match(gate, /role="alert"/)
      assert.match(gate, /button-secondary/)
      assert.doesNotMatch(gate, /admin-email|admin-password|admin-login-error/)

      // One draft behind both panels, never reset, so switching keeps every typed value.
      assert.match(gate, /const \[draft, setDraft\] = useState<RegisterInput>\(EMPTY_DRAFT\)/)
      assert.doesNotMatch(gate, /setDraft\(EMPTY_DRAFT\)/)
      assert.match(gate, /<LoginPanel draft=\{draft\}/)
      assert.match(gate, /<RegisterPanel draft=\{draft\}/)

      // The refused field gets the danger border and owns the message on its own.
      assert.match(gate, /setInvalidField\(asRegisterField\(failure\.field\)\)/)
      assert.match(gate, /error && invalidField === field \? errorId : undefined/)
      assert.doesNotMatch(gate, /describedBy=\{describedBy\}/)

      assert.match(auth, /credentials: 'include'/)
      assert.match(auth, /'\/api\/parents'/)
      assert.match(shell, /<SessionProvider>/)
      assert.match(shell, /second phone number/i)
      assert.match(css, /\.button-secondary\s*\{/)
    })
  })

  describe('Parent account', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string

    const nimali = {
      name: 'Nimali Perera',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '0771234567',
      secondPhone: '0717654321',
      email: 'nimali.account@example.com',
      password: 'evening-order',
    }

    const gothami = {
      name: 'Gothami Silva',
      deliveryAddress: '8 Lake Road, Kandy',
      whatsapp: '0712345678',
      secondPhone: '',
      email: 'gothami.account@example.com',
      password: 'morning-list',
    }

    function register(body: Record<string, unknown>): Promise<Response> {
      return fetch(`${accountBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    function login(email: string, password: string): Promise<Response> {
      return fetch(`${accountBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    }

    function getMe(cookie: string): Promise<Response> {
      return fetch(`${accountBaseUrl}/api/parents/me`, {
        headers: { cookie },
      })
    }

    function patchMe(cookie: string, body: Record<string, unknown>): Promise<Response> {
      return fetch(`${accountBaseUrl}/api/parents/me`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(body),
      })
    }

    type ParentSnapshot = {
      id: number
      email: string
      password_hash: string
      name: string
      delivery_address: string
      whatsapp: string
      second_phone: string | null
    }

    function allParents(): ParentSnapshot[] {
      const db = new Database(dbPath, { readonly: true })
      try {
        return db
          .prepare(
            'SELECT id, email, password_hash, name, delivery_address, whatsapp, second_phone FROM parents ORDER BY id',
          )
          .all() as ParentSnapshot[]
      } finally {
        db.close()
      }
    }

    function parentByEmail(email: string): ParentSnapshot {
      const row = allParents().find((item) => item.email === email)
      assert.ok(row, `missing parent ${email}`)
      return row
    }

    async function signIn(account: { email: string; password: string }): Promise<string> {
      const response = await login(account.email, account.password)
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-account-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, ACCOUNT_PORT)
      child = started.child
      const first = await register(nimali)
      assert.equal(first.status, 201)
      const second = await register(gothami)
      assert.equal(second.status, 201)
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('loads the session parent profile and never returns a secret', async () => {
      const cookie = await signIn(gothami)
      const response = await getMe(cookie)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as Record<string, unknown>
      assert.deepEqual(body, {
        name: 'Gothami Silva',
        deliveryAddress: '8 Lake Road, Kandy',
        whatsapp: '+94712345678',
        secondPhone: null,
        email: 'gothami.account@example.com',
      })
      assert.equal('password_hash' in body, false)
      assert.equal('password' in body, false)
      assert.equal('id' in body, false)
    })

    it('saves contact fields on that parent only and stores phones as +947XXXXXXXX', async () => {
      const cookie = await signIn(nimali)
      const beforeOther = parentByEmail(gothami.email)

      const response = await patchMe(cookie, {
        name: 'Nimali J. Perera',
        deliveryAddress: '45 Flower Road, Colombo',
        whatsapp: '077 999 0011',
        secondPhone: '+94 71-222 3333',
        email: 'ignored@example.com',
        id: parentByEmail(gothami.email).id,
      })
      assert.equal(response.status, 200)
      const body = (await response.json()) as Record<string, unknown>
      assert.deepEqual(body, {
        name: 'Nimali J. Perera',
        deliveryAddress: '45 Flower Road, Colombo',
        whatsapp: '+94779990011',
        secondPhone: '+94712223333',
        email: 'nimali.account@example.com',
      })

      const row = parentByEmail(nimali.email)
      assert.equal(row.name, 'Nimali J. Perera')
      assert.equal(row.delivery_address, '45 Flower Road, Colombo')
      assert.equal(row.whatsapp, '+94779990011')
      assert.equal(row.second_phone, '+94712223333')
      assert.equal(row.email, 'nimali.account@example.com')
      assert.deepEqual(parentByEmail(gothami.email), beforeOther)

      const probe = await fetch(`${accountBaseUrl}/api/session`, { headers: { cookie } })
      assert.equal(probe.status, 200)
      const sessionBody = (await probe.json()) as Record<string, unknown>
      assert.deepEqual(sessionBody, { role: 'parent', email: 'nimali.account@example.com' })
    })

    it('leaves the password hash unchanged when password is empty, omitted, or whitespace', async () => {
      const cookie = await signIn(nimali)
      const before = parentByEmail(nimali.email)
      const contact = {
        name: before.name,
        deliveryAddress: before.delivery_address,
        whatsapp: before.whatsapp,
        secondPhone: before.second_phone,
      }

      const omitted = await patchMe(cookie, contact)
      assert.equal(omitted.status, 200)
      assert.equal(parentByEmail(nimali.email).password_hash, before.password_hash)

      const empty = await patchMe(cookie, { ...contact, password: '' })
      assert.equal(empty.status, 200)
      assert.equal(parentByEmail(nimali.email).password_hash, before.password_hash)

      const whitespace = await patchMe(cookie, { ...contact, password: '      ' })
      assert.equal(whitespace.status, 200)
      assert.equal(parentByEmail(nimali.email).password_hash, before.password_hash)

      const still = await fetch(`${accountBaseUrl}/api/session`, { headers: { cookie } })
      assert.equal(still.status, 200)
      const body = (await still.json()) as { role: string }
      assert.equal(body.role, 'parent')
    })

    it('keeps a null second phone null when PATCH sends an empty string', async () => {
      const cookie = await signIn(gothami)
      const before = parentByEmail(gothami.email)
      assert.equal(before.second_phone, null)

      const response = await patchMe(cookie, {
        name: before.name,
        deliveryAddress: before.delivery_address,
        whatsapp: before.whatsapp,
        secondPhone: '',
      })
      assert.equal(response.status, 200)
      const body = (await response.json()) as { secondPhone: string | null }
      assert.equal(body.secondPhone, null)
      assert.equal(parentByEmail(gothami.email).second_phone, null)
    })

    it('refuses invalid fields with one named field and writes nothing', async () => {
      const cookie = await signIn(nimali)
      const before = parentByEmail(nimali.email)
      const contact = {
        name: before.name,
        deliveryAddress: before.delivery_address,
        whatsapp: before.whatsapp,
        secondPhone: before.second_phone,
      }

      const several = await patchMe(cookie, {
        name: '   ',
        deliveryAddress: '',
        whatsapp: '0712345',
        secondPhone: '12345',
        password: 'x',
      })
      assert.equal(several.status, 400)
      const severalBody = (await several.json()) as {
        error: { code: string; message: string; field?: string }
      }
      assert.equal(severalBody.error.code, 'invalid_input')
      assert.equal(severalBody.error.field, 'name')
      assert.match(severalBody.error.message, /name/i)
      assert.deepEqual(parentByEmail(nimali.email), before)

      const cases: Array<[Record<string, unknown>, string, RegExp]> = [
        [{ name: '   ' }, 'name', /name/i],
        [{ deliveryAddress: '' }, 'deliveryAddress', /address/i],
        [{ whatsapp: '0712345' }, 'whatsapp', /whatsapp/i],
        [{ secondPhone: '12345' }, 'secondPhone', /second phone/i],
        [{ password: 'short' }, 'password', /password/i],
        [{ password: 'a'.repeat(129) }, 'password', /password/i],
        [{ name: 12345 }, 'name', /name/i],
      ]
      for (const [override, field, names] of cases) {
        const response = await patchMe(cookie, { ...contact, ...override })
        assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(override)}`)
        const body = (await response.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(body.error.code, 'invalid_input')
        assert.equal(body.error.field, field)
        assert.match(body.error.message, names)
        assert.deepEqual(parentByEmail(nimali.email), before)
      }
    })

    it('rejects anonymous and stale cookies without reading a parent row', async () => {
      const before = allParents()

      const missing = await fetch(`${accountBaseUrl}/api/parents/me`)
      assert.equal(missing.status, 401)
      const missingBody = (await missing.json()) as { error: { code: string; message: string } }
      assert.equal(missingBody.error.code, 'unauthenticated')
      assert.match(missingBody.error.message, /[A-Za-z]/)
      assert.equal(sidCookie(missing.headers), undefined)

      const missingPatch = await patchMe('', {
        name: 'Hacker',
        deliveryAddress: 'Nowhere',
        whatsapp: '0771234567',
        secondPhone: '',
      })
      assert.equal(missingPatch.status, 401)
      const missingPatchBody = (await missingPatch.json()) as { error: { code: string } }
      assert.equal(missingPatchBody.error.code, 'unauthenticated')

      const cookie = await signIn(nimali)
      const sessionId = cookie.slice('booklist.sid='.length).split('.')[0]
      assert.ok(sessionId)
      const writer = new Database(dbPath)
      try {
        writer
          .prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
          .run(new Date(Date.now() - 60_000).toISOString(), sessionId)
      } finally {
        writer.close()
      }

      const stalePatch = await patchMe(cookie, {
        name: 'Hacker',
        deliveryAddress: 'Nowhere',
        whatsapp: '0771234567',
        secondPhone: '',
      })
      assert.equal(stalePatch.status, 401)
      const staleBody = (await stalePatch.json()) as { error: { code: string } }
      assert.equal(staleBody.error.code, 'unauthenticated')
      const cleared = sidCookie(stalePatch.headers)
      assert.ok(cleared, 'a stale session must clear the cookie')
      assert.match(cleared, /Max-Age=0/)

      assert.deepEqual(allParents(), before)
    })

    it('stores a new scrypt hash, keeps this session, and requires the new password to log in', async () => {
      const cookie = await signIn(nimali)
      const before = parentByEmail(nimali.email)
      const nextPassword = 'fresh-evening'
      const sessionsBefore = new Database(dbPath, { readonly: true })
      let sessionCount: number
      try {
        sessionCount = (
          sessionsBefore.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }
        ).n
      } finally {
        sessionsBefore.close()
      }

      const response = await patchMe(cookie, {
        name: before.name,
        deliveryAddress: before.delivery_address,
        whatsapp: before.whatsapp,
        secondPhone: before.second_phone,
        password: nextPassword,
      })
      assert.equal(response.status, 200)

      const after = parentByEmail(nimali.email)
      assert.notEqual(after.password_hash, before.password_hash)
      assert.match(after.password_hash, /^scrypt\$/)
      assert.equal(after.password_hash.includes(nextPassword), false)
      assert.equal(after.password_hash.includes(nimali.password), false)

      const sessionsAfter = new Database(dbPath, { readonly: true })
      try {
        const count = (sessionsAfter.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number })
          .n
        assert.equal(count, sessionCount)
      } finally {
        sessionsAfter.close()
      }

      const stillMe = await getMe(cookie)
      assert.equal(stillMe.status, 200)
      const stillBody = (await stillMe.json()) as { email: string }
      assert.equal(stillBody.email, nimali.email)

      const oldLogin = await login(nimali.email, nimali.password)
      assert.equal(oldLogin.status, 401)
      const oldBody = (await oldLogin.json()) as { error: { code: string } }
      assert.equal(oldBody.error.code, 'invalid_credentials')
      assert.equal(sidCookie(oldLogin.headers), undefined)

      const newLogin = await login(nimali.email, nextPassword)
      assert.equal(newLogin.status, 200)
      assert.ok(sidCookie(newLogin.headers))
    })

    it('refuses an admin session on GET and PATCH without touching parent rows', async () => {
      const before = allParents()
      const adminLogin = await login('owner@example.com', 'test-password')
      assert.equal(adminLogin.status, 200)
      const cookie = sidCookie(adminLogin.headers)
      assert.ok(cookie)
      const header = cookieHeader(cookie)

      const get = await getMe(header)
      assert.equal(get.status, 403)
      const getBody = (await get.json()) as { error: { code: string; message: string } }
      assert.equal(getBody.error.code, 'forbidden')
      assert.match(getBody.error.message, /[A-Za-z]/)
      assert.equal('name' in getBody, false)

      const patch = await patchMe(header, {
        name: 'Owner',
        deliveryAddress: 'The shop',
        whatsapp: '0771234567',
        secondPhone: '',
        password: 'should-not-apply',
        id: parentByEmail(nimali.email).id,
      })
      assert.equal(patch.status, 403)
      const patchBody = (await patch.json()) as { error: { code: string; message: string } }
      assert.equal(patchBody.error.code, 'forbidden')
      assert.match(patchBody.error.message, /[A-Za-z]/)

      assert.deepEqual(allParents(), before)
    })

    it('keeps Account as the profile surface: read-only email, Save primary, Log out secondary', async () => {
      const accountPage = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'AccountPage.tsx'),
        'utf8',
      )
      const app = await readFile(storefrontAppPath, 'utf8')
      const auth = await readFile(path.join(repoRoot, 'client', 'storefront', 'src', 'auth.tsx'), 'utf8')
      const http = await readFile(path.join(serverRoot, 'identity', 'http.ts'), 'utf8')

      assert.match(app, /import \{ AccountPage \} from '\.\/AccountPage'/)
      assert.match(app, /path="account" element=\{<AccountPage \/>\}/)
      assert.doesNotMatch(auth, /parents\/me/)
      assert.match(auth, /credentials: 'include'/)

      assert.match(accountPage, /fetch\('\/api\/parents\/me'/)
      assert.match(accountPage, /method: 'PATCH'/)
      assert.match(accountPage, /credentials: 'include'/)
      for (const id of [
        'storefront-account-name',
        'storefront-account-address',
        'storefront-account-whatsapp',
        'storefront-account-second-phone',
        'storefront-account-email',
        'storefront-account-password',
      ]) {
        assert.match(accountPage, new RegExp(`id="${id}"`))
      }
      assert.match(accountPage, /label="Name"/)
      assert.match(accountPage, /label="Delivery address"/)
      assert.match(accountPage, /label="WhatsApp number"/)
      assert.match(accountPage, /label="Second phone \(optional\)"/)
      assert.match(accountPage, /label="Email"/)
      assert.match(accountPage, /New password \(optional\)/)
      assert.match(accountPage, /readOnly/)
      assert.match(accountPage, /button-primary/)
      assert.match(accountPage, />\s*Save\s*</)
      assert.match(accountPage, /button-secondary/)
      assert.match(accountPage, /Log out/)
      assert.equal((accountPage.match(/button-primary/g) ?? []).length, 1)
      assert.match(accountPage, /setInvalidField\(asProfileField\(failure\.field\)\)/)
      assert.doesNotMatch(accountPage, /setDraft\(EMPTY_DRAFT\)/)
      assert.match(accountPage, /disabled=\{submitting\}/)
      assert.match(accountPage, /controller\.signal\.aborted/)
      assert.match(accountPage, /Log out, then sign in again/)

      const getMeRoute = http.match(/router\.get\(\s*'\/parents\/me'[\s\S]*?router\.patch\(/)?.[0]
      const patchMeRoute = http.match(/router\.patch\(\s*'\/parents\/me'[\s\S]*?router\.post\(/)?.[0]
      assert.ok(getMeRoute, 'GET /parents/me must exist')
      assert.ok(patchMeRoute, 'PATCH /parents/me must exist')
      assert.match(getMeRoute, /lookupSession/)
      assert.match(patchMeRoute, /lookupSession/)
      assert.match(getMeRoute, /role !== 'parent'/)
      assert.match(patchMeRoute, /role !== 'parent'/)
      assert.ok(getMeRoute.indexOf("role !== 'parent'") < getMeRoute.indexOf('findParentById'))
      assert.match(patchMeRoute, /saveParentProfile/)
      assert.doesNotMatch(patchMeRoute, /DELETE FROM sessions/)
      assert.doesNotMatch(getMeRoute, /DELETE FROM sessions/)
      assert.match(http, /db\.prepare\('DELETE FROM sessions WHERE admin_id = \?'\)/)

      const parentsSource = await readFile(path.join(serverRoot, 'identity', 'parents.ts'), 'utf8')
      const saveStart = parentsSource.indexOf('export async function saveParentProfile')
      assert.ok(saveStart >= 0)
      const hashAt = parentsSource.indexOf('await hashSecret(password)', saveStart)
      const txAt = parentsSource.indexOf('db.transaction', saveStart)
      assert.ok(hashAt >= 0 && txAt >= 0 && hashAt < txAt, 'hash the password before any SQL write')
    })

    it('maps GET profile JSON onto the Account form and PATCH keys', () => {
      const body = {
        name: 'Gothami Silva',
        deliveryAddress: '8 Lake Road, Kandy',
        whatsapp: '+94712345678',
        secondPhone: null,
        email: 'gothami.account@example.com',
      }
      const draft = profileDraftFromGet(body, 'fallback@example.com')
      assert.equal(draft.name, 'Gothami Silva')
      assert.equal(draft.deliveryAddress, '8 Lake Road, Kandy')
      assert.equal(draft.whatsapp, '+94712345678')
      assert.equal(draft.secondPhone, '')
      assert.equal(draft.email, 'gothami.account@example.com')
      assert.equal(draft.password, '')
      assert.equal('delivery_address' in draft, false)
      assert.equal('second_phone' in draft, false)

      const patch = profilePatchBody(draft)
      assert.deepEqual(patch, {
        name: 'Gothami Silva',
        deliveryAddress: '8 Lake Road, Kandy',
        whatsapp: '+94712345678',
        secondPhone: '',
        password: '',
      })
      assert.equal('delivery_address' in patch, false)
      assert.equal('second_phone' in patch, false)
    })
  })

  describe('Migration 002 over a Story 1.2 database', () => {
    it('applies 002 once and keeps an existing admin session valid', async () => {
      const dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-upgrade-'))
      const dbPath = path.join(dbDir, 'booklist.db')
      const sessionId = 'story-1-2-session-id'
      const mac = createHmac('sha256', 'test-secret').update(sessionId).digest('base64url')
      const cookie = `booklist.sid=${sessionId}.${mac}`

      try {
        const migration001 = await readFile(
          path.join(serverRoot, 'db', 'migrations', '001_identity_admin_sessions_and_recovery.sql'),
          'utf8',
        )
        const seeded = new Database(dbPath)
        try {
          seeded.exec(`
            CREATE TABLE applied_migrations (
              filename TEXT PRIMARY KEY NOT NULL,
              applied_at TEXT NOT NULL
            )
          `)
          seeded.exec(migration001)
          const now = new Date().toISOString()
          const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          const placeholderHash = 'scrypt$16384$8$1$c2FsdHk$a2V5bWF0ZXJpYWw'
          seeded
            .prepare('INSERT INTO applied_migrations (filename, applied_at) VALUES (?, ?)')
            .run('001_identity_admin_sessions_and_recovery.sql', now)
          seeded
            .prepare('INSERT INTO admins (id, email, password_hash, created_at) VALUES (1, ?, ?, ?)')
            .run('owner@example.com', placeholderHash, now)
          seeded
            .prepare('INSERT INTO admin_recovery (id, code_hash, created_at) VALUES (1, ?, ?)')
            .run(placeholderHash, now)
          seeded
            .prepare('INSERT INTO sessions (id, admin_id, created_at, expires_at) VALUES (?, 1, ?, ?)')
            .run(sessionId, now, expires)
        } finally {
          seeded.close()
        }

        const started = await startIdentityServer(dbPath, UPGRADE_PORT)
        try {
          assert.equal(recoveryCodes(started.output.text).length, 0)
          const probe = await fetch(`http://127.0.0.1:${UPGRADE_PORT}/api/session`, {
            headers: { cookie },
          })
          assert.equal(probe.status, 200)
          const body = (await probe.json()) as { role: string; email: string }
          assert.equal(body.role, 'admin')
          assert.equal(body.email, 'owner@example.com')
        } finally {
          await stopChild(started.child)
        }

        const upgraded = new Database(dbPath)
        try {
          const applied = upgraded
            .prepare('SELECT COUNT(*) AS n FROM applied_migrations')
            .get() as { n: number }
          assert.equal(applied.n, 2)
          const parents = upgraded
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'parents'")
            .get()
          assert.ok(parents)

          const kept = upgraded
            .prepare('SELECT admin_id, parent_id FROM sessions WHERE id = ?')
            .get(sessionId) as { admin_id: number | null; parent_id: number | null }
          assert.equal(kept.admin_id, 1)
          assert.equal(kept.parent_id, null)

          const insert = upgraded.prepare(
            'INSERT INTO sessions (id, admin_id, parent_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
          )
          const now = new Date().toISOString()
          assert.throws(() => insert.run('neither', null, null, now, now))
          assert.throws(() => insert.run('both', 1, 1, now, now))
        } finally {
          upgraded.close()
        }
      } finally {
        await rm(dbDir, { recursive: true, force: true })
      }
    })
  })

  describe('Later boot does not reseed', () => {
    it('does not create a second admin or reprint a recovery code', async () => {
      const dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-reseed-'))
      const dbPath = path.join(dbDir, 'booklist.db')
      const first = await startIdentityServer(dbPath, String(18767))
      try {
        assert.equal(recoveryCodes(first.output.text).length, 1)
        await stopChild(first.child)
        const second = await startIdentityServer(dbPath, String(18768), {
          ADMIN_EMAIL: 'other@example.com',
          ADMIN_PASSWORD: 'changed-env',
        })
        try {
          assert.equal(recoveryCodes(second.output.text).length, 0)
          const db = new Database(dbPath, { readonly: true })
          try {
            const admins = db.prepare('SELECT email FROM admins').all() as Array<{ email: string }>
            assert.equal(admins.length, 1)
            assert.equal(admins[0]?.email, 'owner@example.com')
          } finally {
            db.close()
          }
        } finally {
          await stopChild(second.child)
        }
      } finally {
        await rm(dbDir, { recursive: true, force: true })
      }
    })
  })

  describe('Admin gate and recovery copy', () => {
    it('keeps logged-out /admin on the login form and lands on Orders after success', async () => {
      const adminApp = await readFile(adminAppPath, 'utf8')
      const loginForm = await readFile(path.join(repoRoot, 'client', 'admin', 'src', 'LoginForm.tsx'), 'utf8')
      const gate = await readFile(path.join(repoRoot, 'client', 'admin', 'src', 'AdminGate.tsx'), 'utf8')
      const shell = await readFile(path.join(repoRoot, 'client', 'admin', 'src', 'Shell.tsx'), 'utf8')
      assert.match(adminApp, /<Route element=\{<AdminGate \/>\}>/)
      assert.match(adminApp, /<Route element=\{<Shell \/>\}>/)
      assert.match(
        adminApp,
        /<Route element=\{<AdminGate \/>\}>[\s\S]*<Route path="\*" element=\{<BlankPage \/>\} \/>/,
      )
      assert.match(loginForm, /htmlFor="admin-email"/)
      assert.match(loginForm, /htmlFor="admin-password"/)
      assert.match(loginForm, /isValidEmail|valid email/i)
      assert.match(loginForm, /setError\(/)
      assert.doesNotMatch(loginForm, /setEmail\(''\)/)
      assert.match(gate, /navigate\('\/', \{ replace: true \}\)/)
      assert.match(gate, /response\.ok \|\| response\.status === 401/)
      assert.match(shell, /Log out/)
      assert.doesNotMatch(shell, /admin-sidebar-export[\s\S]*Log out/)
      assert.doesNotMatch(loginForm, /<Shell/)
    })

    it('has no recovery field, copy, or flow in either app', async () => {
      const roots = [
        path.join(repoRoot, 'client', 'admin', 'src'),
        path.join(repoRoot, 'client', 'storefront', 'src'),
        path.join(repoRoot, 'client', 'admin', 'dist'),
        path.join(repoRoot, 'client', 'storefront', 'dist'),
      ]
      const banned = /\brecovery\b|\bforgot\b|reset password|single-use/i
      for (const root of roots) {
        const files = await walkFiles(root)
        for (const file of files) {
          if (!/\.(tsx?|js|css|html)$/.test(file)) continue
          const source = await readFile(file, 'utf8')
          assert.doesNotMatch(source, banned, `recovery copy in ${file}`)
        }
      }
    })

    it('writes Set-Cookie only from identity', async () => {
      const files = [
        ...(await walkFiles(path.join(serverRoot, 'web'))),
        ...(await walkFiles(path.join(serverRoot, 'identity'))),
      ]
      for (const file of files) {
        if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
        if (file.endsWith(`${path.sep}cookies.ts`)) continue
        const source = await readFile(file, 'utf8')
        assert.doesNotMatch(source, /Set-Cookie/)
        assert.doesNotMatch(source, /res\.cookie\s*\(/)
      }
    })
  })
})
