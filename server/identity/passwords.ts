import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 32
const SALT_BYTES = 16
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RECOVERY_CHARS = 16

export const RECOVERY_LOG_PREFIX = 'Admin recovery code (single-use):'

function scryptWithParams(
  secret: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(secret, salt, KEY_LENGTH, { N, r, p }, (error, derived) => {
      if (error) {
        reject(error)
        return
      }
      resolve(derived)
    })
  })
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const derived = await scryptWithParams(secret, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

const dummyHashPromise = hashSecret('timing-dummy')

export async function dummyPasswordHash(): Promise<string> {
  return dummyHashPromise
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts[0] !== 'scrypt' || parts.length !== 6) return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = parts[4]
  const expected = parts[5]
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || !salt || !expected) {
    return false
  }
  const derived = await scryptWithParams(secret, Buffer.from(salt, 'base64url'), N, r, p)
  const expectedBuf = Buffer.from(expected, 'base64url')
  if (derived.length !== expectedBuf.length) return false
  return timingSafeEqual(derived, expectedBuf)
}

export function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_CHARS)
  let chars = ''
  for (const byte of bytes) {
    chars += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]
  }
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`
}

export function normalizeRecoveryCode(code: string): string {
  const compact = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.length !== RECOVERY_CHARS) return code.trim()
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}`
}

export function printRecoveryCode(code: string): void {
  console.log(`${RECOVERY_LOG_PREFIX} ${code}`)
}
