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
import {
  DELIVERY_PRICE_MESSAGE,
  confirmOrder,
  getAdminOrder,
  listAdminOrders,
  markCallAttempted,
} from './admin.js'
import { ORDER_NOT_FOUND_MESSAGE } from './detail.js'

const ADMIN_ORDERS_FORBIDDEN =
  'Only the shop owner can see all orders. Sign in as the shop owner to continue.'

function sendError(res: Response, status: number, code: string, message: string, field?: string): void {
  const error: { code: string; message: string; field?: string } = { code, message }
  if (field) error.field = field
  res.status(status).json({ error })
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

function parseId(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return undefined
  const id = Number(value)
  if (!Number.isSafeInteger(id)) return undefined
  return id
}

/** A JSON safe integer of 0 or more; strings and fractions are refused, never coerced. */
function parseDeliveryPrice(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return undefined
  return value
}

/** The shop's view of every order, one order's detail, the call mark and the confirm. */
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

  router.get(
    '/admin/orders/:id',
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      if (!requireAdmin(db, env, req, res, ADMIN_ORDERS_FORBIDDEN)) return
      const orderId = parseId(req.params.id)
      const order = orderId === undefined ? undefined : getAdminOrder(db, orderId)
      if (!order) {
        sendError(res, 404, 'not_found', ORDER_NOT_FOUND_MESSAGE)
        return
      }
      res.status(200).json({ order })
    }),
  )

  router.post(
    '/admin/orders/:id/call-attempted',
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      if (!requireAdmin(db, env, req, res, ADMIN_ORDERS_FORBIDDEN)) return
      const orderId = parseId(req.params.id)
      if (orderId === undefined) {
        sendError(res, 404, 'not_found', ORDER_NOT_FOUND_MESSAGE)
        return
      }
      // The mark takes no body; anything sent is ignored.
      const result = markCallAttempted(db, orderId)
      if (!result.ok) {
        sendError(res, result.status, result.code, result.message)
        return
      }
      res.status(200).json({ order: result.order })
    }),
  )

  router.post(
    '/admin/orders/:id/confirm',
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      if (!requireAdmin(db, env, req, res, ADMIN_ORDERS_FORBIDDEN)) return
      const orderId = parseId(req.params.id)
      if (orderId === undefined) {
        sendError(res, 404, 'not_found', ORDER_NOT_FOUND_MESSAGE)
        return
      }
      // Only the delivery price is read; the payable total is always computed on the server.
      const body = (req.body ?? {}) as Record<string, unknown>
      const deliveryPrice = parseDeliveryPrice(body.deliveryPrice)
      if (deliveryPrice === undefined) {
        sendError(res, 400, 'invalid_input', DELIVERY_PRICE_MESSAGE, 'deliveryPrice')
        return
      }
      const result = confirmOrder(db, orderId, deliveryPrice)
      if (!result.ok) {
        sendError(res, result.status, result.code, result.message, 'field' in result ? result.field : undefined)
        return
      }
      res.status(200).json({ order: result.order })
    }),
  )

  return router
}
