-- When the shop last tried to call about a placed order (UTC). Story 4.5 writes it.
ALTER TABLE orders ADD COLUMN call_attempted_at TEXT;
