ALTER TABLE pos_payments
  ADD COLUMN processor TEXT,
  ADD COLUMN processor_payment_id TEXT,
  ADD COLUMN method_type TEXT,
  ADD COLUMN method_brand TEXT,
  ADD COLUMN method_last4 TEXT,
  ADD COLUMN receipt_url TEXT,
  ADD COLUMN failure_reason TEXT,
  ADD COLUMN captured_at TIMESTAMPTZ,
  ADD COLUMN refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX idx_pos_payments_processor ON pos_payments (processor, processor_payment_id);

CREATE TYPE payment_refund_status AS ENUM ('pending', 'completed', 'failed');

CREATE TABLE pos_payment_refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES pos_payments(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  status payment_refund_status NOT NULL DEFAULT 'pending',
  processor_refund_id TEXT,
  processed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_pos_payment_refunds_payment ON pos_payment_refunds (tenant_id, payment_id);
