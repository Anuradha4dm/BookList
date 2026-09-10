import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'

export const COOKIE_NAME = 'booklist.sid'
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60

export function isHttps(req: Request): boolean {
  if (req.protocol === 'https') return true
  const forwarded = req.headers['x-forwarded-proto']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (!raw) return false
  return raw.split(',')[0]?.trim() === 'https'
}

export function signSessionId(sessionId: string, secret: string): string {
  return createHmac('sha256', secret).update(sessionId).digest('base64url')
}

export function signedCookieValue(sessionId: string, secret: string): string {
  return `${sessionId}.${signSessionId(sessionId, secret)}`
}

export function sessionIdFromCookie(value: string, secret: string): string | null {
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const sessionId = value.slice(0, dot)
  const mac = value.slice(dot + 1)
  const expected = signSessionId(sessionId, secret)
  const actualBuf = Buffer.from(mac)
  const expectedBuf = Buffer.from(expected)
  if (actualBuf.length !== expectedBuf.length) return null
  if (!timingSafeEqual(actualBuf, expectedBuf)) return null
  return sessionId
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    if (trimmed.slice(0, eq) !== COOKIE_NAME) continue
    return trimmed.slice(eq + 1)
  }
  return undefined
}

function flags(secure: boolean, maxAge: number): string {
  const parts = [`Max-Age=${maxAge}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function setSessionCookie(res: Response, value: string, secure: boolean): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${value}; ${flags(secure, SESSION_MAX_AGE_SECONDS)}`)
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${flags(secure, 0)}`)
}
