import { Router, type Request, type Response } from 'express'
import type Database from 'better-sqlite3'
import {
  lookupSession,
  rejectUnauthorized,
  type IdentityEnv,
  type SessionLookup,
} from '../identity/index.js'
import { enableForeignKeys } from '../identity/seed.js'
import { listParentOrders, placeOrder, type OrderSummary } from './place.js'
import { ORDER_NOT_FOUND_MESSAGE, cancelParentOrder, getParentOrder } from './detail.js'

const PARENT_FORBIDDEN = 'Only parents can place orders.'
const PARENT_VIEW_FORBIDDEN = 'Only parents can view their orders.'
const NOTE_MAX_LENGTH = 1000
const KEY_PATTERN = /^[\x20-\x7E]{1,100}$/

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

function requireParent(
  db: Database.Database,
  env: IdentityEnv,
  req: Request,
  res: Response,
  forbiddenMessage: string,
): number | undefined {
  const lookup: SessionLookup = lookupSession(db, env, req)
  if (lookup.status !== 'ok') {
    rejectUnauthorized(req, res, lookup)
    return undefined
  }
  if (lookup.account.role !== 'parent') {
    sendError(res, 403, 'forbidden', forbiddenMessage)
    return undefined
  }
  return lookup.account.id
}

function parseId(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return undefined
  const id = Number(value)
  if (!Number.isSafeInteger(id)) return undefined
  return id
}

/** 1–100 printable ASCII characters, not only spaces; anything else is refused. */
function parseIdempotencyKey(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || !KEY_PATTERN.test(value) || !value.trim()) return undefined
  return value
}

type NoteResult = { ok: true; note: string | null } | { ok: false; message: string }

/** Optional; trimmed; empty becomes null; at most 1000 characters. */
function parseNote(value: unknown): NoteResult {
  if (value === undefined) return { ok: true, note: null }
  if (typeof value !== 'string') return { ok: false, message: 'Send the delivery note as text.' }
  const trimmed = value.trim()
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      message: `Keep the delivery note to ${NOTE_MAX_LENGTH} characters or fewer.`,
    }
  }
  return { ok: true, note: trimmed ? trimmed : null }
}

function orderJson(order: OrderSummary) {
  return {
    id: order.id,
    publicNumber: order.publicNumber,
    status: order.status,
    goodsTotal: order.goodsTotal,
    placedAt: order.placedAt,
  }
}

export function createOrdersRouter(db: Database.Database, env: IdentityEnv): Router {
  enableForeignKeys(db)
  const router = Router()

  router.post(
    '/orders',
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const parentId = requireParent(db, env, req, res, PARENT_FORBIDDEN)
      if (parentId === undefined) return

      const key = parseIdempotencyKey(req.get('Idempotency-Key'))
      if (key === undefined) {
        sendError(
          res,
          400,
          'invalid_input',
          'Send an Idempotency-Key header of 1 to 100 printable characters.',
          'idempotencyKey',
        )
        return
      }

      // Only the note is read from the body; an address or anything else is ignored.
      const body = (req.body ?? {}) as Record<string, unknown>
      const note = parseNote(body.note)
      if (!note.ok) {
        sendError(res, 400, 'invalid_input', note.message, 'note')
        return
      }

      const result = placeOrder(db, parentId, key, note.note)
      if (!result.ok) {
        sendError(res, result.status, result.code, result.message)
        return
      }
      res.status(result.replayed ? 200 : 201).json({ order: orderJson(result.order) })
    }),
  )

  router.get(
    '/orders',
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const parentId = requireParent(db, env, req, res, PARENT_VIEW_FORBIDDEN)
      if (parentId === undefined) return
      res.status(200).json({ orders: listParentOrders(db, parentId).map(orderJson) })
    }),
  )

  router.get(
    '/orders/:id',
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const parentId = requireParent(db, env, req, res, PARENT_VIEW_FORBIDDEN)
      if (parentId === undefined) return
      const orderId = parseId(req.params.id)
      // Someone else's order and a malformed id answer the same 404, so ids leak nothing.
      const order = orderId === undefined ? undefined : getParentOrder(db, parentId, orderId)
      if (!order) {
        sendError(res, 404, 'not_found', ORDER_NOT_FOUND_MESSAGE)
        return
      }
      res.status(200).json({ order })
    }),
  )

  router.post(
    '/orders/:id/cancel',
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const parentId = requireParent(db, env, req, res, PARENT_VIEW_FORBIDDEN)
      if (parentId === undefined) return
      const orderId = parseId(req.params.id)
      if (orderId === undefined) {
        sendError(res, 404, 'not_found', ORDER_NOT_FOUND_MESSAGE)
        return
      }
      // The cancel takes no body; anything sent is ignored.
      const result = cancelParentOrder(db, parentId, orderId)
      if (!result.ok) {
        sendError(res, result.status, result.code, result.message)
        return
      }
      res.status(200).json({ order: result.order })
    }),
  )

  return router
}
