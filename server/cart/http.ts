import { Router, type Request, type Response } from 'express'
import type Database from 'better-sqlite3'
import {
  lookupSession,
  rejectUnauthorized,
  type IdentityEnv,
  type SessionLookup,
} from '../identity/index.js'
import { enableForeignKeys } from '../identity/seed.js'
import { addCartItem, listCartItemLines } from './items.js'
import { addConfiguredPack, listCartPackLines } from './packs.js'

const PARENT_FORBIDDEN =
  'This is a parent cart. Sign in as a parent to view or add packs.'

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  field?: string,
): void {
  const error: { code: string; message: string; field?: string } = { code, message }
  if (field) error.field = field
  res.status(status).json({ error })
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

function requireParent(
  db: Database.Database,
  env: IdentityEnv,
  req: Request,
  res: Response,
): number | undefined {
  const lookup: SessionLookup = lookupSession(db, env, req)
  if (lookup.status !== 'ok') {
    rejectUnauthorized(req, res, lookup)
    return undefined
  }
  if (lookup.account.role !== 'parent') {
    sendError(res, 403, 'forbidden', PARENT_FORBIDDEN)
    return undefined
  }
  return lookup.account.id
}

function parsePositiveId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1) return value
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    const id = Number(value)
    if (Number.isSafeInteger(id)) return id
  }
  return undefined
}

export function createCartRouter(db: Database.Database, env: IdentityEnv): Router {
  enableForeignKeys(db)
  const router = Router()

  router.post(
    '/cart/packs',
    safe((req, res) => {
      const parentId = requireParent(db, env, req, res)
      if (parentId === undefined) return

      const body = (req.body ?? {}) as Record<string, unknown>
      const packId = parsePositiveId(body.packId)
      if (packId === undefined) {
        sendError(res, 400, 'invalid_input', 'Choose a pack.', 'packId')
        return
      }

      const result = addConfiguredPack(db, parentId, packId, body.selection)
      if (!result.ok) {
        sendError(res, result.status, result.code, result.message, result.field)
        return
      }

      res.status(201).json({
        id: result.line.id,
        packId: result.line.packId,
        sequence: result.line.sequence,
        gradeName: result.line.gradeName,
        label: result.line.label,
      })
    }),
  )

  router.post(
    '/cart/items',
    safe((req, res) => {
      const parentId = requireParent(db, env, req, res)
      if (parentId === undefined) return

      const body = (req.body ?? {}) as Record<string, unknown>
      const itemId = parsePositiveId(body.itemId)
      if (itemId === undefined) {
        sendError(res, 400, 'invalid_input', 'Choose an item.', 'itemId')
        return
      }

      const result = addCartItem(db, parentId, itemId, body.quantity)
      if (!result.ok) {
        sendError(res, result.status, result.code, result.message, result.field)
        return
      }

      res.status(result.created ? 201 : 200).json({
        id: result.line.id,
        itemId: result.line.itemId,
        quantity: result.line.quantity,
        title: result.line.title,
        unitPrice: result.line.unitPrice,
      })
    }),
  )

  router.get(
    '/cart',
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const parentId = requireParent(db, env, req, res)
      if (parentId === undefined) return

      const packLines = listCartPackLines(db, parentId).map((line) => ({
        kind: 'pack' as const,
        id: line.id,
        packId: line.packId,
        sequence: line.sequence,
        gradeName: line.gradeName,
        label: line.label,
      }))
      const itemLines = listCartItemLines(db, parentId).map((line) => ({
        kind: 'item' as const,
        id: line.id,
        itemId: line.itemId,
        quantity: line.quantity,
        title: line.title,
        unitPrice: line.unitPrice,
      }))

      res.status(200).json({
        lines: [...packLines, ...itemLines],
      })
    }),
  )

  return router
}
