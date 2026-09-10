import Database from 'better-sqlite3'
import type { Env } from './env.js'

export type Db = InstanceType<typeof Database>

export function openDb(env: Env): Db {
  const db = new Database(env.DATABASE_PATH)
  const journalMode = db.pragma('journal_mode = WAL', { simple: true })
  if (String(journalMode).toLowerCase() !== 'wal') {
    throw new Error(`Failed to enable WAL: journal_mode is ${String(journalMode)}`)
  }
  return db
}
