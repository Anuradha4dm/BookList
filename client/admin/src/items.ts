export type CatalogItem = {
  id: number
  title: string
  description: string
  price: number
  archivedAt: string | null
}

export function itemBody(
  title: string,
  description: string,
  price: number,
): { title: string; description: string; price: number } {
  return { title, description, price }
}

export function itemsCollectionPath(): string {
  return '/api/admin/items'
}

export function itemsItemPath(id: number): string {
  return `/api/admin/items/${id}`
}

export function itemsArchivePath(id: number): string {
  return `/api/admin/items/${id}/archive`
}
