import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Spinner, formatRupees } from '@booklist/ui'
import { useAdminAuth } from './auth'
import {
  bookBody,
  booksArchivePath,
  booksCollectionPath,
  booksItemPath,
  type CatalogBook,
} from './books'

const UNREACHABLE = 'Could not reach the shop. Try again.'
const SIGN_IN_AGAIN = 'Sign in to continue.'

type ApiError = {
  error?: { code?: string; message?: string; field?: string }
}

type Draft = { mode: 'idle' } | { mode: 'add' } | { mode: 'edit'; id: number }

function asBook(value: unknown): CatalogBook | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'number' || typeof row.title !== 'string') return undefined
  if (typeof row.price !== 'number' || !Number.isInteger(row.price)) return undefined
  if (row.archivedAt !== null && typeof row.archivedAt !== 'string') return undefined
  return { id: row.id, title: row.title, price: row.price, archivedAt: row.archivedAt }
}

function booksFromList(value: unknown): CatalogBook[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const book = asBook(item)
    return book ? [book] : []
  })
}

function titleProblem(value: string): string {
  if (!value.trim()) return 'Enter a book title.'
  return ''
}

function priceProblem(value: string): string {
  if (!/^[1-9]\d*$/.test(value.trim())) {
    return 'Enter a price in whole rupees, at least Rs. 1.'
  }
  const rupees = Number(value.trim())
  if (!Number.isInteger(rupees) || !Number.isSafeInteger(rupees) || rupees < 1) {
    return 'Enter a price in whole rupees, at least Rs. 1.'
  }
  return ''
}

