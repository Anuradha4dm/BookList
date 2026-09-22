import type Database from 'better-sqlite3'

export type PackBook = {
  id: number
  title: string
  price: number
  archivedAt: string | null
}

export type PackRow = {
  id: number
  name: string
  schoolId: number
  gradeId: number
  description: string
  price: number
  archivedAt: string | null
  books: PackBook[]
}

type PackSqlRow = {
  id: number
  name: string
  school_id: number
  grade_id: number
  description: string
  archived_at: string | null
}

type BookSqlRow = {
  id: number
  title: string
  price: number
  archived_at: string | null
}

function livePrice(books: PackBook[]): number {
  return books
    .filter((book) => book.archivedAt === null)
    .reduce((sum, book) => sum + book.price, 0)
}

function toBook(row: BookSqlRow): PackBook {
  return { id: row.id, title: row.title, price: row.price, archivedAt: row.archived_at }
}

function toPack(row: PackSqlRow, books: PackBook[]): PackRow {
  return {
    id: row.id,
    name: row.name,
    schoolId: row.school_id,
    gradeId: row.grade_id,
    description: row.description,
    price: livePrice(books),
    archivedAt: row.archived_at,
    books,
  }
}

function booksForPack(db: Database.Database, packId: number): PackBook[] {
  const rows = db
    .prepare(
      `SELECT books.id, books.title, books.price, books.archived_at
       FROM pack_books
       JOIN books ON books.id = pack_books.book_id
       WHERE pack_books.pack_id = ?
       ORDER BY books.id`,
    )
    .all(packId) as BookSqlRow[]
  return rows.map(toBook)
}

function insertMembership(db: Database.Database, packId: number, bookIds: number[]): void {
  const insert = db.prepare('INSERT INTO pack_books (pack_id, book_id) VALUES (?, ?)')
  for (const bookId of bookIds) insert.run(packId, bookId)
}

function replaceMembership(db: Database.Database, packId: number, bookIds: number[]): void {
  db.prepare('DELETE FROM pack_books WHERE pack_id = ?').run(packId)
  insertMembership(db, packId, bookIds)
}

function replaceLiveMembership(db: Database.Database, packId: number, bookIds: number[]): void {
  db.prepare(
    `DELETE FROM pack_books
     WHERE pack_id = ?
       AND book_id IN (SELECT id FROM books WHERE archived_at IS NULL)`,
  ).run(packId)
  insertMembership(db, packId, bookIds)
}

export function toStorefrontPack(pack: PackRow): PackRow {
  const books = pack.books.filter((book) => book.archivedAt === null)
  return { ...pack, books, price: livePrice(books) }
}

export function getPack(db: Database.Database, id: number): PackRow | undefined {
  const row = db
    .prepare(
      'SELECT id, name, school_id, grade_id, description, archived_at FROM packs WHERE id = ?',
    )
    .get(id) as PackSqlRow | undefined
  if (!row) return undefined
  return toPack(row, booksForPack(db, id))
}

export function listPacks(db: Database.Database): PackRow[] {
  const rows = db
    .prepare(
      'SELECT id, name, school_id, grade_id, description, archived_at FROM packs ORDER BY id',
    )
    .all() as PackSqlRow[]
  return rows.map((row) => toPack(row, booksForPack(db, row.id)))
}

export function createPack(
  db: Database.Database,
  name: string,
  schoolId: number,
  gradeId: number,
  description: string,
  bookIds: number[],
): PackRow {
  const now = new Date().toISOString()
  const created = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO packs (name, school_id, grade_id, description, archived_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
      )
      .run(name, schoolId, gradeId, description, now)
    const id = Number(result.lastInsertRowid)
    replaceMembership(db, id, bookIds)
    return getPack(db, id)
  })()
  if (!created) throw new Error('failed to load created pack')
  return created
}

export function updatePack(
  db: Database.Database,
  id: number,
  name: string,
  description: string,
  bookIds: number[],
): PackRow | undefined {
  const existing = getPack(db, id)
  if (!existing) return undefined
  return db.transaction(() => {
    db.prepare('UPDATE packs SET name = ?, description = ? WHERE id = ?').run(name, description, id)
    replaceLiveMembership(db, id, bookIds)
    return getPack(db, id)
  })()
}

export function archivePack(db: Database.Database, id: number): PackRow | undefined {
  const existing = getPack(db, id)
  if (!existing) return undefined
  if (existing.archivedAt) return existing
  const now = new Date().toISOString()
  db.prepare('UPDATE packs SET archived_at = ? WHERE id = ? AND archived_at IS NULL').run(now, id)
  return getPack(db, id)
}
