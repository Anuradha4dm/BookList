CREATE TABLE orders (
  id INTEGER PRIMARY KEY NOT NULL,
  parent_id INTEGER NOT NULL,
  public_number INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'Order Is Placed',
    'Order Confirmed',
    'Processing',
    'Packing The Order',
    'Ready To Deliver',
    'On Delivery Partner',
    'Delivered',
    'Cancelled'
  )),
  parent_name TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  second_phone TEXT,
  parent_delivery_note TEXT,
  goods_total_rupees INTEGER NOT NULL CHECK (goods_total_rupees >= 0),
  placed_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES parents (id),
  UNIQUE (public_number),
  UNIQUE (parent_id, idempotency_key)
);

CREATE TABLE order_pack_lines (
  id INTEGER PRIMARY KEY NOT NULL,
  order_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  pack_id INTEGER NOT NULL,
  pack_name TEXT NOT NULL,
  label TEXT NOT NULL,
  grade_name TEXT NOT NULL,
  line_total_rupees INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

CREATE TABLE order_pack_line_books (
  line_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  unit_price_rupees INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  PRIMARY KEY (line_id, book_id),
  FOREIGN KEY (line_id) REFERENCES order_pack_lines (id) ON DELETE CASCADE
);

CREATE TABLE order_item_lines (
  id INTEGER PRIMARY KEY NOT NULL,
  order_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  unit_price_rupees INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  line_total_rupees INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

CREATE INDEX orders_parent_id ON orders (parent_id);
CREATE INDEX order_pack_lines_order_id ON order_pack_lines (order_id);
CREATE INDEX order_item_lines_order_id ON order_item_lines (order_id);
