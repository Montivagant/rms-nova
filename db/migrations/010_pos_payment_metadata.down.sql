DROP INDEX IF EXISTS idx_pos_payment_refunds_payment;
DROP TABLE IF EXISTS pos_payment_refunds;
DROP TYPE IF EXISTS payment_refund_status;

DROP INDEX IF EXISTS idx_pos_payments_processor;

ALTER TABLE pos_payments
  DROP COLUMN IF EXISTS processor,
  DROP COLUMN IF EXISTS processor_payment_id,
  DROP COLUMN IF EXISTS method_type,
  DROP COLUMN IF EXISTS method_brand,
  DROP COLUMN IF EXISTS method_last4,
  DROP COLUMN IF EXISTS receipt_url,
  DROP COLUMN IF EXISTS failure_reason,
  DROP COLUMN IF EXISTS captured_at,
  DROP COLUMN IF EXISTS refunded_amount,
  DROP COLUMN IF EXISTS metadata;
