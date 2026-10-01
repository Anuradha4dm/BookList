import type Database from 'better-sqlite3'
import {
  cartGoodsTotal,
  checkoutBlock,
  emptyCart,
  listCartItemLines,
  listCartPackLines,
} from '../cart/index.js'
import { getBrowsePack } from '../catalog/packs.js'
import { findParentById } from '../identity/index.js'

export const ORDER_PLACED = 'Order Is Placed'

/** The order fields every list and Place answer carries. */
export type OrderSummary = {
  id: number
  publicNumber: number
  status: string
  goodsTotal: number
  placedAt: string
}

export type PlaceFailure = {
  ok: false
  status: 409
  code: 'checkout_blocked' | 'cart_empty'
  message: string
}

export type PlaceSuccess = {
  ok: true
  order: OrderSummary
  /** True when the key had already placed an order; nothing was written this time. */
  replayed: boolean
}

const FIRST_PUBLIC_NUMBER = 1001
export const CART_EMPTY_MESSAGE = 'Your cart is empty.'

export function blockedMessage(count: number): string {
  return count === 1
    ? '1 line still needs attention.'
    : `${count} lines still need attention.`
}

type OrderSqlRow = {
  id: number
  public_number: number
  status: string
  goods_total_rupees: number
  placed_at: string
}

const SUMMARY_COLUMNS = 'id, public_number, status, goods_total_rupees, placed_at'

function toSummary(row: OrderSqlRow): OrderSummary {
  return {
    id: row.id,
    publicNumber: row.public_number,
    status: row.status,
    goodsTotal: row.goods_total_rupees,
    placedAt: row.placed_at,
  }
}

function findByKey(
  db: Database.Database,
  parentId: number,
  key: string,
): OrderSqlRow | undefined {
  return db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
       FROM orders
       WHERE parent_id = ? AND idempotency_key = ?`,
    )
    .get(parentId, key) as OrderSqlRow | undefined
}

function nextPublicNumber(db: Database.Database): number {
  const row = db
    .prepare('SELECT MAX(public_number) AS max_number FROM orders')
    .get() as { max_number: number | null }
  return row.max_number === null ? FIRST_PUBLIC_NUMBER : row.max_number + 1
}

/**
 * Places the parent's cart as one order, all in one transaction: replay lookup, the staleness
 * guard, the snapshot of lines and account contacts, the next public number, and emptying the
 * cart. Any throw rolls the whole Place back, so no half-placed order can remain.
 */
export function placeOrder(
  db: Database.Database,
  parentId: number,
  idempotencyKey: string,
  note: string | null,
): PlaceSuccess | PlaceFailure {
  const place = db.transaction((): PlaceSuccess | PlaceFailure => {
    const existing = findByKey(db, parentId, idempotencyKey)
    if (existing) return { ok: true, order: toSummary(existing), replayed: true }

    const { attentionCount } = checkoutBlock(db, parentId)
    if (attentionCount > 0) {
      return {
        ok: false,
        status: 409,
        code: 'checkout_blocked',
        message: blockedMessage(attentionCount),
      }
    }

    const packLines = listCartPackLines(db, parentId)
    const itemLines = listCartItemLines(db, parentId)
    if (packLines.length === 0 && itemLines.length === 0) {
      return { ok: false, status: 409, code: 'cart_empty', message: CART_EMPTY_MESSAGE }
    }

    // Resolve every pack name before writing anything. Staleness has just passed, so each pack
    // should be live; one that is not is refused as blocked, with nothing written.
    const packNames: string[] = []
    let offList = 0
    for (const line of packLines) {
      const pack = getBrowsePack(db, line.packId)
      if (pack) packNames.push(pack.name)
      else offList += 1
    }
    if (offList > 0) {
      return { ok: false, status: 409, code: 'checkout_blocked', message: blockedMessage(offList) }
    }

    const parent = findParentById(db, parentId)
    if (!parent) throw new Error(`parent ${parentId} is missing`)

    const placedAt = new Date().toISOString()
    const publicNumber = nextPublicNumber(db)
    const inserted = db
      .prepare(
        `INSERT INTO orders (
           parent_id, public_number, idempotency_key, status,
           parent_name, delivery_address, whatsapp, second_phone, parent_delivery_note,
           goods_total_rupees, placed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        parentId,
        publicNumber,
        idempotencyKey,
        ORDER_PLACED,
        parent.name,
        parent.delivery_address,
        parent.whatsapp,
        parent.second_phone,
        note,
        cartGoodsTotal(packLines, itemLines),
        placedAt,
      )
    const orderId = Number(inserted.lastInsertRowid)

    const insertPackLine = db.prepare(
      `INSERT INTO order_pack_lines (
         order_id, position, pack_id, pack_name, label, grade_name, line_total_rupees
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertBook = db.prepare(
      `INSERT INTO order_pack_line_books (line_id, book_id, title, unit_price_rupees, quantity)
       VALUES (?, ?, ?, ?, ?)`,
    )
    const insertItemLine = db.prepare(
      `INSERT INTO order_item_lines (
         order_id, position, item_id, title, unit_price_rupees, quantity, line_total_rupees
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )

    let position = 0
    for (const [index, line] of packLines.entries()) {
      position += 1
      const lineRow = insertPackLine.run(
        orderId,
        position,
        line.packId,
        packNames[index],
        line.label,
        line.gradeName,
        line.lineTotal,
      )
      const lineId = Number(lineRow.lastInsertRowid)
      for (const member of line.members) {
        if (!member.included) continue
        insertBook.run(lineId, member.bookId, member.title, member.unitPrice, member.quantity)
      }
    }
    for (const line of itemLines) {
      position += 1
      insertItemLine.run(
        orderId,
        position,
        line.itemId,
        line.title,
        line.unitPrice,
        line.quantity,
        line.lineTotal,
      )
    }

    emptyCart(db, parentId)

    const row = db
      .prepare(`SELECT ${SUMMARY_COLUMNS} FROM orders WHERE id = ?`)
      .get(orderId) as OrderSqlRow
    return { ok: true, order: toSummary(row), replayed: false }
  })
  return place.immediate()
}

/** The parent's own orders, newest first. */
export function listParentOrders(db: Database.Database, parentId: number): OrderSummary[] {
  const rows = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
       FROM orders
       WHERE parent_id = ?
       ORDER BY id DESC`,
    )
    .all(parentId) as OrderSqlRow[]
  return rows.map(toSummary)
}
