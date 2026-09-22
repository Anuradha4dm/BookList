import type { BrowsePackBook, BrowsePackDetail } from './browse'

export const QUANTITY_MIN = 1
export const QUANTITY_MAX = 20

export type Choice = {
  ticked: boolean
  quantity: number
}

export type Choices = Record<number, Choice>

export type ConfiguredLine = {
  book: BrowsePackBook
  quantity: number
  lineTotal: number
}

/** The read arrives pre-ticked: every live book carries a line at quantity 1. */
export function initialChoices(detail: BrowsePackDetail): Choices {
  const choices: Choices = {}
  for (const book of detail.books) choices[book.id] = { ticked: false, quantity: QUANTITY_MIN }
  for (const line of detail.lines) choices[line.bookId] = { ticked: true, quantity: line.quantity }
  return choices
}

export function tickedCount(choices: Choices): number {
  return Object.values(choices).filter((choice) => choice.ticked).length
}

/** The last ticked title cannot be unticked; the row says why. */
export function toggleChoice(choices: Choices, bookId: number): Choices {
  const choice = choices[bookId]
  if (!choice) return choices
  if (choice.ticked && tickedCount(choices) <= 1) return choices
  return { ...choices, [bookId]: { ...choice, ticked: !choice.ticked } }
}

/** Minus at quantity 1 unticks the title, unless it is the last one ticked. */
export function decreaseChoice(choices: Choices, bookId: number): Choices {
  const choice = choices[bookId]
  if (!choice?.ticked) return choices
  if (choice.quantity > QUANTITY_MIN) {
    return { ...choices, [bookId]: { ...choice, quantity: choice.quantity - 1 } }
  }
  if (tickedCount(choices) <= 1) return choices
  return { ...choices, [bookId]: { ticked: false, quantity: QUANTITY_MIN } }
}

export function increaseChoice(choices: Choices, bookId: number): Choices {
  const choice = choices[bookId]
  if (!choice?.ticked || choice.quantity >= QUANTITY_MAX) return choices
  return { ...choices, [bookId]: { ...choice, quantity: choice.quantity + 1 } }
}

export function configuredLines(books: BrowsePackBook[], choices: Choices): ConfiguredLine[] {
  const lines: ConfiguredLine[] = []
  for (const book of books) {
    const choice = choices[book.id]
    if (!choice?.ticked) continue
    lines.push({ book, quantity: choice.quantity, lineTotal: book.price * choice.quantity })
  }
  return lines
}

export function runningTotal(lines: ConfiguredLine[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0)
}

/** The one title whose checkbox and minus-at-1 are locked, if there is one. */
export function lockedBookId(lines: ConfiguredLine[]): number | undefined {
  return lines.length === 1 ? lines[0].book.id : undefined
}
