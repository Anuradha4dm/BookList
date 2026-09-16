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
