/** Shared failure shape and messages for in-cart edits (quantity changes and removals). */
export type CartEditFailure = {
  ok: false
  status: 400 | 404
  code: 'invalid_input' | 'not_found'
  message: string
  field?: string
}

export const CART_LINE_NOT_FOUND_MESSAGE = 'That line is not in your cart.'
export const PACK_MEMBER_NOT_FOUND_MESSAGE = 'That title is not in this pack line.'

export function lineNotFound(): CartEditFailure {
  return { ok: false, status: 404, code: 'not_found', message: CART_LINE_NOT_FOUND_MESSAGE }
}

export function memberNotFound(): CartEditFailure {
  return { ok: false, status: 404, code: 'not_found', message: PACK_MEMBER_NOT_FOUND_MESSAGE }
}
