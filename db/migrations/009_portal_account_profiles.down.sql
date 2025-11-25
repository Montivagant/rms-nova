DROP INDEX IF EXISTS idx_inventory_movements_tenant_created_at;
ALTER TABLE inventory_movements
  DROP COLUMN IF EXISTS location_id;

DROP TABLE IF EXISTS tenant_business_profiles;
