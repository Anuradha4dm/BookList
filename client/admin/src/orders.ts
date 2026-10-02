import {
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
