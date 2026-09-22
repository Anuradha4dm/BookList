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
  getBook,
  listBooks,
  updateBook,
} from './books.js'
import {
  archiveNamed,
  createNamed,
  deleteNamed,
  getNamed,
  listNamed,
  renameNamed,
  type NamedKind,
} from './named.js'
import { archivePack, createPack, listPacks, updatePack } from './packs.js'
import {
  validateBookIds,
  validateDescription,
  validateName,
  validatePrice,
  validateTitle,
} from './validation.js'

const FORBIDDEN_MESSAGE =
  'Only the shop owner can change the school and grade lists. Sign in as the shop owner to continue.'

const BOOKS_FORBIDDEN_MESSAGE =
  'Only the shop owner can change the book list. Sign in as the shop owner to continue.'

const PACKS_FORBIDDEN_MESSAGE =
  'Only the shop owner can change the pack list. Sign in as the shop owner to continue.'

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

function readRowId(
  value: unknown,
  field: 'schoolId' | 'gradeId',
  label: 'school' | 'grade',
): { ok: true; value: number } | { ok: false; message: string; field: string } {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    return { ok: false, message: `Choose a ${label}.`, field }
  }
  return { ok: true, value }
}

function readLiveNamed(
  db: Database.Database,
  kind: NamedKind,
  value: unknown,
  field: 'schoolId' | 'gradeId',
): { ok: true; value: number } | { ok: false; message: string; field: string } {
  const label = kind
  const id = readRowId(value, field, label)
  if (!id.ok) return id
  const row = getNamed(db, kind, id.value)
  if (!row || row.archivedAt) {
    return { ok: false, message: `That ${label} is not available.`, field }
  }
  return { ok: true, value: id.value }
}

function readLiveBookIds(
  db: Database.Database,
  value: unknown,
): { ok: true; value: number[] } | { ok: false; message: string; field: string } {
  const ids = validateBookIds(value)
  if (!ids.ok) return { ok: false, message: ids.error.message, field: ids.error.field }
  for (const id of ids.value) {
    const book = getBook(db, id)
    if (!book || book.archivedAt) {
      return { ok: false, message: 'That book is not available.', field: 'bookIds' }
    }
  }
  return { ok: true, value: ids.value }
}

function readPackWriteFields(
  db: Database.Database,
  req: Request,
  mode: 'create' | 'update',
):
  | { ok: true; name: string; description: string; bookIds: number[]; schoolId?: number; gradeId?: number }
  | { ok: false; message: string; field: string } {
  const body = readBody(req)
  const name = validateName(body.name, 'pack')
  if (!name.ok) return { ok: false, message: name.error.message, field: name.error.field }
  const description = validateDescription(body.description)
  if (!description.ok) {
    return { ok: false, message: description.error.message, field: description.error.field }
  }
  let schoolId: number | undefined
  let gradeId: number | undefined
  if (mode === 'create') {
    const school = readLiveNamed(db, 'school', body.schoolId, 'schoolId')
    if (!school.ok) return school
    const grade = readLiveNamed(db, 'grade', body.gradeId, 'gradeId')
    if (!grade.ok) return grade
    schoolId = school.value
    gradeId = grade.value
  }
  const bookIds = readLiveBookIds(db, body.bookIds)
  if (!bookIds.ok) return bookIds
  return {
    ok: true,
    name: name.value,
    description: description.value,
    bookIds: bookIds.value,
    schoolId,
    gradeId,
  }
}

function mountPacks(router: Router, db: Database.Database, env: IdentityEnv): void {
  const collection = '/admin/packs'

  router.get(
    collection,
    safe((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      if (!requireAdmin(db, env, req, res, PACKS_FORBIDDEN_MESSAGE)) return
      res.status(200).json(listPacks(db))
    }),
  )

  router.post(
    collection,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res, PACKS_FORBIDDEN_MESSAGE)) return
      const fields = readPackWriteFields(db, req, 'create')
      if (!fields.ok) {
        sendError(res, 400, 'invalid_input', fields.message, fields.field)
        return
      }
      if (fields.schoolId === undefined || fields.gradeId === undefined) {
        sendError(res, 400, 'invalid_input', 'Choose a school.', 'schoolId')
        return
      }
      const created = createPack(
        db,
        fields.name,
        fields.schoolId,
        fields.gradeId,
        fields.description,
        fields.bookIds,
      )
      res.status(201).json(created)
    }),
  )

  router.patch(
    `${collection}/:id`,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res, PACKS_FORBIDDEN_MESSAGE)) return
      const id = parseId(req.params.id)
      if (id === undefined) {
        sendError(res, 404, 'not_found', 'That pack is not on the list.')
        return
      }
      const fields = readPackWriteFields(db, req, 'update')
      if (!fields.ok) {
        sendError(res, 400, 'invalid_input', fields.message, fields.field)
        return
      }
      const updated = updatePack(db, id, fields.name, fields.description, fields.bookIds)
      if (!updated) {
        sendError(res, 404, 'not_found', 'That pack is not on the list.')
        return
      }
      res.status(200).json(updated)
    }),
  )

  router.post(
    `${collection}/:id/archive`,
    safe((req, res) => {
      if (!requireAdmin(db, env, req, res, PACKS_FORBIDDEN_MESSAGE)) return
      const id = parseId(req.params.id)
      if (id === undefined) {
        sendError(res, 404, 'not_found', 'That pack is not on the list.')
        return
      }
      const archived = archivePack(db, id)
      if (!archived) {
        sendError(res, 404, 'not_found', 'That pack is not on the list.')
        return
      }
      res.status(200).json(archived)
    }),
  )
}

export function createCatalogRouter(db: Database.Database, env: IdentityEnv): Router {
  const router = Router()
  mountNamedResource(router, db, env, 'school')
  mountNamedResource(router, db, env, 'grade')
  mountBooks(router, db, env)
  mountPacks(router, db, env)
  return router
}
