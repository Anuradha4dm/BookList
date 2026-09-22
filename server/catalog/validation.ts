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

/** Required trimmed description. A non-string is refused, never coerced. */
export function validateDescription(value: unknown, field = 'description'): Validated<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: { field, message: 'Enter a description.' } }
  }
  return { ok: true, value: value.trim() }
}

/** Non-empty unique array of integer ids. Duplicates and non-integers are refused. */
export function validateBookIds(value: unknown, field = 'bookIds'): Validated<number[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: { field, message: 'Choose at least one book.' } }
  }
  const ids: number[] = []
  const seen = new Set<number>()
  for (const item of value) {
    if (
      typeof item !== 'number' ||
      !Number.isInteger(item) ||
      !Number.isSafeInteger(item) ||
      item < 1
    ) {
      return { ok: false, error: { field, message: 'Choose books from the book master.' } }
    }
    if (seen.has(item)) {
      return { ok: false, error: { field, message: 'Choose each book only once.' } }
    }
    seen.add(item)
    ids.push(item)
  }
  return { ok: true, value: ids }
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
