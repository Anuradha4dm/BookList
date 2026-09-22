import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Spinner, formatRupees } from '@booklist/ui'
import {
  browseGradesPath,
  browsePacksPath,
  browseSchoolsPath,
  type BrowseNamed,
  type BrowsePack,
} from './browse'

const EMPTY_COPY = 'we are working on this now'
const UNREACHABLE = 'Could not reach the shop. Try again.'

export function BrowsePage() {
  const [schools, setSchools] = useState<BrowseNamed[] | null>(null)
  const [grades, setGrades] = useState<BrowseNamed[] | null>(null)
  const [packs, setPacks] = useState<BrowsePack[] | null>(null)
  const [schoolId, setSchoolId] = useState('')
  const [gradeId, setGradeId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void fetch(browseSchoolsPath(), { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('load failed')
        return (await response.json()) as BrowseNamed[]
      })
      .then((list) => {
        setSchools(list)
        setError('')
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setSchools([])
        setError(UNREACHABLE)
        void err
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!schoolId) {
      setGrades(null)
      setGradeId('')
      setPacks(null)
      return
    }
    const id = Number(schoolId)
    const controller = new AbortController()
    setError('')
    setGrades(null)
    setGradeId('')
    setPacks(null)
    void fetch(browseGradesPath(id), { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('load failed')
        return (await response.json()) as BrowseNamed[]
      })
      .then((list) => {
        setGrades(list)
        setError('')
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setGrades([])
        setError(UNREACHABLE)
        void err
      })
    return () => controller.abort()
  }, [schoolId])

  useEffect(() => {
    if (!schoolId || !gradeId) {
      setPacks(null)
      return
    }
    const school = Number(schoolId)
    const grade = Number(gradeId)
    const controller = new AbortController()
    setPacks(null)
    void fetch(browsePacksPath(school, grade), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('load failed')
        return (await response.json()) as BrowsePack[]
      })
      .then((list) => {
        setPacks(list)
        setError('')
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setPacks([])
        setError(UNREACHABLE)
        void err
      })
    return () => controller.abort()
  }, [schoolId, gradeId])

  const schoolsReady = schools !== null
  const zeroSchools = schoolsReady && schools.length === 0 && !error
  const bothSelected = Boolean(schoolId && gradeId)
  const packsReady = packs !== null
  const showGradeEmpty =
    Boolean(schoolId) && grades !== null && grades.length === 0 && !error
  const showPackEmpty = bothSelected && packsReady && packs.length === 0 && !error
  const showPackList = bothSelected && packsReady && packs.length > 0

  return (
    <section>
      <h1 className="page-heading text-heading-lg">Browse</h1>
      <p className="text-meta">
        <Link to="/items">Items</Link>
      </p>
      {error ? (
        <p className="form-error text-meta" role="alert">
          {error}
        </p>
      ) : null}
      {!schoolsReady ? <Spinner /> : null}
      {zeroSchools ? <p className="text-meta">{EMPTY_COPY}</p> : null}
      {schoolsReady && schools.length > 0 ? (
        <div className="page-region">
          <div className="form-field">
            <label className="text-label-caps" htmlFor="browse-school">
              School
            </label>
            <select
              id="browse-school"
              className="form-control"
              name="schoolId"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
            >
              <option value="">Select a school</option>
              {schools.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="text-label-caps" htmlFor="browse-grade">
              Grade
            </label>
            <select
              id="browse-grade"
              className="form-control"
              name="gradeId"
              value={gradeId}
              disabled={!schoolId || grades === null}
              onChange={(event) => setGradeId(event.target.value)}
            >
              <option value="">Select a grade</option>
              {(grades ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          {showGradeEmpty ? <p className="text-meta">{EMPTY_COPY}</p> : null}
          {bothSelected && !packsReady ? <Spinner /> : null}
          {showPackEmpty ? <p className="text-meta">{EMPTY_COPY}</p> : null}
          {showPackList ? (
            <ul className="catalog-list">
              {packs.map((pack) => (
                <li key={pack.id} className="catalog-row">
                  <p className="catalog-row-name">{pack.name}</p>
                  <p className="text-meta">{pack.description}</p>
                  <p className="text-amount-row">{formatRupees(pack.price)}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
