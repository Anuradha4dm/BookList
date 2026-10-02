import { Router, type Request, type Response } from 'express'
import type Database from 'better-sqlite3'
import {
  lookupSession,
  rejectUnauthorized,
  type IdentityEnv,
  type SessionAccount,
  type SessionLookup,
} from '../identity/index.js'
import { enableForeignKeys } from '../identity/seed.js'
import { listAdminOrders } from './admin.js'

const ADMIN_ORDERS_FORBIDDEN =
  'Only the shop owner can see all orders. Sign in as the shop owner to continue.'

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } })
}

function safe(
  handler: (req: Request, res: Response) => void | Promise<void>,
): (req: Request, res: Response) => void {
  return (req, res) => {
    void Promise.resolve()
      .then(() => handler(req, res))
      .catch(() => {
        if (!res.headersSent) {
          sendError(res, 500, 'internal_error', 'Something went wrong on our side. Try again.')
        }
      })
  }
}

function requireAdmin(
  db: Database.Database,
  env: IdentityEnv,
  req: Request,
  res: Response,
  forbiddenMessage: string,
): SessionAccount | undefined {
  const lookup: SessionLookup = lookupSession(db, env, req)
  if (lookup.status !== 'ok') {
    rejectUnauthorized(req, res, lookup)
    return undefined
  }
  if (lookup.account.role !== 'admin') {
    sendError(res, 403, 'forbidden', forbiddenMessage)
    return undefined
  }
  return lookup.account
}

/** The shop's view of every order. Detail, confirm, calls and status changes come later. */
export function createAdminOrdersRouter(db: Database.Database, env: IdentityEnv): Router {
  enableForeignKeys(db)
  const router = Router()

  router.get(
    '/admin/orders',
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      if (!requireAdmin(db, env, req, res, ADMIN_ORDERS_FORBIDDEN)) return
      res.status(200).json({ orders: listAdminOrders(db) })
    }),
  )

  return router
}
