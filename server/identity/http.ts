import { randomBytes } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import type Database from 'better-sqlite3'
import {
  SESSION_MAX_AGE_SECONDS,
  clearSessionCookie,
  isHttps,
  readSessionCookie,
  sessionIdFromCookie,
  setSessionCookie,
  signedCookieValue,
} from './cookies.js'
import {
  dummyPasswordHash,
  generateRecoveryCode,
  hashSecret,
  normalizeRecoveryCode,
  printRecoveryCode,
  verifySecret,
} from './passwords.js'
import { enableForeignKeys, normalizeEmail, type IdentityEnv } from './seed.js'

type AdminRow = {
  id: number
  email: string
  password_hash: string
}

type SessionRow = {
  id: string
  admin_id: number
  expires_at: string
}

class RecoveryConflictError extends Error {
  constructor() {
    super('recovery conflict')
    this.name = 'RecoveryConflictError'
  }
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function safe(
  handler: (req: Request, res: Response) => void | Promise<void>,
): (req: Request, res: Response) => void {
  return (req, res) => {
    void Promise.resolve(handler(req, res)).catch(() => {
      if (!res.headersSent) {
        sendError(res, 500, 'internal_error', 'Something went wrong on our side. Try again.')
      }
    })
  }
}

type SessionLookup =
  | { status: 'ok'; admin: AdminRow; session: SessionRow }
  | { status: 'none' }
  | { status: 'stale' }

function lookupAdminSession(
  db: Database.Database,
  env: IdentityEnv,
  req: Request,
): SessionLookup {
  const raw = readSessionCookie(req)
  if (!raw) return { status: 'none' }
  const sessionId = sessionIdFromCookie(raw, env.SESSION_SECRET)
  if (!sessionId) return { status: 'none' }
  const session = db
    .prepare('SELECT id, admin_id, expires_at FROM sessions WHERE id = ?')
    .get(sessionId) as SessionRow | undefined
  if (!session) return { status: 'stale' }
  if (Date.parse(session.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id)
    return { status: 'stale' }
  }
  const admin = db
    .prepare('SELECT id, email, password_hash FROM admins WHERE id = ?')
    .get(session.admin_id) as AdminRow | undefined
  if (!admin) return { status: 'stale' }
  return { status: 'ok', admin, session }
}

function rejectUnauthorized(req: Request, res: Response, lookup: SessionLookup): void {
  if (lookup.status === 'stale') {
    clearSessionCookie(res, isHttps(req))
  }
  sendError(res, 401, 'unauthenticated', 'Sign in to continue.')
}

function createAdminSession(
  db: Database.Database,
  env: IdentityEnv,
  adminId: number,
  req: Request,
  res: Response,
): void {
  const sessionId = randomBytes(18).toString('base64url')
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000)
  db.prepare(
    'INSERT INTO sessions (id, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(sessionId, adminId, now.toISOString(), expires.toISOString())
  setSessionCookie(res, signedCookieValue(sessionId, env.SESSION_SECRET), isHttps(req))
}

export function createIdentityRouter(db: Database.Database, env: IdentityEnv): Router {
  enableForeignKeys(db)
  const router = Router()

  router.post(
    '/session',
    safe(async (req, res) => {
      const email = typeof req.body?.email === 'string' ? req.body.email : ''
      const password = typeof req.body?.password === 'string' ? req.body.password : ''
      if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
        sendError(res, 400, 'invalid_input', 'Enter your email and password to sign in.')
        return
      }

      const admin = db
        .prepare('SELECT id, email, password_hash FROM admins WHERE email = ?')
        .get(normalizeEmail(email)) as AdminRow | undefined
      const stored = admin?.password_hash ?? (await dummyPasswordHash())
      const matches = await verifySecret(password, stored)
      if (!admin || !matches) {
        sendError(
          res,
          401,
          'invalid_credentials',
          'That email or password is not right. Check them and try again.',
        )
        return
      }

      createAdminSession(db, env, admin.id, req, res)
      res.status(200).json({ role: 'admin', email: admin.email })
    }),
  )

  router.get(
    '/session',
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const current = lookupAdminSession(db, env, req)
      if (current.status !== 'ok') {
        rejectUnauthorized(req, res, current)
        return
      }
      res.status(200).json({ role: 'admin', email: current.admin.email })
    }),
  )

  router.delete(
    '/session',
    safe((req, res) => {
      const current = lookupAdminSession(db, env, req)
      if (current.status !== 'ok') {
        rejectUnauthorized(req, res, current)
        return
      }
      db.prepare('DELETE FROM sessions WHERE id = ?').run(current.session.id)
      clearSessionCookie(res, isHttps(req))
      res.status(204).end()
    }),
  )

  router.post(
    '/admin/recovery',
    safe(async (req, res) => {
      const code = typeof req.body?.code === 'string' ? req.body.code : ''
      const password = typeof req.body?.password === 'string' ? req.body.password : ''
      if (!isNonEmptyString(code) || !isNonEmptyString(password)) {
        sendError(
          res,
          400,
          'invalid_input',
          'Send the current recovery code and a new password.',
        )
        return
      }

      const admin = db.prepare('SELECT id, email, password_hash FROM admins LIMIT 1').get() as
        | AdminRow
        | undefined
      const recovery = db.prepare('SELECT code_hash FROM admin_recovery WHERE id = 1').get() as
        | { code_hash: string }
        | undefined
      const canonical = normalizeRecoveryCode(code)
      if (!admin || !recovery || !(await verifySecret(canonical, recovery.code_hash))) {
        sendError(
          res,
          401,
          'invalid_recovery_code',
          'That recovery code is not valid. Use the current code from the server log.',
        )
        return
      }

      const passwordHash = await hashSecret(password)
      const nextCode = generateRecoveryCode()
      const nextHash = await hashSecret(nextCode)
      const now = new Date().toISOString()

      const rotate = db.transaction(() => {
        const latest = db.prepare('SELECT code_hash FROM admin_recovery WHERE id = 1').get() as
          | { code_hash: string }
          | undefined
        if (!latest || latest.code_hash !== recovery.code_hash) {
          throw new RecoveryConflictError()
        }
        db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(passwordHash, admin.id)
        db.prepare('UPDATE admin_recovery SET code_hash = ?, created_at = ? WHERE id = 1').run(
          nextHash,
          now,
        )
        db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(admin.id)
      })

      try {
        rotate()
      } catch (error) {
        if (error instanceof RecoveryConflictError) {
          sendError(
            res,
            401,
            'invalid_recovery_code',
            'That recovery code is not valid. Use the current code from the server log.',
          )
          return
        }
        throw error
      }

      printRecoveryCode(nextCode)
      res.status(200).json({ ok: true })
    }),
  )

  return router
}
