import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigation } from 'react-router'
import { BrandLockup, Skeleton, Spinner } from '@booklist/ui'
import { useAdminAuth } from './auth'
import { downloadBlob, exportErrorFor, exportSeason } from './exportSeason'

const destinations = [
  { to: '/', label: 'Orders', end: true },
  { to: '/schools', label: 'Schools', end: false },
  { to: '/grades', label: 'Grades', end: false },
  { to: '/books', label: 'Book master', end: false },
  { to: '/packs', label: 'Packs', end: false },
  { to: '/items', label: 'Items', end: false },
  { to: '/parents', label: 'Parents', end: false },
  { to: '/settings', label: 'Settings', end: false },
] as const

export function Shell() {
  const navigation = useNavigation()
  const { signOut, logoutError } = useAdminAuth()
  const [cold, setCold] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const exportingRef = useRef(false)

  useEffect(() => {
    setCold(false)
  }, [])

  async function runExport(): Promise<void> {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    setExportError(exportErrorFor('start'))
    try {
      const outcome = await exportSeason({ fetch: (input, init) => fetch(input, init), signOut, download: downloadBlob })
      setExportError(exportErrorFor(outcome))
    } finally {
      exportingRef.current = false
      setExporting(false)
    }
  }

  let body: ReactNode
  if (cold) {
    body = <Skeleton />
  } else if (navigation.state === 'loading' || navigation.state === 'submitting') {
    body = <Spinner />
  } else {
    body = <Outlet />
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar chrome">
        <BrandLockup />
        <button type="button" className="nav-item" onClick={() => void signOut()}>
          Log out
        </button>
        {logoutError ? (
          <p className="form-error text-meta" role="alert">
            {logoutError}
          </p>
        ) : null}
        <nav className="admin-sidebar-nav" aria-label="Admin">
          {destinations.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-item is-active' : 'nav-item')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-export">
          <button
            type="button"
            className="nav-item admin-export-button"
            aria-busy={exporting}
            aria-disabled={exporting}
            aria-label={exporting ? 'Exporting' : undefined}
            onClick={() => void runExport()}
          >
            {exporting ? <span className="spinner-disc is-inline" aria-hidden="true" /> : 'Export'}
          </button>
          {exportError ? (
            <p className="form-error text-meta admin-export-error" role="alert">
              {exportError}
            </p>
          ) : null}
        </div>
      </aside>
      <main className="admin-main">{body}</main>
    </div>
  )
}
