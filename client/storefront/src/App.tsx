import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router'
import { AuthGate } from './AuthGate'
import { Shell } from './Shell'
import { useSession } from './auth'

function Page({ title }: { title: string }) {
  return (
    <section>
      <h1 className="page-heading text-heading-lg">{title}</h1>
      <div className="page-region" />
    </section>
  )
}

function AccountPage() {
  const session = useSession()
  return (
    <section>
      <h1 className="page-heading text-heading-lg">Account</h1>
      <div className="account-summary">
        <p className="text-meta">Signed in as {session.email}</p>
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

function BlankPage() {
  return null
}

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route element={<Shell />}>
        <Route index element={<Page title="Browse" />} />
        <Route element={<AuthGate />}>
          <Route path="cart" element={<Page title="Cart" />} />
          <Route path="orders" element={<Page title="Orders" />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Route>
      <Route path="*" element={<BlankPage />} />
    </>,
  ),
)
