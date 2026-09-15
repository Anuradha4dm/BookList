import { useState, type FormEvent } from 'react'
import { settingsPasswordBody } from './adminPasswords'
import { useAdminAuth } from './auth'

const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 128
const UNREACHABLE = 'Could not reach the shop. Try again.'
const SIGN_IN_AGAIN = 'Sign in to continue.'

type ApiError = {
  error?: { code?: string; message?: string; field?: string }
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

export function SettingsPage() {
  const { signOut } = useAdminAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const errorId = 'admin-settings-error'

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setInvalid(false)

    const problem = passwordProblem(password)
    if (problem) {
      setInvalid(true)
      setError(problem)
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/admin/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settingsPasswordBody(password)),
      })
      if (response.status === 401) {
        await signOut()
        setInvalid(false)
        setError(SIGN_IN_AGAIN)
        return
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null
        const message = body?.error?.message
        setInvalid(body?.error?.field === 'password')
        setError(
          typeof message === 'string' && message.trim()
            ? message
            : 'Could not save the password. Check it and try again.',
        )
        return
      }
      setPassword('')
      setError('')
      setInvalid(false)
    } catch {
      setInvalid(false)
      setError(UNREACHABLE)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <h1 className="page-heading text-heading-lg">Settings</h1>
      <div className="account-summary">
        <form className="form-stack" onSubmit={(event) => void onSubmit(event)} noValidate>
          <div className={invalid ? 'form-field is-invalid' : 'form-field'}>
            <label className="text-label-caps" htmlFor="admin-settings-password">
              New password
            </label>
            <input
              id="admin-settings-password"
              className="form-control"
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              aria-invalid={invalid}
              aria-describedby={error ? errorId : undefined}
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? (
            <p id={errorId} className="form-error text-meta" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button-primary press-travel" type="submit" disabled={submitting}>
            Save
          </button>
        </form>
      </div>
    </section>
  )
}
