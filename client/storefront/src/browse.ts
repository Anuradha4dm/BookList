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

export function browseItemsPath(): string {
  return '/api/browse/items'
}
