import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigation } from 'react-router'
import { BrandLockup, Skeleton, Spinner } from '@booklist/ui'

const destinations = [
  { to: '/', label: 'Orders', end: true },
  { to: '/schools', label: 'Schools', end: false },
  { to: '/grades', label: 'Grades', end: false },
  { to: '/books', label: 'Book master', end: false },
  { to: '/packs', label: 'Packs', end: false },
  { to: '/items', label: 'Items', end: false },
] as const

export function Shell() {
  const navigation = useNavigation()
  const [cold, setCold] = useState(true)

  useEffect(() => {
    setCold(false)
  }, [])

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
          <NavLink
            to="/export"
            className={({ isActive }) => (isActive ? 'nav-item is-active' : 'nav-item')}
          >
            Export
          </NavLink>
        </div>
      </aside>
      <main className="admin-main">{body}</main>
    </div>
  )
}
