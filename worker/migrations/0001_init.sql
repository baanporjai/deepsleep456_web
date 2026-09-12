DROP TABLE IF EXISTS booking_nights;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS blocked_dates;
DROP TABLE IF EXISTS promotions;
DROP TABLE IF EXISTS add_ons;

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  total_amount INTEGER,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'deposit', 'paid_full')),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (check_out > check_in)
);

-- One row per reserved night. The primary key on night_date is what makes
-- double-booking impossible, including two concurrent requests racing for
-- the same night: whichever INSERT lands second violates the PK and fails.
CREATE TABLE booking_nights (
  night_date TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX idx_bookings_dates ON bookings(check_in, check_out);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_booking_nights_booking ON booking_nights(booking_id);
