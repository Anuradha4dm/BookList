import type Database from 'better-sqlite3'
import {
  DETAIL_COLUMNS,
  ORDER_CANCELLED,
  ORDER_NOT_FOUND_MESSAGE,
  toDetail,
  type DetailSqlRow,
  type OrderDetail,
} from './detail.js'
import { ORDER_PLACED } from './place.js'

export const ORDER_CONFIRMED = 'Order Confirmed'

export const DELIVERY_PRICE_MESSAGE = 'Enter the delivery charge in whole rupees, Rs. 0 or more.'
export const NOT_CALLABLE_MESSAGE = 'This order is no longer waiting for a call.'
export const CANCELLED_BEFORE_CONFIRM_MESSAGE =
  "The parent cancelled this order before your confirm arrived, so it can't be confirmed."

/** One row of the admin Orders list; contacts come from the order's own snapshot. */
export type AdminOrderSummary = {
  id: number
  publicNumber: number
  status: string
  placedAt: string
  parentName: string
  whatsapp: string
  goodsTotal: number
  lineCount: number
  linesSummary: string
  callAttemptedAt: string | null
}

type AdminOrderSqlRow = {
  id: number
  public_number: number
  status: string
  placed_at: string
  parent_name: string
  whatsapp: string
  goods_total_rupees: number
  call_attempted_at: string | null
}

type LineNameRow = {
  order_id: number
  position: number
  name: string
}

/**
 * Every order, newest first, read from the orders tables only: one orders query plus one read
 * per line table, so the list never queries per order. Pack names come first, then item titles,
 * each in `position` order.
 */
export function listAdminOrders(db: Database.Database): AdminOrderSummary[] {
  const rows = db
    .prepare(
      `SELECT id, public_number, status, placed_at, parent_name, whatsapp,
              goods_total_rupees, call_attempted_at
       FROM orders
       ORDER BY id DESC`,
    )
    .all() as AdminOrderSqlRow[]

  const packNames = db
    .prepare(
      `SELECT order_id, position, pack_name AS name
       FROM order_pack_lines
       ORDER BY order_id, position, id`,
    )
    .all() as LineNameRow[]
  const itemTitles = db
    .prepare(
      `SELECT order_id, position, title AS name
       FROM order_item_lines
       ORDER BY order_id, position, id`,
    )
    .all() as LineNameRow[]

  const namesByOrder = new Map<number, string[]>()
  for (const line of [...packNames, ...itemTitles]) {
    const names = namesByOrder.get(line.order_id)
    if (names) names.push(line.name)
    else namesByOrder.set(line.order_id, [line.name])
  }

  return rows.map((row) => {
    const names = namesByOrder.get(row.id) ?? []
    return {
      id: row.id,
      publicNumber: row.public_number,
      status: row.status,
      placedAt: row.placed_at,
      parentName: row.parent_name,
      whatsapp: row.whatsapp,
      goodsTotal: row.goods_total_rupees,
      lineCount: names.length,
      linesSummary: names.join(', '),
      callAttemptedAt: row.call_attempted_at,
    }
  })
}

/** The parent's 4.3 detail plus the contacts and call state the shop works from, all snapshot. */
export type AdminOrderDetail = OrderDetail & {
  parentName: string
  whatsapp: string
  secondPhone: string | null
  callAttemptedAt: string | null
}

type AdminDetailSqlRow = DetailSqlRow & {
  parent_name: string
  whatsapp: string
  second_phone: string | null
  call_attempted_at: string | null
}

type NotFound = { ok: false; status: 404; code: 'not_found'; message: string }

const NOT_FOUND: NotFound = {
  ok: false,
  status: 404,
  code: 'not_found',
  message: ORDER_NOT_FOUND_MESSAGE,
}

export type CallAttemptResult =
  | { ok: true; order: AdminOrderDetail }
  | NotFound
  | { ok: false; status: 409; code: 'order_not_callable'; message: string }

