import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Spinner } from '@booklist/ui'
import { useAdminAuth } from './auth'
import {
  catalogArchivePath,
  catalogCollectionPath,
  catalogItemPath,
  catalogNameBody,
  type CatalogKind,
  type CatalogNamedItem,
} from './catalogNamed'

const UNREACHABLE = 'Could not reach the shop. Try again.'
const SIGN_IN_AGAIN = 'Sign in to continue.'

type ApiError = {
  error?: { code?: string; message?: string; field?: string }
}

type Draft = { mode: 'idle' } | { mode: 'add' } | { mode: 'rename'; id: number }

type CatalogNamedPageProps = {
  kind: CatalogKind
  title: string
  entity: string
  addLabel: string
  emptyCopy: string
}

function asNamedItem(value: unknown): CatalogNamedItem | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'number' || typeof row.name !== 'string') return undefined
  if (row.archivedAt !== null && typeof row.archivedAt !== 'string') return undefined
  return { id: row.id, name: row.name, archivedAt: row.archivedAt }
}

export function CatalogNamedPage({
  kind,
  title,
  entity,
  addLabel,
  emptyCopy,
}: CatalogNamedPageProps) {
  const { signOut } = useAdminAuth()
  const [items, setItems] = useState<CatalogNamedItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<Draft>({ mode: 'idle' })
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const inFlight = useRef(false)
  const errorId = `admin-${kind}-error`

  function closeForm() {
    setDraft({ mode: 'idle' })
    setName('')
    setError('')
    setInvalid(false)
  }

  function nameProblem(value: string): string {
    if (!value.trim()) return `Enter a ${entity} name.`
    return ''
  }

  function upsertItem(row: CatalogNamedItem) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === row.id)
      if (index < 0) return [...current, row]
      return current.map((item, i) => (i === index ? row : item))
    })
  }

  async function handleUnauthorized(): Promise<void> {
    await signOut()
    if (!alive.current) return
    setInvalid(false)
    setError(SIGN_IN_AGAIN)
  }

  async function readError(response: Response, fallback: string): Promise<string> {
    const body = (await response.json().catch(() => null)) as ApiError | null
    const message = body?.error?.message
    if (alive.current) setInvalid(body?.error?.field === 'name')
    return typeof message === 'string' && message.trim() ? message : fallback
  }

  async function loadList(): Promise<void> {
    if (!alive.current) return
    try {
      const response = await fetch(catalogCollectionPath(kind), { credentials: 'include' })
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
      setItems(Array.isArray(body) ? body : [])
      setError('')
      setInvalid(false)
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
    void fetch(catalogCollectionPath(kind), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return
        if (response.status === 401) {
          await signOut()
          if (controller.signal.aborted) return
          setInvalid(false)
          setError(SIGN_IN_AGAIN)
          setLoaded(true)
          return
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as ApiError | null
          if (controller.signal.aborted) return
          const message = body?.error?.message
          setInvalid(body?.error?.field === 'name')
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
        setItems(Array.isArray(body) ? body : [])
        setError('')
        setInvalid(false)
        setLoaded(true)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setError(UNREACHABLE)
        setLoaded(true)
      })
    return () => controller.abort()
  }, [kind, signOut])

  function openAdd() {
    setDraft({ mode: 'add' })
    setName('')
    setError('')
    setInvalid(false)
  }

  function openRename(item: CatalogNamedItem) {
    setDraft({ mode: 'rename', id: item.id })
    setName(item.name)
    setError('')
    setInvalid(false)
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    if (draft.mode === 'idle') {
      inFlight.current = false
      return
    }

    const problem = nameProblem(name)
    if (problem) {
      inFlight.current = false
      setInvalid(true)
      setError(problem)
      return
    }

    setError('')
    setInvalid(false)
    setBusy(true)
    try {
      const adding = draft.mode === 'add'
      const response = await fetch(adding ? catalogCollectionPath(kind) : catalogItemPath(kind, draft.id), {
        method: adding ? 'POST' : 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(catalogNameBody(name)),
      })
      if (!alive.current) return
      if (response.status === 401) {
        await handleUnauthorized()
        return
      }
      if (!response.ok) {
        const message = await readError(
          response,
          `Could not save the ${entity}. Check the name and try again.`,
        )
        if (!alive.current) return
        setError(message)
        return
      }
      const saved = asNamedItem(await response.json())
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

  async function onArchive(item: CatalogNamedItem) {
    if (inFlight.current) return
    inFlight.current = true
    setError('')
    setInvalid(false)
    setBusy(true)
    try {
      const response = await fetch(catalogArchivePath(kind, item.id), {
        method: 'POST',
        credentials: 'include',
      })
      if (!alive.current) return
      if (response.status === 401) {
        await handleUnauthorized()
        return
      }
      if (!response.ok) {
        const message = await readError(response, `Could not archive the ${entity}. Try again.`)
        if (!alive.current) return
        setError(message)
        return
      }
      const saved = asNamedItem(await response.json())
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
      <h1 className="page-heading text-heading-lg">{title}</h1>
      {!loaded ? (
        <Spinner />
      ) : (
        <>
          {formOpen ? (
            <div className="account-summary">
              <form className="form-stack" onSubmit={(event) => void onSave(event)} noValidate>
                <div className={invalid ? 'form-field is-invalid' : 'form-field'}>
                  <label className="text-label-caps" htmlFor={`admin-${kind}-name`}>
                    Name
                  </label>
                  <input
                    id={`admin-${kind}-name`}
                    className="form-control"
                    type="text"
                    name="name"
                    autoComplete="off"
                    value={name}
                    aria-invalid={invalid}
                    aria-describedby={error ? errorId : undefined}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
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
              {empty && !formOpen ? <p className="text-meta">{emptyCopy}</p> : null}
              <button
                className="button-primary press-travel"
                type="button"
                disabled={busy}
                onClick={openAdd}
              >
                {addLabel}
              </button>
            </div>
          ) : null}
          {items.length > 0 ? (
            <ul className="catalog-list">
              {items.map((item) => (
                <li key={item.id} className="catalog-row">
                  <p className="catalog-row-name">{item.name}</p>
                  {item.archivedAt ? <p className="text-meta">Archived</p> : null}
                  {draft.mode === 'rename' && draft.id === item.id ? null : (
                    <div className="catalog-row-actions">
                      <button
                        className="button-secondary press-travel"
                        type="button"
                        disabled={busy || formOpen}
                        onClick={() => openRename(item)}
                      >
                        Rename
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
