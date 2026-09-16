import type Database from 'better-sqlite3'

export type NamedKind = 'school' | 'grade'

export type NamedRow = {
  id: number
  name: string
  archivedAt: string | null
}

const TABLES = {
  school: 'schools',
  grade: 'grades',
} as const

type SqlRow = {
  id: number
  name: string
  archived_at: string | null
}

function tableOf(kind: NamedKind): (typeof TABLES)[NamedKind] {
  return TABLES[kind]
}

function toJson(row: SqlRow): NamedRow {
  return { id: row.id, name: row.name, archivedAt: row.archived_at }
}

export function listNamed(db: Database.Database, kind: NamedKind): NamedRow[] {
  const rows = db
    .prepare(`SELECT id, name, archived_at FROM ${tableOf(kind)} ORDER BY id`)
    .all() as SqlRow[]
  return rows.map(toJson)
}

export function getNamed(db: Database.Database, kind: NamedKind, id: number): NamedRow | undefined {
  const row = db
    .prepare(`SELECT id, name, archived_at FROM ${tableOf(kind)} WHERE id = ?`)
    .get(id) as SqlRow | undefined
  return row ? toJson(row) : undefined
}

export function createNamed(db: Database.Database, kind: NamedKind, name: string): NamedRow {
  const now = new Date().toISOString()
  const result = db
    .prepare(`INSERT INTO ${tableOf(kind)} (name, archived_at, created_at) VALUES (?, NULL, ?)`)
    .run(name, now)
  const created = getNamed(db, kind, Number(result.lastInsertRowid))
  if (!created) throw new Error(`failed to load created ${kind}`)
  return created
}

export function renameNamed(
  db: Database.Database,
  kind: NamedKind,
  id: number,
  name: string,
): NamedRow | undefined {
  const existing = getNamed(db, kind, id)
  if (!existing) return undefined
  db.prepare(`UPDATE ${tableOf(kind)} SET name = ? WHERE id = ?`).run(name, id)
  return getNamed(db, kind, id)
}

export function archiveNamed(
  db: Database.Database,
  kind: NamedKind,
  id: number,
): NamedRow | undefined {
  const existing = getNamed(db, kind, id)
  if (!existing) return undefined
  if (existing.archivedAt) return existing
  const now = new Date().toISOString()
  db.prepare(`UPDATE ${tableOf(kind)} SET archived_at = ? WHERE id = ? AND archived_at IS NULL`).run(
    now,
    id,
  )
  return getNamed(db, kind, id)
}

/** Live packs table is Story 2.4; until then this is always zero. */
export function livePackReferenceCount(
  db: Database.Database,
  kind: NamedKind,
  id: number,
): number {
  const packs = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'packs'")
    .get() as { ok: number } | undefined
  if (!packs) return 0
  const column = kind === 'school' ? 'school_id' : 'grade_id'
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM packs WHERE ${column} = ? AND archived_at IS NULL`)
    .get(id) as { n: number }
  return row.n
}

export function deleteNamed(
  db: Database.Database,
  kind: NamedKind,
  id: number,
): 'missing' | 'in_use' | 'deleted' {
  const existing = getNamed(db, kind, id)
  if (!existing) return 'missing'
  if (livePackReferenceCount(db, kind, id) > 0) return 'in_use'
  db.prepare(`DELETE FROM ${tableOf(kind)} WHERE id = ?`).run(id)
  return 'deleted'
}
