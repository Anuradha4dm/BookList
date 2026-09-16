CREATE TABLE schools (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE grades (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL
);
