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
import {
  parentsFindQuery,
  parentsPasswordBody,
  settingsPasswordBody,
} from '../../client/admin/src/adminPasswords.ts'
import { catalogArchivePath, catalogCollectionPath, catalogItemPath, catalogNameBody } from '../../client/admin/src/catalogNamed.ts'
import {
  bookBody,
  booksArchivePath,
  booksCollectionPath,
  booksItemPath,
} from '../../client/admin/src/books.ts'
import {
  itemBody,
  itemsArchivePath,
  itemsCollectionPath,
  itemsItemPath,
} from '../../client/admin/src/items.ts'
import {
  packCreateBody,
  packPatchBody,
  packsArchivePath,
  packsCollectionPath,
  packsItemPath,
} from '../../client/admin/src/packs.ts'
import { formatRupees } from '../../client/ui/money.ts'
import { toStorefrontPack } from '../catalog/packs.ts'

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
const ADMIN_PASSWORD_PORT = String(18772)
const adminPasswordBaseUrl = `http://127.0.0.1:${ADMIN_PASSWORD_PORT}`
const CATALOG_PORT = String(18773)
const catalogBaseUrl = `http://127.0.0.1:${CATALOG_PORT}`
const BOOKS_PORT = String(18774)
const booksBaseUrl = `http://127.0.0.1:${BOOKS_PORT}`
const PACKS_PORT = String(18775)
const packsBaseUrl = `http://127.0.0.1:${PACKS_PORT}`
const ITEMS_PORT = String(18776)
const itemsBaseUrl = `http://127.0.0.1:${ITEMS_PORT}`
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
        assert.equal(applied.n, 6)
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

  describe('Admin password and parent reset', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string

    const nimali = {
      name: 'Nimali Perera',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '0771234567',
      secondPhone: '0717654321',
      email: 'nimali.reset@example.com',
      password: 'evening-order',
    }

    function register(body: Record<string, unknown>): Promise<Response> {
      return fetch(`${adminPasswordBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    function login(email: string, password: string): Promise<Response> {
      return fetch(`${adminPasswordBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    }

    async function signIn(email: string, password: string): Promise<string> {
      const response = await login(email, password)
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    function patchAdminPassword(cookie: string, password: string): Promise<Response> {
      return fetch(`${adminPasswordBaseUrl}/api/admin/me`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(settingsPasswordBody(password)),
      })
    }

    function findParent(cookie: string, email: string): Promise<Response> {
      return fetch(`${adminPasswordBaseUrl}/api/admin/parents?${parentsFindQuery(email)}`, {
        headers: { cookie },
      })
    }

    function patchParentPassword(cookie: string, email: string, password: string): Promise<Response> {
      return fetch(`${adminPasswordBaseUrl}/api/admin/parents`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(parentsPasswordBody(email, password)),
      })
    }

    type AdminSnapshot = { id: number; email: string; password_hash: string }
    type ParentSnapshot = {
      id: number
      email: string
      password_hash: string
      name: string
      delivery_address: string
      whatsapp: string
      second_phone: string | null
    }

    function adminRow(): AdminSnapshot {
      const db = new Database(dbPath, { readonly: true })
      try {
        return db.prepare('SELECT id, email, password_hash FROM admins').get() as AdminSnapshot
      } finally {
        db.close()
      }
    }

    function parentByEmail(email: string): ParentSnapshot {
      const db = new Database(dbPath, { readonly: true })
      try {
        const row = db
          .prepare(
            'SELECT id, email, password_hash, name, delivery_address, whatsapp, second_phone FROM parents WHERE email = ?',
          )
          .get(email) as ParentSnapshot | undefined
        assert.ok(row, `missing parent ${email}`)
        return row
      } finally {
        db.close()
      }
    }

    function sessionCount(): number {
      const db = new Database(dbPath, { readonly: true })
      try {
        return (db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n
      } finally {
        db.close()
      }
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-admin-password-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, ADMIN_PASSWORD_PORT)
      child = started.child
      const created = await register(nimali)
      assert.equal(created.status, 201)
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('stores a new admin scrypt hash, keeps this session, and requires the new password to log in', async () => {
      const cookie = await signIn('owner@example.com', 'test-password')
      const before = adminRow()
      const sessionsBefore = sessionCount()
      const nextPassword = 'owner-evening'

      const response = await patchAdminPassword(cookie, nextPassword)
      assert.equal(response.status, 200)
      const body = (await response.json()) as Record<string, unknown>
      assert.equal(body.ok, true)
      assert.equal('password' in body, false)
      assert.equal('password_hash' in body, false)

      const after = adminRow()
      assert.notEqual(after.password_hash, before.password_hash)
      assert.match(after.password_hash, /^scrypt\$/)
      assert.equal(after.password_hash.includes(nextPassword), false)
      assert.equal(after.password_hash.includes('test-password'), false)
      assert.equal(sessionCount(), sessionsBefore)

      const still = await fetch(`${adminPasswordBaseUrl}/api/session`, { headers: { cookie } })
      assert.equal(still.status, 200)
      const stillBody = (await still.json()) as { role: string; email: string }
      assert.equal(stillBody.role, 'admin')
      assert.equal(stillBody.email, 'owner@example.com')

      const oldLogin = await login('owner@example.com', 'test-password')
      assert.equal(oldLogin.status, 401)
      const oldBody = (await oldLogin.json()) as { error: { code: string } }
      assert.equal(oldBody.error.code, 'invalid_credentials')
      assert.equal(sidCookie(oldLogin.headers), undefined)

      const newLogin = await login('owner@example.com', nextPassword)
      assert.equal(newLogin.status, 200)
      assert.ok(sidCookie(newLogin.headers))
    })

    it('sets a parent password by email with no secret in the JSON, and that parent can log in immediately', async () => {
      const parentCookieBefore = await signIn(nimali.email, nimali.password)
      const adminCookie = await signIn('owner@example.com', 'owner-evening')
      const before = parentByEmail(nimali.email)
      const sessionsBefore = sessionCount()
      const nextPassword = 'fresh-morning'

      const found = await findParent(adminCookie, 'Nimali.Reset@Example.com')
      assert.equal(found.status, 200)
      assert.equal(found.headers.get('cache-control'), 'no-store')
      const foundBody = (await found.json()) as Record<string, unknown>
      assert.deepEqual(foundBody, { email: nimali.email })
      assert.equal('password_hash' in foundBody, false)
      assert.equal('password' in foundBody, false)
      assert.equal('id' in foundBody, false)

      const response = await patchParentPassword(
        adminCookie,
        'Nimali.Reset@Example.com',
        nextPassword,
      )
      assert.equal(response.status, 200)
      const body = (await response.json()) as Record<string, unknown>
      assert.deepEqual(body, { email: nimali.email })
      assert.equal('password' in body, false)
      assert.equal('password_hash' in body, false)

      const after = parentByEmail(nimali.email)
      assert.notEqual(after.password_hash, before.password_hash)
      assert.match(after.password_hash, /^scrypt\$/)
      assert.equal(after.password_hash.includes(nextPassword), false)
      assert.equal(after.password_hash.includes(nimali.password), false)
      assert.equal(after.name, before.name)
      assert.equal(after.delivery_address, before.delivery_address)
      assert.equal(after.whatsapp, before.whatsapp)
      assert.equal(after.second_phone, before.second_phone)
      assert.equal(sessionCount(), sessionsBefore)

      const stillParent = await fetch(`${adminPasswordBaseUrl}/api/parents/me`, {
        headers: { cookie: parentCookieBefore },
      })
      assert.equal(stillParent.status, 200)
      const stillParentBody = (await stillParent.json()) as { email: string }
      assert.equal(stillParentBody.email, nimali.email)

      const oldLogin = await login(nimali.email, nimali.password)
      assert.equal(oldLogin.status, 401)

      const newLogin = await login(nimali.email, nextPassword)
      assert.equal(newLogin.status, 200)
      const parentCookie = sidCookie(newLogin.headers)
      assert.ok(parentCookie)

      const me = await fetch(`${adminPasswordBaseUrl}/api/parents/me`, {
        headers: { cookie: cookieHeader(parentCookie) },
      })
      assert.equal(me.status, 200)
      const meBody = (await me.json()) as { email: string }
      assert.equal(meBody.email, nimali.email)

      const adminMe = await fetch(`${adminPasswordBaseUrl}/api/parents/me`, {
        headers: { cookie: adminCookie },
      })
      assert.equal(adminMe.status, 403)
    })

    it('refuses an email no parent holds and writes no hash', async () => {
      const cookie = await signIn('owner@example.com', 'owner-evening')
      const beforeAdmin = adminRow()
      const beforeParent = parentByEmail(nimali.email)

      const missingGet = await findParent(cookie, 'nobody@example.com')
      assert.equal(missingGet.status, 404)
      const missingGetBody = (await missingGet.json()) as {
        error: { code: string; message: string; field?: string }
      }
      assert.equal(missingGetBody.error.code, 'unknown_email')
      assert.match(missingGetBody.error.message, /[A-Za-z]/)
      assert.equal(missingGetBody.error.field, 'email')

      const missingPatch = await patchParentPassword(
        cookie,
        'nobody@example.com',
        'should-not-apply',
      )
      assert.equal(missingPatch.status, 404)
      const missingPatchBody = (await missingPatch.json()) as {
        error: { code: string; message: string; field?: string }
      }
      assert.equal(missingPatchBody.error.code, 'unknown_email')
      assert.match(missingPatchBody.error.message, /[A-Za-z]/)
      assert.equal(missingPatchBody.error.field, 'email')

      assert.deepEqual(adminRow(), beforeAdmin)
      assert.deepEqual(parentByEmail(nimali.email), beforeParent)
    })

    it('refuses an empty, whitespace, short, or long password on either write', async () => {
      const cookie = await signIn('owner@example.com', 'owner-evening')
      const beforeAdmin = adminRow()
      const beforeParent = parentByEmail(nimali.email)
      const cases: Array<[string, RegExp]> = [
        ['', /password/i],
        ['      ', /password/i],
        ['short', /password/i],
        ['a'.repeat(129), /password/i],
      ]

      for (const [password, names] of cases) {
        const adminWrite = await patchAdminPassword(cookie, password)
        assert.equal(adminWrite.status, 400, `admin expected 400 for ${JSON.stringify(password)}`)
        const adminBody = (await adminWrite.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(adminBody.error.code, 'invalid_input')
        assert.equal(adminBody.error.field, 'password')
        assert.match(adminBody.error.message, names)

        const parentWrite = await patchParentPassword(cookie, nimali.email, password)
        assert.equal(parentWrite.status, 400, `parent expected 400 for ${JSON.stringify(password)}`)
        const parentBody = (await parentWrite.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(parentBody.error.code, 'invalid_input')
        assert.equal(parentBody.error.field, 'password')
        assert.match(parentBody.error.message, names)
      }

      assert.deepEqual(adminRow(), beforeAdmin)
      assert.deepEqual(parentByEmail(nimali.email), beforeParent)
    })

    it('refuses a parent session on the admin writes and does not change hashes', async () => {
      const beforeAdmin = adminRow()
      const beforeParent = parentByEmail(nimali.email)
      const parentCookie = await signIn(nimali.email, 'fresh-morning')

      const adminWrite = await patchAdminPassword(parentCookie, 'parent-should-not')
      assert.equal(adminWrite.status, 403)
      const adminBody = (await adminWrite.json()) as { error: { code: string; message: string } }
      assert.equal(adminBody.error.code, 'forbidden')
      assert.match(adminBody.error.message, /[A-Za-z]/)

      const parentWrite = await patchParentPassword(
        parentCookie,
        nimali.email,
        'parent-should-not',
      )
      assert.equal(parentWrite.status, 403)
      const parentBody = (await parentWrite.json()) as { error: { code: string; message: string } }
      assert.equal(parentBody.error.code, 'forbidden')
      assert.match(parentBody.error.message, /[A-Za-z]/)

      const lookup = await findParent(parentCookie, nimali.email)
      assert.equal(lookup.status, 403)

      assert.deepEqual(adminRow(), beforeAdmin)
      assert.deepEqual(parentByEmail(nimali.email), beforeParent)
    })

    it('rejects anonymous and stale cookies without writing a hash', async () => {
      const beforeAdmin = adminRow()
      const beforeParent = parentByEmail(nimali.email)

      const missingAdmin = await fetch(`${adminPasswordBaseUrl}/api/admin/me`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'should-not-apply' }),
      })
      assert.equal(missingAdmin.status, 401)
      const missingAdminBody = (await missingAdmin.json()) as { error: { code: string } }
      assert.equal(missingAdminBody.error.code, 'unauthenticated')
      assert.equal(sidCookie(missingAdmin.headers), undefined)

      const missingParent = await patchParentPassword('', nimali.email, 'should-not-apply')
      assert.equal(missingParent.status, 401)
      const missingParentBody = (await missingParent.json()) as { error: { code: string } }
      assert.equal(missingParentBody.error.code, 'unauthenticated')

      const missingFind = await findParent('', nimali.email)
      assert.equal(missingFind.status, 401)
      const missingFindBody = (await missingFind.json()) as { error: { code: string } }
      assert.equal(missingFindBody.error.code, 'unauthenticated')
      assert.equal(sidCookie(missingFind.headers), undefined)

      const cookie = await signIn('owner@example.com', 'owner-evening')
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

      const staleAdmin = await patchAdminPassword(cookie, 'stale-should-not')
      assert.equal(staleAdmin.status, 401)
      const staleAdminBody = (await staleAdmin.json()) as { error: { code: string } }
      assert.equal(staleAdminBody.error.code, 'unauthenticated')
      const clearedAdmin = sidCookie(staleAdmin.headers)
      assert.ok(clearedAdmin, 'a stale session must clear the cookie')
      assert.match(clearedAdmin, /Max-Age=0/)

      const fresh = await signIn('owner@example.com', 'owner-evening')
      const freshId = fresh.slice('booklist.sid='.length).split('.')[0]
      assert.ok(freshId)
      const writer2 = new Database(dbPath)
      try {
        writer2
          .prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
          .run(new Date(Date.now() - 60_000).toISOString(), freshId)
      } finally {
        writer2.close()
      }

      const staleParent = await patchParentPassword(fresh, nimali.email, 'stale-should-not')
      assert.equal(staleParent.status, 401)
      const staleParentBody = (await staleParent.json()) as { error: { code: string } }
      assert.equal(staleParentBody.error.code, 'unauthenticated')
      const clearedParent = sidCookie(staleParent.headers)
      assert.ok(clearedParent, 'a stale session must clear the cookie')
      assert.match(clearedParent, /Max-Age=0/)

      const findCookie = await signIn('owner@example.com', 'owner-evening')
      const findId = findCookie.slice('booklist.sid='.length).split('.')[0]
      assert.ok(findId)
      const writer3 = new Database(dbPath)
      try {
        writer3
          .prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
          .run(new Date(Date.now() - 60_000).toISOString(), findId)
      } finally {
        writer3.close()
      }

      const staleFind = await findParent(findCookie, nimali.email)
      assert.equal(staleFind.status, 401)
      const staleFindBody = (await staleFind.json()) as { error: { code: string } }
      assert.equal(staleFindBody.error.code, 'unauthenticated')
      const clearedFind = sidCookie(staleFind.headers)
      assert.ok(clearedFind, 'a stale session must clear the cookie')
      assert.match(clearedFind, /Max-Age=0/)

      assert.deepEqual(adminRow(), beforeAdmin)
      assert.deepEqual(parentByEmail(nimali.email), beforeParent)
    })

    it('maps Settings and Parents request keys', () => {
      const settings = settingsPasswordBody('owner-evening')
      assert.deepEqual(settings, { password: 'owner-evening' })
      assert.deepEqual(Object.keys(settings), ['password'])

      const query = parentsFindQuery('nimali.reset@example.com')
      assert.equal(query, 'email=nimali.reset%40example.com')
      assert.match(query, /^email=/)

      const patch = parentsPasswordBody('nimali.reset@example.com', 'fresh-morning')
      assert.deepEqual(patch, { email: 'nimali.reset@example.com', password: 'fresh-morning' })
      assert.deepEqual(Object.keys(patch), ['email', 'password'])
    })

    it('keeps Settings as one password field and Parents as find-by-email, with no extra recovery UI', async () => {
      const settingsPage = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'SettingsPage.tsx'),
        'utf8',
      )
      const parentsPage = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'ParentsPage.tsx'),
        'utf8',
      )
      const adminApp = await readFile(adminAppPath, 'utf8')
      const shell = await readFile(path.join(repoRoot, 'client', 'admin', 'src', 'Shell.tsx'), 'utf8')
      const http = await readFile(path.join(serverRoot, 'identity', 'http.ts'), 'utf8')
      const parentsSource = await readFile(path.join(serverRoot, 'identity', 'parents.ts'), 'utf8')

      assert.match(adminApp, /import \{ SettingsPage \} from '\.\/SettingsPage'/)
      assert.match(adminApp, /import \{ ParentsPage \} from '\.\/ParentsPage'/)
      assert.match(adminApp, /path="settings" element=\{<SettingsPage \/>\}/)
      assert.match(adminApp, /path="parents" element=\{<ParentsPage \/>\}/)
      assert.match(adminApp, /path="schools" element=\{<SchoolsPage \/>\}/)
      assert.match(adminApp, /path="grades" element=\{<GradesPage \/>\}/)
      assert.match(adminApp, /path="export" element=\{<Page title="Export" \/>\}/)

      assert.match(shell, /label: 'Parents'/)
      assert.match(shell, /label: 'Settings'/)
      assert.match(shell, /label: 'Book master'/)
      assert.match(shell, /className="admin-sidebar-export"/)
      assert.match(shell, /to="\/export"/)

      assert.match(settingsPage, /label[\s\S]*New password/)
      assert.match(settingsPage, /id="admin-settings-password"/)
      assert.match(settingsPage, /button-primary/)
      assert.match(settingsPage, />\s*Save\s*</)
      assert.equal((settingsPage.match(/button-primary/g) ?? []).length, 1)
      assert.match(settingsPage, /method: 'PATCH'/)
      assert.match(settingsPage, /'\/api\/admin\/me'/)
      assert.match(settingsPage, /settingsPasswordBody/)
      assert.match(settingsPage, /body\?\.error\?\.field === 'password'/)
      assert.doesNotMatch(settingsPage, /field === 'password' \|\|/)

      assert.match(parentsPage, /id="admin-parents-email"/)
      assert.match(parentsPage, /id="admin-parents-found-email"/)
      assert.match(parentsPage, /id="admin-parents-password"/)
      assert.match(parentsPage, /New password/)
      assert.match(parentsPage, /parent's email/)
      assert.match(parentsPage, /parentsFindQuery/)
      assert.match(parentsPage, /parentsPasswordBody/)
      assert.match(parentsPage, /readOnly/)
      assert.match(parentsPage, /id="admin-parents-password"[\s\S]*autoComplete="off"/)
      assert.match(parentsPage, /'\/api\/admin\/parents'/)
      assert.match(parentsPage, /method: 'PATCH'/)
      assert.match(parentsPage, />\s*Find\s*</)
      assert.match(parentsPage, />\s*Save\s*</)

      const banned = /\brecovery\b|\bforgot\b|reset password|single-use/i
      assert.doesNotMatch(settingsPage, banned)
      assert.doesNotMatch(parentsPage, banned)
      assert.doesNotMatch(shell, banned)
      assert.doesNotMatch(adminApp, banned)

      const meRoute = http.match(/router\.patch\(\s*'\/admin\/me'[\s\S]*?router\.get\(/)?.[0]
      const parentPatch = http.match(/router\.patch\(\s*'\/admin\/parents'[\s\S]*?return router/)?.[0]
      assert.ok(meRoute, 'PATCH /admin/me must exist')
      assert.ok(parentPatch, 'PATCH /admin/parents must exist')
      assert.match(meRoute, /lookupSession/)
      assert.match(parentPatch, /lookupSession/)
      assert.match(meRoute, /refuseIfNotAdmin/)
      assert.match(parentPatch, /refuseIfNotAdmin/)
      assert.match(http, /role !== 'admin'/)
      assert.match(parentPatch, /setParentPassword/)
      assert.doesNotMatch(meRoute, /DELETE FROM sessions/)
      assert.doesNotMatch(parentPatch, /DELETE FROM sessions/)
      assert.doesNotMatch(parentPatch, /UPDATE parents SET/)
      assert.match(http, /db\.prepare\('DELETE FROM sessions WHERE admin_id = \?'\)/)

      const setStart = parentsSource.indexOf('export async function setParentPassword')
      assert.ok(setStart >= 0)
      const hashAt = parentsSource.indexOf('await hashSecret(password)', setStart)
      const updateAt = parentsSource.indexOf('UPDATE parents SET password_hash', setStart)
      assert.ok(hashAt >= 0 && updateAt >= 0 && hashAt < updateAt, 'hash the password before any SQL write')
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
          assert.equal(applied.n, 6)
          const parents = upgraded
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'parents'")
            .get()
          assert.ok(parents)
          const schools = upgraded
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schools'")
            .get()
          assert.ok(schools)
          const grades = upgraded
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'grades'")
            .get()
          assert.ok(grades)
          const books = upgraded
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'books'")
            .get()
          assert.ok(books)
          const packs = upgraded
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'packs'")
            .get()
          assert.ok(packs)

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
        ...(await walkFiles(path.join(serverRoot, 'catalog'))),
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

  describe('Schools and grades', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let parentCookie: string

    const parentReg = {
      name: 'Nimali Perera',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '0771234567',
      email: 'nimali.catalog@example.com',
      password: 'evening-order',
    }

    const resources = [
      {
        path: 'schools' as const,
        singular: 'school',
        table: 'schools',
        packColumn: 'school_id' as const,
        sample: 'Mahinda College',
        renamed: 'Mahinda College — Galle',
      },
      {
        path: 'grades' as const,
        singular: 'grade',
        table: 'grades',
        packColumn: 'grade_id' as const,
        sample: 'Year 6 English',
        renamed: 'Grade 6 — English',
      },
    ]

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${catalogBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    function collectionUrl(resourcePath: string): string {
      return `${catalogBaseUrl}/api/admin/${resourcePath}`
    }

    function itemUrl(resourcePath: string, id: number | string): string {
      return `${collectionUrl(resourcePath)}/${id}`
    }

    function namedCount(table: string): number {
      const db = new Database(dbPath, { readonly: true })
      try {
        return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
      } finally {
        db.close()
      }
    }

    function namedRow(table: string, id: number): { id: number; name: string; archived_at: string | null } | undefined {
      const db = new Database(dbPath, { readonly: true })
      try {
        return db
          .prepare(`SELECT id, name, archived_at FROM ${table} WHERE id = ?`)
          .get(id) as { id: number; name: string; archived_at: string | null } | undefined
      } finally {
        db.close()
      }
    }

    type NamedJson = { id: number; name: string; archivedAt: string | null }

    async function createNamed(
      cookie: string,
      resourcePath: string,
      name: string,
    ): Promise<NamedJson> {
      const response = await fetch(collectionUrl(resourcePath), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(catalogNameBody(name)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as NamedJson
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-catalog-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, CATALOG_PORT)
      child = started.child
      const registered = await fetch(`${catalogBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parentReg),
      })
      assert.equal(registered.status, 201)
      const cookie = sidCookie(registered.headers)
      assert.ok(cookie)
      parentCookie = cookieHeader(cookie)
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    for (const resource of resources) {
      describe(resource.path, { concurrency: 1 }, () => {
        it('lists an empty array for an admin with no rows', async () => {
          const cookie = await signInAdmin()
          const response = await fetch(collectionUrl(resource.path), { headers: { cookie } })
          assert.equal(response.status, 200)
          assert.equal(response.headers.get('cache-control'), 'no-store')
          const body = (await response.json()) as unknown
          assert.deepEqual(body, [])
          assert.equal(namedCount(resource.table), 0)
        })

        it('creates a named row in catalog', async () => {
          const cookie = await signInAdmin()
          const response = await fetch(collectionUrl(resource.path), {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie },
            body: JSON.stringify(catalogNameBody(`  ${resource.sample}  `)),
          })
          assert.equal(response.status, 201)
          const body = (await response.json()) as NamedJson
          assert.equal(typeof body.id, 'number')
          assert.equal(body.name, resource.sample)
          assert.equal(body.archivedAt, null)
          const row = namedRow(resource.table, body.id)
          assert.ok(row)
          assert.equal(row.name, resource.sample)
          assert.equal(row.archived_at, null)

          const listed = await fetch(collectionUrl(resource.path), { headers: { cookie } })
          assert.equal(listed.status, 200)
          const list = (await listed.json()) as NamedJson[]
          const found = list.find((item) => item.id === body.id)
          assert.ok(found)
          assert.equal(found.id, body.id)
          assert.equal(found.name, resource.sample)
          assert.equal(found.archivedAt, null)
        })

        it('renames an existing row and keeps the id', async () => {
          const cookie = await signInAdmin()
          const created = await createNamed(cookie, resource.path, `${resource.sample} rename`)
          const response = await fetch(itemUrl(resource.path, created.id), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', cookie },
            body: JSON.stringify(catalogNameBody(resource.renamed)),
          })
          assert.equal(response.status, 200)
          const body = (await response.json()) as NamedJson
          assert.equal(body.id, created.id)
          assert.equal(body.name, resource.renamed)
          assert.equal(body.archivedAt, null)
          const row = namedRow(resource.table, created.id)
          assert.ok(row)
          assert.equal(row.name, resource.renamed)
        })

        it('archives a row, keeps it, and omits it from live rows', async () => {
          const cookie = await signInAdmin()
          const created = await createNamed(cookie, resource.path, `${resource.sample} archive`)
          const response = await fetch(`${itemUrl(resource.path, created.id)}/archive`, {
            method: 'POST',
            headers: { cookie },
          })
          assert.equal(response.status, 200)
          const body = (await response.json()) as NamedJson
          assert.equal(body.id, created.id)
          assert.equal(body.name, created.name)
          assert.equal(typeof body.archivedAt, 'string')
          assert.ok(body.archivedAt)

          const row = namedRow(resource.table, created.id)
          assert.ok(row)
          assert.equal(row.name, created.name)
          assert.equal(typeof row.archived_at, 'string')
          assert.ok(row.archived_at)

          const listed = await fetch(collectionUrl(resource.path), { headers: { cookie } })
          assert.equal(listed.status, 200)
          const list = (await listed.json()) as NamedJson[]
          const archived = list.find((item) => item.id === created.id)
          assert.ok(archived)
          assert.ok(archived.archivedAt)
          const live = list.filter((item) => item.archivedAt === null)
          assert.equal(
            live.find((item) => item.id === created.id),
            undefined,
          )
        })

        it('refuses an empty, whitespace, or non-string name without writing', async () => {
          const cookie = await signInAdmin()
          const created = await createNamed(cookie, resource.path, `${resource.sample} keep`)
          const before = namedCount(resource.table)
          const beforeRow = namedRow(resource.table, created.id)
          const cases: unknown[] = ['', '   ', 12, null, { text: 'nope' }]

          for (const name of cases) {
            const createBad = await fetch(collectionUrl(resource.path), {
              method: 'POST',
              headers: { 'content-type': 'application/json', cookie },
              body: JSON.stringify({ name }),
            })
            assert.equal(createBad.status, 400, `create expected 400 for ${JSON.stringify(name)}`)
            const createBody = (await createBad.json()) as {
              error: { code: string; message: string; field?: string }
            }
            assert.equal(createBody.error.code, 'invalid_input')
            assert.equal(createBody.error.field, 'name')
            assert.match(createBody.error.message, /name/i)

            const renameBad = await fetch(itemUrl(resource.path, created.id), {
              method: 'PATCH',
              headers: { 'content-type': 'application/json', cookie },
              body: JSON.stringify({ name }),
            })
            assert.equal(renameBad.status, 400, `rename expected 400 for ${JSON.stringify(name)}`)
            const renameBody = (await renameBad.json()) as {
              error: { code: string; message: string; field?: string }
            }
            assert.equal(renameBody.error.code, 'invalid_input')
            assert.equal(renameBody.error.field, 'name')
          }

          assert.equal(namedCount(resource.table), before)
          assert.deepEqual(namedRow(resource.table, created.id), beforeRow)
        })

        it('refuses an unknown id without writing', async () => {
          const cookie = await signInAdmin()
          const before = namedCount(resource.table)
          const missing = 99999

          const rename = await fetch(itemUrl(resource.path, missing), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', cookie },
            body: JSON.stringify(catalogNameBody(resource.renamed)),
          })
          assert.equal(rename.status, 404)
          const renameBody = (await rename.json()) as { error: { code: string; message: string } }
          assert.equal(typeof renameBody.error.code, 'string')
          assert.ok(renameBody.error.code.length > 0)
          assert.match(renameBody.error.message, /[A-Za-z]/)

          const archive = await fetch(`${itemUrl(resource.path, missing)}/archive`, {
            method: 'POST',
            headers: { cookie },
          })
          assert.equal(archive.status, 404)
          const archiveBody = (await archive.json()) as { error: { code: string; message: string } }
          assert.equal(typeof archiveBody.error.code, 'string')
          assert.match(archiveBody.error.message, /[A-Za-z]/)

          const hardDelete = await fetch(itemUrl(resource.path, missing), {
            method: 'DELETE',
            headers: { cookie },
          })
          assert.equal(hardDelete.status, 404)
          const deleteBody = (await hardDelete.json()) as { error: { code: string; message: string } }
          assert.equal(typeof deleteBody.error.code, 'string')
          assert.match(deleteBody.error.message, /[A-Za-z]/)

          assert.equal(namedCount(resource.table), before)
        })

        it('refuses DELETE while a live pack would reference the row', async () => {
          const cookie = await signInAdmin()
          const created = await createNamed(cookie, resource.path, `${resource.sample} in use`)
          const counterpart =
            resource.path === 'schools'
              ? await createNamed(cookie, 'grades', `${resource.sample} pack counterpart`)
              : await createNamed(cookie, 'schools', `${resource.sample} pack counterpart`)
          const schoolId = resource.packColumn === 'school_id' ? created.id : counterpart.id
          const gradeId = resource.packColumn === 'grade_id' ? created.id : counterpart.id
          const writer = new Database(dbPath)
          let packId = 0
          try {
            const inserted = writer
              .prepare(
                `INSERT INTO packs (name, school_id, grade_id, description, archived_at, created_at)
                 VALUES (?, ?, ?, ?, NULL, ?)`,
              )
              .run(
                `${resource.sample} live pack`,
                schoolId,
                gradeId,
                'Live pack for in_use',
                new Date().toISOString(),
              )
            packId = Number(inserted.lastInsertRowid)
          } finally {
            writer.close()
          }

          const response = await fetch(itemUrl(resource.path, created.id), {
            method: 'DELETE',
            headers: { cookie },
          })
          assert.equal(response.status, 409)
          const body = (await response.json()) as { error: { code: string; message: string } }
          assert.equal(body.error.code, 'in_use')
          assert.equal(typeof body.error.message, 'string')
          assert.match(body.error.message, /[A-Za-z]/)
          assert.ok(namedRow(resource.table, created.id))

          const cleanup = new Database(dbPath)
          try {
            cleanup.prepare('DELETE FROM packs WHERE id = ?').run(packId)
          } finally {
            cleanup.close()
          }
          const counterpartPath = resource.path === 'schools' ? 'grades' : 'schools'
          const removed = await fetch(itemUrl(counterpartPath, counterpart.id), {
            method: 'DELETE',
            headers: { cookie },
          })
          assert.equal(removed.status, 204)
        })

        it('refuses parent and anonymous writes', async () => {
          const adminCookie = await signInAdmin()
          const created = await createNamed(adminCookie, resource.path, `${resource.sample} gated`)
          const before = namedCount(resource.table)
          const beforeRow = namedRow(resource.table, created.id)

          const parentWrites: Array<() => Promise<Response>> = [
            () =>
              fetch(collectionUrl(resource.path), {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie: parentCookie },
                body: JSON.stringify(catalogNameBody('Parent should not')),
              }),
            () =>
              fetch(itemUrl(resource.path, created.id), {
                method: 'PATCH',
                headers: { 'content-type': 'application/json', cookie: parentCookie },
                body: JSON.stringify(catalogNameBody('Parent should not')),
              }),
            () =>
              fetch(`${itemUrl(resource.path, created.id)}/archive`, {
                method: 'POST',
                headers: { cookie: parentCookie },
              }),
            () =>
              fetch(itemUrl(resource.path, created.id), {
                method: 'DELETE',
                headers: { cookie: parentCookie },
              }),
          ]
          const anonymousWrites: Array<() => Promise<Response>> = [
            () =>
              fetch(collectionUrl(resource.path), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(catalogNameBody('Anonymous should not')),
              }),
            () =>
              fetch(itemUrl(resource.path, created.id), {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(catalogNameBody('Anonymous should not')),
              }),
            () =>
              fetch(`${itemUrl(resource.path, created.id)}/archive`, { method: 'POST' }),
            () => fetch(itemUrl(resource.path, created.id), { method: 'DELETE' }),
          ]

          for (const write of parentWrites) {
            const response = await write()
            assert.equal(response.status, 403)
            const body = (await response.json()) as { error: { code: string; message: string } }
            assert.equal(typeof body.error.code, 'string')
            assert.ok(body.error.code.length > 0)
            assert.match(body.error.message, /[A-Za-z]/)
          }
          for (const write of anonymousWrites) {
            const response = await write()
            assert.equal(response.status, 401)
            const body = (await response.json()) as { error: { code: string; message: string } }
            assert.equal(typeof body.error.code, 'string')
            assert.ok(body.error.code.length > 0)
            assert.match(body.error.message, /[A-Za-z]/)
          }

          assert.equal(namedCount(resource.table), before)
          assert.deepEqual(namedRow(resource.table, created.id), beforeRow)
        })
      })
    }

    it('maps create/rename request keys', async () => {
      const body = catalogNameBody('Mahinda College')
      assert.deepEqual(body, { name: 'Mahinda College' })
      assert.deepEqual(Object.keys(body), ['name'])
      assert.equal(catalogCollectionPath('schools'), '/api/admin/schools')
      assert.equal(catalogCollectionPath('grades'), '/api/admin/grades')
      assert.equal(catalogItemPath('schools', 4), '/api/admin/schools/4')
      assert.equal(catalogItemPath('grades', 4), '/api/admin/grades/4')
      assert.equal(catalogArchivePath('schools', 4), '/api/admin/schools/4/archive')
      assert.equal(catalogArchivePath('grades', 4), '/api/admin/grades/4/archive')

      const catalogPage = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'CatalogNamedPage.tsx'),
        'utf8',
      )
      assert.match(catalogPage, /catalogCollectionPath\(kind\)/)
      assert.match(catalogPage, /catalogItemPath\(kind, draft\.id\)/)
      assert.match(catalogPage, /catalogArchivePath\(kind, item\.id\)/)
    })

    it('keeps empty admin lists on-screen Add school / Add grade, with no image control', async () => {
      const schoolsPage = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'SchoolsPage.tsx'),
        'utf8',
      )
      const gradesPage = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'GradesPage.tsx'),
        'utf8',
      )
      const catalogPage = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'CatalogNamedPage.tsx'),
        'utf8',
      )
      const adminApp = await readFile(adminAppPath, 'utf8')
      const http = await readFile(path.join(serverRoot, 'catalog', 'http.ts'), 'utf8')
      const named = await readFile(path.join(serverRoot, 'catalog', 'named.ts'), 'utf8')
      const api = await readFile(path.join(serverRoot, 'web', 'api.ts'), 'utf8')

      assert.match(adminApp, /import \{ SchoolsPage \} from '\.\/SchoolsPage'/)
      assert.match(adminApp, /import \{ GradesPage \} from '\.\/GradesPage'/)
      assert.match(adminApp, /path="schools" element=\{<SchoolsPage \/>\}/)
      assert.match(adminApp, /path="grades" element=\{<GradesPage \/>\}/)

      assert.match(schoolsPage, /Add school/)
      assert.match(schoolsPage, /There are no schools yet/)
      assert.match(gradesPage, /Add grade/)
      assert.match(gradesPage, /There are no grades yet/)
      assert.match(catalogPage, /empty && !formOpen \? <p className="text-meta">\{emptyCopy\}<\/p>/)
      assert.match(catalogPage, /\{addLabel\}/)
      assert.match(catalogPage, /value=\{name\}/)
      assert.match(catalogPage, /if \(problem\) \{[\s\S]*setError\(problem\)[\s\S]*return/)
      assert.match(catalogPage, /if \(!response\.ok\) \{[\s\S]*return/)
      assert.match(catalogPage, /credentials: 'include'/)
      assert.match(catalogPage, /response\.status === 401/)
      assert.match(catalogPage, /signOut/)
      assert.match(catalogPage, /Archive/)
      assert.match(catalogPage, /Archived/)
      assert.doesNotMatch(catalogPage, /type="file"/)
      assert.doesNotMatch(catalogPage, /<input[^>]*image/i)
      assert.doesNotMatch(catalogPage, /<select/)
      assert.doesNotMatch(gradesPage, /<select/)
      assert.doesNotMatch(catalogPage, /Grade 13/)
      assert.doesNotMatch(catalogPage, /method: 'DELETE'/)

      assert.match(http, /lookupSession/)
      assert.match(http, /rejectUnauthorized/)
      assert.match(http, /role !== 'admin'/)
      assert.doesNotMatch(http, /refuseIfNotAdmin/)
      assert.doesNotMatch(http, /db\.prepare/)
      assert.doesNotMatch(http, /INSERT INTO|UPDATE |DELETE FROM/)
      assert.match(named, /livePackReferenceCount/)
      assert.match(named, /sqlite_master/)
      assert.match(
        api,
        /createIdentityRouter\(db, env\)\)\s*router\.use\(createCatalogRouter\(db, env\)\)/,
      )
    })
  })

  describe('Book master', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let parentCookie: string

    const parentReg = {
      name: 'Nimali Perera',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '0771234567',
      email: 'nimali.books@example.com',
      password: 'evening-order',
    }

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${booksBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    function collectionUrl(): string {
      return `${booksBaseUrl}/api/admin/books`
    }

    function itemUrl(id: number | string): string {
      return `${collectionUrl()}/${id}`
    }

    function bookCount(): number {
      const db = new Database(dbPath, { readonly: true })
      try {
        return (db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n
      } finally {
        db.close()
      }
    }

    function bookRow(id: number):
      | { id: number; title: string; price: number; archived_at: string | null }
      | undefined {
      const db = new Database(dbPath, { readonly: true })
      try {
        return db
          .prepare('SELECT id, title, price, archived_at FROM books WHERE id = ?')
          .get(id) as
          | { id: number; title: string; price: number; archived_at: string | null }
          | undefined
      } finally {
        db.close()
      }
    }

    type BookJson = { id: number; title: string; price: number; archivedAt: string | null }

    async function createBookRow(cookie: string, title: string, price: number): Promise<BookJson> {
      const response = await fetch(collectionUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(bookBody(title, price)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as BookJson
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-books-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, BOOKS_PORT)
      child = started.child
      const registered = await fetch(`${booksBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parentReg),
      })
      assert.equal(registered.status, 201)
      const cookie = sidCookie(registered.headers)
      assert.ok(cookie)
      parentCookie = cookieHeader(cookie)
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('lists an empty array for an admin with no rows', async () => {
      const cookie = await signInAdmin()
      const response = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as unknown
      assert.deepEqual(body, [])
      assert.equal(bookCount(), 0)
    })

    it('creates a book with an integer rupee price', async () => {
      const cookie = await signInAdmin()
      const response = await fetch(collectionUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(bookBody('  Mathematics Grade 6 (2026)  ', 9320)),
      })
      assert.equal(response.status, 201)
      const raw = await response.text()
      assert.match(raw, /"price":9320/)
      assert.doesNotMatch(raw, /"price":"9320"/)
      assert.doesNotMatch(raw, /"price":9320\.0/)
      const body = JSON.parse(raw) as BookJson
      assert.equal(typeof body.id, 'number')
      assert.equal(body.title, 'Mathematics Grade 6 (2026)')
      assert.equal(body.price, 9320)
      assert.equal(typeof body.price, 'number')
      assert.equal(Number.isInteger(body.price), true)
      assert.equal(body.archivedAt, null)
      const row = bookRow(body.id)
      assert.ok(row)
      assert.equal(row.title, 'Mathematics Grade 6 (2026)')
      assert.equal(row.price, 9320)
      assert.equal(row.archived_at, null)
      assert.equal(formatRupees(body.price), 'Rs. 9,320')
    })

    it('edits title and price together and later GET shows only the new values', async () => {
      const cookie = await signInAdmin()
      const created = await createBookRow(cookie, 'Science Grade 6 (2025)', 450)
      const response = await fetch(itemUrl(created.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(bookBody('Science Grade 6 (2026)', 9320)),
      })
      assert.equal(response.status, 200)
      const body = (await response.json()) as BookJson
      assert.equal(body.id, created.id)
      assert.equal(body.title, 'Science Grade 6 (2026)')
      assert.equal(body.price, 9320)
      assert.equal(Number.isInteger(body.price), true)
      assert.equal(body.archivedAt, null)

      const listed = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(listed.status, 200)
      const list = (await listed.json()) as BookJson[]
      const found = list.find((item) => item.id === created.id)
      assert.ok(found)
      assert.equal(found.title, 'Science Grade 6 (2026)')
      assert.equal(found.price, 9320)
      assert.equal(found.archivedAt, null)
      const row = bookRow(created.id)
      assert.ok(row)
      assert.equal(row.title, 'Science Grade 6 (2026)')
      assert.equal(row.price, 9320)
    })

    it('archives a book, keeps it on the admin list, and stamps archivedAt', async () => {
      const cookie = await signInAdmin()
      const created = await createBookRow(cookie, 'English Grade 6 (2026)', 2100)
      const response = await fetch(`${itemUrl(created.id)}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(response.status, 200)
      const body = (await response.json()) as BookJson
      assert.equal(body.id, created.id)
      assert.equal(body.title, created.title)
      assert.equal(body.price, created.price)
      assert.equal(typeof body.archivedAt, 'string')
      assert.ok(body.archivedAt)

      const row = bookRow(created.id)
      assert.ok(row)
      assert.equal(typeof row.archived_at, 'string')
      assert.ok(row.archived_at)

      const listed = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(listed.status, 200)
      const list = (await listed.json()) as BookJson[]
      const archived = list.find((item) => item.id === created.id)
      assert.ok(archived)
      assert.ok(archived.archivedAt)
    })

    it('refuses an empty title, float, string, or zero price without writing', async () => {
      const cookie = await signInAdmin()
      const created = await createBookRow(cookie, 'Keep this title', 1200)
      const before = bookCount()
      const beforeRow = bookRow(created.id)

      const titleCases: unknown[] = ['', '   ', 12, null]
      for (const title of titleCases) {
        const createBad = await fetch(collectionUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ title, price: 9320 }),
        })
        assert.equal(createBad.status, 400, `create expected 400 for title ${JSON.stringify(title)}`)
        const createBody = (await createBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(createBody.error.code, 'invalid_input')
        assert.equal(createBody.error.field, 'title')
        assert.match(createBody.error.message, /title/i)

        const patchBad = await fetch(itemUrl(created.id), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ title, price: 9320 }),
        })
        assert.equal(patchBad.status, 400, `patch expected 400 for title ${JSON.stringify(title)}`)
        const patchBody = (await patchBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(patchBody.error.code, 'invalid_input')
        assert.equal(patchBody.error.field, 'title')
      }

      const priceCases: unknown[] = [0, 9320.5, '9320', '9,320', null]
      for (const price of priceCases) {
        const createBad = await fetch(collectionUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ title: 'A valid title', price }),
        })
        assert.equal(createBad.status, 400, `create expected 400 for price ${JSON.stringify(price)}`)
        const createBody = (await createBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(createBody.error.code, 'invalid_input')
        assert.equal(createBody.error.field, 'price')

        const patchBad = await fetch(itemUrl(created.id), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ title: 'A valid title', price }),
        })
        assert.equal(patchBad.status, 400, `patch expected 400 for price ${JSON.stringify(price)}`)
        const patchBody = (await patchBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(patchBody.error.code, 'invalid_input')
        assert.equal(patchBody.error.field, 'price')
      }

      assert.equal(bookCount(), before)
      assert.deepEqual(bookRow(created.id), beforeRow)
    })

    it('refuses anonymous callers with unauthenticated', async () => {
      const adminCookie = await signInAdmin()
      const created = await createBookRow(adminCookie, 'Anonymous gated', 700)
      const before = bookCount()
      const beforeRow = bookRow(created.id)

      const anonymousCalls: Array<() => Promise<Response>> = [
        () =>
          fetch(collectionUrl(), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(bookBody('Anonymous should not', 9320)),
          }),
        () => fetch(collectionUrl()),
        () =>
          fetch(itemUrl(created.id), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(bookBody('Anonymous should not', 100)),
          }),
        () => fetch(`${itemUrl(created.id)}/archive`, { method: 'POST' }),
        () => fetch(itemUrl(created.id), { method: 'DELETE' }),
      ]
      for (const call of anonymousCalls) {
        const response = await call()
        assert.equal(response.status, 401)
        const body = (await response.json()) as { error: { code: string; message: string } }
        assert.equal(body.error.code, 'unauthenticated')
        assert.match(body.error.message, /[A-Za-z]/)
      }

      assert.equal(bookCount(), before)
      assert.deepEqual(bookRow(created.id), beforeRow)
    })

    it('refuses parent GET and writes with a books-specific 403', async () => {
      const adminCookie = await signInAdmin()
      const created = await createBookRow(adminCookie, 'Gated book', 800)
      const before = bookCount()
      const beforeRow = bookRow(created.id)

      const parentGet = await fetch(collectionUrl(), { headers: { cookie: parentCookie } })
      assert.equal(parentGet.status, 403)
      const getBody = (await parentGet.json()) as { error: { code: string; message: string } }
      assert.equal(getBody.error.code, 'forbidden')
      assert.match(getBody.error.message, /book/i)
      assert.doesNotMatch(getBody.error.message, /school and grade/i)

      const parentWrites: Array<() => Promise<Response>> = [
        () =>
          fetch(collectionUrl(), {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: parentCookie },
            body: JSON.stringify(bookBody('Parent should not', 9320)),
          }),
        () =>
          fetch(itemUrl(created.id), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', cookie: parentCookie },
            body: JSON.stringify(bookBody('Parent should not', 100)),
          }),
        () =>
          fetch(`${itemUrl(created.id)}/archive`, {
            method: 'POST',
            headers: { cookie: parentCookie },
          }),
        () =>
          fetch(itemUrl(created.id), {
            method: 'DELETE',
            headers: { cookie: parentCookie },
          }),
      ]
      for (const write of parentWrites) {
        const response = await write()
        assert.equal(response.status, 403)
        const body = (await response.json()) as { error: { code: string; message: string } }
        assert.equal(body.error.code, 'forbidden')
        assert.match(body.error.message, /book/i)
        assert.doesNotMatch(body.error.message, /school and grade/i)
      }

      assert.equal(bookCount(), before)
      assert.deepEqual(bookRow(created.id), beforeRow)
    })

    it('refuses an unknown id without writing', async () => {
      const cookie = await signInAdmin()
      const before = bookCount()
      const missing = 99999

      const edit = await fetch(itemUrl(missing), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(bookBody('Missing book', 9320)),
      })
      assert.equal(edit.status, 404)
      const editBody = (await edit.json()) as { error: { code: string; message: string } }
      assert.equal(editBody.error.code, 'not_found')
      assert.match(editBody.error.message, /[A-Za-z]/)

      const archive = await fetch(`${itemUrl(missing)}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(archive.status, 404)
      const archiveBody = (await archive.json()) as { error: { code: string; message: string } }
      assert.equal(archiveBody.error.code, 'not_found')
      assert.match(archiveBody.error.message, /[A-Za-z]/)

      const hardDelete = await fetch(itemUrl(missing), {
        method: 'DELETE',
        headers: { cookie },
      })
      assert.equal(hardDelete.status, 404)
      const deleteBody = (await hardDelete.json()) as { error: { code: string; message: string } }
      assert.equal(deleteBody.error.code, 'not_found')
      assert.match(deleteBody.error.message, /[A-Za-z]/)

      assert.equal(bookCount(), before)
    })

    it('deletes a book that no live pack references', async () => {
      const cookie = await signInAdmin()
      const created = await createBookRow(cookie, 'Disposable book', 300)
      const response = await fetch(itemUrl(created.id), {
        method: 'DELETE',
        headers: { cookie },
      })
      assert.equal(response.status, 204)
      assert.equal(bookRow(created.id), undefined)
    })

    it('refuses DELETE while a live pack would reference the book', async () => {
      const cookie = await signInAdmin()
      const created = await createBookRow(cookie, 'In use book', 500)
      const schoolResponse = await fetch(`${booksBaseUrl}/api/admin/schools`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(catalogNameBody('In-use school')),
      })
      assert.equal(schoolResponse.status, 201)
      const school = (await schoolResponse.json()) as { id: number }
      const gradeResponse = await fetch(`${booksBaseUrl}/api/admin/grades`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(catalogNameBody('In-use grade')),
      })
      assert.equal(gradeResponse.status, 201)
      const grade = (await gradeResponse.json()) as { id: number }
      const packResponse = await fetch(`${booksBaseUrl}/api/admin/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(
          packCreateBody('In-use pack', school.id, grade.id, 'Live pack for in_use', [created.id]),
        ),
      })
      assert.equal(packResponse.status, 201)

      const response = await fetch(itemUrl(created.id), {
        method: 'DELETE',
        headers: { cookie },
      })
      assert.equal(response.status, 409)
      const body = (await response.json()) as { error: { code: string; message: string } }
      assert.equal(body.error.code, 'in_use')
      assert.match(body.error.message, /[A-Za-z]/)
      assert.ok(bookRow(created.id))
    })

    it('maps book request keys and keeps empty Add book, with filled Rs. prefix and no images', async () => {
      const body = bookBody('Mathematics Grade 6 (2026)', 9320)
      assert.deepEqual(body, { title: 'Mathematics Grade 6 (2026)', price: 9320 })
      assert.deepEqual(Object.keys(body), ['title', 'price'])
      assert.equal(booksCollectionPath(), '/api/admin/books')
      assert.equal(booksItemPath(4), '/api/admin/books/4')
      assert.equal(booksArchivePath(4), '/api/admin/books/4/archive')
      assert.equal(formatRupees(9320), 'Rs. 9,320')

      const booksPage = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'BooksPage.tsx'),
        'utf8',
      )
      const booksHelpers = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'books.ts'),
        'utf8',
      )
      const named = await readFile(path.join(serverRoot, 'catalog', 'named.ts'), 'utf8')
      const http = await readFile(path.join(serverRoot, 'catalog', 'http.ts'), 'utf8')
      const adminApp = await readFile(adminAppPath, 'utf8')
      const baseCss = await readFile(baseCssPath, 'utf8')
      const api = await readFile(path.join(serverRoot, 'web', 'api.ts'), 'utf8')

      assert.match(adminApp, /import \{ BooksPage \} from '\.\/BooksPage'/)
      assert.match(adminApp, /path="books" element=\{<BooksPage \/>\}/)
      assert.match(booksPage, /Add book/)
      assert.match(booksPage, /There are no books yet/)
      assert.match(booksPage, /formatRupees\(item\.price\)/)
      assert.match(booksPage, /form-field-money-prefix/)
      assert.match(booksPage, />[\s\S]*Rs\.[\s\S]*<\//)
      assert.match(booksPage, /value=\{title\}/)
      assert.match(booksPage, /value=\{price\}/)
      assert.match(booksPage, /if \(titleIssue \|\| priceIssue\) \{[\s\S]*setError\(titleIssue \|\| priceIssue\)[\s\S]*return/)
      assert.match(booksPage, /if \(!response\.ok\) \{[\s\S]*return/)
      assert.match(booksPage, /credentials: 'include'/)
      assert.match(booksPage, /response\.status === 401/)
      assert.match(booksPage, /Archive/)
      assert.match(booksPage, /Archived/)
      assert.match(booksPage, /bookBody\(title, Number\(price\.trim\(\)\)\)/)
      assert.doesNotMatch(booksPage, /type="file"/)
      assert.doesNotMatch(booksPage, /<input[^>]*image/i)
      assert.doesNotMatch(booksPage, /method: 'DELETE'/)
      assert.doesNotMatch(booksPage, /edition/)
      assert.doesNotMatch(booksHelpers, /NamedKind/)
      assert.doesNotMatch(named, /'book'/)
      assert.match(http, /lookupSession/)
      assert.match(http, /rejectUnauthorized/)
      assert.match(http, /BOOKS_FORBIDDEN_MESSAGE/)
      assert.match(http, /role !== 'admin'/)
      assert.doesNotMatch(http, /refuseIfNotAdmin/)
      assert.doesNotMatch(http, /db\.prepare/)
      assert.doesNotMatch(http, /INSERT INTO|UPDATE |DELETE FROM/)
      assert.match(baseCss, /\.form-field-money-prefix/)
      assert.match(baseCss, /--color-surface-sunken/)
      assert.match(
        api,
        /createIdentityRouter\(db, env\)\)\s*router\.use\(createCatalogRouter\(db, env\)\)/,
      )
    })
  })

  describe('Packs from the book master', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let parentCookie: string

    const parentReg = {
      name: 'Nimali Perera',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '0771234567',
      email: 'nimali.packs@example.com',
      password: 'evening-order',
    }

    type NamedJson = { id: number; name: string; archivedAt: string | null }
    type BookJson = { id: number; title: string; price: number; archivedAt: string | null }
    type PackBookJson = { id: number; title: string; price: number; archivedAt: string | null }
    type PackJson = {
      id: number
      name: string
      schoolId: number
      gradeId: number
      description: string
      price: number
      archivedAt: string | null
      books: PackBookJson[]
    }

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${packsBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    function collectionUrl(): string {
      return `${packsBaseUrl}/api/admin/packs`
    }

    function itemUrl(id: number | string): string {
      return `${collectionUrl()}/${id}`
    }

    function withDb<T>(fn: (db: Database.Database) => T): T {
      const db = new Database(dbPath, { readonly: true })
      try {
        return fn(db)
      } finally {
        db.close()
      }
    }

    function packCount(): number {
      return withDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM packs').get() as { n: number }).n)
    }

    function packRow(id: number):
      | {
          id: number
          name: string
          school_id: number
          grade_id: number
          description: string
          archived_at: string | null
        }
      | undefined {
      return withDb(
        (db) =>
          db
            .prepare(
              'SELECT id, name, school_id, grade_id, description, archived_at FROM packs WHERE id = ?',
            )
            .get(id) as
            | {
                id: number
                name: string
                school_id: number
                grade_id: number
                description: string
                archived_at: string | null
              }
            | undefined,
      )
    }

    function packBookIds(id: number): number[] {
      return withDb((db) =>
        (
          db.prepare('SELECT book_id FROM pack_books WHERE pack_id = ? ORDER BY book_id').all(id) as Array<{
            book_id: number
          }>
        ).map((row) => row.book_id),
      )
    }

    function tableExists(name: string): boolean {
      return withDb(
        (db) =>
          Boolean(
            db
              .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
              .get(name),
          ),
      )
    }

    function columnNames(table: string): string[] {
      return withDb((db) =>
        (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
          (row) => row.name,
        ),
      )
    }

    async function createNamed(
      cookie: string,
      resourcePath: 'schools' | 'grades',
      name: string,
    ): Promise<NamedJson> {
      const response = await fetch(`${packsBaseUrl}/api/admin/${resourcePath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(catalogNameBody(name)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as NamedJson
    }

    async function createBookRow(cookie: string, title: string, price: number): Promise<BookJson> {
      const response = await fetch(`${packsBaseUrl}/api/admin/books`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(bookBody(title, price)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as BookJson
    }

    async function createPackRow(
      cookie: string,
      name: string,
      schoolId: number,
      gradeId: number,
      description: string,
      bookIds: number[],
    ): Promise<PackJson> {
      const response = await fetch(collectionUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(packCreateBody(name, schoolId, gradeId, description, bookIds)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as PackJson
    }

    async function seedRefs(cookie: string): Promise<{
      school: NamedJson
      grade: NamedJson
      bookA: BookJson
      bookB: BookJson
    }> {
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const school = await createNamed(cookie, 'schools', `Pack school ${suffix}`)
      const grade = await createNamed(cookie, 'grades', `Pack grade ${suffix}`)
      const bookA = await createBookRow(cookie, `Mathematics ${suffix}`, 5000)
      const bookB = await createBookRow(cookie, `Science ${suffix}`, 4320)
      return { school, grade, bookA, bookB }
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-packs-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, PACKS_PORT)
      child = started.child
      const registered = await fetch(`${packsBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parentReg),
      })
      assert.equal(registered.status, 201)
      const cookie = sidCookie(registered.headers)
      assert.ok(cookie)
      parentCookie = cookieHeader(cookie)
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('lists an empty array for an admin with no rows', async () => {
      const cookie = await signInAdmin()
      const response = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as unknown
      assert.deepEqual(body, [])
      assert.equal(packCount(), 0)
      assert.equal(tableExists('pack_items'), false)
      assert.equal(columnNames('packs').includes('price'), false)
      assert.equal(columnNames('pack_books').includes('price'), false)
    })

    it('creates a pack whose displayed price is the sum of current member prices', async () => {
      const cookie = await signInAdmin()
      const refs = await seedRefs(cookie)
      const response = await fetch(collectionUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(
          packCreateBody(
            '  Year 6 English  ',
            refs.school.id,
            refs.grade.id,
            '  All titles for the year  ',
            [refs.bookA.id, refs.bookB.id],
          ),
        ),
      })
      assert.equal(response.status, 201)
      const raw = await response.text()
      assert.match(raw, /"price":9320/)
      assert.doesNotMatch(raw, /"price":"9320"/)
      assert.doesNotMatch(raw, /"price":9320\.0/)
      const body = JSON.parse(raw) as PackJson
      assert.equal(typeof body.id, 'number')
      assert.equal(body.name, 'Year 6 English')
      assert.equal(body.schoolId, refs.school.id)
      assert.equal(body.gradeId, refs.grade.id)
      assert.equal(body.description, 'All titles for the year')
      assert.equal(body.price, 9320)
      assert.equal(typeof body.price, 'number')
      assert.equal(Number.isInteger(body.price), true)
      assert.equal(body.archivedAt, null)
      assert.equal(body.books.length, 2)
      assert.deepEqual(
        body.books.map((book) => book.id).sort((a, b) => a - b),
        [refs.bookA.id, refs.bookB.id].sort((a, b) => a - b),
      )
      const row = packRow(body.id)
      assert.ok(row)
      assert.equal(row.name, 'Year 6 English')
      assert.equal(row.school_id, refs.school.id)
      assert.equal(row.grade_id, refs.grade.id)
      assert.equal(row.description, 'All titles for the year')
      assert.equal(row.archived_at, null)
      assert.equal('price' in row, false)
      assert.deepEqual(packBookIds(body.id), [refs.bookA.id, refs.bookB.id].sort((a, b) => a - b))
      assert.equal(formatRupees(body.price), 'Rs. 9,320')
      assert.equal(tableExists('pack_items'), false)
    })

    it('recomputes pack price when a member book price changes', async () => {
      const cookie = await signInAdmin()
      const refs = await seedRefs(cookie)
      const created = await createPackRow(
        cookie,
        'Price follows books',
        refs.school.id,
        refs.grade.id,
        'Sum of live members',
        [refs.bookA.id, refs.bookB.id],
      )
      assert.equal(created.price, 9320)
      const patched = await fetch(`${packsBaseUrl}/api/admin/books/${refs.bookB.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(bookBody(refs.bookB.title, 6000)),
      })
      assert.equal(patched.status, 200)
      const listed = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(listed.status, 200)
      const list = (await listed.json()) as PackJson[]
      const found = list.find((item) => item.id === created.id)
      assert.ok(found)
      assert.equal(found.price, 11000)
      assert.equal(Number.isInteger(found.price), true)
      const row = packRow(created.id)
      assert.ok(row)
      assert.equal('price' in row, false)
    })

    it('edits name, description, and membership together and leaves school and grade unchanged', async () => {
      const cookie = await signInAdmin()
      const refs = await seedRefs(cookie)
      const extra = await createBookRow(cookie, `History ${Date.now()}`, 800)
      const created = await createPackRow(
        cookie,
        'Original pack',
        refs.school.id,
        refs.grade.id,
        'Original description',
        [refs.bookA.id, refs.bookB.id],
      )
      const response = await fetch(itemUrl(created.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          ...packPatchBody('Revised pack', 'Revised description', [refs.bookA.id, extra.id]),
          schoolId: refs.school.id + 99,
          gradeId: refs.grade.id + 99,
        }),
      })
      assert.equal(response.status, 200)
      const body = (await response.json()) as PackJson
      assert.equal(body.id, created.id)
      assert.equal(body.name, 'Revised pack')
      assert.equal(body.description, 'Revised description')
      assert.equal(body.schoolId, refs.school.id)
      assert.equal(body.gradeId, refs.grade.id)
      assert.equal(body.price, 5800)
      assert.deepEqual(
        body.books.map((book) => book.id).sort((a, b) => a - b),
        [refs.bookA.id, extra.id].sort((a, b) => a - b),
      )
      const listed = await fetch(collectionUrl(), { headers: { cookie } })
      const list = (await listed.json()) as PackJson[]
      const found = list.find((item) => item.id === created.id)
      assert.ok(found)
      assert.equal(found.price, 5800)
      assert.equal(found.schoolId, refs.school.id)
      assert.equal(found.gradeId, refs.grade.id)
    })

    it('archives a pack, keeps it on the admin list, and stamps archivedAt', async () => {
      const cookie = await signInAdmin()
      const refs = await seedRefs(cookie)
      const created = await createPackRow(
        cookie,
        'Archive me',
        refs.school.id,
        refs.grade.id,
        'Will be archived',
        [refs.bookA.id],
      )
      const response = await fetch(`${itemUrl(created.id)}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(response.status, 200)
      const body = (await response.json()) as PackJson
      assert.equal(body.id, created.id)
      assert.equal(typeof body.archivedAt, 'string')
      assert.ok(body.archivedAt)
      const row = packRow(created.id)
      assert.ok(row)
      assert.equal(typeof row.archived_at, 'string')
      assert.ok(row.archived_at)
      const listed = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(listed.status, 200)
      const list = (await listed.json()) as PackJson[]
      const archived = list.find((item) => item.id === created.id)
      assert.ok(archived)
      assert.ok(archived.archivedAt)
    })

    it('keeps an archived member on admin GET, drops it from price, and omits it from the storefront projection', async () => {
      const cookie = await signInAdmin()
      const refs = await seedRefs(cookie)
      const created = await createPackRow(
        cookie,
        'Archive a member',
        refs.school.id,
        refs.grade.id,
        'Member will drop off the sum',
        [refs.bookA.id, refs.bookB.id],
      )
      const archived = await fetch(`${packsBaseUrl}/api/admin/books/${refs.bookB.id}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(archived.status, 200)
      const listed = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(listed.status, 200)
      const list = (await listed.json()) as PackJson[]
      const found = list.find((item) => item.id === created.id)
      assert.ok(found)
      assert.equal(found.price, 5000)
      const archivedMember = found.books.find((book) => book.id === refs.bookB.id)
      assert.ok(archivedMember)
      assert.equal(typeof archivedMember.archivedAt, 'string')
      assert.ok(archivedMember.archivedAt)
      const liveMember = found.books.find((book) => book.id === refs.bookA.id)
      assert.ok(liveMember)
      assert.equal(liveMember.archivedAt, null)
      assert.deepEqual(packBookIds(created.id), [refs.bookA.id, refs.bookB.id].sort((a, b) => a - b))
      const storefront = toStorefrontPack(found)
      assert.deepEqual(
        storefront.books.map((book) => book.id),
        [refs.bookA.id],
      )
      assert.equal(storefront.price, 5000)
      assert.ok(storefront.books.every((book) => book.archivedAt === null))
      const projected = toStorefrontPack({
        id: 1,
        name: 'Year 6',
        schoolId: 1,
        gradeId: 1,
        description: 'List',
        price: 5000,
        archivedAt: null,
        books: [
          { id: 1, title: 'A', price: 5000, archivedAt: null },
          { id: 2, title: 'B', price: 4320, archivedAt: '2026-01-01T00:00:00.000Z' },
        ],
      })
      assert.deepEqual(projected.books, [{ id: 1, title: 'A', price: 5000, archivedAt: null }])
      assert.equal(projected.price, 5000)

      const patched = await fetch(itemUrl(created.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(
          packPatchBody('Archive a member', 'Member will drop off the sum', [refs.bookA.id]),
        ),
      })
      assert.equal(patched.status, 200)
      const patchedBody = (await patched.json()) as PackJson
      assert.equal(patchedBody.price, 5000)
      const stillArchived = patchedBody.books.find((book) => book.id === refs.bookB.id)
      assert.ok(stillArchived)
      assert.equal(typeof stillArchived.archivedAt, 'string')
      assert.ok(stillArchived.archivedAt)
      assert.deepEqual(packBookIds(created.id), [refs.bookA.id, refs.bookB.id].sort((a, b) => a - b))

      const archiveLast = await fetch(`${packsBaseUrl}/api/admin/books/${refs.bookA.id}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(archiveLast.status, 200)
      const listedEmpty = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(listedEmpty.status, 200)
      const emptyLive = ((await listedEmpty.json()) as PackJson[]).find(
        (item) => item.id === created.id,
      )
      assert.ok(emptyLive)
      assert.equal(emptyLive.price, 0)
      assert.equal(emptyLive.books.length, 2)
      assert.ok(emptyLive.books.every((book) => typeof book.archivedAt === 'string' && book.archivedAt))
    })

    it('refuses empty name, description, empty bookIds, unknown or archived refs, and duplicate ids', async () => {
      const cookie = await signInAdmin()
      const refs = await seedRefs(cookie)
      const created = await createPackRow(
        cookie,
        'Keep this pack',
        refs.school.id,
        refs.grade.id,
        'Keep this description',
        [refs.bookA.id],
      )
      const before = packCount()
      const beforeRow = packRow(created.id)
      const beforeBooks = packBookIds(created.id)

      const nameCases: unknown[] = ['', '   ', 12, null]
      for (const name of nameCases) {
        const createBad = await fetch(collectionUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({
            name,
            schoolId: refs.school.id,
            gradeId: refs.grade.id,
            description: 'Valid description',
            bookIds: [refs.bookA.id],
          }),
        })
        assert.equal(createBad.status, 400, `create expected 400 for name ${JSON.stringify(name)}`)
        const createBody = (await createBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(createBody.error.code, 'invalid_input')
        assert.equal(createBody.error.field, 'name')

        const patchBad = await fetch(itemUrl(created.id), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ name, description: 'Valid description', bookIds: [refs.bookA.id] }),
        })
        assert.equal(patchBad.status, 400, `patch expected 400 for name ${JSON.stringify(name)}`)
        const patchBody = (await patchBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(patchBody.error.code, 'invalid_input')
        assert.equal(patchBody.error.field, 'name')
      }

      const descriptionCases: unknown[] = ['', '   ', 12, null]
      for (const description of descriptionCases) {
        const createBad = await fetch(collectionUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({
            name: 'Valid pack',
            schoolId: refs.school.id,
            gradeId: refs.grade.id,
            description,
            bookIds: [refs.bookA.id],
          }),
        })
        assert.equal(
          createBad.status,
          400,
          `create expected 400 for description ${JSON.stringify(description)}`,
        )
        const createBody = (await createBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(createBody.error.code, 'invalid_input')
        assert.equal(createBody.error.field, 'description')

        const patchBad = await fetch(itemUrl(created.id), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({
            name: 'Keep this pack',
            description,
            bookIds: [refs.bookA.id],
          }),
        })
        assert.equal(
          patchBad.status,
          400,
          `patch expected 400 for description ${JSON.stringify(description)}`,
        )
        const patchBody = (await patchBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(patchBody.error.code, 'invalid_input')
        assert.equal(patchBody.error.field, 'description')
      }

      const bookIdCases: Array<{ bookIds: unknown; reason: string }> = [
        { bookIds: [], reason: 'empty' },
        { bookIds: [refs.bookA.id, refs.bookA.id], reason: 'duplicate' },
        { bookIds: [99999], reason: 'unknown' },
      ]
      for (const { bookIds, reason } of bookIdCases) {
        const createBad = await fetch(collectionUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({
            name: 'Valid pack',
            schoolId: refs.school.id,
            gradeId: refs.grade.id,
            description: 'Valid description',
            bookIds,
          }),
        })
        assert.equal(createBad.status, 400, `create expected 400 for bookIds ${reason}`)
        const createBody = (await createBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(createBody.error.code, 'invalid_input')
        assert.equal(createBody.error.field, 'bookIds')

        const patchBad = await fetch(itemUrl(created.id), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({
            name: 'Keep this pack',
            description: 'Keep this description',
            bookIds,
          }),
        })
        assert.equal(patchBad.status, 400, `patch expected 400 for bookIds ${reason}`)
        const patchBody = (await patchBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(patchBody.error.code, 'invalid_input')
        assert.equal(patchBody.error.field, 'bookIds')
        assert.deepEqual(packBookIds(created.id), beforeBooks)
      }

      const archivedSchool = await createNamed(cookie, 'schools', `Archived school ${Date.now()}`)
      const archiveSchool = await fetch(
        `${packsBaseUrl}/api/admin/schools/${archivedSchool.id}/archive`,
        { method: 'POST', headers: { cookie } },
      )
      assert.equal(archiveSchool.status, 200)
      const archivedGrade = await createNamed(cookie, 'grades', `Archived grade ${Date.now()}`)
      const archiveGrade = await fetch(
        `${packsBaseUrl}/api/admin/grades/${archivedGrade.id}/archive`,
        { method: 'POST', headers: { cookie } },
      )
      assert.equal(archiveGrade.status, 200)
      const archivedBook = await createBookRow(cookie, `Archived book ${Date.now()}`, 300)
      const archiveBook = await fetch(`${packsBaseUrl}/api/admin/books/${archivedBook.id}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(archiveBook.status, 200)

      const archivedRefCases: Array<{ body: Record<string, unknown>; field: string }> = [
        {
          body: {
            name: 'Valid pack',
            schoolId: archivedSchool.id,
            gradeId: refs.grade.id,
            description: 'Valid description',
            bookIds: [refs.bookA.id],
          },
          field: 'schoolId',
        },
        {
          body: {
            name: 'Valid pack',
            schoolId: 99999,
            gradeId: refs.grade.id,
            description: 'Valid description',
            bookIds: [refs.bookA.id],
          },
          field: 'schoolId',
        },
        {
          body: {
            name: 'Valid pack',
            schoolId: refs.school.id,
            gradeId: archivedGrade.id,
            description: 'Valid description',
            bookIds: [refs.bookA.id],
          },
          field: 'gradeId',
        },
        {
          body: {
            name: 'Valid pack',
            schoolId: refs.school.id,
            gradeId: refs.grade.id,
            description: 'Valid description',
            bookIds: [archivedBook.id],
          },
          field: 'bookIds',
        },
      ]
      for (const { body, field } of archivedRefCases) {
        const createBad = await fetch(collectionUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify(body),
        })
        assert.equal(createBad.status, 400, `create expected 400 for ${field}`)
        const createBody = (await createBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(createBody.error.code, 'invalid_input')
        assert.equal(createBody.error.field, field)
      }

      assert.equal(packCount(), before)
      assert.deepEqual(packRow(created.id), beforeRow)
      assert.deepEqual(packBookIds(created.id), beforeBooks)
    })

    it('ignores itemIds and never persists pack_items', async () => {
      const cookie = await signInAdmin()
      const refs = await seedRefs(cookie)
      const created = await fetch(collectionUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          ...packCreateBody(
            'Items ignored',
            refs.school.id,
            refs.grade.id,
            'Books only',
            [refs.bookA.id],
          ),
          itemIds: [refs.bookB.id, 999],
        }),
      })
      assert.equal(created.status, 201)
      const body = (await created.json()) as PackJson
      assert.deepEqual(
        body.books.map((book) => book.id),
        [refs.bookA.id],
      )
      assert.equal(tableExists('pack_items'), false)

      const onlyItems = await fetch(collectionUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          name: 'Items only',
          schoolId: refs.school.id,
          gradeId: refs.grade.id,
          description: 'Should fail',
          itemIds: [refs.bookA.id],
        }),
      })
      assert.equal(onlyItems.status, 400)
      const onlyItemsBody = (await onlyItems.json()) as {
        error: { code: string; message: string; field?: string }
      }
      assert.equal(onlyItemsBody.error.code, 'invalid_input')
      assert.equal(onlyItemsBody.error.field, 'bookIds')
      assert.equal(tableExists('pack_items'), false)

      const nonBook = await fetch(itemUrl(body.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          name: 'Still books',
          description: 'Non-book id',
          bookIds: [99999],
          itemIds: [refs.bookB.id],
        }),
      })
      assert.equal(nonBook.status, 400)
      const nonBookBody = (await nonBook.json()) as {
        error: { code: string; message: string; field?: string }
      }
      assert.equal(nonBookBody.error.code, 'invalid_input')
      assert.equal(nonBookBody.error.field, 'bookIds')
      assert.deepEqual(packBookIds(body.id), [refs.bookA.id])
    })

    it('refuses anonymous callers with unauthenticated', async () => {
      const adminCookie = await signInAdmin()
      const refs = await seedRefs(adminCookie)
      const created = await createPackRow(
        adminCookie,
        'Anonymous gated',
        refs.school.id,
        refs.grade.id,
        'Gated pack',
        [refs.bookA.id],
      )
      const before = packCount()
      const beforeRow = packRow(created.id)

      const anonymousCalls: Array<() => Promise<Response>> = [
        () =>
          fetch(collectionUrl(), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(
              packCreateBody('Anonymous should not', refs.school.id, refs.grade.id, 'No', [
                refs.bookA.id,
              ]),
            ),
          }),
        () => fetch(collectionUrl()),
        () =>
          fetch(itemUrl(created.id), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(packPatchBody('Anonymous should not', 'No', [refs.bookA.id])),
          }),
        () => fetch(`${itemUrl(created.id)}/archive`, { method: 'POST' }),
      ]
      for (const call of anonymousCalls) {
        const response = await call()
        assert.equal(response.status, 401)
        const body = (await response.json()) as { error: { code: string; message: string } }
        assert.equal(body.error.code, 'unauthenticated')
        assert.match(body.error.message, /[A-Za-z]/)
      }

      assert.equal(packCount(), before)
      assert.deepEqual(packRow(created.id), beforeRow)
    })

    it('refuses parent GET and writes with a packs-specific 403', async () => {
      const adminCookie = await signInAdmin()
      const refs = await seedRefs(adminCookie)
      const created = await createPackRow(
        adminCookie,
        'Gated pack',
        refs.school.id,
        refs.grade.id,
        'Parent cannot write',
        [refs.bookA.id],
      )
      const before = packCount()
      const beforeRow = packRow(created.id)

      const parentGet = await fetch(collectionUrl(), { headers: { cookie: parentCookie } })
      assert.equal(parentGet.status, 403)
      const getBody = (await parentGet.json()) as { error: { code: string; message: string } }
      assert.equal(getBody.error.code, 'forbidden')
      assert.match(getBody.error.message, /pack/i)
      assert.doesNotMatch(getBody.error.message, /school and grade/i)
      assert.doesNotMatch(getBody.error.message, /book list/i)

      const parentWrites: Array<() => Promise<Response>> = [
        () =>
          fetch(collectionUrl(), {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: parentCookie },
            body: JSON.stringify(
              packCreateBody('Parent should not', refs.school.id, refs.grade.id, 'No', [
                refs.bookA.id,
              ]),
            ),
          }),
        () =>
          fetch(itemUrl(created.id), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', cookie: parentCookie },
            body: JSON.stringify(packPatchBody('Parent should not', 'No', [refs.bookA.id])),
          }),
        () =>
          fetch(`${itemUrl(created.id)}/archive`, {
            method: 'POST',
            headers: { cookie: parentCookie },
          }),
      ]
      for (const write of parentWrites) {
        const response = await write()
        assert.equal(response.status, 403)
        const body = (await response.json()) as { error: { code: string; message: string } }
        assert.equal(body.error.code, 'forbidden')
        assert.match(body.error.message, /pack/i)
        assert.doesNotMatch(body.error.message, /school and grade/i)
        assert.doesNotMatch(body.error.message, /book list/i)
      }

      assert.equal(packCount(), before)
      assert.deepEqual(packRow(created.id), beforeRow)
    })

    it('refuses an unknown id without writing', async () => {
      const cookie = await signInAdmin()
      const refs = await seedRefs(cookie)
      const before = packCount()
      const missing = 99999

      const edit = await fetch(itemUrl(missing), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(packPatchBody('Missing pack', 'Missing', [refs.bookA.id])),
      })
      assert.equal(edit.status, 404)
      const editBody = (await edit.json()) as { error: { code: string; message: string } }
      assert.equal(editBody.error.code, 'not_found')
      assert.match(editBody.error.message, /[A-Za-z]/)

      const archive = await fetch(`${itemUrl(missing)}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(archive.status, 404)
      const archiveBody = (await archive.json()) as { error: { code: string; message: string } }
      assert.equal(archiveBody.error.code, 'not_found')
      assert.match(archiveBody.error.message, /[A-Za-z]/)

      assert.equal(packCount(), before)
    })

    it('refuses DELETE of a school, grade, or book used by a live pack', async () => {
      const cookie = await signInAdmin()
      const refs = await seedRefs(cookie)
      const created = await createPackRow(
        cookie,
        'Live guard pack',
        refs.school.id,
        refs.grade.id,
        'Holds references',
        [refs.bookA.id],
      )

      const schoolDelete = await fetch(`${packsBaseUrl}/api/admin/schools/${refs.school.id}`, {
        method: 'DELETE',
        headers: { cookie },
      })
      assert.equal(schoolDelete.status, 409)
      const schoolBody = (await schoolDelete.json()) as { error: { code: string } }
      assert.equal(schoolBody.error.code, 'in_use')

      const gradeDelete = await fetch(`${packsBaseUrl}/api/admin/grades/${refs.grade.id}`, {
        method: 'DELETE',
        headers: { cookie },
      })
      assert.equal(gradeDelete.status, 409)
      const gradeBody = (await gradeDelete.json()) as { error: { code: string } }
      assert.equal(gradeBody.error.code, 'in_use')

      const bookDelete = await fetch(`${packsBaseUrl}/api/admin/books/${refs.bookA.id}`, {
        method: 'DELETE',
        headers: { cookie },
      })
      assert.equal(bookDelete.status, 409)
      const bookBody = (await bookDelete.json()) as { error: { code: string } }
      assert.equal(bookBody.error.code, 'in_use')

      const packDelete = await fetch(itemUrl(created.id), {
        method: 'DELETE',
        headers: { cookie },
      })
      assert.equal(packDelete.status, 404)
      assert.ok(packRow(created.id))
    })

    it('maps pack request keys and keeps empty Add pack, with computed Rs. display and no images', async () => {
      const createBody = packCreateBody('Year 6 English', 1, 2, 'All titles', [3, 4])
      assert.deepEqual(createBody, {
        name: 'Year 6 English',
        schoolId: 1,
        gradeId: 2,
        description: 'All titles',
        bookIds: [3, 4],
      })
      assert.deepEqual(Object.keys(createBody), [
        'name',
        'schoolId',
        'gradeId',
        'description',
        'bookIds',
      ])
      const patchBody = packPatchBody('Year 6 English', 'All titles', [3, 4])
      assert.deepEqual(Object.keys(patchBody), ['name', 'description', 'bookIds'])
      assert.equal(packsCollectionPath(), '/api/admin/packs')
      assert.equal(packsItemPath(4), '/api/admin/packs/4')
      assert.equal(packsArchivePath(4), '/api/admin/packs/4/archive')
      assert.equal(formatRupees(9320), 'Rs. 9,320')

      const packsPage = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'PacksPage.tsx'),
        'utf8',
      )
      const packsHelpers = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'packs.ts'),
        'utf8',
      )
      const http = await readFile(path.join(serverRoot, 'catalog', 'http.ts'), 'utf8')
      const packsModule = await readFile(path.join(serverRoot, 'catalog', 'packs.ts'), 'utf8')
      const migration = await readFile(
        path.join(serverRoot, 'db', 'migrations', '005_catalog_packs.sql'),
        'utf8',
      )
      const adminApp = await readFile(adminAppPath, 'utf8')
      const api = await readFile(path.join(serverRoot, 'web', 'api.ts'), 'utf8')

      assert.match(adminApp, /import \{ PacksPage \} from '\.\/PacksPage'/)
      assert.match(adminApp, /path="packs" element=\{<PacksPage \/>\}/)
      assert.match(packsPage, /Add pack/)
      assert.match(packsPage, /There are no packs yet/)
      assert.match(packsPage, /formatRupees\(item\.price\)/)
      assert.match(packsPage, /value=\{name\}/)
      assert.match(packsPage, /value=\{description\}/)
      assert.match(packsPage, /<select/)
      assert.match(packsPage, /type="checkbox"/)
      assert.match(packsPage, /<textarea/)
      assert.match(packsPage, /if \(nameIssue \|\| descriptionIssue \|\| schoolIssue \|\| gradeIssue \|\| booksIssue\) \{[\s\S]*setError\(nameIssue \|\| descriptionIssue \|\| schoolIssue \|\| gradeIssue \|\| booksIssue\)[\s\S]*return/)
      assert.match(packsPage, /if \(!response\.ok\) \{[\s\S]*return/)
      assert.match(packsPage, /credentials: 'include'/)
      assert.match(packsPage, /response\.status === 401/)
      assert.match(packsPage, /Archive/)
      assert.match(packsPage, /Archived/)
      assert.match(packsPage, /packCreateBody\(/)
      assert.match(packsPage, /packPatchBody\(/)
      assert.doesNotMatch(packsPage, /type="file"/)
      assert.doesNotMatch(packsPage, /<input[^>]*image/i)
      assert.doesNotMatch(packsPage, /form-field-money/)
      assert.doesNotMatch(packsPage, /name="price"/)
      assert.doesNotMatch(packsPage, /method: 'DELETE'/)
      assert.doesNotMatch(packsHelpers, /NamedKind/)
      assert.match(http, /lookupSession/)
      assert.match(http, /rejectUnauthorized/)
      assert.match(http, /PACKS_FORBIDDEN_MESSAGE/)
      assert.match(http, /role !== 'admin'/)
      assert.match(http, /mountPacks/)
      assert.doesNotMatch(http, /refuseIfNotAdmin/)
      assert.doesNotMatch(http, /db\.prepare/)
      assert.doesNotMatch(http, /INSERT INTO|UPDATE |DELETE FROM/)
      assert.match(packsModule, /toStorefrontPack/)
      assert.match(packsModule, /archivedAt === null/)
      assert.doesNotMatch(migration, /pack_items/)
      assert.doesNotMatch(migration, /\bprice\b/)
      assert.match(migration, /school_id/)
      assert.match(migration, /grade_id/)
      assert.match(migration, /pack_id/)
      assert.match(migration, /book_id/)
      assert.match(
        api,
        /createIdentityRouter\(db, env\)\)\s*router\.use\(createCatalogRouter\(db, env\)\)/,
      )
    })
  })

  describe('Individual items', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let parentCookie: string

    const parentReg = {
      name: 'Nimali Perera',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '0771234567',
      email: 'nimali.items@example.com',
      password: 'evening-order',
    }

    type ItemJson = {
      id: number
      title: string
      description: string
      price: number
      archivedAt: string | null
    }

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${itemsBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    function collectionUrl(): string {
      return `${itemsBaseUrl}/api/admin/items`
    }

    function itemUrl(id: number | string): string {
      return `${collectionUrl()}/${id}`
    }

    function itemCount(): number {
      const db = new Database(dbPath, { readonly: true })
      try {
        return (db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n
      } finally {
        db.close()
      }
    }

    function bookCount(): number {
      const db = new Database(dbPath, { readonly: true })
      try {
        return (db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n
      } finally {
        db.close()
      }
    }

    function tableExists(name: string): boolean {
      const db = new Database(dbPath, { readonly: true })
      try {
        const row = db
          .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get(name) as { ok: number } | undefined
        return Boolean(row)
      } finally {
        db.close()
      }
    }

    function itemRow(id: number):
      | {
          id: number
          title: string
          description: string
          price: number
          archived_at: string | null
        }
      | undefined {
      const db = new Database(dbPath, { readonly: true })
      try {
        return db
          .prepare('SELECT id, title, description, price, archived_at FROM items WHERE id = ?')
          .get(id) as
          | {
              id: number
              title: string
              description: string
              price: number
              archived_at: string | null
            }
          | undefined
      } finally {
        db.close()
      }
    }

    async function createItemRow(
      cookie: string,
      title: string,
      description: string,
      price: number,
    ): Promise<ItemJson> {
      const response = await fetch(collectionUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(itemBody(title, description, price)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as ItemJson
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-items-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, ITEMS_PORT)
      child = started.child
      const registered = await fetch(`${itemsBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parentReg),
      })
      assert.equal(registered.status, 201)
      const cookie = sidCookie(registered.headers)
      assert.ok(cookie)
      parentCookie = cookieHeader(cookie)
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('lists an empty array for an admin with no rows', async () => {
      const cookie = await signInAdmin()
      const response = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as unknown
      assert.deepEqual(body, [])
      assert.equal(itemCount(), 0)
    })

    it('creates an item with an integer rupee price', async () => {
      const cookie = await signInAdmin()
      const response = await fetch(collectionUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(
          itemBody('  Exercise book  ', '  Ruled A4 stationery  ', 9320),
        ),
      })
      assert.equal(response.status, 201)
      const raw = await response.text()
      assert.match(raw, /"price":9320/)
      assert.doesNotMatch(raw, /"price":"9320"/)
      assert.doesNotMatch(raw, /"price":9320\.0/)
      const body = JSON.parse(raw) as ItemJson
      assert.equal(typeof body.id, 'number')
      assert.equal(body.title, 'Exercise book')
      assert.equal(body.description, 'Ruled A4 stationery')
      assert.equal(body.price, 9320)
      assert.equal(typeof body.price, 'number')
      assert.equal(Number.isInteger(body.price), true)
      assert.equal(body.archivedAt, null)
      const row = itemRow(body.id)
      assert.ok(row)
      assert.equal(row.title, 'Exercise book')
      assert.equal(row.description, 'Ruled A4 stationery')
      assert.equal(row.price, 9320)
      assert.equal(row.archived_at, null)
      assert.equal(formatRupees(body.price), 'Rs. 9,320')
    })

    it('edits title, description, and price together and later GET shows only the new values', async () => {
      const cookie = await signInAdmin()
      const created = await createItemRow(cookie, 'Pencil pack', 'HB set of 12', 450)
      const response = await fetch(itemUrl(created.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(itemBody('Pencil pack large', 'HB set of 24', 9320)),
      })
      assert.equal(response.status, 200)
      const body = (await response.json()) as ItemJson
      assert.equal(body.id, created.id)
      assert.equal(body.title, 'Pencil pack large')
      assert.equal(body.description, 'HB set of 24')
      assert.equal(body.price, 9320)
      assert.equal(Number.isInteger(body.price), true)
      assert.equal(body.archivedAt, null)

      const listed = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(listed.status, 200)
      const list = (await listed.json()) as ItemJson[]
      const found = list.find((item) => item.id === created.id)
      assert.ok(found)
      assert.equal(found.title, 'Pencil pack large')
      assert.equal(found.description, 'HB set of 24')
      assert.equal(found.price, 9320)
      assert.equal(found.archivedAt, null)
      const row = itemRow(created.id)
      assert.ok(row)
      assert.equal(row.title, 'Pencil pack large')
      assert.equal(row.description, 'HB set of 24')
      assert.equal(row.price, 9320)
    })

    it('archives an item, keeps it on the admin list, and stamps archivedAt', async () => {
      const cookie = await signInAdmin()
      const created = await createItemRow(cookie, 'Glue stick', '40g white', 2100)
      const response = await fetch(`${itemUrl(created.id)}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(response.status, 200)
      const body = (await response.json()) as ItemJson
      assert.equal(body.id, created.id)
      assert.equal(body.title, created.title)
      assert.equal(body.description, created.description)
      assert.equal(body.price, created.price)
      assert.equal(typeof body.archivedAt, 'string')
      assert.ok(body.archivedAt)

      const row = itemRow(created.id)
      assert.ok(row)
      assert.equal(typeof row.archived_at, 'string')
      assert.ok(row.archived_at)

      const listed = await fetch(collectionUrl(), { headers: { cookie } })
      assert.equal(listed.status, 200)
      const list = (await listed.json()) as ItemJson[]
      const archived = list.find((item) => item.id === created.id)
      assert.ok(archived)
      assert.ok(archived.archivedAt)
    })

    it('refuses empty title or description, and float, string, or zero price without writing', async () => {
      const cookie = await signInAdmin()
      const created = await createItemRow(cookie, 'Keep this title', 'Keep this description', 1200)
      const before = itemCount()
      const beforeRow = itemRow(created.id)

      const titleCases: unknown[] = ['', '   ', 12, null]
      for (const title of titleCases) {
        const createBad = await fetch(collectionUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ title, description: 'Valid description', price: 9320 }),
        })
        assert.equal(createBad.status, 400, `create expected 400 for title ${JSON.stringify(title)}`)
        const createBody = (await createBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(createBody.error.code, 'invalid_input')
        assert.equal(createBody.error.field, 'title')
        assert.equal(createBody.error.message, 'Enter an item title.')

        const patchBad = await fetch(itemUrl(created.id), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ title, description: 'Valid description', price: 9320 }),
        })
        assert.equal(patchBad.status, 400, `patch expected 400 for title ${JSON.stringify(title)}`)
        const patchBody = (await patchBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(patchBody.error.code, 'invalid_input')
        assert.equal(patchBody.error.field, 'title')
        assert.equal(patchBody.error.message, 'Enter an item title.')
      }

      const descriptionCases: unknown[] = ['', '   ', 12, null]
      for (const description of descriptionCases) {
        const createBad = await fetch(collectionUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ title: 'A valid title', description, price: 9320 }),
        })
        assert.equal(
          createBad.status,
          400,
          `create expected 400 for description ${JSON.stringify(description)}`,
        )
        const createBody = (await createBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(createBody.error.code, 'invalid_input')
        assert.equal(createBody.error.field, 'description')

        const patchBad = await fetch(itemUrl(created.id), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ title: 'A valid title', description, price: 9320 }),
        })
        assert.equal(
          patchBad.status,
          400,
          `patch expected 400 for description ${JSON.stringify(description)}`,
        )
        const patchBody = (await patchBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(patchBody.error.code, 'invalid_input')
        assert.equal(patchBody.error.field, 'description')
      }

      const priceCases: unknown[] = [0, 9320.5, '9320', '9,320', null]
      for (const price of priceCases) {
        const createBad = await fetch(collectionUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({
            title: 'A valid title',
            description: 'A valid description',
            price,
          }),
        })
        assert.equal(createBad.status, 400, `create expected 400 for price ${JSON.stringify(price)}`)
        const createBody = (await createBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(createBody.error.code, 'invalid_input')
        assert.equal(createBody.error.field, 'price')

        const patchBad = await fetch(itemUrl(created.id), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({
            title: 'A valid title',
            description: 'A valid description',
            price,
          }),
        })
        assert.equal(patchBad.status, 400, `patch expected 400 for price ${JSON.stringify(price)}`)
        const patchBody = (await patchBad.json()) as {
          error: { code: string; message: string; field?: string }
        }
        assert.equal(patchBody.error.code, 'invalid_input')
        assert.equal(patchBody.error.field, 'price')
      }

      assert.equal(itemCount(), before)
      assert.deepEqual(itemRow(created.id), beforeRow)
    })

    it('refuses anonymous callers with unauthenticated', async () => {
      const adminCookie = await signInAdmin()
      const created = await createItemRow(adminCookie, 'Anonymous gated', 'No cookie', 700)
      const before = itemCount()
      const beforeRow = itemRow(created.id)

      const anonymousCalls: Array<() => Promise<Response>> = [
        () =>
          fetch(collectionUrl(), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(itemBody('Anonymous should not', 'No access', 9320)),
          }),
        () => fetch(collectionUrl()),
        () =>
          fetch(itemUrl(created.id), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(itemBody('Anonymous should not', 'No access', 100)),
          }),
        () => fetch(`${itemUrl(created.id)}/archive`, { method: 'POST' }),
      ]
      for (const call of anonymousCalls) {
        const response = await call()
        assert.equal(response.status, 401)
        const body = (await response.json()) as { error: { code: string; message: string } }
        assert.equal(body.error.code, 'unauthenticated')
        assert.match(body.error.message, /[A-Za-z]/)
      }

      assert.equal(itemCount(), before)
      assert.deepEqual(itemRow(created.id), beforeRow)
    })

    it('refuses parent GET and writes with an items-specific 403', async () => {
      const adminCookie = await signInAdmin()
      const created = await createItemRow(adminCookie, 'Gated item', 'Parent cannot write', 800)
      const before = itemCount()
      const beforeRow = itemRow(created.id)
      const forbidden =
        'Only the shop owner can change the item list. Sign in as the shop owner to continue.'

      const parentGet = await fetch(collectionUrl(), { headers: { cookie: parentCookie } })
      assert.equal(parentGet.status, 403)
      const getBody = (await parentGet.json()) as { error: { code: string; message: string } }
      assert.equal(getBody.error.code, 'forbidden')
      assert.equal(getBody.error.message, forbidden)

      const parentWrites: Array<() => Promise<Response>> = [
        () =>
          fetch(collectionUrl(), {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: parentCookie },
            body: JSON.stringify(itemBody('Parent should not', 'No insert', 9320)),
          }),
        () =>
          fetch(itemUrl(created.id), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', cookie: parentCookie },
            body: JSON.stringify(itemBody('Parent should not', 'No update', 100)),
          }),
        () =>
          fetch(`${itemUrl(created.id)}/archive`, {
            method: 'POST',
            headers: { cookie: parentCookie },
          }),
      ]
      for (const write of parentWrites) {
        const response = await write()
        assert.equal(response.status, 403)
        const body = (await response.json()) as { error: { code: string; message: string } }
        assert.equal(body.error.code, 'forbidden')
        assert.equal(body.error.message, forbidden)
      }

      assert.equal(itemCount(), before)
      assert.deepEqual(itemRow(created.id), beforeRow)
    })

    it('refuses an unknown id without writing', async () => {
      const cookie = await signInAdmin()
      const before = itemCount()
      const missing = 99999

      const edit = await fetch(itemUrl(missing), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(itemBody('Missing item', 'Not on the list', 9320)),
      })
      assert.equal(edit.status, 404)
      const editBody = (await edit.json()) as { error: { code: string; message: string } }
      assert.equal(editBody.error.code, 'not_found')
      assert.equal(editBody.error.message, 'That item is not on the list.')

      const archive = await fetch(`${itemUrl(missing)}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(archive.status, 404)
      const archiveBody = (await archive.json()) as { error: { code: string; message: string } }
      assert.equal(archiveBody.error.code, 'not_found')
      assert.equal(archiveBody.error.message, 'That item is not on the list.')

      assert.equal(itemCount(), before)
    })

    it('does not create pack_items and is not a book row', async () => {
      const cookie = await signInAdmin()
      const beforeBooks = bookCount()
      const created = await createItemRow(
        cookie,
        'Not a pack member',
        'Stationery only',
        1500,
      )
      assert.ok(itemRow(created.id))
      assert.equal(tableExists('pack_items'), false)
      assert.equal(bookCount(), beforeBooks)
      const books = await fetch(`${itemsBaseUrl}/api/admin/books`, { headers: { cookie } })
      assert.equal(books.status, 200)
      const bookList = (await books.json()) as Array<{ title: string }>
      assert.equal(
        bookList.some((book) => book.title === 'Not a pack member'),
        false,
      )
    })

    it('maps item request keys and keeps empty Add item, with filled Rs. prefix and no images', async () => {
      const body = itemBody('Exercise book', 'Ruled A4 stationery', 9320)
      assert.deepEqual(body, {
        title: 'Exercise book',
        description: 'Ruled A4 stationery',
        price: 9320,
      })
      assert.deepEqual(Object.keys(body), ['title', 'description', 'price'])
      assert.equal(itemsCollectionPath(), '/api/admin/items')
      assert.equal(itemsItemPath(4), '/api/admin/items/4')
      assert.equal(itemsArchivePath(4), '/api/admin/items/4/archive')
      assert.equal(formatRupees(9320), 'Rs. 9,320')

      const itemsPage = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'ItemsPage.tsx'),
        'utf8',
      )
      const itemsHelpers = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'items.ts'),
        'utf8',
      )
      const http = await readFile(path.join(serverRoot, 'catalog', 'http.ts'), 'utf8')
      const itemsModule = await readFile(path.join(serverRoot, 'catalog', 'items.ts'), 'utf8')
      const migration = await readFile(
        path.join(serverRoot, 'db', 'migrations', '006_catalog_items.sql'),
        'utf8',
      )
      const booksPage = await readFile(
        path.join(repoRoot, 'client', 'admin', 'src', 'BooksPage.tsx'),
        'utf8',
      )
      const adminApp = await readFile(adminAppPath, 'utf8')
      const baseCss = await readFile(baseCssPath, 'utf8')
      const api = await readFile(path.join(serverRoot, 'web', 'api.ts'), 'utf8')

      assert.match(adminApp, /import \{ ItemsPage \} from '\.\/ItemsPage'/)
      assert.match(adminApp, /path="items" element=\{<ItemsPage \/>\}/)
      assert.match(itemsPage, /Add item/)
      assert.match(itemsPage, /There are no items yet/)
      assert.match(itemsPage, /formatRupees\(item\.price\)/)
      assert.match(itemsPage, /form-field-money-prefix/)
      assert.match(itemsPage, />[\s\S]*Rs\.[\s\S]*<\//)
      assert.match(itemsPage, /value=\{title\}/)
      assert.match(itemsPage, /value=\{description\}/)
      assert.match(itemsPage, /value=\{price\}/)
      assert.match(itemsPage, /<textarea/)
      assert.match(
        itemsPage,
        /if \(titleIssue \|\| descriptionIssue \|\| priceIssue\) \{[\s\S]*setError\(titleIssue \|\| descriptionIssue \|\| priceIssue\)[\s\S]*return/,
      )
      assert.match(itemsPage, /if \(!response\.ok\) \{[\s\S]*return/)
      assert.match(itemsPage, /credentials: 'include'/)
      assert.match(itemsPage, /response\.status === 401/)
      assert.match(itemsPage, /Archive/)
      assert.match(itemsPage, /Archived/)
      assert.match(itemsPage, /itemBody\(title, description, Number\(price\.trim\(\)\)\)/)
      assert.match(itemsPage, /Enter an item title\./)
      assert.doesNotMatch(itemsPage, /type="file"/)
      assert.doesNotMatch(itemsPage, /<input[^>]*image/i)
      assert.doesNotMatch(itemsPage, /method: 'DELETE'/)
      assert.doesNotMatch(itemsHelpers, /NamedKind/)
      assert.match(http, /lookupSession/)
      assert.match(http, /rejectUnauthorized/)
      assert.match(http, /ITEMS_FORBIDDEN_MESSAGE/)
      assert.match(http, /role !== 'admin'/)
      assert.match(http, /mountItems/)
      assert.match(http, /mountPacks\(router, db, env\)\s*mountItems\(router, db, env\)/)
      assert.doesNotMatch(http, /refuseIfNotAdmin/)
      assert.doesNotMatch(http, /db\.prepare/)
      assert.doesNotMatch(http, /INSERT INTO|UPDATE |DELETE FROM/)
      assert.match(itemsModule, /archived_at/)
      assert.doesNotMatch(itemsModule, /pack_items/)
      assert.doesNotMatch(itemsModule, /DELETE FROM items/)
      assert.match(migration, /CREATE TABLE items/)
      assert.match(migration, /description/)
      assert.match(migration, /price INTEGER/)
      assert.doesNotMatch(migration, /pack_items/)
      assert.match(booksPage, /Enter a book title\./)
      assert.doesNotMatch(booksPage, /Enter an item title\./)
      assert.match(baseCss, /\.form-field-money-prefix/)
      assert.match(baseCss, /--color-surface-sunken/)
      assert.match(
        api,
        /createIdentityRouter\(db, env\)\)\s*router\.use\(createCatalogRouter\(db, env\)\)/,
      )
    })
  })
})
