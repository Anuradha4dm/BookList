CREATE TABLE cart_pack_lines (
  id INTEGER PRIMARY KEY NOT NULL,
  parent_id INTEGER NOT NULL,
  pack_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  grade_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES parents (id),
  UNIQUE (parent_id, pack_id, sequence)
);

CREATE TABLE cart_pack_line_members (
  line_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  included INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  title TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  PRIMARY KEY (line_id, book_id),
  FOREIGN KEY (line_id) REFERENCES cart_pack_lines (id) ON DELETE CASCADE
);

CREATE INDEX cart_pack_lines_parent_id ON cart_pack_lines (parent_id);
