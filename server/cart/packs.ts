import type Database from 'better-sqlite3'
import {
  QUANTITY_MIN,
  configureBrowsePack,
  getBrowsePack,
  getBrowsePackGradeName,
} from '../catalog/packs.js'

export type CartPackLineMember = {
  bookId: number
  included: boolean
  quantity: number
  title: string
  unitPrice: number
}

export type CartPackLine = {
  id: number
  packId: number
  sequence: number
  gradeName: string
  label: string
  members: CartPackLineMember[]
}

export type CartPackLineSummary = {
  id: number
  packId: number
  sequence: number
  gradeName: string
  label: string
}

type LineSqlRow = {
  id: number
  pack_id: number
  sequence: number
  grade_name: string
}

type MemberSqlRow = {
  book_id: number
  included: number
  quantity: number
  title: string
  unit_price: number
}

export type AddPackFailure = {
  ok: false
  status: 400 | 404
  code: 'invalid_input' | 'not_found'
  message: string
  field?: string
}

export type AddPackSuccess = {
  ok: true
  line: CartPackLine
}

function packLabel(sequence: number, gradeName: string): string {
  return `Pack ${sequence} of ${gradeName}`
}

function toMember(row: MemberSqlRow): CartPackLineMember {
  return {
    bookId: row.book_id,
    included: row.included === 1,
    quantity: row.quantity,
    title: row.title,
    unitPrice: row.unit_price,
  }
}

function membersForLine(db: Database.Database, lineId: number): CartPackLineMember[] {
  const rows = db
    .prepare(
      `SELECT book_id, included, quantity, title, unit_price
       FROM cart_pack_line_members
       WHERE line_id = ?
       ORDER BY book_id`,
    )
    .all(lineId) as MemberSqlRow[]
  return rows.map(toMember)
}

function toLine(row: LineSqlRow, members: CartPackLineMember[]): CartPackLine {
  return {
    id: row.id,
    packId: row.pack_id,
    sequence: row.sequence,
    gradeName: row.grade_name,
    label: packLabel(row.sequence, row.grade_name),
    members,
  }
}

function toSummary(row: LineSqlRow): CartPackLineSummary {
  return {
    id: row.id,
    packId: row.pack_id,
    sequence: row.sequence,
    gradeName: row.grade_name,
    label: packLabel(row.sequence, row.grade_name),
  }
}

function nextSequence(db: Database.Database, parentId: number, packId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(sequence), 0) AS max_sequence
       FROM cart_pack_lines
       WHERE parent_id = ? AND pack_id = ?`,
    )
    .get(parentId, packId) as { max_sequence: number }
  return row.max_sequence + 1
}

/**
 * Clones a live browse configuration onto the parent's cart.
 * Every live member is stored; only ticked titles are `included`.
 */
export function addConfiguredPack(
  db: Database.Database,
  parentId: number,
  packId: number,
  selection: unknown,
): AddPackSuccess | AddPackFailure {
  const pack = getBrowsePack(db, packId)
  const gradeName = getBrowsePackGradeName(db, packId)
  if (!pack || gradeName === undefined) {
    return {
      ok: false,
      status: 404,
      code: 'not_found',
      message: 'That pack is not on the list.',
    }
  }

  const configured = configureBrowsePack(pack, selection)
  if (!configured.ok) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_input',
      message: configured.error.message,
      field: configured.error.field,
    }
  }

  const includedByBook = new Map(
    configured.value.lines.map((line) => [line.bookId, line] as const),
  )

  const created = db.transaction(() => {
    const sequence = nextSequence(db, parentId, packId)
    const now = new Date().toISOString()
    const inserted = db
      .prepare(
        `INSERT INTO cart_pack_lines (parent_id, pack_id, sequence, grade_name, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(parentId, packId, sequence, gradeName, now)
    const lineId = Number(inserted.lastInsertRowid)
    const insertMember = db.prepare(
      `INSERT INTO cart_pack_line_members (line_id, book_id, included, quantity, title, unit_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const book of pack.books) {
      const line = includedByBook.get(book.id)
      insertMember.run(
        lineId,
        book.id,
        line ? 1 : 0,
        line ? line.quantity : QUANTITY_MIN,
        book.title,
        book.price,
      )
    }
    const row = db
      .prepare(
        `SELECT id, pack_id, sequence, grade_name
         FROM cart_pack_lines
         WHERE id = ?`,
      )
      .get(lineId) as LineSqlRow
    return toLine(row, membersForLine(db, lineId))
  })()

  return { ok: true, line: created }
}

/** Cart tables only — no live catalog joins. */
export function listCartPackLines(db: Database.Database, parentId: number): CartPackLineSummary[] {
  const rows = db
    .prepare(
      `SELECT id, pack_id, sequence, grade_name
       FROM cart_pack_lines
       WHERE parent_id = ?
       ORDER BY id`,
    )
    .all(parentId) as LineSqlRow[]
  return rows.map(toSummary)
}
