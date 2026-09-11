import { normalizeEmail } from './seed.js'

export const PASSWORD_MIN_LENGTH = 6
export const PASSWORD_MAX_LENGTH = 128

export type FieldError = {
  field: string
  message: string
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: FieldError }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LOCAL_MOBILE_PATTERN = /^07\d{8}$/
const INTERNATIONAL_MOBILE_PATTERN = /^\+947\d{8}$/

function invalid(field: string, message: string): Validated<never> {
  return { ok: false, error: { field, message } }
}

function mobileShape(label: string): string {
  return `Enter your ${label} as 07XXXXXXXX or +947XXXXXXXX.`
}

/** Required free text — trimmed. A non-string is refused, never coerced. */
export function validateRequiredText(
  value: unknown,
  field: string,
  label: string,
): Validated<string> {
  if (typeof value !== 'string' || !value.trim()) return invalid(field, `Enter your ${label}.`)
  return { ok: true, value: value.trim() }
}

export function validateEmail(value: unknown, field = 'email'): Validated<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return invalid(field, 'Enter your email address.')
  }
  const trimmed = value.trim()
  if (!EMAIL_PATTERN.test(trimmed)) {
    return invalid(field, 'That email address does not look right. Check it and try again.')
  }
  return { ok: true, value: normalizeEmail(trimmed) }
}

export function validatePassword(value: unknown, field = 'password'): Validated<string> {
  if (typeof value !== 'string' || !value) return invalid(field, 'Enter a password.')
  if (value.length < PASSWORD_MIN_LENGTH) {
    return invalid(field, `Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`)
  }
  // Hashing is deliberately slow, so an unbounded password is an unauthenticated cost.
  if (value.length > PASSWORD_MAX_LENGTH) {
    return invalid(field, `Use a password of ${PASSWORD_MAX_LENGTH} characters or fewer.`)
  }
  return { ok: true, value }
}

/** `07XXXXXXXX` or `+947XXXXXXXX`, spaces and hyphens ignored, stored as `+947XXXXXXXX`. */
export function normalizeMobile(value: string): string | null {
  const compact = value.replace(/[\s-]/g, '')
  if (LOCAL_MOBILE_PATTERN.test(compact)) return `+94${compact.slice(1)}`
  if (INTERNATIONAL_MOBILE_PATTERN.test(compact)) return compact
  return null
}

export function validateMobile(value: unknown, field: string, label: string): Validated<string> {
  if (typeof value !== 'string' || !value.trim()) return invalid(field, `Enter your ${label}.`)
  const normalized = normalizeMobile(value.trim())
  if (!normalized) return invalid(field, mobileShape(label))
  return { ok: true, value: normalized }
}

/** Same rules as `validateMobile`, but an absent or empty value is allowed. */
export function validateOptionalMobile(
  value: unknown,
  field: string,
  label: string,
): Validated<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'string') {
    return invalid(field, `Enter the ${label} as 07XXXXXXXX or +947XXXXXXXX, or leave it empty.`)
  }
  if (!value.trim()) return { ok: true, value: null }
  const normalized = normalizeMobile(value.trim())
  if (!normalized) {
    return invalid(field, `Enter the ${label} as 07XXXXXXXX or +947XXXXXXXX, or leave it empty.`)
  }
  return { ok: true, value: normalized }
}
