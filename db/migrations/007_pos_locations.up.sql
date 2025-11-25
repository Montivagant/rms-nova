ALTER TABLE pos_tickets
  ADD COLUMN location_id UUID;

ALTER TABLE pos_payments
  ADD COLUMN location_id UUID;

CREATE INDEX idx_pos_tickets_location ON pos_tickets (tenant_id, location_id);
CREATE INDEX idx_pos_payments_location ON pos_payments (tenant_id, location_id);
