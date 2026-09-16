import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router'
import { AdminGate } from './AdminGate'
import { GradesPage } from './GradesPage'
import { ParentsPage } from './ParentsPage'
import { SchoolsPage } from './SchoolsPage'
import { SettingsPage } from './SettingsPage'
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
    <Route element={<AdminGate />}>
      <Route element={<Shell />}>
        <Route index element={<Page title="Orders" />} />
        <Route path="schools" element={<SchoolsPage />} />
        <Route path="grades" element={<GradesPage />} />
        <Route path="books" element={<Page title="Book master" />} />
        <Route path="packs" element={<Page title="Packs" />} />
        <Route path="items" element={<Page title="Items" />} />
        <Route path="parents" element={<ParentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="export" element={<Page title="Export" />} />
      </Route>
      <Route path="*" element={<BlankPage />} />
    </Route>,
  ),
  { basename: '/admin' },
)
