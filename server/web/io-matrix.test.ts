import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
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
  CONFIRMED_STATUS,
  DELIVERED_STATUS,
  DELIVERY_PRICE_MESSAGE,
  MOVABLE_FROM,
  REASON_MAX_LENGTH,
  REASON_MESSAGE,
  adminOrderCallAttemptedPath,
  adminOrderCancelPath,
  adminOrderConfirmPath,
  adminOrderPath,
  adminOrderRoute,
  adminOrderSections,
  adminOrderStatusPath,
  adminOrdersPath,
  cancelBody,
  confirmBody,
  deliveryPriceFrom,
  isTerminal,
  moveBody,
  parseAdminOrderDetail,
  parseAdminOrders,
  reasonFrom,
  statusFilterFrom,
  transitionAnnouncement,
  withStatusFilter,
} from '../../client/admin/src/orders.ts'
import {
  packCreateBody,
  packPatchBody,
  packsArchivePath,
  packsCollectionPath,
  packsItemPath,
} from '../../client/admin/src/packs.ts'
import {
  browseGradesPath,
  browseItemsPath,
  browsePackPath,
  browsePacksPath,
  browseSchoolsPath,
  packRoutePath,
} from '../../client/storefront/src/browse.ts'
import {
  configuredLines,
  decreaseChoice,
  increaseChoice,
  initialChoices,
  lockedBookId,
  runningTotal,
  selectionFromChoices,
  toggleChoice,
} from '../../client/storefront/src/packConfig.ts'
import { browseActive } from '../../client/storefront/src/Shell.tsx'
import {
  compositionMeta,
  parseCartBody,
  acceptPriceRequest,
  parseCheckoutBody,
} from '../../client/storefront/src/cartLines.ts'
import { formatRupees } from '../../client/ui/money.ts'
import { toStorefrontPack } from '../catalog/packs.ts'
import { checkoutBlock } from '../cart/index.ts'
import { runMigrations } from '../db/migrations/run.ts'
import { listParentOrders, placeOrder } from '../orders/place.ts'
import { MOVE_TARGETS, REASON_MAX_LENGTH as SERVER_REASON_MAX_LENGTH } from '../orders/admin.ts'

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

/** The declarations of one rule, so a token assertion cannot drift into a neighbouring rule. */
function cssRule(source: string, selector: string, occurrence = 0): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...source.matchAll(new RegExp(`(?:^|\\n)[ \\t]*${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
  const match = matches[occurrence]
  assert.ok(match, `missing rule ${selector} #${occurrence}`)
  return match[1] ?? ''
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
const BROWSE_PORT = String(18777)
const browseBaseUrl = `http://127.0.0.1:${BROWSE_PORT}`
const PACK_PORT = String(18778)
const packBaseUrl = `http://127.0.0.1:${PACK_PORT}`
const CART_PORT = String(18779)
const cartBaseUrl = `http://127.0.0.1:${CART_PORT}`
const CART_ITEMS_PORT = String(18780)
const cartItemsBaseUrl = `http://127.0.0.1:${CART_ITEMS_PORT}`
const CART_TOTALS_PORT = String(18781)
const cartTotalsBaseUrl = `http://127.0.0.1:${CART_TOTALS_PORT}`
const CHECKOUT_PORT = String(18782)
const checkoutBaseUrl = `http://127.0.0.1:${CHECKOUT_PORT}`
const ORDERS_PORT = String(18783)
const ordersBaseUrl = `http://127.0.0.1:${ORDERS_PORT}`
const ORDERS_DETAIL_PORT = String(18784)
const ordersDetailBaseUrl = `http://127.0.0.1:${ORDERS_DETAIL_PORT}`
const ADMIN_ORDERS_PORT = String(18785)
const adminOrdersBaseUrl = `http://127.0.0.1:${ADMIN_ORDERS_PORT}`
const ADMIN_DETAIL_PORT = String(18786)
const adminDetailBaseUrl = `http://127.0.0.1:${ADMIN_DETAIL_PORT}`
const ADMIN_CLOSE_PORT = String(18787)
const adminCloseBaseUrl = `http://127.0.0.1:${ADMIN_CLOSE_PORT}`
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
        assert.equal(applied.n, 11)
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
      assert.match(storefrontApp, /element=\{<BrowsePage \/>\}/)
      assert.match(storefrontApp, /path="items" element=\{<ItemsPage \/>\}/)
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
      assert.match(app, /<Route index element=\{<BrowsePage \/>\} \/>/)
      assert.match(app, /path="items" element=\{<ItemsPage \/>\}/)
      assert.doesNotMatch(gated, /path="items"/)

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
          assert.equal(applied.n, 11)
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
        ...(await walkFiles(path.join(serverRoot, 'cart'))),
        ...(await walkFiles(path.join(serverRoot, 'orders'))),
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

  describe('Browse packs and items', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let parentCookie: string

    const parentReg = {
      name: 'Nimali Perera',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '0771234567',
      email: 'nimali.browse@example.com',
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
    type ItemJson = {
      id: number
      title: string
      description: string
      price: number
      archivedAt: string | null
    }
    type BrowseNamed = { id: number; name: string }
    type BrowsePack = { id: number; name: string; description: string; price: number }
    type BrowseItem = { id: number; title: string; description: string; price: number }

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${browseBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function createNamed(
      cookie: string,
      resourcePath: 'schools' | 'grades',
      name: string,
    ): Promise<NamedJson> {
      const response = await fetch(`${browseBaseUrl}/api/admin/${resourcePath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(catalogNameBody(name)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as NamedJson
    }

    async function createBookRow(cookie: string, title: string, price: number): Promise<BookJson> {
      const response = await fetch(`${browseBaseUrl}/api/admin/books`, {
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
      const response = await fetch(`${browseBaseUrl}/api/admin/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(packCreateBody(name, schoolId, gradeId, description, bookIds)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as PackJson
    }

    async function createItemRow(
      cookie: string,
      title: string,
      description: string,
      price: number,
    ): Promise<ItemJson> {
      const response = await fetch(`${browseBaseUrl}/api/admin/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(itemBody(title, description, price)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as ItemJson
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-browse-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, BROWSE_PORT)
      child = started.child
      const registered = await fetch(`${browseBaseUrl}/api/parents`, {
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

    it('returns an empty school list when there are no packs', async () => {
      const response = await fetch(`${browseBaseUrl}${browseSchoolsPath()}`)
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), [])
    })

    it('lists only schools with a live pack and omits archived schools', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-schools`
      const liveSchool = await createNamed(cookie, 'schools', `Live school ${suffix}`)
      const archivedSchool = await createNamed(cookie, 'schools', `Archived school ${suffix}`)
      const grade = await createNamed(cookie, 'grades', `Grade ${suffix}`)
      const book = await createBookRow(cookie, `Book ${suffix}`, 1000)
      await createPackRow(cookie, `Live pack ${suffix}`, liveSchool.id, grade.id, 'Live', [book.id])
      const archivedPack = await createPackRow(
        cookie,
        `Archived pack ${suffix}`,
        archivedSchool.id,
        grade.id,
        'Archived',
        [book.id],
      )
      const archivePack = await fetch(
        `${browseBaseUrl}/api/admin/packs/${archivedPack.id}/archive`,
        { method: 'POST', headers: { cookie } },
      )
      assert.equal(archivePack.status, 200)
      const archiveSchool = await fetch(
        `${browseBaseUrl}/api/admin/schools/${archivedSchool.id}/archive`,
        { method: 'POST', headers: { cookie } },
      )
      assert.equal(archiveSchool.status, 200)

      const response = await fetch(`${browseBaseUrl}${browseSchoolsPath()}`)
      assert.equal(response.status, 200)
      const body = (await response.json()) as BrowseNamed[]
      assert.ok(body.some((row) => row.id === liveSchool.id && row.name === liveSchool.name))
      assert.equal(
        body.some((row) => row.id === archivedSchool.id),
        false,
      )
      for (const row of body) {
        assert.deepEqual(Object.keys(row).sort(), ['id', 'name'])
      }
    })

    it('omits a live school whose only pack is archived', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-only-archived-pack`
      const school = await createNamed(cookie, 'schools', `Only archived pack ${suffix}`)
      const grade = await createNamed(cookie, 'grades', `Only archived pack grade ${suffix}`)
      const book = await createBookRow(cookie, `Only archived pack book ${suffix}`, 1100)
      const pack = await createPackRow(
        cookie,
        `Only archived pack ${suffix}`,
        school.id,
        grade.id,
        'Will archive',
        [book.id],
      )
      const archive = await fetch(`${browseBaseUrl}/api/admin/packs/${pack.id}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(archive.status, 200)

      const response = await fetch(`${browseBaseUrl}${browseSchoolsPath()}`)
      assert.equal(response.status, 200)
      const body = (await response.json()) as BrowseNamed[]
      assert.equal(
        body.some((row) => row.id === school.id),
        false,
      )
    })

    it('omits a live school whose only live pack sits on an archived grade', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-archived-grade`
      const school = await createNamed(cookie, 'schools', `Archived grade school ${suffix}`)
      const grade = await createNamed(cookie, 'grades', `Archived grade ${suffix}`)
      const book = await createBookRow(cookie, `Archived grade book ${suffix}`, 1200)
      await createPackRow(
        cookie,
        `Archived grade pack ${suffix}`,
        school.id,
        grade.id,
        'Live pack on archived grade',
        [book.id],
      )
      const archiveGrade = await fetch(`${browseBaseUrl}/api/admin/grades/${grade.id}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(archiveGrade.status, 200)

      const schools = await fetch(`${browseBaseUrl}${browseSchoolsPath()}`)
      assert.equal(schools.status, 200)
      const schoolBody = (await schools.json()) as BrowseNamed[]
      assert.equal(
        schoolBody.some((row) => row.id === school.id),
        false,
      )

      const grades = await fetch(`${browseBaseUrl}${browseGradesPath(school.id)}`)
      assert.equal(grades.status, 200)
      const gradeBody = (await grades.json()) as BrowseNamed[]
      assert.equal(
        gradeBody.some((row) => row.id === grade.id),
        false,
      )

      const packs = await fetch(`${browseBaseUrl}${browsePacksPath(school.id, grade.id)}`)
      assert.equal(packs.status, 200)
      assert.deepEqual(await packs.json(), [])
    })

    it('sends cache-control no-store on every browse GET', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-cache`
      const school = await createNamed(cookie, 'schools', `Cache school ${suffix}`)
      const grade = await createNamed(cookie, 'grades', `Cache grade ${suffix}`)
      const book = await createBookRow(cookie, `Cache book ${suffix}`, 1300)
      await createPackRow(cookie, `Cache pack ${suffix}`, school.id, grade.id, 'Cache', [book.id])
      await createItemRow(cookie, `Cache item ${suffix}`, 'Cache item', 1400)

      const paths = [
        browseSchoolsPath(),
        browseGradesPath(school.id),
        browsePacksPath(school.id, grade.id),
        browseItemsPath(),
      ]
      for (const pathSuffix of paths) {
        const response = await fetch(`${browseBaseUrl}${pathSuffix}`)
        assert.equal(response.status, 200)
        assert.equal(response.headers.get('cache-control'), 'no-store')
        await response.json()
      }
    })

    it('lists grades with a live pack for the school and rejects a non-integer schoolId', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-grades`
      const school = await createNamed(cookie, 'schools', `Grade school ${suffix}`)
      const otherSchool = await createNamed(cookie, 'schools', `Other school ${suffix}`)
      const liveGrade = await createNamed(cookie, 'grades', `Live grade ${suffix}`)
      const unusedGrade = await createNamed(cookie, 'grades', `Unused grade ${suffix}`)
      const book = await createBookRow(cookie, `Grade book ${suffix}`, 2000)
      await createPackRow(
        cookie,
        `Grade pack ${suffix}`,
        school.id,
        liveGrade.id,
        'For grade',
        [book.id],
      )
      await createPackRow(
        cookie,
        `Other pack ${suffix}`,
        otherSchool.id,
        unusedGrade.id,
        'Other school only',
        [book.id],
      )

      const response = await fetch(`${browseBaseUrl}${browseGradesPath(school.id)}`)
      assert.equal(response.status, 200)
      const body = (await response.json()) as BrowseNamed[]
      assert.deepEqual(
        body.filter((row) => row.id === liveGrade.id || row.id === unusedGrade.id),
        [{ id: liveGrade.id, name: liveGrade.name }],
      )

      const unknown = await fetch(`${browseBaseUrl}${browseGradesPath(99999)}`)
      assert.equal(unknown.status, 200)
      assert.deepEqual(await unknown.json(), [])

      const bad = await fetch(`${browseBaseUrl}/api/browse/grades?schoolId=abc`)
      assert.equal(bad.status, 400)
      const badBody = (await bad.json()) as { error: { code: string; field?: string } }
      assert.equal(badBody.error.code, 'invalid_input')
      assert.equal(badBody.error.field, 'schoolId')
    })

    it('lists live packs with a price that omits archived books and no books array', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-packs`
      const school = await createNamed(cookie, 'schools', `Pack school ${suffix}`)
      const grade = await createNamed(cookie, 'grades', `Pack grade ${suffix}`)
      const liveBook = await createBookRow(cookie, `Live book ${suffix}`, 5000)
      const archivedBook = await createBookRow(cookie, `Archived book ${suffix}`, 4320)
      const livePack = await createPackRow(
        cookie,
        `Browse pack ${suffix}`,
        school.id,
        grade.id,
        'Pack description',
        [liveBook.id, archivedBook.id],
      )
      const archivedPack = await createPackRow(
        cookie,
        `Hidden pack ${suffix}`,
        school.id,
        grade.id,
        'Should hide',
        [liveBook.id],
      )
      const archiveBook = await fetch(
        `${browseBaseUrl}/api/admin/books/${archivedBook.id}/archive`,
        { method: 'POST', headers: { cookie } },
      )
      assert.equal(archiveBook.status, 200)
      const archivePack = await fetch(
        `${browseBaseUrl}/api/admin/packs/${archivedPack.id}/archive`,
        { method: 'POST', headers: { cookie } },
      )
      assert.equal(archivePack.status, 200)

      const response = await fetch(`${browseBaseUrl}${browsePacksPath(school.id, grade.id)}`)
      assert.equal(response.status, 200)
      const body = (await response.json()) as BrowsePack[]
      const found = body.find((row) => row.id === livePack.id)
      assert.ok(found)
      assert.equal(found.name, livePack.name)
      assert.equal(found.description, 'Pack description')
      assert.equal(found.price, 5000)
      assert.equal(formatRupees(found.price), 'Rs. 5,000')
      assert.equal('books' in found, false)
      assert.deepEqual(Object.keys(found).sort(), ['description', 'id', 'name', 'price'])
      assert.equal(
        body.some((row) => row.id === archivedPack.id),
        false,
      )

      const badSchool = await fetch(
        `${browseBaseUrl}/api/browse/packs?schoolId=1.5&gradeId=${grade.id}`,
      )
      assert.equal(badSchool.status, 400)
      const badSchoolBody = (await badSchool.json()) as { error: { code: string; field?: string } }
      assert.equal(badSchoolBody.error.code, 'invalid_input')
      assert.equal(badSchoolBody.error.field, 'schoolId')

      const badGrade = await fetch(
        `${browseBaseUrl}/api/browse/packs?schoolId=${school.id}&gradeId=nope`,
      )
      assert.equal(badGrade.status, 400)
      const badGradeBody = (await badGrade.json()) as { error: { code: string; field?: string } }
      assert.equal(badGradeBody.error.code, 'invalid_input')
      assert.equal(badGradeBody.error.field, 'gradeId')

      const unknown = await fetch(`${browseBaseUrl}${browsePacksPath(99999, 99999)}`)
      assert.equal(unknown.status, 200)
      assert.deepEqual(await unknown.json(), [])
    })

    it('lists live items only', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-items`
      const live = await createItemRow(cookie, `Live item ${suffix}`, 'Available', 9320)
      const archived = await createItemRow(cookie, `Archived item ${suffix}`, 'Hidden', 100)
      const archive = await fetch(`${browseBaseUrl}/api/admin/items/${archived.id}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(archive.status, 200)

      const response = await fetch(`${browseBaseUrl}${browseItemsPath()}`)
      assert.equal(response.status, 200)
      const body = (await response.json()) as BrowseItem[]
      const found = body.find((row) => row.id === live.id)
      assert.ok(found)
      assert.equal(found.title, live.title)
      assert.equal(found.description, 'Available')
      assert.equal(found.price, 9320)
      assert.deepEqual(Object.keys(found).sort(), ['description', 'id', 'price', 'title'])
      assert.equal(
        body.some((row) => row.id === archived.id),
        false,
      )
    })

    it('returns the same browse bodies for anonymous and parent cookies', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-auth`
      const school = await createNamed(cookie, 'schools', `Auth school ${suffix}`)
      const grade = await createNamed(cookie, 'grades', `Auth grade ${suffix}`)
      const book = await createBookRow(cookie, `Auth book ${suffix}`, 3000)
      await createPackRow(cookie, `Auth pack ${suffix}`, school.id, grade.id, 'Auth', [book.id])
      await createItemRow(cookie, `Auth item ${suffix}`, 'Auth item', 400)

      const paths = [
        browseSchoolsPath(),
        browseGradesPath(school.id),
        browsePacksPath(school.id, grade.id),
        browseItemsPath(),
      ]
      for (const pathSuffix of paths) {
        const anonymous = await fetch(`${browseBaseUrl}${pathSuffix}`)
        const asParent = await fetch(`${browseBaseUrl}${pathSuffix}`, {
          headers: { cookie: parentCookie },
        })
        assert.equal(anonymous.status, 200)
        assert.equal(asParent.status, 200)
        assert.deepEqual(await anonymous.json(), await asParent.json())
      }
    })

    it('keeps admin pack list gated without a cookie', async () => {
      const response = await fetch(`${browseBaseUrl}/api/admin/packs`)
      assert.equal(response.status, 401)
      const body = (await response.json()) as { error: { code: string } }
      assert.equal(body.error.code, 'unauthenticated')
    })

    it('maps browse helpers and keeps Items free of admin calls', async () => {
      assert.equal(browseSchoolsPath(), '/api/browse/schools')
      assert.equal(browseGradesPath(4), '/api/browse/grades?schoolId=4')
      assert.equal(browsePacksPath(4, 7), '/api/browse/packs?schoolId=4&gradeId=7')
      assert.equal(browseItemsPath(), '/api/browse/items')

      const browsePage = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'BrowsePage.tsx'),
        'utf8',
      )
      const itemsPage = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'ItemsPage.tsx'),
        'utf8',
      )
      const shell = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'Shell.tsx'),
        'utf8',
      )
      const storefrontApp = await readFile(storefrontAppPath, 'utf8')
      const http = await readFile(path.join(serverRoot, 'catalog', 'http.ts'), 'utf8')
      const packsModule = await readFile(path.join(serverRoot, 'catalog', 'packs.ts'), 'utf8')
      const itemsModule = await readFile(path.join(serverRoot, 'catalog', 'items.ts'), 'utf8')

      assert.match(storefrontApp, /import \{ BrowsePage \} from '\.\/BrowsePage'/)
      assert.match(storefrontApp, /import \{ ItemsPage \} from '\.\/ItemsPage'/)
      assert.match(storefrontApp, /element=\{<BrowsePage \/>\}/)
      assert.match(storefrontApp, /path="items" element=\{<ItemsPage \/>\}/)
      assert.match(browsePage, /Browse/)
      assert.match(browsePage, /we are working on this now/)
      assert.match(browsePage, /formatRupees\(pack\.price\)/)
      assert.match(browsePage, /to="\/items"/)
      assert.match(browsePage, />Items</)
      assert.doesNotMatch(browsePage, /Add/)
      assert.doesNotMatch(browsePage, /\/api\/admin\//)
      assert.doesNotMatch(browsePage, /to=\{`?\/packs/)
      assert.match(itemsPage, /we are working on this now/)
      assert.match(itemsPage, /formatRupees\(item\.price\)/)
      assert.match(itemsPage, /to="\/"/)
      assert.match(itemsPage, />Packs</)
      assert.match(itemsPage, /\/api\/cart\/items/)
      assert.doesNotMatch(itemsPage, /\/api\/admin\//)
      assert.match(shell, /pathname === '\/items'/)
      assert.equal((shell.match(/label: 'Browse'/g) ?? []).length, 1)
      assert.match(http, /mountBrowse/)
      const browseStart = http.indexOf('function mountBrowse')
      const browseEnd = http.indexOf('export function createCatalogRouter')
      assert.ok(browseStart >= 0 && browseEnd > browseStart)
      const browseBlock = http.slice(browseStart, browseEnd)
      assert.doesNotMatch(browseBlock, /lookupSession/)
      assert.doesNotMatch(http, /db\.prepare/)
      assert.match(packsModule, /listBrowseSchools/)
      assert.match(packsModule, /listBrowseGrades/)
      assert.match(packsModule, /listBrowsePacks/)
      assert.match(packsModule, /toStorefrontPack/)
      assert.match(itemsModule, /listBrowseItems/)
      assert.match(itemsModule, /listItems/)
    })
  })

  describe('Configure a pack', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let parentCookie: string

    const parentReg = {
      name: 'Nimali Perera',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '0771234567',
      email: 'nimali.pack@example.com',
      password: 'evening-order',
    }

    type NamedJson = { id: number; name: string; archivedAt: string | null }
    type BookJson = { id: number; title: string; price: number; archivedAt: string | null }
    type PackJson = { id: number; name: string; description: string; archivedAt: string | null }
    type DetailBook = { id: number; title: string; price: number }
    type DetailLine = {
      bookId: number
      title: string
      unitPrice: number
      quantity: number
      lineTotal: number
    }
    type PackDetail = {
      id: number
      name: string
      description: string
      books: DetailBook[]
      lines: DetailLine[]
      total: number
    }
    type ErrorBody = { error: { code: string; message: string; field?: string } }

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${packBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function createNamed(
      cookie: string,
      resourcePath: 'schools' | 'grades',
      name: string,
    ): Promise<NamedJson> {
      const response = await fetch(`${packBaseUrl}/api/admin/${resourcePath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(catalogNameBody(name)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as NamedJson
    }

    async function createBookRow(cookie: string, title: string, price: number): Promise<BookJson> {
      const response = await fetch(`${packBaseUrl}/api/admin/books`, {
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
      const response = await fetch(`${packBaseUrl}/api/admin/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(packCreateBody(name, schoolId, gradeId, description, bookIds)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as PackJson
    }

    async function archiveRow(
      cookie: string,
      resourcePath: 'schools' | 'grades' | 'books' | 'packs',
      id: number,
    ): Promise<void> {
      const response = await fetch(`${packBaseUrl}/api/admin/${resourcePath}/${id}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(response.status, 200)
    }

    async function seedPack(
      cookie: string,
      suffix: string,
      prices: number[],
    ): Promise<{ school: NamedJson; grade: NamedJson; books: BookJson[]; pack: PackJson }> {
      const school = await createNamed(cookie, 'schools', `Pack school ${suffix}`)
      const grade = await createNamed(cookie, 'grades', `Pack grade ${suffix}`)
      const books: BookJson[] = []
      for (let index = 0; index < prices.length; index += 1) {
        books.push(await createBookRow(cookie, `Book ${index + 1} ${suffix}`, prices[index]))
      }
      const pack = await createPackRow(
        cookie,
        `Pack ${suffix}`,
        school.id,
        grade.id,
        `Pack ${suffix} description`,
        books.map((book) => book.id),
      )
      return { school, grade, books, pack }
    }

    function expectedLine(book: BookJson, quantity: number): DetailLine {
      return {
        bookId: book.id,
        title: book.title,
        unitPrice: book.price,
        quantity,
        lineTotal: book.price * quantity,
      }
    }

    async function errorFor(url: string): Promise<ErrorBody['error']> {
      const response = await fetch(url)
      assert.equal(response.status, 400)
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, 'invalid_input')
      return body.error
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-pack-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, PACK_PORT)
      child = started.child
      const registered = await fetch(`${packBaseUrl}/api/parents`, {
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

    it('ticks every live member at quantity 1 and sums the total', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-default`
      const { books, pack } = await seedPack(cookie, suffix, [2250, 900, 1200])

      const response = await fetch(`${packBaseUrl}${browsePackPath(pack.id)}`)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as PackDetail
      assert.deepEqual(
        Object.keys(body).sort(),
        ['books', 'description', 'id', 'lines', 'name', 'total'],
      )
      assert.equal(body.id, pack.id)
      assert.equal(body.name, pack.name)
      assert.equal(body.description, `Pack ${suffix} description`)
      assert.deepEqual(
        body.books,
        books.map((book) => ({ id: book.id, title: book.title, price: book.price })),
      )
      assert.deepEqual(
        body.lines,
        books.map((book) => expectedLine(book, 1)),
      )
      assert.equal(body.total, 4350)
      assert.equal(formatRupees(body.total), 'Rs. 4,350')
    })

    it('drops an archived member from books, lines, and the total', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-archived-member`
      const { books, pack } = await seedPack(cookie, suffix, [5000, 4320])
      await archiveRow(cookie, 'books', books[1].id)

      const response = await fetch(`${packBaseUrl}${browsePackPath(pack.id)}`)
      assert.equal(response.status, 200)
      const body = (await response.json()) as PackDetail
      assert.deepEqual(body.books, [
        { id: books[0].id, title: books[0].title, price: books[0].price },
      ])
      assert.deepEqual(body.lines, [expectedLine(books[0], 1)])
      assert.equal(body.total, 5000)
    })

    it('prices a selection and still lists every live member', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-selection`
      const { books, pack } = await seedPack(cookie, suffix, [2250, 900, 1200])
      const selection = `${books[0].id}:2,${books[2].id}:1`

      const response = await fetch(`${packBaseUrl}${browsePackPath(pack.id)}?selection=${selection}`)
      assert.equal(response.status, 200)
      const body = (await response.json()) as PackDetail
      assert.deepEqual(
        body.books,
        books.map((book) => ({ id: book.id, title: book.title, price: book.price })),
      )
      assert.deepEqual(body.lines, [expectedLine(books[0], 2), expectedLine(books[2], 1)])
      assert.equal(body.total, 2250 * 2 + 1200)
    })

    it('refuses a quantity above the cap with the verbatim sentence', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-cap`
      const { books, pack } = await seedPack(cookie, suffix, [2250])

      const capped = await errorFor(
        `${packBaseUrl}${browsePackPath(pack.id)}?selection=${books[0].id}:21`,
      )
      assert.equal(capped.field, 'quantity')
      assert.equal(capped.message, 'Item count exeeded, you can only order 20 per item')

      const atCap = await fetch(
        `${packBaseUrl}${browsePackPath(pack.id)}?selection=${books[0].id}:20`,
      )
      assert.equal(atCap.status, 200)
      const body = (await atCap.json()) as PackDetail
      assert.deepEqual(body.lines, [expectedLine(books[0], 20)])
      assert.equal(body.total, 45000)
    })

    it('refuses an empty selection with the locked-title sentence', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-empty-selection`
      const { pack } = await seedPack(cookie, suffix, [2250, 900])

      const error = await errorFor(`${packBaseUrl}${browsePackPath(pack.id)}?selection=`)
      assert.equal(error.field, 'selection')
      assert.equal(error.message, 'Keep at least one book to add this pack.')
    })

    it('refuses a below-range, malformed, duplicate, or non-member selection', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-invalid-selection`
      const { books, pack, school, grade } = await seedPack(cookie, suffix, [2250, 900])
      const archived = await createBookRow(cookie, `Archived member ${suffix}`, 400)
      const withArchived = await createPackRow(
        cookie,
        `Pack with archived ${suffix}`,
        school.id,
        grade.id,
        'Has an archived member',
        [books[0].id, archived.id],
      )
      await archiveRow(cookie, 'books', archived.id)

      const detailPath = `${packBaseUrl}${browsePackPath(pack.id)}`
      const belowRange = await errorFor(`${detailPath}?selection=${books[0].id}:0`)
      assert.equal(belowRange.field, 'quantity')

      const malformed = await errorFor(`${detailPath}?selection=abc`)
      assert.equal(malformed.field, 'selection')

      const duplicate = await errorFor(
        `${detailPath}?selection=${books[0].id}:1,${books[0].id}:2`,
      )
      assert.equal(duplicate.field, 'selection')

      const notAMember = await errorFor(`${detailPath}?selection=999999:1`)
      assert.equal(notAMember.field, 'selection')

      const repeated = await errorFor(
        `${detailPath}?selection=${books[0].id}:2&selection=${books[1].id}:1`,
      )
      assert.equal(repeated.field, 'selection')

      const archivedMember = await errorFor(
        `${packBaseUrl}${browsePackPath(withArchived.id)}?selection=${archived.id}:1`,
      )
      assert.equal(archivedMember.field, 'selection')
    })

    it('answers 404 for an unknown, archived, or non-integer pack', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-missing`
      const archivedPack = await seedPack(cookie, `${suffix}-pack`, [1000])
      await archiveRow(cookie, 'packs', archivedPack.pack.id)
      const archivedSchool = await seedPack(cookie, `${suffix}-school`, [1000])
      await archiveRow(cookie, 'schools', archivedSchool.school.id)
      const archivedGrade = await seedPack(cookie, `${suffix}-grade`, [1000])
      await archiveRow(cookie, 'grades', archivedGrade.grade.id)

      const urls = [
        `${packBaseUrl}${browsePackPath(99999)}`,
        `${packBaseUrl}${browsePackPath(archivedPack.pack.id)}`,
        `${packBaseUrl}${browsePackPath(archivedSchool.pack.id)}`,
        `${packBaseUrl}${browsePackPath(archivedGrade.pack.id)}`,
        `${packBaseUrl}/api/browse/packs/abc`,
        `${packBaseUrl}/api/browse/packs/1.5`,
      ]
      for (const url of urls) {
        const response = await fetch(url)
        assert.equal(response.status, 404, url)
        const body = (await response.json()) as ErrorBody
        assert.equal(body.error.code, 'not_found')
      }
    })

    it('returns an empty configuration when every member is archived', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-all-archived`
      const { books, pack } = await seedPack(cookie, suffix, [1000, 2000])
      for (const book of books) await archiveRow(cookie, 'books', book.id)

      const response = await fetch(`${packBaseUrl}${browsePackPath(pack.id)}`)
      assert.equal(response.status, 200)
      const body = (await response.json()) as PackDetail
      assert.deepEqual(body.books, [])
      assert.deepEqual(body.lines, [])
      assert.equal(body.total, 0)
    })

    it('returns the same body for an anonymous and a parent cookie', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-auth`
      const { books, pack } = await seedPack(cookie, suffix, [2250, 900])
      const urls = [
        `${packBaseUrl}${browsePackPath(pack.id)}`,
        `${packBaseUrl}${browsePackPath(pack.id)}?selection=${books[1].id}:3`,
      ]
      for (const url of urls) {
        const anonymous = await fetch(url)
        const asParent = await fetch(url, { headers: { cookie: parentCookie } })
        assert.equal(anonymous.status, 200)
        assert.equal(asParent.status, 200)
        assert.deepEqual(await anonymous.json(), await asParent.json())
      }
    })

    it('keeps the admin pack catalog gated without a cookie', async () => {
      const response = await fetch(`${packBaseUrl}/api/admin/packs`)
      assert.equal(response.status, 401)
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, 'unauthenticated')
    })

    it('ticks every book at 1 on load and prices what the shopper configures', () => {
      const books = [
        { id: 3, title: 'Atlas', price: 2250 },
        { id: 7, title: 'Maths', price: 900 },
        { id: 9, title: 'Reader', price: 1200 },
      ]
      const detail = {
        id: 4,
        name: 'Grade 5',
        description: 'Grade 5 pack',
        books,
        lines: books.map((book) => ({
          bookId: book.id,
          title: book.title,
          unitPrice: book.price,
          quantity: 1,
          lineTotal: book.price,
        })),
        total: 4350,
      }
      const loaded = initialChoices(detail)
      const linesOf = (choices: typeof loaded): Array<[number, number, number]> =>
        configuredLines(books, choices).map((line) => [line.book.id, line.quantity, line.lineTotal])

      assert.deepEqual(linesOf(loaded), [
        [3, 1, 2250],
        [7, 1, 900],
        [9, 1, 1200],
      ])
      assert.equal(runningTotal(configuredLines(books, loaded)), 4350)

      const unticked = toggleChoice(loaded, 7)
      assert.deepEqual(linesOf(unticked), [
        [3, 1, 2250],
        [9, 1, 1200],
      ])
      assert.equal(runningTotal(configuredLines(books, unticked)), 3450)

      const decremented = decreaseChoice(loaded, 3)
      assert.deepEqual(linesOf(decremented), [
        [7, 1, 900],
        [9, 1, 1200],
      ])
      assert.equal(runningTotal(configuredLines(books, decremented)), 2100)

      const onlyOne = toggleChoice(toggleChoice(loaded, 7), 9)
      assert.deepEqual(linesOf(onlyOne), [[3, 1, 2250]])
      assert.equal(lockedBookId(configuredLines(books, onlyOne)), 3)
      assert.deepEqual(toggleChoice(onlyOne, 3), onlyOne)
      assert.deepEqual(decreaseChoice(onlyOne, 3), onlyOne)

      let capped = onlyOne
      for (let press = 0; press < 25; press += 1) capped = increaseChoice(capped, 3)
      assert.deepEqual(linesOf(capped), [[3, 20, 45000]])
      assert.equal(runningTotal(configuredLines(books, capped)), 45000)

      const stepped = increaseChoice(increaseChoice(loaded, 7), 7)
      assert.deepEqual(linesOf(stepped), [
        [3, 1, 2250],
        [7, 3, 2700],
        [9, 1, 1200],
      ])
      assert.equal(runningTotal(configuredLines(books, stepped)), 6150)
      assert.equal(formatRupees(runningTotal(configuredLines(books, stepped))), 'Rs. 6,150')
      assert.equal(lockedBookId(configuredLines(books, stepped)), undefined)
    })

    it('keeps Browse lit on the pack screen and nowhere it does not belong', () => {
      assert.equal(browseActive('/', true, '/'), true)
      assert.equal(browseActive('/items', false, '/'), true)
      assert.equal(browseActive('/packs/5', false, '/'), true)
      assert.equal(browseActive('/cart', false, '/'), false)
      assert.equal(browseActive('/packs/5', false, '/cart'), false)
      assert.equal(browseActive('/cart', true, '/cart'), true)
    })

    it('keeps the rules in the catalog module and the screen free of per-change fetches', async () => {
      assert.equal(browsePackPath(4), '/api/browse/packs/4')
      assert.equal(packRoutePath(4), '/packs/4')

      const packPage = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'PackPage.tsx'),
        'utf8',
      )
      const browsePage = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'BrowsePage.tsx'),
        'utf8',
      )
      const shell = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'Shell.tsx'),
        'utf8',
      )
      const storefrontApp = await readFile(storefrontAppPath, 'utf8')
      const http = await readFile(path.join(serverRoot, 'catalog', 'http.ts'), 'utf8')
      const packsModule = await readFile(path.join(serverRoot, 'catalog', 'packs.ts'), 'utf8')
      const baseCss = await readFile(baseCssPath, 'utf8')
      const tokens = await readFile(tokensPath, 'utf8')

      assert.match(packPage, /browsePackPath\(/)
      assert.equal((packPage.match(/fetch\(/g) ?? []).length, 2)
      assert.match(packPage, /selection/)
      assert.match(packPage, /Add to cart/)
      assert.doesNotMatch(packPage, /\/api\/admin\//)
      assert.match(packPage, /Keep at least one book to add this pack\./)
      assert.match(packPage, /Item count exeeded, you can only order 20 per item/)
      assert.match(packPage, /we are working on this now/)
      assert.match(packPage, /formatRupees\(/)
      assert.match(packPage, /Number\.isSafeInteger/)
      assert.match(packPage, /aria-live="polite"/)
      assert.equal((packPage.match(/aria-describedby=/g) ?? []).length, 3)

      assert.match(storefrontApp, /path="packs\/:id" element=\{<PackPage \/>\}/)
      const gated = storefrontApp.match(/<Route element=\{<AuthGate \/>\}>([\s\S]*?)<\/Route>/)?.[1]
      assert.ok(gated)
      assert.doesNotMatch(gated, /packs/)
      assert.equal((shell.match(/label: 'Browse'/g) ?? []).length, 1)
      assert.match(browsePage, /packRoutePath\(pack\.id\)/)

      const browseStart = http.indexOf('function mountBrowse')
      const browseEnd = http.indexOf('export function createCatalogRouter')
      assert.ok(browseStart >= 0 && browseEnd > browseStart)
      const browseBlock = http.slice(browseStart, browseEnd)
      assert.match(browseBlock, /'\/browse\/packs\/:id'/)
      assert.doesNotMatch(browseBlock, /lookupSession/)
      assert.doesNotMatch(http, /db\.prepare/)
      assert.doesNotMatch(http, /Item count exeeded/)
      assert.match(packsModule, /export function getBrowsePack/)
      assert.match(packsModule, /export function configureBrowsePack/)
      assert.match(packsModule, /Item count exeeded, you can only order 20 per item/)
      assert.match(packsModule, /Keep at least one book to add this pack\./)

      assert.equal(cssCustomProperty(tokens, 'space-pack-rail-w', 'root'), '288px')

      const totalBar = cssRule(baseCss, '.pack-summary')
      assert.match(totalBar, /position:\s*fixed/)
      assert.match(
        totalBar,
        /bottom:\s*calc\(var\(--space-tabbar-h\)\s*\+\s*env\(safe-area-inset-bottom/,
      )
      assert.match(totalBar, /background:\s*var\(--color-text-primary\)/)
      assert.match(totalBar, /color:\s*var\(--color-text-secondary-dark\)/)
      assert.doesNotMatch(totalBar, /surface-sunken/)
      assert.match(
        cssRule(baseCss, "[data-theme='dark'] .pack-summary"),
        /background:\s*var\(--color-surface-raised-dark\)/,
      )
      assert.match(
        cssRule(baseCss, '.pack-summary-label'),
        /color:\s*var\(--color-text-secondary-dark\)/,
      )
      assert.match(
        cssRule(baseCss, '.pack-summary-total'),
        /color:\s*var\(--color-text-primary-dark\)/,
      )
      assert.match(cssRule(baseCss, '.pack-summary', 1), /var\(--space-pack-rail-w\)/)
      assert.match(
        baseCss,
        /@media \(min-width: 760px\)[\s\S]*\.pack-summary\s*\{[\s\S]*?var\(--space-pack-rail-w\)/,
      )

      const row = cssRule(baseCss, '.pack-row')
      assert.match(row, /border-radius:\s*var\(--radius-md\)/)
      assert.match(cssRule(baseCss, '.pack-row.is-off'), /dashed/)
      assert.match(cssRule(baseCss, '.pack-row.is-off .pack-row-title'), /line-through/)
      const lockedRow = cssRule(baseCss, '.pack-row.is-locked')
      assert.match(lockedRow, /background:\s*var\(--color-accent-quiet\)/)
      assert.match(lockedRow, /var\(--space-edge-strong\) solid var\(--color-border-strong\)/)

      const checkbox = cssRule(baseCss, '.pack-check-box')
      assert.match(checkbox, /appearance:\s*none/)
      assert.match(checkbox, /background:\s*var\(--color-surface-base\)/)
      assert.match(checkbox, /border:\s*var\(--space-edge-strong\) solid var\(--color-border-strong\)/)
      assert.match(checkbox, /border-radius:\s*var\(--radius-sm\)/)
      assert.doesNotMatch(checkbox, /accent-color/)
      assert.match(
        cssRule(baseCss, '.pack-check-box:checked'),
        /background:\s*var\(--color-accent-primary\)/,
      )
      assert.match(cssRule(baseCss, '.pack-check-box::after'), /var\(--color-text-on-accent\)/)
      assert.match(cssRule(baseCss, '.pack-check-box:disabled'), /opacity:\s*1/)

      const notice = cssRule(baseCss, '.pack-row-notice')
      assert.match(notice, /background:\s*var\(--color-surface-raised\)/)
      assert.match(notice, /border:\s*var\(--space-edge-hairline\) solid var\(--color-border-strong\)/)
      assert.match(notice, /border-radius:\s*var\(--radius-default\)/)
      assert.doesNotMatch(notice, /warn-tint/)

      const stepper = cssRule(baseCss, '.pack-stepper')
      assert.match(stepper, /background:\s*var\(--color-surface-raised\)/)
      assert.match(stepper, /border:\s*var\(--space-edge-hairline\) solid var\(--color-border-default\)/)
      assert.doesNotMatch(stepper, /overflow:\s*hidden/)
      const stepperEnd = cssRule(baseCss, '.pack-stepper-end')
      assert.match(stepperEnd, /min-width:\s*var\(--space-touch-min\)/)
      assert.match(stepperEnd, /min-height:\s*var\(--space-control-h\)/)
      const stepperDisabled = cssRule(baseCss, '.pack-stepper-end:disabled')
      assert.match(stepperDisabled, /background:\s*var\(--color-surface-sunken\)/)
      assert.match(stepperDisabled, /color:\s*var\(--color-text-secondary\)/)
      assert.match(stepperDisabled, /opacity:\s*1/)
      assert.match(cssRule(baseCss, '.pack-stepper-end:focus-visible'), /z-index/)
      assert.match(
        cssRule(baseCss, '.pack-stepper-value'),
        /background:\s*var\(--color-accent-quiet\)/,
      )
    })
  })

  describe('Add a configured pack to the cart', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let parentCookie: string
    let parentBCookie: string

    const parentReg = {
      name: 'Nimali Perera',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '0771234567',
      email: 'nimali.cart@example.com',
      password: 'evening-order',
    }

    const parentBReg = {
      name: 'Kasun Silva',
      deliveryAddress: '8 Lake Road, Kandy',
      whatsapp: '0777654321',
      email: 'kasun.cart@example.com',
      password: 'evening-order',
    }

    type NamedJson = { id: number; name: string; archivedAt: string | null }
    type BookJson = { id: number; title: string; price: number; archivedAt: string | null }
    type PackJson = { id: number; name: string; description: string; archivedAt: string | null }
    type CartLineJson = {
      id: number
      packId: number
      sequence: number
      gradeName: string
      label: string
    }
    type ErrorBody = { error: { code: string; message: string; field?: string } }

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${cartBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function createNamed(
      cookie: string,
      resourcePath: 'schools' | 'grades',
      name: string,
    ): Promise<NamedJson> {
      const response = await fetch(`${cartBaseUrl}/api/admin/${resourcePath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(catalogNameBody(name)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as NamedJson
    }

    async function createBookRow(cookie: string, title: string, price: number): Promise<BookJson> {
      const response = await fetch(`${cartBaseUrl}/api/admin/books`, {
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
      const response = await fetch(`${cartBaseUrl}/api/admin/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(packCreateBody(name, schoolId, gradeId, description, bookIds)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as PackJson
    }

    async function archiveRow(
      cookie: string,
      resourcePath: 'schools' | 'grades' | 'books' | 'packs',
      id: number,
    ): Promise<void> {
      const response = await fetch(`${cartBaseUrl}/api/admin/${resourcePath}/${id}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(response.status, 200)
    }

    async function seedGrade5Pack(
      cookie: string,
      suffix: string,
      prices: number[],
    ): Promise<{ school: NamedJson; grade: NamedJson; books: BookJson[]; pack: PackJson }> {
      const school = await createNamed(cookie, 'schools', `Cart school ${suffix}`)
      const grade = await createNamed(cookie, 'grades', 'Grade 5')
      const books: BookJson[] = []
      for (let index = 0; index < prices.length; index += 1) {
        books.push(await createBookRow(cookie, `Cart book ${index + 1} ${suffix}`, prices[index]))
      }
      const pack = await createPackRow(
        cookie,
        `Cart pack ${suffix}`,
        school.id,
        grade.id,
        `Cart pack ${suffix} description`,
        books.map((book) => book.id),
      )
      return { school, grade, books, pack }
    }

    async function addPack(
      cookie: string | undefined,
      packId: number,
      selection: unknown,
    ): Promise<Response> {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (cookie) headers.cookie = cookie
      return fetch(`${cartBaseUrl}/api/cart/packs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ packId, selection }),
      })
    }

    async function listCart(cookie: string): Promise<{ status: number; lines: CartLineJson[] }> {
      const response = await fetch(`${cartBaseUrl}/api/cart`, {
        headers: { cookie },
      })
      if (response.status !== 200) return { status: response.status, lines: [] }
      const body = (await response.json()) as { lines: CartLineJson[] }
      return { status: response.status, lines: body.lines }
    }

    function membersInDb(lineId: number): Array<{
      book_id: number
      included: number
      quantity: number
      title: string
      unit_price: number
    }> {
      const db = new Database(dbPath, { readonly: true })
      try {
        return db
          .prepare(
            `SELECT book_id, included, quantity, title, unit_price
             FROM cart_pack_line_members
             WHERE line_id = ?
             ORDER BY book_id`,
          )
          .all(lineId) as Array<{
          book_id: number
          included: number
          quantity: number
          title: string
          unit_price: number
        }>
      } finally {
        db.close()
      }
    }

    function lineCountInDb(): number {
      const db = new Database(dbPath, { readonly: true })
      try {
        return (db.prepare('SELECT COUNT(*) AS n FROM cart_pack_lines').get() as { n: number }).n
      } finally {
        db.close()
      }
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-cart-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, CART_PORT)
      child = started.child
      const registered = await fetch(`${cartBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parentReg),
      })
      assert.equal(registered.status, 201)
      const cookie = sidCookie(registered.headers)
      assert.ok(cookie)
      parentCookie = cookieHeader(cookie)

      const registeredB = await fetch(`${cartBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parentBReg),
      })
      assert.equal(registeredB.status, 201)
      const cookieB = sidCookie(registeredB.headers)
      assert.ok(cookieB)
      parentBCookie = cookieHeader(cookieB)
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('clones the first add with sequence 1 and every live member', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-first`
      const { books, pack } = await seedGrade5Pack(cookie, suffix, [2250, 900, 1200])
      const selection = `${books[0].id}:2,${books[2].id}:1`

      const before = lineCountInDb()
      const response = await addPack(parentCookie, pack.id, selection)
      assert.equal(response.status, 201)
      const body = (await response.json()) as CartLineJson
      assert.equal(body.sequence, 1)
      assert.equal(body.gradeName, 'Grade 5')
      assert.equal(body.label, 'Pack 1 of Grade 5')
      assert.equal(body.packId, pack.id)
      assert.equal(lineCountInDb(), before + 1)

      const members = membersInDb(body.id)
      assert.equal(members.length, 3)
      assert.deepEqual(members, [
        {
          book_id: books[0].id,
          included: 1,
          quantity: 2,
          title: books[0].title,
          unit_price: books[0].price,
        },
        {
          book_id: books[1].id,
          included: 0,
          quantity: 1,
          title: books[1].title,
          unit_price: books[1].price,
        },
        {
          book_id: books[2].id,
          included: 1,
          quantity: 1,
          title: books[2].title,
          unit_price: books[2].price,
        },
      ])

      const patched = await fetch(`${cartBaseUrl}${booksItemPath(books[0].id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(bookBody(books[0].title, books[0].price + 500)),
      })
      assert.equal(patched.status, 200)
      const afterLivePriceChange = membersInDb(body.id)
      assert.deepEqual(afterLivePriceChange, members)
    })

    it('adds a second line without changing the first', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-repeat`
      const { books, pack } = await seedGrade5Pack(cookie, suffix, [2250, 900])
      const firstSelection = `${books[0].id}:1`
      const secondSelection = `${books[1].id}:3`

      const first = await addPack(parentCookie, pack.id, firstSelection)
      assert.equal(first.status, 201)
      const firstBody = (await first.json()) as CartLineJson

      const second = await addPack(parentCookie, pack.id, secondSelection)
      assert.equal(second.status, 201)
      const secondBody = (await second.json()) as CartLineJson
      assert.equal(secondBody.sequence, 2)
      assert.equal(secondBody.label, 'Pack 2 of Grade 5')

      const listed = await listCart(parentCookie)
      assert.equal(listed.status, 200)
      const forPack = listed.lines.filter((line) => line.packId === pack.id)
      assert.equal(forPack.length, 2)
      assert.deepEqual(
        forPack.map((line) => line.label),
        ['Pack 1 of Grade 5', 'Pack 2 of Grade 5'],
      )
      assert.equal(forPack[0].id, firstBody.id)
      assert.equal(forPack[1].id, secondBody.id)

      const firstMembers = membersInDb(firstBody.id)
      assert.equal(firstMembers.find((row) => row.book_id === books[0].id)?.included, 1)
      assert.equal(firstMembers.find((row) => row.book_id === books[1].id)?.included, 0)
    })

    it('refuses invalid configurations without inserting a row', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-invalid`
      const { books, pack } = await seedGrade5Pack(cookie, suffix, [2250, 900])
      const before = lineCountInDb()

      const cases: Array<{ selection: unknown; message: RegExp; field?: string }> = [
        {
          selection: `${books[0].id}:21`,
          message: /Item count exeeded, you can only order 20 per item/,
          field: 'quantity',
        },
        {
          selection: '',
          message: /Keep at least one book to add this pack\./,
          field: 'selection',
        },
        {
          selection: `${books[0].id}:1,${books[0].id}:2`,
          message: /Choose each book only once\./,
          field: 'selection',
        },
        {
          selection: '999999:1',
          message: /That book is not available\./,
          field: 'selection',
        },
        {
          selection: 'abc',
          message: /Choose books from this pack\./,
          field: 'selection',
        },
      ]

      for (const trial of cases) {
        const response = await addPack(parentCookie, pack.id, trial.selection)
        assert.equal(response.status, 400, String(trial.selection))
        const body = (await response.json()) as ErrorBody
        assert.equal(body.error.code, 'invalid_input')
        assert.match(body.error.message, trial.message)
        if (trial.field) assert.equal(body.error.field, trial.field)
      }
      assert.equal(lineCountInDb(), before)
    })

    it('answers 404 when the pack is not a live browse pack', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-missing`
      const archivedPack = await seedGrade5Pack(cookie, `${suffix}-pack`, [1000])
      await archiveRow(cookie, 'packs', archivedPack.pack.id)
      const archivedSchool = await seedGrade5Pack(cookie, `${suffix}-school`, [1000])
      await archiveRow(cookie, 'schools', archivedSchool.school.id)
      const archivedGrade = await seedGrade5Pack(cookie, `${suffix}-grade`, [1000])
      await archiveRow(cookie, 'grades', archivedGrade.grade.id)
      const before = lineCountInDb()

      const urls = [
        { packId: 99999, selection: '1:1' },
        { packId: archivedPack.pack.id, selection: `${archivedPack.books[0].id}:1` },
        { packId: archivedSchool.pack.id, selection: `${archivedSchool.books[0].id}:1` },
        { packId: archivedGrade.pack.id, selection: `${archivedGrade.books[0].id}:1` },
      ]
      for (const trial of urls) {
        const response = await addPack(parentCookie, trial.packId, trial.selection)
        assert.equal(response.status, 404, String(trial.packId))
        const body = (await response.json()) as ErrorBody
        assert.equal(body.error.code, 'not_found')
      }
      assert.equal(lineCountInDb(), before)
    })

    it('answers 401 without a parent cookie', async () => {
      const before = lineCountInDb()
      const response = await addPack(undefined, 1, '1:1')
      assert.equal(response.status, 401)
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, 'unauthenticated')
      assert.equal(body.error.message, 'Sign in to continue.')
      assert.equal(lineCountInDb(), before)

      const stale = await addPack('booklist.sid=not-a-session', 1, '1:1')
      assert.equal(stale.status, 401)
      const staleBody = (await stale.json()) as ErrorBody
      assert.equal(staleBody.error.code, 'unauthenticated')
      assert.equal(lineCountInDb(), before)
    })

    it('answers 403 for an admin session', async () => {
      const cookie = await signInAdmin()
      const before = lineCountInDb()
      const response = await addPack(cookie, 1, '1:1')
      assert.equal(response.status, 403)
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, 'forbidden')
      assert.equal(lineCountInDb(), before)

      const list = await fetch(`${cartBaseUrl}/api/cart`, { headers: { cookie } })
      assert.equal(list.status, 403)
    })

    it('lists only the signed-in parent lines', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-parent-b`
      const { books, pack } = await seedGrade5Pack(cookie, suffix, [1500])
      const selection = `${books[0].id}:1`

      const added = await addPack(parentCookie, pack.id, selection)
      assert.equal(added.status, 201)
      const forA = await listCart(parentCookie)
      const forB = await listCart(parentBCookie)
      assert.ok(forA.lines.some((line) => line.packId === pack.id))
      assert.equal(
        forB.lines.filter((line) => line.packId === pack.id).length,
        0,
      )
    })

    it('serializes ticked choices and keeps cart UI free of totals and remove', () => {
      const books = [
        { id: 3, title: 'Atlas', price: 2250 },
        { id: 7, title: 'Maths', price: 900 },
      ]
      const choices = {
        3: { ticked: true, quantity: 2 },
        7: { ticked: false, quantity: 1 },
      }
      assert.equal(selectionFromChoices(books, choices), '3:2')
    })

    it('keeps cart SQL in the domain module and wires Add, chips, and the badge', async () => {
      const packPage = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'PackPage.tsx'),
        'utf8',
      )
      const authGate = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'AuthGate.tsx'),
        'utf8',
      )
      const shell = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'Shell.tsx'),
        'utf8',
      )
      const cartPage = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'CartPage.tsx'),
        'utf8',
      )
      const storefrontApp = await readFile(storefrontAppPath, 'utf8')
      const api = await readFile(path.join(serverRoot, 'web', 'api.ts'), 'utf8')
      const cartHttp = await readFile(path.join(serverRoot, 'cart', 'http.ts'), 'utf8')
      const cartPacks = await readFile(path.join(serverRoot, 'cart', 'packs.ts'), 'utf8')
      const packsModule = await readFile(path.join(serverRoot, 'catalog', 'packs.ts'), 'utf8')
      const baseCss = await readFile(baseCssPath, 'utf8')
      const runMigrations = await readFile(
        path.join(serverRoot, 'db', 'migrations', 'run.ts'),
        'utf8',
      )

      assert.match(runMigrations, /007_cart_pack_lines\.sql/)
      assert.match(packsModule, /export function getBrowsePackGradeName/)
      assert.match(api, /createCartRouter/)
      assert.doesNotMatch(cartHttp, /db\.prepare/)
      assert.match(cartPacks, /INSERT INTO cart_pack_lines/)
      assert.match(cartPacks, /cart_pack_line_members/)
      assert.doesNotMatch(cartPacks, /FROM packs/)
      assert.doesNotMatch(cartPacks, /FROM books/)
      assert.doesNotMatch(cartPacks, /FROM grades/)

      assert.match(packPage, /\/api\/cart\/packs/)
      assert.match(packPage, /AuthSurface/)
      assert.match(packPage, /selectionFromChoices/)
      assert.match(packPage, /credentials: 'include'/)
      assert.equal(packPage.includes("navigate('/')"), false)

      assert.match(authGate, /export function AuthSurface/)
      assert.match(authGate, /navigate\('\/', \{ replace: true \}/)

      assert.match(storefrontApp, /element=\{<CartPage \/>\}/)
      assert.match(cartPage, /cart-line-chip/)
      // Story 3.3 adds Remove, the empty state, money and steppers to the Cart page.
      assert.match(cartPage, /Remove/)
      assert.match(cartPage, /Cart is Empty/)
      assert.match(cartPage, /formatRupees/)
      assert.match(cartPage, /stepper/)

      assert.match(shell, /nav-badge/)
      assert.match(shell, /useCartBadge/)
      assert.match(shell, /count < 1/)

      assert.match(cssRule(baseCss, '.cart-line-chip.is-first'), /var\(--color-text-primary\)/)
      assert.match(cssRule(baseCss, '.cart-line-chip.is-first'), /var\(--color-accent-primary\)/)
      assert.match(cssRule(baseCss, '.cart-line-chip.is-later'), /var\(--color-accent-primary\)/)
      assert.match(cssRule(baseCss, '.cart-line-chip.is-later'), /var\(--color-focus-ring\)/)
      assert.match(cssRule(baseCss, '.cart-line-chip.is-later'), /var\(--color-border-strong\)/)
    })
  })

  describe('Add individual items to the same cart', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let parentCookie: string
    let parentBCookie: string

    const parentReg = {
      name: 'Nimali Items',
      deliveryAddress: '12 Temple Road, Nugegoda',
      whatsapp: '0771234567',
      email: 'nimali.items@example.com',
      password: 'evening-order',
    }

    const parentBReg = {
      name: 'Kasun Items',
      deliveryAddress: '8 Lake Road, Kandy',
      whatsapp: '0777654321',
      email: 'kasun.items@example.com',
      password: 'evening-order',
    }

    type NamedJson = { id: number; name: string; archivedAt: string | null }
    type BookJson = { id: number; title: string; price: number; archivedAt: string | null }
    type PackJson = { id: number; name: string; description: string; archivedAt: string | null }
    type ItemJson = {
      id: number
      title: string
      description: string
      price: number
      archivedAt: string | null
    }
    type CartPackLineJson = {
      kind: 'pack'
      id: number
      packId: number
      sequence: number
      gradeName: string
      label: string
    }
    type CartItemLineJson = {
      kind: 'item'
      id: number
      itemId: number
      quantity: number
      title: string
      unitPrice: number
    }
    type CartLineJson = CartPackLineJson | CartItemLineJson
    type ItemAddJson = {
      id: number
      itemId: number
      quantity: number
      title: string
      unitPrice: number
    }
    type ErrorBody = { error: { code: string; message: string; field?: string } }

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${cartItemsBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function createNamed(
      cookie: string,
      resourcePath: 'schools' | 'grades',
      name: string,
    ): Promise<NamedJson> {
      const response = await fetch(`${cartItemsBaseUrl}/api/admin/${resourcePath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(catalogNameBody(name)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as NamedJson
    }

    async function createBookRow(cookie: string, title: string, price: number): Promise<BookJson> {
      const response = await fetch(`${cartItemsBaseUrl}/api/admin/books`, {
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
      const response = await fetch(`${cartItemsBaseUrl}/api/admin/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(packCreateBody(name, schoolId, gradeId, description, bookIds)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as PackJson
    }

    async function createItemRow(
      cookie: string,
      title: string,
      description: string,
      price: number,
    ): Promise<ItemJson> {
      const response = await fetch(`${cartItemsBaseUrl}/api/admin/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(itemBody(title, description, price)),
      })
      assert.equal(response.status, 201)
      return (await response.json()) as ItemJson
    }

    async function archiveItemRow(cookie: string, id: number): Promise<void> {
      const response = await fetch(`${cartItemsBaseUrl}/api/admin/items/${id}/archive`, {
        method: 'POST',
        headers: { cookie },
      })
      assert.equal(response.status, 200)
    }

    async function addItem(
      cookie: string | undefined,
      itemId: number,
      quantity: unknown,
    ): Promise<Response> {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (cookie) headers.cookie = cookie
      return fetch(`${cartItemsBaseUrl}/api/cart/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ itemId, quantity }),
      })
    }

    async function addPack(
      cookie: string,
      packId: number,
      selection: string,
    ): Promise<Response> {
      return fetch(`${cartItemsBaseUrl}/api/cart/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ packId, selection }),
      })
    }

    async function listCart(cookie: string): Promise<{ status: number; lines: CartLineJson[] }> {
      const response = await fetch(`${cartItemsBaseUrl}/api/cart`, {
        headers: { cookie },
      })
      if (response.status !== 200) return { status: response.status, lines: [] }
      const body = (await response.json()) as { lines: CartLineJson[] }
      return { status: response.status, lines: body.lines }
    }

    function itemLineInDb(parentId: number, itemId: number): {
      quantity: number
      title: string
      unit_price: number
    } | undefined {
      const db = new Database(dbPath, { readonly: true })
      try {
        return db
          .prepare(
            `SELECT quantity, title, unit_price
             FROM cart_item_lines
             WHERE parent_id = ? AND item_id = ?`,
          )
          .get(parentId, itemId) as
          | { quantity: number; title: string; unit_price: number }
          | undefined
      } finally {
        db.close()
      }
    }

    function itemLineCountInDb(): number {
      const db = new Database(dbPath, { readonly: true })
      try {
        return (db.prepare('SELECT COUNT(*) AS n FROM cart_item_lines').get() as { n: number }).n
      } finally {
        db.close()
      }
    }

    function parentIdForEmail(email: string): number {
      const db = new Database(dbPath, { readonly: true })
      try {
        const row = db
          .prepare('SELECT id FROM parents WHERE email = ?')
          .get(email) as { id: number } | undefined
        assert.ok(row)
        return row.id
      } finally {
        db.close()
      }
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-cart-items-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, CART_ITEMS_PORT)
      child = started.child
      const registered = await fetch(`${cartItemsBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parentReg),
      })
      assert.equal(registered.status, 201)
      const cookie = sidCookie(registered.headers)
      assert.ok(cookie)
      parentCookie = cookieHeader(cookie)

      const registeredB = await fetch(`${cartItemsBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parentBReg),
      })
      assert.equal(registeredB.status, 201)
      const cookieB = sidCookie(registeredB.headers)
      assert.ok(cookieB)
      parentBCookie = cookieHeader(cookieB)
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('adds the first live item as one cloned line', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-first`
      const item = await createItemRow(cookie, `Pencil ${suffix}`, 'HB set', 450)
      const before = itemLineCountInDb()

      const response = await addItem(parentCookie, item.id, 4)
      assert.equal(response.status, 201)
      const body = (await response.json()) as ItemAddJson
      assert.equal(body.itemId, item.id)
      assert.equal(body.quantity, 4)
      assert.equal(body.title, item.title)
      assert.equal(body.unitPrice, item.price)
      assert.equal(itemLineCountInDb(), before + 1)

      const listed = await listCart(parentCookie)
      assert.equal(listed.status, 200)
      const itemLines = listed.lines.filter((line) => line.kind === 'item')
      const match = itemLines.find((line) => line.itemId === item.id)
      assert.ok(match)
      assert.equal(match.quantity, 4)
      assert.equal(match.title, item.title)
      assert.equal(match.unitPrice, item.price)

      const patched = await fetch(`${cartItemsBaseUrl}${itemsItemPath(item.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(itemBody(`${item.title} renamed`, item.description, item.price + 100)),
      })
      assert.equal(patched.status, 200)
      const afterLiveChange = itemLineInDb(parentIdForEmail(parentReg.email), item.id)
      assert.ok(afterLiveChange)
      assert.equal(afterLiveChange.title, item.title)
      assert.equal(afterLiveChange.unit_price, item.price)
      assert.equal(afterLiveChange.quantity, 4)
    })

    it('merges a second add onto the same line without rewriting title or price', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-merge`
      const item = await createItemRow(cookie, `Glue ${suffix}`, '40g white', 2100)

      const first = await addItem(parentCookie, item.id, 15)
      assert.equal(first.status, 201)
      const firstBody = (await first.json()) as ItemAddJson

      const second = await addItem(parentCookie, item.id, 3)
      assert.equal(second.status, 200)
      const secondBody = (await second.json()) as ItemAddJson
      assert.equal(secondBody.id, firstBody.id)
      assert.equal(secondBody.quantity, 18)
      assert.equal(secondBody.title, firstBody.title)
      assert.equal(secondBody.unitPrice, firstBody.unitPrice)

      const listed = await listCart(parentCookie)
      const forItem = listed.lines.filter(
        (line) => line.kind === 'item' && line.itemId === item.id,
      )
      assert.equal(forItem.length, 1)
      assert.equal(forItem[0].quantity, 18)
      assert.equal(forItem[0].title, item.title)
      assert.equal(forItem[0].unitPrice, item.price)
    })

    it('refuses over-cap and invalid quantities without changing the stored row', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-cap`
      const item = await createItemRow(cookie, `Eraser ${suffix}`, 'Soft', 100)

      const seeded = await addItem(parentCookie, item.id, 15)
      assert.equal(seeded.status, 201)
      const parentId = parentIdForEmail(parentReg.email)
      const before = itemLineInDb(parentId, item.id)
      assert.ok(before)
      assert.equal(before.quantity, 15)

      const overMerge = await addItem(parentCookie, item.id, 6)
      assert.equal(overMerge.status, 400)
      const overBody = (await overMerge.json()) as ErrorBody
      assert.equal(overBody.error.code, 'invalid_input')
      assert.equal(
        overBody.error.message,
        'Item count exeeded, you can only order 20 per item',
      )

      const alone = await createItemRow(cookie, `Ruler ${suffix}`, '30cm', 200)
      const aloneBefore = itemLineCountInDb()
      for (const quantity of [0, 21, 1.5, 'abc', null] as unknown[]) {
        const response = await addItem(parentCookie, alone.id, quantity)
        assert.equal(response.status, 400, String(quantity))
        const body = (await response.json()) as ErrorBody
        assert.equal(body.error.code, 'invalid_input')
        assert.equal(body.error.message, 'Item count exeeded, you can only order 20 per item')
      }
      assert.equal(itemLineCountInDb(), aloneBefore)
      assert.deepEqual(itemLineInDb(parentId, item.id), before)
    })

    it('answers 404 when the item is unknown or archived', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-missing`
      const archived = await createItemRow(cookie, `Archived ${suffix}`, 'Hidden', 300)
      await archiveItemRow(cookie, archived.id)
      const before = itemLineCountInDb()

      for (const itemId of [999999, archived.id]) {
        const response = await addItem(parentCookie, itemId, 1)
        assert.equal(response.status, 404, String(itemId))
        const body = (await response.json()) as ErrorBody
        assert.equal(body.error.code, 'not_found')
      }
      assert.equal(itemLineCountInDb(), before)
    })

    it('answers 401 without a parent cookie', async () => {
      const before = itemLineCountInDb()
      const response = await addItem(undefined, 1, 1)
      assert.equal(response.status, 401)
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, 'unauthenticated')
      assert.equal(body.error.message, 'Sign in to continue.')
      assert.equal(itemLineCountInDb(), before)

      const stale = await addItem('booklist.sid=not-a-session', 1, 1)
      assert.equal(stale.status, 401)
      const staleBody = (await stale.json()) as ErrorBody
      assert.equal(staleBody.error.code, 'unauthenticated')
      assert.equal(itemLineCountInDb(), before)
    })

    it('answers 403 for an admin session', async () => {
      const cookie = await signInAdmin()
      const before = itemLineCountInDb()
      const response = await addItem(cookie, 1, 1)
      assert.equal(response.status, 403)
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, 'forbidden')
      assert.equal(itemLineCountInDb(), before)
    })

    it('lists only the signed-in parent item lines', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-parent-b`
      const item = await createItemRow(cookie, `Private ${suffix}`, 'A only', 500)

      const added = await addItem(parentCookie, item.id, 2)
      assert.equal(added.status, 201)
      const forA = await listCart(parentCookie)
      const forB = await listCart(parentBCookie)
      assert.ok(
        forA.lines.some((line) => line.kind === 'item' && line.itemId === item.id),
      )
      assert.equal(
        forB.lines.filter((line) => line.kind === 'item' && line.itemId === item.id).length,
        0,
      )
    })

    it('lists pack and item lines together without making the item a pack member', async () => {
      const cookie = await signInAdmin()
      const suffix = `${Date.now()}-mix`
      const school = await createNamed(cookie, 'schools', `Items school ${suffix}`)
      const grade = await createNamed(cookie, 'grades', 'Grade 5')
      const book = await createBookRow(cookie, `Mix book ${suffix}`, 1200)
      const pack = await createPackRow(
        cookie,
        `Mix pack ${suffix}`,
        school.id,
        grade.id,
        `Mix pack ${suffix}`,
        [book.id],
      )
      const item = await createItemRow(cookie, `Mix item ${suffix}`, 'Stationery', 350)

      const packAdd = await addPack(parentCookie, pack.id, `${book.id}:1`)
      assert.equal(packAdd.status, 201)
      const itemAdd = await addItem(parentCookie, item.id, 2)
      assert.equal(itemAdd.status, 201)

      const listed = await listCart(parentCookie)
      assert.equal(listed.status, 200)
      const packs = listed.lines.filter((line) => line.kind === 'pack' && line.packId === pack.id)
      const items = listed.lines.filter((line) => line.kind === 'item' && line.itemId === item.id)
      assert.equal(packs.length, 1)
      assert.equal(items.length, 1)
      assert.equal(items[0].quantity, 2)
      assert.equal(items[0].title, item.title)

      const itemsOnly = await createItemRow(cookie, `Solo ${suffix}`, 'Only item', 150)
      const soloParent = {
        name: 'Solo Parent',
        deliveryAddress: '1 Solo Road',
        whatsapp: '0771112233',
        email: `solo.items.${suffix}@example.com`,
        password: 'evening-order',
      }
      const registeredSolo = await fetch(`${cartItemsBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(soloParent),
      })
      assert.equal(registeredSolo.status, 201)
      const soloCookie = cookieHeader(sidCookie(registeredSolo.headers)!)
      const soloAdd = await addItem(soloCookie, itemsOnly.id, 1)
      assert.equal(soloAdd.status, 201)
      const soloList = await listCart(soloCookie)
      assert.equal(soloList.lines.every((line) => line.kind === 'item'), true)
      assert.equal(soloList.lines.length, 1)
    })

    it('wires Items Add, AuthSurface stay, cart item text, and the mixed badge', async () => {
      const itemsPage = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'ItemsPage.tsx'),
        'utf8',
      )
      const cartPage = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'CartPage.tsx'),
        'utf8',
      )
      const cartModule = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'cart.tsx'),
        'utf8',
      )
      const cartHttp = await readFile(path.join(serverRoot, 'cart', 'http.ts'), 'utf8')
      const cartItems = await readFile(path.join(serverRoot, 'cart', 'items.ts'), 'utf8')
      const catalogItems = await readFile(path.join(serverRoot, 'catalog', 'items.ts'), 'utf8')
      const packsModule = await readFile(path.join(serverRoot, 'catalog', 'packs.ts'), 'utf8')
      const runMigrations = await readFile(
        path.join(serverRoot, 'db', 'migrations', 'run.ts'),
        'utf8',
      )

      assert.match(runMigrations, /008_cart_item_lines\.sql/)
      assert.match(catalogItems, /export function getLiveItem/)
      assert.match(packsModule, /QUANTITY_RANGE_MESSAGE/)
      assert.match(cartItems, /QUANTITY_RANGE_MESSAGE/)
      assert.match(cartItems, /INSERT INTO cart_item_lines/)
      assert.match(cartItems, /UPDATE cart_item_lines SET quantity/)
      assert.doesNotMatch(cartItems, /SET title/)
      assert.doesNotMatch(cartHttp, /db\.prepare/)
      assert.match(cartHttp, /\/cart\/items/)
      assert.match(cartHttp, /kind: 'pack'/)
      assert.match(cartHttp, /kind: 'item'/)

      assert.match(itemsPage, /\/api\/cart\/items/)
      assert.match(itemsPage, /AuthSurface/)
      assert.match(itemsPage, /credentials: 'include'/)
      assert.match(itemsPage, /QUANTITY_MAX/)
      assert.match(itemsPage, /Item count exeeded, you can only order 20 per item/)
      assert.equal(itemsPage.includes("navigate('/')"), false)
      assert.match(itemsPage, /onSignedIn=\{\(\) => setNeedsAuth\(false\)\}/)

      const cartLinesModule = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'cartLines.ts'),
        'utf8',
      )
      assert.match(cartPage, /kind === 'pack'/)
      assert.match(cartLinesModule, /kind === 'pack'/)
      assert.match(cartLinesModule, /kind === 'item'/)
      assert.match(cartPage, /cart-line-chip/)
      assert.match(cartPage, /line\.title/)
      assert.match(cartPage, /line\.quantity/)
      // Story 3.3 adds Remove, the empty state, money and steppers to the Cart page.
      assert.match(cartPage, /Remove/)
      assert.match(cartPage, /Cart is Empty/)
      assert.match(cartPage, /formatRupees/)
      assert.match(cartPage, /stepper/)

      assert.match(cartModule, /kind: 'pack'/)
      assert.match(cartModule, /kind: 'item'/)
      assert.match(cartModule, /lines\.length/)
    })
  })

  describe('A cart that persists, totals, and can be emptied', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let adminCookie: string
    let gradeId: number
    let schoolId: number
    let parentSerial = 0

    const CAP_SENTENCE = 'Item count exeeded, you can only order 20 per item'

    type MemberJson = {
      bookId: number
      included: boolean
      quantity: number
      title: string
      unitPrice: number
    }
    type PackLineJson = {
      kind: 'pack'
      id: number
      packId: number
      sequence: number
      gradeName: string
      label: string
      members: MemberJson[]
      lineTotal: number
    }
    type ItemLineJson = {
      kind: 'item'
      id: number
      itemId: number
      quantity: number
      title: string
      unitPrice: number
      lineTotal: number
    }
    type LineJson = PackLineJson | ItemLineJson
    type CartJson = { lines: LineJson[]; goodsTotal: number }
    type ErrorBody = { error: { code: string; message: string; field?: string } }
    type Parent = { cookie: string; email: string; password: string; id: number }
    type Titled = { id: number; title: string }
    type Attempt = ['PATCH' | 'DELETE', string, unknown]

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${cartTotalsBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function adminPost<T>(pathName: string, body: unknown): Promise<T> {
      const response = await fetch(`${cartTotalsBaseUrl}${pathName}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify(body),
      })
      assert.equal(response.status, 201, `${pathName}: ${response.status}`)
      return (await response.json()) as T
    }

    function suffix(tag: string): string {
      return `${Date.now()}-${tag}`
    }

    function createBook(title: string, price: number): Promise<Titled> {
      return adminPost('/api/admin/books', bookBody(title, price))
    }

    function createPack(name: string, bookIds: number[]): Promise<{ id: number }> {
      return adminPost('/api/admin/packs', packCreateBody(name, schoolId, gradeId, name, bookIds))
    }

    function createItem(title: string, price: number): Promise<Titled> {
      return adminPost('/api/admin/items', itemBody(title, 'Stationery', price))
    }

    async function registerParent(tag: string): Promise<Parent> {
      parentSerial += 1
      const email = `totals.${tag}.${parentSerial}.${Date.now()}@example.com`
      const password = 'evening-order'
      const response = await fetch(`${cartTotalsBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: `Totals ${tag}`,
          deliveryAddress: '12 Temple Road, Nugegoda',
          whatsapp: '0771234567',
          email,
          password,
        }),
      })
      assert.equal(response.status, 201)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      const db = new Database(dbPath, { readonly: true })
      try {
        const row = db.prepare('SELECT id FROM parents WHERE email = ?').get(email) as
          | { id: number }
          | undefined
        assert.ok(row)
        return { cookie: cookieHeader(cookie), email, password, id: row.id }
      } finally {
        db.close()
      }
    }

    async function addPack(cookie: string, packId: number, selection: string): Promise<number> {
      const response = await fetch(`${cartTotalsBaseUrl}/api/cart/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ packId, selection }),
      })
      assert.equal(response.status, 201)
      return ((await response.json()) as { id: number }).id
    }

    async function addItem(cookie: string, itemId: number, quantity: number): Promise<number> {
      const response = await fetch(`${cartTotalsBaseUrl}/api/cart/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ itemId, quantity }),
      })
      assert.equal(response.status, 201)
      return ((await response.json()) as { id: number }).id
    }

    async function getCart(cookie: string): Promise<CartJson> {
      const response = await fetch(`${cartTotalsBaseUrl}/api/cart`, { headers: { cookie } })
      assert.equal(response.status, 200)
      return (await response.json()) as CartJson
    }

    function send(
      method: 'PATCH' | 'DELETE',
      pathName: string,
      cookie: string | undefined,
      body?: unknown,
    ): Promise<Response> {
      const headers: Record<string, string> = {}
      if (cookie) headers.cookie = cookie
      if (body !== undefined) headers['content-type'] = 'application/json'
      return fetch(`${cartTotalsBaseUrl}${pathName}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    }

    function cartRows(parentId: number): unknown {
      const db = new Database(dbPath, { readonly: true })
      try {
        const packs = db
          .prepare('SELECT * FROM cart_pack_lines WHERE parent_id = ? ORDER BY id')
          .all(parentId)
        const members = db
          .prepare(
            `SELECT m.* FROM cart_pack_line_members m
             JOIN cart_pack_lines l ON l.id = m.line_id
             WHERE l.parent_id = ?
             ORDER BY m.line_id, m.book_id`,
          )
          .all(parentId)
        const items = db
          .prepare('SELECT * FROM cart_item_lines WHERE parent_id = ? ORDER BY id')
          .all(parentId)
        return { packs, members, items }
      } finally {
        db.close()
      }
    }

    function memberCountForLine(lineId: number): number {
      const db = new Database(dbPath, { readonly: true })
      try {
        return (
          db
            .prepare('SELECT COUNT(*) AS n FROM cart_pack_line_members WHERE line_id = ?')
            .get(lineId) as { n: number }
        ).n
      } finally {
        db.close()
      }
    }

    /** Atlas x2 @1,500 and Reader x1 @800 ticked, Workbook @900 unticked; an item x3 @120. */
    async function seedTotalsCart(tag: string): Promise<{
      parent: Parent
      atlas: Titled
      reader: Titled
      workbook: Titled
      item: Titled
      packId: number
      packLineId: number
      itemLineId: number
    }> {
      const s = suffix(tag)
      const atlas = await createBook(`Atlas ${s}`, 1500)
      const reader = await createBook(`Reader ${s}`, 800)
      const workbook = await createBook(`Workbook ${s}`, 900)
      const pack = await createPack(`Totals pack ${s}`, [atlas.id, reader.id, workbook.id])
      const item = await createItem(`Pencil ${s}`, 120)
      const parent = await registerParent(tag)
      const packLineId = await addPack(parent.cookie, pack.id, `${atlas.id}:2,${reader.id}:1`)
      const itemLineId = await addItem(parent.cookie, item.id, 3)
      return { parent, atlas, reader, workbook, item, packId: pack.id, packLineId, itemLineId }
    }

    function editRoutes(seeded: { packLineId: number; itemLineId: number; atlas: Titled }): Attempt[] {
      return [
        ['PATCH', `/api/cart/packs/${seeded.packLineId}/members/${seeded.atlas.id}`, { quantity: 4 }],
        ['PATCH', `/api/cart/items/${seeded.itemLineId}`, { quantity: 4 }],
        ['DELETE', `/api/cart/packs/${seeded.packLineId}`, undefined],
        ['DELETE', `/api/cart/items/${seeded.itemLineId}`, undefined],
      ]
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-cart-totals-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, CART_TOTALS_PORT)
      child = started.child
      adminCookie = await signInAdmin()
      const s = suffix('setup')
      schoolId = (
        await adminPost<{ id: number }>('/api/admin/schools', catalogNameBody(`Totals school ${s}`))
      ).id
      gradeId = (await adminPost<{ id: number }>('/api/admin/grades', catalogNameBody('Grade 5'))).id
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('returns members, line totals, and the goods total from add-time figures without writing', async () => {
      const seeded = await seedTotalsCart('totals')
      const before = cartRows(seeded.parent.id)
      const cart = await getCart(seeded.parent.cookie)
      assert.deepEqual(cartRows(seeded.parent.id), before)

      assert.equal(cart.lines.length, 2)
      const packLine = cart.lines.find((line): line is PackLineJson => line.kind === 'pack')
      const itemLine = cart.lines.find((line): line is ItemLineJson => line.kind === 'item')
      assert.ok(packLine)
      assert.ok(itemLine)
      assert.equal(packLine.id, seeded.packLineId)
      assert.equal(packLine.label, 'Pack 1 of Grade 5')
      assert.deepEqual(packLine.members, [
        { bookId: seeded.atlas.id, included: true, quantity: 2, title: seeded.atlas.title, unitPrice: 1500 },
        { bookId: seeded.reader.id, included: true, quantity: 1, title: seeded.reader.title, unitPrice: 800 },
        { bookId: seeded.workbook.id, included: false, quantity: 1, title: seeded.workbook.title, unitPrice: 900 },
      ])
      assert.equal(packLine.lineTotal, 3800)
      assert.equal(itemLine.lineTotal, 360)
      assert.equal(cart.goodsTotal, 4160)
      assert.equal(compositionMeta(packLine), `2 of 3 titles · ${seeded.atlas.title} ×2`)
      assert.equal(formatRupees(cart.goodsTotal), 'Rs. 4,160')
    })

    it('persists on the account across a fresh sign-in, even after catalog price edits', async () => {
      const seeded = await seedTotalsCart('persist')
      const first = await getCart(seeded.parent.cookie)

      const patchedBook = await fetch(`${cartTotalsBaseUrl}${booksItemPath(seeded.atlas.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify(bookBody(`${seeded.atlas.title} new`, 9999)),
      })
      assert.equal(patchedBook.status, 200)
      const patchedItem = await fetch(`${cartTotalsBaseUrl}${itemsItemPath(seeded.item.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify(itemBody(`${seeded.item.title} new`, 'Stationery', 9999)),
      })
      assert.equal(patchedItem.status, 200)

      const login = await fetch(`${cartTotalsBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: seeded.parent.email, password: seeded.parent.password }),
      })
      assert.equal(login.status, 200)
      const freshSid = sidCookie(login.headers)
      assert.ok(freshSid)
      const freshCookie = cookieHeader(freshSid)
      assert.notEqual(freshCookie, seeded.parent.cookie)

      const second = await getCart(freshCookie)
      assert.deepEqual(second, first)
      assert.equal(second.goodsTotal, 4160)
    })

    it('changes a ticked pack title quantity and refuses an unticked one', async () => {
      const seeded = await seedTotalsCart('pack-qty')
      const memberPath = (bookId: number) =>
        `/api/cart/packs/${seeded.packLineId}/members/${bookId}`

      const ok = await send('PATCH', memberPath(seeded.atlas.id), seeded.parent.cookie, {
        quantity: 5,
      })
      assert.equal(ok.status, 200)
      const okBody = (await ok.json()) as PackLineJson
      assert.equal(okBody.kind, 'pack')
      assert.equal(okBody.members.find((m) => m.bookId === seeded.atlas.id)?.quantity, 5)

      const cart = await getCart(seeded.parent.cookie)
      const packLine = cart.lines.find((line): line is PackLineJson => line.kind === 'pack')
      assert.ok(packLine)
      assert.equal(packLine.members.find((m) => m.bookId === seeded.atlas.id)?.quantity, 5)
      assert.equal(packLine.lineTotal, 5 * 1500 + 800)
      assert.equal(cart.goodsTotal, 5 * 1500 + 800 + 360)

      const before = cartRows(seeded.parent.id)
      const unticked = await send('PATCH', memberPath(seeded.workbook.id), seeded.parent.cookie, {
        quantity: 2,
      })
      assert.equal(unticked.status, 400)
      assert.equal(((await unticked.json()) as ErrorBody).error.code, 'invalid_input')
      assert.deepEqual(cartRows(seeded.parent.id), before)

      const notMember = await send('PATCH', memberPath(999999), seeded.parent.cookie, {
        quantity: 2,
      })
      assert.equal(notMember.status, 404)
      assert.deepEqual(cartRows(seeded.parent.id), before)
    })

    it('changes an item line quantity on the same line', async () => {
      const seeded = await seedTotalsCart('item-qty')
      const response = await send(
        'PATCH',
        `/api/cart/items/${seeded.itemLineId}`,
        seeded.parent.cookie,
        { quantity: 7 },
      )
      assert.equal(response.status, 200)
      const body = (await response.json()) as ItemLineJson
      assert.equal(body.id, seeded.itemLineId)
      assert.equal(body.quantity, 7)
      assert.equal(body.lineTotal, 840)

      const cart = await getCart(seeded.parent.cookie)
      const items = cart.lines.filter((line): line is ItemLineJson => line.kind === 'item')
      assert.equal(items.length, 1)
      assert.equal(items[0].id, seeded.itemLineId)
      assert.equal(items[0].quantity, 7)
      assert.equal(items[0].title, seeded.item.title)
      assert.equal(items[0].unitPrice, 120)
      assert.equal(cart.goodsTotal, 3800 + 840)
    })

    it('refuses out-of-range quantities on both routes with the cap sentence', async () => {
      const seeded = await seedTotalsCart('bad-qty')
      const before = cartRows(seeded.parent.id)
      const targets = [
        `/api/cart/packs/${seeded.packLineId}/members/${seeded.reader.id}`,
        `/api/cart/items/${seeded.itemLineId}`,
      ]
      for (const target of targets) {
        for (const body of [{ quantity: 0 }, { quantity: 21 }, { quantity: 2.5 }, {}]) {
          const response = await send('PATCH', target, seeded.parent.cookie, body)
          assert.equal(response.status, 400, `${target} ${JSON.stringify(body)}`)
          const error = (await response.json()) as ErrorBody
          assert.equal(error.error.code, 'invalid_input')
          assert.equal(error.error.message, CAP_SENTENCE)
        }
      }
      assert.deepEqual(cartRows(seeded.parent.id), before)
    })

    it('removes pack and item lines with their members, keeping other labels, down to empty', async () => {
      const seeded = await seedTotalsCart('remove')
      const secondLineId = await addPack(seeded.parent.cookie, seeded.packId, `${seeded.reader.id}:1`)
      assert.equal(memberCountForLine(seeded.packLineId), 3)

      const removed = await send('DELETE', `/api/cart/packs/${seeded.packLineId}`, seeded.parent.cookie)
      assert.equal(removed.status, 204)
      assert.equal(memberCountForLine(seeded.packLineId), 0)

      let cart = await getCart(seeded.parent.cookie)
      const packs = cart.lines.filter((line): line is PackLineJson => line.kind === 'pack')
      assert.equal(packs.length, 1)
      assert.equal(packs[0].id, secondLineId)
      assert.equal(packs[0].sequence, 2)
      assert.equal(packs[0].label, 'Pack 2 of Grade 5')
      assert.equal(cart.lines.filter((line) => line.kind === 'item').length, 1)
      assert.equal(cart.goodsTotal, 800 + 360)

      const removedItem = await send('DELETE', `/api/cart/items/${seeded.itemLineId}`, seeded.parent.cookie)
      assert.equal(removedItem.status, 204)
      const removedLast = await send('DELETE', `/api/cart/packs/${secondLineId}`, seeded.parent.cookie)
      assert.equal(removedLast.status, 204)
      assert.equal(memberCountForLine(secondLineId), 0)

      cart = await getCart(seeded.parent.cookie)
      assert.deepEqual(cart, { lines: [], goodsTotal: 0 })

      const fresh = await registerParent('never-filled')
      assert.deepEqual(await getCart(fresh.cookie), { lines: [], goodsTotal: 0 })
    })

    it("answers 404 for another parent's line or an unknown id and leaves the line alone", async () => {
      const seeded = await seedTotalsCart('foreign')
      const other = await registerParent('other')
      const before = cartRows(seeded.parent.id)
      for (const [method, target, body] of editRoutes(seeded)) {
        const response = await send(method, target, other.cookie, body)
        assert.equal(response.status, 404, `${method} ${target}`)
        assert.equal(((await response.json()) as ErrorBody).error.code, 'not_found')
      }
      const unknown: Attempt[] = [
        ['PATCH', `/api/cart/packs/999999/members/${seeded.atlas.id}`, { quantity: 4 }],
        ['PATCH', '/api/cart/items/999999', { quantity: 4 }],
        ['DELETE', '/api/cart/packs/999999', undefined],
        ['DELETE', '/api/cart/items/abc', undefined],
      ]
      for (const [method, target, body] of unknown) {
        const response = await send(method, target, seeded.parent.cookie, body)
        assert.equal(response.status, 404, `${method} ${target}`)
        assert.equal(((await response.json()) as ErrorBody).error.code, 'not_found')
      }
      assert.deepEqual(cartRows(seeded.parent.id), before)
    })

    it('answers 401 without a cookie and 403 for an admin on every new route', async () => {
      const seeded = await seedTotalsCart('auth')
      const before = cartRows(seeded.parent.id)
      for (const [method, target, body] of editRoutes(seeded)) {
        const anonymous = await send(method, target, undefined, body)
        assert.equal(anonymous.status, 401, `${method} ${target}`)
        assert.equal(((await anonymous.json()) as ErrorBody).error.code, 'unauthenticated')
        const admin = await send(method, target, adminCookie, body)
        assert.equal(admin.status, 403, `${method} ${target}`)
        assert.equal(((await admin.json()) as ErrorBody).error.code, 'forbidden')
      }
      assert.deepEqual(cartRows(seeded.parent.id), before)
    })

    it('parses a real GET body intact and fails as a whole on one malformed member', async () => {
      const seeded = await seedTotalsCart('parse')
      const response = await fetch(`${cartTotalsBaseUrl}/api/cart`, {
        headers: { cookie: seeded.parent.cookie },
      })
      assert.equal(response.status, 200)
      const raw = (await response.json()) as CartJson
      const parsed = parseCartBody(raw)
      assert.ok(parsed)
      assert.deepEqual(parsed, raw)
      assert.equal(parsed.goodsTotal, 4160)
      const packLine = parsed.lines.find((line) => line.kind === 'pack')
      assert.ok(packLine && packLine.kind === 'pack')
      assert.equal(packLine.members.length, 3)
      assert.equal(packLine.lineTotal, 3800)

      const brokenMember = structuredClone(raw)
      const brokenPack = brokenMember.lines.find((line): line is PackLineJson => line.kind === 'pack')
      assert.ok(brokenPack)
      ;(brokenPack.members[1] as unknown as Record<string, unknown>).unitPrice = '800'
      assert.equal(parseCartBody(brokenMember), undefined)

      const brokenItem = structuredClone(raw)
      ;(brokenItem.lines[1] as unknown as Record<string, unknown>).lineTotal = undefined
      assert.equal(parseCartBody(brokenItem), undefined)

      assert.equal(parseCartBody({ lines: raw.lines }), undefined)
      assert.equal(parseCartBody({ lines: raw.lines, goodsTotal: '4160' }), undefined)
      assert.equal(parseCartBody({ lines: [...raw.lines, { kind: 'other' }], goodsTotal: 4160 }), undefined)
      assert.deepEqual(parseCartBody({ lines: [], goodsTotal: 0 }), { lines: [], goodsTotal: 0 })
    })

    it('builds composition meta for plain and multi-copy packs in member order', () => {
      const member = (bookId: number, title: string, included: boolean, quantity: number) => ({
        bookId,
        included,
        quantity,
        title,
        unitPrice: 100,
      })
      const line = (members: MemberJson[]): PackLineJson => ({
        kind: 'pack',
        id: 1,
        packId: 1,
        sequence: 1,
        gradeName: 'Grade 5',
        label: 'Pack 1 of Grade 5',
        members,
        lineTotal: 0,
      })
      assert.equal(
        compositionMeta(line([member(1, 'Atlas', true, 1), member(2, 'Reader', true, 1), member(3, 'Workbook', false, 4)])),
        '2 of 3 titles',
      )
      assert.equal(
        compositionMeta(
          line([
            member(1, 'Atlas', true, 2),
            member(2, 'Reader', true, 1),
            member(3, 'Workbook', false, 5),
            member(4, 'Grammar', true, 3),
          ]),
        ),
        '3 of 4 titles \u00b7 Atlas \u00d72 \u00b7 Grammar \u00d73',
      )
    })

    it('accepts a pack title quantity of exactly 20', async () => {
      const seeded = await seedTotalsCart('cap-20')
      const response = await send(
        'PATCH',
        `/api/cart/packs/${seeded.packLineId}/members/${seeded.reader.id}`,
        seeded.parent.cookie,
        { quantity: 20 },
      )
      assert.equal(response.status, 200)
      const body = (await response.json()) as PackLineJson
      assert.equal(body.members.find((m) => m.bookId === seeded.reader.id)?.quantity, 20)
      assert.equal(body.lineTotal, 2 * 1500 + 20 * 800)

      const badBook = await send(
        'PATCH',
        `/api/cart/packs/${seeded.packLineId}/members/abc`,
        seeded.parent.cookie,
        { quantity: 2 },
      )
      assert.equal(badBook.status, 404)
      const badBody = (await badBook.json()) as ErrorBody
      assert.equal(badBody.error.code, 'not_found')
      assert.equal(badBody.error.message, 'That title is not in this pack line.')
    })

    it('answers 404 to a PATCH or DELETE on a line that was just deleted', async () => {
      const seeded = await seedTotalsCart('gone')
      assert.equal(
        (await send('DELETE', `/api/cart/packs/${seeded.packLineId}`, seeded.parent.cookie)).status,
        204,
      )
      assert.equal(
        (await send('DELETE', `/api/cart/items/${seeded.itemLineId}`, seeded.parent.cookie)).status,
        204,
      )
      for (const [method, target, body] of editRoutes(seeded)) {
        const response = await send(method, target, seeded.parent.cookie, body)
        assert.equal(response.status, 404, `${method} ${target}`)
        const error = (await response.json()) as ErrorBody
        assert.equal(error.error.code, 'not_found')
        assert.equal(error.error.message, 'That line is not in your cart.')
      }
      assert.deepEqual(await getCart(seeded.parent.cookie), { lines: [], goodsTotal: 0 })
    })

    it('wires the Cart page totals, steppers, Remove, and the empty state', async () => {
      const cartPage = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'CartPage.tsx'),
        'utf8',
      )
      const cartModule = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'cart.tsx'),
        'utf8',
      )
      const cartHttp = await readFile(path.join(serverRoot, 'cart', 'http.ts'), 'utf8')
      const cartPacks = await readFile(path.join(serverRoot, 'cart', 'packs.ts'), 'utf8')
      const cartItems = await readFile(path.join(serverRoot, 'cart', 'items.ts'), 'utf8')
      const cartEdits = await readFile(path.join(serverRoot, 'cart', 'edits.ts'), 'utf8')
      const cartLinesModule = await readFile(
        path.join(repoRoot, 'client', 'storefront', 'src', 'cartLines.ts'),
        'utf8',
      )
      const baseCss = await readFile(baseCssPath, 'utf8')

      assert.doesNotMatch(cartHttp, /db\.prepare/)
      assert.match(cartHttp, /goodsTotal: cartGoodsTotal\(packLines, itemLines\)/)
      assert.doesNotMatch(cartHttp, /goodsTotal \+=/)
      assert.match(cartPacks, /export function cartGoodsTotal/)
      assert.match(cartEdits, /export type CartEditFailure/)
      assert.doesNotMatch(cartItems, /ItemEditFailure/)
      assert.match(cartItems, /db\.transaction\(\(\): ItemEditResult/)
      assert.match(cartHttp, /router\.patch\(\s*'\/cart\/packs\/:lineId\/members\/:bookId'/)
      assert.match(cartHttp, /router\.patch\(\s*'\/cart\/items\/:lineId'/)
      assert.match(cartHttp, /router\.delete\(\s*'\/cart\/packs\/:lineId'/)
      assert.match(cartHttp, /router\.delete\(\s*'\/cart\/items\/:lineId'/)
      assert.match(cartPacks, /export function setPackMemberQuantity/)
      assert.match(cartPacks, /export function removeCartPackLine/)
      assert.match(cartPacks, /QUANTITY_RANGE_MESSAGE/)
      assert.doesNotMatch(cartPacks, /FROM packs/)
      assert.doesNotMatch(cartPacks, /FROM books/)
      assert.match(cartItems, /export function setCartItemQuantity/)
      assert.match(cartItems, /export function removeCartItemLine/)
      assert.doesNotMatch(cartItems, /SET title/)

      assert.match(cartPage, /Cart is Empty/)
      assert.match(cartPage, /aria-label="Refresh cart"/)
      assert.match(cartPage, /formatRupees\(goodsTotal\)/)
      assert.match(cartPage, /formatRupees\(line\.lineTotal\)/)
      assert.match(cartPage, /pack-stepper-end/)
      assert.match(cartPage, /button-danger-text/)
      assert.match(cartPage, /disabled=\{disabled \|\| quantity <= QUANTITY_MIN\}/)
      assert.match(cartPage, /disabled=\{disabled \|\| quantity >= QUANTITY_MAX\}/)
      assert.match(cartPage, /Item count exeeded, you can only order 20 per item/)
      // Success path of an edit: after a non-OK early return, reload then refresh the badge.
      assert.match(
        cartPage,
        /if \(!response\.ok\) \{[\s\S]*?return\s*\}\s*await loadCart\(\)\s*refresh\(\)/,
      )
      // The refresh icon only refreshes the badge after a successful reload, and is locked while busy.
      assert.match(cartPage, /if \(\(await loadCart\(\)\) === 'ok'\) refresh\(\)/)
      assert.match(cartPage, /aria-label="Refresh cart"\s*disabled=\{busy\}/)
      assert.match(cartPage, /inFlight\.current/)
      assert.match(cartPage, /new AbortController\(\)/)
      assert.match(cartPage, /className="cart-goods-total" aria-live="polite"/)
      assert.match(cartPage, /parseCartBody/)
      assert.doesNotMatch(cartPage, /export function (?!CartPage\b)/)
      assert.doesNotMatch(cartPage, /export const/)
      assert.match(cartLinesModule, /export function parseCartBody/)
      assert.match(cartLinesModule, /export function compositionMeta/)
      assert.doesNotMatch(cartLinesModule, /from 'react'/)
      assert.doesNotMatch(cartPage, /Browse/)
      // Story 4.1 adds the Checkout link, so `<Link` is allowed on the Cart page.
      assert.doesNotMatch(cartPage, /navigate/)
      assert.doesNotMatch(cartPage, /localStorage|sessionStorage/)
      assert.doesNotMatch(cartPage, /type="checkbox"/)

      assert.match(cartModule, /lines\.length/)
      assert.match(cartModule, /lineTotal: number/)
      assert.match(cartModule, /members: CartPackMember\[\]/)

      const remove = cssRule(baseCss, '.button-danger-text')
      assert.match(remove, /var\(--color-danger\)/)
      assert.match(remove, /min-height: var\(--space-touch-min\)/)
      assert.match(cssRule(baseCss, '.cart-empty'), /align-items: center/)
      assert.match(cssRule(baseCss, '.cart-refresh'), /var\(--space-touch-min\)/)
      assert.ok(cssRule(baseCss, '.cart-goods-total'))
      assert.ok(cssRule(baseCss, '.cart-line-meta'))
      assert.ok(cssRule(baseCss, '.cart-line-total'))
    })
  })

  describe('Checkout — address, delivery line, note, and stale lines', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let adminCookie: string
    let parentSerial = 0

    const CONFLICT_MESSAGE = 'That price changed again. Review this line.'
    const DELIVERY_COPY = 'Delivery charge: to be confirmed by the shop'

    type MemberJson = {
      bookId: number
      included: boolean
      quantity: number
      title: string
      unitPrice: number
    }
    type StaleJson = null | { kind: 'unavailable' } | { kind: 'repriced'; lineTotal: number }
    type PackLineJson = {
      kind: 'pack'
      id: number
      packId: number
      sequence: number
      gradeName: string
      label: string
      members: MemberJson[]
      lineTotal: number
    }
    type ItemLineJson = {
      kind: 'item'
      id: number
      itemId: number
      quantity: number
      title: string
      unitPrice: number
      lineTotal: number
    }
    type LineJson = PackLineJson | ItemLineJson
    type CartJson = { lines: LineJson[]; goodsTotal: number }
    type CheckoutLineJson = LineJson & { stale: StaleJson }
    type CheckoutJson = { lines: CheckoutLineJson[]; goodsTotal: number; attentionCount: number }
    type ErrorBody = { error: { code: string; message: string; field?: string } }
    type Parent = { cookie: string; id: number }
    type Titled = { id: number; title: string }

    type Seeded = {
      parent: Parent
      schoolId: number
      gradeId: number
      atlas: Titled
      reader: Titled
      workbook: Titled
      item: Titled
      packId: number
      packLineId: number
      itemLineId: number
    }

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${checkoutBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function adminSend(
      method: 'POST' | 'PATCH' | 'DELETE',
      pathName: string,
      body: unknown,
      expected: number,
    ): Promise<unknown> {
      const response = await fetch(`${checkoutBaseUrl}${pathName}`, {
        method,
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      assert.equal(response.status, expected, `${method} ${pathName}: ${response.status}`)
      return expected === 204 ? undefined : await response.json()
    }

    function suffix(tag: string): string {
      return `${Date.now()}-${tag}`
    }

    async function registerParent(tag: string): Promise<Parent> {
      parentSerial += 1
      const email = `checkout.${tag}.${parentSerial}.${Date.now()}@example.com`
      const response = await fetch(`${checkoutBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: `Checkout ${tag}`,
          deliveryAddress: '12 Temple Road, Nugegoda',
          whatsapp: '0771234567',
          email,
          password: 'evening-order',
        }),
      })
      assert.equal(response.status, 201)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      const db = new Database(dbPath, { readonly: true })
      try {
        const row = db.prepare('SELECT id FROM parents WHERE email = ?').get(email) as
          | { id: number }
          | undefined
        assert.ok(row)
        return { cookie: cookieHeader(cookie), id: row.id }
      } finally {
        db.close()
      }
    }

    /**
     * Own school and grade per seed, so archiving one never touches another test.
     * Atlas x2 @1,500 and Reader x1 @800 ticked, Workbook @900 unticked; an item x3 @120.
     */
    async function seed(tag: string): Promise<Seeded> {
      const s = suffix(tag)
      const schoolId = ((await adminSend('POST', '/api/admin/schools', catalogNameBody(`Checkout school ${s}`), 201)) as { id: number }).id
      const gradeId = ((await adminSend('POST', '/api/admin/grades', catalogNameBody(`Grade ${s}`), 201)) as { id: number }).id
      const atlas = (await adminSend('POST', '/api/admin/books', bookBody(`Atlas ${s}`, 1500), 201)) as Titled
      const reader = (await adminSend('POST', '/api/admin/books', bookBody(`Reader ${s}`, 800), 201)) as Titled
      const workbook = (await adminSend('POST', '/api/admin/books', bookBody(`Workbook ${s}`, 900), 201)) as Titled
      const pack = (await adminSend(
        'POST',
        '/api/admin/packs',
        packCreateBody(`Checkout pack ${s}`, schoolId, gradeId, 'Checkout', [atlas.id, reader.id, workbook.id]),
        201,
      )) as { id: number }
      const item = (await adminSend('POST', '/api/admin/items', itemBody(`Pencil ${s}`, 'Stationery', 120), 201)) as Titled
      const parent = await registerParent(tag)

      const packResponse = await fetch(`${checkoutBaseUrl}/api/cart/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: parent.cookie },
        body: JSON.stringify({ packId: pack.id, selection: `${atlas.id}:2,${reader.id}:1` }),
      })
      assert.equal(packResponse.status, 201)
      const packLineId = ((await packResponse.json()) as { id: number }).id
      const itemResponse = await fetch(`${checkoutBaseUrl}/api/cart/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: parent.cookie },
        body: JSON.stringify({ itemId: item.id, quantity: 3 }),
      })
      assert.equal(itemResponse.status, 201)
      const itemLineId = ((await itemResponse.json()) as { id: number }).id
      return { parent, schoolId, gradeId, atlas, reader, workbook, item, packId: pack.id, packLineId, itemLineId }
    }

    async function getCart(cookie: string): Promise<CartJson> {
      const response = await fetch(`${checkoutBaseUrl}/api/cart`, { headers: { cookie } })
      assert.equal(response.status, 200)
      return (await response.json()) as CartJson
    }

    async function getCheckout(cookie: string): Promise<CheckoutJson> {
      const response = await fetch(`${checkoutBaseUrl}/api/cart/checkout`, { headers: { cookie } })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      return (await response.json()) as CheckoutJson
    }

    function staleOf(checkout: CheckoutJson, kind: 'pack' | 'item'): StaleJson {
      const line = checkout.lines.find((entry) => entry.kind === kind)
      assert.ok(line, `missing ${kind} line`)
      return line.stale
    }

    function accept(
      kind: 'packs' | 'items',
      lineId: number | string,
      cookie: string | undefined,
      body: unknown,
    ): Promise<Response> {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (cookie) headers.cookie = cookie
      return fetch(`${checkoutBaseUrl}/api/cart/${kind}/${lineId}/accept-price`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    }

    function cartRows(parentId: number): unknown {
      const db = new Database(dbPath, { readonly: true })
      try {
        const packs = db
          .prepare('SELECT * FROM cart_pack_lines WHERE parent_id = ? ORDER BY id')
          .all(parentId)
        const members = db
          .prepare(
            `SELECT m.* FROM cart_pack_line_members m
             JOIN cart_pack_lines l ON l.id = m.line_id
             WHERE l.parent_id = ?
             ORDER BY m.line_id, m.book_id`,
          )
          .all(parentId)
        const items = db
          .prepare('SELECT * FROM cart_item_lines WHERE parent_id = ? ORDER BY id')
          .all(parentId)
        return { packs, members, items }
      } finally {
        db.close()
      }
    }

    function guard(parentId: number): { attentionCount: number } {
      const db = new Database(dbPath, { readonly: true })
      try {
        return checkoutBlock(db, parentId)
      } finally {
        db.close()
      }
    }

    function repriceBook(book: Titled, price: number): Promise<unknown> {
      return adminSend('PATCH', booksItemPath(book.id), bookBody(book.title, price), 200)
    }

    function repriceItem(item: Titled, price: number): Promise<unknown> {
      return adminSend('PATCH', itemsItemPath(item.id), itemBody(item.title, 'Stationery', price), 200)
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-checkout-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, CHECKOUT_PORT)
      child = started.child
      adminCookie = await signInAdmin()
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('clean: answers the 3.3 lines plus stale null, the same goods total, and writes nothing', async () => {
      const seeded = await seed('clean')
      const before = cartRows(seeded.parent.id)
      const cartBefore = await getCart(seeded.parent.cookie)
      const checkout = await getCheckout(seeded.parent.cookie)
      assert.deepEqual(cartRows(seeded.parent.id), before)

      assert.equal(checkout.attentionCount, 0)
      assert.equal(checkout.goodsTotal, 4160)
      assert.deepEqual(
        checkout.lines,
        cartBefore.lines.map((line) => ({ ...line, stale: null })),
      )
      // GET /cart keeps its 3.3 shape: no stale key, no attention count.
      const cartAfter = await getCart(seeded.parent.cookie)
      assert.deepEqual(cartAfter, cartBefore)
      assert.deepEqual(Object.keys(cartAfter).sort(), ['goodsTotal', 'lines'])
      for (const line of cartAfter.lines) assert.equal('stale' in line, false)
      assert.deepEqual(guard(seeded.parent.id), { attentionCount: 0 })

      const empty = await registerParent('empty')
      assert.deepEqual(await getCheckout(empty.cookie), { lines: [], goodsTotal: 0, attentionCount: 0 })
    })

    it('pack archived: the pack, its school, or its grade going off the list flags the line unavailable', async () => {
      const targets: Array<(seeded: Seeded) => string> = [
        (seeded) => packsArchivePath(seeded.packId),
        (seeded) => catalogArchivePath('schools', seeded.schoolId),
        (seeded) => catalogArchivePath('grades', seeded.gradeId),
      ]
      for (const [index, target] of targets.entries()) {
        const seeded = await seed(`archived-${index}`)
        await adminSend('POST', target(seeded), undefined, 200)
        const before = cartRows(seeded.parent.id)
        const checkout = await getCheckout(seeded.parent.cookie)
        assert.deepEqual(cartRows(seeded.parent.id), before)
        assert.deepEqual(staleOf(checkout, 'pack'), { kind: 'unavailable' })
        assert.equal(staleOf(checkout, 'item'), null)
        assert.equal(checkout.attentionCount, 1)
        assert.equal(checkout.goodsTotal, 4160)
        assert.deepEqual(guard(seeded.parent.id), { attentionCount: 1 })
      }
    })

    it('book gone: an included book archived, removed from the pack, or deleted flags unavailable', async () => {
      const archived = await seed('book-archived')
      await adminSend('POST', booksArchivePath(archived.reader.id), undefined, 200)
      assert.deepEqual(staleOf(await getCheckout(archived.parent.cookie), 'pack'), { kind: 'unavailable' })

      const removed = await seed('book-removed')
      await adminSend(
        'PATCH',
        packsItemPath(removed.packId),
        packPatchBody('Checkout pack', 'Checkout', [removed.atlas.id, removed.workbook.id]),
        200,
      )
      assert.deepEqual(staleOf(await getCheckout(removed.parent.cookie), 'pack'), { kind: 'unavailable' })

      const deleted = await seed('book-deleted')
      await adminSend(
        'PATCH',
        packsItemPath(deleted.packId),
        packPatchBody('Checkout pack', 'Checkout', [deleted.atlas.id, deleted.workbook.id]),
        200,
      )
      await adminSend('DELETE', booksItemPath(deleted.reader.id), undefined, 204)
      const checkout = await getCheckout(deleted.parent.cookie)
      assert.deepEqual(staleOf(checkout, 'pack'), { kind: 'unavailable' })
      assert.equal(checkout.attentionCount, 1)

      // Unavailable wins over repriced on the same line.
      const both = await seed('book-both')
      await repriceBook(both.atlas, 1600)
      await adminSend('POST', booksArchivePath(both.reader.id), undefined, 200)
      assert.deepEqual(staleOf(await getCheckout(both.parent.cookie), 'pack'), { kind: 'unavailable' })
    })

    it('unticked book gone: archiving or repricing only an unticked member leaves the line clean', async () => {
      const repriced = await seed('unticked-repriced')
      await repriceBook(repriced.workbook, 950)
      const first = await getCheckout(repriced.parent.cookie)
      assert.equal(staleOf(first, 'pack'), null)
      assert.equal(first.attentionCount, 0)

      const archived = await seed('unticked-archived')
      await adminSend('POST', booksArchivePath(archived.workbook.id), undefined, 200)
      const second = await getCheckout(archived.parent.cookie)
      assert.equal(staleOf(second, 'pack'), null)
      assert.equal(second.attentionCount, 0)
      assert.deepEqual(guard(archived.parent.id), { attentionCount: 0 })
    })

    it('repriced: reports the live line total while stored figures and the goods total stay add-time', async () => {
      const seeded = await seed('repriced')
      await repriceBook(seeded.atlas, 1600)
      await repriceItem(seeded.item, 150)
      const before = cartRows(seeded.parent.id)
      const checkout = await getCheckout(seeded.parent.cookie)
      assert.deepEqual(cartRows(seeded.parent.id), before)

      assert.deepEqual(staleOf(checkout, 'pack'), { kind: 'repriced', lineTotal: 4000 })
      assert.deepEqual(staleOf(checkout, 'item'), { kind: 'repriced', lineTotal: 450 })
      const packLine = checkout.lines.find((line) => line.kind === 'pack')
      assert.ok(packLine && packLine.kind === 'pack')
      assert.equal(packLine.lineTotal, 3800)
      assert.equal(packLine.members.find((m) => m.bookId === seeded.atlas.id)?.unitPrice, 1500)
      assert.equal(checkout.goodsTotal, 4160)
      assert.equal(checkout.attentionCount, 2)
      assert.deepEqual(guard(seeded.parent.id), { attentionCount: 2 })
      assert.equal((await getCart(seeded.parent.cookie)).goodsTotal, 4160)
    })

    it('accept pack: rewrites only the stale included prices, then the line is clean', async () => {
      const seeded = await seed('accept-pack')
      await repriceBook(seeded.atlas, 1600)
      await repriceBook(seeded.workbook, 990)
      const response = await accept('packs', seeded.packLineId, seeded.parent.cookie, { lineTotal: 4000 })
      assert.equal(response.status, 200)
      const body = (await response.json()) as CheckoutLineJson
      assert.equal(body.kind, 'pack')
      assert.equal(body.lineTotal, 4000)
      assert.equal(body.stale, null)

      const rows = cartRows(seeded.parent.id) as { members: Array<{ book_id: number; unit_price: number; title: string }> }
      const price = (bookId: number) => rows.members.find((m) => m.book_id === bookId)?.unit_price
      assert.equal(price(seeded.atlas.id), 1600)
      assert.equal(price(seeded.reader.id), 800)
      assert.equal(price(seeded.workbook.id), 900)
      assert.equal(rows.members.find((m) => m.book_id === seeded.atlas.id)?.title, seeded.atlas.title)

      const checkout = await getCheckout(seeded.parent.cookie)
      assert.equal(staleOf(checkout, 'pack'), null)
      assert.equal(checkout.attentionCount, 0)
      assert.equal(checkout.goodsTotal, 4000 + 360)
      assert.equal((await getCart(seeded.parent.cookie)).goodsTotal, 4360)
    })

    it('accept item: stores the live unit price when it matches', async () => {
      const seeded = await seed('accept-item')
      await repriceItem(seeded.item, 150)
      const response = await accept('items', seeded.itemLineId, seeded.parent.cookie, { unitPrice: 150 })
      assert.equal(response.status, 200)
      const body = (await response.json()) as CheckoutLineJson
      assert.equal(body.kind, 'item')
      assert.equal(body.lineTotal, 450)
      assert.equal(body.stale, null)
      const rows = cartRows(seeded.parent.id) as { items: Array<{ unit_price: number; title: string }> }
      assert.equal(rows.items[0].unit_price, 150)
      assert.equal(rows.items[0].title, seeded.item.title)
      const checkout = await getCheckout(seeded.parent.cookie)
      assert.equal(staleOf(checkout, 'item'), null)
      assert.equal(checkout.goodsTotal, 3800 + 450)
    })

    it('repriced back: returning a ticked book to its add-time price clears the flag', async () => {
      const seeded = await seed('repriced-back')
      await repriceBook(seeded.atlas, 1600)
      let checkout = await getCheckout(seeded.parent.cookie)
      assert.deepEqual(staleOf(checkout, 'pack'), { kind: 'repriced', lineTotal: 4000 })
      assert.equal(checkout.attentionCount, 1)
      assert.deepEqual(guard(seeded.parent.id), { attentionCount: 1 })

      await repriceBook(seeded.atlas, 1500)
      checkout = await getCheckout(seeded.parent.cookie)
      assert.equal(staleOf(checkout, 'pack'), null)
      assert.equal(checkout.attentionCount, 0)
      assert.deepEqual(guard(seeded.parent.id), { attentionCount: 0 })
    })

    it('accept helper: builds the request from real repriced lines and the server accepts it', async () => {
      const seeded = await seed('helper')
      await repriceBook(seeded.atlas, 1600)
      await repriceItem(seeded.item, 150)
      const parsed = parseCheckoutBody(await getCheckout(seeded.parent.cookie))
      assert.ok(parsed)
      const packLine = parsed.lines.find((line) => line.kind === 'pack')
      const itemLine = parsed.lines.find((line) => line.kind === 'item')
      assert.ok(packLine && itemLine)

      const packRequest = acceptPriceRequest(packLine)
      const itemRequest = acceptPriceRequest(itemLine)
      assert.deepEqual(packRequest, {
        url: `/api/cart/packs/${seeded.packLineId}/accept-price`,
        body: { lineTotal: 4000 },
      })
      assert.deepEqual(itemRequest, {
        url: `/api/cart/items/${seeded.itemLineId}/accept-price`,
        body: { unitPrice: 150 },
      })
      for (const request of [packRequest, itemRequest]) {
        assert.ok(request)
        const response = await fetch(`${checkoutBaseUrl}${request.url}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: seeded.parent.cookie },
          body: JSON.stringify(request.body),
        })
        assert.equal(response.status, 200, request.url)
      }
      const after = await getCheckout(seeded.parent.cookie)
      assert.equal(staleOf(after, 'pack'), null)
      assert.equal(staleOf(after, 'item'), null)
      assert.equal(after.attentionCount, 0)

      // Null for anything that is not a repriced line, or an item figure that is not whole rupees.
      const clean = parseCheckoutBody(after)
      assert.ok(clean)
      for (const line of clean.lines) assert.equal(acceptPriceRequest(line), null)
      assert.equal(acceptPriceRequest({ ...itemLine, stale: { kind: 'unavailable' } }), null)
      assert.equal(
        acceptPriceRequest({ ...itemLine, quantity: 3, stale: { kind: 'repriced', lineTotal: 451 } }),
        null,
      )
    })

    it('moved again: a figure that no longer matches, a clean line, or an unavailable line is a 409', async () => {
      const seeded = await seed('moved')
      const expectConflict = async (kind: 'packs' | 'items', lineId: number, body: unknown) => {
        const before = cartRows(seeded.parent.id)
        const response = await accept(kind, lineId, seeded.parent.cookie, body)
        assert.equal(response.status, 409, `${kind} ${JSON.stringify(body)}`)
        const error = (await response.json()) as ErrorBody
        assert.equal(error.error.code, 'conflict')
        assert.equal(error.error.message, CONFLICT_MESSAGE)
        assert.deepEqual(cartRows(seeded.parent.id), before)
      }

      // Not repriced at all.
      await expectConflict('packs', seeded.packLineId, { lineTotal: 3800 })
      await expectConflict('items', seeded.itemLineId, { unitPrice: 120 })

      // Repriced, then moved again before the tap.
      await repriceBook(seeded.atlas, 1600)
      await repriceItem(seeded.item, 150)
      await repriceBook(seeded.atlas, 1650)
      await repriceItem(seeded.item, 160)
      await expectConflict('packs', seeded.packLineId, { lineTotal: 4000 })
      await expectConflict('items', seeded.itemLineId, { unitPrice: 150 })

      // Unavailable.
      await adminSend('POST', packsArchivePath(seeded.packId), undefined, 200)
      await adminSend('POST', itemsArchivePath(seeded.item.id), undefined, 200)
      await expectConflict('packs', seeded.packLineId, { lineTotal: 4100 })
      await expectConflict('items', seeded.itemLineId, { unitPrice: 160 })
      const checkout = await getCheckout(seeded.parent.cookie)
      assert.deepEqual(staleOf(checkout, 'pack'), { kind: 'unavailable' })
      assert.deepEqual(staleOf(checkout, 'item'), { kind: 'unavailable' })
      assert.equal(checkout.attentionCount, 2)
    })

    it('bad body: a missing or non-integer figure is a 400 and writes nothing', async () => {
      const seeded = await seed('bad-body')
      await repriceBook(seeded.atlas, 1600)
      await repriceItem(seeded.item, 150)
      const before = cartRows(seeded.parent.id)
      for (const body of [{}, { lineTotal: '4000' }, { lineTotal: 4000.5 }, { lineTotal: null }, { lineTotal: -1 }]) {
        const response = await accept('packs', seeded.packLineId, seeded.parent.cookie, body)
        assert.equal(response.status, 400, JSON.stringify(body))
        assert.equal(((await response.json()) as ErrorBody).error.code, 'invalid_input')
      }
      for (const body of [
        {},
        { unitPrice: '150' },
        { unitPrice: 150.5 },
        { unitPrice: null },
        { unitPrice: -1 },
        { lineTotal: 450 },
      ]) {
        const response = await accept('items', seeded.itemLineId, seeded.parent.cookie, body)
        assert.equal(response.status, 400, JSON.stringify(body))
        assert.equal(((await response.json()) as ErrorBody).error.code, 'invalid_input')
      }
      assert.deepEqual(cartRows(seeded.parent.id), before)
    })

    it("foreign or unknown line: 404 with the line-not-found message and no write", async () => {
      const seeded = await seed('foreign')
      await repriceBook(seeded.atlas, 1600)
      await repriceItem(seeded.item, 150)
      const other = await registerParent('other')
      // Pack and item line ids come from separate tables and can coincide. When they do, add a
      // second item line first (it takes a higher rowid while the clashing row still exists),
      // then remove the clashing one, so the pack-id-on-item-route row is a deterministic 404.
      const itemLineIdFor = (): number | undefined => {
        const db = new Database(dbPath, { readonly: true })
        try {
          const row = db
            .prepare('SELECT id FROM cart_item_lines WHERE parent_id = ? ORDER BY id DESC')
            .get(seeded.parent.id) as { id: number } | undefined
          return row?.id
        } finally {
          db.close()
        }
      }
      if (itemLineIdFor() === seeded.packLineId) {
        const spare = (await adminSend(
          'POST',
          '/api/admin/items',
          itemBody(`Spare ${suffix('foreign')}`, 'Stationery', 120),
          201,
        )) as Titled
        const added = await fetch(`${checkoutBaseUrl}/api/cart/items`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: seeded.parent.cookie },
          body: JSON.stringify({ itemId: spare.id, quantity: 1 }),
        })
        assert.equal(added.status, 201)
        const removed = await fetch(`${checkoutBaseUrl}/api/cart/items/${seeded.packLineId}`, {
          method: 'DELETE',
          headers: { cookie: seeded.parent.cookie },
        })
        assert.equal(removed.status, 204)
      }
      const itemLineId = itemLineIdFor()
      assert.ok(itemLineId !== undefined && itemLineId !== seeded.packLineId)
      const before = cartRows(seeded.parent.id)
      const attempts: Array<['packs' | 'items', number | string, string | undefined, unknown]> = [
        ['packs', seeded.packLineId, other.cookie, { lineTotal: 4000 }],
        ['items', itemLineId, other.cookie, { unitPrice: 150 }],
        ['packs', 999999, seeded.parent.cookie, { lineTotal: 4000 }],
        ['items', 'abc', seeded.parent.cookie, { unitPrice: 150 }],
        // A pack line id on the item route is not an item line.
        ['items', seeded.packLineId, seeded.parent.cookie, { unitPrice: 150 }],
      ]
      const packLineBefore = (await getCheckout(seeded.parent.cookie)).lines.find(
        (line) => line.kind === 'pack',
      )
      for (const [kind, lineId, cookie, body] of attempts) {
        const response = await accept(kind, lineId, cookie, body)
        assert.equal(response.status, 404, `${kind} ${lineId}`)
        const error = (await response.json()) as ErrorBody
        assert.equal(error.error.code, 'not_found')
        assert.equal(error.error.message, 'That line is not in your cart.')
      }
      assert.deepEqual(cartRows(seeded.parent.id), before)
      assert.deepEqual(
        (await getCheckout(seeded.parent.cookie)).lines.find((line) => line.kind === 'pack'),
        packLineBefore,
      )
    })

    it('auth: 401 without a cookie and 403 for an admin on every new route', async () => {
      const seeded = await seed('auth')
      await repriceBook(seeded.atlas, 1600)
      const before = cartRows(seeded.parent.id)
      const anonymous = await fetch(`${checkoutBaseUrl}/api/cart/checkout`)
      assert.equal(anonymous.status, 401)
      assert.equal(((await anonymous.json()) as ErrorBody).error.code, 'unauthenticated')
      const admin = await fetch(`${checkoutBaseUrl}/api/cart/checkout`, { headers: { cookie: adminCookie } })
      assert.equal(admin.status, 403)
      assert.equal(((await admin.json()) as ErrorBody).error.code, 'forbidden')
      for (const [kind, lineId, body] of [
        ['packs', seeded.packLineId, { lineTotal: 4000 }],
        ['items', seeded.itemLineId, { unitPrice: 120 }],
      ] as const) {
        const noCookie = await accept(kind, lineId, undefined, body)
        assert.equal(noCookie.status, 401, kind)
        assert.equal(((await noCookie.json()) as ErrorBody).error.code, 'unauthenticated')
        const asAdmin = await accept(kind, lineId, adminCookie, body)
        assert.equal(asAdmin.status, 403, kind)
        assert.equal(((await asAdmin.json()) as ErrorBody).error.code, 'forbidden')
      }
      assert.deepEqual(cartRows(seeded.parent.id), before)
    })

    it('guard: checkoutBlock reports the same count as GET while lines are resolved one by one', async () => {
      const seeded = await seed('guard')
      await repriceBook(seeded.atlas, 1600)
      await adminSend('POST', itemsArchivePath(seeded.item.id), undefined, 200)
      let checkout = await getCheckout(seeded.parent.cookie)
      assert.equal(checkout.attentionCount, 2)
      assert.deepEqual(guard(seeded.parent.id), { attentionCount: 2 })

      const removed = await fetch(`${checkoutBaseUrl}/api/cart/items/${seeded.itemLineId}`, {
        method: 'DELETE',
        headers: { cookie: seeded.parent.cookie },
      })
      assert.equal(removed.status, 204)
      checkout = await getCheckout(seeded.parent.cookie)
      assert.equal(checkout.attentionCount, 1)
      assert.deepEqual(guard(seeded.parent.id), { attentionCount: 1 })

      const accepted = await accept('packs', seeded.packLineId, seeded.parent.cookie, { lineTotal: 4000 })
      assert.equal(accepted.status, 200)
      checkout = await getCheckout(seeded.parent.cookie)
      assert.equal(checkout.attentionCount, 0)
      assert.deepEqual(guard(seeded.parent.id), { attentionCount: 0 })
    })

    it('parses a real checkout body intact and fails as a whole on a malformed flag', async () => {
      const seeded = await seed('parse')
      await repriceBook(seeded.atlas, 1600)
      await adminSend('POST', itemsArchivePath(seeded.item.id), undefined, 200)
      const raw = await getCheckout(seeded.parent.cookie)
      const parsed = parseCheckoutBody(raw)
      assert.ok(parsed)
      assert.deepEqual(parsed, raw)
      assert.equal(parsed.attentionCount, 2)

      const missingStale = structuredClone(raw) as unknown as { lines: Array<Record<string, unknown>> }
      delete missingStale.lines[0].stale
      assert.equal(parseCheckoutBody(missingStale), undefined)
      const badKind = structuredClone(raw) as unknown as { lines: Array<Record<string, unknown>> }
      badKind.lines[0].stale = { kind: 'gone' }
      assert.equal(parseCheckoutBody(badKind), undefined)
      const badTotal = structuredClone(raw) as unknown as { lines: Array<Record<string, unknown>> }
      badTotal.lines[0].stale = { kind: 'repriced', lineTotal: '4000' }
      assert.equal(parseCheckoutBody(badTotal), undefined)
      assert.equal(parseCheckoutBody({ lines: raw.lines, goodsTotal: raw.goodsTotal }), undefined)
      assert.deepEqual(parseCheckoutBody({ lines: [], goodsTotal: 0, attentionCount: 0 }), {
        lines: [],
        goodsTotal: 0,
        attentionCount: 0,
      })
    })

    it('wires the checkout module, page, route, and styles', async () => {
      const read = (...parts: string[]) => readFile(path.join(...parts), 'utf8')
      const cartHttp = await read(serverRoot, 'cart', 'http.ts')
      const cartIndex = await read(serverRoot, 'cart', 'index.ts')
      const staleness = await read(serverRoot, 'cart', 'staleness.ts')
      const cartPacks = await read(serverRoot, 'cart', 'packs.ts')
      const cartItems = await read(serverRoot, 'cart', 'items.ts')
      const cartEdits = await read(serverRoot, 'cart', 'edits.ts')
      const storefront = path.join(repoRoot, 'client', 'storefront', 'src')
      const checkoutPage = await read(storefront, 'CheckoutPage.tsx')
      const cartPage = await read(storefront, 'CartPage.tsx')
      const storefrontApp = await readFile(storefrontAppPath, 'utf8')
      const baseCss = await readFile(baseCssPath, 'utf8')

      // Server: SQL stays out of http.ts; cart never reads catalog tables.
      assert.doesNotMatch(cartHttp, /db\.prepare/)
      for (const source of [cartHttp, staleness, cartPacks, cartItems, cartEdits]) {
        assert.doesNotMatch(source, /FROM (packs|books|grades|schools|items|pack_books)\b/)
      }
      assert.doesNotMatch(staleness, /db\.prepare|UPDATE|INSERT|DELETE/)
      assert.doesNotMatch(cartItems, /SET title/)
      assert.doesNotMatch(cartPacks, /SET title/)
      assert.match(staleness, /export function annotateCart/)
      assert.match(staleness, /export function checkoutBlock/)
      assert.match(staleness, /cartGoodsTotal\(/)
      assert.match(cartIndex, /export \{ checkoutBlock \}/)
      assert.match(cartPacks, /export function acceptPackLinePrice/)
      assert.match(cartItems, /export function acceptItemLinePrice/)
      assert.match(cartPacks, /getBrowsePack\(db, line\.packId\)/)
      assert.match(cartItems, /getLiveItem\(db, line\.itemId\)/)
      assert.match(cartEdits, /export function priceConflict/)
      assert.match(cartEdits, /That price changed again\. Review this line\./)
      assert.match(cartHttp, /router\.post\(\s*'\/cart\/packs\/:lineId\/accept-price'/)
      assert.match(cartHttp, /router\.post\(\s*'\/cart\/items\/:lineId\/accept-price'/)
      const checkoutAt = cartHttp.indexOf("'/cart/checkout'")
      assert.ok(checkoutAt > 0)
      assert.ok(checkoutAt < cartHttp.indexOf("'/cart/packs/:lineId"))
      assert.ok(checkoutAt < cartHttp.indexOf("'/cart/items/:lineId"))
      assert.doesNotMatch(cartHttp, /\/orders|Idempotency-Key/i)

      // Page: the exact delivery copy, no delivery figure, blocked Place Order in place.
      assert.match(checkoutPage, new RegExp(DELIVERY_COPY))
      assert.equal(checkoutPage.split(DELIVERY_COPY).length, 2)
      assert.match(checkoutPage, /checkout-delivery-strip/)
      assert.ok(
        checkoutPage.indexOf('checkout-delivery-strip">') < checkoutPage.indexOf('className="cart-goods-total"'),
        'the delivery strip sits above the goods total',
      )
      assert.match(checkoutPage, /formatRupees\(goodsTotal\)/)
      assert.doesNotMatch(checkoutPage, /delivery(Price|Fee|Charge|Estimate)|deliveryRupees/i)
      assert.match(checkoutPage, /aria-disabled=\{blocked \? 'true' : undefined\}/)
      assert.match(checkoutPage, /aria-describedby=\{blocked \? BLOCKED_REASON_ID : undefined\}/)
      assert.match(checkoutPage, /id=\{BLOCKED_REASON_ID\}/)
      assert.match(checkoutPage, /button-blocked/)
      // Story 4.2 wires Place Order; the label still appears exactly once.
      assert.equal((checkoutPage.match(/Place Order/g) ?? []).length, 1)
      // Blocked uses aria-disabled only, so the button stays focusable.
      assert.doesNotMatch(checkoutPage, /\sdisabled=\{blocked/)
      assert.match(checkoutPage, /className="checkout-banner-region" aria-live="polite"/)
      assert.match(checkoutPage, /still needs? attention/)
      assert.match(checkoutPage, /notice notice-danger/)
      assert.match(checkoutPage, /notice notice-warning/)
      assert.match(checkoutPage, /Remove this line/)
      assert.match(checkoutPage, /Accept \{formatRupees\(stale\.lineTotal\)\}/)
      assert.match(checkoutPage, /\/api\/cart\/checkout/)
      assert.match(checkoutPage, /\/api\/parents\/me/)
      assert.match(checkoutPage, /deliveryAddress/)
      assert.match(checkoutPage, /new AbortController\(\)/)
      assert.match(checkoutPage, /parseCheckoutBody/)
      assert.match(checkoutPage, /<textarea/)
      assert.match(checkoutPage, /role="alert"/)
      assert.match(checkoutPage, /Cart is Empty/)
      assert.match(checkoutPage, /refresh\(\)/)
      assert.match(checkoutPage, /acceptPriceRequest\(line\)/)
      assert.match(checkoutPage, /tabIndex=\{-1\} ref=\{headingRef\}/)
      assert.doesNotMatch(checkoutPage, /<input/)
      assert.doesNotMatch(checkoutPage, /localStorage|sessionStorage|indexedDB/)
      assert.doesNotMatch(checkoutPage, /role="dialog"|modal/i)

      // Route and entry point.
      const gated = storefrontApp.match(/<Route element=\{<AuthGate \/>\}>([\s\S]*?)<\/Route>/)?.[1]
      assert.ok(gated)
      assert.match(gated, /path="cart\/checkout" element=\{<CheckoutPage \/>\}/)
      assert.match(cartPage, /<Link className="button-primary cart-checkout" to="\/cart\/checkout">/)
      assert.ok(
        cartPage.indexOf('to="/cart/checkout"') > cartPage.indexOf('lines.length === 0 ?'),
        'Checkout only renders in the non-empty branch',
      )

      // Styles.
      const blockedRule = cssRule(baseCss, '.button-primary.button-blocked')
      assert.match(blockedRule, /var\(--color-surface-sunken\)/)
      assert.match(blockedRule, /var\(--color-text-secondary\)/)
      assert.match(blockedRule, /var\(--space-edge-hairline\) solid var\(--color-border-default\)/)
      assert.match(blockedRule, /box-shadow: none/)
      const strip = cssRule(baseCss, '.checkout-delivery-strip')
      assert.match(strip, /var\(--color-accent-quiet\)/)
      assert.match(strip, /var\(--space-edge-hairline\) solid var\(--color-border-default\)/)
      const notice = cssRule(baseCss, '.notice')
      assert.match(notice, /padding: 13px 15px/)
      assert.match(notice, /var\(--radius-md\)/)
      assert.match(notice, /var\(--space-edge-strong\)/)
      assert.match(cssRule(baseCss, '.notice-danger'), /var\(--color-danger-tint\)/)
      assert.match(cssRule(baseCss, '.notice-danger'), /var\(--color-danger\)/)
      assert.match(cssRule(baseCss, '.notice-warning'), /var\(--color-warn-tint\)/)
      assert.match(cssRule(baseCss, '.notice-warning'), /var\(--color-warning\)/)
      assert.match(cssRule(baseCss, '.notice-actions'), /margin-top: 13px/)
      // Both notice buttons (Accept and Remove this line) keep the 44px touch minimum.
      const noticeButtons = baseCss.match(
        /\.notice-actions > \.button-primary,\s*\.notice-actions > \.button-secondary\s*\{([^}]*)\}/,
      )?.[1]
      assert.ok(noticeButtons, 'missing the shared notice button rule')
      assert.match(noticeButtons, /min-height: var\(--space-touch-min\)/)
      assert.ok(cssRule(baseCss, '.checkout-note-control'))
    })
  })

  describe('Place Order — snapshot, number, one tap', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let adminCookie: string
    let parentSerial = 0

    type OrderJson = {
      id: number
      publicNumber: number
      status: string
      goodsTotal: number
      placedAt: string
    }
    type ErrorBody = { error: { code: string; message: string; field?: string } }
    type Parent = { cookie: string; id: number; name: string }
    type Titled = { id: number; title: string }
    type Seeded = {
      parent: Parent
      atlas: Titled
      reader: Titled
      workbook: Titled
      item: Titled
      packId: number
      packName: string
      gradeName: string
    }

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${ordersBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function adminSend(
      method: 'POST' | 'PATCH' | 'DELETE',
      pathName: string,
      body: unknown,
      expected: number,
    ): Promise<unknown> {
      const response = await fetch(`${ordersBaseUrl}${pathName}`, {
        method,
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      assert.equal(response.status, expected, `${method} ${pathName}: ${response.status}`)
      return expected === 204 ? undefined : await response.json()
    }

    function suffix(tag: string): string {
      return `${Date.now()}-${tag}`
    }

    async function registerParent(tag: string, secondPhone?: string): Promise<Parent> {
      parentSerial += 1
      const email = `orders.${tag}.${parentSerial}.${Date.now()}@example.com`
      const name = `Orders ${tag}`
      const response = await fetch(`${ordersBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          deliveryAddress: '12 Temple Road, Nugegoda',
          whatsapp: '0771234567',
          ...(secondPhone === undefined ? {} : { secondPhone }),
          email,
          password: 'evening-order',
        }),
      })
      assert.equal(response.status, 201)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      const db = new Database(dbPath, { readonly: true })
      try {
        const row = db.prepare('SELECT id FROM parents WHERE email = ?').get(email) as
          | { id: number }
          | undefined
        assert.ok(row)
        return { cookie: cookieHeader(cookie), id: row.id, name }
      } finally {
        db.close()
      }
    }

    async function addItem(cookie: string, itemId: number, quantity: number): Promise<void> {
      const response = await fetch(`${ordersBaseUrl}/api/cart/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ itemId, quantity }),
      })
      assert.ok(response.status === 201 || response.status === 200, `add item ${response.status}`)
    }

    /**
     * Own school and grade per seed. Atlas x2 @1,500 and Reader x1 @800 ticked, Workbook @900
     * unticked; an item x3 @120. Goods total 4,160. A given parent reuses the catalog rows.
     */
    async function seed(tag: string, parent?: Parent): Promise<Seeded> {
      const s = suffix(tag)
      const schoolId = ((await adminSend('POST', '/api/admin/schools', catalogNameBody(`Orders school ${s}`), 201)) as { id: number }).id
      const gradeName = `Grade ${s}`
      const gradeId = ((await adminSend('POST', '/api/admin/grades', catalogNameBody(gradeName), 201)) as { id: number }).id
      const atlas = (await adminSend('POST', '/api/admin/books', bookBody(`Atlas ${s}`, 1500), 201)) as Titled
      const reader = (await adminSend('POST', '/api/admin/books', bookBody(`Reader ${s}`, 800), 201)) as Titled
      const workbook = (await adminSend('POST', '/api/admin/books', bookBody(`Workbook ${s}`, 900), 201)) as Titled
      const packName = `Orders pack ${s}`
      const pack = (await adminSend(
        'POST',
        '/api/admin/packs',
        packCreateBody(packName, schoolId, gradeId, 'Orders', [atlas.id, reader.id, workbook.id]),
        201,
      )) as { id: number }
      const item = (await adminSend('POST', '/api/admin/items', itemBody(`Pencil ${s}`, 'Stationery', 120), 201)) as Titled
      const owner = parent ?? (await registerParent(tag))

      const packResponse = await fetch(`${ordersBaseUrl}/api/cart/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: owner.cookie },
        body: JSON.stringify({ packId: pack.id, selection: `${atlas.id}:2,${reader.id}:1` }),
      })
      assert.equal(packResponse.status, 201)
      await addItem(owner.cookie, item.id, 3)
      return { parent: owner, atlas, reader, workbook, item, packId: pack.id, packName, gradeName }
    }

    function place(
      cookie: string | undefined,
      key: string | undefined,
      body: unknown = {},
    ): Promise<Response> {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (cookie) headers.cookie = cookie
      if (key !== undefined) headers['Idempotency-Key'] = key
      return fetch(`${ordersBaseUrl}/api/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    }

    async function listOrders(cookie: string): Promise<OrderJson[]> {
      const response = await fetch(`${ordersBaseUrl}/api/orders`, { headers: { cookie } })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      return ((await response.json()) as { orders: OrderJson[] }).orders
    }

    async function cartLineCount(cookie: string): Promise<number> {
      const response = await fetch(`${ordersBaseUrl}/api/cart`, { headers: { cookie } })
      assert.equal(response.status, 200)
      return ((await response.json()) as { lines: unknown[] }).lines.length
    }

    function readDb<T>(read: (db: Database.Database) => T): T {
      const db = new Database(dbPath, { readonly: true })
      try {
        return read(db)
      } finally {
        db.close()
      }
    }

    function orderCount(parentId: number): number {
      return readDb(
        (db) =>
          (db.prepare('SELECT COUNT(*) AS n FROM orders WHERE parent_id = ?').get(parentId) as { n: number }).n,
      )
    }

    function cartRows(parentId: number): unknown {
      return readDb((db) => ({
        packs: db.prepare('SELECT * FROM cart_pack_lines WHERE parent_id = ? ORDER BY id').all(parentId),
        members: db
          .prepare(
            `SELECT m.* FROM cart_pack_line_members m
             JOIN cart_pack_lines l ON l.id = m.line_id
             WHERE l.parent_id = ?
             ORDER BY m.line_id, m.book_id`,
          )
          .all(parentId),
        items: db.prepare('SELECT * FROM cart_item_lines WHERE parent_id = ? ORDER BY id').all(parentId),
      }))
    }

    async function expectRefused(
      response: Response,
      status: number,
      code: string,
      message?: string,
    ): Promise<void> {
      assert.equal(response.status, status)
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, code)
      if (message !== undefined) assert.equal(body.error.message, message)
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-orders-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, ORDERS_PORT)
      child = started.child
      adminCookie = await signInAdmin()
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    let first: Seeded
    let firstOrder: OrderJson

    it('place: snapshots the cart and the account, numbers it 1001, and empties the cart', async () => {
      first = await seed('place')
      const response = await place(first.parent.cookie, 'k1', {
        note: ' Gate 2 ',
        deliveryAddress: 'X',
        whatsapp: '0700000000',
        goodsTotal: 1,
      })
      assert.equal(response.status, 201)
      const body = (await response.json()) as { order: OrderJson }
      assert.deepEqual(Object.keys(body), ['order'])
      firstOrder = body.order
      assert.deepEqual(Object.keys(firstOrder).sort(), ['goodsTotal', 'id', 'placedAt', 'publicNumber', 'status'])
      assert.equal(firstOrder.publicNumber, 1001)
      assert.equal(firstOrder.status, 'Order Is Placed')
      assert.equal(firstOrder.goodsTotal, 4160)
      assert.equal(new Date(firstOrder.placedAt).toISOString(), firstOrder.placedAt)

      const snapshot = readDb((db) => {
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(firstOrder.id) as Record<string, unknown>
        const packs = db
          .prepare('SELECT * FROM order_pack_lines WHERE order_id = ? ORDER BY position')
          .all(firstOrder.id) as Array<Record<string, unknown>>
        const books = db
          .prepare(
            `SELECT b.* FROM order_pack_line_books b
             JOIN order_pack_lines l ON l.id = b.line_id
             WHERE l.order_id = ?
             ORDER BY b.book_id`,
          )
          .all(firstOrder.id) as Array<Record<string, unknown>>
        const items = db
          .prepare('SELECT * FROM order_item_lines WHERE order_id = ? ORDER BY position')
          .all(firstOrder.id) as Array<Record<string, unknown>>
        return { order, packs, books, items }
      })
      assert.equal(snapshot.order.parent_id, first.parent.id)
      assert.equal(snapshot.order.idempotency_key, 'k1')
      assert.equal(snapshot.order.status, 'Order Is Placed')
      assert.equal(snapshot.order.parent_name, first.parent.name)
      // The address comes from the account, never the body.
      assert.equal(snapshot.order.delivery_address, '12 Temple Road, Nugegoda')
      assert.equal(snapshot.order.whatsapp, '+94771234567')
      assert.equal(snapshot.order.second_phone, null)
      assert.equal(snapshot.order.parent_delivery_note, 'Gate 2')
      assert.equal(snapshot.order.goods_total_rupees, 4160)
      assert.equal(snapshot.order.placed_at, firstOrder.placedAt)

      assert.equal(snapshot.packs.length, 1)
      assert.equal(snapshot.packs[0].pack_id, first.packId)
      assert.equal(snapshot.packs[0].pack_name, first.packName)
      assert.equal(snapshot.packs[0].label, `Pack 1 of ${first.gradeName}`)
      assert.equal(snapshot.packs[0].grade_name, first.gradeName)
      assert.equal(snapshot.packs[0].line_total_rupees, 3800)
      // Included members only: the unticked Workbook is not part of the order.
      assert.deepEqual(
        snapshot.books.map((book) => [book.book_id, book.title, book.unit_price_rupees, book.quantity]),
        [
          [first.atlas.id, first.atlas.title, 1500, 2],
          [first.reader.id, first.reader.title, 800, 1],
        ],
      )
      assert.equal(snapshot.items.length, 1)
      assert.equal(snapshot.items[0].item_id, first.item.id)
      assert.equal(snapshot.items[0].title, first.item.title)
      assert.equal(snapshot.items[0].unit_price_rupees, 120)
      assert.equal(snapshot.items[0].quantity, 3)
      assert.equal(snapshot.items[0].line_total_rupees, 360)

      assert.equal(await cartLineCount(first.parent.cookie), 0)
      assert.deepEqual(cartRows(first.parent.id), { packs: [], members: [], items: [] })
    })

    it('replay: the same parent and key answer 200 with the same order, even with a new cart', async () => {
      await addItem(first.parent.cookie, first.item.id, 1)
      const before = cartRows(first.parent.id)
      const response = await place(first.parent.cookie, 'k1', { note: 'different' })
      assert.equal(response.status, 200)
      assert.deepEqual(((await response.json()) as { order: OrderJson }).order, firstOrder)
      assert.equal(orderCount(first.parent.id), 1)
      assert.deepEqual(cartRows(first.parent.id), before)
      assert.equal(await cartLineCount(first.parent.cookie), 1)
    })

    it('sequence and scoped keys: a second parent reusing k1 gets a new order numbered 1002', async () => {
      const second = await seed('sequence')
      const response = await place(second.parent.cookie, 'k1', { note: '   ' })
      assert.equal(response.status, 201)
      const order = ((await response.json()) as { order: OrderJson }).order
      assert.equal(order.publicNumber, 1002)
      assert.notEqual(order.id, firstOrder.id)
      assert.equal(orderCount(second.parent.id), 1)
      assert.equal(orderCount(first.parent.id), 1)
      const note = readDb(
        (db) =>
          (db.prepare('SELECT parent_delivery_note AS note FROM orders WHERE id = ?').get(order.id) as { note: string | null }).note,
      )
      assert.equal(note, null)
    })

    it('double tap: two concurrent places with one key make exactly one order', async () => {
      const seeded = await seed('double')
      const [a, b] = await Promise.all([
        place(seeded.parent.cookie, 'tap-key', {}),
        place(seeded.parent.cookie, 'tap-key', {}),
      ])
      assert.deepEqual([a.status, b.status].sort(), [200, 201])
      const orderA = ((await a.json()) as { order: OrderJson }).order
      const orderB = ((await b.json()) as { order: OrderJson }).order
      assert.deepEqual(orderA, orderB)
      assert.equal(orderCount(seeded.parent.id), 1)
      assert.equal(await cartLineCount(seeded.parent.cookie), 0)
    })

    it('stale: a flagged line refuses Place with 409 and leaves the cart alone', async () => {
      const seeded = await seed('stale')
      await adminSend('PATCH', booksItemPath(seeded.atlas.id), bookBody(seeded.atlas.title, 1600), 200)
      const before = cartRows(seeded.parent.id)
      await expectRefused(
        await place(seeded.parent.cookie, 'stale-key'),
        409,
        'checkout_blocked',
        '1 line still needs attention.',
      )
      await adminSend('POST', itemsArchivePath(seeded.item.id), undefined, 200)
      await expectRefused(
        await place(seeded.parent.cookie, 'stale-key'),
        409,
        'checkout_blocked',
        '2 lines still need attention.',
      )
      assert.equal(orderCount(seeded.parent.id), 0)
      assert.deepEqual(cartRows(seeded.parent.id), before)
    })

    it('empty: a cart with no lines is a 409 and makes no order', async () => {
      const parent = await registerParent('empty')
      await expectRefused(await place(parent.cookie, 'empty-key'), 409, 'cart_empty', 'Your cart is empty.')
      assert.equal(orderCount(parent.id), 0)
    })

    it('bad key or note: 400 invalid_input and nothing is written', async () => {
      const seeded = await seed('bad')
      const before = cartRows(seeded.parent.id)
      const attempts: Array<[string | undefined, unknown]> = [
        [undefined, {}],
        ['', {}],
        ['x'.repeat(101), {}],
        ['badékey', {}],
        ['ok-key', { note: 'n'.repeat(1001) }],
        ['ok-key', { note: 42 }],
        ['ok-key', { note: null }],
        ['ok-key', { note: ['Gate 2'] }],
      ]
      for (const [key, body] of attempts) {
        const headers: Record<string, string> = { 'content-type': 'application/json', cookie: seeded.parent.cookie }
        // A non-ASCII header value cannot go through fetch, so send it as raw bytes.
        if (key !== undefined && /[^\x00-\x7f]/.test(key)) {
          const response = await rawPost(key, seeded.parent.cookie)
          assert.equal(response.status, 400, 'non-ASCII key')
          continue
        }
        if (key !== undefined) headers['Idempotency-Key'] = key
        const response = await fetch(`${ordersBaseUrl}/api/orders`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
        await expectRefused(response, 400, 'invalid_input')
      }
      assert.equal(orderCount(seeded.parent.id), 0)
      assert.deepEqual(cartRows(seeded.parent.id), before)

      // The limits themselves are accepted: a 100-character key and a 1000-character note.
      const response = await place(seeded.parent.cookie, 'k'.repeat(100), { note: 'n'.repeat(1000) })
      assert.equal(response.status, 201)
    })

    async function rawPost(key: string, cookie: string): Promise<{ status: number }> {
      const { request } = await import('node:http')
      return await new Promise((resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port: Number(ORDERS_PORT),
            path: '/api/orders',
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie },
          },
          (res) => {
            res.resume()
            res.on('end', () => resolve({ status: res.statusCode ?? 0 }))
          },
        )
        req.on('error', reject)
        // Raw latin1 bytes bypass Node's header validation on the client side.
        req.removeHeader('content-length')
        req.setHeader('Idempotency-Key', Buffer.from(key, 'utf8').toString('latin1'))
        req.end('{}')
      })
    }

    it('mid-transaction failure: an insert that throws after the order row rolls everything back', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'booklist-orders-txn-'))
      const db = new Database(path.join(dir, 'booklist.db'))
      try {
        runMigrations(db)
        db.pragma('foreign_keys = ON')
        const now = new Date().toISOString()
        const parentId = Number(
          db
            .prepare(
              `INSERT INTO parents (email, password_hash, name, delivery_address, whatsapp, second_phone, created_at)
               VALUES ('txn@example.com', 'x', 'Txn Parent', '1 Lake Road', '0771234567', NULL, ?)`,
            )
            .run(now).lastInsertRowid,
        )
        const itemId = Number(
          db
            .prepare(`INSERT INTO items (title, description, price, created_at) VALUES ('Eraser', 'Stationery', 50, ?)`)
            .run(now).lastInsertRowid,
        )
        db.prepare(
          `INSERT INTO cart_item_lines (parent_id, item_id, quantity, title, unit_price, created_at)
           VALUES (?, ?, 2, 'Eraser', 50, ?)`,
        ).run(parentId, itemId, now)
        db.exec(`
          CREATE TRIGGER order_item_lines_fail BEFORE INSERT ON order_item_lines
          BEGIN
            SELECT RAISE(ABORT, 'forced failure');
          END
        `)
        assert.throws(() => placeOrder(db, parentId, 'txn-key', 'note'), /forced failure/)
        const count = (table: string) =>
          (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
        assert.equal(count('orders'), 0)
        assert.equal(count('order_pack_lines'), 0)
        assert.equal(count('order_item_lines'), 0)
        assert.equal(count('cart_item_lines'), 1)

        // With the failure gone the same Place goes through and empties the cart.
        db.exec('DROP TRIGGER order_item_lines_fail')
        const placed = placeOrder(db, parentId, 'txn-key', null)
        assert.ok(placed.ok)
        assert.equal(placed.replayed, false)
        assert.equal(placed.order.publicNumber, 1001)
        assert.equal(count('orders'), 1)
        assert.equal(count('cart_item_lines'), 0)
        assert.deepEqual(listParentOrders(db, parentId), [placed.order])
      } finally {
        db.close()
        await rm(dir, { recursive: true, force: true })
      }
    })

    it('auth: 401 without a cookie and 403 for the admin on POST and GET', async () => {
      const total = readDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n)
      await expectRefused(await place(undefined, 'auth-key'), 401, 'unauthenticated')
      await expectRefused(
        await place(adminCookie, 'auth-key'),
        403,
        'forbidden',
        'Only parents can place orders.',
      )
      await expectRefused(await fetch(`${ordersBaseUrl}/api/orders`), 401, 'unauthenticated')
      await expectRefused(
        await fetch(`${ordersBaseUrl}/api/orders`, { headers: { cookie: adminCookie } }),
        403,
        'forbidden',
      )
      assert.equal(
        readDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n),
        total,
      )
    })

    it('second phone: the snapshot keeps the normalized fallback number from the account', async () => {
      const parent = await registerParent('second-phone', '071-234 5678')
      await seed('second-phone', parent)
      const response = await place(parent.cookie, 'second-phone-key')
      assert.equal(response.status, 201)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const order = ((await response.json()) as { order: OrderJson }).order
      const row = readDb(
        (db) =>
          db.prepare('SELECT whatsapp, second_phone FROM orders WHERE id = ?').get(order.id) as {
            whatsapp: string
            second_phone: string | null
          },
      )
      assert.deepEqual(row, { whatsapp: '+94771234567', second_phone: '+94712345678' })
    })

    it('snapshot: repricing and renaming in the catalog after Place never changes the order', async () => {
      const seeded = await seed('immutable')
      const response = await place(seeded.parent.cookie, 'immutable-key')
      assert.equal(response.status, 201)
      const order = ((await response.json()) as { order: OrderJson }).order
      const stored = () =>
        readDb((db) => ({
          order: db
            .prepare('SELECT goods_total_rupees, parent_name, delivery_address FROM orders WHERE id = ?')
            .get(order.id),
          packs: db
            .prepare('SELECT pack_name, label, grade_name, line_total_rupees FROM order_pack_lines WHERE order_id = ?')
            .all(order.id),
          books: db
            .prepare(
              `SELECT b.book_id, b.title, b.unit_price_rupees, b.quantity FROM order_pack_line_books b
               JOIN order_pack_lines l ON l.id = b.line_id
               WHERE l.order_id = ?
               ORDER BY b.book_id`,
            )
            .all(order.id),
          items: db
            .prepare('SELECT title, unit_price_rupees, quantity, line_total_rupees FROM order_item_lines WHERE order_id = ?')
            .all(order.id),
        }))
      const before = stored()
      assert.deepEqual((before.packs as Array<{ pack_name: string }>)[0].pack_name, seeded.packName)

      await adminSend('PATCH', booksItemPath(seeded.atlas.id), bookBody(`Renamed ${seeded.atlas.title}`, 1750), 200)
      await adminSend('PATCH', itemsItemPath(seeded.item.id), itemBody(`Renamed ${seeded.item.title}`, 'Stationery', 175), 200)
      await adminSend(
        'PATCH',
        packsItemPath(seeded.packId),
        packPatchBody(`Renamed ${seeded.packName}`, 'Orders', [seeded.atlas.id, seeded.reader.id, seeded.workbook.id]),
        200,
      )

      assert.deepEqual(stored(), before)
      assert.deepEqual(
        (await listOrders(seeded.parent.cookie)).find((entry) => entry.id === order.id),
        order,
      )
      assert.equal(order.goodsTotal, 4160)
    })

    it("list: a parent sees only their own orders, newest first", async () => {
      const seeded = await seed('list')
      assert.deepEqual(await listOrders(seeded.parent.cookie), [])
      const older = ((await (await place(seeded.parent.cookie, 'list-1')).json()) as { order: OrderJson }).order
      await seed('list-again', seeded.parent)
      const newer = ((await (await place(seeded.parent.cookie, 'list-2')).json()) as { order: OrderJson }).order
      assert.ok(newer.publicNumber > older.publicNumber)
      assert.deepEqual(await listOrders(seeded.parent.cookie), [newer, older])
      assert.deepEqual(await listOrders(first.parent.cookie), [firstOrder])
    })

    it('wires the orders module, Place Order, My Orders, the route, and styles', async () => {
      const read = (...parts: string[]) => readFile(path.join(...parts), 'utf8')
      const ordersDir = path.join(serverRoot, 'orders')
      const ordersHttp = await read(ordersDir, 'http.ts')
      const ordersIndex = await read(ordersDir, 'index.ts')
      const ordersPlace = await read(ordersDir, 'place.ts')
      const cartIndex = await read(serverRoot, 'cart', 'index.ts')
      const cartEmpty = await read(serverRoot, 'cart', 'empty.ts')
      const api = await read(serverRoot, 'web', 'api.ts')
      const runMigrationsSource = await read(serverRoot, 'db', 'migrations', 'run.ts')
      const migration = await read(serverRoot, 'db', 'migrations', '009_orders_orders_and_lines.sql')
      const storefront = path.join(repoRoot, 'client', 'storefront', 'src')
      const checkoutPage = await read(storefront, 'CheckoutPage.tsx')
      const ordersPage = await read(storefront, 'OrdersPage.tsx')
      const storefrontApp = await readFile(storefrontAppPath, 'utf8')
      const baseCss = await readFile(baseCssPath, 'utf8')

      // Server: SQL stays in place.ts; orders never reads cart, catalog, or identity tables.
      assert.doesNotMatch(ordersHttp, /db\.prepare/)
      for (const file of await walkFiles(ordersDir)) {
        if (!file.endsWith('.ts')) continue
        const source = await readFile(file, 'utf8')
        assert.doesNotMatch(
          source,
          /(FROM|JOIN|INTO|UPDATE)\s+(cart_\w+|packs|books|grades|schools|items|pack_books|parents|admins|sessions)\b/i,
          `foreign table in ${file}`,
        )
      }
      assert.match(ordersIndex, /export \{ createOrdersRouter \}/)
      assert.match(ordersPlace, /from '\.\.\/cart\/index\.js'/)
      assert.match(ordersPlace, /getBrowsePack\(db, line\.packId\)/)
      assert.match(ordersPlace, /findParentById\(db, parentId\)/)
      assert.match(ordersPlace, /emptyCart\(db, parentId\)/)
      assert.match(ordersPlace, /checkoutBlock\(db, parentId\)/)
      assert.match(ordersPlace, /cartGoodsTotal\(packLines, itemLines\)/)
      assert.match(ordersPlace, /db\.transaction\(/)
      assert.match(ordersHttp, /Only parents can place orders\./)
      assert.match(ordersHttp, /enableForeignKeys\(db\)/)
      assert.match(ordersHttp, /Idempotency-Key/)
      assert.match(cartIndex, /export \{ emptyCart \}/)
      assert.match(cartEmpty, /export function emptyCart/)
      assert.match(api, /router\.use\(createOrdersRouter\(db, env\)\)/)
      assert.ok(api.indexOf('createCartRouter(db, env)') < api.indexOf('createOrdersRouter(db, env)'))
      assert.ok(api.indexOf('createOrdersRouter(db, env)') < api.indexOf('router.use((req, res)'))
      assert.match(runMigrationsSource, /009_orders_orders_and_lines\.sql/)
      assert.match(migration, /UNIQUE \(public_number\)/)
      assert.match(migration, /UNIQUE \(parent_id, idempotency_key\)/)
      for (const status of [
        'Order Is Placed',
        'Order Confirmed',
        'Processing',
        'Packing The Order',
        'Ready To Deliver',
        'On Delivery Partner',
        'Delivered',
        'Cancelled',
      ]) {
        assert.match(migration, new RegExp(`'${status}'`))
      }
      assert.doesNotMatch(migration, /delivery_price|payable/)

      // Place Order: one key per mount, the existing lock, then refresh and navigate.
      assert.match(checkoutPage, /crypto\.randomUUID\(\)/)
      assert.match(checkoutPage, /useRef<string \| null>\(null\)/)
      assert.match(checkoutPage, /'Idempotency-Key': ensurePlaceKey\(\)/)
      assert.doesNotMatch(checkoutPage, /placeKey\.current \?\? ''/)
      assert.match(checkoutPage, /fetch\('\/api\/orders'/)
      assert.match(checkoutPage, /void withLock\(async \(\) => \{\s*let response: Response\s*try \{\s*response = await fetch\('\/api\/orders'/)
      assert.match(checkoutPage, /onClick=\{\(\) => placeOrder\(blocked\)\}/)
      assert.match(checkoutPage, /if \(blocked\) return/)
      assert.match(checkoutPage, /response\.status === 401[\s\S]*?await session\.logOut\(\)/)
      // Any 2xx refreshes the badge and lands on My Orders, with the number only when parsed.
      assert.match(
        checkoutPage,
        /refresh\(\)\s*const placedNumber = placedNumberOf\(body\)\s*void navigate\('\/orders', placedNumber === undefined \? \{\} : \{ state: \{ placedNumber \} \}\)/,
      )
      assert.doesNotMatch(checkoutPage, /placedNumber === undefined\) \{\s*setActionError/)
      // On a refused Place the resync runs before the Place message is set.
      assert.match(checkoutPage, /if \(response\.status === 409\) await loadCheckout\(\)\s*setActionError\(message\)/)
      assert.match(checkoutPage, /body: JSON\.stringify\(\{ note \}\)/)
      assert.doesNotMatch(checkoutPage, /deliveryAddress[^\n]*JSON\.stringify|JSON\.stringify\(\{[^}]*address/i)
      assert.doesNotMatch(checkoutPage, /\sdisabled=\{blocked/)
      assert.doesNotMatch(checkoutPage, /localStorage|sessionStorage|indexedDB/)
      assert.doesNotMatch(checkoutPage, /setNote\(''\)/)

      // My Orders: list, placed line, empty state, Colombo dates.
      assert.match(ordersPage, /fetch\('\/api\/orders'/)
      assert.match(ordersPage, /new AbortController\(\)/)
      assert.match(ordersPage, /<Spinner \/>/)
      assert.match(ordersPage, /RefreshIcon/)
      assert.match(ordersPage, /No Orders yet\./)
      // The confirmation comes from the captured number, shown even if the list fails to load.
      assert.match(ordersPage, /Order #\{placedNumber\} placed\./)
      assert.match(ordersPage, /const \[placedNumber\] = useState\(\(\) => placedNumberFrom\(location\.state\)\)/)
      assert.match(ordersPage, /navigate\(location\.pathname, \{ replace: true, state: null \}\)/)
      assert.match(ordersPage, /\{justPlaced \? placedLine : null\}/)
      assert.match(ordersPage, /\{placedRowListed \? null : placedLine\}/)
      assert.match(ordersPage, /status === 'error'[\s\S]*?My Orders[\s\S]*?\{placedLine\}[\s\S]*?\{refreshButton\}/)
      assert.match(ordersPage, /response\.status === 401[\s\S]*?await logOut\.current\(\)/)
      assert.match(ordersPage, /\(confirmRef\.current \?\? headingRef\.current\)\?\.focus\(\)/)
      assert.match(ordersPage, /tabIndex=\{-1\} ref=\{headingRef\}/)
      assert.match(ordersPage, /'order-row is-placed'/)
      assert.match(ordersPage, />#\{order\.publicNumber\}</)
      assert.match(ordersPage, /formatRupees\(order\.goodsTotal\)/)
      assert.match(ordersPage, /timeZone: 'Asia\/Colombo'/)
      assert.match(ordersPage, /role="alert"/)
      assert.doesNotMatch(ordersPage, /localStorage|sessionStorage|indexedDB/)

      const gated = storefrontApp.match(/<Route element=\{<AuthGate \/>\}>([\s\S]*?)<\/Route>/)?.[1]
      assert.ok(gated)
      assert.match(gated, /path="orders" element=\{<OrdersPage \/>\}/)
      assert.match(storefrontApp, /import \{ OrdersPage \} from '\.\/OrdersPage'/)

      assert.ok(cssRule(baseCss, '.order-list'))
      assert.match(cssRule(baseCss, '.order-row'), /var\(--color-border-default\)/)
      assert.match(cssRule(baseCss, '.order-row-meta'), /var\(--color-text-secondary\)/)
      const placedRow = cssRule(baseCss, '.order-row.is-placed')
      assert.match(placedRow, /var\(--color-accent-quiet\)/)
      assert.match(placedRow, /var\(--space-edge-strong\) solid var\(--color-accent-primary\)/)
      // Every class the page renders for the placed row has a rule.
      for (const name of ['order-row-placed', 'order-row-main', 'order-row-meta']) {
        assert.match(ordersPage, new RegExp(`className="${name}[ "]`))
        assert.ok(cssRule(baseCss, `.${name}`))
      }

      // Place answers are never cached either.
      assert.match(ordersHttp, /'\/orders',\s*safe\(\(req, res\) => \{\s*res\.setHeader\('Cache-Control', 'no-store'\)/)
      // A pack that went off the list is refused as blocked before anything is written.
      assert.ok(
        ordersPlace.indexOf("code: 'checkout_blocked', message: blockedMessage(offList)") <
          ordersPlace.indexOf('INSERT INTO orders'),
      )
      assert.doesNotMatch(ordersPlace, /is not live/)
    })
  })

  describe('My Orders — pipeline, cancel, and reason', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let adminCookie: string
    let parentSerial = 0

    type OrderJson = {
      id: number
      publicNumber: number
      status: string
      goodsTotal: number
      placedAt: string
    }
    type DetailJson = {
      id: number
      publicNumber: number
      status: string
      placedAt: string
      goodsTotal: number
      deliveryPrice: number | null
      payableTotal: number | null
      note: string | null
      deliveryAddress: string
      cancellation: null | { by: 'parent' | 'admin'; reason: string | null; at: string | null }
      packLines: Array<{
        packName: string
        label: string
        gradeName: string
        lineTotal: number
        books: Array<{ title: string; unitPrice: number; quantity: number }>
      }>
      itemLines: Array<{ title: string; unitPrice: number; quantity: number; lineTotal: number }>
    }
    type ErrorBody = { error: { code: string; message: string } }
    type Parent = { cookie: string; id: number; name: string }
    type Titled = { id: number; title: string }
    type Seeded = {
      parent: Parent
      atlas: Titled
      reader: Titled
      workbook: Titled
      item: Titled
      packId: number
      packName: string
      gradeName: string
    }

    const CONFIRMED_MESSAGE =
      'The shop confirmed this order before your cancel arrived, so it can no longer be cancelled here.'

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${ordersDetailBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function adminSend(
      method: 'POST' | 'PATCH' | 'DELETE',
      pathName: string,
      body: unknown,
      expected: number,
    ): Promise<unknown> {
      const response = await fetch(`${ordersDetailBaseUrl}${pathName}`, {
        method,
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      assert.equal(response.status, expected, `${method} ${pathName}: ${response.status}`)
      return expected === 204 ? undefined : await response.json()
    }

    async function registerParent(tag: string): Promise<Parent> {
      parentSerial += 1
      const email = `detail.${tag}.${parentSerial}.${Date.now()}@example.com`
      const name = `Detail ${tag}`
      const response = await fetch(`${ordersDetailBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          deliveryAddress: '12 Temple Road, Nugegoda',
          whatsapp: '0771234567',
          email,
          password: 'evening-order',
        }),
      })
      assert.equal(response.status, 201)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      const id = readDb(
        (db) => (db.prepare('SELECT id FROM parents WHERE email = ?').get(email) as { id: number }).id,
      )
      return { cookie: cookieHeader(cookie), id, name }
    }

    /** Atlas x2 @1,500 and Reader x1 @800 ticked, Workbook @900 unticked; an item x3 @120. */
    async function seed(tag: string, parent?: Parent): Promise<Seeded> {
      const s = `${Date.now()}-${tag}`
      const schoolId = ((await adminSend('POST', '/api/admin/schools', catalogNameBody(`Detail school ${s}`), 201)) as { id: number }).id
      const gradeName = `Grade ${s}`
      const gradeId = ((await adminSend('POST', '/api/admin/grades', catalogNameBody(gradeName), 201)) as { id: number }).id
      const atlas = (await adminSend('POST', '/api/admin/books', bookBody(`Atlas ${s}`, 1500), 201)) as Titled
      const reader = (await adminSend('POST', '/api/admin/books', bookBody(`Reader ${s}`, 800), 201)) as Titled
      const workbook = (await adminSend('POST', '/api/admin/books', bookBody(`Workbook ${s}`, 900), 201)) as Titled
      const packName = `Detail pack ${s}`
      const pack = (await adminSend(
        'POST',
        '/api/admin/packs',
        packCreateBody(packName, schoolId, gradeId, 'Detail', [atlas.id, reader.id, workbook.id]),
        201,
      )) as { id: number }
      const item = (await adminSend('POST', '/api/admin/items', itemBody(`Pencil ${s}`, 'Stationery', 120), 201)) as Titled
      const owner = parent ?? (await registerParent(tag))
      const packResponse = await fetch(`${ordersDetailBaseUrl}/api/cart/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: owner.cookie },
        body: JSON.stringify({ packId: pack.id, selection: `${atlas.id}:2,${reader.id}:1` }),
      })
      assert.equal(packResponse.status, 201)
      const itemResponse = await fetch(`${ordersDetailBaseUrl}/api/cart/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: owner.cookie },
        body: JSON.stringify({ itemId: item.id, quantity: 3 }),
      })
      assert.ok(itemResponse.status === 201 || itemResponse.status === 200, `add item ${itemResponse.status}`)
      return { parent: owner, atlas, reader, workbook, item, packId: pack.id, packName, gradeName }
    }

    async function placeOne(tag: string, note?: string): Promise<{ seeded: Seeded; order: OrderJson }> {
      const seeded = await seed(tag)
      const response = await fetch(`${ordersDetailBaseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: seeded.parent.cookie,
          'Idempotency-Key': `detail-${tag}`,
        },
        body: JSON.stringify(note === undefined ? {} : { note }),
      })
      assert.equal(response.status, 201)
      return { seeded, order: ((await response.json()) as { order: OrderJson }).order }
    }

    function getDetail(cookie: string | undefined, id: string | number): Promise<Response> {
      return fetch(`${ordersDetailBaseUrl}/api/orders/${id}`, {
        headers: cookie ? { cookie } : {},
      })
    }

    function cancel(cookie: string | undefined, id: string | number): Promise<Response> {
      return fetch(`${ordersDetailBaseUrl}/api/orders/${id}/cancel`, {
        method: 'POST',
        headers: cookie ? { cookie } : {},
      })
    }

    async function detailOf(cookie: string, id: number): Promise<DetailJson> {
      const response = await getDetail(cookie, id)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as { order: DetailJson }
      assert.deepEqual(Object.keys(body), ['order'])
      return body.order
    }

    async function listOrders(cookie: string): Promise<OrderJson[]> {
      const response = await fetch(`${ordersDetailBaseUrl}/api/orders`, { headers: { cookie } })
      assert.equal(response.status, 200)
      return ((await response.json()) as { orders: OrderJson[] }).orders
    }

    function readDb<T>(read: (db: Database.Database) => T): T {
      const db = new Database(dbPath, { readonly: true })
      try {
        return read(db)
      } finally {
        db.close()
      }
    }

    /** Direct DB writes stand in for the admin stories (4.5, 4.6) that do not exist yet. */
    function writeDb(write: (db: Database.Database) => void): void {
      const db = new Database(dbPath)
      try {
        write(db)
      } finally {
        db.close()
      }
    }

    function orderRow(id: number): Record<string, unknown> {
      return readDb((db) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, unknown>)
    }

    async function expectRefused(
      response: Response,
      status: number,
      code: string,
      message?: string,
    ): Promise<void> {
      assert.equal(response.status, status)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, code)
      if (message !== undefined) assert.equal(body.error.message, message)
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-orders-detail-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, ORDERS_DETAIL_PORT)
      child = started.child
      adminCookie = await signInAdmin()
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    let a: { seeded: Seeded; order: OrderJson }
    // Real answers from the HTTP cases, later fed through the client parser.
    let detailAnswer: unknown
    let cancelAnswer: unknown

    it('detail: the parent opens their placed order and gets the snapshot, lines in position order', async () => {
      a = await placeOne('detail', ' Gate 2 ')
      const detail = await detailOf(a.seeded.parent.cookie, a.order.id)
      detailAnswer = { order: detail }
      assert.deepEqual(Object.keys(detail).sort(), [
        'cancellation',
        'deliveryAddress',
        'deliveryPrice',
        'goodsTotal',
        'id',
        'itemLines',
        'note',
        'packLines',
        'payableTotal',
        'placedAt',
        'publicNumber',
        'status',
      ])
      assert.equal(detail.id, a.order.id)
      assert.equal(detail.publicNumber, a.order.publicNumber)
      assert.equal(detail.status, 'Order Is Placed')
      assert.equal(detail.placedAt, a.order.placedAt)
      assert.equal(detail.goodsTotal, 4160)
      assert.equal(detail.deliveryPrice, null)
      assert.equal(detail.payableTotal, null)
      assert.equal(detail.cancellation, null)
      assert.equal(detail.note, 'Gate 2')
      assert.equal(detail.deliveryAddress, '12 Temple Road, Nugegoda')
      // Only the two included books: the unticked Workbook is not in the order.
      assert.deepEqual(detail.packLines, [
        {
          packName: a.seeded.packName,
          label: `Pack 1 of ${a.seeded.gradeName}`,
          gradeName: a.seeded.gradeName,
          lineTotal: 3800,
          books: [
            { title: a.seeded.atlas.title, unitPrice: 1500, quantity: 2 },
            { title: a.seeded.reader.title, unitPrice: 800, quantity: 1 },
          ],
        },
      ])
      assert.deepEqual(detail.itemLines, [
        { title: a.seeded.item.title, unitPrice: 120, quantity: 3, lineTotal: 360 },
      ])

      // The list contract is unchanged: no payable or delivery values were added.
      const listed = (await listOrders(a.seeded.parent.cookie)).find((entry) => entry.id === a.order.id)
      assert.deepEqual(listed, a.order)
      assert.deepEqual(Object.keys(listed ?? {}).sort(), ['goodsTotal', 'id', 'placedAt', 'publicNumber', 'status'])
    })

    it('snapshot holds: renaming and repricing in the catalog never changes the detail', async () => {
      const before = await detailOf(a.seeded.parent.cookie, a.order.id)
      await adminSend('PATCH', booksItemPath(a.seeded.atlas.id), bookBody(`Renamed ${a.seeded.atlas.title}`, 1750), 200)
      await adminSend('PATCH', itemsItemPath(a.seeded.item.id), itemBody(`Renamed ${a.seeded.item.title}`, 'Stationery', 175), 200)
      await adminSend(
        'PATCH',
        packsItemPath(a.seeded.packId),
        packPatchBody(`Renamed ${a.seeded.packName}`, 'Detail', [a.seeded.atlas.id, a.seeded.reader.id, a.seeded.workbook.id]),
        200,
      )
      assert.deepEqual(await detailOf(a.seeded.parent.cookie, a.order.id), before)
    })

    it('other parent or a bad id: 404 not_found on detail and cancel, never a 403, nothing changes', async () => {
      const other = await registerParent('other')
      const missing = readDb((db) => (db.prepare('SELECT MAX(id) AS n FROM orders').get() as { n: number }).n + 1000)
      for (const id of [String(a.order.id), 'abc', '0', '-1', '1.5', '01', String(missing), '99999999999999999999']) {
        const cookie = id === String(a.order.id) ? other.cookie : a.seeded.parent.cookie
        await expectRefused(await getDetail(cookie, id), 404, 'not_found', 'Order not found.')
        await expectRefused(await cancel(cookie, id), 404, 'not_found', 'Order not found.')
      }
      assert.equal(orderRow(a.order.id).status, 'Order Is Placed')
    })

    it('auth: 401 without a cookie and 403 for the admin on detail and cancel', async () => {
      await expectRefused(await getDetail(undefined, a.order.id), 401, 'unauthenticated')
      await expectRefused(await cancel(undefined, a.order.id), 401, 'unauthenticated')
      await expectRefused(await getDetail(adminCookie, a.order.id), 403, 'forbidden', 'Only parents can view their orders.')
      await expectRefused(await cancel(adminCookie, a.order.id), 403, 'forbidden', 'Only parents can view their orders.')
      // An admin hitting a missing id still gets 403, not 404.
      await expectRefused(await getDetail(adminCookie, 'abc'), 403, 'forbidden')
      assert.equal(orderRow(a.order.id).status, 'Order Is Placed')
    })

    it('cancel: a placed order becomes Cancelled by the parent and stays listed', async () => {
      const response = await cancel(a.seeded.parent.cookie, a.order.id)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as { order: DetailJson }
      cancelAnswer = body
      assert.equal(body.order.status, 'Cancelled')
      assert.equal(body.order.payableTotal, null)
      assert.equal(body.order.cancellation?.by, 'parent')
      assert.equal(body.order.cancellation?.reason, null)
      assert.ok(body.order.cancellation?.at)
      assert.equal(new Date(body.order.cancellation.at).toISOString(), body.order.cancellation.at)
      assert.equal(body.order.packLines.length, 1)
      assert.deepEqual(await detailOf(a.seeded.parent.cookie, a.order.id), body.order)

      const row = orderRow(a.order.id)
      assert.equal(row.status, 'Cancelled')
      assert.equal(row.cancelled_by, 'parent')
      assert.equal(row.cancellation_reason, null)
      assert.equal(row.payable_total_rupees, null)
      assert.equal(row.cancelled_at, body.order.cancellation.at)

      const listed = (await listOrders(a.seeded.parent.cookie)).find((entry) => entry.id === a.order.id)
      assert.deepEqual(listed, { ...a.order, status: 'Cancelled' })
    })

    it('re-cancel: an already cancelled order is a 409 and nothing changes', async () => {
      const before = orderRow(a.order.id)
      await expectRefused(
        await cancel(a.seeded.parent.cookie, a.order.id),
        409,
        'order_not_cancellable',
        'This order is already cancelled.',
      )
      assert.deepEqual(orderRow(a.order.id), before)
    })

    it('race lost: the shop confirmed first, so the cancel is a 409 and the order stays confirmed', async () => {
      const { seeded, order } = await placeOne('race')
      writeDb((db) => db.prepare("UPDATE orders SET status = 'Order Confirmed' WHERE id = ?").run(order.id))
      await expectRefused(await cancel(seeded.parent.cookie, order.id), 409, 'order_not_cancellable', CONFIRMED_MESSAGE)
      assert.equal(orderRow(order.id).status, 'Order Confirmed')
      assert.equal(orderRow(order.id).cancelled_by, null)

      // Every later non-terminal status answers the same way; Delivered has its own copy.
      for (const status of ['Processing', 'Packing The Order', 'Ready To Deliver', 'On Delivery Partner']) {
        writeDb((db) => db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, order.id))
        await expectRefused(await cancel(seeded.parent.cookie, order.id), 409, 'order_not_cancellable', CONFIRMED_MESSAGE)
        assert.equal(orderRow(order.id).status, status)
      }
      writeDb((db) => db.prepare("UPDATE orders SET status = 'Delivered' WHERE id = ?").run(order.id))
      await expectRefused(
        await cancel(seeded.parent.cookie, order.id),
        409,
        'order_not_cancellable',
        'This order has already been delivered.',
      )
      assert.equal(orderRow(order.id).status, 'Delivered')
    })

    it('double cancel: two concurrent cancels commit once; the second is told it is already cancelled', async () => {
      const { seeded, order } = await placeOne('double')
      const [first, second] = await Promise.all([
        cancel(seeded.parent.cookie, order.id),
        cancel(seeded.parent.cookie, order.id),
      ])
      assert.deepEqual([first.status, second.status].sort(), [200, 409])
      const loser = first.status === 409 ? first : second
      assert.equal(((await loser.json()) as ErrorBody).error.message, 'This order is already cancelled.')
      assert.equal(orderRow(order.id).status, 'Cancelled')
    })

    it('admin reason: a shop cancel with a reason comes back as cancellation.by admin', async () => {
      const { seeded, order } = await placeOne('admin-reason')
      const at = new Date().toISOString()
      writeDb((db) =>
        db
          .prepare(
            `UPDATE orders SET status = 'Cancelled', cancelled_by = 'admin',
               cancellation_reason = 'Out of stock for this term', cancelled_at = ? WHERE id = ?`,
          )
          .run(at, order.id),
      )
      const detail = await detailOf(seeded.parent.cookie, order.id)
      assert.equal(detail.status, 'Cancelled')
      assert.deepEqual(detail.cancellation, { by: 'admin', reason: 'Out of stock for this term', at })
      assert.equal(detail.payableTotal, null)
    })

    it('delivery set: Processing with delivery 400 shows the delivery price and the payable total', async () => {
      const { seeded, order } = await placeOne('delivery')
      writeDb((db) =>
        db
          .prepare(
            `UPDATE orders SET status = 'Processing', delivery_price_rupees = 400,
               payable_total_rupees = goods_total_rupees + 400 WHERE id = ?`,
          )
          .run(order.id),
      )
      const detail = await detailOf(seeded.parent.cookie, order.id)
      assert.equal(detail.status, 'Processing')
      assert.equal(detail.deliveryPrice, 400)
      assert.equal(detail.payableTotal, 4160 + 400)
      assert.equal(detail.cancellation, null)
      const listed = (await listOrders(seeded.parent.cookie)).find((entry) => entry.id === order.id)
      assert.deepEqual(listed, { ...order, status: 'Processing' })
    })

    it('invariant: the trigger rejects a Cancelled order that carries a payable total', async () => {
      const { seeded: invariantSeed, order } = await placeOne('invariant')
      writeDb((db) => {
        // INSERT is guarded as well as UPDATE.
        const insert = db.prepare(
          `INSERT INTO orders (
             parent_id, public_number, idempotency_key, status, parent_name, delivery_address,
             whatsapp, goods_total_rupees, placed_at, payable_total_rupees
           ) VALUES (?, ?, ?, 'Cancelled', 'Direct', '1 Lake Road', '+94771234567', 100, ?, ?)`,
        )
        const publicNumber =
          (db.prepare('SELECT MAX(public_number) AS n FROM orders').get() as { n: number }).n + 500
        const placedAt = new Date().toISOString()
        assert.throws(
          () => insert.run(invariantSeed.parent.id, publicNumber, 'direct-insert', placedAt, 100),
          /payable total/,
        )
        // The same row without a payable total is allowed; remove it again so nothing else sees it.
        const allowed = insert.run(invariantSeed.parent.id, publicNumber, 'direct-insert', placedAt, null)
        db.prepare('DELETE FROM orders WHERE id = ?').run(allowed.lastInsertRowid)

        assert.throws(
          () =>
            db
              .prepare("UPDATE orders SET status = 'Cancelled', payable_total_rupees = 100 WHERE id = ?")
              .run(order.id),
          /payable total/,
        )
        db.prepare("UPDATE orders SET status = 'Cancelled', cancelled_by = 'admin' WHERE id = ?").run(order.id)
        assert.throws(
          () => db.prepare('UPDATE orders SET payable_total_rupees = 100 WHERE id = ?').run(order.id),
          /payable total/,
        )
        // The column checks hold too.
        assert.throws(
          () => db.prepare("UPDATE orders SET cancelled_by = 'shop' WHERE id = ?").run(order.id),
          /CHECK/,
        )
        assert.throws(
          () => db.prepare('UPDATE orders SET delivery_price_rupees = -1 WHERE id = ?').run(order.id),
          /CHECK/,
        )
      })
      const row = orderRow(order.id)
      assert.equal(row.status, 'Cancelled')
      assert.equal(row.payable_total_rupees, null)
    })

    it('pill: eight statuses render eight distinct step numbers and glyphs; Cancelled shows × and a strike', async () => {
      // The test loader compiles JSX with the classic runtime, so React must be in scope first.
      ;(globalThis as { React?: unknown }).React = React
      const { ORDER_STATUSES, PIPELINE_STAGES, StatusPill } = await import('../../client/ui/StatusPill.tsx')
      const marks = ORDER_STATUSES.map((status) => renderToStaticMarkup(React.createElement(StatusPill, { status })))
      const steps = marks.map((markup) => markup.match(/class="status-pill-step"[^>]*>([^<]+)</)?.[1])
      assert.deepEqual(steps, ['1', '2', '3', '4', '5', '6', '7', '×'])
      const glyphs = marks.map((markup) => markup.match(/<svg[\s\S]*?<\/svg>/)?.[0])
      assert.equal(new Set(glyphs).size, 8)
      for (const [index, status] of ORDER_STATUSES.entries()) {
        assert.match(marks[index], new RegExp(`class="status-pill-label">${status}<`))
      }
      assert.match(marks[7], /status-pill-cancelled/)
      assert.equal(renderToStaticMarkup(React.createElement(StatusPill, { status: 'Lost in post' })), '<span class="status-pill-plain">Lost in post</span>')
      assert.deepEqual([...PIPELINE_STAGES], ORDER_STATUSES.slice(0, 7))

      const baseCss = await readFile(baseCssPath, 'utf8')
      const tokens = await readFile(tokensPath, 'utf8')
      assert.match(cssRule(baseCss, '.status-pill-cancelled .status-pill-label'), /line-through/)
      assert.match(cssRule(baseCss, '.status-pill-placed'), /border-style: dashed/)
      assert.match(cssRule(baseCss, '.status-pill-placed'), /var\(--color-status-placed-fill\)/)
      for (const slug of ['ready', 'delivered', 'cancelled']) {
        assert.match(cssRule(baseCss, `.status-pill-${slug}`), /border-width: var\(--space-edge-strong\)/)
      }
      for (const slug of ['delivered', 'cancelled']) {
        assert.match(cssRule(baseCss, `.status-pill-${slug}`), /border-radius: var\(--radius-xs\)/)
      }
      assert.match(cssRule(baseCss, '.status-pill'), /border-radius: var\(--radius-full\)/)
      // Ready is the only mustard pill.
      assert.equal(cssCustomProperty(tokens, 'color-status-ready-fill', 'root'), '#E8A61A')
      assert.equal(cssCustomProperty(tokens, 'color-status-placed-fill', 'root'), '#4A4A4E')
      const slugs = ['placed', 'confirmed', 'processing', 'packing', 'ready', 'partner', 'delivered', 'cancelled']
      for (const slug of slugs) {
        for (const part of ['fill', 'ink', 'edge']) {
          const name = `color-status-${slug}-${part}`
          const dark = cssCustomProperty(tokens, `${name}-dark`, 'root')
          assert.match(cssCustomProperty(tokens, name, 'root'), /^#[0-9A-F]{6}$/)
          assert.equal(cssCustomProperty(tokens, name, 'dark'), dark, `${name} must remap to its -dark twin`)
        }
        if (slug !== 'ready') {
          assert.notEqual(cssCustomProperty(tokens, `color-status-${slug}-fill`, 'root'), '#E8A61A')
        }
      }
    })

    it('fallbacks: delivery without a stored payable, Cancelled without a party, a parent cancel with a reason', async () => {
      const delivery = await placeOne('fallback-delivery')
      writeDb((db) =>
        db
          .prepare("UPDATE orders SET status = 'Processing', delivery_price_rupees = 400 WHERE id = ?")
          .run(delivery.order.id),
      )
      assert.equal(orderRow(delivery.order.id).payable_total_rupees, null)
      const processing = await detailOf(delivery.seeded.parent.cookie, delivery.order.id)
      assert.equal(processing.deliveryPrice, 400)
      assert.equal(processing.payableTotal, 4160 + 400)

      const noParty = await placeOne('fallback-no-party')
      writeDb((db) =>
        db
          .prepare("UPDATE orders SET status = 'Cancelled', cancellation_reason = 'Shop closed' WHERE id = ?")
          .run(noParty.order.id),
      )
      assert.equal(orderRow(noParty.order.id).cancelled_by, null)
      assert.deepEqual((await detailOf(noParty.seeded.parent.cookie, noParty.order.id)).cancellation, {
        by: 'admin',
        reason: 'Shop closed',
        at: null,
      })

      const parentReason = await placeOne('fallback-parent-reason')
      const at = new Date().toISOString()
      writeDb((db) =>
        db
          .prepare(
            `UPDATE orders SET status = 'Cancelled', cancelled_by = 'parent', cancelled_at = ?,
               cancellation_reason = 'Stray text' WHERE id = ?`,
          )
          .run(at, parentReason.order.id),
      )
      assert.deepEqual(
        (await detailOf(parentReason.seeded.parent.cookie, parentReason.order.id)).cancellation,
        { by: 'parent', reason: null, at },
      )
    })

    it('parse: real detail and cancel answers parse; malformed lines and cancellations do not', async () => {
      ;(globalThis as { React?: unknown }).React = React
      const { parseOrderDetail } = await import('../../client/storefront/src/OrderDetail.tsx')
      assert.ok(detailAnswer, 'the detail case ran first')
      assert.ok(cancelAnswer, 'the cancel case ran first')
      assert.deepEqual(parseOrderDetail(detailAnswer), (detailAnswer as { order: unknown }).order)
      assert.deepEqual(parseOrderDetail(cancelAnswer), (cancelAnswer as { order: unknown }).order)

      const good = (detailAnswer as { order: DetailJson }).order
      const variants: unknown[] = [
        { order: { ...good, packLines: [{ ...good.packLines[0], books: undefined }] } },
        { order: { ...good, packLines: [{ ...good.packLines[0], lineTotal: '3800' }] } },
        { order: { ...good, packLines: [{ ...good.packLines[0], books: [{ title: 'Atlas', unitPrice: 1500 }] }] } },
        { order: { ...good, itemLines: [{ ...good.itemLines[0], title: 7 }] } },
        { order: { ...good, itemLines: [null] } },
        { order: { ...good, cancellation: { by: 'shop', reason: null, at: null } } },
        { order: { ...good, cancellation: { by: 'admin', reason: 5, at: null } } },
        { order: { ...good, cancellation: { by: 'admin', reason: null, at: 5 } } },
        { order: { ...good, cancellation: undefined } },
        { order: [] },
        null,
      ]
      for (const body of variants) assert.equal(parseOrderDetail(body), undefined, JSON.stringify(body))
    })

    it('detail render: notice, Cancel, timeline, delivery rows, and every cancellation copy', async () => {
      ;(globalThis as { React?: unknown }).React = React
      const { OrderDetail } = await import('../../client/storefront/src/OrderDetail.tsx')
      const base: DetailJson = {
        id: 1,
        publicNumber: 1042,
        status: 'Order Is Placed',
        placedAt: '2026-10-01T10:00:00.000Z',
        goodsTotal: 4160,
        deliveryPrice: null,
        payableTotal: null,
        note: null,
        deliveryAddress: '12 Temple Road, Nugegoda',
        cancellation: null,
        packLines: [
          {
            packName: 'Grade 5 pack',
            label: 'Pack 1 of Grade 5',
            gradeName: 'Grade 5',
            lineTotal: 3800,
            books: [
              { title: 'Atlas', unitPrice: 1500, quantity: 2 },
              { title: 'Reader', unitPrice: 800, quantity: 1 },
            ],
          },
        ],
        itemLines: [{ title: 'Pencil', unitPrice: 120, quantity: 3, lineTotal: 360 }],
      }
      const render = (detail: Partial<DetailJson>) =>
        renderToStaticMarkup(
          React.createElement(OrderDetail, {
            id: 'order-detail-1',
            detail: { ...base, ...detail },
            loadError: '',
            busy: false,
            onCancel: () => {},
          }),
        )
      const count = (markup: string, pattern: RegExp) => (markup.match(pattern) ?? []).length
      const NOTICE = 'Delivery charge: to be confirmed by the shop'
      const CANCEL_BUTTON = />Cancel order<\/button>/
      const current = (stage: string) =>
        new RegExp(`<li class="order-timeline-step is-current" aria-current="step">(?:(?!</li>).)*>${stage}</span></li>`)

      const placed = render({})
      assert.ok(placed.includes(NOTICE))
      assert.match(placed, CANCEL_BUTTON)
      assert.match(placed, current('Order Is Placed'))
      assert.equal(count(placed, /aria-current="step"/g), 1)
      assert.equal(count(placed, /is-done/g), 0)
      assert.equal(count(placed, /is-upcoming/g), 6)
      assert.ok(placed.includes(formatRupees(4160)))
      assert.ok(!placed.includes('Payable total'))
      // Snapshot prices for each book and the item, then the goods total.
      assert.ok(placed.includes(formatRupees(1500)) && placed.includes(formatRupees(800)))
      assert.ok(placed.indexOf(formatRupees(360)) < placed.indexOf('Goods total'))

      const packing = render({ status: 'Packing The Order', deliveryPrice: 400, payableTotal: 4560 })
      assert.equal(count(packing, /order-timeline-step is-done/g), 3)
      assert.match(packing, current('Packing The Order'))
      assert.equal(count(packing, /aria-current="step"/g), 1)
      assert.equal(count(packing, /order-timeline-step is-upcoming/g), 3)
      assert.doesNotMatch(packing, CANCEL_BUTTON)

      const processing = render({ status: 'Processing', deliveryPrice: 400, payableTotal: 4560 })
      assert.match(processing, />Delivery charge</)
      assert.ok(processing.includes(formatRupees(400)))
      assert.match(processing, />Payable total</)
      assert.ok(processing.includes(formatRupees(4560)))
      assert.ok(!processing.includes(NOTICE))
      assert.match(processing, current('Processing'))
      assert.doesNotMatch(processing, CANCEL_BUTTON)

      const cancelledAt = '2026-10-01T11:00:00.000Z'
      const byParent = render({ status: 'Cancelled', cancellation: { by: 'parent', reason: null, at: cancelledAt } })
      assert.ok(byParent.includes('You cancelled this order.'))
      assert.doesNotMatch(byParent, /order-timeline/)
      assert.doesNotMatch(byParent, CANCEL_BUTTON)
      assert.ok(!byParent.includes(NOTICE))
      assert.match(byParent, /status-pill-cancelled/)

      const withReason = render({
        status: 'Cancelled',
        cancellation: { by: 'admin', reason: 'Out of stock for this term', at: cancelledAt },
      })
      assert.match(withReason, /Reason: (?:<!-- -->)?Out of stock for this term/)
      assert.ok(!withReason.includes('The shop cancelled this order.'))
      assert.doesNotMatch(withReason, /order-timeline/)
      assert.doesNotMatch(withReason, CANCEL_BUTTON)

      for (const reason of [null, '', '   ']) {
        const noReason = render({ status: 'Cancelled', cancellation: { by: 'admin', reason, at: cancelledAt } })
        assert.ok(noReason.includes('The shop cancelled this order.'))
        assert.doesNotMatch(noReason, /Reason:/)
      }

      // An unknown status falls back to the plain-text pill instead of an empty timeline.
      const unknown = render({ status: 'Lost in post' })
      assert.match(unknown, /<span class="status-pill-plain">Lost in post<\/span>/)
      assert.doesNotMatch(unknown, /order-timeline/)
    })

    it('wires the migration, the routes, the pill, the detail, the modal, and polling', async () => {
      const read = (...parts: string[]) => readFile(path.join(...parts), 'utf8')
      const ordersDir = path.join(serverRoot, 'orders')
      const ordersHttp = await read(ordersDir, 'http.ts')
      const ordersDetail = await read(ordersDir, 'detail.ts')
      const runMigrationsSource = await read(serverRoot, 'db', 'migrations', 'run.ts')
      const migration = await read(serverRoot, 'db', 'migrations', '010_orders_delivery_and_cancellation.sql')
      const storefront = path.join(repoRoot, 'client', 'storefront', 'src')
      const ordersPage = await read(storefront, 'OrdersPage.tsx')
      const orderDetail = await read(storefront, 'OrderDetail.tsx')
      const uiIndex = await read(repoRoot, 'client', 'ui', 'index.ts')
      const statusPill = await read(repoRoot, 'client', 'ui', 'StatusPill.tsx')
      const baseCss = await readFile(baseCssPath, 'utf8')

      // Migration: five nullable columns and the Cancelled-without-payable trigger, after 009.
      for (const column of [
        /ADD COLUMN delivery_price_rupees INTEGER CHECK \(delivery_price_rupees >= 0\)/,
        /ADD COLUMN payable_total_rupees INTEGER CHECK \(payable_total_rupees >= 0\)/,
        /ADD COLUMN cancellation_reason TEXT/,
        /ADD COLUMN cancelled_by TEXT CHECK \(cancelled_by IN \('parent', 'admin'\)\)/,
        /ADD COLUMN cancelled_at TEXT/,
      ]) {
        assert.match(migration, column)
      }
      assert.match(migration, /BEFORE UPDATE ON orders/)
      assert.match(migration, /BEFORE INSERT ON orders/)
      assert.equal((migration.match(/NEW\.status = 'Cancelled' AND NEW\.payable_total_rupees IS NOT NULL/g) ?? []).length, 2)
      assert.match(migration, /NEW\.status = 'Cancelled' AND NEW\.payable_total_rupees IS NOT NULL/)
      assert.match(migration, /RAISE\(ABORT/)
      assert.ok(
        runMigrationsSource.indexOf('009_orders_orders_and_lines.sql') <
          runMigrationsSource.indexOf('010_orders_delivery_and_cancellation.sql'),
      )

      // Server: SQL in detail.ts only; one immediate compare-and-set; no foreign tables.
      assert.doesNotMatch(ordersHttp, /db\.prepare/)
      for (const file of await walkFiles(ordersDir)) {
        if (!file.endsWith('.ts')) continue
        const source = await readFile(file, 'utf8')
        assert.doesNotMatch(
          source,
          /(FROM|JOIN|INTO|UPDATE)\s+(cart_\w+|packs|books|grades|schools|items|pack_books|parents|admins|sessions)\b/i,
          `foreign table in ${file}`,
        )
      }
      assert.match(ordersDetail, /export function getParentOrder/)
      assert.match(ordersDetail, /export function cancelParentOrder/)
      assert.match(ordersDetail, /cancel\.immediate\(\)/)
      assert.match(
        ordersDetail,
        /SET status = \?, cancelled_by = 'parent', cancelled_at = \?, payable_total_rupees = NULL\s*WHERE id = \? AND parent_id = \? AND status = \?/,
      )
      // 4.3 writes no delivery price or admin reason; only 4.5 and 4.6 do.
      assert.doesNotMatch(ordersDetail, /(delivery_price_rupees|cancellation_reason)\s*=\s*(\?|NULL|\d|')/)
      assert.match(ordersHttp, /'\/orders\/:id',\s*safe\(\(req, res\) => \{\s*res\.setHeader\('Cache-Control', 'no-store'\)/)
      assert.match(ordersHttp, /'\/orders\/:id\/cancel',\s*safe\(\(req, res\) => \{\s*res\.setHeader\('Cache-Control', 'no-store'\)/)
      assert.match(ordersHttp, /function parseId\(value: unknown\)/)
      assert.match(ordersHttp, /Only parents can place orders\./)
      assert.match(ordersHttp, /Only parents can view their orders\./)
      assert.doesNotMatch(ordersHttp, /\/admin\//)

      // The pill lives in the shared ui package, with the status list defined once.
      assert.match(uiIndex, /StatusPill/)
      assert.match(uiIndex, /PIPELINE_STAGES/)
      assert.match(statusPill, /export const ORDER_STATUSES = \[/)
      assert.doesNotMatch(ordersPage + orderDetail, /'Order Confirmed'|'Packing The Order'|'On Delivery Partner'/)

      // Detail: disclosure rows, the vertical timeline, the reason copy, and the delivery notice.
      assert.match(ordersPage, /<StatusPill status=\{order\.status\} \/>/)
      assert.match(ordersPage, /aria-expanded=\{open\}/)
      assert.match(ordersPage, /fetch\(`\/api\/orders\/\$\{orderId\}`/)
      assert.match(ordersPage, /fetch\(`\/api\/orders\/\$\{target\.id\}\/cancel`/)
      assert.match(orderDetail, /aria-current="step"/)
      assert.match(orderDetail, /PIPELINE_STAGES\.map/)
      assert.match(orderDetail, /Delivery charge: to be confirmed by the shop/)
      assert.match(orderDetail, /detail\.deliveryPrice === null && !cancelled/)
      assert.match(orderDetail, /Delivery charge</)
      assert.match(orderDetail, /Payable total/)
      assert.match(orderDetail, /Reason: \{cancellation\.reason\}/)
      assert.match(orderDetail, /You cancelled this order\./)
      assert.match(orderDetail, /detail\.status === ORDER_PLACED \? \(/)
      assert.match(orderDetail, /className="notice notice-info"/)

      // Modal: one level, a dialog with focus trapped and Escape to close.
      assert.match(orderDetail, /role="dialog"/)
      assert.match(orderDetail, /aria-modal="true"/)
      assert.match(orderDetail, /event\.key === 'Escape'/)
      assert.match(orderDetail, /event\.key !== 'Tab'/)
      assert.match(orderDetail, /Cancel order #\{publicNumber\}\?/)
      assert.match(orderDetail, /className="button-danger-solid"/)
      assert.match(orderDetail, /Keep order/)
      assert.equal((orderDetail.match(/role="dialog"/g) ?? []).length, 1)

      // Cancel: the lock, 401 logs out, 409 resyncs before the message, the order stays listed.
      assert.match(ordersPage, /const withLock = useCallback/)
      assert.match(ordersPage, /void withLock\(async \(\) => \{\s*let response: Response/)
      assert.match(ordersPage, /response\.status === 401\) \{\s*setModalTarget\(null\)\s*await logOut\.current\(\)/)
      assert.doesNotMatch(ordersPage, /session\.logOut\(\)/)
      // A lost cancel answer may still have committed, so the catch path resyncs too.
      assert.match(
        ordersPage,
        /\} catch \{\s*setModalTarget\(null\)\s*\/\/[^\n]*\s*await loadOrders\(\)\s*if \(openIdRef\.current === target\.id\) await loadDetail\(target\.id\)\s*setActionError\(UNREACHABLE\)/,
      )
      // A silent poll never aborts a pending load nor runs before the first load settles.
      assert.match(ordersPage, /if \(silent && \(!hasLoaded\.current \|\| loadController\.current !== null\)\) return 'aborted'/)
      assert.ok(
        ordersPage.indexOf("if (silent && (!hasLoaded.current") < ordersPage.indexOf('loadController.current?.abort()'),
      )
      // Busy modal buttons stay focusable, so the busy look hangs on aria-disabled.
      const busyRule = baseCss.match(
        /\.button-danger-solid\[aria-disabled='true'\],\s*\.button-secondary\[aria-disabled='true'\]\s*\{([^}]*)\}/,
      )?.[1]
      assert.ok(busyRule, 'missing the aria-disabled busy rule')
      assert.match(busyRule, /cursor: wait/)
      assert.match(busyRule, /opacity/)
      // Shift+Tab from the dialog container wraps to the last button.
      assert.match(orderDetail, /document\.activeElement === dialogRef\.current/)
      assert.match(ordersPage, /await loadOrders\(\)\s*if \(openIdRef\.current === target\.id\) await loadDetail\(target\.id\)\s*setActionError\(message\)/)
      assert.doesNotMatch(ordersPage, /navigate\('\//)

      // Polling: 30s, visible only, silent, paused while the modal is open.
      assert.match(ordersPage, /const POLL_MS = 30_000/)
      assert.match(ordersPage, /document\.visibilityState !== 'visible'/)
      assert.match(ordersPage, /if \(modalOpen\.current \|\| inFlight\.current\) return/)
      assert.match(ordersPage, /void loadOrders\(true\)/)
      assert.match(ordersPage, /if \(silent\) return 'failed'/)
      assert.doesNotMatch(ordersPage + orderDetail, /WebSocket|EventSource|Notification/)

      for (const source of [ordersPage, orderDetail, statusPill]) {
        assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/)
        assert.doesNotMatch(source, /horizontal|stepper/i)
      }
      assert.doesNotMatch(baseCss, /order-timeline[\w-]*\s*\{[^}]*flex-direction: row/)
      assert.match(cssRule(baseCss, '.order-timeline'), /flex-direction: column/)

      // Styles, all on tokens.
      assert.match(cssRule(baseCss, '.notice-info'), /var\(--color-info-tint\)/)
      assert.match(cssRule(baseCss, '.notice-info'), /var\(--color-info\)/)
      assert.match(cssRule(baseCss, '.button-danger-solid'), /background: var\(--color-danger\)/)
      assert.match(cssRule(baseCss, '.button-danger-solid'), /color: var\(--color-surface-base\)/)
      const modal = cssRule(baseCss, '.modal')
      assert.match(modal, /var\(--space-edge-strong\) solid var\(--color-border-strong\)/)
      assert.match(modal, /var\(--radius-lg\)/)
      assert.match(modal, /padding: var\(--space-5\)/)
      assert.match(cssRule(baseCss, '.modal-backdrop'), /var\(--color-text-primary\) 55%/)
      assert.match(cssRule(baseCss, ".modal-actions"), /justify-content: flex-end/)
      for (const name of [
        'order-row-toggle',
        'order-row-meta-start',
        'order-detail',
        'order-timeline',
        'order-timeline-step',
        'order-timeline-marker',
        'modal-backdrop',
        'modal',
        'modal-title',
        'modal-actions',
      ]) {
        assert.match(ordersPage + orderDetail, new RegExp(`className="${name}[ "]`), `${name} is rendered`)
        assert.ok(cssRule(baseCss, `.${name}`))
      }
      // Motion stays inside 120–200ms.
      assert.match(cssRule(baseCss, '.order-row-chevron'), /transition: transform 160ms/)
      assert.match(cssRule(baseCss, '.order-detail'), /animation: fade-in 160ms/)
      assert.match(cssRule(baseCss, '.modal-backdrop'), /animation: fade-in 160ms/)
      // Reduced motion also stops the chevron turning.
      const reduced = baseCss.slice(baseCss.indexOf('@media (prefers-reduced-motion: reduce)'))
      assert.match(reduced, /\.order-row-toggle\[aria-expanded='true'\] \.order-row-chevron \{\s*transform: none;/)
    })
  })

  describe('Admin Orders — one list, open and past', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let adminCookie: string
    let parentSerial = 0

    type AdminOrderJson = {
      id: number
      publicNumber: number
      status: string
      placedAt: string
      parentName: string
      whatsapp: string
      goodsTotal: number
      lineCount: number
      linesSummary: string
      callAttemptedAt: string | null
    }
    type ErrorBody = { error: { code: string; message: string } }
    type Parent = { cookie: string; id: number; name: string; whatsapp: string }
    type Placed = { id: number; publicNumber: number; packName: string; itemTitles: [string, string] }

    const FORBIDDEN = 'Only the shop owner can see all orders. Sign in as the shop owner to continue.'

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${adminOrdersBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function adminSend(pathName: string, body: unknown): Promise<{ id: number; title?: string }> {
      const response = await fetch(`${adminOrdersBaseUrl}${pathName}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify(body),
      })
      assert.equal(response.status, 201, `POST ${pathName}: ${response.status}`)
      return (await response.json()) as { id: number; title?: string }
    }

    async function registerParent(tag: string, whatsapp: string): Promise<Parent> {
      parentSerial += 1
      const email = `admin-orders.${tag}.${parentSerial}.${Date.now()}@example.com`
      const name = `Admin list ${tag}`
      const response = await fetch(`${adminOrdersBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          deliveryAddress: '12 Temple Road, Nugegoda',
          whatsapp,
          email,
          password: 'evening-order',
        }),
      })
      assert.equal(response.status, 201)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      const stored = readDb(
        (db) => db.prepare('SELECT id, whatsapp FROM parents WHERE email = ?').get(email) as { id: number; whatsapp: string },
      )
      return { cookie: cookieHeader(cookie), id: stored.id, name, whatsapp: stored.whatsapp }
    }

    /** One pack (one book) plus two items, then Place. */
    async function placeOne(parent: Parent, tag: string): Promise<Placed> {
      const s = `${Date.now()}-${tag}`
      const schoolId = (await adminSend('/api/admin/schools', catalogNameBody(`List school ${s}`))).id
      const gradeName = `Grade ${s}`
      const gradeId = (await adminSend('/api/admin/grades', catalogNameBody(gradeName))).id
      const book = await adminSend('/api/admin/books', bookBody(`Atlas ${s}`, 1500))
      const packName = `List pack ${s}`
      const pack = await adminSend('/api/admin/packs', packCreateBody(packName, schoolId, gradeId, 'List', [book.id]))
      const itemTitles: [string, string] = [`Pencil ${s}`, `Eraser ${s}`]
      const items = [
        await adminSend('/api/admin/items', itemBody(itemTitles[0], 'Stationery', 120)),
        await adminSend('/api/admin/items', itemBody(itemTitles[1], 'Stationery', 60)),
      ]
      const packResponse = await fetch(`${adminOrdersBaseUrl}/api/cart/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: parent.cookie },
        body: JSON.stringify({ packId: pack.id, selection: `${book.id}:1` }),
      })
      assert.equal(packResponse.status, 201)
      for (const item of items) {
        const itemResponse = await fetch(`${adminOrdersBaseUrl}/api/cart/items`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: parent.cookie },
          body: JSON.stringify({ itemId: item.id, quantity: 1 }),
        })
        assert.ok(itemResponse.status === 201 || itemResponse.status === 200, `add item ${itemResponse.status}`)
      }
      const response = await fetch(`${adminOrdersBaseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: parent.cookie,
          'Idempotency-Key': `admin-list-${tag}`,
        },
        body: JSON.stringify({}),
      })
      assert.equal(response.status, 201)
      const order = ((await response.json()) as { order: { id: number; publicNumber: number } }).order
      return { id: order.id, publicNumber: order.publicNumber, packName, itemTitles }
    }

    function getList(cookie: string | undefined): Promise<Response> {
      return fetch(`${adminOrdersBaseUrl}/api/admin/orders`, { headers: cookie ? { cookie } : {} })
    }

    async function listAll(): Promise<AdminOrderJson[]> {
      const response = await getList(adminCookie)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as { orders: AdminOrderJson[] }
      assert.deepEqual(Object.keys(body), ['orders'])
      return body.orders
    }

    function readDb<T>(read: (db: Database.Database) => T): T {
      const db = new Database(dbPath, { readonly: true })
      try {
        return read(db)
      } finally {
        db.close()
      }
    }

    /** Direct DB writes stand in for the admin stories (4.5, 4.6) that do not exist yet. */
    function writeDb(write: (db: Database.Database) => void): void {
      const db = new Database(dbPath)
      try {
        write(db)
      } finally {
        db.close()
      }
    }

    async function expectRefused(response: Response, status: number, code: string, message?: string): Promise<void> {
      assert.equal(response.status, status)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, code)
      if (message !== undefined) assert.equal(body.error.message, message)
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-admin-orders-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, ADMIN_ORDERS_PORT)
      child = started.child
      adminCookie = await signInAdmin()
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    let parentA: Parent
    let parentB: Parent
    let a1: Placed
    let a2: Placed
    let a3: Placed
    let b1: Placed
    let realAnswer: unknown

    it('empty: no orders answers 200 { orders: [] } and the column exists but is unset', async () => {
      assert.deepEqual(await listAll(), [])
      const columns = readDb((db) => db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string; notnull: number; dflt_value: unknown }>)
      const column = columns.find((entry) => entry.name === 'call_attempted_at')
      assert.ok(column, 'call_attempted_at column is missing')
      assert.equal(column.notnull, 0)
      assert.equal(column.dflt_value, null)
      const applied = readDb((db) => db.prepare('SELECT filename FROM applied_migrations ORDER BY rowid').all() as Array<{ filename: string }>)
      assert.equal(applied.at(-1)?.filename, '011_orders_call_attempted.sql')
    })

    it('auth: 401 without a cookie and 403 forbidden for a parent', async () => {
      parentA = await registerParent('a', '0771111111')
      await expectRefused(await getList(undefined), 401, 'unauthenticated')
      await expectRefused(await getList(parentA.cookie), 403, 'forbidden', FORBIDDEN)
    })

    it('all orders: both parents, id DESC, with snapshot name and WhatsApp; Cancelled and Delivered included', async () => {
      parentB = await registerParent('b', '0772222222')
      a1 = await placeOne(parentA, 'a1')
      a2 = await placeOne(parentA, 'a2')
      b1 = await placeOne(parentB, 'b1')
      a3 = await placeOne(parentA, 'a3')
      writeDb((db) => {
        db.prepare("UPDATE orders SET status = 'Cancelled', cancelled_by = 'admin', cancellation_reason = 'Out of stock' WHERE id = ?").run(a2.id)
        db.prepare("UPDATE orders SET status = 'Delivered', delivery_price_rupees = 400, payable_total_rupees = 2080 WHERE id = ?").run(a3.id)
      })
      const orders = await listAll()
      realAnswer = { orders }
      assert.deepEqual(orders.map((order) => order.id), [a3.id, b1.id, a2.id, a1.id])
      assert.deepEqual(orders.map((order) => order.status), ['Delivered', 'Order Is Placed', 'Cancelled', 'Order Is Placed'])
      for (const order of orders) {
        assert.deepEqual(Object.keys(order).sort(), [
          'callAttemptedAt',
          'goodsTotal',
          'id',
          'lineCount',
          'linesSummary',
          'parentName',
          'placedAt',
          'publicNumber',
          'status',
          'whatsapp',
        ])
        const owner = order.id === b1.id ? parentB : parentA
        assert.equal(order.parentName, owner.name)
        assert.equal(order.whatsapp, owner.whatsapp)
        assert.equal(order.goodsTotal, 1680)
        assert.equal(order.callAttemptedAt, null)
        assert.match(order.placedAt, /Z$/)
      }
      assert.equal(orders.find((order) => order.id === b1.id)?.publicNumber, b1.publicNumber)
    })

    it('summary: one pack plus two items is three lines, pack name first then item titles', async () => {
      const order = (await listAll()).find((entry) => entry.id === a1.id)
      assert.ok(order)
      assert.equal(order.lineCount, 3)
      assert.equal(order.linesSummary, `${a1.packName}, ${a1.itemTitles[0]}, ${a1.itemTitles[1]}`)
    })

    it('summary order: lines follow position, not row id, within each line table', async () => {
      const ids = readDb(
        (db) =>
          db.prepare('SELECT id, position FROM order_item_lines WHERE order_id = ? ORDER BY id').all(b1.id) as Array<{ id: number; position: number }>,
      )
      assert.equal(ids.length, 2)
      assert.ok(ids[0].position < ids[1].position)
      // Swap the two item positions, so position order is the reverse of id order.
      writeDb((db) => {
        const set = db.prepare('UPDATE order_item_lines SET position = ? WHERE id = ?')
        db.transaction(() => {
          set.run(ids[1].position, ids[0].id)
          set.run(ids[0].position, ids[1].id)
        })()
      })
      const order = (await listAll()).find((entry) => entry.id === b1.id)
      assert.ok(order)
      assert.equal(order.lineCount, 3)
      assert.equal(order.linesSummary, `${b1.packName}, ${b1.itemTitles[1]}, ${b1.itemTitles[0]}`)
    })

    it('snapshot holds: a parent renaming their account still lists the placed name', async () => {
      const response = await fetch(`${adminOrdersBaseUrl}/api/parents/me`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: parentA.cookie },
        body: JSON.stringify({
          name: 'Renamed parent',
          deliveryAddress: '1 New Road, Colombo',
          whatsapp: '0779999999',
          secondPhone: '',
          password: '',
        }),
      })
      assert.equal(response.status, 200)
      const current = readDb((db) => db.prepare('SELECT name, whatsapp FROM parents WHERE id = ?').get(parentA.id) as { name: string; whatsapp: string })
      assert.equal(current.name, 'Renamed parent')
      for (const order of (await listAll()).filter((entry) => entry.id !== b1.id)) {
        assert.equal(order.parentName, parentA.name)
        assert.equal(order.whatsapp, parentA.whatsapp)
      }
    })

    it('call state: only the order the DB marks carries callAttemptedAt', async () => {
      const at = '2026-10-02T03:45:00.000Z'
      writeDb((db) => {
        db.prepare('UPDATE orders SET call_attempted_at = ? WHERE id = ?').run(at, a1.id)
      })
      const orders = await listAll()
      for (const order of orders) {
        assert.equal(order.callAttemptedAt, order.id === a1.id ? at : null)
      }
    })

    it('client: the path, the parser, the filter param, and the Open / Past grouping', () => {
      assert.equal(adminOrdersPath(), '/api/admin/orders')
      const parsed = parseAdminOrders(realAnswer)
      assert.ok(parsed)
      assert.equal(parsed.length, 4)
      assert.equal(parseAdminOrders({ orders: [{ id: 1 }] }), undefined)
      // An unknown status fails the whole list, like any other bad field.
      const good = parsed[0]
      assert.equal(parseAdminOrders({ orders: [good, { ...good, id: 999, status: 'Lost in post' }] }), undefined)
      assert.equal(parseAdminOrders({ orders: [{ ...good, status: 'order is placed' }] }), undefined)
      assert.deepEqual(parseAdminOrders({ orders: [good] }), [good])
      assert.equal(parseAdminOrders(null), undefined)
      assert.equal(statusFilterFrom('Cancelled'), 'Cancelled')
      assert.equal(statusFilterFrom('cancelled'), null)
      assert.equal(statusFilterFrom('Bogus'), null)
      assert.equal(statusFilterFrom(null), null)
      // The URL transform: set, delete, and keep every other param.
      const start = new URLSearchParams('page=2&q=atlas')
      const set = withStatusFilter(start, 'Cancelled')
      assert.equal(set.get('status'), 'Cancelled')
      assert.equal(set.get('page'), '2')
      assert.equal(set.get('q'), 'atlas')
      assert.equal(start.has('status'), false)
      const cleared = withStatusFilter(new URLSearchParams('status=Cancelled&page=2&q=atlas'), null)
      assert.equal(cleared.has('status'), false)
      assert.equal(cleared.toString(), 'page=2&q=atlas')
      assert.equal(withStatusFilter(new URLSearchParams('status=Delivered&q=x'), 'Processing').toString(), 'status=Processing&q=x')

      const row = (id: number, status: string): AdminOrderJson => ({
        id,
        publicNumber: 1000 + id,
        status,
        placedAt: '2026-10-01T03:45:00.000Z',
        parentName: `Parent ${id}`,
        whatsapp: '0771234567',
        goodsTotal: 1000,
        lineCount: 1,
        linesSummary: 'Pack',
        callAttemptedAt: null,
      })
      const fixture = [
        row(9, 'Cancelled'),
        row(8, 'Processing'),
        row(7, 'Delivered'),
        row(6, 'Order Is Placed'),
        row(5, 'Delivered'),
        row(4, 'Order Is Placed'),
      ]
      const [open, past] = adminOrderSections(fixture, null)
      assert.equal(open.title, 'Open')
      assert.equal(past.title, 'Past')
      assert.deepEqual(open.groups.map((group) => group.status), ['Order Is Placed', 'Processing'])
      // Open lists oldest first; Past newest first.
      assert.deepEqual(open.groups[0].orders.map((order) => order.id), [4, 6])
      assert.deepEqual(past.groups.map((group) => group.status), ['Delivered', 'Cancelled'])
      assert.deepEqual(past.groups[0].orders.map((order) => order.id), [7, 5])
      const [openCancelled, pastCancelled] = adminOrderSections(fixture, 'Cancelled')
      assert.deepEqual(openCancelled.groups, [])
      assert.deepEqual(pastCancelled.groups.map((group) => group.orders.map((order) => order.id)), [[9]])
      const [emptyOpen, emptyPast] = adminOrderSections([], null)
      assert.equal(emptyOpen.emptyCopy, 'No open orders.')
      assert.equal(emptyPast.emptyCopy, 'No past orders.')
    })

    it('render: sections, group counts, rows, call chips, filter, and both empty cards', async () => {
      ;(globalThis as { React?: unknown }).React = React
      const { AdminOrdersBoard, placedAtCopy, calledCopy } = await import('../../client/admin/src/OrdersPage.tsx')
      const noop = () => {}
      // The same Colombo day as the attempted call below (2 Oct, 9:15 am).
      const sameDay = Date.parse('2026-10-02T06:00:00.000Z')
      // Rows are links since 4.5, so the board renders inside a router.
      const render = (orders: AdminOrderJson[], filter: string | null, extra: { now?: number; busy?: boolean } = {}) =>
        renderToStaticMarkup(
          React.createElement(
            MemoryRouter,
            null,
            React.createElement(AdminOrdersBoard, {
              orders,
              filter: statusFilterFrom(filter),
              now: extra.now ?? sameDay,
              busy: extra.busy,
              onFilterChange: noop,
              onRefresh: noop,
            }),
          ),
        )
      const base = {
        publicNumber: 1042,
        placedAt: '2026-10-01T03:45:00.000Z',
        parentName: 'Nimali Perera',
        whatsapp: '0771234567',
        goodsTotal: 4160,
        lineCount: 3,
        linesSummary: 'Grade 5 pack, Pencil, Eraser',
      }
      const orders: AdminOrderJson[] = [
        { ...base, id: 5, publicNumber: 1005, status: 'Cancelled', callAttemptedAt: null },
        { ...base, id: 4, publicNumber: 1004, status: 'Delivered', callAttemptedAt: null },
        { ...base, id: 3, publicNumber: 1003, status: 'Order Confirmed', callAttemptedAt: null },
        { ...base, id: 2, publicNumber: 1002, status: 'Order Is Placed', callAttemptedAt: '2026-10-02T03:45:00.000Z' },
        { ...base, id: 1, publicNumber: 1001, status: 'Order Is Placed', callAttemptedAt: null },
      ]

      assert.equal(placedAtCopy('2026-10-01T03:45:00.000Z'), '1 Oct 2026, 9:15 am')
      assert.equal(placedAtCopy('2025-12-31T20:00:00.000Z'), '1 Jan 2026, 1:30 am')
      // Same Colombo day: time only. An earlier Colombo day names the day too.
      assert.equal(calledCopy('2026-10-02T13:05:00.000Z', Date.parse('2026-10-02T15:00:00.000Z')), 'Called 6:35 pm · no answer')
      assert.equal(calledCopy('2026-10-02T13:05:00.000Z', Date.parse('2026-10-03T03:00:00.000Z')), 'Called 2 Oct, 6:35 pm · no answer')
      // 19:00 UTC is already 3 Oct in Colombo, so the call was the day before.
      assert.equal(calledCopy('2026-10-02T13:05:00.000Z', Date.parse('2026-10-02T19:00:00.000Z')), 'Called 2 Oct, 6:35 pm · no answer')
      assert.equal(calledCopy('2025-10-02T13:05:00.000Z', Date.parse('2026-10-02T15:00:00.000Z')), 'Called 2 Oct, 6:35 pm · no answer')
      assert.doesNotMatch(calledCopy('2026-10-02T13:05:00.000Z'), / {2}| ·$/)

      const all = render(orders, null)
      assert.doesNotMatch(all, /Add order/)
      assert.ok(all.indexOf('>Open</h2>') < all.indexOf('>Past</h2>'))
      const groupTitles = [...all.matchAll(/class="admin-order-group-title[^"]*">([^<]+)</g)].map((m) => m[1])
      assert.deepEqual(groupTitles, ['Order Is Placed', 'Order Confirmed', 'Delivered', 'Cancelled'])
      const counts = [...all.matchAll(/class="admin-order-group-count">(\d+)/g)].map((m) => m[1])
      assert.deepEqual(counts, ['2', '1', '1', '1'])
      // Open is oldest first inside a group.
      const at1001 = all.search(/#(?:<!-- -->)?1001</)
      const at1002 = all.search(/#(?:<!-- -->)?1002</)
      assert.ok(at1001 >= 0 && at1001 < at1002, `${at1001} ${at1002}`)
      assert.match(all, /1 Oct 2026, 9:15 am/)
      assert.match(all, /0771234567 · 3 lines · Rs\. 4,160/)
      assert.match(all, /class="admin-order-lines text-meta" title="Grade 5 pack, Pencil, Eraser"/)
      assert.equal((all.match(/class="admin-order-row is-attention"/g) ?? []).length, 2)
      assert.equal((all.match(/class="admin-order-row"/g) ?? []).length, 3)
      // Two Placed rows, two different chips; nothing else carries a chip.
      assert.equal((all.match(/admin-order-call admin-order-call-never/g) ?? []).length, 1)
      assert.equal((all.match(/admin-order-call admin-order-call-attempted/g) ?? []).length, 1)
      assert.match(all, /<span>Not called yet<\/span>/)
      assert.match(all, /<span>Called 9:15 am · no answer<\/span>/)
      const nextDay = render(orders, null, { now: Date.parse('2026-10-03T06:00:00.000Z') })
      assert.match(nextDay, /<span>Called 2 Oct, 9:15 am · no answer<\/span>/)
      const never = all.match(/admin-order-call-never">([\s\S]*?)<\/span><\/span>/)?.[1] ?? ''
      const attempted = all.match(/admin-order-call-attempted">([\s\S]*?)<\/span><\/span>/)?.[1] ?? ''
      assert.match(never, /<svg[^>]*aria-hidden="true"[\s\S]*<circle/)
      assert.match(attempted, /<svg[^>]*aria-hidden="true"[^>]*fill="currentColor"[\s\S]*<path/)
      assert.doesNotMatch(attempted, /<circle/)
      // The filter: a labelled select with All plus the eight statuses in order.
      assert.match(all, /<label class="text-label-caps" for="admin-order-status-filter">Status<\/label>/)
      const options = [...all.matchAll(/<option value="([^"]*)"[^>]*>([^<]+)<\/option>/g)].map((m) => m[2])
      assert.deepEqual(options, ['All statuses', 'Order Is Placed', 'Order Confirmed', 'Processing', 'Packing The Order', 'Ready To Deliver', 'On Delivery Partner', 'Delivered', 'Cancelled'])

      const onlyPast = render(orders.filter((order) => order.id >= 4), null)
      assert.match(onlyPast, /No open orders\./)
      assert.doesNotMatch(onlyPast, /No past orders\./)
      const onlyOpen = render(orders.filter((order) => order.id <= 3), null)
      assert.match(onlyOpen, /No past orders\./)

      const cancelled = render(orders, 'Cancelled')
      assert.equal((cancelled.match(/<li class="admin-order-row/g) ?? []).length, 1)
      assert.match(cancelled, /#(?:<!-- -->)?1005</)
      assert.doesNotMatch(cancelled, /#(?:<!-- -->)?100[1-4]</)
      assert.match(cancelled, /<option value="Cancelled" selected="">/)
      assert.match(cancelled, />Past<\/h2>/)
      assert.doesNotMatch(cancelled, />Open<\/h2>/)
      assert.doesNotMatch(cancelled, /No open orders\./)
      // The mirror: an open-status filter hides the Past section.
      const confirmed = render(orders, 'Order Confirmed')
      assert.match(confirmed, />Open<\/h2>/)
      assert.doesNotMatch(confirmed, />Past<\/h2>/)
      assert.doesNotMatch(confirmed, /No past orders\./)
      assert.equal((confirmed.match(/<li class="admin-order-row/g) ?? []).length, 1)
      assert.match(confirmed, /#(?:<!-- -->)?1003</)
      // An unknown filter value means All.
      assert.equal(render(orders, 'Lost in post'), all)

      const filterEmpty = render(orders, 'Processing')
      assert.match(filterEmpty, /No Processing orders\./)
      assert.match(filterEmpty, /class="button-primary press-travel"[^>]*>Show all statuses</)
      assert.doesNotMatch(filterEmpty, /admin-order-row/)
      assert.doesNotMatch(filterEmpty, /disabled/)
      assert.match(render(orders, 'Processing', { busy: true }), /<button type="button" class="button-primary press-travel" disabled="">Show all statuses</)

      const none = render([], null)
      assert.match(none, /class="admin-order-empty"/)
      assert.match(none, /No orders yet\./)
      assert.match(none, /class="button-primary press-travel"[^>]*>Refresh</)
      assert.doesNotMatch(none, /admin-order-section/)
    })

    it('wires the migration, the route, the page, and token-only styles', async () => {
      const read = (...parts: string[]) => readFile(path.join(...parts), 'utf8')
      const ordersDir = path.join(serverRoot, 'orders')
      const adminHttp = await read(ordersDir, 'admin-http.ts')
      const adminSql = await read(ordersDir, 'admin.ts')
      const ordersIndex = await read(ordersDir, 'index.ts')
      const api = await read(serverRoot, 'web', 'api.ts')
      const runMigrationsSource = await read(serverRoot, 'db', 'migrations', 'run.ts')
      const migration = await read(serverRoot, 'db', 'migrations', '011_orders_call_attempted.sql')
      const adminSrc = path.join(repoRoot, 'client', 'admin', 'src')
      const page = await read(adminSrc, 'OrdersPage.tsx')
      const helper = await read(adminSrc, 'orders.ts')
      const adminApp = await readFile(adminAppPath, 'utf8')
      const shell = await read(adminSrc, 'Shell.tsx')
      const baseCss = await readFile(baseCssPath, 'utf8')

      // Migration 011: one nullable TEXT column, listed after 010.
      assert.match(migration, /ALTER TABLE orders ADD COLUMN call_attempted_at TEXT;/)
      assert.doesNotMatch(migration, /NOT NULL|DEFAULT/)
      assert.ok(
        runMigrationsSource.indexOf('010_orders_delivery_and_cancellation.sql') <
          runMigrationsSource.indexOf('011_orders_call_attempted.sql'),
      )

      // Server: SQL in admin.ts only, orders tables only, nothing writes the call column.
      assert.doesNotMatch(adminHttp, /db\.prepare/)
      assert.match(adminHttp, /export function createAdminOrdersRouter/)
      assert.match(adminHttp, /'\/admin\/orders',\s*safe\(\(req, res\) => \{\s*res\.setHeader\('Cache-Control', 'no-store'\)/)
      assert.match(adminHttp, /function requireAdmin\(/)
      assert.match(adminHttp, /Only the shop owner can see all orders\. Sign in as the shop owner to continue\./)
      assert.match(adminSql, /export function listAdminOrders\(db: Database\.Database\)/)
      assert.match(adminSql, /ORDER BY id DESC/)
      // The list itself is still one orders read plus one read per line table (4.5 adds more below it).
      const listBody = adminSql.slice(adminSql.indexOf('export function listAdminOrders'))
      const listFn = listBody.slice(0, listBody.search(/\r?\n\}\r?\n/) + 2)
      assert.equal((listFn.match(/db\s*\.prepare\(/g) ?? []).length, 3)
      for (const file of await walkFiles(ordersDir)) {
        if (!file.endsWith('.ts')) continue
        const source = await readFile(file, 'utf8')
        // Only the 4.5 call mark in admin.ts writes the call column.
        if (path.basename(file) !== 'admin.ts') {
          assert.doesNotMatch(source, /call_attempted_at\s*=/, `writes call_attempted_at in ${file}`)
        }
        assert.doesNotMatch(source, /(FROM|JOIN)\s+(?!orders\b|order_pack_lines\b|order_pack_line_books\b|order_item_lines\b)[a-z_]+\b/, `foreign table in ${file}`)
      }
      assert.match(ordersIndex, /export \{ createAdminOrdersRouter \} from '\.\/admin-http\.js'/)
      assert.match(api, /router\.use\(createAdminOrdersRouter\(db, env\)\)/)
      assert.ok(api.indexOf('createAdminOrdersRouter(db, env)') < api.indexOf('router.use((req, res)'))
      assert.doesNotMatch(api + ordersIndex, /completed/i)

      // Client: wired as the index route; the nav entry is unchanged.
      assert.match(adminApp, /import \{ OrdersPage \} from '\.\/OrdersPage'/)
      assert.match(adminApp, /<Route index element=\{<OrdersPage \/>\} \/>/)
      assert.doesNotMatch(adminApp, /<Page title="Orders" \/>/)
      assert.match(shell, /\{ to: '\/', label: 'Orders', end: true \}/)

      // Page: no Add order, no storage, no status literals, no links or actions yet.
      for (const source of [page, helper]) {
        assert.doesNotMatch(source, /Add order/i)
        assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/)
        assert.doesNotMatch(
          source,
          /'(Order Is Placed|Order Confirmed|Processing|Packing The Order|Ready To Deliver|On Delivery Partner|Delivered|Cancelled)'/,
        )
        assert.doesNotMatch(source, /\.order-row|className="order-row/)
      }
      // Rows link to the 4.5 detail and nowhere else; the list itself still sends nothing.
      assert.doesNotMatch(page, /<NavLink|href=|method: 'POST'|method: 'PATCH'/)
      assert.deepEqual([...page.matchAll(/<Link\b[^>]*>/g)].map((m) => m[0]), [
        '<Link className="admin-order-row-link" to={adminOrderRoute(order.id)}>',
      ])
      assert.match(page, /useSearchParams/)
      assert.match(page, /searchParams\.get\('status'\)/)
      assert.match(page, /new AbortController\(\)/)
      assert.match(page, /<Skeleton \/>/)
      assert.match(page, /response\.status === 401\) \{\s*\/\/[^\n]*\s*setOrders\(\[\]\)\s*try \{\s*await signOutRef\.current\(\)\s*\} catch/)
      assert.match(page, /withStatusFilter\(current, status\)/)
      assert.match(page, /timeZone: 'Asia\/Colombo'/)
      assert.match(page, /const SIGN_IN_AGAIN = 'Sign in to continue\.'/)
      assert.match(page, /const UNREACHABLE = 'Could not reach the shop\. Try again\.'/)

      // Styles: admin-order-* rules on tokens only, the attention edge, the chips, the reflow.
      const rules = [...baseCss.matchAll(/(?:^|\n)[ \t]*([^{}\n]*\.admin-order[^{}]*)\{([^}]*)\}/g)]
      assert.ok(rules.length >= 20, 'admin-order rules are missing')
      for (const [, selector, body] of rules) {
        assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|(?<![\w-])(?:white|black)(?![\w-])/, `${selector.trim()} uses a raw colour`)
        for (const color of body.matchAll(/(?:color|background|border[\w-]*):\s*([^;]+);/g)) {
          assert.match(color[1], /var\(--|none|^0$|^\d+fr|^0 /, `${selector.trim()} ${color[0]}`)
        }
      }
      assert.match(cssRule(baseCss, '.admin-order-row'), /grid-template-columns: 88px 1\.5fr 1\.1fr 152px auto/)
      assert.match(cssRule(baseCss, '.admin-order-row'), /var\(--space-edge-hairline\) solid var\(--color-border-default\)/)
      assert.match(cssRule(baseCss, '.admin-order-row'), /border-radius: var\(--radius-md\)/)
      assert.match(cssRule(baseCss, '.admin-order-row'), /transition: border-color 160ms/)
      const attention = cssRule(baseCss, '.admin-order-row.is-attention')
      assert.match(attention, /border-color: var\(--color-border-strong\)/)
      assert.match(attention, /border-left-width: var\(--space-2\)/)
      // The thicker left edge comes out of the padding, so columns line up with normal rows.
      assert.match(attention, /padding-left: calc\(var\(--space-3\) \+ var\(--space-edge-hairline\) \* 2 - var\(--space-2\)\)/)
      assert.match(cssRule(baseCss, '.admin-order-row'), /padding: var\(--space-3\) calc\(var\(--space-3\) \+ var\(--space-edge-hairline\)\)/)
      assert.match(cssRule(baseCss, '.admin-order-group-header'), /border-bottom: var\(--space-edge-strong\) solid var\(--color-border-strong\)/)
      const count = cssRule(baseCss, '.admin-order-group-count')
      assert.match(count, /background: var\(--color-accent-primary\)/)
      assert.match(count, /border-radius: var\(--radius-full\)/)
      const never = cssRule(baseCss, '.admin-order-call-never')
      assert.match(never, /dashed var\(--color-border-default\)/)
      const attempted = cssRule(baseCss, '.admin-order-call-attempted')
      assert.match(attempted, /background: var\(--color-warn-tint\)/)
      assert.match(attempted, /solid var\(--color-warning\)/)
      assert.match(cssRule(baseCss, '.admin-order-lines'), /text-overflow: ellipsis/)
      const empty = cssRule(baseCss, '.admin-order-empty')
      assert.match(empty, /var\(--space-edge-strong\) solid var\(--color-border-strong\)/)
      assert.match(empty, /var\(--radius-lg\)/)
      // Below 900px: two lines, ID and pill then parent and call, targets kept at 44px.
      const narrow = baseCss.slice(baseCss.indexOf('.admin-order-empty-title'))
      const reflow = narrow.slice(narrow.indexOf('@media (max-width: 899px)'))
      assert.match(reflow, /'id status'\s*'parent call'/)
      assert.match(reflow, /min-height: var\(--space-touch-min\)/)
    })
  })

  describe('Admin order detail — confirm and mark the call', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let adminCookie: string
    let parentSerial = 0

    type Line = { title: string; unitPrice: number; quantity: number; lineTotal: number }
    type AdminDetailJson = {
      id: number
      publicNumber: number
      status: string
      placedAt: string
      goodsTotal: number
      deliveryPrice: number | null
      payableTotal: number | null
      note: string | null
      deliveryAddress: string
      cancellation: { by: string; reason: string | null; at: string | null } | null
      packLines: Array<{
        packName: string
        label: string
        gradeName: string
        lineTotal: number
        books: Array<{ title: string; unitPrice: number; quantity: number }>
      }>
      itemLines: Line[]
      parentName: string
      whatsapp: string
      secondPhone: string | null
      callAttemptedAt: string | null
    }
    type ErrorBody = { error: { code: string; message: string; field?: string } }
    type Parent = {
      cookie: string
      id: number
      name: string
      whatsapp: string
      secondPhone: string | null
      address: string
    }
    type Placed = { id: number; publicNumber: number; packName: string; bookTitle: string; itemTitles: [string, string] }

    const FORBIDDEN = 'Only the shop owner can see all orders. Sign in as the shop owner to continue.'
    const PRICE_MESSAGE = 'Enter the delivery charge in whole rupees, Rs. 0 or more.'
    const NOT_CALLABLE = 'This order is no longer waiting for a call.'
    const CANCELLED_FIRST = "The parent cancelled this order before your confirm arrived, so it can't be confirmed."
    const ALREADY_CONFIRMED = "This order is already Order Confirmed, so it can't be confirmed again."
    const DETAIL_KEYS = [
      'callAttemptedAt',
      'cancellation',
      'deliveryAddress',
      'deliveryPrice',
      'goodsTotal',
      'id',
      'itemLines',
      'note',
      'packLines',
      'parentName',
      'payableTotal',
      'placedAt',
      'publicNumber',
      'secondPhone',
      'status',
      'whatsapp',
    ]

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${adminDetailBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function adminSend(pathName: string, body: unknown): Promise<{ id: number; title?: string }> {
      const response = await fetch(`${adminDetailBaseUrl}${pathName}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify(body),
      })
      assert.equal(response.status, 201, `POST ${pathName}: ${response.status}`)
      return (await response.json()) as { id: number; title?: string }
    }

    async function registerParent(tag: string, secondPhone: string | null): Promise<Parent> {
      parentSerial += 1
      const email = `admin-detail.${tag}.${parentSerial}.${Date.now()}@example.com`
      const name = `Admin detail ${tag}`
      const address = `${parentSerial} Lake Road, Maharagama`
      const response = await fetch(`${adminDetailBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          deliveryAddress: address,
          whatsapp: `0771111${String(100 + parentSerial).slice(-3)}`,
          secondPhone: secondPhone ?? '',
          email,
          password: 'evening-order',
        }),
      })
      assert.equal(response.status, 201)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      const stored = readDb(
        (db) =>
          db.prepare('SELECT id, whatsapp, second_phone FROM parents WHERE email = ?').get(email) as {
            id: number
            whatsapp: string
            second_phone: string | null
          },
      )
      return {
        cookie: cookieHeader(cookie),
        id: stored.id,
        name,
        whatsapp: stored.whatsapp,
        secondPhone: stored.second_phone,
        address,
      }
    }

    /** One pack (one book, Rs. 1,500) plus two items (Rs. 120 and Rs. 60), then Place: goods 1680. */
    async function placeOne(parent: Parent, tag: string, note?: string): Promise<Placed> {
      const s = `${Date.now()}-${tag}`
      const schoolId = (await adminSend('/api/admin/schools', catalogNameBody(`Detail school ${s}`))).id
      const gradeId = (await adminSend('/api/admin/grades', catalogNameBody(`Grade ${s}`))).id
      const bookTitle = `Atlas ${s}`
      const book = await adminSend('/api/admin/books', bookBody(bookTitle, 1500))
      const packName = `Detail pack ${s}`
      const pack = await adminSend('/api/admin/packs', packCreateBody(packName, schoolId, gradeId, 'Detail', [book.id]))
      const itemTitles: [string, string] = [`Pencil ${s}`, `Eraser ${s}`]
      const items = [
        await adminSend('/api/admin/items', itemBody(itemTitles[0], 'Stationery', 120)),
        await adminSend('/api/admin/items', itemBody(itemTitles[1], 'Stationery', 60)),
      ]
      const packResponse = await fetch(`${adminDetailBaseUrl}/api/cart/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: parent.cookie },
        body: JSON.stringify({ packId: pack.id, selection: `${book.id}:1` }),
      })
      assert.equal(packResponse.status, 201)
      for (const item of items) {
        const itemResponse = await fetch(`${adminDetailBaseUrl}/api/cart/items`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: parent.cookie },
          body: JSON.stringify({ itemId: item.id, quantity: 1 }),
        })
        assert.ok(itemResponse.status === 201 || itemResponse.status === 200, `add item ${itemResponse.status}`)
      }
      const response = await fetch(`${adminDetailBaseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: parent.cookie,
          'Idempotency-Key': `admin-detail-${s}`,
        },
        body: JSON.stringify(note === undefined ? {} : { note }),
      })
      assert.equal(response.status, 201)
      const order = ((await response.json()) as { order: { id: number; publicNumber: number } }).order
      return { id: order.id, publicNumber: order.publicNumber, packName, bookTitle, itemTitles }
    }

    function getDetail(cookie: string | undefined, id: number | string): Promise<Response> {
      return fetch(`${adminDetailBaseUrl}/api/admin/orders/${id}`, { headers: cookie ? { cookie } : {} })
    }

    function markCall(cookie: string | undefined, id: number | string): Promise<Response> {
      return fetch(`${adminDetailBaseUrl}/api/admin/orders/${id}/call-attempted`, {
        method: 'POST',
        headers: cookie ? { cookie } : {},
      })
    }

    function confirm(cookie: string | undefined, id: number | string, body: unknown): Promise<Response> {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (cookie) headers.cookie = cookie
      return fetch(`${adminDetailBaseUrl}/api/admin/orders/${id}/confirm`, {
        method: 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    }

    function parentCancel(parent: Parent, id: number): Promise<Response> {
      return fetch(`${adminDetailBaseUrl}/api/orders/${id}/cancel`, {
        method: 'POST',
        headers: { cookie: parent.cookie },
      })
    }

    async function okOrder(response: Response): Promise<AdminDetailJson> {
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as { order: AdminDetailJson }
      assert.deepEqual(Object.keys(body), ['order'])
      return body.order
    }

    function readDb<T>(read: (db: Database.Database) => T): T {
      const db = new Database(dbPath, { readonly: true })
      try {
        return read(db)
      } finally {
        db.close()
      }
    }

    function orderRow(id: number): Record<string, unknown> {
      return readDb((db) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, unknown>)
    }

    /** The order row plus every snapshot line, so a frozen order can be compared whole. */
    function snapshotOf(id: number): unknown {
      return readDb((db) => ({
        order: db.prepare('SELECT * FROM orders WHERE id = ?').get(id),
        packs: db.prepare('SELECT * FROM order_pack_lines WHERE order_id = ? ORDER BY id').all(id),
        books: db
          .prepare(
            `SELECT b.* FROM order_pack_line_books b JOIN order_pack_lines l ON l.id = b.line_id
             WHERE l.order_id = ? ORDER BY b.rowid`,
          )
          .all(id),
        items: db.prepare('SELECT * FROM order_item_lines WHERE order_id = ? ORDER BY id').all(id),
      }))
    }

    async function expectRefused(
      response: Response,
      status: number,
      code: string,
      message?: string,
      field?: string,
    ): Promise<void> {
      assert.equal(response.status, status)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, code)
      if (message !== undefined) assert.equal(body.error.message, message)
      if (field !== undefined) assert.equal(body.error.field, field)
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-admin-detail-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, ADMIN_DETAIL_PORT)
      child = started.child
      adminCookie = await signInAdmin()
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    let withPhone: Parent
    let withoutPhone: Parent
    let noted: Placed
    let realAnswer: unknown

    it('auth / id: 401 without a cookie, 403 for a parent, 404 for a bad or unknown id', async () => {
      withPhone = await registerParent('phone', '0712345678')
      const order = await placeOne(withPhone, 'auth')
      for (const send of [
        (cookie?: string) => getDetail(cookie, order.id),
        (cookie?: string) => markCall(cookie, order.id),
        (cookie?: string) => confirm(cookie, order.id, { deliveryPrice: 350 }),
      ]) {
        await expectRefused(await send(undefined), 401, 'unauthenticated')
        await expectRefused(await send(withPhone.cookie), 403, 'forbidden', FORBIDDEN)
      }
      for (const id of ['abc', '0', '-1', '1.5', '01', '999999', '99999999999999999999']) {
        await expectRefused(await getDetail(adminCookie, id), 404, 'not_found', 'Order not found.')
        await expectRefused(await markCall(adminCookie, id), 404, 'not_found', 'Order not found.')
        await expectRefused(await confirm(adminCookie, id, { deliveryPrice: 350 }), 404, 'not_found', 'Order not found.')
      }
      // Nothing above touched the order.
      assert.equal(orderRow(order.id).status, 'Order Is Placed')
      assert.equal(orderRow(order.id).call_attempted_at, null)
    })

    it('detail: the snapshot contacts, address, note, lines and goods total survive a rename', async () => {
      noted = await placeOne(withPhone, 'noted', 'Ring the side gate')
      const rename = await fetch(`${adminDetailBaseUrl}/api/parents/me`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: withPhone.cookie },
        body: JSON.stringify({
          name: 'Renamed detail parent',
          deliveryAddress: '1 New Road, Colombo',
          whatsapp: '0779999999',
          secondPhone: '0718888888',
          password: '',
        }),
      })
      assert.equal(rename.status, 200)
      const order = await okOrder(await getDetail(adminCookie, noted.id))
      realAnswer = { order }
      assert.deepEqual(Object.keys(order).sort(), DETAIL_KEYS)
      assert.equal(order.parentName, withPhone.name)
      assert.equal(order.whatsapp, withPhone.whatsapp)
      assert.ok(withPhone.secondPhone)
      assert.equal(order.secondPhone, withPhone.secondPhone)
      assert.equal(order.deliveryAddress, withPhone.address)
      assert.equal(order.note, 'Ring the side gate')
      assert.equal(order.status, 'Order Is Placed')
      assert.equal(order.publicNumber, noted.publicNumber)
      assert.equal(order.goodsTotal, 1680)
      assert.equal(order.deliveryPrice, null)
      assert.equal(order.payableTotal, null)
      assert.equal(order.callAttemptedAt, null)
      assert.equal(order.cancellation, null)
      assert.equal(order.packLines.length, 1)
      assert.equal(order.packLines[0].packName, noted.packName)
      assert.deepEqual(order.packLines[0].books, [{ title: noted.bookTitle, unitPrice: 1500, quantity: 1 }])
      assert.deepEqual(
        order.itemLines.map((line) => [line.title, line.unitPrice, line.quantity, line.lineTotal]),
        [
          [noted.itemTitles[0], 120, 1, 120],
          [noted.itemTitles[1], 60, 1, 60],
        ],
      )
      // The 4.3 detail is reused, not copied: the admin answer is the parent's plus four fields.
      const parentAnswer = await fetch(`${adminDetailBaseUrl}/api/orders/${noted.id}`, {
        headers: { cookie: withPhone.cookie },
      })
      assert.equal(parentAnswer.status, 200)
      const parentOrder = ((await parentAnswer.json()) as { order: Record<string, unknown> }).order
      const { parentName, whatsapp, secondPhone, callAttemptedAt, ...rest } = order
      void parentName
      void whatsapp
      void secondPhone
      void callAttemptedAt
      assert.deepEqual(rest, parentOrder)
    })

    it('no second phone: secondPhone is null and no note is null', async () => {
      withoutPhone = await registerParent('nophone', null)
      assert.equal(withoutPhone.secondPhone, null)
      const placed = await placeOne(withoutPhone, 'nophone')
      const order = await okOrder(await getDetail(adminCookie, placed.id))
      assert.equal(order.secondPhone, null)
      assert.equal(order.note, null)
      assert.equal(order.parentName, withoutPhone.name)
    })

    it('mark call: sets callAttemptedAt, and a second call writes a later time', async () => {
      const placed = await placeOne(withoutPhone, 'call')
      const before = Date.now()
      const first = await okOrder(await markCall(adminCookie, placed.id))
      assert.ok(first.callAttemptedAt)
      assert.match(first.callAttemptedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      assert.ok(Date.parse(first.callAttemptedAt) >= before - 1000)
      assert.equal(first.status, 'Order Is Placed')
      assert.equal(orderRow(placed.id).call_attempted_at, first.callAttemptedAt)
      await new Promise((resolve) => setTimeout(resolve, 15))
      const second = await okOrder(await markCall(adminCookie, placed.id))
      assert.ok(second.callAttemptedAt)
      assert.ok(Date.parse(second.callAttemptedAt) > Date.parse(first.callAttemptedAt))
      assert.equal(orderRow(placed.id).call_attempted_at, second.callAttemptedAt)
      // The detail reads the same mark back; the 4.4 list carries it too.
      assert.equal((await okOrder(await getDetail(adminCookie, placed.id))).callAttemptedAt, second.callAttemptedAt)
      const list = (await (await fetch(`${adminDetailBaseUrl}/api/admin/orders`, { headers: { cookie: adminCookie } })).json()) as {
        orders: Array<{ id: number; callAttemptedAt: string | null }>
      }
      assert.equal(list.orders.find((entry) => entry.id === placed.id)?.callAttemptedAt, second.callAttemptedAt)
    })

    it('mark call, late: a Confirmed or Cancelled order is a 409 and the row is unchanged', async () => {
      const confirmed = await placeOne(withoutPhone, 'late-confirmed')
      await okOrder(await confirm(adminCookie, confirmed.id, { deliveryPrice: 200 }))
      const cancelled = await placeOne(withoutPhone, 'late-cancelled')
      assert.equal((await parentCancel(withoutPhone, cancelled.id)).status, 200)
      for (const id of [confirmed.id, cancelled.id]) {
        const before = orderRow(id)
        await expectRefused(await markCall(adminCookie, id), 409, 'order_not_callable', NOT_CALLABLE)
        assert.deepEqual(orderRow(id), before)
        assert.equal(before.call_attempted_at, null)
      }
    })

    it('confirm: goods 1680 plus delivery 350 is Order Confirmed with a payable of 2030', async () => {
      const placed = await placeOne(withPhone, 'confirm')
      const order = await okOrder(await confirm(adminCookie, placed.id, { deliveryPrice: 350 }))
      assert.deepEqual(Object.keys(order).sort(), DETAIL_KEYS)
      assert.equal(order.status, 'Order Confirmed')
      assert.equal(order.deliveryPrice, 350)
      assert.equal(order.payableTotal, 2030)
      assert.equal(order.goodsTotal, 1680)
      const row = orderRow(placed.id)
      assert.equal(row.status, 'Order Confirmed')
      assert.equal(row.delivery_price_rupees, 350)
      assert.equal(row.payable_total_rupees, 2030)
      // The parent now sees the same figures.
      const parentAnswer = await fetch(`${adminDetailBaseUrl}/api/orders/${placed.id}`, { headers: { cookie: withPhone.cookie } })
      const parentOrder = ((await parentAnswer.json()) as { order: AdminDetailJson }).order
      assert.equal(parentOrder.deliveryPrice, 350)
      assert.equal(parentOrder.payableTotal, 2030)
    })

    it('confirm, free delivery: Rs. 0 makes the payable total the goods total', async () => {
      const placed = await placeOne(withoutPhone, 'free')
      const order = await okOrder(await confirm(adminCookie, placed.id, { deliveryPrice: 0 }))
      assert.equal(order.status, 'Order Confirmed')
      assert.equal(order.deliveryPrice, 0)
      assert.equal(order.payableTotal, 1680)
    })

    it('bad price: -1, "350", 12.5, missing and friends are a 400 and the row is unchanged', async () => {
      const placed = await placeOne(withoutPhone, 'bad-price')
      const before = orderRow(placed.id)
      for (const body of [
        { deliveryPrice: -1 },
        { deliveryPrice: '350' },
        { deliveryPrice: 12.5 },
        {},
        { deliveryPrice: null },
        { deliveryPrice: true },
        { deliveryPrice: [350] },
        { deliveryPrice: 2 ** 53 },
        { deliveryPrice: '' },
        undefined,
      ]) {
        await expectRefused(await confirm(adminCookie, placed.id, body), 400, 'invalid_input', PRICE_MESSAGE, 'deliveryPrice')
        assert.deepEqual(orderRow(placed.id), before)
      }
    })

    it('bad price, overflow: a delivery price that pushes the payable past the safe range is a 400', async () => {
      const placed = await placeOne(withoutPhone, 'overflow')
      const before = orderRow(placed.id)
      await expectRefused(
        await confirm(adminCookie, placed.id, { deliveryPrice: 2 ** 53 - 1 }),
        400,
        'invalid_input',
        PRICE_MESSAGE,
        'deliveryPrice',
      )
      assert.deepEqual(orderRow(placed.id), before)
      // The largest price that still fits is accepted, and the total is exact.
      const fits = Number.MAX_SAFE_INTEGER - 1680
      const order = await okOrder(await confirm(adminCookie, placed.id, { deliveryPrice: fits }))
      assert.equal(order.payableTotal, Number.MAX_SAFE_INTEGER)
    })

    it('already cancelled (T8): the confirm is told the parent cancelled first; no payable appears', async () => {
      const placed = await placeOne(withoutPhone, 'cancelled-first')
      assert.equal((await parentCancel(withoutPhone, placed.id)).status, 200)
      await expectRefused(await confirm(adminCookie, placed.id, { deliveryPrice: 350 }), 409, 'order_not_confirmable', CANCELLED_FIRST)
      const row = orderRow(placed.id)
      assert.equal(row.status, 'Cancelled')
      assert.equal(row.payable_total_rupees, null)
      assert.equal(row.delivery_price_rupees, null)
    })

    it('race (T8): a parent cancel and an admin confirm in parallel commit exactly once', async () => {
      const outcomes = new Set<string>()
      for (let round = 0; round < 6; round += 1) {
        const placed = await placeOne(withoutPhone, `race-${round}`)
        const [cancelled, confirmed] = await Promise.all([
          parentCancel(withoutPhone, placed.id),
          confirm(adminCookie, placed.id, { deliveryPrice: 350 }),
        ])
        assert.deepEqual([cancelled.status, confirmed.status].sort(), [200, 409])
        const row = orderRow(placed.id)
        if (confirmed.status === 200) {
          outcomes.add('confirm')
          assert.equal(row.status, 'Order Confirmed')
          assert.equal(row.payable_total_rupees, 2030)
          const loser = (await cancelled.json()) as ErrorBody
          assert.equal(loser.error.code, 'order_not_cancellable')
        } else {
          outcomes.add('cancel')
          assert.equal(row.status, 'Cancelled')
          assert.equal(row.payable_total_rupees, null)
          assert.equal(row.delivery_price_rupees, null)
          const loser = (await confirmed.json()) as ErrorBody
          assert.equal(loser.error.code, 'order_not_confirmable')
          assert.equal(loser.error.message, CANCELLED_FIRST)
        }
      }
      assert.ok(outcomes.size >= 1)
    })

    it('stale (T7): a second confirm is a 409 and the first price is kept', async () => {
      const placed = await placeOne(withoutPhone, 'stale')
      await okOrder(await confirm(adminCookie, placed.id, { deliveryPrice: 350 }))
      await expectRefused(await confirm(adminCookie, placed.id, { deliveryPrice: 500 }), 409, 'order_not_confirmable', ALREADY_CONFIRMED)
      const row = orderRow(placed.id)
      assert.equal(row.delivery_price_rupees, 350)
      assert.equal(row.payable_total_rupees, 2030)
      // Two confirms at once: one wins, the other is told the order is already confirmed.
      const again = await placeOne(withoutPhone, 'stale-double')
      const [first, second] = await Promise.all([
        confirm(adminCookie, again.id, { deliveryPrice: 100 }),
        confirm(adminCookie, again.id, { deliveryPrice: 900 }),
      ])
      assert.deepEqual([first.status, second.status].sort(), [200, 409])
      const winner = first.status === 200 ? first : second
      const price = ((await winner.json()) as { order: AdminDetailJson }).order.deliveryPrice
      assert.equal(orderRow(again.id).delivery_price_rupees, price)
      // Any later status names itself.
      const later = await placeOne(withoutPhone, 'stale-processing')
      await okOrder(await confirm(adminCookie, later.id, { deliveryPrice: 50 }))
      const db = new Database(dbPath)
      try {
        db.prepare("UPDATE orders SET status = 'Processing' WHERE id = ?").run(later.id)
      } finally {
        db.close()
      }
      await expectRefused(
        await confirm(adminCookie, later.id, { deliveryPrice: 60 }),
        409,
        'order_not_confirmable',
        "This order is already Processing, so it can't be confirmed again.",
      )
      assert.equal(orderRow(later.id).delivery_price_rupees, 50)
    })

    it('frozen (T9): after confirm, a parent cancel, a second confirm and a call mark change nothing', async () => {
      const placed = await placeOne(withPhone, 'frozen', 'Leave with the guard')
      await okOrder(await confirm(adminCookie, placed.id, { deliveryPrice: 350 }))
      const frozen = snapshotOf(placed.id)
      await expectRefused(await parentCancel(withPhone, placed.id), 409, 'order_not_cancellable')
      await expectRefused(await confirm(adminCookie, placed.id, { deliveryPrice: 1 }), 409, 'order_not_confirmable', ALREADY_CONFIRMED)
      await expectRefused(await markCall(adminCookie, placed.id), 409, 'order_not_callable', NOT_CALLABLE)
      assert.deepEqual(snapshotOf(placed.id), frozen)
    })

    it('client: the paths, the strict detail parser, and the delivery price rule', () => {
      assert.equal(adminOrderRoute(7), '/orders/7')
      assert.equal(adminOrderPath(7), '/api/admin/orders/7')
      assert.equal(adminOrderCallAttemptedPath(7), '/api/admin/orders/7/call-attempted')
      assert.equal(adminOrderConfirmPath(7), '/api/admin/orders/7/confirm')
      assert.deepEqual(confirmBody(350), { deliveryPrice: 350 })
      assert.equal(DELIVERY_PRICE_MESSAGE, PRICE_MESSAGE)
      assert.equal(deliveryPriceFrom('350'), 350)
      assert.equal(deliveryPriceFrom('0'), 0)
      for (const text of ['', ' ', '-1', '12.5', '3e2', 'abc', '99999999999999999999']) {
        assert.equal(deliveryPriceFrom(text), undefined, text)
      }

      const parsed = parseAdminOrderDetail(realAnswer)
      assert.ok(parsed)
      assert.deepEqual(parsed, (realAnswer as { order: unknown }).order)
      const good = parsed
      assert.equal(parseAdminOrderDetail(null), undefined)
      assert.equal(parseAdminOrderDetail({}), undefined)
      assert.equal(parseAdminOrderDetail({ order: { ...good, status: 'Lost in post' } }), undefined)
      assert.equal(parseAdminOrderDetail({ order: { ...good, secondPhone: 7 } }), undefined)
      assert.equal(parseAdminOrderDetail({ order: { ...good, callAttemptedAt: undefined } }), undefined)
      assert.equal(parseAdminOrderDetail({ order: { ...good, parentName: undefined } }), undefined)
      assert.equal(parseAdminOrderDetail({ order: { ...good, payableTotal: '2030' } }), undefined)
      assert.equal(parseAdminOrderDetail({ order: { ...good, itemLines: [{ title: 'x' }] } }), undefined)
      assert.equal(
        parseAdminOrderDetail({ order: { ...good, packLines: [{ ...good.packLines[0], books: [{ title: 1 }] }] } }),
        undefined,
      )
      assert.deepEqual(parseAdminOrderDetail({ order: { ...good, secondPhone: null } })?.secondPhone, null)
    })

    it('render: contacts with and without a second phone; the call and confirm controls only on Placed', async () => {
      ;(globalThis as { React?: unknown }).React = React
      const { AdminOrderDetailView } = await import('../../client/admin/src/OrderDetailPage.tsx')
      const noop = () => {}
      const sameDay = Date.parse('2026-10-02T06:00:00.000Z')
      const base: AdminDetailJson = {
        id: 4,
        publicNumber: 1042,
        status: 'Order Is Placed',
        placedAt: '2026-10-01T03:45:00.000Z',
        goodsTotal: 1680,
        deliveryPrice: null,
        payableTotal: null,
        note: 'Ring the side gate',
        deliveryAddress: '12 Temple Road, Nugegoda',
        cancellation: null,
        packLines: [
          {
            packName: 'Grade 5 pack',
            label: 'List',
            gradeName: 'Grade 5',
            lineTotal: 1500,
            books: [{ title: 'Atlas', unitPrice: 1500, quantity: 1 }],
          },
        ],
        itemLines: [
          { title: 'Pencil', unitPrice: 120, quantity: 1, lineTotal: 120 },
          { title: 'Eraser', unitPrice: 60, quantity: 1, lineTotal: 60 },
        ],
        parentName: 'Nimali Perera',
        whatsapp: '0771234567',
        secondPhone: '0712345678',
        callAttemptedAt: null,
      }
      const render = (order: AdminDetailJson, extra: { notice?: string; priceError?: string; busy?: boolean; price?: string } = {}) =>
        renderToStaticMarkup(
          React.createElement(AdminOrderDetailView, {
            order: parseAdminOrderDetail({ order }) as never,
            notice: extra.notice,
            price: extra.price ?? '',
            priceError: extra.priceError,
            busy: extra.busy,
            now: sameDay,
            onPriceChange: noop,
            onMarkCall: noop,
            onConfirm: noop,
          }),
        )

      const placed = render(base)
      assert.match(placed, /#(?:<!-- -->)?1042</)
      assert.match(placed, /class="status-pill/)
      assert.match(placed, /Nimali Perera/)
      assert.match(placed, /WhatsApp (?:<!-- -->)?0771234567/)
      assert.match(placed, /Second phone (?:<!-- -->)?0712345678/)
      assert.match(placed, /12 Temple Road, Nugegoda/)
      assert.match(placed, /Note: (?:<!-- -->)?Ring the side gate/)
      assert.match(placed, /Grade 5 pack/)
      // The pack line names its grade with its label.
      assert.match(placed, /class="admin-order-detail-line-meta text-meta">Grade 5(?:<!-- -->)? · (?:<!-- -->)?List</)
      assert.match(placed, /Atlas ×(?:<!-- -->)?1/)
      assert.match(placed, /Goods total<\/span><span class="text-amount-row">Rs\. 1,680</)
      assert.doesNotMatch(placed, /Delivery charge<\/span><span/)
      assert.doesNotMatch(placed, /Payable total/)
      // Placed: the chip, the secondary mark, and the inline confirm form (no modal).
      assert.match(placed, /<span>Not called yet<\/span>/)
      assert.match(placed, /<button type="button" class="button-secondary press-travel">Mark call attempted<\/button>/)
      assert.match(placed, /<form class="admin-order-detail-section admin-order-detail-confirm"/)
      assert.match(placed, /<label class="text-label-caps" for="admin-order-delivery-price">Delivery charge<\/label>/)
      assert.match(placed, /class="form-field-money"><span class="form-field-money-prefix" aria-hidden="true">Rs\.<\/span><input id="admin-order-delivery-price"[^>]*inputMode="numeric"/)
      assert.match(placed, /<button type="submit" class="button-primary press-travel">Confirm order<\/button>/)
      assert.doesNotMatch(placed, /modal|role="dialog"/)
      assert.doesNotMatch(placed, /role="alert"/)
      // Nothing on the page edits the snapshot: the only field is the delivery charge.
      assert.equal((placed.match(/<input/g) ?? []).length, 1)
      assert.doesNotMatch(placed, /<textarea|<select/)

      const called = render({ ...base, callAttemptedAt: '2026-10-02T03:45:00.000Z' })
      assert.match(called, /admin-order-call admin-order-call-attempted/)
      assert.match(called, /<span>Called 9:15 am · no answer<\/span>/)
      assert.doesNotMatch(called, /Not called yet/)

      const noPhone = render({ ...base, secondPhone: null, note: null })
      assert.doesNotMatch(noPhone, /Second phone/)
      assert.doesNotMatch(noPhone, /Note:/)
      assert.match(noPhone, /WhatsApp (?:<!-- -->)?0771234567/)

      const busy = render(base, { busy: true })
      assert.match(busy, /<button type="button" class="button-secondary press-travel" aria-disabled="true">Mark call attempted/)
      assert.match(busy, /<button type="submit" class="button-primary press-travel" aria-disabled="true">Confirm order/)
      assert.doesNotMatch(busy, /disabled=""/)

      const invalid = render(base, { price: '', priceError: PRICE_MESSAGE })
      assert.match(invalid, /class="form-field is-invalid"/)
      assert.match(invalid, /aria-invalid="true"[^>]*aria-describedby="admin-order-delivery-price-error"|aria-describedby="admin-order-delivery-price-error"[^>]*aria-invalid="true"/)
      assert.match(invalid, /<p id="admin-order-delivery-price-error" class="form-error text-meta" role="alert">Enter the delivery charge in whole rupees, Rs\. 0 or more\.<\/p>/)

      const conflict = render(base, { notice: CANCELLED_FIRST })
      assert.match(conflict, /role="alert"><p class="notice-body">The parent cancelled this order before your confirm arrived, so it can&#x27;t be confirmed\.<\/p>/)

      // Confirmed: the totals show; the call controls and confirm form are gone.
      const confirmedOrder = render({ ...base, status: 'Order Confirmed', deliveryPrice: 350, payableTotal: 2030 })
      assert.match(confirmedOrder, /Delivery charge<\/span><span class="text-amount-row">Rs\. 350</)
      assert.match(confirmedOrder, /Payable total<\/span><span class="text-amount-row">Rs\. 2,030</)
      assert.doesNotMatch(confirmedOrder, /Mark call attempted|Confirm order|admin-order-call|<form|<input/)
      for (const status of ['Processing', 'Delivered', 'Cancelled']) {
        const other = render({ ...base, status })
        assert.doesNotMatch(other, /Mark call attempted|Confirm order|admin-order-call|<form/, status)
      }
    })

    it('render: each 4.4 row is a link to its detail', async () => {
      ;(globalThis as { React?: unknown }).React = React
      const { AdminOrdersBoard } = await import('../../client/admin/src/OrdersPage.tsx')
      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(AdminOrdersBoard, {
            orders: [
              {
                id: 12,
                publicNumber: 1012,
                status: 'Order Is Placed',
                placedAt: '2026-10-01T03:45:00.000Z',
                parentName: 'Nimali Perera',
                whatsapp: '0771234567',
                goodsTotal: 1680,
                lineCount: 3,
                linesSummary: 'Pack, Pencil, Eraser',
                callAttemptedAt: null,
              },
            ],
            filter: null,
            onFilterChange: () => {},
            onRefresh: () => {},
          }),
        ),
      )
      assert.match(html, /<li class="admin-order-row is-attention"><a class="admin-order-row-link" href="\/orders\/12"[^>]*>/)
      // Under the app's `/admin` basename the same row points at /admin/orders/12.
      const based = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { basename: '/admin', initialEntries: ['/admin'] },
          React.createElement('div', null, React.createElement(AdminOrdersBoard, {
            orders: [
              {
                id: 12,
                publicNumber: 1012,
                status: 'Order Confirmed',
                placedAt: '2026-10-01T03:45:00.000Z',
                parentName: 'Nimali Perera',
                whatsapp: '0771234567',
                goodsTotal: 1680,
                lineCount: 3,
                linesSummary: 'Pack, Pencil, Eraser',
                callAttemptedAt: null,
              },
            ],
            filter: null,
            onFilterChange: () => {},
            onRefresh: () => {},
          })),
        ),
      )
      assert.match(based, /<li class="admin-order-row"><a class="admin-order-row-link" href="\/admin\/orders\/12"/)
      assert.match(html, /<\/div><\/a><\/li>/)
    })

    it('wires the routes, the page, no modal, no status literals, and token-only styles', async () => {
      const read = (...parts: string[]) => readFile(path.join(...parts), 'utf8')
      const ordersDir = path.join(serverRoot, 'orders')
      const adminHttp = await read(ordersDir, 'admin-http.ts')
      const adminSql = await read(ordersDir, 'admin.ts')
      const detailSql = await read(ordersDir, 'detail.ts')
      const adminSrc = path.join(repoRoot, 'client', 'admin', 'src')
      const page = await read(adminSrc, 'OrderDetailPage.tsx')
      const listPage = await read(adminSrc, 'OrdersPage.tsx')
      const helper = await read(adminSrc, 'orders.ts')
      const terminalModal = await read(adminSrc, 'TerminalModal.tsx')
      const adminApp = await readFile(adminAppPath, 'utf8')
      const baseCss = await readFile(baseCssPath, 'utf8')

      // Server: three new routes, each no-store first then requireAdmin; no SQL in the router.
      assert.doesNotMatch(adminHttp, /db\.prepare/)
      for (const route of ["router.get(\n    '/admin/orders/:id'", "router.post(\n    '/admin/orders/:id/call-attempted'", "router.post(\n    '/admin/orders/:id/confirm'"]) {
        const at = adminHttp.replace(/\r\n/g, '\n').indexOf(route)
        assert.ok(at >= 0, `missing ${route}`)
        const handler = adminHttp.replace(/\r\n/g, '\n').slice(at, at + 400)
        assert.match(handler, /safe\(\(req, res\) => \{\s*res\.setHeader\('Cache-Control', 'no-store'\)\s*if \(!requireAdmin\(db, env, req, res, ADMIN_ORDERS_FORBIDDEN\)\) return/)
      }
      assert.match(adminHttp, /function parseId\(value: unknown\)/)
      assert.match(adminHttp, /Number\.isSafeInteger\(value\) \|\| value < 0/)
      assert.match(adminHttp, /typeof value !== 'number'/)
      assert.match(adminHttp, /'deliveryPrice'\)/)
      // The line mapper is shared, not copied.
      assert.match(detailSql, /export function toDetail\(/)
      assert.match(adminSql, /toDetail\(db, row\)/)
      assert.doesNotMatch(adminSql, /FROM order_pack_lines\s+WHERE order_id = \?/)
      assert.doesNotMatch(adminSql, /order_pack_line_books/)
      // Both writes are one compare-and-set on Order Is Placed inside an immediate transaction.
      assert.match(adminSql, /UPDATE orders SET call_attempted_at = \? WHERE id = \? AND status = \?/)
      assert.match(
        adminSql,
        /SET status = \?, delivery_price_rupees = \?, payable_total_rupees = goods_total_rupees \+ \?\s*WHERE id = \? AND status = \?/,
      )
      // Narrowed by 4.6: the move and the admin cancel add one immediate transaction each.
      assert.equal((adminSql.match(/\.immediate\(\)/g) ?? []).length, 4)
      assert.doesNotMatch(adminSql, /(INTO|UPDATE)\s+(?!orders\b)[a-z_]+/)
      assert.doesNotMatch(adminSql, /parent_delivery_note\s*=|delivery_address\s*=|parent_name\s*=|whatsapp\s*=|second_phone\s*=|goods_total_rupees\s*=/)

      // Client: the route, the page, no modal, no storage, no status literals, busy as aria-disabled.
      assert.match(adminApp, /import \{ OrderDetailRoute \} from '\.\/OrderDetailPage'/)
      assert.match(adminApp, /<Route path="orders\/:id" element=\{<OrderDetailRoute \/>\} \/>/)
      // The route remounts the page per id, so no order state carries across ids.
      assert.match(page, /<OrderDetailPage key=\{params\.id \?\? ''\} \/>/)
      // Actions abort on unmount; older answers never overwrite newer ones; a 409 holds busy for the refetch.
      assert.match(page, /actionControllerRef\.current\?\.abort\(\)/)
      assert.match(page, /versionRef\.current !== version/)
      assert.match(page, /await load\(\)/)
      assert.match(page, /response\.status === 404\) \{\s*showNotFound\(/)
      for (const source of [page, listPage, helper, terminalModal]) {
        assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/)
        assert.doesNotMatch(
          source,
          /'(Order Is Placed|Order Confirmed|Processing|Packing The Order|Ready To Deliver|On Delivery Partner|Delivered|Cancelled)'/,
        )
      }
      // Narrowed by 4.6: the only dialog lives in TerminalModal.tsx, and the confirm form is not in it.
      assert.doesNotMatch(page, /role="dialog"|aria-modal/i)
      assert.match(terminalModal, /role="dialog"/)
      const confirmForm = page.slice(page.indexOf('<form'), page.indexOf('</form>'))
      assert.ok(confirmForm.length > 0)
      assert.doesNotMatch(confirmForm, /TerminalModal|modal/i)
      assert.doesNotMatch(page, /method: 'PATCH'|method: 'DELETE'|textarea|<select/)
      assert.doesNotMatch(terminalModal, /method: 'PATCH'|method: 'DELETE'|<select/)
      assert.match(page, /new AbortController\(\)/)
      assert.match(page, /<Skeleton \/>/)
      assert.match(page, /All orders/)
      assert.match(page, /aria-disabled=\{busy \? 'true' : undefined\}/)
      assert.match(page, /if \(actingRef\.current\) return/)
      assert.match(page, /response\.status === 409/)
      assert.match(page, /void load\(\)/)
      assert.match(page, /response\.status === 401/)
      assert.match(page, /DELIVERY_PRICE_MESSAGE/)
      assert.match(page, /import \{ CallChip, placedAtCopy \} from '\.\/OrdersPage'/)
      assert.match(listPage, /<Link className="admin-order-row-link" to=\{adminOrderRoute\(order\.id\)\}>/)

      // Styles: admin-order-detail-* and the row link on tokens only; the row keeps 44px targets.
      const rules = [...baseCss.matchAll(/(?:^|\n)[ \t]*([^{}\n]*\.admin-order-(?:detail|row-link)[^{}]*)\{([^}]*)\}/g)]
      assert.ok(rules.length >= 15, `admin-order-detail rules are missing (${rules.length})`)
      for (const [, selector, body] of rules) {
        assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|(?<![\w-])(?:white|black)(?![\w-])/, `${selector.trim()} uses a raw colour`)
        for (const color of body.matchAll(/(?:color|background|border[\w-]*|outline):\s*([^;]+);/g)) {
          assert.match(color[1], /var\(--|none|^0$|^0 /, `${selector.trim()} ${color[0]}`)
        }
      }
      assert.match(cssRule(baseCss, '.admin-order-row-link'), /grid-template-columns: subgrid/)
      assert.match(cssRule(baseCss, '.admin-order-row-link'), /min-height: var\(--space-touch-min\)/)
      assert.match(cssRule(baseCss, '.admin-order-row'), /position: relative/)
      assert.match(cssRule(baseCss, '.admin-order-row-link::after'), /inset: 0/)
      assert.match(cssRule(baseCss, '.admin-order-detail-back'), /min-height: var\(--space-touch-min\)/)
      assert.match(cssRule(baseCss, '.admin-order-detail-totals'), /border-top: var\(--space-edge-strong\) solid var\(--color-border-strong\)/)
    })
  })

  describe('Admin order detail — advance, skip forward, and close the order', { concurrency: 1 }, () => {
    let child: ReturnType<typeof spawn>
    let dbDir: string
    let dbPath: string
    let adminCookie: string
    let parent: Parent
    let parentSerial = 0

    type AdminDetailJson = {
      id: number
      publicNumber: number
      status: string
      placedAt: string
      goodsTotal: number
      deliveryPrice: number | null
      payableTotal: number | null
      note: string | null
      deliveryAddress: string
      cancellation: { by: string; reason: string | null; at: string | null } | null
      packLines: Array<{
        packName: string
        label: string
        gradeName: string
        lineTotal: number
        books: Array<{ title: string; unitPrice: number; quantity: number }>
      }>
      itemLines: Array<{ title: string; unitPrice: number; quantity: number; lineTotal: number }>
      parentName: string
      whatsapp: string
      secondPhone: string | null
      callAttemptedAt: string | null
    }
    type ErrorBody = { error: { code: string; message: string; field?: string } }
    type Parent = { cookie: string; id: number }

    const FORBIDDEN = 'Only the shop owner can see all orders. Sign in as the shop owner to continue.'
    const EXPECTED_MESSAGE = 'Refresh the order and try again.'
    const TARGET_MESSAGE = 'Choose a status to move this order to.'
    const REASON = 'Write a short reason the parent will see, up to 500 characters.'
    const PLACED_MOVE = 'Confirm this order with a delivery charge before moving it on.'
    const finalMessage = (status: string) => `This order is already ${status}, which is final.`
    const staleMessage = (status: string) =>
      `This order changed to ${status} since you opened it, so nothing was changed. Check it and try again.`
    const STATUSES = [
      'Order Is Placed',
      'Order Confirmed',
      'Processing',
      'Packing The Order',
      'Ready To Deliver',
      'On Delivery Partner',
      'Delivered',
      'Cancelled',
    ]

    async function signInAdmin(): Promise<string> {
      const response = await fetch(`${adminCloseBaseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com', password: 'test-password' }),
      })
      assert.equal(response.status, 200)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      return cookieHeader(cookie)
    }

    async function adminSend(pathName: string, body: unknown): Promise<{ id: number }> {
      const response = await fetch(`${adminCloseBaseUrl}${pathName}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify(body),
      })
      assert.equal(response.status, 201, `POST ${pathName}: ${response.status}`)
      return (await response.json()) as { id: number }
    }

    async function registerParent(tag: string): Promise<Parent> {
      parentSerial += 1
      const email = `admin-close.${tag}.${parentSerial}.${Date.now()}@example.com`
      const response = await fetch(`${adminCloseBaseUrl}/api/parents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: `Admin close ${tag}`,
          deliveryAddress: `${parentSerial} Lake Road, Maharagama`,
          whatsapp: `0772222${String(100 + parentSerial).slice(-3)}`,
          secondPhone: '',
          email,
          password: 'evening-order',
        }),
      })
      assert.equal(response.status, 201)
      const cookie = sidCookie(response.headers)
      assert.ok(cookie)
      const stored = readDb(
        (db) => db.prepare('SELECT id FROM parents WHERE email = ?').get(email) as { id: number },
      )
      return { cookie: cookieHeader(cookie), id: stored.id }
    }

    /** One pack (Rs. 1,500) plus one item (Rs. 180), then Place: goods 1680, status Placed. */
    async function placeOne(tag: string): Promise<{ id: number; publicNumber: number }> {
      const s = `${Date.now()}-${tag}-${Math.random().toString(36).slice(2, 8)}`
      const schoolId = (await adminSend('/api/admin/schools', catalogNameBody(`Close school ${s}`))).id
      const gradeId = (await adminSend('/api/admin/grades', catalogNameBody(`Grade ${s}`))).id
      const book = await adminSend('/api/admin/books', bookBody(`Atlas ${s}`, 1500))
      const pack = await adminSend('/api/admin/packs', packCreateBody(`Close pack ${s}`, schoolId, gradeId, 'Close', [book.id]))
      const item = await adminSend('/api/admin/items', itemBody(`Pencil ${s}`, 'Stationery', 180))
      const packResponse = await fetch(`${adminCloseBaseUrl}/api/cart/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: parent.cookie },
        body: JSON.stringify({ packId: pack.id, selection: `${book.id}:1` }),
      })
      assert.equal(packResponse.status, 201)
      const itemResponse = await fetch(`${adminCloseBaseUrl}/api/cart/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: parent.cookie },
        body: JSON.stringify({ itemId: item.id, quantity: 1 }),
      })
      assert.ok(itemResponse.status === 201 || itemResponse.status === 200, `add item ${itemResponse.status}`)
      const response = await fetch(`${adminCloseBaseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: parent.cookie, 'Idempotency-Key': `admin-close-${s}` },
        body: JSON.stringify({}),
      })
      assert.equal(response.status, 201)
      return ((await response.json()) as { order: { id: number; publicNumber: number } }).order
    }

    function post(cookie: string | undefined, pathName: string, body: unknown): Promise<Response> {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (cookie) headers.cookie = cookie
      return fetch(`${adminCloseBaseUrl}${pathName}`, {
        method: 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    }

    function moveTo(id: number | string, body: unknown): Promise<Response> {
      return post(adminCookie, `/api/admin/orders/${id}/status`, body)
    }

    function cancelAs(id: number | string, body: unknown): Promise<Response> {
      return post(adminCookie, `/api/admin/orders/${id}/cancel`, body)
    }

    function parentDetail(id: number): Promise<Response> {
      return fetch(`${adminCloseBaseUrl}/api/orders/${id}`, { headers: { cookie: parent.cookie } })
    }

    async function okOrder(response: Response): Promise<AdminDetailJson> {
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as { order: AdminDetailJson }
      assert.deepEqual(Object.keys(body), ['order'])
      return body.order
    }

    async function expectRefused(
      response: Response,
      status: number,
      code: string,
      message?: string,
      field?: string,
    ): Promise<void> {
      assert.equal(response.status, status)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = (await response.json()) as ErrorBody
      assert.equal(body.error.code, code)
      if (message !== undefined) assert.equal(body.error.message, message)
      if (field !== undefined) assert.equal(body.error.field, field)
      else assert.equal(body.error.field, undefined)
    }

    function readDb<T>(read: (db: Database.Database) => T): T {
      const db = new Database(dbPath, { readonly: true })
      try {
        return read(db)
      } finally {
        db.close()
      }
    }

    function orderRow(id: number): Record<string, unknown> {
      return readDb((db) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, unknown>)
    }

    /** A placed order confirmed at Rs. 350 (payable 2030), then moved on to `status`. */
    async function orderAt(status: string, tag: string): Promise<{ id: number; publicNumber: number }> {
      const order = await placeOne(tag)
      if (status === 'Order Is Placed') return order
      const confirmed = await post(adminCookie, `/api/admin/orders/${order.id}/confirm`, { deliveryPrice: 350 })
      assert.equal(confirmed.status, 200)
      if (status === 'Order Confirmed') return order
      if (status === 'Cancelled') {
        await okOrder(await cancelAs(order.id, { expectedStatus: 'Order Confirmed', reason: 'Setup' }))
        return order
      }
      await okOrder(await moveTo(order.id, { expectedStatus: 'Order Confirmed', status }))
      return order
    }

    before(async () => {
      dbDir = await mkdtemp(path.join(tmpdir(), 'booklist-admin-close-'))
      dbPath = path.join(dbDir, 'booklist.db')
      const started = await startIdentityServer(dbPath, ADMIN_CLOSE_PORT)
      child = started.child
      adminCookie = await signInAdmin()
      parent = await registerParent('main')
    })

    after(async () => {
      await stopChild(child)
      await rm(dbDir, { recursive: true, force: true })
    })

    it('auth / id: 401 without a cookie, 403 for a parent, 404 for a bad or unknown id', async () => {
      const order = await orderAt('Order Confirmed', 'auth')
      const before = orderRow(order.id)
      const moveBodyOk = { expectedStatus: 'Order Confirmed', status: 'Processing' }
      const cancelBodyOk = { expectedStatus: 'Order Confirmed', reason: 'Out of stock' }
      for (const send of [
        // post() directly: a default parameter would swap an absent cookie for the admin's.
        (cookie?: string) => post(cookie, `/api/admin/orders/${order.id}/status`, moveBodyOk),
        (cookie?: string) => post(cookie, `/api/admin/orders/${order.id}/cancel`, cancelBodyOk),
      ]) {
        await expectRefused(await send(undefined), 401, 'unauthenticated')
        await expectRefused(await send(parent.cookie), 403, 'forbidden', FORBIDDEN)
      }
      for (const id of ['abc', '0', '-1', '1.5', '01', '999999', '99999999999999999999']) {
        await expectRefused(await moveTo(id, moveBodyOk), 404, 'not_found', 'Order not found.')
        await expectRefused(await cancelAs(id, cancelBodyOk), 404, 'not_found', 'Order not found.')
      }
      // An unknown id is a 404 even when the expected status would break a rule.
      await expectRefused(await moveTo(999999, { expectedStatus: 'Delivered', status: 'Processing' }), 404, 'not_found')
      await expectRefused(await cancelAs(999999, { expectedStatus: 'Cancelled', reason: 'x' }), 404, 'not_found')
      assert.deepEqual(orderRow(order.id), before)
    })

    it('advance: Confirmed → Processing keeps the delivery charge and payable total', async () => {
      const order = await orderAt('Order Confirmed', 'advance')
      const moved = await okOrder(await moveTo(order.id, { expectedStatus: 'Order Confirmed', status: 'Processing' }))
      assert.equal(moved.status, 'Processing')
      assert.equal(moved.deliveryPrice, 350)
      assert.equal(moved.payableTotal, 2030)
      assert.equal(moved.cancellation, null)
      const row = orderRow(order.id)
      assert.equal(row.status, 'Processing')
      assert.equal(row.delivery_price_rupees, 350)
      assert.equal(row.payable_total_rupees, 2030)
      // The parent sees the move on the next poll.
      const seen = (await (await parentDetail(order.id)).json()) as { order: AdminDetailJson }
      assert.equal(seen.order.status, 'Processing')
      assert.equal(seen.order.payableTotal, 2030)
    })

    it('skip forward (T3), back (T4) and deliver', async () => {
      const order = await orderAt('Processing', 'skip')
      assert.equal(
        (await okOrder(await moveTo(order.id, { expectedStatus: 'Processing', status: 'Ready To Deliver' }))).status,
        'Ready To Deliver',
      )
      assert.equal(
        (await okOrder(await moveTo(order.id, { expectedStatus: 'Ready To Deliver', status: 'Order Confirmed' }))).status,
        'Order Confirmed',
      )
      assert.equal(
        (await okOrder(await moveTo(order.id, { expectedStatus: 'Order Confirmed', status: 'On Delivery Partner' }))).status,
        'On Delivery Partner',
      )
      const delivered = await okOrder(await moveTo(order.id, { expectedStatus: 'On Delivery Partner', status: 'Delivered' }))
      assert.equal(delivered.status, 'Delivered')
      assert.equal(delivered.payableTotal, 2030)
      assert.equal(delivered.deliveryPrice, 350)
      assert.equal(orderRow(order.id).payable_total_rupees, 2030)
    })

    it('skip to Delivered: Confirmed → Delivered is allowed', async () => {
      const order = await orderAt('Order Confirmed', 'hand')
      const delivered = await okOrder(await moveTo(order.id, { expectedStatus: 'Order Confirmed', status: 'Delivered' }))
      assert.equal(delivered.status, 'Delivered')
      assert.equal(delivered.payableTotal, 2030)
    })

    it('placed move (T2): a placed order cannot be moved by /status, and the row is unchanged', async () => {
      const order = await orderAt('Order Is Placed', 'placed-move')
      const before = orderRow(order.id)
      for (const status of ['Order Confirmed', 'Processing', 'Delivered']) {
        await expectRefused(
          await moveTo(order.id, { expectedStatus: 'Order Is Placed', status }),
          409,
          'order_transition_not_allowed',
          PLACED_MOVE,
        )
      }
      assert.deepEqual(orderRow(order.id), before)
    })

    it('target Placed (T4) or any other non-target: a 400 on status, and the row is unchanged', async () => {
      const order = await orderAt('Processing', 'target')
      const before = orderRow(order.id)
      for (const status of ['Order Is Placed', 'Cancelled', 'Shipped', 'processing', '', 3, null, true, ['Processing'], { s: 1 }, undefined]) {
        await expectRefused(
          await moveTo(order.id, { expectedStatus: 'Processing', status }),
          400,
          'invalid_input',
          TARGET_MESSAGE,
          'status',
        )
      }
      assert.deepEqual(orderRow(order.id), before)
    })

    it('final (T5): Delivered and Cancelled refuse every move and cancel', async () => {
      for (const status of ['Delivered', 'Cancelled']) {
        const order = await orderAt(status, `final-${status}`)
        const before = orderRow(order.id)
        for (const target of ['Order Confirmed', 'Processing', 'Delivered']) {
          await expectRefused(
            await moveTo(order.id, { expectedStatus: status, status: target }),
            409,
            'order_transition_not_allowed',
            finalMessage(status),
          )
        }
        await expectRefused(
          await cancelAs(order.id, { expectedStatus: status, reason: 'Too late' }),
          409,
          'order_transition_not_allowed',
          finalMessage(status),
        )
        assert.deepEqual(orderRow(order.id), before)
      }
    })

    it('same status: Processing → Processing is refused', async () => {
      const order = await orderAt('Processing', 'same')
      const before = orderRow(order.id)
      await expectRefused(
        await moveTo(order.id, { expectedStatus: 'Processing', status: 'Processing' }),
        409,
        'order_transition_not_allowed',
        'This order is already Processing.',
      )
      assert.deepEqual(orderRow(order.id), before)
    })

    it('stale (T7): an expected status that is not the real one changes nothing and names the real one', async () => {
      const order = await orderAt('Packing The Order', 'stale')
      const before = orderRow(order.id)
      await expectRefused(
        await moveTo(order.id, { expectedStatus: 'Processing', status: 'Ready To Deliver' }),
        409,
        'order_status_stale',
        staleMessage('Packing The Order'),
      )
      await expectRefused(
        await cancelAs(order.id, { expectedStatus: 'Processing', reason: 'Out of stock' }),
        409,
        'order_status_stale',
        staleMessage('Packing The Order'),
      )
      // A stale request that would also break a rule is still reported as stale.
      await expectRefused(
        await moveTo(order.id, { expectedStatus: 'Delivered', status: 'Processing' }),
        409,
        'order_status_stale',
        staleMessage('Packing The Order'),
      )
      await expectRefused(
        await moveTo(order.id, { expectedStatus: 'Order Is Placed', status: 'Processing' }),
        409,
        'order_status_stale',
      )
      assert.deepEqual(orderRow(order.id), before)
    })

    it('admin cancel (T6): trimmed reason stored, payable cleared, delivery kept, and the parent sees it', async () => {
      const order = await orderAt('Processing', 'cancel')
      const startedAt = Date.now()
      const cancelled = await okOrder(
        await cancelAs(order.id, { expectedStatus: 'Processing', reason: '  Out of stock  ' }),
      )
      assert.equal(cancelled.status, 'Cancelled')
      assert.equal(cancelled.payableTotal, null)
      assert.equal(cancelled.deliveryPrice, 350)
      assert.ok(cancelled.cancellation)
      assert.equal(cancelled.cancellation.by, 'admin')
      assert.equal(cancelled.cancellation.reason, 'Out of stock')
      assert.ok(cancelled.cancellation.at)
      assert.ok(Date.parse(cancelled.cancellation.at) >= startedAt - 1000)
      const row = orderRow(order.id)
      assert.equal(row.status, 'Cancelled')
      assert.equal(row.cancelled_by, 'admin')
      assert.equal(row.cancellation_reason, 'Out of stock')
      assert.equal(row.payable_total_rupees, null)
      assert.equal(row.delivery_price_rupees, 350)
      assert.equal(row.goods_total_rupees, 1680)
      // The parent's detail shows the same reason.
      const seen = await parentDetail(order.id)
      assert.equal(seen.status, 200)
      const parentOrder = ((await seen.json()) as { order: AdminDetailJson }).order
      assert.equal(parentOrder.status, 'Cancelled')
      assert.equal(parentOrder.payableTotal, null)
      assert.deepEqual(parentOrder.cancellation, { by: 'admin', reason: 'Out of stock', at: cancelled.cancellation.at })
    })

    it('cancel Placed: an admin cancel works on a placed order', async () => {
      const order = await orderAt('Order Is Placed', 'cancel-placed')
      const cancelled = await okOrder(await cancelAs(order.id, { expectedStatus: 'Order Is Placed', reason: 'No answer' }))
      assert.equal(cancelled.status, 'Cancelled')
      assert.equal(cancelled.cancellation?.by, 'admin')
      assert.equal(cancelled.deliveryPrice, null)
      assert.equal(orderRow(order.id).cancelled_by, 'admin')
    })

    it('cancel from every non-terminal status, with a 500-character reason accepted', async () => {
      for (const status of STATUSES.slice(0, 6)) {
        const order = await orderAt(status, `every-${status}`)
        const deliveryBefore = orderRow(order.id).delivery_price_rupees
        assert.equal(deliveryBefore, status === 'Order Is Placed' ? null : 350, status)
        const reason = status === 'Processing' ? 'r'.repeat(500) : `Closed from ${status}`
        const startedAt = Date.now()
        const cancelled = await okOrder(await cancelAs(order.id, { expectedStatus: status, reason }))
        assert.equal(cancelled.status, 'Cancelled', status)
        assert.equal(cancelled.cancellation?.reason, reason)
        const row = orderRow(order.id)
        assert.equal(row.status, 'Cancelled', status)
        assert.equal(row.cancelled_by, 'admin', status)
        assert.equal(row.cancellation_reason, reason, status)
        assert.equal(row.payable_total_rupees, null, status)
        assert.equal(typeof row.cancelled_at, 'string', status)
        assert.match(row.cancelled_at as string, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, status)
        assert.ok(Date.parse(row.cancelled_at as string) >= startedAt - 1000, status)
        assert.equal(row.delivery_price_rupees, deliveryBefore, status)
      }
    })

    it('bad reason: missing, blank, 501 characters or not a string is a 400 on reason', async () => {
      const order = await orderAt('Processing', 'bad-reason')
      const before = orderRow(order.id)
      for (const body of [
        { expectedStatus: 'Processing' },
        { expectedStatus: 'Processing', reason: '' },
        { expectedStatus: 'Processing', reason: '   ' },
        { expectedStatus: 'Processing', reason: 'r'.repeat(501) },
        { expectedStatus: 'Processing', reason: 42 },
        { expectedStatus: 'Processing', reason: null },
        { expectedStatus: 'Processing', reason: ['Out of stock'] },
      ]) {
        await expectRefused(await cancelAs(order.id, body), 400, 'invalid_input', REASON, 'reason')
      }
      assert.deepEqual(orderRow(order.id), before)
    })

    it('bad expected: missing or unknown expectedStatus is a 400 on expectedStatus, for both routes', async () => {
      const order = await orderAt('Processing', 'bad-expected')
      const before = orderRow(order.id)
      for (const expectedStatus of [undefined, 'Shipped', 'processing', '', 7, null]) {
        await expectRefused(
          await moveTo(order.id, { expectedStatus, status: 'Ready To Deliver' }),
          400,
          'invalid_input',
          EXPECTED_MESSAGE,
          'expectedStatus',
        )
        await expectRefused(
          await cancelAs(order.id, { expectedStatus, reason: 'Out of stock' }),
          400,
          'invalid_input',
          EXPECTED_MESSAGE,
          'expectedStatus',
        )
      }
      await expectRefused(await moveTo(order.id, undefined), 400, 'invalid_input', EXPECTED_MESSAGE, 'expectedStatus')
      assert.deepEqual(orderRow(order.id), before)
    })

    it('race: a parent cancel and an admin cancel on a placed order — exactly one wins', async () => {
      for (let round = 0; round < 4; round += 1) {
        const order = await orderAt('Order Is Placed', `race-${round}`)
        const [parentAnswer, adminAnswer] = await Promise.all([
          fetch(`${adminCloseBaseUrl}/api/orders/${order.id}/cancel`, { method: 'POST', headers: { cookie: parent.cookie } }),
          cancelAs(order.id, { expectedStatus: 'Order Is Placed', reason: 'Shop closed' }),
        ])
        const statuses = [parentAnswer.status, adminAnswer.status].sort()
        assert.deepEqual(statuses, [200, 409], `round ${round}`)
        const row = orderRow(order.id)
        assert.equal(row.status, 'Cancelled')
        assert.equal(row.payable_total_rupees, null)
        if (adminAnswer.status === 200) {
          assert.equal(row.cancelled_by, 'admin')
          assert.equal(((await parentAnswer.json()) as ErrorBody).error.code, 'order_not_cancellable')
        } else {
          assert.equal(row.cancelled_by, 'parent')
          assert.equal(row.cancellation_reason, null)
          const body = (await adminAnswer.json()) as ErrorBody
          assert.equal(body.error.code, 'order_status_stale')
          assert.equal(body.error.message, staleMessage('Cancelled'))
        }
      }
    })

    it('race: two admin moves, and an admin move against an admin cancel, on one expected status', async () => {
      for (let round = 0; round < 4; round += 1) {
        const order = await orderAt('Processing', `admin-race-${round}`)
        const answers = await Promise.all([
          moveTo(order.id, { expectedStatus: 'Processing', status: 'Packing The Order' }),
          moveTo(order.id, { expectedStatus: 'Processing', status: 'Ready To Deliver' }),
        ])
        assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409], `moves round ${round}`)
        const winner = answers.find((answer) => answer.status === 200)
        const loser = answers.find((answer) => answer.status === 409)
        assert.ok(winner && loser)
        const won = (await winner.json()) as { order: AdminDetailJson }
        assert.equal(orderRow(order.id).status, won.order.status)
        const lost = (await loser.json()) as ErrorBody
        assert.equal(lost.error.code, 'order_status_stale')
        assert.equal(lost.error.message, staleMessage(won.order.status))
      }
      for (let round = 0; round < 4; round += 1) {
        const order = await orderAt('Processing', `admin-race-cancel-${round}`)
        const [moved, cancelled] = await Promise.all([
          moveTo(order.id, { expectedStatus: 'Processing', status: 'Ready To Deliver' }),
          cancelAs(order.id, { expectedStatus: 'Processing', reason: 'Shop closed' }),
        ])
        assert.deepEqual([moved.status, cancelled.status].sort(), [200, 409], `move vs cancel round ${round}`)
        const row = orderRow(order.id)
        if (cancelled.status === 200) {
          assert.equal(row.status, 'Cancelled')
          assert.equal(row.payable_total_rupees, null)
          assert.equal(row.cancelled_by, 'admin')
          assert.equal(((await moved.json()) as ErrorBody).error.code, 'order_status_stale')
        } else {
          assert.equal(row.status, 'Ready To Deliver')
          assert.equal(row.payable_total_rupees, 2030)
          assert.equal(row.cancellation_reason, null)
          assert.equal(((await cancelled.json()) as ErrorBody).error.code, 'order_status_stale')
        }
      }
    })

    it('parity: the client targets and reason limit match the server', () => {
      assert.deepEqual([...MOVE_TARGETS], [...MOVABLE_FROM, DELIVERED_STATUS])
      assert.equal(SERVER_REASON_MAX_LENGTH, REASON_MAX_LENGTH)
      assert.equal(REASON_MAX_LENGTH, 500)
    })

    it('client helpers: derived statuses, paths and bodies', () => {
      assert.equal(transitionAnnouncement('Ready To Deliver'), 'Moved to Ready To Deliver.')
      assert.equal(transitionAnnouncement('Order Confirmed'), 'Moved to Order Confirmed.')
      assert.equal(transitionAnnouncement('Delivered'), 'Marked delivered.')
      assert.equal(transitionAnnouncement('Cancelled'), 'Order cancelled.')
      assert.equal(CONFIRMED_STATUS, 'Order Confirmed')
      assert.equal(DELIVERED_STATUS, 'Delivered')
      assert.deepEqual([...MOVABLE_FROM], ['Order Confirmed', 'Processing', 'Packing The Order', 'Ready To Deliver', 'On Delivery Partner'])
      assert.equal(isTerminal('Delivered'), true)
      assert.equal(isTerminal('Cancelled'), true)
      assert.equal(isTerminal('Order Is Placed'), false)
      assert.equal(isTerminal('On Delivery Partner'), false)
      assert.equal(adminOrderStatusPath(12), '/api/admin/orders/12/status')
      assert.equal(adminOrderCancelPath(12), '/api/admin/orders/12/cancel')
      assert.deepEqual(moveBody('Processing', 'Ready To Deliver'), { expectedStatus: 'Processing', status: 'Ready To Deliver' })
      assert.deepEqual(cancelBody('Processing', 'Out of stock'), { expectedStatus: 'Processing', reason: 'Out of stock' })
      assert.equal(REASON_MESSAGE, REASON)
      assert.equal(reasonFrom('  Out of stock  '), 'Out of stock')
      assert.equal(reasonFrom('   '), undefined)
      assert.equal(reasonFrom(''), undefined)
      assert.equal(reasonFrom('r'.repeat(500)), 'r'.repeat(500))
      assert.equal(reasonFrom('r'.repeat(501)), undefined)
    })

    it('render: Move to excludes the current status; Placed has only Cancel; final orders have no controls', async () => {
      ;(globalThis as { React?: unknown }).React = React
      const { AdminOrderDetailView } = await import('../../client/admin/src/OrderDetailPage.tsx')
      const noop = () => {}
      const base: AdminDetailJson = {
        id: 4,
        publicNumber: 1042,
        status: 'Order Confirmed',
        placedAt: '2026-10-01T03:45:00.000Z',
        goodsTotal: 1680,
        deliveryPrice: 350,
        payableTotal: 2030,
        note: null,
        deliveryAddress: '12 Temple Road, Nugegoda',
        cancellation: null,
        packLines: [],
        itemLines: [{ title: 'Pencil', unitPrice: 120, quantity: 1, lineTotal: 120 }],
        parentName: 'Nimali Perera',
        whatsapp: '0771234567',
        secondPhone: null,
        callAttemptedAt: null,
      }
      type Extra = {
        busy?: boolean
        modal?: 'delivered' | 'cancel' | null
        reason?: string
        reasonError?: string
        modalError?: string
        notice?: string
        announcement?: string
      }
      const render = (order: AdminDetailJson, extra: Extra = {}) =>
        renderToStaticMarkup(
          React.createElement(AdminOrderDetailView, {
            order: parseAdminOrderDetail({ order }) as never,
            notice: extra.notice,
            price: '',
            busy: extra.busy,
            onPriceChange: noop,
            onMarkCall: noop,
            onConfirm: noop,
            modal: extra.modal,
            reason: extra.reason,
            reasonError: extra.reasonError,
            modalError: extra.modalError,
            announcement: extra.announcement,
          }),
        )
      const moveButtons = (html: string) =>
        [...html.matchAll(/<button type="button" class="button-secondary press-travel"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1])

      const confirmed = render(base)
      assert.match(confirmed, /<section class="admin-order-detail-section admin-order-detail-status" aria-label="Status">/)
      assert.match(confirmed, /id="admin-order-move-label">Move to<\/span><div class="admin-order-detail-status-group" role="group" aria-labelledby="admin-order-move-label">/)
      assert.deepEqual(moveButtons(confirmed), ['Processing', 'Packing The Order', 'Ready To Deliver', 'On Delivery Partner'])
      assert.match(confirmed, /<button type="button" class="button-primary press-travel">Mark delivered<\/button>/)
      assert.match(confirmed, /<button type="button" class="button-secondary press-travel admin-order-detail-cancel">Cancel order<\/button>/)
      // Closed modals render nothing; no select, no form for the moves.
      assert.doesNotMatch(confirmed, /role="dialog"|modal|<textarea|<select|<form/)

      const processing = render({ ...base, status: 'Processing' })
      assert.deepEqual(moveButtons(processing), ['Order Confirmed', 'Packing The Order', 'Ready To Deliver', 'On Delivery Partner'])
      const onDelivery = render({ ...base, status: 'On Delivery Partner' })
      assert.deepEqual(moveButtons(onDelivery), ['Order Confirmed', 'Processing', 'Packing The Order', 'Ready To Deliver'])
      assert.match(onDelivery, /Mark delivered/)

      const placed = render({ ...base, status: 'Order Is Placed', deliveryPrice: null, payableTotal: null })
      assert.match(placed, /admin-order-detail-cancel">Cancel order<\/button>/)
      assert.doesNotMatch(placed, /Move to|Mark delivered|admin-order-detail-status-group/)

      for (const status of ['Delivered', 'Cancelled']) {
        const final = render({
          ...base,
          status,
          payableTotal: status === 'Cancelled' ? null : 2030,
          cancellation: status === 'Cancelled' ? { by: 'admin', reason: 'Out of stock', at: '2026-10-02T03:45:00.000Z' } : null,
        })
        assert.doesNotMatch(final, /Move to|Mark delivered|Cancel order|admin-order-detail-status"|<button/, status)
        // Even a stale open modal is not drawn on a final order.
        const stale = render({ ...base, status, payableTotal: null }, { modal: 'cancel' })
        assert.doesNotMatch(stale, /role="dialog"/)
      }

      const shopCancelled = render({
        ...base,
        status: 'Cancelled',
        payableTotal: null,
        cancellation: { by: 'admin', reason: 'Out of stock', at: '2026-10-02T03:45:00.000Z' },
      })
      assert.match(shopCancelled, /<section class="admin-order-detail-section admin-order-detail-cancelled" aria-label="Cancellation"><p class="text-body-strong">Cancelled by the shop\.<\/p><p class="admin-order-detail-reason">Reason: (?:<!-- -->)?Out of stock<\/p>/)
      const parentCancelled = render({
        ...base,
        status: 'Cancelled',
        deliveryPrice: null,
        payableTotal: null,
        cancellation: { by: 'parent', reason: null, at: '2026-10-02T03:45:00.000Z' },
      })
      assert.match(parentCancelled, /Cancelled by the parent\./)
      assert.doesNotMatch(parentCancelled, /Reason:/)

      const busy = render(base, { busy: true })
      for (const label of ['Processing', 'Mark delivered', 'Cancel order']) {
        assert.match(busy, new RegExp(`aria-disabled="true">${label}<`), label)
      }
      assert.doesNotMatch(busy, /disabled=""/)

      // The Delivered modal: one-deep, a solid destructive confirm and a secondary dismiss.
      const delivered = render({ ...base, status: 'On Delivery Partner' }, { modal: 'delivered' })
      assert.match(delivered, /<div class="modal-backdrop admin-order-detail-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="admin-terminal-modal-title" aria-describedby="admin-terminal-modal-body" tab[iI]ndex="-1">/)
      assert.match(delivered, /<h2 class="modal-title text-heading-md" id="admin-terminal-modal-title">Mark #1042 delivered\?<\/h2>/)
      assert.match(delivered, /<p class="modal-body" id="admin-terminal-modal-body">Delivered is final\. This order can&#x27;t be moved again\.<\/p>/)
      assert.match(delivered, /<div class="modal-actions"><button type="button" class="button-secondary">Cancel<\/button><button type="button" class="button-danger-solid">Mark delivered<\/button><\/div>/)
      assert.doesNotMatch(delivered, /<textarea/)
      assert.equal((delivered.match(/role="dialog"/g) ?? []).length, 1)

      // The cancel modal: a required reason, at most 500 characters, kept with its inline error.
      const cancelModal = render(base, { modal: 'cancel', reason: '   ', reasonError: REASON })
      assert.match(cancelModal, /id="admin-terminal-modal-title">Cancel #1042\?<\/h2>/)
      assert.match(cancelModal, /Cancelled is final\. The parent will see your reason\./)
      assert.match(cancelModal, /<label class="text-label-caps" for="admin-order-cancel-reason">Reason for the parent<\/label>/)
      assert.match(cancelModal, /<textarea id="admin-order-cancel-reason"[^>]*required=""[^>]*max[lL]ength="500"[^>]*aria-invalid="true"[^>]*aria-describedby="admin-order-cancel-reason-error"/)
      assert.match(cancelModal, /<p id="admin-order-cancel-reason-error" class="form-error text-meta" role="alert">Write a short reason the parent will see, up to 500 characters\.<\/p>/)
      assert.match(cancelModal, /<button type="button" class="button-secondary">Keep order<\/button><button type="button" class="button-danger-solid">Cancel order<\/button>/)
      const typed = render(base, { modal: 'cancel', reason: 'Out of stock' })
      assert.match(typed, />Out of stock<\/textarea>/)
      const busyModal = render(base, { modal: 'cancel', reason: 'Out of stock', busy: true })
      assert.match(busyModal, /class="button-secondary" aria-disabled="true">Keep order/)
      assert.match(busyModal, /class="button-danger-solid" aria-disabled="true">Cancel order/)
      const failed = render(base, { modal: 'delivered', modalError: 'Could not reach the shop. Try again.' })
      assert.match(failed, /<p class="form-error text-meta" role="alert">Could not reach the shop\. Try again\.<\/p>/)

      // The heading is the focus fallback once a final action removes its trigger.
      assert.match(confirmed, /<h1 class="admin-order-detail-number page-heading text-heading-lg" id="admin-order-detail-heading" tab[iI]ndex="-1">#/)
      // The polite live region is always there, empty until an action succeeds.
      assert.match(confirmed, /<p class="admin-order-detail-announce visually-hidden" role="status" aria-live="polite"><\/p>/)
      const announced = render({ ...base, status: 'Ready To Deliver' }, { announcement: transitionAnnouncement('Ready To Deliver') })
      assert.match(announced, /role="status" aria-live="polite">Moved to Ready To Deliver\.<\/p>/)
      // The reason is read-only while the cancel is in flight, and editable otherwise.
      assert.match(busyModal, /<textarea id="admin-order-cancel-reason"[^>]*read[oO]nly=""/)
      assert.doesNotMatch(typed, /read[oO]nly/)

      // A 409 is shown in the page notice once the modal has closed.
      const conflict = render(base, { notice: staleMessage('Processing') })
      assert.match(conflict, /role="alert"><p class="notice-body">This order changed to Processing since you opened it/)
    })

    it('source: routes, CAS writes, no status literals, the only dialog in TerminalModal, token-only styles', async () => {
      const read = (...parts: string[]) => readFile(path.join(...parts), 'utf8')
      const ordersDir = path.join(serverRoot, 'orders')
      const adminHttp = (await read(ordersDir, 'admin-http.ts')).replace(/\r\n/g, '\n')
      const adminSql = (await read(ordersDir, 'admin.ts')).replace(/\r\n/g, '\n')
      const detailSql = await read(ordersDir, 'detail.ts')
      const adminSrc = path.join(repoRoot, 'client', 'admin', 'src')
      const page = await read(adminSrc, 'OrderDetailPage.tsx')
      const modal = await read(adminSrc, 'TerminalModal.tsx')
      const helper = await read(adminSrc, 'orders.ts')
      const baseCss = await readFile(baseCssPath, 'utf8')

      // Server: two POST routes in the 4.5 handler shape; strict parsers; no SQL in the router.
      assert.doesNotMatch(adminHttp, /db\.prepare/)
      assert.doesNotMatch(adminHttp, /router\.(patch|delete|put)\(/)
      for (const route of ["router.post(\n    '/admin/orders/:id/status'", "router.post(\n    '/admin/orders/:id/cancel'"]) {
        const at = adminHttp.indexOf(route)
        assert.ok(at >= 0, `missing ${route}`)
        const handler = adminHttp.slice(at, at + 600)
        assert.match(handler, /safe\(\(req, res\) => \{\s*res\.setHeader\('Cache-Control', 'no-store'\)\s*if \(!requireAdmin\(db, env, req, res, ADMIN_ORDERS_FORBIDDEN\)\) return\s*const orderId = parseId\(req\.params\.id\)/)
      }
      for (const parser of ['parseExpectedStatus', 'parseMoveTarget', 'parseReason']) {
        assert.match(adminHttp, new RegExp(`function ${parser}\\(value: unknown\\)`))
      }
      assert.match(adminHttp, /typeof value !== 'string'/)
      assert.match(adminHttp, /'expectedStatus'\)/)
      assert.match(adminHttp, /'status'\)/)
      assert.match(adminHttp, /'reason'\)/)

      // admin.ts: one immediate CAS per write, then a re-read; the cancel clears the payable.
      assert.match(adminSql, /export function moveOrderStatus\(/)
      assert.match(adminSql, /export function cancelAdminOrder\(/)
      assert.match(adminSql, /UPDATE orders SET status = \? WHERE id = \? AND status = \?/)
      assert.match(
        adminSql,
        /UPDATE orders\s+SET status = 'Cancelled', cancelled_by = 'admin', cancellation_reason = \?, cancelled_at = \?,\s+payable_total_rupees = NULL\s+WHERE id = \? AND status = \?/,
      )
      assert.match(adminSql, /export const MOVE_TARGETS/)
      assert.doesNotMatch(adminSql, /delivery_price_rupees = NULL/)
      // The parent module never writes the shop's reason.
      assert.doesNotMatch(detailSql, /cancellation_reason\s*=/)

      // Client: no status literals, no storage, no select / PATCH / DELETE; the only dialog and
      // the only textarea live in TerminalModal.tsx, which the storefront modal is not imported into.
      const adminFiles = (await readdir(adminSrc)).filter((name) => /\.tsx?$/.test(name))
      for (const name of adminFiles) {
        const source = await read(adminSrc, name)
        assert.doesNotMatch(source, /from '[^']*storefront[^']*'/, name)
        if (name !== 'TerminalModal.tsx') assert.doesNotMatch(source, /role="dialog"|aria-modal/, name)
      }
      for (const [name, source] of [['OrderDetailPage.tsx', page], ['TerminalModal.tsx', modal], ['orders.ts', helper]]) {
        assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, name)
        assert.doesNotMatch(source, /<select|method: 'PATCH'|method: 'DELETE'/, name)
        if (name !== 'TerminalModal.tsx') assert.doesNotMatch(source, /textarea/, name)
      }
      for (const source of [page, modal, helper]) {
        assert.doesNotMatch(
          source,
          /'(Order Is Placed|Order Confirmed|Processing|Packing The Order|Ready To Deliver|On Delivery Partner|Delivered|Cancelled)'|"(Order Is Placed|Order Confirmed|Processing|Packing The Order|Ready To Deliver|On Delivery Partner|Delivered|Cancelled)"/,
        )
      }
      assert.match(modal, /role="dialog"/)
      assert.match(modal, /aria-modal="true"/)
      assert.match(modal, /event\.key === 'Escape'/)
      assert.match(modal, /if \(!busy\) onClose\(\)/)
      assert.match(modal, /event\.key !== 'Tab'/)
      assert.match(modal, /querySelectorAll<HTMLElement>\('textarea, button'\)/)
      assert.match(modal, /previous\.focus\(\)/)
      assert.match(modal, /className="button-danger-solid"/)
      assert.match(modal, /className="button-secondary"/)
      // The backdrop never closes the dialog.
      const backdrop = modal.slice(modal.indexOf('className="modal-backdrop'), modal.indexOf('role="dialog"'))
      assert.doesNotMatch(backdrop, /onClick|onClose/)
      assert.match(page, /import \{ TerminalModal \} from '\.\/TerminalModal'/)
      // Moves go straight through act(); only Delivered and Cancel open a modal.
      assert.match(page, /void act\(adminOrderStatusPath\(orderId\), moveBody\(order\.status, to\), announceOutcome\)/)
      assert.match(page, /moveBody\(order\.status, DELIVERED_STATUS\), announceOutcome\)/)
      assert.match(page, /cancelBody\(order\.status, trimmed\), announceOutcome\)/)
      assert.match(page, /failure\?\.error\?\.field === 'reason'/)
      // A 409 closes the modal but keeps the typed reason; only success or a dismiss drops it.
      assert.match(page, /hideModal\(\)\s*setNotice\(apiMessage\(failure, ACTION_FAILED\)\)\s*await load\(\)/)
      const hide = page.slice(page.indexOf('const hideModal'), page.indexOf('const closeModal'))
      assert.ok(hide.length > 0)
      assert.doesNotMatch(hide, /setReason\(/)
      assert.doesNotMatch(page.slice(page.indexOf('const openModal'), page.indexOf('const confirmModal')), /setReason\(/)
      // Success is announced politely, and every announcement is cleared by the next action.
      assert.match(page, /role="status" aria-live="polite"/)
      assert.match(page, /if \(announce\) setAnnouncement\(announce\(parsed\)\)/)
      assert.match(page, /setModalError\(''\)\s*setAnnouncement\(''\)/)
      assert.equal((page.match(/fallbackFocusId=\{HEADING_ID\}/g) ?? []).length, 2)
      assert.match(modal, /readOnly=\{busy\}/)
      assert.match(modal, /document\.getElementById\(fallbackRef\.current\)/)
      assert.equal((page.match(/<TerminalModal/g) ?? []).length, 2)

      // Styles: the new rules sit on tokens only, and the modal opens with no animation.
      const rules = [...baseCss.matchAll(/(?:^|\n)[ \t]*([^{}\n]*\.admin-order-detail-(?:status|cancel|reason|modal)[^{}]*)\{([^}]*)\}/g)]
      assert.ok(rules.length >= 8, `4.6 rules are missing (${rules.length})`)
      for (const [, selector, body] of rules) {
        assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|(?<![\w-])(?:white|black)(?![\w-])/, `${selector.trim()} uses a raw colour`)
        assert.doesNotMatch(body, /\d+px/, `${selector.trim()} uses a raw size`)
        for (const color of body.matchAll(/(?:color|background|border[\w-]*|outline):\s*([^;]+);/g)) {
          assert.match(color[1], /var\(--|none|^0$|^0 /, `${selector.trim()} ${color[0]}`)
        }
      }
      assert.match(cssRule(baseCss, '.admin-order-detail-modal'), /animation: none/)
      assert.match(cssRule(baseCss, '.admin-order-detail-status-final'), /flex-wrap: wrap/)
    })
  })
})