export function BooksPage() {
  const { signOut } = useAdminAuth()
  const [items, setItems] = useState<CatalogBook[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<Draft>({ mode: 'idle' })
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState('')
  const [invalidTitle, setInvalidTitle] = useState(false)
  const [invalidPrice, setInvalidPrice] = useState(false)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const inFlight = useRef(false)
  const errorId = 'admin-book-error'

  function closeForm() {
    setDraft({ mode: 'idle' })
    setTitle('')
    setPrice('')
    setError('')
    setInvalidTitle(false)
    setInvalidPrice(false)
  }

  function upsertItem(row: CatalogBook) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === row.id)
      if (index < 0) return [...current, row]
      return current.map((item, i) => (i === index ? row : item))
    })
  }

  async function handleUnauthorized(): Promise<void> {
    await signOut()
    if (!alive.current) return
    setInvalidTitle(false)
    setInvalidPrice(false)
    setError(SIGN_IN_AGAIN)
  }

  function flagField(field: string | undefined): void {
    setInvalidTitle(field === 'title')
    setInvalidPrice(field === 'price')
  }

  async function readError(response: Response, fallback: string): Promise<string> {
    const body = (await response.json().catch(() => null)) as ApiError | null
    const message = body?.error?.message
    if (alive.current) flagField(body?.error?.field)
    return typeof message === 'string' && message.trim() ? message : fallback
  }

  async function loadList(): Promise<void> {
    if (!alive.current) return
    try {
      const response = await fetch(booksCollectionPath(), { credentials: 'include' })
      if (!alive.current) return
      if (response.status === 401) {
        await handleUnauthorized()
        return
      }
      if (!response.ok) {
        const message = await readError(response, 'Could not load the list. Try again.')
        if (!alive.current) return
        setError(message)
        return
      }
      const body = (await response.json()) as unknown
      if (!alive.current) return
      setItems(booksFromList(body))
      setError('')
      setInvalidTitle(false)
      setInvalidPrice(false)
    } catch {
      if (!alive.current) return
      setError(UNREACHABLE)
    }
  }

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoaded(false)
    void fetch(booksCollectionPath(), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return
        if (response.status === 401) {
          await signOut()
          if (controller.signal.aborted) return
          setInvalidTitle(false)
          setInvalidPrice(false)
          setError(SIGN_IN_AGAIN)
          setLoaded(true)
          return
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as ApiError | null
          if (controller.signal.aborted) return
          const message = body?.error?.message
          flagField(body?.error?.field)
          setError(
            typeof message === 'string' && message.trim()
              ? message
              : 'Could not load the list. Try again.',
          )
          setLoaded(true)
          return
        }
        const body = await response.json()
        if (controller.signal.aborted) return
        setItems(booksFromList(body))
        setError('')
        setInvalidTitle(false)
        setInvalidPrice(false)
        setLoaded(true)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setError(UNREACHABLE)
        setLoaded(true)
      })
    return () => controller.abort()
  }, [signOut])

  function openAdd() {
    setDraft({ mode: 'add' })
    setTitle('')
    setPrice('')
    setError('')
    setInvalidTitle(false)
    setInvalidPrice(false)
  }

  function openEdit(item: CatalogBook) {
    setDraft({ mode: 'edit', id: item.id })
    setTitle(item.title)
    setPrice(String(item.price))
    setError('')
    setInvalidTitle(false)
    setInvalidPrice(false)
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    if (draft.mode === 'idle') {
      inFlight.current = false
      return
    }

    const titleIssue = titleProblem(title)
    const priceIssue = priceProblem(price)
    if (titleIssue || priceIssue) {
      inFlight.current = false
      setInvalidTitle(Boolean(titleIssue))
      setInvalidPrice(Boolean(priceIssue))
      setError(titleIssue || priceIssue)
      return
    }

    setError('')
    setInvalidTitle(false)
    setInvalidPrice(false)
    setBusy(true)
    try {
      const adding = draft.mode === 'add'
      const response = await fetch(
        adding ? booksCollectionPath() : booksItemPath(draft.id),
        {
          method: adding ? 'POST' : 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(bookBody(title, Number(price.trim()))),
        },
      )
      if (!alive.current) return
      if (response.status === 401) {
        await handleUnauthorized()
        return
      }
      if (!response.ok) {
        const message = await readError(
          response,
          'Could not save the book. Check the title and price and try again.',
        )
        if (!alive.current) return
        setError(message)
        return
      }
      const saved = asBook(await response.json())
      if (!alive.current) return
      if (saved) upsertItem(saved)
      closeForm()
      await loadList()
    } catch {
      if (alive.current) setError(UNREACHABLE)
    } finally {
      inFlight.current = false
      if (alive.current) setBusy(false)
    }
  }

  async function onArchive(item: CatalogBook) {
    if (inFlight.current) return
    inFlight.current = true
    setError('')
    setInvalidTitle(false)
    setInvalidPrice(false)
    setBusy(true)
    try {
      const response = await fetch(booksArchivePath(item.id), {
        method: 'POST',
        credentials: 'include',
      })
      if (!alive.current) return
      if (response.status === 401) {
        await handleUnauthorized()
        return
      }
      if (!response.ok) {
        const message = await readError(response, 'Could not archive the book. Try again.')
        if (!alive.current) return
        setError(message)
        return
      }
      const saved = asBook(await response.json())
      if (!alive.current) return
      if (saved) upsertItem(saved)
      await loadList()
    } catch {
      if (alive.current) setError(UNREACHABLE)
    } finally {
      inFlight.current = false
      if (alive.current) setBusy(false)
    }
  }

  const formOpen = draft.mode !== 'idle'
  const empty = loaded && !error && items.length === 0
  const showAdd = loaded && !error && !formOpen

  return (
    <section>
      <h1 className="page-heading text-heading-lg">Book master</h1>
      {!loaded ? (
        <Spinner />
      ) : (
        <>
          {formOpen ? (
            <div className="account-summary">
              <form className="form-stack" onSubmit={(event) => void onSave(event)} noValidate>
                <div className={invalidTitle ? 'form-field is-invalid' : 'form-field'}>
                  <label className="text-label-caps" htmlFor="admin-book-title">
                    Title
                  </label>
                  <input
                    id="admin-book-title"
                    className="form-control"
                    type="text"
                    name="title"
                    autoComplete="off"
                    value={title}
                    aria-invalid={invalidTitle}
                    aria-describedby={error && invalidTitle ? errorId : undefined}
                    disabled={busy}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className={invalidPrice ? 'form-field is-invalid' : 'form-field'}>
                  <label className="text-label-caps" htmlFor="admin-book-price">
                    Price
                  </label>
                  <div className="form-field-money">
                    <span className="form-field-money-prefix" aria-hidden="true">
                      Rs.
                    </span>
                    <input
                      id="admin-book-price"
                      className="form-control text-amount-row"
                      type="text"
                      name="price"
                      inputMode="numeric"
                      autoComplete="off"
                      value={price}
                      aria-invalid={invalidPrice}
                      aria-describedby={error && invalidPrice ? errorId : undefined}
                      disabled={busy}
                      onChange={(event) => {
                        const next = event.target.value
                        if (/^\d*$/.test(next)) setPrice(next)
                      }}
                    />
                  </div>
                </div>
                {error ? (
                  <p id={errorId} className="form-error text-meta" role="alert">
                    {error}
                  </p>
                ) : null}
                <button className="button-primary press-travel" type="submit" disabled={busy}>
                  Save
                </button>
                <button
                  className="button-secondary press-travel"
                  type="button"
                  disabled={busy}
                  onClick={closeForm}
                >
                  Cancel
                </button>
              </form>
            </div>
          ) : showAdd ? (
            <div className="account-summary">
              {empty && !formOpen ? (
                <p className="text-meta">There are no books yet.</p>
              ) : null}
              <button
                className="button-primary press-travel"
                type="button"
                disabled={busy}
                onClick={openAdd}
              >
                Add book
              </button>
            </div>
          ) : null}
          {items.length > 0 ? (
            <ul className="catalog-list">
              {items.map((item) => (
                <li key={item.id} className="catalog-row">
                  <p className="catalog-row-name">{item.title}</p>
                  <p className="text-amount-row">{formatRupees(item.price)}</p>
                  {item.archivedAt ? <p className="text-meta">Archived</p> : null}
                  {draft.mode === 'edit' && draft.id === item.id ? null : (
                    <div className="catalog-row-actions">
                      <button
                        className="button-secondary press-travel"
                        type="button"
                        disabled={busy || formOpen}
                        onClick={() => openEdit(item)}
                      >
                        Edit
                      </button>
                      {item.archivedAt ? null : (
                        <button
                          className="button-secondary press-travel"
                          type="button"
                          disabled={busy || formOpen}
                          onClick={() => void onArchive(item)}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {!formOpen && error ? (
            <p id={errorId} className="form-error text-meta" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
