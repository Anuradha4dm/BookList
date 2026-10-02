import type Database from 'better-sqlite3'

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
