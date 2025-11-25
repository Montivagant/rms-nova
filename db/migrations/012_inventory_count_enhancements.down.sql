DROP INDEX IF EXISTS idx_inventory_movements_count_id;

ALTER TABLE inventory_movements
  DROP COLUMN IF EXISTS count_id,
  DROP COLUMN IF EXISTS attachment_url,
  DROP COLUMN IF EXISTS source;

ALTER TABLE inventory_counts
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS started_at,
  DROP COLUMN IF EXISTS notes;
