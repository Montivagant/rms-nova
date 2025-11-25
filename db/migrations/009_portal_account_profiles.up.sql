CREATE TABLE tenant_business_profiles (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  doing_business_as TEXT,
  support_email TEXT,
  support_phone TEXT,
  website TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenant_business_profiles (
  tenant_id,
  legal_name,
  doing_business_as,
  support_email,
  support_phone,
  website,
  timezone,
  notes
)
SELECT
  id AS tenant_id,
  name AS legal_name,
  name AS doing_business_as,
  NULL AS support_email,
  NULL AS support_phone,
  NULL AS website,
  timezone,
  NULL AS notes
FROM tenants;

ALTER TABLE inventory_movements
  ADD COLUMN location_id UUID REFERENCES tenant_locations(id);

CREATE INDEX idx_inventory_movements_tenant_created_at
  ON inventory_movements (tenant_id, created_at DESC);
