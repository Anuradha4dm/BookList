import type Database from 'better-sqlite3'

export type BookRow = {
  id: number
  title: string
  price: number
  archivedAt: string | null
}

type SqlRow = {
  id: number
  title: string
  price: number
  archived_at: string | null
}

function toJson(row: SqlRow): BookRow {
  return { id: row.id, title: row.title, price: row.price, archivedAt: row.archived_at }
}

export function listBooks(db: Database.Database): BookRow[] {
  const rows = db
    .prepare('SELECT id, title, price, archived_at FROM books ORDER BY id')
    .all() as SqlRow[]
  return rows.map(toJson)
}

export function getBook(db: Database.Database, id: number): BookRow | undefined {
  const row = db
    .prepare('SELECT id, title, price, archived_at FROM books WHERE id = ?')
    .get(id) as SqlRow | undefined
  return row ? toJson(row) : undefined
}

export function createBook(db: Database.Database, title: string, price: number): BookRow {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      'INSERT INTO books (title, price, archived_at, created_at) VALUES (?, ?, NULL, ?)',
    )
    .run(title, price, now)
  const created = getBook(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('failed to load created book')
  return created
}

export function updateBook(
  db: Database.Database,
  id: number,
  title: string,
  price: number,
): BookRow | undefined {
  const existing = getBook(db, id)
  if (!existing) return undefined
  db.prepare('UPDATE books SET title = ?, price = ? WHERE id = ?').run(title, price, id)
  return getBook(db, id)
}

export function archiveBook(db: Database.Database, id: number): BookRow | undefined {
  const existing = getBook(db, id)
  if (!existing) return undefined
  if (existing.archivedAt) return existing
  const now = new Date().toISOString()
  db.prepare('UPDATE books SET archived_at = ? WHERE id = ? AND archived_at IS NULL').run(now, id)
  return getBook(db, id)
}

/** pack_books exists as of Story 2.4; sqlite_master still guards older databases. */
export function livePackBookReferenceCount(db: Database.Database, id: number): number {
  const packBooks = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'pack_books'")
    .get() as { ok: number } | undefined
  if (!packBooks) return 0
  const packs = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'packs'")
    .get() as { ok: number } | undefined
  if (!packs) return 0
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM pack_books
       JOIN packs ON packs.id = pack_books.pack_id
       WHERE pack_books.book_id = ? AND packs.archived_at IS NULL`,
    )
    .get(id) as { n: number }
  return row.n
}

export function deleteBook(
  db: Database.Database,
  id: number,
): 'missing' | 'in_use' | 'deleted' {
  const existing = getBook(db, id)
  if (!existing) return 'missing'
  if (livePackBookReferenceCount(db, id) > 0) return 'in_use'
  db.prepare('DELETE FROM books WHERE id = ?').run(id)
  return 'deleted'
}
