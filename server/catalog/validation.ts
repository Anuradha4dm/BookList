export type FieldError = {
  field: string
  message: string
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: FieldError }

/** Required trimmed name. A non-string is refused, never coerced. */
export function validateName(value: unknown, label: string, field = 'name'): Validated<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: { field, message: `Enter a ${label} name.` } }
  }
  return { ok: true, value: value.trim() }
}

/** Required trimmed title. A non-string is refused, never coerced. */
export function validateTitle(value: unknown, label = 'book', field = 'title'): Validated<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: { field, message: `Enter a ${label} title.` } }
  }
  return { ok: true, value: value.trim() }
}

/** Integer rupees, at least 1. Strings and floats are refused, never coerced. */
export function validatePrice(value: unknown, field = 'price'): Validated<number> {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    return {
      ok: false,
      error: { field, message: 'Enter a price in whole rupees, at least Rs. 1.' },
    }
  }
  return { ok: true, value }
}
