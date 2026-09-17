export type CatalogBook = {
  id: number
  title: string
  price: number
  archivedAt: string | null
}

export function bookBody(title: string, price: number): { title: string; price: number } {
  return { title, price }
}

export function booksCollectionPath(): string {
  return '/api/admin/books'
}

export function booksItemPath(id: number): string {
  return `/api/admin/books/${id}`
}

export function booksArchivePath(id: number): string {
  return `/api/admin/books/${id}/archive`
}
