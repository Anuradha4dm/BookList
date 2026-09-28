import type Database from 'better-sqlite3'
import { getLiveItem } from '../catalog/items.js'
import {
  QUANTITY_MAX,
  QUANTITY_MIN,
  QUANTITY_RANGE_MESSAGE,
} from '../catalog/packs.js'

export type CartItemLine = {
  id: number
  itemId: number
  quantity: number
  title: string
  unitPrice: number
}

type SqlRow = {
  id: number
  item_id: number
  quantity: number
  title: string
  unit_price: number
}

export type AddItemFailure = {
  ok: false
  status: 400 | 404
  code: 'invalid_input' | 'not_found'
  message: string
  field?: string
}

export type AddItemSuccess = {
  ok: true
  created: boolean
  line: CartItemLine
}

function toLine(row: SqlRow): CartItemLine {
  return {
    id: row.id,
    itemId: row.item_id,
    quantity: row.quantity,
    title: row.title,
    unitPrice: row.unit_price,
  }
}

function parseQuantity(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const quantity = Number(value)
    if (Number.isSafeInteger(quantity)) return quantity
  }
  return undefined
}

/**
 * Adds quantity for the session parent. First insert clones title and unit price.
 * A later add merges onto the same line and does not rewrite title or price.
 */
export function addCartItem(
  db: Database.Database,
  parentId: number,
  itemId: number,
  quantityRaw: unknown,
): AddItemSuccess | AddItemFailure {
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

  const live = getLiveItem(db, itemId)
  if (!live) {
    return {
      ok: false,
      status: 404,
      code: 'not_found',
      message: 'That item is not on the list.',
    }
  }

  const result = db.transaction(() => {
    const existing = db
      .prepare(
        `SELECT id, item_id, quantity, title, unit_price
         FROM cart_item_lines
         WHERE parent_id = ? AND item_id = ?`,
      )
      .get(parentId, itemId) as SqlRow | undefined

    if (existing) {
      const nextQuantity = existing.quantity + quantity
      if (nextQuantity > QUANTITY_MAX) {
        return {
          ok: false as const,
          status: 400 as const,
          code: 'invalid_input' as const,
          message: QUANTITY_RANGE_MESSAGE,
          field: 'quantity',
        }
      }
      db.prepare('UPDATE cart_item_lines SET quantity = ? WHERE id = ?').run(
        nextQuantity,
        existing.id,
      )
      const row = db
        .prepare(
          `SELECT id, item_id, quantity, title, unit_price
           FROM cart_item_lines
           WHERE id = ?`,
        )
        .get(existing.id) as SqlRow
      return { ok: true as const, created: false, line: toLine(row) }
    }

    const now = new Date().toISOString()
    const inserted = db
      .prepare(
        `INSERT INTO cart_item_lines (parent_id, item_id, quantity, title, unit_price, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(parentId, itemId, quantity, live.title, live.price, now)
    const row = db
      .prepare(
        `SELECT id, item_id, quantity, title, unit_price
         FROM cart_item_lines
         WHERE id = ?`,
      )
      .get(Number(inserted.lastInsertRowid)) as SqlRow
    return { ok: true as const, created: true, line: toLine(row) }
  })()

  return result
}

/** Cart tables only — no live catalog joins. */
export function listCartItemLines(db: Database.Database, parentId: number): CartItemLine[] {
  const rows = db
    .prepare(
      `SELECT id, item_id, quantity, title, unit_price
       FROM cart_item_lines
       WHERE parent_id = ?
       ORDER BY id`,
    )
    .all(parentId) as SqlRow[]
  return rows.map(toLine)
}
