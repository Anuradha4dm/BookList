import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router'
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
        <Route index element={<Page title="Browse" />} />
        <Route path="cart" element={<Page title="Cart" />} />
        <Route path="orders" element={<Page title="Orders" />} />
        <Route path="account" element={<Page title="Account" />} />
      </Route>
      <Route path="*" element={<BlankPage />} />
    </>,
  ),
)
