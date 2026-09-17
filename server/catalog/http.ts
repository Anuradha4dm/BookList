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
  archiveBook,
  createBook,
  deleteBook,
  listBooks,
  updateBook,
} from './books.js'
import {
  archiveNamed,
  createNamed,
  deleteNamed,
  listNamed,
  renameNamed,
  type NamedKind,
} from './named.js'
import { validateName, validatePrice, validateTitle } from './validation.js'

const FORBIDDEN_MESSAGE =
  'Only the shop owner can change the school and grade lists. Sign in as the shop owner to continue.'

const BOOKS_FORBIDDEN_MESSAGE =
  'Only the shop owner can change the book list. Sign in as the shop owner to continue.'

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
      if (!requireAdmin(db, env, req, res, FORBIDDEN_MESSAGE)) return
      res.status(200).json(listNamed(db, kind))
    }),
  )

  router.post(
    collection,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res, FORBIDDEN_MESSAGE)) return
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
      if (!requireAdmin(db, env, req, res, FORBIDDEN_MESSAGE)) return
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
      if (!requireAdmin(db, env, req, res, FORBIDDEN_MESSAGE)) return
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
      if (!requireAdmin(db, env, req, res, FORBIDDEN_MESSAGE)) return
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

function readBookFields(req: Request):
  | { ok: true; title: string; price: number }
  | { ok: false; message: string; field: string } {
  const body = readBody(req)
  const title = validateTitle(body.title)
  if (!title.ok) return { ok: false, message: title.error.message, field: title.error.field }
  const price = validatePrice(body.price)
  if (!price.ok) return { ok: false, message: price.error.message, field: price.error.field }
  return { ok: true, title: title.value, price: price.value }
}

function mountBooks(router: Router, db: Database.Database, env: IdentityEnv): void {
  const collection = '/admin/books'

  router.get(
    collection,
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      if (!requireAdmin(db, env, req, res, BOOKS_FORBIDDEN_MESSAGE)) return
      res.status(200).json(listBooks(db))
    }),
  )

  router.post(
    collection,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res, BOOKS_FORBIDDEN_MESSAGE)) return
      const fields = readBookFields(req)
      if (!fields.ok) {
        sendError(res, 400, 'invalid_input', fields.message, fields.field)
        return
      }
      const created = createBook(db, fields.title, fields.price)
      res.status(201).json(created)
    }),
  )

  router.patch(
    `${collection}/:id`,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res, BOOKS_FORBIDDEN_MESSAGE)) return
      const id = parseId(req.params.id)
      if (id === undefined) {
        sendError(res, 404, 'not_found', 'That book is not on the list.')
        return
      }
      const fields = readBookFields(req)
      if (!fields.ok) {
        sendError(res, 400, 'invalid_input', fields.message, fields.field)
        return
      }
      const updated = updateBook(db, id, fields.title, fields.price)
      if (!updated) {
        sendError(res, 404, 'not_found', 'That book is not on the list.')
        return
      }
      res.status(200).json(updated)
    }),
  )

  router.post(
    `${collection}/:id/archive`,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res, BOOKS_FORBIDDEN_MESSAGE)) return
      const id = parseId(req.params.id)
      if (id === undefined) {
        sendError(res, 404, 'not_found', 'That book is not on the list.')
        return
      }
      const archived = archiveBook(db, id)
      if (!archived) {
        sendError(res, 404, 'not_found', 'That book is not on the list.')
        return
      }
      res.status(200).json(archived)
    }),
  )

  router.delete(
    `${collection}/:id`,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res, BOOKS_FORBIDDEN_MESSAGE)) return
      const id = parseId(req.params.id)
      if (id === undefined) {
        sendError(res, 404, 'not_found', 'That book is not on the list.')
        return
      }
      const result = deleteBook(db, id)
      if (result === 'missing') {
        sendError(res, 404, 'not_found', 'That book is not on the list.')
        return
      }
      if (result === 'in_use') {
        sendError(
          res,
          409,
          'in_use',
          'This book is used by a live pack, so it cannot be deleted. Archive it instead.',
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
  mountBooks(router, db, env)
  return router
}
