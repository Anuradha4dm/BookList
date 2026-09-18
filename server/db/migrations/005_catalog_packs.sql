CREATE TABLE packs (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  school_id INTEGER NOT NULL,
  grade_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE pack_books (
  pack_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  PRIMARY KEY (pack_id, book_id)
);
