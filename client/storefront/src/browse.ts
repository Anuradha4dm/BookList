export type BrowseNamed = {
  id: number
  name: string
}

export type BrowsePack = {
  id: number
  name: string
  description: string
  price: number
}

export type BrowsePackBook = {
  id: number
  title: string
  price: number
}

export type BrowsePackLine = {
  bookId: number
  title: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

export type BrowsePackDetail = {
  id: number
  name: string
  description: string
  books: BrowsePackBook[]
  lines: BrowsePackLine[]
  total: number
}

export type BrowseItem = {
  id: number
  title: string
  description: string
  price: number
}

export function browseSchoolsPath(): string {
  return '/api/browse/schools'
}

export function browseGradesPath(schoolId: number): string {
  return `/api/browse/grades?schoolId=${schoolId}`
}

export function browsePacksPath(schoolId: number, gradeId: number): string {
  return `/api/browse/packs?schoolId=${schoolId}&gradeId=${gradeId}`
}

export function browsePackPath(id: number): string {
  return `/api/browse/packs/${id}`
}

export function packRoutePath(id: number): string {
  return `/packs/${id}`
}

export function browseItemsPath(): string {
  return '/api/browse/items'
}
