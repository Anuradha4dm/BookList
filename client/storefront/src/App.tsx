import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router'
import { AccountPage } from './AccountPage'
import { AuthGate } from './AuthGate'
import { BrowsePage } from './BrowsePage'
import { ItemsPage } from './ItemsPage'
import { PackPage } from './PackPage'
import { Shell } from './Shell'

function Page({ title }: { title: string }) {
  return (
    <section>
      <h1 className="page-heading text-heading-lg">{title}</h1>
      <div className="page-region" />
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
        <Route index element={<BrowsePage />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="packs/:id" element={<PackPage />} />
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
