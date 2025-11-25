-- 002_tenant_registrations.up.sql

CREATE TABLE IF NOT EXISTS tenant_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business JSONB NOT NULL,
  owner JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decision_reason TEXT,
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES users(id),
  tenant_id UUID,
  modules JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_registrations_status ON tenant_registrations(status, created_at);
