import type Database from 'better-sqlite3'
import type { LineStale } from './edits.js'
import { itemLineStale, listCartItemLines, type CartItemLineWithTotal } from './items.js'
import {
  cartGoodsTotal,
  listCartPackLines,
  packLineStale,
  type CartPackLineWithTotal,
} from './packs.js'

export type { LineStale } from './edits.js'

export type AnnotatedPackLine = CartPackLineWithTotal & { stale: LineStale }
export type AnnotatedItemLine = CartItemLineWithTotal & { stale: LineStale }

export type AnnotatedCart = {
  packLines: AnnotatedPackLine[]
  itemLines: AnnotatedItemLine[]
  /** Add-time goods total, exactly as `GET /cart` reports it. */
  goodsTotal: number
  /** Lines carrying any flag. */
  attentionCount: number
}

/**
 * The parent's cart annotated against the live catalog. Read-only: stored titles,
 * prices and totals are reported as stored, and nothing is written.
 */
export function annotateCart(db: Database.Database, parentId: number): AnnotatedCart {
  const packs = listCartPackLines(db, parentId)
  const items = listCartItemLines(db, parentId)
  const packLines = packs.map((line) => ({ ...line, stale: packLineStale(db, line) }))
  const itemLines = items.map((line) => ({ ...line, stale: itemLineStale(db, line) }))
  let attentionCount = 0
  for (const line of [...packLines, ...itemLines]) {
    if (line.stale !== null) attentionCount += 1
  }
  return {
    packLines,
    itemLines,
    goodsTotal: cartGoodsTotal(packs, items),
    attentionCount,
  }
}

/** Readiness guard for Place Order: refuse while `attentionCount` is above 0. */
export function checkoutBlock(
  db: Database.Database,
  parentId: number,
): { attentionCount: number } {
  return { attentionCount: annotateCart(db, parentId).attentionCount }
}
