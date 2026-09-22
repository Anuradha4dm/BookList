CREATE TABLE items (
  id INTEGER PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL
);
