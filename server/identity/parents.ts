import type Database from 'better-sqlite3'
import { hashSecret } from './passwords.js'
import { normalizeEmail } from './seed.js'

export type ParentRow = {
  id: number
  email: string
  password_hash: string
  name: string
  delivery_address: string
  whatsapp: string
  second_phone: string | null
}

export type NewParent = {
  email: string
  password: string
  name: string
  deliveryAddress: string
  whatsapp: string
  secondPhone: string | null
}

/** An email already held by a parent, or by the one admin. */
export class EmailTakenError extends Error {
  constructor() {
    super('email taken')
    this.name = 'EmailTakenError'
  }
}

const PARENT_COLUMNS =
  'id, email, password_hash, name, delivery_address, whatsapp, second_phone'

export function findParentByEmail(db: Database.Database, email: string): ParentRow | undefined {
  return db.prepare(`SELECT ${PARENT_COLUMNS} FROM parents WHERE email = ?`).get(normalizeEmail(email)) as
    | ParentRow
    | undefined
}

export function findParentById(db: Database.Database, id: number): ParentRow | undefined {
  return db.prepare(`SELECT ${PARENT_COLUMNS} FROM parents WHERE id = ?`).get(id) as
    | ParentRow
    | undefined
}

function isEmailTaken(db: Database.Database, email: string): boolean {
  const admin = db.prepare('SELECT id FROM admins WHERE email = ?').get(email)
  if (admin) return true
  return db.prepare('SELECT id FROM parents WHERE email = ?').get(email) !== undefined
}

/** Only the unique-email race. A CHECK or NOT NULL failure is a bug, not a taken email. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  )
}

export async function createParent(db: Database.Database, input: NewParent): Promise<ParentRow> {
  const email = normalizeEmail(input.email)
  if (isEmailTaken(db, email)) throw new EmailTakenError()

  const passwordHash = await hashSecret(input.password)
  const now = new Date().toISOString()

  const insert = db.transaction((): number => {
    if (isEmailTaken(db, email)) throw new EmailTakenError()
    const result = db
      .prepare(
        `INSERT INTO parents (email, password_hash, name, delivery_address, whatsapp, second_phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        email,
        passwordHash,
        input.name,
        input.deliveryAddress,
        input.whatsapp,
        input.secondPhone,
        now,
      )
    return Number(result.lastInsertRowid)
  })

  let id: number
  try {
    id = insert()
  } catch (error) {
    if (isUniqueViolation(error)) throw new EmailTakenError()
    throw error
  }

  const created = findParentById(db, id)
  if (!created) throw new Error('parent row vanished after insert')
  return created
}

export type ParentContact = {
  name: string
  deliveryAddress: string
  whatsapp: string
  secondPhone: string | null
}

export function updateParent(
  db: Database.Database,
  id: number,
  contact: ParentContact,
): ParentRow {
  const result = db
    .prepare(
      `UPDATE parents SET name = ?, delivery_address = ?, whatsapp = ?, second_phone = ?
       WHERE id = ?`,
    )
    .run(contact.name, contact.deliveryAddress, contact.whatsapp, contact.secondPhone, id)
  if (result.changes !== 1) throw new Error('parent row vanished before update')
  const updated = findParentById(db, id)
  if (!updated) throw new Error('parent row vanished after update')
  return updated
}

/** Hash first (if a password is given), then write contact and hash in one transaction. */
export async function saveParentProfile(
  db: Database.Database,
  id: number,
  contact: ParentContact,
  password?: string,
): Promise<ParentRow> {
  const passwordHash = password !== undefined ? await hashSecret(password) : undefined
  const apply = db.transaction((): ParentRow => {
    const parent = updateParent(db, id, contact)
    if (passwordHash === undefined) return parent
    const result = db
      .prepare('UPDATE parents SET password_hash = ? WHERE id = ?')
      .run(passwordHash, id)
    if (result.changes !== 1) throw new Error('parent row vanished before password update')
    const updated = findParentById(db, id)
    if (!updated) throw new Error('parent row vanished after password update')
    return updated
  })
  return apply()
}
