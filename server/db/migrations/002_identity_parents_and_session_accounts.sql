CREATE TABLE parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  second_phone TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions_rebuilt (
  id TEXT PRIMARY KEY NOT NULL,
  admin_id INTEGER,
  parent_id INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admins (id),
  FOREIGN KEY (parent_id) REFERENCES parents (id),
  CHECK ((admin_id IS NOT NULL) + (parent_id IS NOT NULL) = 1)
);

INSERT INTO sessions_rebuilt (id, admin_id, parent_id, created_at, expires_at)
SELECT id, admin_id, NULL, created_at, expires_at FROM sessions;

DROP TABLE sessions;

ALTER TABLE sessions_rebuilt RENAME TO sessions;

CREATE INDEX sessions_admin_id ON sessions (admin_id);
CREATE INDEX sessions_parent_id ON sessions (parent_id);
