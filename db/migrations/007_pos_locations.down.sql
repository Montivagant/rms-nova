DROP INDEX IF EXISTS idx_pos_payments_location;
DROP INDEX IF EXISTS idx_pos_tickets_location;

ALTER TABLE pos_payments
  DROP COLUMN IF EXISTS location_id;

ALTER TABLE pos_tickets
  DROP COLUMN IF EXISTS location_id;
