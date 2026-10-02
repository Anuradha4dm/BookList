import {
  CANCELLED_STATUS,
  ORDER_STATUSES,
  PIPELINE_STAGES,
  isOrderStatus,
  type OrderStatus,
} from '@booklist/ui'

/** One row of `GET /api/admin/orders`. */
export type AdminOrder = {
  id: number
  publicNumber: number
  status: OrderStatus
  placedAt: string
  parentName: string
  whatsapp: string
  goodsTotal: number
  lineCount: number
  linesSummary: string
  callAttemptedAt: string | null
}

export type AdminOrderGroup = { status: OrderStatus; orders: AdminOrder[] }

export type AdminOrderSection = {
  key: 'open' | 'past'
  title: string
  emptyCopy: string
  groups: AdminOrderGroup[]
}

/** The first stage: the only status where the shop still owes the parent a call. */
export const NEEDS_CALL_STATUS: OrderStatus = ORDER_STATUSES[0]

/** The non-terminal statuses: every pipeline stage except the last (Delivered), in order. */
export const OPEN_STATUSES: readonly OrderStatus[] = PIPELINE_STAGES.slice(0, -1)

/** The two terminal statuses: the last stage, then Cancelled. */
export const PAST_STATUSES: readonly OrderStatus[] = ORDER_STATUSES.filter(
  (status) => !OPEN_STATUSES.includes(status),
)

/** The second stage: confirmed with a delivery charge, the floor for any backward move. */
export const CONFIRMED_STATUS: OrderStatus = ORDER_STATUSES[1]

/** The last pipeline stage; reaching it is final. */
export const DELIVERED_STATUS: OrderStatus = PIPELINE_STAGES[PIPELINE_STAGES.length - 1]

/**
 * The statuses the shop can move an order from, in pipeline order: Order Confirmed through the
 * stage before Delivered. They are also the `Move to` targets (Delivered has its own button).
 */
export const MOVABLE_FROM: readonly OrderStatus[] = PIPELINE_STAGES.slice(1, -1)

/** Delivered or Cancelled: nothing moves an order on from here. */
export function isTerminal(status: OrderStatus): boolean {
  return PAST_STATUSES.includes(status)
}

/** The polite announcement after a successful move, deliver or cancel. */
export function transitionAnnouncement(status: OrderStatus): string {
  if (status === DELIVERED_STATUS) return 'Marked delivered.'
  if (status === CANCELLED_STATUS) return 'Order cancelled.'
  return `Moved to ${status}.`
}

export function adminOrdersPath(): string {
  return '/api/admin/orders'
}

function isAdminOrder(value: unknown): value is AdminOrder {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'number' &&
    typeof row.publicNumber === 'number' &&
    typeof row.status === 'string' &&
    isOrderStatus(row.status) &&
    typeof row.placedAt === 'string' &&
    typeof row.parentName === 'string' &&
    typeof row.whatsapp === 'string' &&
    typeof row.goodsTotal === 'number' &&
    typeof row.lineCount === 'number' &&
    typeof row.linesSummary === 'string' &&
    (row.callAttemptedAt === null || typeof row.callAttemptedAt === 'string')
  )
}

/** The list from an answer body, or undefined when the body is not the expected shape. */
export function parseAdminOrders(body: unknown): AdminOrder[] | undefined {
  const orders = (body as { orders?: unknown } | null)?.orders
  if (!Array.isArray(orders) || !orders.every(isAdminOrder)) return undefined
  return orders
}

/** A copy of the search params with `status` set to the filter, or removed for All. */
export function withStatusFilter(
  params: URLSearchParams,
  status: OrderStatus | null,
): URLSearchParams {
  const next = new URLSearchParams(params)
  if (status === null) next.delete('status')
  else next.set('status', status)
  return next
}

/** The `?status=` value as a status; anything missing or unknown means All (null). */
export function statusFilterFrom(value: string | null | undefined): OrderStatus | null {
  return typeof value === 'string' && isOrderStatus(value) ? value : null
}

function groupsOf(
  orders: AdminOrder[],
  statuses: readonly OrderStatus[],
  oldestFirst: boolean,
): AdminOrderGroup[] {
  return statuses.flatMap((status) => {
    const rows = orders
      .filter((order) => order.status === status)
      .sort((a, b) => (oldestFirst ? a.id - b.id : b.id - a.id))
    return rows.length > 0 ? [{ status, orders: rows }] : []
  })
}

/**
 * Open and Past, each grouped by status in pipeline order with only the non-empty groups.
 * Open lists oldest first (the queue), Past newest first. A filter keeps only that status's rows.
 */
export function adminOrderSections(
  orders: AdminOrder[],
  filter: OrderStatus | null,
): AdminOrderSection[] {
  const visible = filter === null ? orders : orders.filter((order) => order.status === filter)
  return [
    {
      key: 'open',
      title: 'Open',
      emptyCopy: 'No open orders.',
      groups: groupsOf(visible, OPEN_STATUSES, true),
    },
    {
      key: 'past',
      title: 'Past',
      emptyCopy: 'No past orders.',
      groups: groupsOf(visible, PAST_STATUSES, false),
    },
  ]
}

