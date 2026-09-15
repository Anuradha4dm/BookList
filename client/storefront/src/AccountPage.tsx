import { useEffect, useState, type FormEvent } from 'react'
import { Spinner } from '@booklist/ui'
import {
  profileDraftFromGet,
  profilePatchBody,
  type ProfileDraft,
} from './accountProfile'
import { useSession, type SubmitFailure } from './auth'

const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 128
const UNREACHABLE = 'Could not reach the shop. Try again.'
const LOAD_FAILED = 'Could not load your account. Log out, then sign in again.'
const LOAD_UNREACHABLE = 'Could not reach the shop. Log out, then sign in again.'
const SIGN_IN_AGAIN = 'Sign in to continue.'

const EMPTY_DRAFT: ProfileDraft = {
  name: '',
  deliveryAddress: '',
  whatsapp: '',
  secondPhone: '',
  email: '',
  password: '',
}

const PROFILE_FIELDS: ReadonlyArray<keyof ProfileDraft> = [
  'name',
  'deliveryAddress',
  'whatsapp',
  'secondPhone',
  'password',
]

type ApiError = {
  error?: { code?: string; message?: string; field?: string }
}

function isMobile(value: string): boolean {
  const compact = value.replace(/[\s-]/g, '')
  return /^07\d{8}$/.test(compact) || /^\+947\d{8}$/.test(compact)
}

function asProfileField(field: string | undefined): keyof ProfileDraft | '' {
  return PROFILE_FIELDS.find((known) => known === field) ?? ''
}

async function readFailure(response: Response, fallback: string): Promise<SubmitFailure> {
  const body = (await response.json().catch(() => null)) as ApiError | null
  const message = body?.error?.message
  return {
    message: typeof message === 'string' && message.trim() ? message : fallback,
    field: body?.error?.field,
  }
}

type ProfileProblem = { field: keyof ProfileDraft; message: string }

function firstProblem(values: ProfileDraft): ProfileProblem | null {
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
  if (!values.password.trim()) return null
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

type FieldProps = {
  id: string
  name: string
  label: string
  type: string
  autoComplete: string
  value: string
  invalid: boolean
  describedBy?: string
  readOnly?: boolean
  disabled?: boolean
  onChange?: (value: string) => void
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
  readOnly,
  disabled,
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
        readOnly={readOnly}
        disabled={disabled}
        aria-readonly={readOnly || undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={
          readOnly || disabled || !onChange ? undefined : (event) => onChange(event.target.value)
        }
      />
    </div>
  )
}

export function AccountPage() {
  const session = useSession()
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [invalidField, setInvalidField] = useState<keyof ProfileDraft | ''>('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const errorId = 'storefront-account-error'

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/parents/me', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (controller.signal.aborted) return
        if (response.status === 401) {
          await session.logOut()
          if (controller.signal.aborted) return
          setLoadError(LOAD_FAILED)
          setLoading(false)
          return
        }
        if (!response.ok) {
          const failure = await readFailure(response, LOAD_FAILED)
          if (controller.signal.aborted) return
          setLoadError(failure.message)
          setLoading(false)
          return
        }
        const body = await response.json()
        if (controller.signal.aborted) return
        setDraft(profileDraftFromGet(body, session.email))
        setLoadError('')
        setLoading(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setLoadError(LOAD_UNREACHABLE)
        setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const update = (field: keyof ProfileDraft) => (value: string) =>
    setDraft((previous) => ({ ...previous, [field]: value }))

  function describedBy(field: keyof ProfileDraft): string | undefined {
    return error && invalidField === field ? errorId : undefined
  }

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
    try {
      const response = await fetch('/api/parents/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profilePatchBody(draft)),
      })
      if (response.status === 401) {
        await session.logOut()
        setError(SIGN_IN_AGAIN)
        return
      }
      if (!response.ok) {
        const failure = await readFailure(
          response,
          'Could not save your account. Check the details and try again.',
        )
        setInvalidField(asProfileField(failure.field))
        setError(failure.message)
        return
      }
      const body = await response.json()
      setDraft(profileDraftFromGet(body, draft.email))
      setError('')
      setInvalidField('')
    } catch {
      setError(UNREACHABLE)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <section>
        <h1 className="page-heading text-heading-lg">Account</h1>
        <Spinner />
      </section>
    )
  }

  if (loadError) {
    return (
      <section>
        <h1 className="page-heading text-heading-lg">Account</h1>
        <div className="account-summary">
          <p className="form-error text-meta" role="alert">
            {loadError}
          </p>
          <button
            className="button-secondary press-travel"
            type="button"
            onClick={() => void session.logOut()}
          >
            Log out
          </button>
          {session.logoutError ? (
            <p className="form-error text-meta" role="alert">
              {session.logoutError}
            </p>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <section>
      <h1 className="page-heading text-heading-lg">Account</h1>
      <div className="account-summary">
        <form className="form-stack" onSubmit={(event) => void onSubmit(event)} noValidate>
          <Field
            id="storefront-account-name"
            name="name"
            label="Name"
            type="text"
            autoComplete="name"
            value={draft.name}
            invalid={invalidField === 'name'}
            describedBy={describedBy('name')}
            disabled={submitting}
            onChange={update('name')}
          />
          <Field
            id="storefront-account-address"
            name="deliveryAddress"
            label="Delivery address"
            type="text"
            autoComplete="street-address"
            value={draft.deliveryAddress}
            invalid={invalidField === 'deliveryAddress'}
            describedBy={describedBy('deliveryAddress')}
            disabled={submitting}
            onChange={update('deliveryAddress')}
          />
          <Field
            id="storefront-account-whatsapp"
            name="whatsapp"
            label="WhatsApp number"
            type="tel"
            autoComplete="tel"
            value={draft.whatsapp}
            invalid={invalidField === 'whatsapp'}
            describedBy={describedBy('whatsapp')}
            disabled={submitting}
            onChange={update('whatsapp')}
          />
          <Field
            id="storefront-account-second-phone"
            name="secondPhone"
            label="Second phone (optional)"
            type="tel"
            autoComplete="tel"
            value={draft.secondPhone}
            invalid={invalidField === 'secondPhone'}
            describedBy={describedBy('secondPhone')}
            disabled={submitting}
            onChange={update('secondPhone')}
          />
          <Field
            id="storefront-account-email"
            name="email"
            label="Email"
            type="email"
            autoComplete="username"
            value={draft.email}
            invalid={false}
            readOnly
            disabled={submitting}
          />
          <Field
            id="storefront-account-password"
            name="password"
            label="New password (optional)"
            type="password"
            autoComplete="new-password"
            value={draft.password}
            invalid={invalidField === 'password'}
            describedBy={describedBy('password')}
            disabled={submitting}
            onChange={update('password')}
          />
          {error ? (
            <p id={errorId} className="form-error text-meta" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button-primary press-travel" type="submit" disabled={submitting}>
            Save
          </button>
        </form>
        <button
          className="button-secondary press-travel"
          type="button"
          onClick={() => void session.logOut()}
        >
          Log out
        </button>
        {session.logoutError ? (
          <p className="form-error text-meta" role="alert">
            {session.logoutError}
          </p>
        ) : null}
      </div>
    </section>
  )
}
