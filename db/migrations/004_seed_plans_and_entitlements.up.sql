INSERT INTO plans (id, name, description, price_cents, billing_cycle, trial_days, entitlements)
VALUES
  ('7f4c6d3f-7de2-4ba1-92a7-9baf0e3a8ed1', 'Core', 'Baseline POS + inventory bundle', 29900, 'monthly', 14,
    '{"modules":[{"id":"pos","enabled":true},{"id":"inventory","enabled":true},{"id":"analytics","enabled":false}],"featureFlags":[{"moduleId":"pos","key":"dual_cash_drawer","enabled":false},{"moduleId":"inventory","key":"waste_tracking","enabled":true}]}'::jsonb
  ),
  ('1ef168c5-66e9-4d11-8f51-32301dbce0d4', 'Pro', 'Core + analytics and advanced reporting', 49900, 'monthly', 14,
    '{"modules":[{"id":"pos","enabled":true},{"id":"inventory","enabled":true},{"id":"analytics","enabled":true},{"id":"reporting","enabled":true}],"featureFlags":[{"moduleId":"pos","key":"dual_cash_drawer","enabled":true},{"moduleId":"analytics","key":"realtime_dashboards","enabled":true}]}'::jsonb
  ),
  ('9ab91b31-9c5f-4f57-8f72-6c4c3586c5af', 'Enterprise', 'Tailored entitlements with dedicated support', 89900, 'monthly', 30,
    '{"modules":[{"id":"pos","enabled":true},{"id":"inventory","enabled":true},{"id":"analytics","enabled":true},{"id":"reporting","enabled":true},{"id":"loyalty","enabled":true}],"featureFlags":[{"moduleId":"reporting","key":"export_sla","enabled":true},{"moduleId":"loyalty","key":"api_access","enabled":true}]}'::jsonb
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  billing_cycle = EXCLUDED.billing_cycle,
  trial_days = EXCLUDED.trial_days,
  entitlements = EXCLUDED.entitlements,
  updated_at = NOW();