export function isPastStatus(status: OrderStatus): boolean {
  return PAST_STATUSES.includes(status)
}

/** The client route of one order's detail, under the `/admin` basename. */
export function adminOrderRoute(id: number): string {
  return `/orders/${id}`
}

export function adminOrderPath(id: number): string {
  return `/api/admin/orders/${id}`
}

export function adminOrderCallAttemptedPath(id: number): string {
  return `/api/admin/orders/${id}/call-attempted`
}

export function adminOrderConfirmPath(id: number): string {
  return `/api/admin/orders/${id}/confirm`
}

export function adminOrderStatusPath(id: number): string {
  return `/api/admin/orders/${id}/status`
}

export function adminOrderCancelPath(id: number): string {
  return `/api/admin/orders/${id}/cancel`
}

export function moveBody(
  expectedStatus: OrderStatus,
  status: OrderStatus,
): { expectedStatus: OrderStatus; status: OrderStatus } {
  return { expectedStatus, status }
}

export function cancelBody(
  expectedStatus: OrderStatus,
  reason: string,
): { expectedStatus: OrderStatus; reason: string } {
  return { expectedStatus, reason }
}

/** The same copy the server answers for a missing, blank or too-long cancellation reason. */
export const REASON_MESSAGE = 'Write a short reason the parent will see, up to 500 characters.'
export const REASON_MAX_LENGTH = 500

/** The trimmed reason, or undefined when it is blank or longer than the server accepts. */
export function reasonFrom(text: string): string | undefined {
  const reason = text.trim()
  return reason.length >= 1 && reason.length <= REASON_MAX_LENGTH ? reason : undefined
}

/** The same copy the server answers for a bad delivery price. */
export const DELIVERY_PRICE_MESSAGE = 'Enter the delivery charge in whole rupees, Rs. 0 or more.'

/** Whole rupees from the field's digits, or undefined when it is empty or not a safe integer. */
export function deliveryPriceFrom(text: string): number | undefined {
  if (!/^\d+$/.test(text)) return undefined
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : undefined
}

export function confirmBody(deliveryPrice: number): { deliveryPrice: number } {
  return { deliveryPrice }
}

export type AdminOrderPackLine = {
  packName: string
  label: string
  gradeName: string
  lineTotal: number
  books: Array<{ title: string; unitPrice: number; quantity: number }>
}

export type AdminOrderItemLine = {
  title: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

/** `GET /api/admin/orders/:id`: the parent's detail plus snapshot contacts and the call mark. */
export type AdminOrderDetail = {
  id: number
  publicNumber: number
  status: OrderStatus
  placedAt: string
  goodsTotal: number
  deliveryPrice: number | null
  payableTotal: number | null
  note: string | null
  deliveryAddress: string
  cancellation: { by: 'parent' | 'admin'; reason: string | null; at: string | null } | null
  packLines: AdminOrderPackLine[]
  itemLines: AdminOrderItemLine[]
  parentName: string
  whatsapp: string
  secondPhone: string | null
  callAttemptedAt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || typeof value === 'number'
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function isPackBook(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.unitPrice === 'number' &&
    typeof value.quantity === 'number'
  )
}

function isPackLine(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.packName === 'string' &&
    typeof value.label === 'string' &&
    typeof value.gradeName === 'string' &&
    typeof value.lineTotal === 'number' &&
    Array.isArray(value.books) &&
    value.books.every(isPackBook)
  )
}

function isItemLine(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.unitPrice === 'number' &&
    typeof value.quantity === 'number' &&
    typeof value.lineTotal === 'number'
  )
}

function isCancellation(value: unknown): boolean {
  if (value === null) return true
  return (
    isRecord(value) &&
    (value.by === 'parent' || value.by === 'admin') &&
    isStringOrNull(value.reason) &&
    isStringOrNull(value.at)
  )
}

/**
 * Reads `{ order }` from a detail, call or confirm answer, down to every line and book, or
 * undefined when any part is not that shape (an unknown status included).
 */
export function parseAdminOrderDetail(body: unknown): AdminOrderDetail | undefined {
  const order = (body as { order?: unknown } | null)?.order
  if (!isRecord(order)) return undefined
  const o = order
  if (
    typeof o.id !== 'number' ||
    typeof o.publicNumber !== 'number' ||
    typeof o.status !== 'string' ||
    !isOrderStatus(o.status) ||
    typeof o.placedAt !== 'string' ||
    typeof o.goodsTotal !== 'number' ||
    !isNumberOrNull(o.deliveryPrice) ||
    !isNumberOrNull(o.payableTotal) ||
    !isStringOrNull(o.note) ||
    typeof o.deliveryAddress !== 'string' ||
    !isCancellation(o.cancellation) ||
    !Array.isArray(o.packLines) ||
    !o.packLines.every(isPackLine) ||
    !Array.isArray(o.itemLines) ||
    !o.itemLines.every(isItemLine) ||
    typeof o.parentName !== 'string' ||
    typeof o.whatsapp !== 'string' ||
    !isStringOrNull(o.secondPhone) ||
    !isStringOrNull(o.callAttemptedAt)
  ) {
    return undefined
  }
  return order as AdminOrderDetail
}
