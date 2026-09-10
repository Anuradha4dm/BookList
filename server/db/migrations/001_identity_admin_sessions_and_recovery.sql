CREATE TABLE admins (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  admin_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admins (id)
);

CREATE TABLE admin_recovery (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