export type ConfirmResult =
  | { ok: true; order: AdminOrderDetail }
  | NotFound
  | { ok: false; status: 409; code: 'order_not_confirmable'; message: string }
  | { ok: false; status: 400; code: 'invalid_input'; field: 'deliveryPrice'; message: string }

function findAdminOrder(db: Database.Database, orderId: number): AdminDetailSqlRow | undefined {
  return db
    .prepare(
      `SELECT ${DETAIL_COLUMNS},
              parent_name, whatsapp, second_phone, call_attempted_at
       FROM orders
       WHERE id = ?`,
    )
    .get(orderId) as AdminDetailSqlRow | undefined
}

function toAdminDetail(db: Database.Database, row: AdminDetailSqlRow): AdminOrderDetail {
  return {
    ...toDetail(db, row),
    parentName: row.parent_name,
    whatsapp: row.whatsapp,
    secondPhone: row.second_phone,
    callAttemptedAt: row.call_attempted_at,
  }
}

/** Any order by id, for the shop; undefined when there is no such order. */
export function getAdminOrder(db: Database.Database, orderId: number): AdminOrderDetail | undefined {
  const row = findAdminOrder(db, orderId)
  return row ? toAdminDetail(db, row) : undefined
}

/**
 * Records that the shop just tried to call, with a compare-and-set on `Order Is Placed`.
 * A repeat overwrites the time with the latest attempt.
 */
export function markCallAttempted(db: Database.Database, orderId: number): CallAttemptResult {
  const mark = db.transaction((): CallAttemptResult => {
    const changed = db
      .prepare(`UPDATE orders SET call_attempted_at = ? WHERE id = ? AND status = ?`)
      .run(new Date().toISOString(), orderId, ORDER_PLACED).changes

    const row = findAdminOrder(db, orderId)
    if (!row) return NOT_FOUND
    if (changed === 0) {
      return { ok: false, status: 409, code: 'order_not_callable', message: NOT_CALLABLE_MESSAGE }
    }
    return { ok: true, order: toAdminDetail(db, row) }
  })
  return mark.immediate()
}

function notConfirmableMessage(status: string): string {
  if (status === ORDER_CANCELLED) return CANCELLED_BEFORE_CONFIRM_MESSAGE
  return `This order is already ${status}, so it can't be confirmed again.`
}

/**
 * Confirms a placed order with its delivery price in one immediate transaction: a
 * compare-and-set on `Order Is Placed` that also writes the payable total, computed in SQL from
 * the stored goods total. Whichever of this and a parent cancel commits first wins.
 */
export function confirmOrder(
  db: Database.Database,
  orderId: number,
  deliveryPrice: number,
): ConfirmResult {
  const confirm = db.transaction((): ConfirmResult => {
    const changed = db
      .prepare(
        `UPDATE orders
         SET status = ?, delivery_price_rupees = ?, payable_total_rupees = goods_total_rupees + ?
         WHERE id = ? AND status = ? AND goods_total_rupees + ? <= ?`,
      )
      .run(
        ORDER_CONFIRMED,
        deliveryPrice,
        deliveryPrice,
        orderId,
        ORDER_PLACED,
        deliveryPrice,
        Number.MAX_SAFE_INTEGER,
      ).changes

    const row = findAdminOrder(db, orderId)
    if (!row) return NOT_FOUND
    if (changed === 0 && row.status === ORDER_PLACED) {
      // Still placed, so the only refusal left is a payable total past the safe-integer range.
      return {
        ok: false,
        status: 400,
        code: 'invalid_input',
        field: 'deliveryPrice',
        message: DELIVERY_PRICE_MESSAGE,
      }
    }
    if (changed === 0) {
      return {
        ok: false,
        status: 409,
        code: 'order_not_confirmable',
        message: notConfirmableMessage(row.status),
      }
    }
    return { ok: true, order: toAdminDetail(db, row) }
  })
  return confirm.immediate()
}
