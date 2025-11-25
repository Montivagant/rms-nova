CREATE TABLE tenant_location_users (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES tenant_locations(id) ON DELETE CASCADE,
  can_assign BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id, location_id)
);

CREATE INDEX idx_tenant_location_users_user ON tenant_location_users (user_id);
CREATE INDEX idx_tenant_location_users_location ON tenant_location_users (location_id);
