import type Database from 'better-sqlite3'

/**
 * Deletes every line in the parent's cart: pack members, then pack lines, then item lines.
 * Runs in its own transaction, which nests as a SAVEPOINT inside a caller's transaction.
 */
export function emptyCart(db: Database.Database, parentId: number): void {
  db.transaction(() => {
    db.prepare(
      `DELETE FROM cart_pack_line_members
       WHERE line_id IN (SELECT id FROM cart_pack_lines WHERE parent_id = ?)`,
    ).run(parentId)
    db.prepare('DELETE FROM cart_pack_lines WHERE parent_id = ?').run(parentId)
    db.prepare('DELETE FROM cart_item_lines WHERE parent_id = ?').run(parentId)
  })()
}
