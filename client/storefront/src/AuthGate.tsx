import { useState, type FormEvent } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { Skeleton } from '@booklist/ui'
import { useSession, type RegisterInput } from './auth'

const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 128

const REGISTER_FIELDS: ReadonlyArray<keyof RegisterInput> = [
  'name',
  'deliveryAddress',
  'whatsapp',
  'secondPhone',
  'email',
  'password',
]

const EMPTY_DRAFT: RegisterInput = {
  name: '',
  deliveryAddress: '',
  whatsapp: '',
  secondPhone: '',
  email: '',
  password: '',
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isMobile(value: string): boolean {
  const compact = value.replace(/[\s-]/g, '')
  return /^07\d{8}$/.test(compact) || /^\+947\d{8}$/.test(compact)
}

/** The server names the field it refused; anything unrecognised flags nothing. */
function asRegisterField(field: string | undefined): keyof RegisterInput | '' {
  return REGISTER_FIELDS.find((known) => known === field) ?? ''
}

type UpdateDraft = (field: keyof RegisterInput) => (value: string) => void

type PanelProps = {
  draft: RegisterInput
  update: UpdateDraft
  onSignedIn: () => void
}

type FieldProps = {
  id: string
  name: string
  label: string
  type: string
  autoComplete: string
  value: string
  invalid: boolean
  describedBy?: string
  onChange: (value: string) => void
}

function Field({
  id,
  name,
  label,
  type,
  autoComplete,
  value,
  invalid,
  describedBy,
  onChange,
}: FieldProps) {
  return (
    <div className={invalid ? 'form-field is-invalid' : 'form-field'}>
      <label className="text-label-caps" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="form-control"
        type={type}
        name={name}
        autoComplete={autoComplete}
        value={value}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function LoginPanel({ draft, update, onSignedIn }: PanelProps) {
  const session = useSession()
  const [error, setError] = useState('')
  const [emailInvalid, setEmailInvalid] = useState(false)
  const [passwordInvalid, setPasswordInvalid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const errorId = 'storefront-login-error'

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setEmailInvalid(false)
    setPasswordInvalid(false)

    const trimmedEmail = draft.email.trim()
    if (!trimmedEmail) {
      setEmailInvalid(true)
      setError('Enter your email and password to log in.')
      return
    }
    if (!isValidEmail(trimmedEmail)) {
      setEmailInvalid(true)
      setError('That email address does not look right. Check it and try again.')
      return
    }
    if (!draft.password) {
      setPasswordInvalid(true)
      setError('Enter your email and password to log in.')
      return
    }

    setSubmitting(true)
    const failure = await session.logIn(draft.email, draft.password)
    setSubmitting(false)
    if (failure) {
      setEmailInvalid(true)
      setPasswordInvalid(failure.field !== 'email')
      setError(failure.message)
      return
    }
    onSignedIn()
  }

  return (
    <form className="form-stack" onSubmit={(event) => void onSubmit(event)} noValidate>
      <Field
        id="storefront-login-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="username"
        value={draft.email}
        invalid={emailInvalid}
        describedBy={error && emailInvalid ? errorId : undefined}
        onChange={update('email')}
      />
      <Field
        id="storefront-login-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={draft.password}
        invalid={passwordInvalid}
        describedBy={error && passwordInvalid ? errorId : undefined}
        onChange={update('password')}
      />
      {error ? (
        <p id={errorId} className="form-error text-meta" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button-primary press-travel" type="submit" disabled={submitting}>
        Log in
      </button>
    </form>
  )
}

type RegisterProblem = { field: keyof RegisterInput; message: string }

/** Mirrors the server's order so the parent is told about the topmost field first. */
function firstProblem(values: RegisterInput): RegisterProblem | null {
  if (!values.name.trim()) return { field: 'name', message: 'Enter your name.' }
  if (!values.deliveryAddress.trim()) {
    return { field: 'deliveryAddress', message: 'Enter your delivery address.' }
  }
  if (!values.whatsapp.trim()) {
    return { field: 'whatsapp', message: 'Enter your WhatsApp number.' }
  }
  if (!isMobile(values.whatsapp)) {
    return {
      field: 'whatsapp',
      message: 'Enter your WhatsApp number as 07XXXXXXXX or +947XXXXXXXX.',
    }
  }
  if (values.secondPhone.trim() && !isMobile(values.secondPhone)) {
    return {
      field: 'secondPhone',
      message: 'Enter the second phone number as 07XXXXXXXX or +947XXXXXXXX, or leave it empty.',
    }
  }
  if (!values.email.trim()) return { field: 'email', message: 'Enter your email address.' }
  if (!isValidEmail(values.email)) {
    return { field: 'email', message: 'That email address does not look right. Check it and try again.' }
  }
  if (values.password.length < PASSWORD_MIN_LENGTH) {
    return {
      field: 'password',
      message: `Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`,
    }
  }
  if (values.password.length > PASSWORD_MAX_LENGTH) {
    return {
      field: 'password',
      message: `Use a password of ${PASSWORD_MAX_LENGTH} characters or fewer.`,
    }
  }
  return null
}

function RegisterPanel({ draft, update, onSignedIn }: PanelProps) {
  const session = useSession()
  const [invalidField, setInvalidField] = useState<keyof RegisterInput | ''>('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const errorId = 'storefront-register-error'

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setInvalidField('')

    const problem = firstProblem(draft)
    if (problem) {
      setInvalidField(problem.field)
      setError(problem.message)
      return
    }

    setSubmitting(true)
    const failure = await session.register(draft)
    setSubmitting(false)
    if (failure) {
      setInvalidField(asRegisterField(failure.field))
      setError(failure.message)
      return
    }
    onSignedIn()
  }

  // Only the refused control points at the message, so it is not read on every field.
  function describedBy(field: keyof RegisterInput): string | undefined {
    return error && invalidField === field ? errorId : undefined
  }

  return (
    <form className="form-stack" onSubmit={(event) => void onSubmit(event)} noValidate>
      <Field
        id="storefront-register-name"
        name="name"
        label="Name"
        type="text"
        autoComplete="name"
        value={draft.name}
        invalid={invalidField === 'name'}
        describedBy={describedBy('name')}
        onChange={update('name')}
      />
      <Field
        id="storefront-register-address"
        name="deliveryAddress"
        label="Delivery address"
        type="text"
        autoComplete="street-address"
        value={draft.deliveryAddress}
        invalid={invalidField === 'deliveryAddress'}
        describedBy={describedBy('deliveryAddress')}
        onChange={update('deliveryAddress')}
      />
      <Field
        id="storefront-register-whatsapp"
        name="whatsapp"
        label="WhatsApp number"
        type="tel"
        autoComplete="tel"
        value={draft.whatsapp}
        invalid={invalidField === 'whatsapp'}
        describedBy={describedBy('whatsapp')}
        onChange={update('whatsapp')}
      />
      <Field
        id="storefront-register-second-phone"
        name="secondPhone"
        label="Second phone (optional)"
        type="tel"
        autoComplete="tel"
        value={draft.secondPhone}
        invalid={invalidField === 'secondPhone'}
        describedBy={describedBy('secondPhone')}
        onChange={update('secondPhone')}
      />
      <Field
        id="storefront-register-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="username"
        value={draft.email}
        invalid={invalidField === 'email'}
        describedBy={describedBy('email')}
        onChange={update('email')}
      />
      <Field
        id="storefront-register-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        value={draft.password}
        invalid={invalidField === 'password'}
        describedBy={describedBy('password')}
        onChange={update('password')}
      />
      {error ? (
        <p id={errorId} className="form-error text-meta" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button-primary press-travel" type="submit" disabled={submitting}>
        Create account
      </button>
    </form>
  )
}

export function AuthGate() {
  const session = useSession()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  // One draft behind both panels, so switching between them keeps every typed value.
  const [draft, setDraft] = useState<RegisterInput>(EMPTY_DRAFT)

  if (session.status === 'checking') {
    return <Skeleton />
  }

  if (session.status === 'in') {
    return <Outlet />
  }

  const update: UpdateDraft = (field) => (value) =>
    setDraft((previous) => ({ ...previous, [field]: value }))

  // Every gated tab lands on Browse once the parent is in — never the tab they tapped.
  function onSignedIn(): void {
    void navigate('/', { replace: true })
  }

  return (
    <div className="auth-gate">
      <div className="auth-gate-panel">
        <div className="auth-gate-intro" role="status">
          <h1 className="page-heading text-heading-lg">
            {mode === 'login' ? 'Log in' : 'Create account'}
          </h1>
          <p className="auth-gate-note text-meta">
            Log in or create an account to use your cart, orders, and account.
          </p>
        </div>
        {mode === 'login' ? (
          <LoginPanel draft={draft} update={update} onSignedIn={onSignedIn} />
        ) : (
          <RegisterPanel draft={draft} update={update} onSignedIn={onSignedIn} />
        )}
        <div className="auth-gate-switch">
          <button
            className="button-secondary press-travel"
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Create account' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  )
}
