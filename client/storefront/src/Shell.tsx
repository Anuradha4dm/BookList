import { useEffect, useState, type ReactNode, type SVGProps } from 'react'
import { NavLink, Outlet, useNavigation } from 'react-router'
import { BrandLockup, Skeleton, Spinner } from '@booklist/ui'

const destinations = [
  { to: '/', label: 'Browse', icon: BrowseIcon, end: true },
  { to: '/cart', label: 'Cart', icon: CartIcon, end: false },
  { to: '/orders', label: 'Orders', icon: OrdersIcon, end: false },
  { to: '/account', label: 'Account', icon: AccountIcon, end: false },
] as const

function navClass(isActive: boolean, kind: 'nav' | 'tab'): string {
  const base = kind === 'tab' ? 'tabbar-item' : 'nav-item'
  return isActive ? `${base} is-active` : base
}

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
    <div className="storefront-shell">
      <header className="storefront-header">
        <BrandLockup />
        <nav className="storefront-topnav" aria-label="Storefront">
          {destinations.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => navClass(isActive, 'nav')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="storefront-main">{body}</main>
      <footer className="storefront-footer">
        We store your name, delivery address, WhatsApp number, and email so the shop can fulfil
        your order and reach you about it.
      </footer>
      <nav className="storefront-tabbar" aria-label="Storefront">
        {destinations.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => navClass(isActive, 'tab')}
          >
            <item.icon />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function BrowseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor" {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.2" />
      <rect x="13" y="3" width="8" height="8" rx="1.2" />
      <rect x="3" y="13" width="8" height="8" rx="1.2" />
      <rect x="13" y="13" width="8" height="8" rx="1.2" />
    </svg>
  )
}

function CartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor" {...props}>
      <path d="M4 5h2.2l1.3 9.4A2 2 0 0 0 9.5 16h7.8a2 2 0 0 0 2-1.6L21 8H7" />
      <circle cx="10" cy="19.5" r="1.6" />
      <circle cx="17" cy="19.5" r="1.6" />
    </svg>
  )
}

function OrdersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor" {...props}>
      <rect x="4" y="3.5" width="16" height="17" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 8h10M7 12h10M7 16h7" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function AccountIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor" {...props}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 19.2c.8-3.4 3.4-5.2 7-5.2s6.2 1.8 7 5.2" />
    </svg>
  )
}
