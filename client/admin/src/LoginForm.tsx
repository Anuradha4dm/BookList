import { useState, type FormEvent } from 'react'

type LoginFormProps = {
  onSuccess: (email: string) => void
}

type ApiError = {
  error?: { code?: string; message?: string }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * `POST /api/session` accepts parents too and has already set a cookie by the time we read the
 * role. Drop it, so the admin app is never signed out on screen with a live session in the
 * browser.
 */
async function discardSession(): Promise<void> {
  try {
    await fetch('/api/session', { method: 'DELETE', credentials: 'include' })
  } catch {
    // The inline refusal below is the only message worth showing.
  }
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [emailInvalid, setEmailInvalid] = useState(false)
  const [passwordInvalid, setPasswordInvalid] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setEmailInvalid(false)
    setPasswordInvalid(false)

    const trimmedEmail = email.trim()
    let nextEmailInvalid = false
    let nextPasswordInvalid = false
    let nextError = ''

    if (!trimmedEmail) {
      nextEmailInvalid = true
      nextError = 'Enter your email and password to sign in.'
    } else if (!isValidEmail(trimmedEmail)) {
      nextEmailInvalid = true
      nextError = 'Enter a valid email address.'
    }
    if (!password) {
      nextPasswordInvalid = true
      if (!nextError) nextError = 'Enter your email and password to sign in.'
    }

    if (nextEmailInvalid || nextPasswordInvalid) {
      setEmailInvalid(nextEmailInvalid)
      setPasswordInvalid(nextPasswordInvalid)
      setError(nextError)
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null
        setEmailInvalid(true)
        setPasswordInvalid(true)
        setError(
          body?.error?.message ?? 'That email or password is not right. Check them and try again.',
        )
        return
      }
      const body = (await response.json()) as { role?: string; email?: string }
      if (body.role !== 'admin') {
        await discardSession()
        setEmailInvalid(true)
        setPasswordInvalid(true)
        setError('Those details are for the shop app. Log in there instead.')
        return
      }
      onSuccess(body.email ?? email)
    } catch {
      setEmailInvalid(false)
      setPasswordInvalid(false)
      setError('Could not reach the shop. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login-panel">
        <h1 className="page-heading text-heading-lg">Log in</h1>
        <form className="form-stack" onSubmit={(event) => void onSubmit(event)} noValidate>
          <div className={emailInvalid ? 'form-field is-invalid' : 'form-field'}>
            <label className="text-label-caps" htmlFor="admin-email">
              Email
            </label>
            <input
              id="admin-email"
              className="form-control"
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              aria-invalid={emailInvalid}
              aria-describedby={error ? 'admin-login-error' : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className={passwordInvalid ? 'form-field is-invalid' : 'form-field'}>
            <label className="text-label-caps" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              className="form-control"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={passwordInvalid}
              aria-describedby={error ? 'admin-login-error' : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? (
            <p id="admin-login-error" className="form-error text-meta" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button-primary press-travel" type="submit" disabled={submitting}>
            Log in
          </button>
        </form>
      </div>
    </div>
  )
}
