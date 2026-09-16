import { CatalogNamedPage } from './CatalogNamedPage'

export function SchoolsPage() {
  return (
    <CatalogNamedPage
      kind="schools"
      title="Schools"
      entity="school"
      addLabel="Add school"
      emptyCopy="There are no schools yet."
    />
  )
}
