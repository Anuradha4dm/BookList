/** Shared failure shape and messages for in-cart edits (quantity changes and removals). */
export type CartEditFailure = {
  ok: false
  status: 400 | 404 | 409
  code: 'invalid_input' | 'not_found' | 'conflict'
  message: string
  field?: string
}

export const CART_LINE_NOT_FOUND_MESSAGE = 'That line is not in your cart.'
export const PACK_MEMBER_NOT_FOUND_MESSAGE = 'That title is not in this pack line.'
export const PRICE_CONFLICT_MESSAGE = 'That price changed again. Review this line.'

export function lineNotFound(): CartEditFailure {
  return { ok: false, status: 404, code: 'not_found', message: CART_LINE_NOT_FOUND_MESSAGE }
}

export function memberNotFound(): CartEditFailure {
  return { ok: false, status: 404, code: 'not_found', message: PACK_MEMBER_NOT_FOUND_MESSAGE }
}

/** The figure the parent accepted no longer matches live, or the line is not repriced at all. */
export function priceConflict(): CartEditFailure {
  return { ok: false, status: 409, code: 'conflict', message: PRICE_CONFLICT_MESSAGE }
}

/**
 * What checkout says about one line against the live catalog. Unavailable wins over repriced;
 * `lineTotal` on a repriced line is the total at live prices.
 */
export type LineStale = null | { kind: 'unavailable' } | { kind: 'repriced'; lineTotal: number }
