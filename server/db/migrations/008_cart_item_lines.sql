CREATE TABLE cart_item_lines (
  id INTEGER PRIMARY KEY NOT NULL,
  parent_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  title TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES parents (id),
  UNIQUE (parent_id, item_id)
);

CREATE INDEX cart_item_lines_parent_id ON cart_item_lines (parent_id);
