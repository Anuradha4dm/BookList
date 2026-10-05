import type Database from 'better-sqlite3'
import { listBooks } from '../catalog/books.js'
import { listItems } from '../catalog/items.js'
import { listNamed, type NamedRow } from '../catalog/named.js'
import { listPacks } from '../catalog/packs.js'
import { zipFiles, type ZipEntry } from './zip.js'

/**
 * The season export: order CSVs read from the orders tables (snapshot columns only), catalog
 * CSVs fed by the catalog module's own list functions, and a consistent copy of the database.
 * Everything is read inside one read transaction; nothing is written.
 */

type Cell = string | number | null | undefined

type OrderSqlRow = {
  id: number
  public_number: number
  placed_at: string
  status: string
  parent_name: string
  whatsapp: string
  second_phone: string | null
  delivery_address: string
  parent_delivery_note: string | null
  goods_total_rupees: number
  delivery_price_rupees: number | null
  payable_total_rupees: number | null
  call_attempted_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  cancelled_at: string | null
}

type PackBookSqlRow = {
  public_number: number
  position: number
  pack_name: string
  grade_name: string
  label: string
  title: string
  unit_price_rupees: number
  quantity: number
}

type ItemLineSqlRow = {
  public_number: number
  position: number
  title: string
  unit_price_rupees: number
  quantity: number
  line_total_rupees: number
}

const COLOMBO_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

type ColomboStamp = { date: string; hour: string; minute: string }

function colombo(at: Date): ColomboStamp | undefined {
  if (!Number.isFinite(at.getTime())) return undefined
  const parts = COLOMBO_PARTS.formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? ''
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    hour: part('hour'),
    minute: part('minute'),
  }
}

/** `YYYY-MM-DD HH:mm` in Asia/Colombo for a stored UTC time; blank when unset or unreadable. */
function colomboTime(value: string | null): string {
  if (!value) return ''
  const stamp = colombo(new Date(value))
  return stamp ? `${stamp.date} ${stamp.hour}:${stamp.minute}` : ''
}

/** `booklist-export-YYYY-MM-DD-HHmm.zip`, on the Asia/Colombo clock. */
export function exportFileName(now: Date): string {
  const stamp = colombo(now)
  if (!stamp) throw new Error('invalid export time')
  return `booklist-export-${stamp.date}-${stamp.hour}${stamp.minute}.zip`
}

/** `+` then only digits and spaces, with at least one digit: a stored phone such as `+94771234567`. */
const PHONE_SHAPED = /^\+[\d ]*\d[\d ]*$/

/**
 * A cell Excel reads back as text: formula starters get a leading `'` (phone-shaped values are
 * written as is), then RFC 4180 quoting.
 */
function csvCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(value)
  let text = value
  if (/^[=+\-@\t\r]/.test(text) && !PHONE_SHAPED.test(text)) text = `'${text}`
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

/** UTF-8 with a BOM, CRLF line endings and a header row. */
export function toCsv(header: string[], rows: Cell[][]): Buffer {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','))
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8')
}

function orderNumber(publicNumber: number): string {
  return `#${publicNumber}`
}

function cancelledBy(value: string | null): string {
  if (value === 'parent') return 'Parent'
  if (value === 'admin') return 'Shop'
  return ''
}

function archived(archivedAt: string | null): string {
  return archivedAt === null ? 'No' : 'Yes'
}

function ordersCsv(db: Database.Database): Buffer {
  const rows = db
    .prepare(
      `SELECT id, public_number, placed_at, status, parent_name, whatsapp, second_phone,
              delivery_address, parent_delivery_note, goods_total_rupees, delivery_price_rupees,
              payable_total_rupees, call_attempted_at, cancelled_by, cancellation_reason, cancelled_at
       FROM orders
       ORDER BY public_number`,
    )
    .all() as OrderSqlRow[]
  return toCsv(
    [
      'Order',
      'Placed',
      'Status',
      'Parent',
      'WhatsApp',
      'Second phone',
      'Address',
      'Note',
      'Goods total',
      'Delivery charge',
      'Payable total',
      'Call attempted',
      'Cancelled by',
      'Cancellation reason',
      'Cancelled at',
    ],
    rows.map((row) => [
      orderNumber(row.public_number),
      colomboTime(row.placed_at),
      row.status,
      row.parent_name,
      row.whatsapp,
      row.second_phone,
      row.delivery_address,
      row.parent_delivery_note,
      row.goods_total_rupees,
      row.delivery_price_rupees,
      row.payable_total_rupees,
      colomboTime(row.call_attempted_at),
      cancelledBy(row.cancelled_by),
      row.cancellation_reason,
      colomboTime(row.cancelled_at),
    ]),
  )
}

