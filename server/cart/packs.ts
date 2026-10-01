import type Database from 'better-sqlite3'
import {
  QUANTITY_MAX,
  QUANTITY_MIN,
  QUANTITY_RANGE_MESSAGE,
  configureBrowsePack,
  getBrowsePack,
  getBrowsePackGradeName,
} from '../catalog/packs.js'
import { lineNotFound, memberNotFound, type CartEditFailure } from './edits.js'
import { parseQuantity, type CartItemLineWithTotal } from './items.js'

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

/** A stored pack line with its add-time members and its goods total. */
export type CartPackLineWithTotal = CartPackLine & {
  lineTotal: number
}

const UNTICKED_MEMBER_MESSAGE =
  'Only ticked titles can change quantity. Remove the pack and add it again to change ticks.'

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

/** Goods total for a pack line: included members only, add-time prices only. */
export function packLineTotal(members: CartPackLineMember[]): number {
  let total = 0
  for (const member of members) {
    if (member.included) total += member.quantity * member.unitPrice
  }
  return total
}

/**
 * Cart goods total: Σ included pack members (qty × unitPrice) + Σ item lines (qty × unitPrice),
 * from add-time figures only.
 */
export function cartGoodsTotal(
  packLines: CartPackLineWithTotal[],
  itemLines: CartItemLineWithTotal[],
): number {
  let total = 0
  for (const line of packLines) total += line.lineTotal
  for (const line of itemLines) total += line.lineTotal
  return total
}

function withTotal(line: CartPackLine): CartPackLineWithTotal {
  return { ...line, lineTotal: packLineTotal(line.members) }
}

function ownedLineRow(
  db: Database.Database,
  parentId: number,
  lineId: number,
): LineSqlRow | undefined {
  return db
    .prepare(
      `SELECT id, pack_id, sequence, grade_name
       FROM cart_pack_lines
       WHERE id = ? AND parent_id = ?`,
    )
    .get(lineId, parentId) as LineSqlRow | undefined
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
export function listCartPackLines(
  db: Database.Database,
  parentId: number,
): CartPackLineWithTotal[] {
  const rows = db
    .prepare(
      `SELECT id, pack_id, sequence, grade_name
       FROM cart_pack_lines
       WHERE parent_id = ?
       ORDER BY id`,
    )
    .all(parentId) as LineSqlRow[]
  return rows.map((row) => withTotal(toLine(row, membersForLine(db, row.id))))
}

type PackEditResult = { ok: true; line: CartPackLineWithTotal } | CartEditFailure

/**
 * Sets the quantity of one ticked member on the parent's own pack line.
 * Ticks never change here: an unticked member is refused, and 1 is the floor,
 * so the last ticked title stays locked.
 */
export function setPackMemberQuantity(
  db: Database.Database,
  parentId: number,
  lineId: number,
  bookId: number,
  quantityRaw: unknown,
): PackEditResult {
  const quantity = parseQuantity(quantityRaw)
  if (quantity === undefined || quantity < QUANTITY_MIN || quantity > QUANTITY_MAX) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_input',
      message: QUANTITY_RANGE_MESSAGE,
      field: 'quantity',
    }
  }

  return db.transaction((): PackEditResult => {
    const row = ownedLineRow(db, parentId, lineId)
    if (!row) {
      return lineNotFound()
    }
    const member = db
      .prepare(
        `SELECT included
         FROM cart_pack_line_members
         WHERE line_id = ? AND book_id = ?`,
      )
      .get(lineId, bookId) as { included: number } | undefined
    if (!member) {
      return memberNotFound()
    }
    if (member.included !== 1) {
      return {
        ok: false,
        status: 400,
        code: 'invalid_input',
        message: UNTICKED_MEMBER_MESSAGE,
        field: 'bookId',
      }
    }
    db.prepare(
      `UPDATE cart_pack_line_members SET quantity = ?
       WHERE line_id = ? AND book_id = ? AND included = 1`,
    ).run(quantity, lineId, bookId)
    return { ok: true, line: withTotal(toLine(row, membersForLine(db, lineId))) }
  })()
}

/** Deletes the parent's own pack line and its members. Other lines keep their labels. */
export function removeCartPackLine(
  db: Database.Database,
  parentId: number,
  lineId: number,
): { ok: true } | CartEditFailure {
  return db.transaction((): { ok: true } | CartEditFailure => {
    const row = ownedLineRow(db, parentId, lineId)
    if (!row) {
      return lineNotFound()
    }
    // Members also cascade on delete; removing them first keeps this safe without the pragma.
    db.prepare('DELETE FROM cart_pack_line_members WHERE line_id = ?').run(lineId)
    db.prepare('DELETE FROM cart_pack_lines WHERE id = ? AND parent_id = ?').run(lineId, parentId)
    return { ok: true }
  })()
}
