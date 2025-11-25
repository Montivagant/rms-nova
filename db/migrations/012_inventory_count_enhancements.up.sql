ALTER TABLE inventory_counts
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS count_id UUID REFERENCES inventory_counts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_count_id ON inventory_movements (count_id);
