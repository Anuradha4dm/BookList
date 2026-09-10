import type Database from 'better-sqlite3'
import {
  generateRecoveryCode,
  hashSecret,
  printRecoveryCode,
} from './passwords.js'

export type IdentityEnv = {
  ADMIN_EMAIL: string
  ADMIN_PASSWORD: string
  SESSION_SECRET: string
}

export function enableForeignKeys(db: Database.Database): void {
  db.pragma('foreign_keys = ON')
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function seedAdmin(db: Database.Database, env: IdentityEnv): Promise<void> {
  enableForeignKeys(db)
  const existing = db.prepare('SELECT id FROM admins LIMIT 1').get()
  if (existing) return

  const email = normalizeEmail(env.ADMIN_EMAIL)
  const passwordHash = await hashSecret(env.ADMIN_PASSWORD)
  const recoveryCode = generateRecoveryCode()
  const codeHash = await hashSecret(recoveryCode)
  const now = new Date().toISOString()

  const insert = db.transaction(() => {
    db.prepare(
      'INSERT INTO admins (id, email, password_hash, created_at) VALUES (1, ?, ?, ?)',
    ).run(email, passwordHash, now)
    db.prepare(
      'INSERT INTO admin_recovery (id, code_hash, created_at) VALUES (1, ?, ?)',
    ).run(codeHash, now)
  })
  insert()
  printRecoveryCode(recoveryCode)
}
