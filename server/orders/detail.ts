import type Database from 'better-sqlite3'
import { ORDER_PLACED } from './place.js'

export const ORDER_CANCELLED = 'Cancelled'
export const ORDER_DELIVERED = 'Delivered'

export const ORDER_NOT_FOUND_MESSAGE = 'Order not found.'
export const CONFIRMED_BEFORE_CANCEL_MESSAGE =
  'The shop confirmed this order before your cancel arrived, so it can no longer be cancelled here.'
export const ALREADY_CANCELLED_MESSAGE = 'This order is already cancelled.'
export const ALREADY_DELIVERED_MESSAGE = 'This order has already been delivered.'

export type OrderCancellation = {
  by: 'parent' | 'admin'
  reason: string | null
  at: string | null
}

export type OrderPackLineBook = {
  title: string
  unitPrice: number
  quantity: number
}

export type OrderPackLine = {
  packName: string
  label: string
  gradeName: string
  lineTotal: number
  books: OrderPackLineBook[]
}

export type OrderItemLine = {
  title: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

/** The snapshot a parent sees when an order is opened; read from the orders tables only. */
export type OrderDetail = {
  id: number
  publicNumber: number
  status: string
  placedAt: string
  goodsTotal: number
  deliveryPrice: number | null
  payableTotal: number | null
  note: string | null
  deliveryAddress: string
  cancellation: OrderCancellation | null
  packLines: OrderPackLine[]
  itemLines: OrderItemLine[]
}

export type CancelResult =
  | { ok: true; order: OrderDetail }
  | { ok: false; status: 404; code: 'not_found'; message: string }
  | { ok: false; status: 409; code: 'order_not_cancellable'; message: string }

/** The `orders` columns every detail read selects; see `DETAIL_COLUMNS`. */
export type DetailSqlRow = {
  id: number
  public_number: number
  status: string
  placed_at: string
  goods_total_rupees: number
  delivery_price_rupees: number | null
  payable_total_rupees: number | null
  parent_delivery_note: string | null
  delivery_address: string
  cancellation_reason: string | null
  cancelled_by: string | null
  cancelled_at: string | null
}

type PackLineSqlRow = {
  id: number
  pack_name: string
  label: string
  grade_name: string
  line_total_rupees: number
}

type BookSqlRow = {
  line_id: number
  title: string
  unit_price_rupees: number
  quantity: number
}

type ItemLineSqlRow = {
  title: string
  unit_price_rupees: number
  quantity: number
  line_total_rupees: number
}

/** The `orders` columns `toDetail` needs, in `DetailSqlRow` order. */
export const DETAIL_COLUMNS = `id, public_number, status, placed_at, goods_total_rupees,
              delivery_price_rupees, payable_total_rupees, parent_delivery_note, delivery_address,
              cancellation_reason, cancelled_by, cancelled_at`

function findOwnedOrder(
  db: Database.Database,
  parentId: number,
  orderId: number,
): DetailSqlRow | undefined {
  return db
    .prepare(
      `SELECT ${DETAIL_COLUMNS}
       FROM orders
       WHERE id = ? AND parent_id = ?`,
    )
    .get(orderId, parentId) as DetailSqlRow | undefined
}

function payableOf(row: DetailSqlRow): number | null {
  if (row.status === ORDER_CANCELLED) return null
  if (row.payable_total_rupees !== null) return row.payable_total_rupees
  if (row.delivery_price_rupees === null) return null
  return row.goods_total_rupees + row.delivery_price_rupees
}

function cancellationOf(row: DetailSqlRow): OrderCancellation | null {
  if (row.status !== ORDER_CANCELLED) return null
  // Only the parent or the shop can cancel; a row without a recorded party came from the shop.
  const by = row.cancelled_by === 'parent' ? 'parent' : 'admin'
  return {
    by,
    reason: by === 'admin' ? row.cancellation_reason : null,
    at: row.cancelled_at,
  }
}

/**
 * The snapshot detail of one order row: the row's own fields plus its three line reads.
 * Shared by the parent and the admin views so the line mapping lives in one place.
 */
export function toDetail(db: Database.Database, row: DetailSqlRow): OrderDetail {
  const packRows = db
    .prepare(
      `SELECT id, pack_name, label, grade_name, line_total_rupees
       FROM order_pack_lines
       WHERE order_id = ?
       ORDER BY position, id`,
    )
    .all(row.id) as PackLineSqlRow[]
  const bookRows = db
    .prepare(
      `SELECT b.line_id, b.title, b.unit_price_rupees, b.quantity
       FROM order_pack_line_books b
       JOIN order_pack_lines l ON l.id = b.line_id
       WHERE l.order_id = ?
       ORDER BY l.position, b.rowid`,
    )
    .all(row.id) as BookSqlRow[]
  const itemRows = db
    .prepare(
      `SELECT title, unit_price_rupees, quantity, line_total_rupees
       FROM order_item_lines
       WHERE order_id = ?
       ORDER BY position, id`,
    )
    .all(row.id) as ItemLineSqlRow[]

  const booksByLine = new Map<number, OrderPackLineBook[]>()
  for (const book of bookRows) {
    const list = booksByLine.get(book.line_id) ?? []
    list.push({ title: book.title, unitPrice: book.unit_price_rupees, quantity: book.quantity })
    booksByLine.set(book.line_id, list)
  }

  return {
    id: row.id,
    publicNumber: row.public_number,
    status: row.status,
    placedAt: row.placed_at,
    goodsTotal: row.goods_total_rupees,
    deliveryPrice: row.delivery_price_rupees,
    payableTotal: payableOf(row),
    note: row.parent_delivery_note,
    deliveryAddress: row.delivery_address,
    cancellation: cancellationOf(row),
    packLines: packRows.map((line) => ({
      packName: line.pack_name,
      label: line.label,
      gradeName: line.grade_name,
      lineTotal: line.line_total_rupees,
      books: booksByLine.get(line.id) ?? [],
    })),
    itemLines: itemRows.map((line) => ({
      title: line.title,
      unitPrice: line.unit_price_rupees,
      quantity: line.quantity,
      lineTotal: line.line_total_rupees,
    })),
  }
}

/** One of the parent's own orders, or undefined when it is missing or belongs to someone else. */
export function getParentOrder(
  db: Database.Database,
  parentId: number,
  orderId: number,
): OrderDetail | undefined {
  const row = findOwnedOrder(db, parentId, orderId)
  return row ? toDetail(db, row) : undefined
}

function notCancellableMessage(status: string): string {
  if (status === ORDER_CANCELLED) return ALREADY_CANCELLED_MESSAGE
  if (status === ORDER_DELIVERED) return ALREADY_DELIVERED_MESSAGE
  return CONFIRMED_BEFORE_CANCEL_MESSAGE
}

/**
 * Cancels the parent's order with a compare-and-set on `Order Is Placed`, so whichever write
 * commits first wins. When nothing changed the order is re-read to say why.
 */
export function cancelParentOrder(
  db: Database.Database,
  parentId: number,
  orderId: number,
): CancelResult {
  const cancel = db.transaction((): CancelResult => {
    const changed = db
      .prepare(
        `UPDATE orders
         SET status = ?, cancelled_by = 'parent', cancelled_at = ?, payable_total_rupees = NULL
         WHERE id = ? AND parent_id = ? AND status = ?`,
      )
      .run(ORDER_CANCELLED, new Date().toISOString(), orderId, parentId, ORDER_PLACED).changes

    const row = findOwnedOrder(db, parentId, orderId)
    if (!row) return { ok: false, status: 404, code: 'not_found', message: ORDER_NOT_FOUND_MESSAGE }
    if (changed === 0) {
      return {
        ok: false,
        status: 409,
        code: 'order_not_cancellable',
        message: notCancellableMessage(row.status),
      }
    }
    return { ok: true, order: toDetail(db, row) }
  })
  return cancel.immediate()
}
