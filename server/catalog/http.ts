import { Router, type Request, type Response } from 'express'
import type Database from 'better-sqlite3'
import {
  lookupSession,
  rejectUnauthorized,
  type IdentityEnv,
  type SessionAccount,
  type SessionLookup,
} from '../identity/index.js'
import {
  archiveNamed,
  createNamed,
  deleteNamed,
  listNamed,
  renameNamed,
  type NamedKind,
} from './named.js'
import { validateName } from './validation.js'

const FORBIDDEN_MESSAGE =
  'Only the shop owner can change the school and grade lists. Sign in as the shop owner to continue.'

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

function requireAdmin(
  db: Database.Database,
  env: IdentityEnv,
  req: Request,
  res: Response,
): SessionAccount | undefined {
  const lookup: SessionLookup = lookupSession(db, env, req)
  if (lookup.status !== 'ok') {
    rejectUnauthorized(req, res, lookup)
    return undefined
  }
  if (lookup.account.role !== 'admin') {
    sendError(res, 403, 'forbidden', FORBIDDEN_MESSAGE)
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

function readBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {}
}

function mountNamedResource(router: Router, db: Database.Database, env: IdentityEnv, kind: NamedKind): void {
  const collection = kind === 'school' ? '/admin/schools' : '/admin/grades'
  const label = kind

  router.get(
    collection,
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      if (!requireAdmin(db, env, req, res)) return
      res.status(200).json(listNamed(db, kind))
    }),
  )

  router.post(
    collection,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res)) return
      const name = validateName(readBody(req).name, label)
      if (!name.ok) {
        sendError(res, 400, 'invalid_input', name.error.message, name.error.field)
        return
      }
      const created = createNamed(db, kind, name.value)
      res.status(201).json(created)
    }),
  )

  router.patch(
    `${collection}/:id`,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res)) return
      const id = parseId(req.params.id)
      if (id === undefined) {
        sendError(res, 404, 'not_found', `That ${label} is not on the list.`)
        return
      }
      const name = validateName(readBody(req).name, label)
      if (!name.ok) {
        sendError(res, 400, 'invalid_input', name.error.message, name.error.field)
        return
      }
      const updated = renameNamed(db, kind, id, name.value)
      if (!updated) {
        sendError(res, 404, 'not_found', `That ${label} is not on the list.`)
        return
      }
      res.status(200).json(updated)
    }),
  )

  router.post(
    `${collection}/:id/archive`,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res)) return
      const id = parseId(req.params.id)
      if (id === undefined) {
        sendError(res, 404, 'not_found', `That ${label} is not on the list.`)
        return
      }
      const archived = archiveNamed(db, kind, id)
      if (!archived) {
        sendError(res, 404, 'not_found', `That ${label} is not on the list.`)
        return
      }
      res.status(200).json(archived)
    }),
  )

  router.delete(
    `${collection}/:id`,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res)) return
      const id = parseId(req.params.id)
      if (id === undefined) {
        sendError(res, 404, 'not_found', `That ${label} is not on the list.`)
        return
      }
      const result = deleteNamed(db, kind, id)
      if (result === 'missing') {
        sendError(res, 404, 'not_found', `That ${label} is not on the list.`)
        return
      }
      if (result === 'in_use') {
        sendError(
          res,
          409,
          'in_use',
          `This ${label} is used by a live pack, so it cannot be deleted. Archive it instead.`,
        )
        return
      }
      res.status(204).end()
    }),
  )
}

export function createCatalogRouter(db: Database.Database, env: IdentityEnv): Router {
  const router = Router()
  mountNamedResource(router, db, env, 'school')
  mountNamedResource(router, db, env, 'grade')
  return router
}
