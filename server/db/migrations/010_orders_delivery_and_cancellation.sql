ALTER TABLE orders ADD COLUMN delivery_price_rupees INTEGER CHECK (delivery_price_rupees >= 0);
ALTER TABLE orders ADD COLUMN payable_total_rupees INTEGER CHECK (payable_total_rupees >= 0);
ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN cancelled_by TEXT CHECK (cancelled_by IN ('parent', 'admin'));
ALTER TABLE orders ADD COLUMN cancelled_at TEXT;

-- A Cancelled order never carries a payable total. SQLite cannot add a cross-column CHECK
-- with ALTER, so this trigger is the database's backstop.
CREATE TRIGGER orders_cancelled_without_payable
BEFORE UPDATE ON orders
WHEN NEW.status = 'Cancelled' AND NEW.payable_total_rupees IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'a Cancelled order cannot carry a payable total');
END;

CREATE TRIGGER orders_cancelled_without_payable_insert
BEFORE INSERT ON orders
WHEN NEW.status = 'Cancelled' AND NEW.payable_total_rupees IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'a Cancelled order cannot carry a payable total');
END;
