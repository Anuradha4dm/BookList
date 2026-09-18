import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Spinner, formatRupees } from '@booklist/ui'
import { useAdminAuth } from './auth'
import { booksCollectionPath, type CatalogBook } from './books'
import {
  catalogCollectionPath,
  type CatalogNamedItem,
} from './catalogNamed'
import {
  packCreateBody,
  packPatchBody,
  packsArchivePath,
  packsCollectionPath,
  packsItemPath,
  type CatalogPack,
  type CatalogPackBook,
} from './packs'

const UNREACHABLE = 'Could not reach the shop. Try again.'
const SIGN_IN_AGAIN = 'Sign in to continue.'

type ApiError = {
  error?: { code?: string; message?: string; field?: string }
}

type Draft = { mode: 'idle' } | { mode: 'add' } | { mode: 'edit'; id: number }

function asNamed(value: unknown): CatalogNamedItem | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'number' || typeof row.name !== 'string') return undefined
  if (row.archivedAt !== null && typeof row.archivedAt !== 'string') return undefined
  return { id: row.id, name: row.name, archivedAt: row.archivedAt }
}

function namedFromList(value: unknown): CatalogNamedItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = asNamed(item)
    return row ? [row] : []
  })
}

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

function asPackBook(value: unknown): CatalogPackBook | undefined {
  return asBook(value)
}

function asPack(value: unknown): CatalogPack | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'number' || typeof row.name !== 'string') return undefined
  if (typeof row.schoolId !== 'number' || typeof row.gradeId !== 'number') return undefined
  if (typeof row.description !== 'string') return undefined
  if (typeof row.price !== 'number' || !Number.isInteger(row.price)) return undefined
  if (row.archivedAt !== null && typeof row.archivedAt !== 'string') return undefined
  if (!Array.isArray(row.books)) return undefined
  const books = row.books.flatMap((item) => {
    const book = asPackBook(item)
    return book ? [book] : []
  })
  if (books.length !== row.books.length) return undefined
  return {
    id: row.id,
    name: row.name,
    schoolId: row.schoolId,
    gradeId: row.gradeId,
    description: row.description,
    price: row.price,
    archivedAt: row.archivedAt,
    books,
  }
}

function packsFromList(value: unknown): CatalogPack[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const pack = asPack(item)
    return pack ? [pack] : []
  })
}

function nameProblem(value: string): string {
  if (!value.trim()) return 'Enter a pack name.'
  return ''
}

function descriptionProblem(value: string): string {
  if (!value.trim()) return 'Enter a description.'
  return ''
}

function schoolProblem(value: string, adding: boolean): string {
  if (!adding) return ''
  if (!/^[1-9]\d*$/.test(value)) return 'Choose a school.'
  return ''
}

function gradeProblem(value: string, adding: boolean): string {
  if (!adding) return ''
  if (!/^[1-9]\d*$/.test(value)) return 'Choose a grade.'
  return ''
}

function booksProblem(ids: number[]): string {
  if (ids.length === 0) return 'Choose at least one book.'
  return ''
}

function namedLabel(items: CatalogNamedItem[], id: number): string {
  return items.find((item) => item.id === id)?.name ?? ''
}