function orderLinesCsv(db: Database.Database): Buffer {
  const packBooks = db
    .prepare(
      `SELECT o.public_number, l.position, l.pack_name, l.grade_name, l.label,
              b.title, b.unit_price_rupees, b.quantity
       FROM order_pack_line_books b
       JOIN order_pack_lines l ON l.id = b.line_id
       JOIN orders o ON o.id = l.order_id
       ORDER BY o.public_number, l.position, l.id, b.rowid`,
    )
    .all() as PackBookSqlRow[]
  const itemLines = db
    .prepare(
      `SELECT o.public_number, i.position, i.title, i.unit_price_rupees, i.quantity,
              i.line_total_rupees
       FROM order_item_lines i
       JOIN orders o ON o.id = i.order_id
       ORDER BY o.public_number, i.position, i.id`,
    )
    .all() as ItemLineSqlRow[]

  type Line = { publicNumber: number; position: number; seq: number; cells: Cell[] }
  const lines: Line[] = []
  for (const row of packBooks) {
    lines.push({
      publicNumber: row.public_number,
      position: row.position,
      seq: lines.length,
      cells: [
        orderNumber(row.public_number),
        row.position,
        'Pack',
        row.pack_name,
        row.grade_name,
        row.label,
        row.title,
        row.unit_price_rupees,
        row.quantity,
        row.unit_price_rupees * row.quantity,
      ],
    })
  }
  for (const row of itemLines) {
    lines.push({
      publicNumber: row.public_number,
      position: row.position,
      seq: lines.length,
      cells: [
        orderNumber(row.public_number),
        row.position,
        'Item',
        null,
        null,
        null,
        row.title,
        row.unit_price_rupees,
        row.quantity,
        row.line_total_rupees,
      ],
    })
  }
  lines.sort((a, b) => a.publicNumber - b.publicNumber || a.position - b.position || a.seq - b.seq)

  return toCsv(
    ['Order', 'Line', 'Kind', 'Pack', 'Grade', 'Label', 'Title', 'Unit price', 'Quantity', 'Line total'],
    lines.map((line) => line.cells),
  )
}

function namedCsv(rows: NamedRow[]): Buffer {
  return toCsv(
    ['ID', 'Name', 'Archived'],
    rows.map((row) => [row.id, row.name, archived(row.archivedAt)]),
  )
}

function catalogCsvs(db: Database.Database): ZipEntry[] {
  const schools = listNamed(db, 'school')
  const grades = listNamed(db, 'grade')
  const schoolNames = new Map(schools.map((row) => [row.id, row.name]))
  const gradeNames = new Map(grades.map((row) => [row.id, row.name]))

  const books = toCsv(
    ['ID', 'Title', 'Price', 'Archived'],
    listBooks(db).map((row) => [row.id, row.title, row.price, archived(row.archivedAt)]),
  )
  const items = toCsv(
    ['ID', 'Title', 'Description', 'Price', 'Archived'],
    listItems(db).map((row) => [row.id, row.title, row.description, row.price, archived(row.archivedAt)]),
  )
  const packs = toCsv(
    ['ID', 'Name', 'School', 'Grade', 'Description', 'Price', 'Archived', 'Books'],
    listPacks(db).map((row) => [
      row.id,
      row.name,
      schoolNames.get(row.schoolId) ?? '',
      gradeNames.get(row.gradeId) ?? '',
      row.description,
      row.price,
      archived(row.archivedAt),
      row.books.map((book) => book.title).join('; '),
    ]),
  )

  return [
    { name: 'schools.csv', data: namedCsv(schools) },
    { name: 'grades.csv', data: namedCsv(grades) },
    { name: 'books.csv', data: books },
    { name: 'items.csv', data: items },
    { name: 'packs.csv', data: packs },
  ]
}

/** The whole season as one zip; throws on any failure so no partial zip is ever sent. */
export function buildSeasonExport(db: Database.Database, now: Date): { fileName: string; zip: Buffer } {
  const fileName = exportFileName(now)
  const entries = db.transaction((): ZipEntry[] => [
    { name: 'orders.csv', data: ordersCsv(db) },
    { name: 'order-lines.csv', data: orderLinesCsv(db) },
    ...catalogCsvs(db),
    // The same read snapshot, WAL included: a restorable image of the whole file.
    { name: 'booklist.db', data: db.serialize() },
  ]).deferred()
  return { fileName, zip: zipFiles(entries, now) }
}
