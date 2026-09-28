import type Database from 'better-sqlite3'

export type ItemRow = {
  id: number
  title: string
  description: string
  price: number
  archivedAt: string | null
}

type SqlRow = {
  id: number
  title: string
  description: string
  price: number
  archived_at: string | null
}

function toJson(row: SqlRow): ItemRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    archivedAt: row.archived_at,
  }
}

export function listItems(db: Database.Database): ItemRow[] {
  const rows = db
    .prepare('SELECT id, title, description, price, archived_at FROM items ORDER BY id')
    .all() as SqlRow[]
  return rows.map(toJson)
}

export type BrowseItem = {
  id: number
  title: string
  description: string
  price: number
}

export function listBrowseItems(db: Database.Database): BrowseItem[] {
  const rows = db
    .prepare(
      'SELECT id, title, description, price FROM items WHERE archived_at IS NULL ORDER BY id',
    )
    .all() as Array<{ id: number; title: string; description: string; price: number }>
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
  }))
}

export function getItem(db: Database.Database, id: number): ItemRow | undefined {
  const row = db
    .prepare('SELECT id, title, description, price, archived_at FROM items WHERE id = ?')
    .get(id) as SqlRow | undefined
  return row ? toJson(row) : undefined
}

/** Live catalog row for cart clone — archived items are absent. */
export type LiveItem = {
  id: number
  title: string
  price: number
}

export function getLiveItem(db: Database.Database, id: number): LiveItem | undefined {
  const row = db
    .prepare(
      'SELECT id, title, price FROM items WHERE id = ? AND archived_at IS NULL',
    )
    .get(id) as { id: number; title: string; price: number } | undefined
  return row ?? undefined
}

export function createItem(
  db: Database.Database,
  title: string,
  description: string,
  price: number,
): ItemRow {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      'INSERT INTO items (title, description, price, archived_at, created_at) VALUES (?, ?, ?, NULL, ?)',
    )
    .run(title, description, price, now)
  const created = getItem(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('failed to load created item')
  return created
}

export function updateItem(
  db: Database.Database,
  id: number,
  title: string,
  description: string,
  price: number,
): ItemRow | undefined {
  const existing = getItem(db, id)
  if (!existing) return undefined
  db.prepare('UPDATE items SET title = ?, description = ?, price = ? WHERE id = ?').run(
    title,
    description,
    price,
    id,
  )
  return getItem(db, id)
}

export function archiveItem(db: Database.Database, id: number): ItemRow | undefined {
  const existing = getItem(db, id)
  if (!existing) return undefined
  if (existing.archivedAt) return existing
  const now = new Date().toISOString()
  db.prepare('UPDATE items SET archived_at = ? WHERE id = ? AND archived_at IS NULL').run(now, id)
  return getItem(db, id)
}
