import { Router } from 'express'

export function createApiRouter(): Router {
  const router = Router()

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
