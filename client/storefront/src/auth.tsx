import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type SessionStatus = 'checking' | 'out' | 'in'

export type RegisterInput = {
  name: string
  deliveryAddress: string
  whatsapp: string
  secondPhone: string
  email: string
  password: string
}

/** `field` names the control to flag, when the server could tell which one it was. */
export type SubmitFailure = {
  message: string
  field?: string
}

export type Session = {
  status: SessionStatus
  email: string
  /** Resolves to null on success, or to the refusal to show the parent. */
  logIn: (email: string, password: string) => Promise<SubmitFailure | null>
  register: (input: RegisterInput) => Promise<SubmitFailure | null>
  logOut: () => Promise<void>
  logoutError: string
}

type ApiError = {
  error?: { code?: string; message?: string; field?: string }
}

const UNREACHABLE = 'Could not reach the shop. Try again.'
const NOT_A_PARENT =
  'Those are shop owner details. Log in on the admin app instead.'

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const value = useContext(SessionContext)
  if (!value) {
    throw new Error('Session is missing')
  }
  return value
}

async function failure(response: Response, fallback: string): Promise<SubmitFailure> {
  const body = (await response.json().catch(() => null)) as ApiError | null
  const message = body?.error?.message
  return {
    message: typeof message === 'string' && message.trim() ? message : fallback,
    field: body?.error?.field,
  }
}

/**
 * The shop owner's credentials are accepted by `POST /api/session` too, and the server has
 * already set a cookie by the time we see the role. Drop it so neither app is left believing
 * it is signed out while a live session sits in the browser.
 */
async function discardSession(): Promise<void> {
  try {
    await fetch('/api/session', { method: 'DELETE', credentials: 'include' })
  } catch {
    // Nothing to tell the parent: the refusal below is the message that matters.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('checking')
  const [email, setEmail] = useState('')
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/session', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setStatus('out')
          return
        }
        const body = (await response.json()) as { role?: string; email?: string }
        if (body.role !== 'parent') {
          setStatus('out')
          return
        }
        setEmail(body.email ?? '')
        setStatus('in')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('out')
      })
    return () => controller.abort()
  }, [])

  function signedIn(nextEmail: string): void {
    setEmail(nextEmail)
    setLogoutError('')
    setStatus('in')
  }

  async function logIn(nextEmail: string, password: string): Promise<SubmitFailure | null> {
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: nextEmail, password }),
      })
      if (!response.ok) {
        return await failure(
          response,
          'That email or password is not right. Check them and try again.',
        )
      }
      const body = (await response.json()) as { role?: string; email?: string }
      if (body.role !== 'parent') {
        await discardSession()
        return { message: NOT_A_PARENT, field: 'email' }
      }
      signedIn(body.email ?? nextEmail)
      return null
    } catch {
      return { message: UNREACHABLE }
    }
  }

  async function register(input: RegisterInput): Promise<SubmitFailure | null> {
    try {
      const response = await fetch('/api/parents', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        return await failure(
          response,
          'Could not create your account. Check the details and try again.',
        )
      }
      const body = (await response.json()) as { role?: string; email?: string }
      if (body.role !== 'parent') {
        await discardSession()
        return { message: NOT_A_PARENT, field: 'email' }
      }
      signedIn(body.email ?? input.email)
      return null
    } catch {
      return { message: UNREACHABLE }
    }
  }

  async function logOut(): Promise<void> {
    try {
      const response = await fetch('/api/session', { method: 'DELETE', credentials: 'include' })
      if (response.ok || response.status === 401) {
        setLogoutError('')
        setEmail('')
        setStatus('out')
        return
      }
      setLogoutError('Could not log out. Try again.')
    } catch {
      setLogoutError('Could not log out. Try again.')
    }
  }

  return (
    <SessionContext.Provider value={{ status, email, logIn, register, logOut, logoutError }}>
      {children}
    </SessionContext.Provider>
  )
}
