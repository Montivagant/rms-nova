CREATE TABLE IF NOT EXISTS inventory_count_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  count_id UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_attachments_tenant
  ON inventory_count_attachments (tenant_id, count_id);
