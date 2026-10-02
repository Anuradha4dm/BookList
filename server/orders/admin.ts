import type Database from 'better-sqlite3'
import {
  DETAIL_COLUMNS,
  ORDER_CANCELLED,
  ORDER_DELIVERED,
  ORDER_NOT_FOUND_MESSAGE,
  toDetail,
  type DetailSqlRow,
  type OrderDetail,
} from './detail.js'
import { ORDER_PLACED } from './place.js'

export const ORDER_CONFIRMED = 'Order Confirmed'
export const ORDER_PROCESSING = 'Processing'
export const ORDER_PACKING = 'Packing The Order'
export const ORDER_READY = 'Ready To Deliver'
export const ORDER_ON_DELIVERY = 'On Delivery Partner'

/** Every stored status, in pipeline order with Cancelled last. */
export const ORDER_STATUSES: readonly string[] = [
  ORDER_PLACED,
  ORDER_CONFIRMED,
  ORDER_PROCESSING,
  ORDER_PACKING,
  ORDER_READY,
  ORDER_ON_DELIVERY,
  ORDER_DELIVERED,
  ORDER_CANCELLED,
]

/** Where `/status` may move an order: never back to Placed, never to Cancelled (that is `/cancel`). */
export const MOVE_TARGETS: readonly string[] = [
  ORDER_CONFIRMED,
  ORDER_PROCESSING,
  ORDER_PACKING,
  ORDER_READY,
  ORDER_ON_DELIVERY,
  ORDER_DELIVERED,
]

export const EXPECTED_STATUS_MESSAGE = 'Refresh the order and try again.'
export const MOVE_TARGET_MESSAGE = 'Choose a status to move this order to.'
export const REASON_MESSAGE = 'Write a short reason the parent will see, up to 500 characters.'
export const REASON_MAX_LENGTH = 500
export const CONFIRM_BEFORE_MOVE_MESSAGE = 'Confirm this order with a delivery charge before moving it on.'

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

export type TransitionResult =
  | { ok: true; order: AdminOrderDetail }
  | NotFound
  | { ok: false; status: 409; code: 'order_transition_not_allowed' | 'order_status_stale'; message: string }

function isFinal(status: string): boolean {
  return status === ORDER_DELIVERED || status === ORDER_CANCELLED
}

function notAllowed(message: string): TransitionResult {
  return { ok: false, status: 409, code: 'order_transition_not_allowed', message }
}

function staleResult(current: string): TransitionResult {
  return {
    ok: false,
    status: 409,
    code: 'order_status_stale',
    message: `This order changed to ${current} since you opened it, so nothing was changed. Check it and try again.`,
  }
}

/** The refusal for a move from `expected` to `to`, or undefined when the move is allowed. */
function moveBreach(expected: string, to: string): string | undefined {
  if (expected === ORDER_PLACED) return CONFIRM_BEFORE_MOVE_MESSAGE
  if (isFinal(expected)) return `This order is already ${expected}, which is final.`
  if (to === expected) return `This order is already ${expected}.`
  return undefined
}

function cancelBreach(expected: string): string | undefined {
  if (isFinal(expected)) return `This order is already ${expected}, which is final.`
  return undefined
}

/**
 * One compare-and-set transition on `expected`, for the caller to run as an immediate
 * transaction. The rules are checked on `expected`; a breach is only reported as not allowed when
 * the row really is at `expected`, otherwise the request was stale. A write that changes nothing
 * is re-read to say why.
 */
function transition(
  db: Database.Database,
  orderId: number,
  expected: string,
  breach: string | undefined,
  write: () => number,
): Database.Transaction<() => TransitionResult> {
  return db.transaction((): TransitionResult => {
    if (breach !== undefined) {
      const row = findAdminOrder(db, orderId)
      if (!row) return NOT_FOUND
      if (row.status !== expected) return staleResult(row.status)
      return notAllowed(breach)
    }
    const changed = write()
    const row = findAdminOrder(db, orderId)
    if (!row) return NOT_FOUND
    if (changed === 0) return staleResult(row.status)
    return { ok: true, order: toAdminDetail(db, row) }
  })
}

/**
 * Moves a confirmed order along the pipeline: forward with skips, backward down to Order
 * Confirmed, or on to Delivered. Delivery and payable totals are left as they are.
 */
export function moveOrderStatus(
  db: Database.Database,
  orderId: number,
  expected: string,
  to: string,
): TransitionResult {
  return transition(db, orderId, expected, moveBreach(expected, to), () =>
    db.prepare(`UPDATE orders SET status = ? WHERE id = ? AND status = ?`).run(to, orderId, expected).changes,
  ).immediate()
}

/**
 * The shop cancels any non-terminal order with a reason the parent sees. The payable total is
 * cleared (migration 010's trigger requires it); the delivery price is kept.
 */
export function cancelAdminOrder(
  db: Database.Database,
  orderId: number,
  expected: string,
  reason: string,
): TransitionResult {
  return transition(db, orderId, expected, cancelBreach(expected), () =>
    db
      .prepare(
        `UPDATE orders
         SET status = 'Cancelled', cancelled_by = 'admin', cancellation_reason = ?, cancelled_at = ?,
             payable_total_rupees = NULL
         WHERE id = ? AND status = ?`,
      )
      .run(reason, new Date().toISOString(), orderId, expected).changes,
  ).immediate()
}
