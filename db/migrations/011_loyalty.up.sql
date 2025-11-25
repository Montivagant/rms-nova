CREATE TYPE loyalty_transaction_type AS ENUM ('earn', 'redeem', 'adjust', 'expiration');

CREATE TABLE loyalty_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_customer_id TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  pending_balance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, external_customer_id)
);
CREATE INDEX idx_loyalty_accounts_tenant ON loyalty_accounts (tenant_id, status);

CREATE TABLE loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  type loyalty_transaction_type NOT NULL,
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference TEXT,
  source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loyalty_transactions_account ON loyalty_transactions (tenant_id, account_id, created_at DESC);

CREATE TABLE loyalty_rules (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  earn_rate NUMERIC(10,4) NOT NULL DEFAULT 1.0,
  redeem_rate NUMERIC(10,4) NOT NULL DEFAULT 0.01,
  min_redeem_points INTEGER NOT NULL DEFAULT 0,
  expiration_days INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
