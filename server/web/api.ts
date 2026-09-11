import express, { Router, type ErrorRequestHandler } from 'express'
import { createIdentityRouter } from '../identity/index.js'
import type { Db } from './db.js'
import type { Env } from './env.js'

function isJsonParseError(err: unknown): boolean {
  if (err instanceof SyntaxError) return true
  if (typeof err !== 'object' || err === null) return false
  return 'type' in err && (err as { type: string }).type === 'entity.parse.failed'
}

const jsonParseError: ErrorRequestHandler = (err, _req, res, next) => {
  if (!isJsonParseError(err)) {
    next(err)
    return
  }
  res.status(400).json({
    error: {
      code: 'invalid_json',
      message: 'The request body was not valid JSON. Send JSON and try again.',
    },
  })
}

export function createApiRouter(db: Db, env: Env): Router {
  const router = Router()
  router.use(express.json())
  router.use(jsonParseError)
  router.use(createIdentityRouter(db, env))

  router.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'not_found',
        message: `No API route matches ${req.method} ${req.originalUrl}`,
      },
    })
  })

  return router
}
