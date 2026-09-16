import { CatalogNamedPage } from './CatalogNamedPage'

export function GradesPage() {
  return (
    <CatalogNamedPage
      kind="grades"
      title="Grades"
      entity="grade"
      addLabel="Add grade"
      emptyCopy="There are no grades yet."
    />
  )
}
