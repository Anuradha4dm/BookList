import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createApiRouter } from './api.js'
import { openDb } from './db.js'
import { loadEnv } from './env.js'
import { attachStatic, findRepoRoot } from './static.js'
import { runMigrations } from '../db/migrations/run.js'
import { seedAdmin } from '../identity/index.js'

const env = loadEnv()

async function openMigrateAndSeed() {
  try {
    const connection = openDb(env)
    runMigrations(connection)
    await seedAdmin(connection, env)
    return connection
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

export const db = await openMigrateAndSeed()

const app = express()
app.use('/api', createApiRouter(db, env))

const isDev = import.meta.url.endsWith('.ts')
const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)))
await attachStatic(app, repoRoot, isDev)

const server = app.listen(env.PORT, () => {
  console.log(`listening on ${env.PORT}`)
})
server.on('error', (error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
