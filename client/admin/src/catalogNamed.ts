export type CatalogKind = 'schools' | 'grades'

export type CatalogNamedItem = {
  id: number
  name: string
  archivedAt: string | null
}

export function catalogNameBody(name: string): { name: string } {
  return { name }
}

export function catalogCollectionPath(kind: CatalogKind): string {
  return `/api/admin/${kind}`
}

export function catalogItemPath(kind: CatalogKind, id: number): string {
  return `/api/admin/${kind}/${id}`
}

export function catalogArchivePath(kind: CatalogKind, id: number): string {
  return `/api/admin/${kind}/${id}/archive`
}