export function PacksPage() {
  const { signOut } = useAdminAuth()
  const [items, setItems] = useState<CatalogPack[]>([])
  const [schools, setSchools] = useState<CatalogNamedItem[]>([])
  const [grades, setGrades] = useState<CatalogNamedItem[]>([])
  const [books, setBooks] = useState<CatalogBook[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<Draft>({ mode: 'idle' })
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [gradeId, setGradeId] = useState('')
  const [selectedBookIds, setSelectedBookIds] = useState<number[]>([])
  const [error, setError] = useState('')
  const [invalidName, setInvalidName] = useState(false)
  const [invalidDescription, setInvalidDescription] = useState(false)
  const [invalidSchool, setInvalidSchool] = useState(false)
  const [invalidGrade, setInvalidGrade] = useState(false)
  const [invalidBooks, setInvalidBooks] = useState(false)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const inFlight = useRef(false)
  const errorId = 'admin-pack-error'

  function clearFieldFlags() {
    setInvalidName(false)
    setInvalidDescription(false)
    setInvalidSchool(false)
    setInvalidGrade(false)
    setInvalidBooks(false)
  }

  function closeForm() {
    setDraft({ mode: 'idle' })
    setName('')
    setDescription('')
    setSchoolId('')
    setGradeId('')
    setSelectedBookIds([])
    setError('')
    clearFieldFlags()
  }

  function upsertItem(row: CatalogPack) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === row.id)
      if (index < 0) return [...current, row]
      return current.map((item, i) => (i === index ? row : item))
    })
  }

  async function handleUnauthorized(): Promise<void> {
    await signOut()
    if (!alive.current) return
    clearFieldFlags()
    setError(SIGN_IN_AGAIN)
  }

  function flagField(field: string | undefined): void {
    setInvalidName(field === 'name')
    setInvalidDescription(field === 'description')
    setInvalidSchool(field === 'schoolId')
    setInvalidGrade(field === 'gradeId')
    setInvalidBooks(field === 'bookIds')
  }

  async function readError(response: Response, fallback: string): Promise<string> {
    const body = (await response.json().catch(() => null)) as ApiError | null
    const message = body?.error?.message
    if (alive.current) flagField(body?.error?.field)
    return typeof message === 'string' && message.trim() ? message : fallback
  }

  async function applyCatalog(packsBody: unknown, schoolsBody: unknown, gradesBody: unknown, booksBody: unknown) {
    setItems(packsFromList(packsBody))
    setSchools(namedFromList(schoolsBody))
    setGrades(namedFromList(gradesBody))
    setBooks(booksFromList(booksBody))
    setError('')
    clearFieldFlags()
  }

  async function loadList(): Promise<void> {
    if (!alive.current) return
    try {
      const [packsRes, schoolsRes, gradesRes, booksRes] = await Promise.all([
        fetch(packsCollectionPath(), { credentials: 'include' }),
        fetch(catalogCollectionPath('schools'), { credentials: 'include' }),
        fetch(catalogCollectionPath('grades'), { credentials: 'include' }),
        fetch(booksCollectionPath(), { credentials: 'include' }),
      ])
      if (!alive.current) return
      if (
        packsRes.status === 401 ||
        schoolsRes.status === 401 ||
        gradesRes.status === 401 ||
        booksRes.status === 401
      ) {
        await handleUnauthorized()
        return
      }
      if (!packsRes.ok || !schoolsRes.ok || !gradesRes.ok || !booksRes.ok) {
        const failed = [packsRes, schoolsRes, gradesRes, booksRes].find((res) => !res.ok) as Response
        const message = await readError(failed, 'Could not load the list. Try again.')
        if (!alive.current) return
        setError(message)
        return
      }
      await applyCatalog(
        await packsRes.json(),
        await schoolsRes.json(),
        await gradesRes.json(),
        await booksRes.json(),
      )
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
    void Promise.all([
      fetch(packsCollectionPath(), { credentials: 'include', signal: controller.signal }),
      fetch(catalogCollectionPath('schools'), { credentials: 'include', signal: controller.signal }),
      fetch(catalogCollectionPath('grades'), { credentials: 'include', signal: controller.signal }),
      fetch(booksCollectionPath(), { credentials: 'include', signal: controller.signal }),
    ])
      .then(async ([packsRes, schoolsRes, gradesRes, booksRes]) => {
        if (controller.signal.aborted) return
        if (
          packsRes.status === 401 ||
          schoolsRes.status === 401 ||
          gradesRes.status === 401 ||
          booksRes.status === 401
        ) {
          await signOut()
          if (controller.signal.aborted) return
          clearFieldFlags()
          setError(SIGN_IN_AGAIN)
          setLoaded(true)
          return
        }
        if (!packsRes.ok || !schoolsRes.ok || !gradesRes.ok || !booksRes.ok) {
          const failed = [packsRes, schoolsRes, gradesRes, booksRes].find((res) => !res.ok) as Response
          const body = (await failed.json().catch(() => null)) as ApiError | null
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
        const [packsBody, schoolsBody, gradesBody, booksBody] = await Promise.all([
          packsRes.json(),
          schoolsRes.json(),
          gradesRes.json(),
          booksRes.json(),
        ])
        if (controller.signal.aborted) return
        setItems(packsFromList(packsBody))
        setSchools(namedFromList(schoolsBody))
        setGrades(namedFromList(gradesBody))
        setBooks(booksFromList(booksBody))
        setError('')
        clearFieldFlags()
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
    setName('')
    setDescription('')
    setSchoolId('')
    setGradeId('')
    setSelectedBookIds([])
    setError('')
    clearFieldFlags()
  }

  function openEdit(item: CatalogPack) {
    setDraft({ mode: 'edit', id: item.id })
    setName(item.name)
    setDescription(item.description)
    setSchoolId(String(item.schoolId))
    setGradeId(String(item.gradeId))
    setSelectedBookIds(item.books.filter((book) => book.archivedAt === null).map((book) => book.id))
    setError('')
    clearFieldFlags()
  }

  function toggleBook(id: number) {
    setSelectedBookIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    if (draft.mode === 'idle') {
      inFlight.current = false
      return
    }

    const adding = draft.mode === 'add'
    const nameIssue = nameProblem(name)
    const descriptionIssue = descriptionProblem(description)
    const schoolIssue = schoolProblem(schoolId, adding)
    const gradeIssue = gradeProblem(gradeId, adding)
    const booksIssue = booksProblem(selectedBookIds)
    if (nameIssue || descriptionIssue || schoolIssue || gradeIssue || booksIssue) {
      inFlight.current = false
      setInvalidName(Boolean(nameIssue))
      setInvalidDescription(Boolean(descriptionIssue))
      setInvalidSchool(Boolean(schoolIssue))
      setInvalidGrade(Boolean(gradeIssue))
      setInvalidBooks(Boolean(booksIssue))
      setError(nameIssue || descriptionIssue || schoolIssue || gradeIssue || booksIssue)
      return
    }

    setError('')
    clearFieldFlags()
    setBusy(true)
    try {
      const response = await fetch(adding ? packsCollectionPath() : packsItemPath(draft.id), {
        method: adding ? 'POST' : 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          adding
            ? packCreateBody(
                name,
                Number(schoolId),
                Number(gradeId),
                description,
                selectedBookIds,
              )
            : packPatchBody(name, description, selectedBookIds),
        ),
      })
      if (!alive.current) return
      if (response.status === 401) {
        await handleUnauthorized()
        return
      }
      if (!response.ok) {
        const message = await readError(
          response,
          'Could not save the pack. Check the name, school, grade, description, and books and try again.',
        )
        if (!alive.current) return
        setError(message)
        return
      }
      const saved = asPack(await response.json())
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

  async function onArchive(item: CatalogPack) {
    if (inFlight.current) return
    inFlight.current = true
    setError('')
    clearFieldFlags()
    setBusy(true)
    try {
      const response = await fetch(packsArchivePath(item.id), {
        method: 'POST',
        credentials: 'include',
      })
      if (!alive.current) return
      if (response.status === 401) {
        await handleUnauthorized()
        return
      }
      if (!response.ok) {
        const message = await readError(response, 'Could not archive the pack. Try again.')
        if (!alive.current) return
        setError(message)
        return
      }
      const saved = asPack(await response.json())
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
  const liveSchools = schools.filter((item) => item.archivedAt === null)
  const liveGrades = grades.filter((item) => item.archivedAt === null)
  const liveBooks = books.filter((item) => item.archivedAt === null)
  const editing = draft.mode === 'edit' ? items.find((item) => item.id === draft.id) : undefined

  return (
    <section>
      <h1 className="page-heading text-heading-lg">Packs</h1>
      {!loaded ? (
        <Spinner />
      ) : (
        <>
          {formOpen ? (
            <div className="account-summary">
              <form className="form-stack" onSubmit={(event) => void onSave(event)} noValidate>
                <div className={invalidName ? 'form-field is-invalid' : 'form-field'}>
                  <label className="text-label-caps" htmlFor="admin-pack-name">
                    Name
                  </label>
                  <input
                    id="admin-pack-name"
                    className="form-control"
                    type="text"
                    name="name"
                    autoComplete="off"
                    value={name}
                    aria-invalid={invalidName}
                    aria-describedby={error && invalidName ? errorId : undefined}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                {draft.mode === 'add' ? (
                  <>
                    <div className={invalidSchool ? 'form-field is-invalid' : 'form-field'}>
                      <label className="text-label-caps" htmlFor="admin-pack-school">
                        School
                      </label>
                      <select
                        id="admin-pack-school"
                        className="form-control"
                        name="schoolId"
                        value={schoolId}
                        aria-invalid={invalidSchool}
                        aria-describedby={error && invalidSchool ? errorId : undefined}
                        disabled={busy}
                        onChange={(event) => setSchoolId(event.target.value)}
                      >
                        <option value="">Select a school</option>
                        {liveSchools.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={invalidGrade ? 'form-field is-invalid' : 'form-field'}>
                      <label className="text-label-caps" htmlFor="admin-pack-grade">
                        Grade
                      </label>
                      <select
                        id="admin-pack-grade"
                        className="form-control"
                        name="gradeId"
                        value={gradeId}
                        aria-invalid={invalidGrade}
                        aria-describedby={error && invalidGrade ? errorId : undefined}
                        disabled={busy}
                        onChange={(event) => setGradeId(event.target.value)}
                      >
                        <option value="">Select a grade</option>
                        {liveGrades.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <p className="text-meta">
                    {namedLabel(schools, editing?.schoolId ?? Number(schoolId))}
                    {namedLabel(schools, editing?.schoolId ?? Number(schoolId)) &&
                    namedLabel(grades, editing?.gradeId ?? Number(gradeId))
                      ? ' · '
                      : ''}
                    {namedLabel(grades, editing?.gradeId ?? Number(gradeId))}
                  </p>
                )}
                <div className={invalidDescription ? 'form-field is-invalid' : 'form-field'}>
                  <label className="text-label-caps" htmlFor="admin-pack-description">
                    Description
                  </label>
                  <textarea
                    id="admin-pack-description"
                    className="form-control"
                    name="description"
                    rows={3}
                    value={description}
                    aria-invalid={invalidDescription}
                    aria-describedby={error && invalidDescription ? errorId : undefined}
                    disabled={busy}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className={invalidBooks ? 'form-field is-invalid' : 'form-field'}>
                  <p className="text-label-caps" id="admin-pack-books-label">
                    Books
                  </p>
                  <div
                    role="group"
                    aria-labelledby="admin-pack-books-label"
                    aria-invalid={invalidBooks}
                    aria-describedby={error && invalidBooks ? errorId : undefined}
                  >
                    {liveBooks.map((book) => (
                      <label key={book.id}>
                        <input
                          type="checkbox"
                          name="bookIds"
                          value={book.id}
                          checked={selectedBookIds.includes(book.id)}
                          disabled={busy}
                          onChange={() => toggleBook(book.id)}
                        />{' '}
                        {book.title}
                      </label>
                    ))}
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
                <p className="text-meta">There are no packs yet.</p>
              ) : null}
              <button
                className="button-primary press-travel"
                type="button"
                disabled={busy}
                onClick={openAdd}
              >
                Add pack
              </button>
            </div>
          ) : null}
          {items.length > 0 ? (
            <ul className="catalog-list">
              {items.map((item) => (
                <li key={item.id} className="catalog-row">
                  <p className="catalog-row-name">{item.name}</p>
                  <p className="text-meta">
                    {namedLabel(schools, item.schoolId)}
                    {namedLabel(schools, item.schoolId) && namedLabel(grades, item.gradeId)
                      ? ' · '
                      : ''}
                    {namedLabel(grades, item.gradeId)}
                  </p>
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
