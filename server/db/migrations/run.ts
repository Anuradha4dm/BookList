import type Database from 'better-sqlite3'

type Migration = {
  filename: string
  sql: string
}

const MIGRATIONS: Migration[] = []

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS applied_migrations (
      filename TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const appliedRows = db.prepare('SELECT filename FROM applied_migrations').all() as Array<{
    filename: string
  }>
  const applied = new Set(appliedRows.map((row) => row.filename))
  const insert = db.prepare(
    'INSERT INTO applied_migrations (filename, applied_at) VALUES (?, ?)',
  )

  const apply = db.transaction((migrations: Migration[]) => {
    for (const migration of migrations) {
      if (applied.has(migration.filename)) continue
      db.exec(migration.sql)
      insert.run(migration.filename, new Date().toISOString())
    }
  })

  apply(MIGRATIONS)
}
