export type CatalogPackBook = {
  id: number
  title: string
  price: number
  archivedAt: string | null
}

export type CatalogPack = {
  id: number
  name: string
  schoolId: number
  gradeId: number
  description: string
  price: number
  archivedAt: string | null
  books: CatalogPackBook[]
}

export function packCreateBody(
  name: string,
  schoolId: number,
  gradeId: number,
  description: string,
  bookIds: number[],
): {
  name: string
  schoolId: number
  gradeId: number
  description: string
  bookIds: number[]
} {
  return { name, schoolId, gradeId, description, bookIds }
}

export function packPatchBody(
  name: string,
  description: string,
  bookIds: number[],
): { name: string; description: string; bookIds: number[] } {
  return { name, description, bookIds }
}

export function packsCollectionPath(): string {
  return '/api/admin/packs'
}

export function packsItemPath(id: number): string {
  return `/api/admin/packs/${id}`
}

export function packsArchivePath(id: number): string {
  return `/api/admin/packs/${id}/archive`
}
