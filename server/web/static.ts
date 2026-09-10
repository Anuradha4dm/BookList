import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { Express, RequestHandler } from 'express'
import type { ViteDevServer } from 'vite'

function isAdminPath(url: string): boolean {
  const pathname = url.split(/[?#]/, 1)[0] ?? ''
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

function spaFallback(indexFile: string): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    if (path.posix.basename(req.path).includes('.')) {
      next()
      return
    }
    res.sendFile(indexFile, (err) => {
      if (err) next(err)
    })
  }
}

function htmlDevFallback(vite: ViteDevServer, indexFile: string): RequestHandler {
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    if (path.posix.basename(req.path).includes('.')) {
      next()
      return
    }
    try {
      const template = readFileSync(indexFile, 'utf8')
      const html = await vite.transformIndexHtml(req.originalUrl, template)
      res.status(200).type('html').end(html)
    } catch (err) {
      next(err)
    }
  }
}

export async function attachStatic(app: Express, repoRoot: string, isDev: boolean): Promise<void> {
  if (isDev) {
    const { createServer } = await import('vite')
    const adminRoot = path.join(repoRoot, 'client', 'admin')
    const storefrontRoot = path.join(repoRoot, 'client', 'storefront')
    const adminVite = await createServer({
      root: adminRoot,
      configFile: path.join(adminRoot, 'vite.config.ts'),
      server: { middlewareMode: true, ws: { port: 24679 } },
      appType: 'custom',
    })
    const storefrontVite = await createServer({
      root: storefrontRoot,
      configFile: path.join(storefrontRoot, 'vite.config.ts'),
      server: { middlewareMode: true, ws: { port: 24678 } },
      appType: 'custom',
    })
    app.use((req, res, next) => {
      if (isAdminPath(req.originalUrl)) {
        adminVite.middlewares(req, res, next)
        return
      }
      next()
    })
    app.use(storefrontVite.middlewares)
    app.use((req, res, next) => {
      if (isAdminPath(req.originalUrl)) {
        void htmlDevFallback(adminVite, path.join(adminRoot, 'index.html'))(req, res, next)
        return
      }
      next()
    })
    app.use(htmlDevFallback(storefrontVite, path.join(storefrontRoot, 'index.html')))
    return
  }

  const adminDist = path.join(repoRoot, 'client', 'admin', 'dist')
  const storefrontDist = path.join(repoRoot, 'client', 'storefront', 'dist')
  app.use(
    '/admin',
    express.static(adminDist, { redirect: false }),
    spaFallback(path.join(adminDist, 'index.html')),
  )
  app.use(
    express.static(storefrontDist),
    spaFallback(path.join(storefrontDist, 'index.html')),
  )
}

export function findRepoRoot(start: string): string {
  let dir = start
  for (;;) {
    if (existsSync(path.join(dir, 'package.json')) && existsSync(path.join(dir, 'client'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error('Could not find repository root')
    }
    dir = parent
  }
}
