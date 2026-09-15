import { useState, type FormEvent } from 'react'
import { parentsFindQuery, parentsPasswordBody } from './adminPasswords'
import { useAdminAuth } from './auth'

const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 128
const UNREACHABLE = 'Could not reach the shop. Try again.'
const SIGN_IN_AGAIN = 'Sign in to continue.'

type ApiError = {
  error?: { code?: string; message?: string; field?: string }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function emailProblem(value: string): string {
  if (!value.trim()) return "Enter the parent's email address."
  if (!isValidEmail(value)) return 'That email address does not look right. Check it and try again.'
  return ''
}

function passwordProblem(value: string): string {
  if (!value.trim()) return 'Enter a password.'
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Use a password of ${PASSWORD_MAX_LENGTH} characters or fewer.`
  }
  return ''
}

export function ParentsPage() {
  const { signOut } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [foundEmail, setFoundEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [invalidField, setInvalidField] = useState<'email' | 'password' | ''>('')
  const [finding, setFinding] = useState(false)
  const [saving, setSaving] = useState(false)
  const errorId = 'admin-parents-error'

  function describedBy(field: 'email' | 'password'): string | undefined {
    return error && invalidField === field ? errorId : undefined
  }

  function clearFoundParent() {
    setFoundEmail('')
    setPassword('')
  }

  async function onFind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setInvalidField('')

    const problem = emailProblem(email)
    if (problem) {
      clearFoundParent()
      setInvalidField('email')
      setError(problem)
      return
    }

    setFinding(true)
    try {
      const response = await fetch(`/api/admin/parents?${parentsFindQuery(email.trim())}`, {
        credentials: 'include',
      })
      if (response.status === 401) {
        await signOut()
        clearFoundParent()
        setInvalidField('')
        setError(SIGN_IN_AGAIN)
        return
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null
        const message = body?.error?.message
        clearFoundParent()
        setInvalidField(body?.error?.field === 'password' ? 'password' : 'email')
        setError(
          typeof message === 'string' && message.trim()
            ? message
            : 'No parent account uses that email. Check it and try again.',
        )
        return
      }
      const body = (await response.json()) as { email?: string }
      setFoundEmail(typeof body.email === 'string' ? body.email : email.trim())
      setPassword('')
      setError('')
      setInvalidField('')
    } catch {
      clearFoundParent()
      setInvalidField('')
      setError(UNREACHABLE)
    } finally {
      setFinding(false)
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setInvalidField('')

    const problem = passwordProblem(password)
    if (problem) {
      setInvalidField('password')
      setError(problem)
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/admin/parents', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parentsPasswordBody(foundEmail, password)),
      })
      if (response.status === 401) {
        await signOut()
        setInvalidField('')
        setError(SIGN_IN_AGAIN)
        return
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null
        const message = body?.error?.message
        const emailMiss = body?.error?.code === 'unknown_email' || body?.error?.field === 'email'
        if (emailMiss) clearFoundParent()
        setInvalidField(emailMiss ? 'email' : 'password')
        setError(
          typeof message === 'string' && message.trim()
            ? message
            : 'Could not save the password. Check it and try again.',
        )
        return
      }
      setPassword('')
      setError('')
      setInvalidField('')
    } catch {
      setInvalidField('')
      setError(UNREACHABLE)
    } finally {
      setSaving(false)
    }
  }

  const busy = finding || saving

  return (
    <section>
      <h1 className="page-heading text-heading-lg">Parents</h1>
      <div className="account-summary">
        <form className="form-stack" onSubmit={(event) => void onFind(event)} noValidate>
          <div className={invalidField === 'email' ? 'form-field is-invalid' : 'form-field'}>
            <label className="text-label-caps" htmlFor="admin-parents-email">
              Email
            </label>
            <input
              id="admin-parents-email"
              className="form-control"
              type="email"
              name="email"
              autoComplete="off"
              value={email}
              aria-invalid={invalidField === 'email'}
              aria-describedby={describedBy('email')}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button
            className={
              foundEmail ? 'button-secondary press-travel' : 'button-primary press-travel'
            }
            type="submit"
            disabled={busy}
          >
            Find
          </button>
        </form>
        {foundEmail ? (
          <form className="form-stack" onSubmit={(event) => void onSave(event)} noValidate>
            <div className="form-field">
              <label className="text-label-caps" htmlFor="admin-parents-found-email">
                Email
              </label>
              <input
                id="admin-parents-found-email"
                className="form-control"
                type="email"
                name="foundEmail"
                autoComplete="off"
                value={foundEmail}
                readOnly
                aria-readonly
                disabled={busy}
              />
            </div>
            <div className={invalidField === 'password' ? 'form-field is-invalid' : 'form-field'}>
              <label className="text-label-caps" htmlFor="admin-parents-password">
                New password
              </label>
              <input
                id="admin-parents-password"
                className="form-control"
                type="password"
                name="password"
                autoComplete="off"
                value={password}
                aria-invalid={invalidField === 'password'}
                aria-describedby={describedBy('password')}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? (
              <p id={errorId} className="form-error text-meta" role="alert">
                {error}
              </p>
            ) : null}
            <button className="button-primary press-travel" type="submit" disabled={busy}>
              Save
            </button>
          </form>
        ) : error ? (
          <p id={errorId} className="form-error text-meta" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}
