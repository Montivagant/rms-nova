import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { PoolClient } from "pg";
import { env } from "../../config.js";
import { pool } from "../../db.js";
import { Errors } from "../../errors.js";
import { captureWithProvider, refundWithProvider } from "../pos/payment-client.js";
import { logger } from "../../logger.js";
import type {
  DashboardSnapshot,
  MenuItem,
  InventoryItem,
  Ticket,
  PaymentsSnapshot,
  ReportingSnapshot,
  PaymentRecord,
  ReportingFilterOptions,
  MenuModifier as SampleMenuModifier
} from "@nova/sample-data";
import {
  getDashboardSnapshot,
  getMenuItems as getSampleMenuItems,
  getMenuModifiers as getSampleMenuModifiers,
  getMenuModifierAssignments as getSampleMenuModifierAssignments,
  getInventoryItems as getSampleInventory,
  getTicketFeed as getSampleTickets,
  getPaymentsSnapshot,
  getReportingSnapshot,
  filterPaymentsSnapshot,
  filterReportingSnapshot
} from "@nova/sample-data";
import { registrationModuleDefaults } from "@nova/module-registry";
import { enqueuePaymentStatusJob } from "../../queues/payment-status.js";

const ZERO_LOCATION_ID = "00000000-0000-0000-0000-000000000000";
export const PRIMARY_LOCATION_ID = ZERO_LOCATION_ID;
type DbRow = Record<string, unknown>;
type TicketItem = { name: string; quantity: number };

const formatCurrency = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value || 0);

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const formatTicketStatus = (status: string): Ticket["status"] => {
  const normalized = status.toLowerCase();
  if (normalized === "settled") return "Paid";
  if (normalized === "refunded") return "Refunded";
  return "Open";
};

const formatChannel = (method?: string | null) => {
  if (!method) return "POS";
  const normalized = method.toLowerCase();
  if (normalized.includes("online")) return "Online";
  if (normalized.includes("kiosk")) return "Kiosk";
  if (normalized.includes("card")) return "POS";
  return method.toUpperCase();
};

const formatTime = (value?: Date | string | null) => {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatFriendlyDate = (value?: Date | string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
};

const toIsoString = (value?: Date | string | null) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

const normalizeLocationCode = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "location";

const revenueWindowSql = `
  SELECT
    timeframe,
    COALESCE(SUM(total), 0) AS revenue,
    COALESCE(COUNT(*), 0) AS ticket_count
  FROM (
    SELECT
      CASE
        WHEN status = 'settled' AND DATE(COALESCE(closed_at, created_at)) = CURRENT_DATE THEN 'today'
        WHEN status = 'settled' AND DATE(COALESCE(closed_at, created_at)) > CURRENT_DATE - INTERVAL '7 days' THEN 'week'
        WHEN status = 'settled' AND DATE(COALESCE(closed_at, created_at)) > CURRENT_DATE - INTERVAL '30 days' THEN 'month'
        ELSE 'older'
      END AS timeframe,
      total
    FROM pos_tickets
    WHERE tenant_id = $1
  ) AS buckets
  WHERE timeframe IN ('today', 'week', 'month')
  GROUP BY timeframe
`;

const ticketVelocitySql = `
  SELECT
    COUNT(*) FILTER (
      WHERE status = 'settled'
        AND DATE(COALESCE(closed_at, created_at)) = CURRENT_DATE
    ) AS today,
    COUNT(*) FILTER (
      WHERE status = 'settled'
        AND DATE(COALESCE(closed_at, created_at)) = CURRENT_DATE - INTERVAL '1 day'
    ) AS yesterday
  FROM pos_tickets
  WHERE tenant_id = $1
`;

const inventorySpendSql = `
  SELECT
    COALESCE(SUM(
      CASE WHEN m.quantity > 0 THEN m.quantity * ii.cost_per_unit ELSE 0 END
    ), 0) AS spend,
    COALESCE(AVG(
      CASE WHEN m.quantity > 0 THEN m.quantity * ii.cost_per_unit ELSE 0 END
    ), 0) AS avg_spend
  FROM inventory_movements m
  JOIN inventory_items ii ON ii.id = m.item_id
  WHERE m.tenant_id = $1
    AND m.created_at >= (CURRENT_DATE - INTERVAL '7 days')
`;

const topMenuItemsSql = `
  SELECT
    mi.id,
    mi.name,
    COALESCE(mc.name, 'Uncategorized') AS category_name,
    COALESCE(SUM(
      CASE
        WHEN pt.status = 'settled'
          AND DATE(pt.closed_at) = CURRENT_DATE
        THEN ti.quantity
        ELSE 0
      END
    ), 0) AS sold_today,
    COALESCE(SUM(
      CASE
        WHEN pt.status = 'settled'
          AND DATE(pt.closed_at) = CURRENT_DATE
        THEN ti.total_price
        ELSE 0
      END
    ), 0) AS gross_today
  FROM menu_items mi
  LEFT JOIN menu_categories mc ON mc.id = mi.category_id
  LEFT JOIN pos_ticket_items ti
    ON ti.menu_item_id = mi.id
    AND ti.tenant_id = mi.tenant_id
  LEFT JOIN pos_tickets pt
    ON pt.id = ti.ticket_id
    AND pt.tenant_id = mi.tenant_id
  WHERE mi.tenant_id = $1
  GROUP BY mi.id, mc.name
  ORDER BY sold_today DESC, mi.name
  LIMIT 3
`;

const inventoryAlertsSql = `
  SELECT
    ii.id,
    ii.name,
    ii.unit,
    ii.reorder_point,
    COALESCE(SUM(sl.quantity), 0) AS on_hand
  FROM inventory_items ii
  LEFT JOIN inventory_stock_levels sl
    ON sl.item_id = ii.id
    AND sl.tenant_id = ii.tenant_id
  WHERE ii.tenant_id = $1
  GROUP BY ii.id
  HAVING COALESCE(SUM(sl.quantity), 0) <= ii.reorder_point
  ORDER BY on_hand ASC
  LIMIT 5
`;

const menuPricingSql = `
  SELECT
    mi.id AS menu_item_id,
    mi.name,
    COALESCE(mi.tax_rate, 0) AS tax_rate,
    price.price,
    price.currency
  FROM menu_items mi
  JOIN LATERAL (
    SELECT price, currency, location_id
    FROM menu_item_prices mip
    WHERE mip.tenant_id = mi.tenant_id
      AND mip.menu_item_id = mi.id
      AND mip.location_id IN ($2::uuid, $3::uuid)
    ORDER BY CASE WHEN mip.location_id = $2 THEN 0 ELSE 1 END
    LIMIT 1
  ) AS price ON true
  WHERE mi.tenant_id = $1
    AND mi.id = ANY($4::uuid[])
    AND mi.is_active = TRUE
`;


const menuModifiersSql = `
  SELECT
    id,
    name,
    COALESCE(price_delta, 0) AS price_delta,
    max_select
  FROM menu_modifiers
  WHERE tenant_id = $1
  ORDER BY name
`;

const menuItemModifiersSql = `
  SELECT menu_item_id, modifier_id
  FROM menu_item_modifiers
  WHERE tenant_id = $1
`;

const recentTicketsSql = `
  SELECT
    t.id,
    t.total,
    t.status,
    t.closed_at,
    t.opened_at,
    COALESCE(p.method, 'POS') AS method
  FROM pos_tickets t
  LEFT JOIN LATERAL (
    SELECT method
    FROM pos_payments p
    WHERE p.ticket_id = t.id AND p.tenant_id = t.tenant_id
    ORDER BY p.created_at DESC
    LIMIT 1
  ) p ON true
  WHERE t.tenant_id = $1
  ORDER BY t.closed_at DESC NULLS LAST, t.created_at DESC
  LIMIT $2
`;

const ticketItemsSql = `
  SELECT ticket_id, name, quantity
  FROM pos_ticket_items
  WHERE tenant_id = $1
    AND ticket_id = ANY($2::uuid[])
`;

const paymentsSummarySql = `
  SELECT
    COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN amount + tip_amount ELSE 0 END), 0) AS total_today,
    COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN amount + tip_amount ELSE 0 END), 0) AS total_week
  FROM pos_payments
  WHERE tenant_id = $1
    AND status = 'completed'
`;

const paymentsByMethodSql = `
  SELECT
    method,
    COALESCE(SUM(amount + tip_amount), 0) AS total
  FROM pos_payments
  WHERE tenant_id = $1
    AND status = 'completed'
    AND created_at >= $2
    AND created_at < $3
  GROUP BY method
  ORDER BY total DESC
`;

const paymentsRangeTotalSql = `
  SELECT
    COALESCE(SUM(amount + tip_amount), 0) AS total
  FROM pos_payments
  WHERE tenant_id = $1
    AND status = 'completed'
    AND created_at >= $2
    AND created_at < $3
    AND ($4::text IS NULL OR LOWER(method) = LOWER($4))
`;

const recentPaymentsSql = `
  SELECT
    id,
    ticket_id,
    method,
    status,
    amount,
    tip_amount,
    created_at,
    processor,
    processor_payment_id,
    method_type,
    method_brand,
    method_last4,
    receipt_url,
    failure_reason,
    captured_at,
    refunded_amount,
    metadata
  FROM pos_payments
  WHERE tenant_id = $1
    AND created_at >= $2
    AND created_at < $3
    AND ($5::text IS NULL OR LOWER(method) = LOWER($5))
  ORDER BY created_at DESC
  LIMIT $4
`;

const revenueSeriesSql = `
  SELECT
    DATE(date_bucket) AS bucket_date,
    SUM(total) AS total
  FROM (
    SELECT
      DATE(COALESCE(closed_at, created_at)) AS date_bucket,
      total
    FROM pos_tickets
    WHERE tenant_id = $1
      AND status = 'settled'
      AND DATE(COALESCE(closed_at, created_at)) >= CURRENT_DATE - ($2 || ' days')::interval
      AND ($3::uuid IS NULL OR location_id = $3::uuid)
  ) sub
  GROUP BY bucket_date
  ORDER BY bucket_date
`;

const ticketSeriesSql = `
  SELECT
    DATE(date_bucket) AS bucket_date,
    COUNT(*) AS count
  FROM (
    SELECT DATE(COALESCE(closed_at, created_at)) AS date_bucket
    FROM pos_tickets
    WHERE tenant_id = $1
      AND status = 'settled'
      AND DATE(COALESCE(closed_at, created_at)) >= CURRENT_DATE - ($2 || ' days')::interval
      AND ($3::uuid IS NULL OR location_id = $3::uuid)
  ) sub
  GROUP BY bucket_date
  ORDER BY bucket_date
`;

const topCategoriesSql = `
  SELECT
    COALESCE(mc.name, 'Uncategorized') AS category_name,
    COALESCE(SUM(ti.total_price), 0) AS revenue
  FROM pos_ticket_items ti
  JOIN menu_items mi ON mi.id = ti.menu_item_id
  LEFT JOIN menu_categories mc ON mc.id = mi.category_id
  JOIN pos_tickets pt ON pt.id = ti.ticket_id
  WHERE ti.tenant_id = $1
    AND pt.status = 'settled'
    AND DATE(COALESCE(pt.closed_at, pt.created_at)) >= CURRENT_DATE - ($2 || ' days')::interval
    AND ($3::uuid IS NULL OR pt.location_id = $3::uuid)
  GROUP BY category_name
  ORDER BY revenue DESC
  LIMIT 5
`;

const tenantLocationCountSql = `
  WITH source_locations AS (
    SELECT COALESCE(location_id, $2::uuid) AS location_id
    FROM inventory_stock_levels
    WHERE tenant_id = $1
    UNION
    SELECT COALESCE(location_id, $2::uuid) AS location_id
    FROM menu_item_prices
    WHERE tenant_id = $1
  )
  SELECT COUNT(DISTINCT location_id) AS location_count
  FROM source_locations
`;

const userLocationAccessSql = `
  SELECT location_id, can_assign
  FROM tenant_location_users
  WHERE tenant_id = $1
    AND user_id = $2
`;

const tenantLocationsSql = `
  WITH metadata AS (
    SELECT id, tenant_id, name, code, timezone, status, created_at
    FROM tenant_locations
    WHERE tenant_id = $1
  ),
  inventory_counts AS (
    SELECT COALESCE(location_id, $2::uuid) AS location_id,
           COUNT(DISTINCT item_id) AS total_inventory_items
    FROM inventory_stock_levels
    WHERE tenant_id = $1
    GROUP BY 1
  ),
  menu_counts AS (
    SELECT COALESCE(location_id, $2::uuid) AS location_id,
           COUNT(DISTINCT menu_item_id) AS total_menu_items
    FROM menu_item_prices
    WHERE tenant_id = $1
    GROUP BY 1
  ),
  unioned AS (
    SELECT DISTINCT location_id
    FROM (
      SELECT id AS location_id FROM metadata
      UNION ALL
      SELECT location_id FROM inventory_counts
      UNION ALL
      SELECT location_id FROM menu_counts
      UNION ALL
      SELECT $2::uuid
    ) combined
  )
  SELECT
    unioned.location_id,
    meta.id,
    meta.name,
    meta.code,
    meta.timezone,
    meta.status,
    COALESCE(inv.total_inventory_items, 0) AS total_inventory_items,
    COALESCE(menu.total_menu_items, 0) AS total_menu_items,
    meta.created_at
  FROM unioned
  LEFT JOIN metadata meta ON meta.id = unioned.location_id
  LEFT JOIN inventory_counts inv ON inv.location_id = unioned.location_id
  LEFT JOIN menu_counts menu ON menu.location_id = unioned.location_id
  ORDER BY
    CASE WHEN unioned.location_id = $2 THEN 0 ELSE 1 END,
    COALESCE(meta.created_at, NOW())
`;

const insertTenantLocationSql = `
  INSERT INTO tenant_locations (tenant_id, name, code, timezone, status)
  VALUES ($1, $2, $3, $4, COALESCE($5, 'active'))
  RETURNING *
`;

const updateTenantLocationSql = `
  UPDATE tenant_locations
  SET
    name = COALESCE($3, name),
    timezone = COALESCE($4, timezone),
    status = COALESCE($5, status),
    updated_at = NOW()
  WHERE tenant_id = $1
    AND id = $2
  RETURNING *
`;

const singleTenantLocationSql = `
  SELECT
    tl.id,
    tl.name,
    tl.code,
    tl.timezone,
    tl.status,
    COALESCE(inv.total_inventory_items, 0) AS total_inventory_items,
    COALESCE(menu.total_menu_items, 0) AS total_menu_items
  FROM tenant_locations tl
  LEFT JOIN (
    SELECT location_id, COUNT(DISTINCT item_id) AS total_inventory_items
    FROM inventory_stock_levels
    WHERE tenant_id = $1
    GROUP BY location_id
  ) inv ON inv.location_id = tl.id
  LEFT JOIN (
    SELECT location_id, COUNT(DISTINCT menu_item_id) AS total_menu_items
    FROM menu_item_prices
    WHERE tenant_id = $1
    GROUP BY location_id
  ) menu ON menu.location_id = tl.id
  WHERE tl.tenant_id = $1
    AND tl.id = $2
  LIMIT 1
`;

const locationInventoryAssignedSql = `
  SELECT
    ii.id AS item_id,
    ii.name,
    ii.sku,
    ii.unit,
    isl.quantity,
    isl.reserved,
    isl.on_order
  FROM inventory_stock_levels isl
  JOIN inventory_items ii ON ii.id = isl.item_id
  WHERE isl.tenant_id = $1
    AND isl.location_id = $2
  ORDER BY ii.name
  LIMIT 50
`;

const locationInventoryAvailableSql = `
  SELECT
    ii.id AS item_id,
    ii.name,
    ii.sku,
    ii.unit,
    COALESCE(default_level.quantity, 0) AS baseline_quantity
  FROM inventory_items ii
  LEFT JOIN inventory_stock_levels assigned
    ON assigned.tenant_id = $1
   AND assigned.item_id = ii.id
   AND assigned.location_id = $2
  LEFT JOIN inventory_stock_levels default_level
    ON default_level.tenant_id = $1
   AND default_level.item_id = ii.id
   AND default_level.location_id = $3
  WHERE ii.tenant_id = $1
    AND ii.active = TRUE
    AND assigned.item_id IS NULL
  ORDER BY ii.name
  LIMIT 50
`;

const locationMenuAssignedSql = `
  SELECT
    mi.id AS menu_item_id,
    mi.name,
    mc.name AS category,
    mip.price,
    mip.currency
  FROM menu_item_prices mip
  JOIN menu_items mi ON mi.id = mip.menu_item_id
  LEFT JOIN menu_categories mc ON mc.id = mi.category_id
  WHERE mip.tenant_id = $1
    AND mip.location_id = $2
  ORDER BY mi.name
  LIMIT 50
`;

const locationMenuAvailableSql = `
  SELECT
    mi.id AS menu_item_id,
    mi.name,
    mc.name AS category,
    COALESCE(base.price, 0) AS default_price,
    COALESCE(base.currency, 'USD') AS currency
  FROM menu_items mi
  LEFT JOIN menu_item_prices assigned
    ON assigned.tenant_id = $1
   AND assigned.menu_item_id = mi.id
   AND assigned.location_id = $2
  LEFT JOIN menu_item_prices base
    ON base.tenant_id = $1
   AND base.menu_item_id = mi.id
   AND base.location_id = $3
  LEFT JOIN menu_categories mc ON mc.id = mi.category_id
  WHERE mi.tenant_id = $1
    AND mi.is_active = TRUE
    AND assigned.menu_item_id IS NULL
  ORDER BY mi.name
  LIMIT 50
`;

const assignInventoryToLocationSql = `
  INSERT INTO inventory_stock_levels AS isl (tenant_id, item_id, location_id, quantity, reserved, on_order)
  SELECT
    $1::uuid AS tenant_id,
    src.item_id,
    $2::uuid AS location_id,
    COALESCE(base.quantity, 0) AS quantity,
    COALESCE(base.reserved, 0) AS reserved,
    COALESCE(base.on_order, 0) AS on_order
  FROM UNNEST($3::uuid[]) AS src(item_id)
  JOIN inventory_items ii ON ii.tenant_id = $1 AND ii.id = src.item_id AND ii.active = TRUE
  LEFT JOIN inventory_stock_levels base
    ON base.tenant_id = $1
   AND base.item_id = src.item_id
   AND base.location_id = $4::uuid
  ON CONFLICT (tenant_id, item_id, location_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    reserved = EXCLUDED.reserved,
    on_order = EXCLUDED.on_order
`;

const removeInventoryFromLocationSql = `
  DELETE FROM inventory_stock_levels
  WHERE tenant_id = $1
    AND location_id = $2
    AND item_id = ANY($3::uuid[])
`;

const assignMenuToLocationSql = `
  INSERT INTO menu_item_prices AS mip (tenant_id, menu_item_id, location_id, price, currency)
  SELECT
    $1::uuid AS tenant_id,
    src.menu_item_id,
    $2::uuid AS location_id,
    COALESCE(base.price, 0) AS price,
    COALESCE(base.currency, 'USD') AS currency
  FROM UNNEST($3::uuid[]) AS src(menu_item_id)
  JOIN menu_items mi ON mi.tenant_id = $1 AND mi.id = src.menu_item_id AND mi.is_active = TRUE
  LEFT JOIN menu_item_prices base
    ON base.tenant_id = $1
   AND base.menu_item_id = src.menu_item_id
   AND base.location_id = $4::uuid
  ON CONFLICT (tenant_id, menu_item_id, location_id)
  DO UPDATE SET
    price = EXCLUDED.price,
    currency = EXCLUDED.currency
`;

const removeMenuFromLocationSql = `
  DELETE FROM menu_item_prices
  WHERE tenant_id = $1
    AND location_id = $2
    AND menu_item_id = ANY($3::uuid[])
`;

const tenantContextSql = `
  SELECT
    t.id,
    t.name,
    t.alias,
    t.status,
    COALESCE(plan_source.name, 'Core') AS plan_name,
    plan_source.id AS plan_id,
    COALESCE(s.status, 'unknown') AS subscription_status,
    s.current_period_end
  FROM tenants t
  LEFT JOIN LATERAL (
    SELECT *
    FROM subscriptions sub
    WHERE sub.tenant_id = t.id
    ORDER BY sub.updated_at DESC NULLS LAST
    LIMIT 1
  ) s ON TRUE
  LEFT JOIN plans plan_source ON plan_source.id = COALESCE(t.plan_id, s.plan_id)
  WHERE t.id = $1
`;

const tenantModulesSql = `
  SELECT module_id, enabled, source, updated_at
  FROM tenant_modules
  WHERE tenant_id = $1
`;

const tenantFeatureFlagsSql = `
  SELECT module_id, feature_key, enabled, overridden, updated_at
  FROM tenant_feature_flags
  WHERE tenant_id = $1
`;

const menuItemsSql = `
  SELECT
    mi.id,
    mi.name,
    COALESCE(mc.name, 'Uncategorized') AS category_name,
    mi.tax_rate,
    mi.is_active,
    COALESCE(price.price, 0) AS price,
    COALESCE(price.currency, 'USD') AS currency,
    stats.sold_today,
    stats.gross_today,
    CASE WHEN recipes.menu_item_id IS NULL THEN FALSE ELSE TRUE END AS has_recipe
  FROM menu_items mi
  LEFT JOIN menu_categories mc ON mc.id = mi.category_id
  LEFT JOIN LATERAL (
    SELECT price, currency
    FROM menu_item_prices mip
    WHERE mip.menu_item_id = mi.id
      AND mip.tenant_id = mi.tenant_id
    ORDER BY mip.location_id
    LIMIT 1
  ) price ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(
        CASE
          WHEN pt.status = 'settled'
            AND DATE(pt.closed_at) = CURRENT_DATE
          THEN ti.quantity
          ELSE 0
        END
      ), 0) AS sold_today,
      COALESCE(SUM(
        CASE
          WHEN pt.status = 'settled'
            AND DATE(pt.closed_at) = CURRENT_DATE
          THEN ti.total_price
          ELSE 0
        END
      ), 0) AS gross_today
    FROM pos_ticket_items ti
    JOIN pos_tickets pt
      ON pt.id = ti.ticket_id
      AND pt.tenant_id = mi.tenant_id
    WHERE ti.menu_item_id = mi.id
      AND ti.tenant_id = mi.tenant_id
  ) stats ON true
  LEFT JOIN menu_recipes recipes
    ON recipes.menu_item_id = mi.id
    AND recipes.tenant_id = mi.tenant_id
  WHERE mi.tenant_id = $1
  ORDER BY mc.position, mi.name
`;

const updateMenuItemStatusSql = `
  UPDATE menu_items
  SET is_active = $3, updated_at = NOW()
  WHERE tenant_id = $1 AND id = $2
  RETURNING id
`;

const inventoryItemsSql = `
  SELECT
    ii.id,
    ii.name,
    ii.unit,
    ii.reorder_point,
    COALESCE(SUM(sl.quantity), 0) AS on_hand,
    ii.cost_per_unit
  FROM inventory_items ii
  LEFT JOIN inventory_stock_levels sl
    ON sl.item_id = ii.id
    AND sl.tenant_id = ii.tenant_id
  WHERE ii.tenant_id = $1
  GROUP BY ii.id
  ORDER BY ii.name
`;

const inventoryStockLevelForUpdateSql = `
  SELECT quantity
  FROM inventory_stock_levels
  WHERE tenant_id = $1
    AND item_id = $2
    AND location_id = $3
  FOR UPDATE
`;

const upsertInventoryStockLevelSql = `
  INSERT INTO inventory_stock_levels (tenant_id, item_id, location_id, quantity, reserved, on_order)
  VALUES ($1, $2, $3, $4, 0, 0)
  ON CONFLICT (tenant_id, item_id, location_id)
  DO UPDATE SET quantity = EXCLUDED.quantity
`;

const insertInventoryMovementSql = `
  INSERT INTO inventory_movements (
    tenant_id,
    item_id,
    quantity,
    reason,
    previous_quantity,
    new_quantity,
    reference,
    notes,
    created_by,
    location_id,
    source,
    attachment_url,
    count_id
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
`;

const selectAccountProfileSql = `
  SELECT id, first_name, last_name, email, title, bio
  FROM users
  WHERE tenant_id = $1 AND id = $2
`;

const updateAccountProfileSql = `
  UPDATE users
  SET
    first_name = $3,
    last_name = $4,
    email = $5,
    title = $6,
    bio = $7,
    updated_at = NOW()
  WHERE tenant_id = $1 AND id = $2
  RETURNING id, first_name, last_name, email, title, bio
`;

const selectBusinessProfileSql = `
  SELECT
    tenant_id,
    legal_name,
    doing_business_as,
    support_email,
    support_phone,
    website,
    timezone,
    notes
  FROM tenant_business_profiles
  WHERE tenant_id = $1
`;

const upsertBusinessProfileSql = `
  INSERT INTO tenant_business_profiles (
    tenant_id,
    legal_name,
    doing_business_as,
    support_email,
    support_phone,
    website,
    timezone,
    notes,
    updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    legal_name = EXCLUDED.legal_name,
    doing_business_as = EXCLUDED.doing_business_as,
    support_email = EXCLUDED.support_email,
    support_phone = EXCLUDED.support_phone,
    website = EXCLUDED.website,
    timezone = EXCLUDED.timezone,
    notes = EXCLUDED.notes,
    updated_at = NOW()
  RETURNING tenant_id, legal_name, doing_business_as, support_email, support_phone, website, timezone, notes, updated_at
`;

const inventoryAuditLogSql = `
  SELECT
    m.id,
    m.item_id,
    m.quantity,
    m.reason,
    m.previous_quantity,
    m.new_quantity,
    m.reference,
    m.notes,
    m.created_at,
    m.created_by,
    m.source,
    m.count_id,
    m.attachment_url,
    ii.name AS item_name,
    ii.unit,
    u.first_name,
    u.last_name,
    loc.name AS location_name,
    COALESCE(m.location_id, $3::uuid) AS normalized_location_id
  FROM inventory_movements m
  JOIN inventory_items ii ON ii.id = m.item_id
  LEFT JOIN users u ON u.id = m.created_by
  LEFT JOIN tenant_locations loc ON loc.id = m.location_id
  WHERE m.tenant_id = $1
  ORDER BY m.created_at DESC
  LIMIT $2
`;

const inventoryCountSessionsSql = `
  SELECT
    ic.id,
    ic.name,
    ic.status,
    COALESCE(ic.location_id, $2::uuid) AS location_id,
    ic.scheduled_at,
    ic.started_at,
    ic.completed_at,
    ic.updated_at,
    ic.notes,
    loc.name AS location_name,
    COALESCE(totals.total_items, 0) AS total_items,
    COALESCE(totals.total_variance, 0) AS total_variance,
    COALESCE(attachment_totals.total_attachments, 0) AS attachments_count
  FROM inventory_counts ic
  LEFT JOIN tenant_locations loc ON loc.id = ic.location_id
  LEFT JOIN (
    SELECT count_id, COUNT(*) AS total_items, COALESCE(SUM(variance), 0) AS total_variance
    FROM inventory_count_items
    GROUP BY count_id
  ) totals ON totals.count_id = ic.id
  LEFT JOIN (
    SELECT count_id, COUNT(*) AS total_attachments
    FROM inventory_count_attachments
    GROUP BY count_id
  ) attachment_totals ON attachment_totals.count_id = ic.id
  WHERE ic.tenant_id = $1
  ORDER BY ic.updated_at DESC, ic.created_at DESC
  LIMIT $3
`;

const inventoryCountDetailSql = `
  SELECT
    ic.id,
    ic.name,
    ic.status,
    COALESCE(ic.location_id, $3::uuid) AS location_id,
    ic.scheduled_at,
    ic.started_at,
    ic.completed_at,
    ic.updated_at,
    ic.notes,
    loc.name AS location_name,
    COALESCE(totals.total_items, 0) AS total_items,
    COALESCE(totals.total_variance, 0) AS total_variance,
    COALESCE(attachment_totals.total_attachments, 0) AS attachments_count
  FROM inventory_counts ic
  LEFT JOIN tenant_locations loc ON loc.id = ic.location_id
  LEFT JOIN (
    SELECT count_id, COUNT(*) AS total_items, COALESCE(SUM(variance), 0) AS total_variance
    FROM inventory_count_items
    GROUP BY count_id
  ) totals ON totals.count_id = ic.id
  LEFT JOIN (
    SELECT count_id, COUNT(*) AS total_attachments
    FROM inventory_count_attachments
    GROUP BY count_id
  ) attachment_totals ON attachment_totals.count_id = ic.id
  WHERE ic.tenant_id = $1
    AND ic.id = $2
`;

const inventoryCountAttachmentsSql = `
  SELECT
    a.id,
    a.count_id,
    a.url,
    a.label,
    a.created_at,
    COALESCE(
      NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
      u.first_name,
      u.last_name,
      u.email
    ) AS created_by_name
  FROM inventory_count_attachments a
  LEFT JOIN users u ON u.id = a.created_by
  WHERE a.tenant_id = $1
    AND a.count_id = $2
  ORDER BY a.created_at DESC
`;

const inventoryCountAttachmentByIdSql = `
  SELECT
    a.id,
    a.count_id,
    a.url,
    a.label,
    a.created_at,
    COALESCE(
      NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
      u.first_name,
      u.last_name,
      u.email
    ) AS created_by_name
  FROM inventory_count_attachments a
  LEFT JOIN users u ON u.id = a.created_by
  WHERE a.tenant_id = $1
    AND a.id = $2
  LIMIT 1
`;

const inventoryCountEntriesSql = `
  SELECT
    ici.item_id,
    ici.system_quantity,
    ici.counted_quantity,
    ici.variance,
    ici.notes,
    ii.name AS item_name,
    ii.sku,
    ii.unit
  FROM inventory_count_items ici
  JOIN inventory_items ii ON ii.id = ici.item_id
  WHERE ici.count_id = $1
  ORDER BY ii.name
`;

const inventoryCountStockSql = `
  SELECT item_id, quantity
  FROM inventory_stock_levels
  WHERE tenant_id = $1
    AND item_id = ANY($2::uuid[])
    AND location_id = $3
`;

const inventoryCountItemValidationSql = `
  SELECT id
  FROM inventory_items
  WHERE tenant_id = $1
    AND id = ANY($2::uuid[])
`;

const inventoryCountSessionLockSql = `
  SELECT
    ic.id,
    ic.name,
    ic.status,
    COALESCE(ic.location_id, $3::uuid) AS location_id,
    ic.notes
  FROM inventory_counts ic
  WHERE ic.tenant_id = $1
    AND ic.id = $2
  FOR UPDATE
`;

const formatMenuStatus = (isActive: boolean) => (isActive ? "Available" : "86d");

const roundQuantity = (value: number) => Number(value.toFixed(3));

const aggregateTicketItems = (items: PosTicketItemInput[]) => {
  const aggregated = new Map<string, number>();
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw Errors.validation("Ticket items must include positive quantities");
    }
    const nextQuantity = roundQuantity((aggregated.get(item.menuItemId) ?? 0) + quantity);
    aggregated.set(item.menuItemId, nextQuantity);
  }
  return Array.from(aggregated.entries()).map(([menuItemId, quantity]) => ({
    menuItemId,
    quantity
  }));
};

const sanitizeOptionalString = (value?: string | null, maxLength = 256) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
};

const normalizeCountEntriesInput = (
  entries: InventoryCountEntriesInput["entries"]
): Array<{ itemId: string; countedQuantity: number; notes: string | null }> => {
  if (!entries || entries.length === 0) {
    throw Errors.validation("Provide at least one counted item");
  }
  const mapped = new Map<string, { countedQuantity: number; notes: string | null }>();
  for (const entry of entries) {
    const itemId = toOptionalString(entry.itemId);
    if (!itemId) {
      throw Errors.validation("Item id is required for each entry");
    }
    const countedValue = Number(entry.countedQuantity);
    if (!Number.isFinite(countedValue) || countedValue < 0) {
      throw Errors.validation("Counted quantity must be a non-negative number");
    }
    mapped.set(itemId, {
      countedQuantity: roundQuantity(countedValue),
      notes: sanitizeOptionalString(entry.notes, 256)
    });
  }
  return Array.from(mapped.entries()).map(([itemId, value]) => ({
    itemId,
    countedQuantity: value.countedQuantity,
    notes: value.notes
  }));
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getPaymentLocation = async (tenantId: string, paymentId: string): Promise<string> => {
  const result = await pool.query<{ location_id: string | null }>(
    "SELECT location_id FROM pos_payments WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, paymentId]
  );
  if (result.rowCount === 0) {
    throw Errors.notFound("Payment not found");
  }
  return result.rows[0]?.location_id ?? PRIMARY_LOCATION_ID;
};

const normalizePaymentMethod = (method?: string | null) => {
  if (!method) return "Card";
  const normalized = method.trim().toLowerCase();
  if (normalized === "cash") return "Cash";
  if (normalized === "online") return "Online";
  return "Card";
};

const resolveCategoryId = async (
  client: PoolClient,
  tenantId: string,
  categoryName?: string
): Promise<{ id: string | null; name: string | null }> => {
  if (!categoryName) {
    return { id: null, name: null };
  }
  const normalized = categoryName.trim();
  if (!normalized) {
    return { id: null, name: null };
  }
  const existing = await client.query<{ id: string }>(
    "SELECT id FROM menu_categories WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1",
    [tenantId, normalized]
  );
  if ((existing.rowCount ?? 0) > 0) {
    return { id: String(existing.rows[0]?.id), name: normalized };
  }
  const positionRow = await client.query<{ next_position: number }>(
    "SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM menu_categories WHERE tenant_id = $1",
    [tenantId]
  );
  const nextPosition = Number(positionRow.rows[0]?.next_position ?? 0);
  const categoryId = randomUUID();
  await client.query(
    `
      INSERT INTO menu_categories (id, tenant_id, name, position)
      VALUES ($1, $2, $3, $4)
    `,
    [categoryId, tenantId, normalized, nextPosition]
  );
  return { id: categoryId, name: normalized };
};

const fallbackWithLog = <T>(logger: FastifyBaseLogger, message: string, fallback: () => T, error: unknown): T => {
  logger.warn({ err: error }, message);
  return fallback();
};

const buildDashboardMetrics = (params: {
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  ticketVelocityToday: number;
  ticketVelocityYesterday: number;
  inventorySpend: number;
  inventorySpendAvg: number;
}): DashboardSnapshot["metrics"] => {
  const avgTicketToday =
    params.ticketVelocityToday > 0 ? params.revenueToday / params.ticketVelocityToday : 0;
  const velocityDelta = params.ticketVelocityYesterday
    ? ((params.ticketVelocityToday - params.ticketVelocityYesterday) /
        params.ticketVelocityYesterday) *
      100
    : params.ticketVelocityToday > 0
      ? 100
      : 0;
  const spendDelta = params.inventorySpendAvg
    ? ((params.inventorySpend - params.inventorySpendAvg) / params.inventorySpendAvg) * 100
    : params.inventorySpend > 0
      ? 100
      : 0;

  const adoptionStates = [
    params.revenueToday > 0,
    params.ticketVelocityToday > 0,
    params.revenueWeek > 0,
    params.revenueMonth > 0
  ];
  const adoptionPercentage = Math.round(
    (adoptionStates.filter(Boolean).length / adoptionStates.length) * 100
  );
  return [
    {
      label: "Today's Revenue",
      value: formatCurrency(params.revenueToday),
      delta:
        params.revenueWeek > 0
          ? `${Math.round((params.revenueToday / params.revenueWeek) * 100)}% of 7d`
          : params.ticketVelocityToday > 0
            ? `${params.ticketVelocityToday} tickets`
            : "No tickets yet",
      trend: params.revenueToday >= 0 ? "up" : "down",
      helper:
        params.ticketVelocityToday > 0
          ? `Avg ticket ${formatCurrency(avgTicketToday)}`
          : "Run your first sale"
    },
    {
      label: "Ticket Velocity",
      value: String(params.ticketVelocityToday),
      delta:
        params.ticketVelocityYesterday > 0
          ? `${velocityDelta >= 0 ? "+" : ""}${Math.round(velocityDelta)}% vs yesterday`
          : params.ticketVelocityToday > 0
            ? "First day of sales"
            : "0 recorded",
      trend: velocityDelta >= 0 ? "up" : "down",
      helper: params.ticketVelocityToday > 0 ? "Settled today" : "Awaiting sales"
    },
    {
      label: "Run Rate (30d)",
      value: formatCurrency(params.revenueMonth),
      delta:
        params.revenueWeek > 0
          ? `${formatCurrency(params.revenueWeek)} (7d)`
          : "No week data",
      trend: params.revenueMonth >= params.revenueWeek ? "up" : "down",
      helper: "Based on settled tickets"
    },
    {
      label: "Inventory Spend (7d)",
      value: formatCurrency(params.inventorySpend),
      delta:
        params.inventorySpendAvg > 0
          ? `${spendDelta >= 0 ? "+" : ""}${Math.round(spendDelta)}% vs avg`
          : "$0 per day",
      trend: spendDelta >= 0 ? "up" : "down",
      helper: "Purchases + adjustments"
    },
    {
      label: "Portal Adoption",
      value: `${adoptionPercentage}%`,
      delta: `${params.revenueWeek > 0 ? "Revenue" : "No revenue"} • ${params.ticketVelocityToday > 0 ? "Tickets" : "No tickets"}`,
      trend: adoptionPercentage >= 50 ? "up" : "down",
      helper: adoptionPercentage >= 100 ? "All signals live" : "Collecting signals"
    }
  ];
};

const mapMenuItems = (rows: DbRow[]): MenuItem[] =>
  rows.map((row) => {
    const taxRatePercent = Number(row.tax_rate ?? 0) * 100;
    const formattedTaxRate = `${Math.round(taxRatePercent * 10) / 10}%`;
    const isActive = Boolean(row.is_active);
    return {
      id: String(row.id),
      name: String(row.name),
      category: String(row.category_name ?? "Uncategorized"),
      price: formatCurrency(Number(row.price ?? 0), String(row.currency ?? "USD")),
      taxRate: formattedTaxRate,
      status: formatMenuStatus(isActive),
      isActive,
      soldToday: Number(row.sold_today ?? 0),
      grossToday: formatCurrency(Number(row.gross_today ?? 0)),
      recipeLinked: Boolean(row.has_recipe)
    };
  });

const mapInventoryItems = (rows: DbRow[]): InventoryItem[] =>
  rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    unit: String(row.unit),
    onHand: Number(row.on_hand ?? 0),
    parLevel: Number(row.reorder_point ?? 0),
    costPerUnit: formatCurrency(Number(row.cost_per_unit ?? 0))
  }));

const mapTickets = (
  rows: DbRow[],
  itemsByTicket: Record<string, TicketItem[]>
): Ticket[] =>
  rows.map((row) => ({
    id: String(row.id),
    channel: formatChannel(row.method as string | null | undefined) as Ticket["channel"],
    status: formatTicketStatus(String(row.status ?? "open")),
    total: formatCurrency(Number(row.total ?? 0)),
    processedAt: formatTime(
      (row.closed_at ?? row.opened_at) as string | Date | null | undefined
    ),
    items: (itemsByTicket[String(row.id)] ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity
    }))
  }));

const collectTicketItems = (rows: DbRow[]) => {
  const result: Record<string, TicketItem[]> = {};
  for (const row of rows) {
    const ticketId = String(row.ticket_id);
    if (!result[ticketId]) {
      result[ticketId] = [];
    }
    result[ticketId].push({
      name: String(row.name),
      quantity: Number(row.quantity ?? 0)
    });
  }
  return result;
};

const formatPaymentStatus = (status: string): "Completed" | "Pending" | "Failed" | "Refunded" => {
  const normalized = status.toLowerCase();
  if (normalized === "completed") return "Completed";
  if (normalized === "pending") return "Pending";
  if (normalized === "refunded") return "Refunded";
  if (normalized === "failed" || normalized === "void") return "Failed";
  return "Completed";
};

const mapPayments = (rows: DbRow[]): PaymentRecord[] =>
  rows.map((row) => {
    const amountValue = roundCurrency(Number(row.amount ?? 0));
    const tipAmountValue = roundCurrency(Number(row.tip_amount ?? 0));
    const totalAmountValue = roundCurrency(amountValue + tipAmountValue);
    const refundedAmountValue = roundCurrency(Number(row.refunded_amount ?? 0));
    const remainingAmountValue = roundCurrency(Math.max(totalAmountValue - refundedAmountValue, 0));
    const metadata = (row.metadata as Record<string, unknown>) ?? undefined;
    const metadataCurrency =
      metadata && typeof metadata.currency === "string" ? String(metadata.currency) : undefined;
    const currency = (metadataCurrency ?? "USD").toUpperCase();
    return {
      id: String(row.id),
      ticketId: String(row.ticket_id),
      method: String(row.method ?? "Card"),
      status: formatPaymentStatus(String(row.status ?? "completed")),
      amount: formatCurrency(amountValue),
      amountValue,
      tipAmount: formatCurrency(tipAmountValue),
      tipAmountValue,
      totalAmountValue,
      processedAt: formatTime(row.created_at as string | Date | null | undefined),
      processedAtIso: toIsoString(row.created_at as string | Date | null | undefined),
      processor: row.processor ? String(row.processor) : undefined,
      processorPaymentId: row.processor_payment_id ? String(row.processor_payment_id) : undefined,
      methodType: row.method_type ? String(row.method_type) : undefined,
      methodBrand: row.method_brand ? String(row.method_brand) : undefined,
      methodLast4: row.method_last4 ? String(row.method_last4) : undefined,
      receiptUrl: row.receipt_url ? String(row.receipt_url) : undefined,
      capturedAtIso: toIsoString(row.captured_at as string | Date | null | undefined),
      failureReason: row.failure_reason ? String(row.failure_reason) : undefined,
      refundedAmount: formatCurrency(refundedAmountValue),
      refundedAmountValue,
      remainingAmountValue,
      currency,
      metadata
    };
  });

const buildDailySeries = (
  days: number,
  rows: Array<{ bucket_date: Date; value?: number; total?: number }>
) => {
  const today = new Date();
  const valuesByDate = new Map<string, number>();
  for (const row of rows) {
    const date = new Date(row.bucket_date);
    const key = date.toISOString().slice(0, 10);
    valuesByDate.set(key, Number(row.value ?? row.total ?? 0));
  }
  const series: Array<{ date: string; value: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    series.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
      value: valuesByDate.get(key) ?? 0
    });
  }
  return series;
};
export const getDashboardData = async (
  tenantId: string,
  logger: FastifyBaseLogger
): Promise<DashboardSnapshot> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const revenueBuckets = await client.query(revenueWindowSql, [tenantId]);
    const revenueMap = revenueBuckets.rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.timeframe as string] = Number(row.revenue ?? 0);
      return acc;
    }, {});
    const revenueToday = revenueMap.today ?? 0;
    const revenueWeek = revenueMap.week ?? 0;
    const revenueMonth = revenueMap.month ?? 0;
    const ticketVelocityRow = (await client.query(ticketVelocitySql, [tenantId])).rows[0] ?? {
      today: 0,
      yesterday: 0
    };
    const ticketVelocityToday = Number(ticketVelocityRow.today ?? 0);
    const ticketVelocityYesterday = Number(ticketVelocityRow.yesterday ?? 0);
    const inventorySpendRow =
      (await client.query(inventorySpendSql, [tenantId])).rows[0] ?? { spend: 0, avg_spend: 0 };
    const inventorySpend = Number(inventorySpendRow.spend ?? 0);
    const inventorySpendAvg = Number(inventorySpendRow.avg_spend ?? 0);

    const topMenuRows = (await client.query(topMenuItemsSql, [tenantId])).rows;
    const inventoryAlertRows = (await client.query(inventoryAlertsSql, [tenantId])).rows;

    const recentTicketRows = (await client.query(recentTicketsSql, [tenantId, 5])).rows;
    let ticketItems: Record<string, { name: string; quantity: number }[]> = {};
    if (recentTicketRows.length > 0) {
      const ticketIds = recentTicketRows.map((row) => row.id);
      const itemsRows = (
        await client.query(ticketItemsSql, [tenantId, ticketIds])
      ).rows;
      ticketItems = collectTicketItems(itemsRows);
    }

    const hasActivity =
      revenueMonth > 0 || ticketVelocityToday > 0 || recentTicketRows.length > 0;
    if (!hasActivity && topMenuRows.length === 0 && inventoryAlertRows.length === 0) {
      return getDashboardSnapshot();
    }

    return {
      metrics: buildDashboardMetrics({
        revenueToday,
        revenueWeek,
        revenueMonth,
        ticketVelocityToday,
        ticketVelocityYesterday,
        inventorySpend,
        inventorySpendAvg
      }),
      topMenuItems: mapMenuItems(topMenuRows),
      inventoryAlerts: mapInventoryItems(inventoryAlertRows),
      recentTickets: mapTickets(recentTicketRows, ticketItems)
    };
  } catch (error) {
    return fallbackWithLog(logger, "portal.dashboard.fallback", getDashboardSnapshot, error);
  } finally {
    client?.release();
  }
};

export const getMenuItemsData = async (tenantId: string, logger: FastifyBaseLogger): Promise<MenuItem[]> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const rows = (await client.query(menuItemsSql, [tenantId])).rows;
    if (rows.length === 0) {
      return getSampleMenuItems();
    }
    return mapMenuItems(rows);
  } catch (error) {
    return fallbackWithLog(logger, "portal.menu.fallback", getSampleMenuItems, error);
  } finally {
    client?.release();
  }
};

export const getMenuModifiersData = async (
  tenantId: string,
  logger: FastifyBaseLogger
): Promise<MenuModifier[]> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const rows = (await client.query(menuModifiersSql, [tenantId])).rows;
    if (rows.length === 0) {
      return getSampleMenuModifiers();
    }
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      priceDelta: Number(row.price_delta ?? 0),
      maxSelect: row.max_select !== null ? Number(row.max_select) : null
    }));
  } catch (error) {
    return fallbackWithLog(logger, "portal.menu.modifiers.fallback", getSampleMenuModifiers, error);
  } finally {
    client?.release();
  }
};

export const getMenuItemModifierAssignments = async (
  tenantId: string,
  logger: FastifyBaseLogger
): Promise<Record<string, string[]>> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const rows = (await client.query(menuItemModifiersSql, [tenantId])).rows;
    if (rows.length === 0) {
      return getSampleMenuModifierAssignments();
    }
    const map: Record<string, string[]> = {};
    for (const row of rows) {
      const itemId = String(row.menu_item_id);
      if (!map[itemId]) map[itemId] = [];
      map[itemId].push(String(row.modifier_id));
    }
    return map;
  } catch (error) {
    return fallbackWithLog(
      logger,
      "portal.menu.modifiers.assignments.fallback",
      getSampleMenuModifierAssignments,
      error
    );
  } finally {
    client?.release();
  }
};

export const updateMenuItemStatus = async (
  tenantId: string,
  menuItemId: string,
  status: "active" | "inactive"
): Promise<void> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const result = await client.query(updateMenuItemStatusSql, [
      tenantId,
      menuItemId,
      status === "active"
    ]);
    if (result.rowCount === 0) {
      throw Errors.notFound("Menu item not found");
    }
  } finally {
    client?.release();
  }
};

export const getInventoryData = async (
  tenantId: string,
  logger: FastifyBaseLogger
): Promise<InventoryItem[]> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const rows = (await client.query(inventoryItemsSql, [tenantId])).rows;
    if (rows.length === 0) {
      return getSampleInventory();
    }
    return mapInventoryItems(rows);
  } catch (error) {
    return fallbackWithLog(logger, "portal.inventory.fallback", getSampleInventory, error);
  } finally {
    client?.release();
  }
};

export type PosTicketItemInput = {
  menuItemId: string;
  quantity: number;
};

export type CreatePosTicketInput = {
  items: PosTicketItemInput[];
  paymentMethod: string;
  tipAmount?: number;
  locationId?: string;
  notes?: string | null;
  paymentReference?: string | null;
  paymentProcessor?: string | null;
  paymentProcessorPaymentId?: string | null;
  paymentMethodType?: string | null;
  paymentMethodBrand?: string | null;
  paymentMethodLast4?: string | null;
  receiptUrl?: string | null;
  metadata?: Record<string, unknown>;
  loyaltyCustomerId?: string | null;
};

export type CreatePosTicketResult = {
  ticketId: string;
  paymentId: string;
  locationId: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  tipAmount: number;
  paymentMethod: string;
  paymentReference?: string | null;
  paymentProcessor?: string | null;
  paymentProcessorPaymentId?: string | null;
  paymentMethodType?: string | null;
  paymentMethodBrand?: string | null;
  paymentMethodLast4?: string | null;
  receiptUrl?: string | null;
  paymentStatus: "completed" | "pending" | "failed";
  ticketStatus: string;
  failureReason?: string | null;
  capturedAtIso?: string | null;
  closedAtIso?: string | null;
};

export type PaymentRefundInput = {
  amount: number;
  reason?: string | null;
};

export type PaymentRefundResult = {
  refundId: string;
  paymentId: string;
  amount: number;
  remainingAmount: number;
  status: "completed" | "pending" | "failed";
  reason: string | null;
  processorRefundId: string;
  failureReason?: string | null;
};

export type UpdatePaymentStatusInput = {
  status: "completed" | "pending" | "failed" | "refunded";
  failureReason?: string | null;
  receiptUrl?: string | null;
  reference?: string | null;
  processorPaymentId?: string | null;
};

export const updatePosPaymentStatus = async (
  tenantId: string,
  paymentId: string,
  input: UpdatePaymentStatusInput
): Promise<void> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const paymentResult = await client.query<{
      ticket_id: string;
      status: string;
      processed_by: string | null;
      amount: number;
      tip_amount: number;
      metadata: Record<string, unknown> | null;
    }>(
      `
        SELECT ticket_id, status, processed_by
        FROM pos_payments
        WHERE tenant_id = $1 AND id = $2
        FOR UPDATE
      `,
      [tenantId, paymentId]
    );
    if (paymentResult.rowCount === 0) {
      // For webhook scenarios, we might receive status updates for payments that don't exist yet
      // or have been cleaned up. We'll log this but not fail the webhook.
      console.warn(`Payment ${paymentId} not found for tenant ${tenantId}, skipping status update`);
      await client.query("COMMIT");
      return;
    }

    const ticketId = String(paymentResult.rows[0].ticket_id);
    const processedBy = paymentResult.rows[0].processed_by;
    const totalAmount = Number(paymentResult.rows[0].amount ?? 0);
    const paymentMetadata = paymentResult.rows[0].metadata;
    const loyaltyMeta = getLoyaltyMetaFromPayment(paymentMetadata);
    const nextStatus = input.status.toLowerCase() as "completed" | "pending" | "failed" | "refunded";
    const isCompleted = nextStatus === "completed" || nextStatus === "refunded";
    const failureReason = input.failureReason ?? null;
    const receiptUrl = input.receiptUrl ?? null;
    const reference = input.reference ?? null;
    const processorPaymentId = input.processorPaymentId ?? null;

    await client.query(
      `
        UPDATE pos_payments
        SET
          status = $1,
          failure_reason = $2,
          receipt_url = COALESCE($3, receipt_url),
          reference = COALESCE($4, reference),
          processor_payment_id = COALESCE($5, processor_payment_id),
          captured_at = CASE WHEN $1 IN ('completed', 'refunded') THEN COALESCE(captured_at, NOW()) ELSE captured_at END
        WHERE tenant_id = $6
          AND id = $7
      `,
      [nextStatus, failureReason, receiptUrl, reference, processorPaymentId, tenantId, paymentId]
    );

    if (isCompleted) {
      await client.query(
        `
          UPDATE pos_tickets
          SET status = 'settled',
              closed_by = COALESCE(closed_by, $3),
              closed_at = COALESCE(closed_at, NOW())
          WHERE tenant_id = $1 AND id = $2
        `,
        [tenantId, ticketId, processedBy]
      );
    }

    await client.query("COMMIT");

    if (isCompleted && loyaltyMeta.loyaltyExternalCustomerId) {
      await awardLoyaltyForSale({
        tenantId,
        actorId: processedBy,
        paymentId,
        ticketId,
        amount: totalAmount,
        loyaltyCustomerId: loyaltyMeta.loyaltyExternalCustomerId,
        existingPointsEarned: loyaltyMeta.loyaltyPointsEarned,
        existingPointsRedeemed: loyaltyMeta.loyaltyPointsRedeemed
      });
    }
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
  }
};

type LoyaltyRulesRow = {
  earn_rate: number | string;
  redeem_rate: number | string;
  min_redeem_points: number | string;
  expiration_days: number | null;
  status: string;
  updated_at: Date;
};

const mapLoyaltyRules = (row: LoyaltyRulesRow) => ({
  earnRate: Number(row.earn_rate ?? 1),
  redeemRate: Number(row.redeem_rate ?? 0.01),
  minRedeemPoints: Number(row.min_redeem_points ?? 0),
  expirationDays: row.expiration_days === null ? null : Number(row.expiration_days),
  status: row.status,
  updatedAt: row.updated_at?.toISOString() ?? new Date(row.updated_at).toISOString()
});

type LoyaltyAccountRow = {
  id: string;
  external_customer_id: string | null;
  balance: number | string;
  pending_balance: number | string;
  status: string;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const mapLoyaltyAccount = (row: LoyaltyAccountRow) => ({
  id: row.id,
  externalCustomerId: row.external_customer_id,
  balance: Number(row.balance),
  pendingBalance: Number(row.pending_balance ?? 0),
  status: row.status,
  expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
  createdAt: row.created_at?.toISOString() ?? new Date(row.created_at).toISOString(),
  updatedAt: row.updated_at?.toISOString() ?? new Date(row.updated_at).toISOString()
});

type LoyaltyTransactionRow = {
  id: string;
  type: string;
  points: number | string;
  balance_after: number | string;
  reference: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

const mapLoyaltyTransaction = (row: LoyaltyTransactionRow) => ({
  id: row.id,
  type: row.type,
  points: Number(row.points),
  balanceAfter: Number(row.balance_after),
  reference: row.reference,
  source: row.source,
  metadata: row.metadata ?? {},
  createdAt: row.created_at?.toISOString() ?? new Date(row.created_at).toISOString()
});

const ensureLoyaltyRules = async (tenantId: string, client?: PoolClient) => {
  const runner = client ?? pool;
  const existing = await runner.query<LoyaltyRulesRow>(
    `
      SELECT earn_rate, redeem_rate, min_redeem_points, expiration_days, status, updated_at
      FROM loyalty_rules
      WHERE tenant_id = $1
    `,
    [tenantId]
  );
  if (existing.rowCount && existing.rows[0]) {
    return existing.rows[0];
  }
  const inserted = await runner.query<LoyaltyRulesRow>(
    `
      INSERT INTO loyalty_rules (tenant_id)
      VALUES ($1)
      ON CONFLICT (tenant_id) DO UPDATE SET updated_at = loyalty_rules.updated_at
      RETURNING earn_rate, redeem_rate, min_redeem_points, expiration_days, status, updated_at
    `,
    [tenantId]
  );
  return inserted.rows[0];
};

export const getLoyaltyOverview = async (
  tenantId: string,
  options: { limit?: number } = {}
) => {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const [rulesRow, accountsResult, statsResult] = await Promise.all([
    ensureLoyaltyRules(tenantId),
    pool.query<LoyaltyAccountRow>(
      `
        SELECT id, external_customer_id, balance, pending_balance, status, expires_at, created_at, updated_at
        FROM loyalty_accounts
        WHERE tenant_id = $1
        ORDER BY updated_at DESC
        LIMIT $2
      `,
      [tenantId, limit]
    ),
    pool.query<{ total_accounts: number; active_accounts: number; total_points: number }>(
      `
        SELECT
          COUNT(*)::int AS total_accounts,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_accounts,
          COALESCE(SUM(balance), 0)::int AS total_points
        FROM loyalty_accounts
        WHERE tenant_id = $1
      `,
      [tenantId]
    )
  ]);

  const statsRow = statsResult.rows[0] ?? {
    total_accounts: 0,
    active_accounts: 0,
    total_points: 0
  };

  return {
    rules: mapLoyaltyRules(rulesRow),
    stats: {
      totalAccounts: Number(statsRow.total_accounts ?? 0),
      activeAccounts: Number(statsRow.active_accounts ?? 0),
      totalPoints: Number(statsRow.total_points ?? 0)
    },
    accounts: accountsResult.rows.map(mapLoyaltyAccount)
  };
};

export const getLoyaltyAccountDetail = async (tenantId: string, accountId: string, limit = 50) => {
  const accountResult = await pool.query<LoyaltyAccountRow>(
    `
      SELECT id, external_customer_id, balance, pending_balance, status, expires_at, created_at, updated_at
      FROM loyalty_accounts
      WHERE tenant_id = $1 AND id = $2
    `,
    [tenantId, accountId]
  );
  if (accountResult.rowCount === 0) {
    throw Errors.notFound("Loyalty account not found");
  }
  const transactionsResult = await pool.query<LoyaltyTransactionRow>(
    `
      SELECT id, type, points, balance_after, reference, source, metadata, created_at
      FROM loyalty_transactions
      WHERE tenant_id = $1 AND account_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [tenantId, accountId, Math.min(Math.max(limit, 1), 100)]
  );
  return {
    account: mapLoyaltyAccount(accountResult.rows[0]),
    transactions: transactionsResult.rows.map(mapLoyaltyTransaction)
  };
};

const resolveAccountForUpdate = async (
  client: PoolClient,
  tenantId: string,
  selector: { accountId?: string; externalCustomerId?: string },
  options: { createIfMissing?: boolean } = {}
) => {
  const { accountId, externalCustomerId } = selector;
  if (!accountId && !externalCustomerId) {
    throw Errors.validation("Provide an accountId or externalCustomerId");
  }

  const params: Array<string | null> = [tenantId];
  let condition: string;
  if (accountId) {
    condition = "id = $2";
    params.push(accountId);
  } else {
    condition = "external_customer_id = $2";
    params.push(externalCustomerId ?? null);
  }

  const existing = await client.query<LoyaltyAccountRow>(
    `
      SELECT id, external_customer_id, balance, pending_balance, status, expires_at, created_at, updated_at
      FROM loyalty_accounts
      WHERE tenant_id = $1 AND ${condition}
      FOR UPDATE
    `,
    params
  );
  if (existing.rowCount && existing.rows[0]) {
    return existing.rows[0];
  }
  if (options.createIfMissing && externalCustomerId) {
    const inserted = await client.query<LoyaltyAccountRow>(
      `
        INSERT INTO loyalty_accounts (tenant_id, external_customer_id)
        VALUES ($1, $2)
        RETURNING id, external_customer_id, balance, pending_balance, status, expires_at, created_at, updated_at
      `,
      [tenantId, externalCustomerId]
    );
    return inserted.rows[0];
  }
  throw Errors.notFound("Loyalty account not found");
};

type LoyaltyEarnInput = {
  externalCustomerId: string;
  points?: number;
  amount?: number;
  reference?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

const resolvePointsToEarn = (input: LoyaltyEarnInput, rules: ReturnType<typeof mapLoyaltyRules>) => {
  if (typeof input.points === "number") {
    const parsed = Math.floor(input.points);
    if (parsed <= 0) throw Errors.validation("points must be greater than zero");
    return parsed;
  }
  if (typeof input.amount === "number") {
    const parsedAmount = Math.max(input.amount, 0);
    const derived = Math.floor(parsedAmount * rules.earnRate);
    if (derived <= 0) {
      throw Errors.validation("amount does not meet the earn-rate minimum", {
        earnRate: rules.earnRate
      });
    }
    return derived;
  }
  throw Errors.validation("Provide points or amount to earn");
};

export const earnLoyaltyPoints = async (
  tenantId: string,
  actorId: string | null,
  input: LoyaltyEarnInput
) => {
  if (!input.externalCustomerId?.trim()) {
    throw Errors.validation("externalCustomerId is required");
  }

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const rules = mapLoyaltyRules(await ensureLoyaltyRules(tenantId, client));
    const points = resolvePointsToEarn(input, rules);
    const account = await resolveAccountForUpdate(
      client,
      tenantId,
      { externalCustomerId: input.externalCustomerId.trim() },
      { createIfMissing: true }
    );

    const updatedAccount = await client.query<LoyaltyAccountRow>(
      `
        UPDATE loyalty_accounts
        SET balance = balance + $3,
            updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, external_customer_id, balance, pending_balance, status, expires_at, created_at, updated_at
      `,
      [tenantId, account.id, points]
    );

    const transactionResult = await client.query<LoyaltyTransactionRow>(
      `
        INSERT INTO loyalty_transactions (
          tenant_id,
          account_id,
          type,
          points,
          balance_after,
          reference,
          source,
          metadata
        )
        VALUES ($1, $2, 'earn', $3, $4, $5, $6, $7::jsonb)
        RETURNING id, type, points, balance_after, reference, source, metadata, created_at
      `,
      [
        tenantId,
        account.id,
        points,
        Number(updatedAccount.rows[0]?.balance ?? 0),
        input.reference ?? null,
        input.source ?? null,
        JSON.stringify({
          ...(input.metadata ?? {}),
          actorId: actorId ?? undefined
        })
      ]
    );

    await client.query("COMMIT");
    return {
      account: mapLoyaltyAccount(updatedAccount.rows[0]!),
      transaction: mapLoyaltyTransaction(transactionResult.rows[0]!)
    };
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
  }
};

type LoyaltyRedeemInput = {
  accountId?: string;
  externalCustomerId?: string;
  points: number;
  reference?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

export const redeemLoyaltyPoints = async (
  tenantId: string,
  actorId: string | null,
  input: LoyaltyRedeemInput
) => {
  const points = Math.floor(input.points);
  if (!Number.isFinite(points) || points <= 0) {
    throw Errors.validation("points must be greater than zero");
  }

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const rules = mapLoyaltyRules(await ensureLoyaltyRules(tenantId, client));
    if (rules.minRedeemPoints > 0 && points < rules.minRedeemPoints) {
      throw Errors.validation("points below the redemption minimum", {
        minPoints: rules.minRedeemPoints
      });
    }
    const account = await resolveAccountForUpdate(
      client,
      tenantId,
      { accountId: input.accountId, externalCustomerId: input.externalCustomerId },
      { createIfMissing: false }
    );
    if (Number(account.balance) < points) {
      throw Errors.validation("Insufficient loyalty balance");
    }

    const updatedAccount = await client.query<LoyaltyAccountRow>(
      `
        UPDATE loyalty_accounts
        SET balance = balance - $3,
            updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, external_customer_id, balance, pending_balance, status, expires_at, created_at, updated_at
      `,
      [tenantId, account.id, points]
    );

    const transactionResult = await client.query<LoyaltyTransactionRow>(
      `
        INSERT INTO loyalty_transactions (
          tenant_id,
          account_id,
          type,
          points,
          balance_after,
          reference,
          source,
          metadata
        )
        VALUES ($1, $2, 'redeem', $3, $4, $5, $6, $7::jsonb)
        RETURNING id, type, points, balance_after, reference, source, metadata, created_at
      `,
      [
        tenantId,
        account.id,
        -points,
        Number(updatedAccount.rows[0]?.balance ?? 0),
        input.reference ?? null,
        input.source ?? null,
        JSON.stringify({
          ...(input.metadata ?? {}),
          actorId: actorId ?? undefined
        })
      ]
    );

    await client.query("COMMIT");
    return {
      account: mapLoyaltyAccount(updatedAccount.rows[0]!),
      transaction: mapLoyaltyTransaction(transactionResult.rows[0]!)
    };
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
  }
};

const appendPaymentMetadata = async (
  tenantId: string,
  paymentId: string,
  patch: Record<string, unknown>
) => {
  if (!patch || Object.keys(patch).length === 0) return;
  try {
    await pool.query(
      `
        UPDATE pos_payments
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
        WHERE tenant_id = $2 AND id = $3
      `,
      [JSON.stringify(patch), tenantId, paymentId]
    );
  } catch (error) {
    logger.warn({ err: error, tenantId, paymentId }, "pos.payment.metadata_append_failed");
  }
};

const getLoyaltyMetaFromPayment = (metadata: Record<string, unknown> | null | undefined) => {
  const safeMetadata = typeof metadata === "object" && metadata !== null ? metadata : {};
  const loyaltyExternalCustomerId =
    typeof (safeMetadata as Record<string, unknown>).loyaltyExternalCustomerId === "string"
      ? String((safeMetadata as Record<string, unknown>).loyaltyExternalCustomerId)
      : undefined;
  const loyaltyPointsEarned = Math.max(
    Number((safeMetadata as Record<string, unknown>).loyaltyPointsEarned ?? 0),
    0
  );
  const loyaltyPointsRedeemed = Math.max(
    Number((safeMetadata as Record<string, unknown>).loyaltyPointsRedeemed ?? 0),
    0
  );
  return { loyaltyExternalCustomerId, loyaltyPointsEarned, loyaltyPointsRedeemed };
};

const awardLoyaltyForSale = async ({
  tenantId,
  actorId,
  paymentId,
  ticketId,
  amount,
  loyaltyCustomerId,
  existingPointsEarned = 0,
  existingPointsRedeemed = 0
}: {
  tenantId: string;
  actorId: string | null;
  paymentId: string;
  ticketId: string;
  amount: number;
  loyaltyCustomerId?: string | null;
  existingPointsEarned?: number;
  existingPointsRedeemed?: number;
}) => {
  if (!loyaltyCustomerId || existingPointsEarned > 0) return;
  try {
    const result = await earnLoyaltyPoints(tenantId, actorId, {
      externalCustomerId: loyaltyCustomerId,
      amount,
      reference: ticketId,
      source: "pos",
      metadata: { paymentId }
    });
    if (result?.transaction) {
      await appendPaymentMetadata(tenantId, paymentId, {
        loyaltyExternalCustomerId: loyaltyCustomerId,
        loyaltyAccountId: result.account.id,
        loyaltyPointsEarned: result.transaction.points,
        loyaltyPointsRedeemed: existingPointsRedeemed
      });
    }
  } catch (error) {
    logger.warn({ err: error, tenantId, paymentId }, "pos.loyalty.earn_failed");
  }
};

const redeemLoyaltyForRefund = async ({
  tenantId,
  actorId,
  paymentId,
  loyaltyCustomerId,
  grossAmount,
  refundAmount,
  pointsEarned,
  pointsRedeemed
}: {
  tenantId: string;
  actorId: string | null;
  paymentId: string;
  loyaltyCustomerId?: string;
  grossAmount: number;
  refundAmount: number;
  pointsEarned: number;
  pointsRedeemed: number;
}) => {
  if (!loyaltyCustomerId || grossAmount <= 0 || pointsEarned <= 0) return;
  const remainingPoints = Math.max(pointsEarned - pointsRedeemed, 0);
  if (remainingPoints <= 0) return;
  const proportionalPoints = Math.max(Math.round((refundAmount / grossAmount) * pointsEarned), 1);
  const pointsToRedeem = Math.min(remainingPoints, proportionalPoints);
  if (pointsToRedeem <= 0) return;
  try {
    await redeemLoyaltyPoints(tenantId, actorId, {
      externalCustomerId: loyaltyCustomerId,
      points: pointsToRedeem,
      reference: paymentId,
      source: "pos_refund"
    });
    await appendPaymentMetadata(tenantId, paymentId, {
      loyaltyExternalCustomerId: loyaltyCustomerId,
      loyaltyPointsEarned: pointsEarned,
      loyaltyPointsRedeemed: pointsRedeemed + pointsToRedeem
    });
  } catch (error) {
    logger.warn({ err: error, tenantId, paymentId }, "pos.loyalty.redeem_failed");
  }
};

export type MenuItemUpdateInput = {
  name?: string;
  description?: string | null;
  taxRate?: number;
  price?: number;
  currency?: string;
  locationId?: string;
};

export type MenuItemUpdateResult = {
  itemId: string;
  name?: string;
  description?: string | null;
  taxRate?: number;
  price?: number;
  currency?: string;
  locationId?: string;
  categoryName?: string | null;
};

export type InventoryAdjustmentInput = {
  quantityDelta: number;
  reason: string;
  notes?: string | null;
  reference?: string | null;
  locationId?: string | null;
  userId?: string | null;
};

export type InventoryAdjustmentResult = {
  itemId: string;
  locationId: string;
  previousQuantity: number;
  newQuantity: number;
};

export type AccountProfile = {
  firstName: string;
  lastName: string;
  title: string | null;
  email: string;
  bio: string | null;
};

export type AccountProfileInput = {
  firstName: string;
  lastName: string;
  title?: string | null;
  email: string;
  bio?: string | null;
};

export type BusinessProfile = {
  legalName: string;
  doingBusinessAs: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  website: string | null;
  timezone: string;
  notes: string | null;
};

export type BusinessProfileInput = {
  legalName: string;
  doingBusinessAs?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  website?: string | null;
  timezone: string;
  notes?: string | null;
};

export type InventoryAuditLogEntry = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  delta: number;
  reason: string;
  previousQuantity: number;
  newQuantity: number;
  notes: string | null;
  reference: string | null;
  createdAtIso: string;
  user: string;
  locationName: string;
  source: string;
  countId: string | null;
  attachmentUrl: string | null;
};

export type InventoryCountSession = {
  id: string;
  name: string;
  status: "draft" | "in_progress" | "completed" | "canceled";
  locationId: string;
  locationName: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  notes: string | null;
  totalItems: number;
  totalVariance: number;
  attachmentsCount: number;
};

export type InventoryCountEntry = {
  itemId: string;
  itemName: string;
  sku: string | null;
  unit: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  notes: string | null;
};

export type InventoryCountAttachment = {
  id: string;
  countId: string;
  url: string;
  label: string | null;
  createdAt: string;
  createdByName: string | null;
};

export type InventoryCountDetail = {
  session: InventoryCountSession;
  entries: InventoryCountEntry[];
  attachments: InventoryCountAttachment[];
};

const csvEscape = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = typeof value === "string" ? value : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

export const formatInventoryCountCsv = (detail: InventoryCountDetail): string => {
  const { session, entries } = detail;
  const metadataPairs: Array<[string, string | number | null | undefined]> = [
    ["Count ID", session.id],
    ["Name", session.name],
    ["Status", session.status],
    ["Location", session.locationName],
    ["Location ID", session.locationId],
    ["Scheduled At", session.scheduledAt],
    ["Started At", session.startedAt],
    ["Completed At", session.completedAt],
    ["Updated At", session.updatedAt],
    ["Notes", session.notes],
    ["Total Items", session.totalItems],
    ["Total Variance", session.totalVariance]
  ];

  const metadataRows = metadataPairs
    .map(([label, value]) => `${csvEscape(label)},${csvEscape(value ?? "")}`)
    .join("\n");

  const header = [
    "item_id",
    "item_name",
    "sku",
    "unit",
    "system_quantity",
    "counted_quantity",
    "variance",
    "notes"
  ].join(",");

  const entryRows = entries
    .map((entry) =>
      [
        entry.itemId,
        entry.itemName,
        entry.sku ?? "",
        entry.unit,
        entry.systemQuantity,
        entry.countedQuantity,
        entry.variance,
        entry.notes ?? ""
      ]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");

  return `${metadataRows}\n\n${header}\n${entryRows}`;
};

export type CreateInventoryCountInput = {
  name: string;
  locationId?: string | null;
  scheduledAt?: string | null;
  notes?: string | null;
};

export type InventoryCountEntriesInput = {
  entries: Array<{
    itemId: string;
    countedQuantity: number;
    notes?: string | null;
  }>;
};

export type CreateMenuItemInput = {
  name: string;
  description?: string | null;
  categoryName?: string;
  taxRate?: number;
  price: number;
  currency?: string;
  locationId?: string;
};

export type CreateMenuItemResult = {
  itemId: string;
  name: string;
  categoryName?: string | null;
  taxRate: number;
  price: number;
  currency: string;
  locationId: string;
};

export type MenuModifier = SampleMenuModifier;

export const createMenuModifier = async (
  tenantId: string,
  input: { name: string; priceDelta?: number; maxSelect?: number | null }
): Promise<MenuModifier> => {
  const name = input.name.trim();
  if (name.length < 2) {
    throw Errors.validation("Name must be at least 2 characters");
  }
  const normalizedName = name[0].toUpperCase() + name.slice(1);
  const priceDelta = roundCurrency(input.priceDelta ?? 0);
  const maxSelect =
    input.maxSelect === undefined || input.maxSelect === null
      ? null
      : Math.max(0, Math.floor(input.maxSelect));

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT 1 FROM menu_modifiers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)",
      [tenantId, normalizedName]
    );
    if ((existing.rowCount ?? 0) > 0) {
      throw Errors.conflict("Modifier name already exists");
    }

    const modifierId = randomUUID();
    await client.query(
      `
        INSERT INTO menu_modifiers (id, tenant_id, name, price_delta, max_select)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [modifierId, tenantId, normalizedName, priceDelta, maxSelect]
    );

    await client.query("COMMIT");
    return {
      id: modifierId,
      name: normalizedName,
      priceDelta,
      maxSelect
    };
  } catch (error) {
    await client?.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
  }
};

export const createPosTicket = async (
  tenantId: string,
  userId: string | null | undefined,
  input: CreatePosTicketInput
): Promise<CreatePosTicketResult> => {
  const aggregatedItems = aggregateTicketItems(input.items ?? []);
  if (aggregatedItems.length === 0) {
    throw Errors.validation("At least one ticket item is required");
  }
  const locationId = input.locationId ?? ZERO_LOCATION_ID;
  const trimmedNotes = input.notes?.trim();
  const notes = trimmedNotes && trimmedNotes.length > 0 ? trimmedNotes.slice(0, 256) : null;
  const paymentMethod = normalizePaymentMethod(input.paymentMethod);
  const rawTipAmount = Number(input.tipAmount ?? 0);
  if (!Number.isFinite(rawTipAmount) || rawTipAmount < 0) {
    throw Errors.validation("Tip amount must be a non-negative number");
  }
  const tipAmount = roundCurrency(rawTipAmount);
  const actorId = userId ?? null;
  const paymentReferenceInput = sanitizeOptionalString(input.paymentReference, 64);
  const paymentProcessorInput = sanitizeOptionalString(input.paymentProcessor, 64);
  const paymentProcessorPaymentIdInput = sanitizeOptionalString(input.paymentProcessorPaymentId, 96);
  const paymentMethodTypeInput = sanitizeOptionalString(input.paymentMethodType, 32);
  const paymentMethodBrandInput = sanitizeOptionalString(input.paymentMethodBrand, 32);
  const paymentMethodLast4Input = sanitizeOptionalString(input.paymentMethodLast4, 4);
  const receiptUrlInput = sanitizeOptionalString(input.receiptUrl, 512);
  const paymentMetadataInput = isPlainObject(input.metadata) ? input.metadata : {};
  const loyaltyCustomerId = sanitizeOptionalString(input.loyaltyCustomerId, 160);

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    if (locationId !== ZERO_LOCATION_ID) {
      const locationExists = await client.query(
        "SELECT 1 FROM tenant_locations WHERE tenant_id = $1 AND id = $2",
        [tenantId, locationId]
      );
      if ((locationExists.rowCount ?? 0) === 0) {
        throw Errors.notFound("Location not found");
      }
    }

    const menuItemIds = aggregatedItems.map((item) => item.menuItemId);
    const pricingRows = (
      await client.query(menuPricingSql, [tenantId, locationId, ZERO_LOCATION_ID, menuItemIds])
    ).rows;
    if (pricingRows.length !== menuItemIds.length) {
      throw Errors.validation("One or more menu items are unavailable");
    }
    const pricingMap = new Map<string, Record<string, unknown>>();
    for (const row of pricingRows) {
      pricingMap.set(String(row.menu_item_id ?? row.id), row);
    }

    const pricedItems = aggregatedItems.map((item) => {
      const pricing = pricingMap.get(item.menuItemId);
      if (!pricing) {
        throw Errors.validation("Menu item is unavailable");
      }
      const unitPrice = roundCurrency(Number(pricing.price ?? 0));
      if (unitPrice <= 0) {
        throw Errors.validation("Menu item price must be greater than zero");
      }
      const quantity = roundQuantity(item.quantity);
      const lineSubtotal = roundCurrency(unitPrice * quantity);
      const taxRate = Number(pricing.tax_rate ?? 0) / 100;
      const lineTax = roundCurrency(lineSubtotal * taxRate);
      const currency = typeof pricing.currency === "string" && pricing.currency.trim().length > 0
        ? pricing.currency.toUpperCase()
        : "USD";
      return {
        menuItemId: item.menuItemId,
        name: String(pricing.name ?? "Menu item"),
        quantity,
        unitPrice,
        lineSubtotal,
        lineTax,
        currency
      };
    });

    const subtotal = roundCurrency(
      pricedItems.reduce((total, item) => total + item.lineSubtotal, 0)
    );
    if (subtotal <= 0) {
      throw Errors.validation("Subtotal must be greater than zero");
    }
    const taxAmount = roundCurrency(
      pricedItems.reduce((total, item) => total + item.lineTax, 0)
    );
    const total = roundCurrency(subtotal + taxAmount);
    const ticketId = randomUUID();
    const paymentId = randomUUID();
    const ticketCurrency = pricedItems[0]?.currency ?? "USD";

    const captureResult = await capturePayment({
      tenantId,
      ticketId,
      paymentId,
      amount: total,
      tipAmount,
      currency: ticketCurrency,
      method: paymentMethod,
      locationId,
      metadata: paymentMetadataInput
    });
    const paymentStatus = captureResult.status ?? "completed";
    const paymentFailureReason = captureResult.failureReason ?? null;
    const isPaymentCompleted = paymentStatus === "completed";
    const ticketStatus = isPaymentCompleted ? "settled" : "open";
    const closedBy = isPaymentCompleted ? actorId : null;
    const closedAt = isPaymentCompleted ? new Date() : null;
    const capturedAt = isPaymentCompleted ? new Date() : null;

    await client.query(
      `
        INSERT INTO pos_tickets (
          id, tenant_id, status, subtotal, tax_amount, total, notes, opened_by, closed_by, opened_at, closed_at, location_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11)
      `,
      [ticketId, tenantId, ticketStatus, subtotal, taxAmount, total, notes, actorId, closedBy, closedAt, locationId]
    );

    for (const item of pricedItems) {
      await client.query(
        `
          INSERT INTO pos_ticket_items (
            id, tenant_id, ticket_id, menu_item_id, name, quantity, unit_price, total_price, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
        `,
        [
          randomUUID(),
          tenantId,
          ticketId,
          item.menuItemId,
          item.name,
          item.quantity,
          item.unitPrice,
          item.lineSubtotal
        ]
      );
    }

    const captureMetadata = isPlainObject(captureResult.metadata) ? captureResult.metadata : {};
    const loyaltyMetadata = loyaltyCustomerId ? { loyaltyExternalCustomerId: loyaltyCustomerId } : {};
    const combinedMetadata = { ...captureMetadata, ...paymentMetadataInput, ...loyaltyMetadata };

    await client.query(
      `
        INSERT INTO pos_payments (
          id,
          tenant_id,
          ticket_id,
          amount,
          tip_amount,
          method,
          status,
          processed_by,
          reference,
          location_id,
          processor,
          processor_payment_id,
          method_type,
          method_brand,
          method_last4,
          receipt_url,
          failure_reason,
          metadata,
          captured_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19
        )
      `,
      [
        paymentId,
        tenantId,
        ticketId,
        total,
        tipAmount,
        paymentMethod,
        paymentStatus,
        actorId,
        paymentReferenceInput ?? captureResult.reference ?? null,
        locationId,
        paymentProcessorInput ?? captureResult.processor ?? "mockpay",
        paymentProcessorPaymentIdInput ?? captureResult.processorPaymentId ?? null,
        paymentMethodTypeInput ?? captureResult.methodType ?? null,
        paymentMethodBrandInput ?? captureResult.methodBrand ?? null,
        paymentMethodLast4Input ?? captureResult.methodLast4 ?? null,
        receiptUrlInput ?? captureResult.receiptUrl ?? null,
        paymentFailureReason,
        combinedMetadata,
        capturedAt
      ]
    );

    await client.query("COMMIT");

    const resolvedReference = paymentReferenceInput ?? captureResult.reference ?? null;
    const resolvedReceiptUrl = receiptUrlInput ?? captureResult.receiptUrl ?? null;
    if (paymentStatus === "pending" && env.PAYMENT_PROVIDER_MODE === "sandbox") {
      await enqueuePaymentStatusJob(
        {
          tenantId,
          paymentId,
          ticketId,
          processedBy: actorId,
          targetStatus: env.PAYMENT_PROVIDER_SANDBOX_OUTCOME === "failed" ? "failed" : "completed"
        },
        { delayMs: env.PAYMENT_PROVIDER_SANDBOX_SETTLE_DELAY_MS }
      );
    }

    if (isPaymentCompleted && loyaltyCustomerId) {
      await awardLoyaltyForSale({
        tenantId,
        actorId,
        paymentId,
        ticketId,
        amount: total,
        loyaltyCustomerId,
        existingPointsEarned: 0,
        existingPointsRedeemed: 0
      });
    }

    return {
      ticketId,
      paymentId,
      locationId,
      subtotal,
      taxAmount,
      total,
      tipAmount,
      paymentMethod,
      paymentReference: resolvedReference,
      paymentProcessor: paymentProcessorInput ?? captureResult.processor ?? "mockpay",
      paymentProcessorPaymentId:
        paymentProcessorPaymentIdInput ?? captureResult.processorPaymentId ?? null,
      paymentMethodType: paymentMethodTypeInput ?? captureResult.methodType ?? null,
      paymentMethodBrand: paymentMethodBrandInput ?? captureResult.methodBrand ?? null,
      paymentMethodLast4: paymentMethodLast4Input ?? captureResult.methodLast4 ?? null,
      receiptUrl: resolvedReceiptUrl,
      paymentStatus,
      ticketStatus,
      failureReason: paymentFailureReason,
      capturedAtIso: capturedAt ? capturedAt.toISOString() : null,
      closedAtIso: closedAt ? closedAt.toISOString() : null
    };
  } catch (error) {
    await client?.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
  }
};

export const createPaymentRefund = async (
  tenantId: string,
  paymentId: string,
  userId: string | null | undefined,
  input: PaymentRefundInput
): Promise<PaymentRefundResult> => {
  const rawAmount = Number(input.amount ?? 0);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    throw Errors.validation("Refund amount must be greater than zero");
  }
  const refundAmount = roundCurrency(rawAmount);
  const reason = sanitizeOptionalString(input.reason, 256);
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const paymentRow = await client.query<{
      amount: number;
      tip_amount: number;
      refunded_amount: number;
      status: string;
      location_id: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `
        SELECT amount, tip_amount, refunded_amount, status, location_id, metadata
        FROM pos_payments
        WHERE tenant_id = $1 AND id = $2
        FOR UPDATE
      `,
      [tenantId, paymentId]
    );
    if (paymentRow.rowCount === 0) {
      throw Errors.notFound("Payment not found");
    }
    const payment = paymentRow.rows[0];
    const loyaltyMeta = getLoyaltyMetaFromPayment(payment.metadata);
    const normalizedStatus = String(payment.status ?? "").toLowerCase();
    if (normalizedStatus !== "completed") {
      throw Errors.validation("Only completed payments can be refunded");
    }
    const grossAmount = roundCurrency(Number(payment.amount ?? 0) + Number(payment.tip_amount ?? 0));
    const alreadyRefunded = roundCurrency(Number(payment.refunded_amount ?? 0));
    const remaining = roundCurrency(grossAmount - alreadyRefunded);
    if (remaining <= 0) {
      throw Errors.validation("Payment has already been fully refunded");
    }
    if (refundAmount > remaining) {
      throw Errors.validation("Refund amount exceeds remaining balance");
    }
    const refundId = randomUUID();
    const metadataCurrency =
      payment.metadata && typeof (payment.metadata as Record<string, unknown>).currency === "string"
        ? String((payment.metadata as Record<string, unknown>).currency)
        : undefined;
    const paymentCurrency = (metadataCurrency ?? "USD").toUpperCase();
    const providerResult = await refundWithProvider({
      tenantId,
      paymentId,
      refundId,
      amount: refundAmount,
      currency: paymentCurrency,
      reason: reason ?? null
    });
    const refundStatus = providerResult.status ?? "completed";
    const refundFailureReason = providerResult.failureReason ?? null;
    const processedAt = refundStatus === "completed" ? new Date() : null;
    const refundMetadata = {
      ...(providerResult.metadata ?? {}),
      failureReason: refundFailureReason ?? undefined
    };
    await client.query(
      `
        INSERT INTO pos_payment_refunds (
          id,
          tenant_id,
          payment_id,
          amount,
          reason,
          status,
          processed_by,
          processed_at,
          processor_refund_id,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        refundId,
        tenantId,
        paymentId,
        refundAmount,
        reason,
        refundStatus,
        userId ?? null,
        processedAt,
        providerResult.processorRefundId,
        refundMetadata
      ]
    );
    if (refundStatus === "completed") {
      await client.query(
        `
          UPDATE pos_payments
          SET refunded_amount = COALESCE(refunded_amount, 0) + $1
          WHERE tenant_id = $2 AND id = $3
        `,
        [refundAmount, tenantId, paymentId]
      );
    }
    await client.query("COMMIT");

    if (refundStatus === "completed" && loyaltyMeta.loyaltyExternalCustomerId) {
      await redeemLoyaltyForRefund({
        tenantId,
        actorId: userId ?? null,
        paymentId,
        loyaltyCustomerId: loyaltyMeta.loyaltyExternalCustomerId,
        grossAmount,
        refundAmount,
        pointsEarned: loyaltyMeta.loyaltyPointsEarned,
        pointsRedeemed: loyaltyMeta.loyaltyPointsRedeemed
      });
    }
    return {
      refundId,
      paymentId,
      amount: refundAmount,
      remainingAmount: refundStatus === "completed" ? roundCurrency(remaining - refundAmount) : remaining,
      status: refundStatus,
      reason: reason ?? null,
      processorRefundId: providerResult.processorRefundId,
      failureReason: refundFailureReason
    };
  } catch (error) {
    await client?.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
  }
};

export const updateMenuItemDetails = async (
  tenantId: string,
  menuItemId: string,
  input: MenuItemUpdateInput
): Promise<MenuItemUpdateResult> => {
  const trimmedName = input.name?.trim();
  const hasName = typeof trimmedName === "string" && trimmedName.length >= 2;
  const descriptionProvided = input.description !== undefined;
  const trimmedDescription = descriptionProvided
    ? (input.description ?? "").toString().trim()
    : "";
  const nextDescription = descriptionProvided
    ? trimmedDescription.length === 0
      ? null
      : trimmedDescription
    : undefined;
  const taxRateProvided = input.taxRate !== undefined;
  const taxRateValue = typeof input.taxRate === "number" ? Number(input.taxRate) : undefined;
  const priceProvided = input.price !== undefined;
  const nextPrice = typeof input.price === "number" ? roundCurrency(input.price) : undefined;
  const nextCurrency = input.currency?.trim().toUpperCase();
  const priceLocationId = input.locationId ?? ZERO_LOCATION_ID;

  if (
    !hasName &&
    !descriptionProvided &&
    !taxRateProvided &&
    !priceProvided &&
    (!nextCurrency || !priceProvided)
  ) {
    throw Errors.validation("Provide at least one field to update");
  }

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const itemExists = await client.query(
      "SELECT id FROM menu_items WHERE tenant_id = $1 AND id = $2",
      [tenantId, menuItemId]
    );
    if ((itemExists.rowCount ?? 0) === 0) {
      throw Errors.notFound("Menu item not found");
    }

    const updates: string[] = [];
    const values: Array<string | number | null> = [tenantId, menuItemId];
    const result: MenuItemUpdateResult = { itemId: menuItemId };

    if (hasName && trimmedName) {
      updates.push("name = $${values.length + 1}");
      values.push(trimmedName);
      result.name = trimmedName;
    }

    if (descriptionProvided) {
      updates.push("description = $${values.length + 1}");
      values.push(nextDescription ?? null);
      result.description = nextDescription ?? null;
    }

    if (taxRateProvided) {
      if (!Number.isFinite(taxRateValue)) {
        throw Errors.validation("Invalid tax rate");
      }
      updates.push("tax_rate = $${values.length + 1}");
      values.push(Number(taxRateValue?.toFixed(2) ?? 0));
      result.taxRate = Number(taxRateValue?.toFixed(2) ?? 0);
    }

    if (updates.length > 0) {
      const setClauses = [...updates, "updated_at = NOW()"].join(", ");
      await client.query(
        "UPDATE menu_items SET ${setClauses} WHERE tenant_id = $1 AND id = $2",
        values
      );
    }

    if (priceProvided) {
      if (!Number.isFinite(nextPrice) || Number(nextPrice) <= 0) {
        throw Errors.validation("Price must be greater than zero");
      }
      if (priceLocationId !== ZERO_LOCATION_ID) {
        const locationExists = await client.query(
          "SELECT 1 FROM tenant_locations WHERE tenant_id = $1 AND id = $2",
          [tenantId, priceLocationId]
        );
        if ((locationExists.rowCount ?? 0) === 0) {
          throw Errors.notFound("Location not found");
        }
      }
      const currency = nextCurrency ?? "USD";
      await client.query(
        `
          INSERT INTO menu_item_prices (tenant_id, menu_item_id, location_id, price, currency)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (tenant_id, menu_item_id, location_id)
          DO UPDATE SET price = EXCLUDED.price, currency = EXCLUDED.currency
        `,
        [tenantId, menuItemId, priceLocationId, nextPrice, currency]
      );
      result.price = nextPrice;
      result.currency = currency;
      result.locationId = priceLocationId;
    } else if (nextCurrency) {
      throw Errors.validation("currency requires price to be provided");
    }

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client?.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
  }
};

export const createMenuItem = async (
  tenantId: string,
  input: CreateMenuItemInput
): Promise<CreateMenuItemResult> => {
  const name = input.name.trim();
  if (name.length < 2) {
    throw Errors.validation("Name must be at least 2 characters long");
  }
  const description = input.description?.trim() || null;
  const taxRate = Number((input.taxRate ?? 0).toFixed(2));
  const price = roundCurrency(input.price);
  const locationId = input.locationId ?? ZERO_LOCATION_ID;
  const currency = (input.currency ?? "USD").toUpperCase();

  if (price <= 0) {
    throw Errors.validation("Price must be greater than zero");
  }

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    if (locationId !== ZERO_LOCATION_ID) {
      const locationExists = await client.query(
        "SELECT 1 FROM tenant_locations WHERE tenant_id = $1 AND id = $2",
        [tenantId, locationId]
      );
      if ((locationExists.rowCount ?? 0) === 0) {
        throw Errors.notFound("Location not found");
      }
    }

    const { id: categoryId, name: resolvedCategoryName } = await resolveCategoryId(
      client,
      tenantId,
      input.categoryName
    );

    const menuItemId = randomUUID();
    await client.query(
      `
        INSERT INTO menu_items (id, tenant_id, category_id, name, description, tax_rate)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [menuItemId, tenantId, categoryId, name, description, taxRate]
    );

    await client.query(
      `
        INSERT INTO menu_item_prices (tenant_id, menu_item_id, location_id, price, currency)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [tenantId, menuItemId, locationId, price, currency]
    );

    await client.query("COMMIT");
    return {
      itemId: menuItemId,
      name,
      categoryName: resolvedCategoryName,
      taxRate,
      price,
      currency,
      locationId
    };
  } catch (error) {
    await client?.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
  }
};

export const updateMenuItemModifiers = async (
  tenantId: string,
  menuItemId: string,
  modifierIds: string[]
): Promise<{ itemId: string; modifierIds: string[] }> => {
  const uniqueModifierIds = Array.from(new Set(modifierIds));
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const itemExists = await client.query(
      "SELECT 1 FROM menu_items WHERE tenant_id = $1 AND id = $2",
      [tenantId, menuItemId]
    );
    if ((itemExists.rowCount ?? 0) === 0) {
      throw Errors.notFound("Menu item not found");
    }

    if (uniqueModifierIds.length > 0) {
      const modifierRows = await client.query(
        "SELECT id FROM menu_modifiers WHERE tenant_id = $1 AND id = ANY($2::uuid[])",
        [tenantId, uniqueModifierIds]
      );
    if ((modifierRows.rowCount ?? 0) !== uniqueModifierIds.length) {
        throw Errors.validation("One or more modifiers not found");
      }
    }

    const currentRows = await client.query(
      "SELECT modifier_id FROM menu_item_modifiers WHERE tenant_id = $1 AND menu_item_id = $2",
      [tenantId, menuItemId]
    );
    const currentSet = new Set(currentRows.rows.map((row) => String(row.modifier_id)));
    const desiredSet = new Set(uniqueModifierIds);

    const toInsert = uniqueModifierIds.filter((id) => !currentSet.has(id));
    const toDelete = [...currentSet].filter((id) => !desiredSet.has(id));

    if (toInsert.length > 0) {
      await client.query(
        `
          INSERT INTO menu_item_modifiers (tenant_id, menu_item_id, modifier_id, required)
          SELECT $1, $2, modifier_id, FALSE FROM UNNEST($3::uuid[]) AS modifier_id
        `,
        [tenantId, menuItemId, toInsert]
      );
    }

    if (toDelete.length > 0) {
      await client.query(
        `
          DELETE FROM menu_item_modifiers
          WHERE tenant_id = $1
            AND menu_item_id = $2
            AND modifier_id = ANY($3::uuid[])
        `,
        [tenantId, menuItemId, toDelete]
      );
    }

    await client.query("COMMIT");
    return { itemId: menuItemId, modifierIds: uniqueModifierIds };
  } catch (error) {
    await client?.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
  }
};

export const createInventoryAdjustment = async (
  tenantId: string,
  itemId: string,
  input: InventoryAdjustmentInput
): Promise<InventoryAdjustmentResult> => {
  const rawDelta = Number(input.quantityDelta);
  if (!Number.isFinite(rawDelta) || rawDelta === 0) {
    throw Errors.validation("Quantity delta must be a non-zero number");
  }
  const locationId = input.locationId ?? ZERO_LOCATION_ID;
  const reason = input.reason.trim();
  const notes = input.notes?.trim() || null;
  const reference = input.reference?.trim() || null;

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const itemExists = await client.query(
      "SELECT 1 FROM inventory_items WHERE tenant_id = $1 AND id = $2",
      [tenantId, itemId]
    );
    if ((itemExists.rowCount ?? 0) === 0) {
      throw Errors.notFound("Inventory item not found");
    }
    if (locationId !== ZERO_LOCATION_ID) {
      const locationExists = await client.query(
        "SELECT 1 FROM tenant_locations WHERE tenant_id = $1 AND id = $2",
        [tenantId, locationId]
      );
      if ((locationExists.rowCount ?? 0) === 0) {
        throw Errors.notFound("Location not found");
      }
    }
    const stockRow = (
      await client.query(inventoryStockLevelForUpdateSql, [tenantId, itemId, locationId])
    ).rows[0];
    const previousQuantity = Number(stockRow?.quantity ?? 0);
    const newQuantity = roundQuantity(previousQuantity + rawDelta);
    if (newQuantity < 0) {
      throw Errors.validation("Adjustment would result in a negative quantity");
    }
    await client.query(upsertInventoryStockLevelSql, [tenantId, itemId, locationId, newQuantity]);
    await client.query(insertInventoryMovementSql, [
      tenantId,
      itemId,
      roundQuantity(rawDelta),
      reason,
      previousQuantity,
      newQuantity,
      reference,
      notes,
      input.userId ?? null,
      locationId === ZERO_LOCATION_ID ? null : locationId,
      "manual_adjustment",
      null,
      null
    ]);
    await client.query("COMMIT");
    return {
      itemId,
      locationId,
      previousQuantity,
      newQuantity
    };
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
  }
};

const mapAccountProfile = (row: DbRow): AccountProfile => ({
  firstName: String(row.first_name ?? ""),
  lastName: String(row.last_name ?? ""),
  title: row.title ? String(row.title) : null,
  email: String(row.email ?? ""),
  bio: row.bio ? String(row.bio) : null
});

export const getAccountProfile = async (tenantId: string, userId: string): Promise<AccountProfile> => {
  const result = await pool.query(selectAccountProfileSql, [tenantId, userId]);
  if (result.rowCount === 0) {
    throw Errors.notFound("User not found");
  }
  return mapAccountProfile(result.rows[0]);
};

const isUniqueViolation = (error: unknown) =>
  Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");

export const updateAccountProfile = async (
  tenantId: string,
  userId: string,
  input: AccountProfileInput
): Promise<AccountProfile> => {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const title = input.title?.trim() || null;
  const bio = input.bio?.trim() || null;

  try {
    const result = await pool.query(updateAccountProfileSql, [
      tenantId,
      userId,
      firstName,
      lastName,
      email,
      title,
      bio
    ]);
    if (result.rowCount === 0) {
      throw Errors.notFound("User not found");
    }
    return mapAccountProfile(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw Errors.conflict("Email already in use");
    }
    throw error;
  }
};

const mapBusinessProfile = (row: DbRow): BusinessProfile => ({
  legalName: String(row.legal_name ?? ""),
  doingBusinessAs: row.doing_business_as ? String(row.doing_business_as) : null,
  supportEmail: row.support_email ? String(row.support_email) : null,
  supportPhone: row.support_phone ? String(row.support_phone) : null,
  website: row.website ? String(row.website) : null,
  timezone: String(row.timezone ?? "UTC"),
  notes: row.notes ? String(row.notes) : null
});

export const getBusinessProfile = async (tenantId: string): Promise<BusinessProfile> => {
  const profileResult = await pool.query(selectBusinessProfileSql, [tenantId]);
  if ((profileResult.rowCount ?? 0) > 0) {
    return mapBusinessProfile(profileResult.rows[0]);
  }
  const tenantResult = await pool.query("SELECT name, timezone FROM tenants WHERE id = $1", [tenantId]);
  if (tenantResult.rowCount === 0) {
    throw Errors.notFound("Tenant not found");
  }
  const fallbackRow = {
    legal_name: tenantResult.rows[0].name,
    doing_business_as: tenantResult.rows[0].name,
    support_email: null,
    support_phone: null,
    website: null,
    timezone: tenantResult.rows[0].timezone,
    notes: null
  };
  return mapBusinessProfile(fallbackRow);
};

export const updateBusinessProfile = async (
  tenantId: string,
  input: BusinessProfileInput
): Promise<BusinessProfile> => {
  const legalName = input.legalName.trim();
  const doingBusinessAs = input.doingBusinessAs?.trim() || null;
  const supportEmail = input.supportEmail?.trim().toLowerCase() || null;
  const supportPhone = input.supportPhone?.trim() || null;
  const website = input.website?.trim() || null;
  const timezone = input.timezone.trim() || "UTC";
  const notes = input.notes?.trim() || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const profileResult = await client.query(upsertBusinessProfileSql, [
      tenantId,
      legalName,
      doingBusinessAs,
      supportEmail,
      supportPhone,
      website,
      timezone,
      notes
    ]);
    await client.query("UPDATE tenants SET name = $2, timezone = $3, updated_at = NOW() WHERE id = $1", [
      tenantId,
      legalName,
      timezone
    ]);
    await client.query("COMMIT");
    return mapBusinessProfile(profileResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const mapInventoryAuditEntry = (row: DbRow): InventoryAuditLogEntry => ({
  id: String(row.id),
  itemId: String(row.item_id ?? ""),
  itemName: String(row.item_name ?? "Unknown Item"),
  unit: String(row.unit ?? "units"),
  delta: Number(row.quantity ?? 0),
  reason: String(row.reason ?? "Adjustment"),
  previousQuantity: Number(row.previous_quantity ?? 0),
  newQuantity: Number(row.new_quantity ?? 0),
  notes: row.notes ? String(row.notes) : null,
  reference: row.reference ? String(row.reference) : null,
  createdAtIso: new Date(row.created_at as string | Date).toISOString(),
  user:
    row.first_name || row.last_name
      ? [row.first_name, row.last_name].filter(Boolean).join(" ").trim()
      : "System",
  locationName: row.location_name
    ? String(row.location_name)
    : fallbackLocationName(String(row.normalized_location_id ?? ZERO_LOCATION_ID)),
  source: toStringOrDefault(row.source, "manual"),
  countId: row.count_id ? String(row.count_id) : null,
  attachmentUrl: row.attachment_url ? String(row.attachment_url) : null
});

const formatInventoryCountSession = (row: DbRow): InventoryCountSession => {
  const locationId = String(row.location_id ?? ZERO_LOCATION_ID);
  return {
    id: String(row.id),
    name: toStringOrDefault(row.name, "Inventory Count"),
    status: toStringOrDefault(row.status, "draft") as InventoryCountSession["status"],
    locationId,
    locationName: toStringOrDefault(row.location_name, fallbackLocationName(locationId)),
    scheduledAt: toIsoString(row.scheduled_at as string | Date | null) ?? null,
    startedAt: toIsoString(row.started_at as string | Date | null) ?? null,
    completedAt: toIsoString(row.completed_at as string | Date | null) ?? null,
    updatedAt: toIsoString(row.updated_at as string | Date | null) ?? null,
    notes: row.notes ? String(row.notes) : null,
    totalItems: toNumberOrDefault(row.total_items, 0),
    totalVariance: roundQuantity(toNumberOrDefault(row.total_variance, 0)),
    attachmentsCount: toNumberOrDefault(row.attachments_count, 0)
  };
};

const formatInventoryCountAttachment = (row: DbRow): InventoryCountAttachment => ({
  id: String(row.id),
  countId: String(row.count_id),
  url: toStringOrDefault(row.url, "#"),
  label: toOptionalString(row.label) ?? null,
  createdAt: toIsoString(row.created_at as string | Date | null) ?? new Date().toISOString(),
  createdByName: toOptionalString(row.created_by_name) ?? null
});

const formatInventoryCountEntry = (row: DbRow): InventoryCountEntry => ({
  itemId: String(row.item_id),
  itemName: toStringOrDefault(row.item_name, "Inventory Item"),
  sku: toOptionalString(row.sku) ?? null,
  unit: toStringOrDefault(row.unit, "unit"),
  systemQuantity: roundQuantity(Number(row.system_quantity ?? 0)),
  countedQuantity: roundQuantity(Number(row.counted_quantity ?? 0)),
  variance: roundQuantity(Number(row.variance ?? 0)),
  notes: toOptionalString(row.notes) ?? null
});

const fetchInventoryCountSession = async (
  client: PoolClient,
  tenantId: string,
  countId: string
) => {
  const row = (
    await client.query(inventoryCountDetailSql, [tenantId, countId, ZERO_LOCATION_ID])
  ).rows[0];
  if (!row) throw Errors.notFound("Inventory count session not found");
  return formatInventoryCountSession(row);
};

const loadInventoryCountSession = async (
  client: PoolClient,
  tenantId: string,
  countId: string
) => {
  const row = (
    await client.query(inventoryCountSessionLockSql, [tenantId, countId, ZERO_LOCATION_ID])
  ).rows[0];
  if (!row) throw Errors.notFound("Inventory count session not found");
  return {
    id: String(row.id),
    name: toStringOrDefault(row.name, "Inventory Count"),
    status: toStringOrDefault(row.status, "draft"),
    locationId: String(row.location_id ?? ZERO_LOCATION_ID),
    notes: row.notes ? String(row.notes) : null
  };
};

const fetchInventoryCountEntries = async (client: PoolClient, countId: string) => {
  const rows = (await client.query(inventoryCountEntriesSql, [countId])).rows;
  return rows.map(formatInventoryCountEntry);
};

export const getInventoryAuditLog = async (
  tenantId: string,
  logger: FastifyBaseLogger,
  limit = 20
): Promise<InventoryAuditLogEntry[]> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const rows = (await client.query(inventoryAuditLogSql, [tenantId, limit, ZERO_LOCATION_ID])).rows;
    return rows.map(mapInventoryAuditEntry);
  } catch (error) {
    logger.error({ err: error }, "portal.inventory.audit.failed");
    throw error;
  } finally {
    client?.release();
  }
};

export const getInventoryCounts = async (
  tenantId: string,
  limit = 20
): Promise<InventoryCountSession[]> => {
  const rows = (
    await pool.query(inventoryCountSessionsSql, [tenantId, ZERO_LOCATION_ID, limit])
  ).rows;
  return rows.map(formatInventoryCountSession);
};

export const getInventoryCountDetail = async (
  tenantId: string,
  countId: string
): Promise<InventoryCountDetail> => {
  const client = await pool.connect();
  try {
    const session = await fetchInventoryCountSession(client, tenantId, countId);
    const entries = await fetchInventoryCountEntries(client, countId);
    const attachmentsResult = await client.query(inventoryCountAttachmentsSql, [tenantId, countId]);
    const attachments = attachmentsResult.rows.map(formatInventoryCountAttachment);
    return { session, entries, attachments };
  } finally {
    client.release();
  }
};

export const getInventoryCountSessionSummary = async (
  tenantId: string,
  countId: string
): Promise<InventoryCountSession> => {
  const client = await pool.connect();
  try {
    return await fetchInventoryCountSession(client, tenantId, countId);
  } finally {
    client.release();
  }
};

const ensureTenantLocation = async (client: PoolClient, tenantId: string, locationId: string) => {
  if (locationId === ZERO_LOCATION_ID) {
    return;
  }
  const check = await client.query(
    "SELECT 1 FROM tenant_locations WHERE tenant_id = $1 AND id = $2",
    [tenantId, locationId]
  );
  if ((check.rowCount ?? 0) === 0) {
    throw Errors.notFound("Location not found");
  }
};

export const createInventoryCountSession = async (
  tenantId: string,
  userId: string | null | undefined,
  input: CreateInventoryCountInput
): Promise<InventoryCountSession> => {
  const name = sanitizeOptionalString(input.name, 120);
  if (!name || name.length < 3) {
    throw Errors.validation("Name must be at least 3 characters");
  }
  const locationId = input.locationId ?? ZERO_LOCATION_ID;
  const scheduledAtValue = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAtValue && Number.isNaN(scheduledAtValue.getTime())) {
    throw Errors.validation("scheduledAt must be a valid ISO date");
  }
  const scheduledAt = scheduledAtValue ? scheduledAtValue.toISOString() : null;
  const sessionId = randomUUID();
  const notes = sanitizeOptionalString(input.notes, 512);

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await ensureTenantLocation(client, tenantId, locationId);
    await client.query(
      `
        INSERT INTO inventory_counts (
          id,
          tenant_id,
          name,
          status,
          location_id,
          scheduled_at,
          created_by,
          started_at,
          updated_at,
          notes
        )
        VALUES ($1, $2, $3, 'in_progress', $4, $5, $6, NOW(), NOW(), $7)
      `,
      [sessionId, tenantId, name, locationId, scheduledAt, userId ?? null, notes]
    );
    const session = await fetchInventoryCountSession(client, tenantId, sessionId);
    await client.query("COMMIT");
    return session;
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
  }
};

export const recordInventoryCountEntries = async (
  tenantId: string,
  countId: string,
  _userId: string | null | undefined,
  input: InventoryCountEntriesInput
): Promise<InventoryCountSession> => {
  const normalizedEntries = normalizeCountEntriesInput(input.entries);
  const itemIds = normalizedEntries.map((entry) => entry.itemId);
  const uniqueItemIds = Array.from(new Set(itemIds));

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const session = await loadInventoryCountSession(client, tenantId, countId);
    if (session.status === "completed") {
      throw Errors.conflict("Inventory count already completed");
    }

    if (uniqueItemIds.length > 0) {
      const itemRows = (
        await client.query(inventoryCountItemValidationSql, [tenantId, uniqueItemIds])
      ).rows;
      if (itemRows.length !== uniqueItemIds.length) {
        throw Errors.validation("One or more inventory items are invalid or unavailable");
      }
    }

    const stockRows =
      uniqueItemIds.length > 0
        ? (
            await client.query(inventoryCountStockSql, [
              tenantId,
              uniqueItemIds,
              session.locationId === ZERO_LOCATION_ID ? ZERO_LOCATION_ID : session.locationId
            ])
          ).rows
        : [];
    const stockMap = new Map<string, number>(
      stockRows.map((row) => [String(row.item_id), Number(row.quantity ?? 0)])
    );

    for (const entry of normalizedEntries) {
      const systemQuantity = roundQuantity(stockMap.get(entry.itemId) ?? 0);
      const variance = roundQuantity(entry.countedQuantity - systemQuantity);
      await client.query(
        `
          INSERT INTO inventory_count_items (
            count_id,
            item_id,
            system_quantity,
            counted_quantity,
            variance,
            notes
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (count_id, item_id)
          DO UPDATE SET
            system_quantity = EXCLUDED.system_quantity,
            counted_quantity = EXCLUDED.counted_quantity,
            variance = EXCLUDED.variance,
            notes = EXCLUDED.notes
        `,
        [countId, entry.itemId, systemQuantity, entry.countedQuantity, variance, entry.notes]
      );
    }

    await client.query(
      `
        UPDATE inventory_counts
        SET status = 'in_progress',
            started_at = COALESCE(started_at, NOW()),
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2
      `,
      [tenantId, countId]
    );
    const sessionSummary = await fetchInventoryCountSession(client, tenantId, countId);
    await client.query("COMMIT");
    return sessionSummary;
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
  }
};

export const completeInventoryCountSession = async (
  tenantId: string,
  countId: string,
  userId: string | null | undefined
): Promise<InventoryCountDetail> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const session = await loadInventoryCountSession(client, tenantId, countId);
    if (session.status === "completed") {
      throw Errors.conflict("Inventory count already completed");
    }
    const entries = await fetchInventoryCountEntries(client, countId);
    if (entries.length === 0) {
      throw Errors.validation("Add at least one counted item before completing the session");
    }
    for (const entry of entries) {
      await client.query(upsertInventoryStockLevelSql, [
        tenantId,
        entry.itemId,
        session.locationId,
        entry.countedQuantity
      ]);
      if (entry.variance !== 0) {
        await client.query(insertInventoryMovementSql, [
          tenantId,
          entry.itemId,
          entry.variance,
          "inventory_count",
          entry.systemQuantity,
          entry.countedQuantity,
          session.name,
          entry.notes,
          userId ?? null,
          session.locationId === ZERO_LOCATION_ID ? null : session.locationId,
          "inventory_count",
          null,
          countId
        ]);
      }
    }
    await client.query(
      `
        UPDATE inventory_counts
        SET status = 'completed',
            completed_at = NOW(),
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2
      `,
      [tenantId, countId]
    );
    const sessionSummary = await fetchInventoryCountSession(client, tenantId, countId);
    const attachmentsRows = await client.query(inventoryCountAttachmentsSql, [tenantId, countId]);
    await client.query("COMMIT");
    return {
      session: sessionSummary,
      entries,
      attachments: attachmentsRows.rows.map(formatInventoryCountAttachment)
    };
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
  }
};

type InventoryCountAttachmentInput = {
  url: string;
  label?: string | null;
};

export const createInventoryCountAttachment = async (
  tenantId: string,
  countId: string,
  userId: string | null | undefined,
  input: InventoryCountAttachmentInput
): Promise<InventoryCountAttachment> => {
  const url = input.url.trim();
  const label = sanitizeOptionalString(input.label, 120);
  if (!url) {
    throw Errors.validation("Attachment URL is required");
  }

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const attachmentId = randomUUID();
    await client.query(
      `
        INSERT INTO inventory_count_attachments (id, tenant_id, count_id, url, label, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [attachmentId, tenantId, countId, url, label, userId ?? null]
    );
    const row = (
      await client.query(inventoryCountAttachmentByIdSql, [tenantId, attachmentId])
    ).rows[0];
    if (!row) {
      throw Errors.internal("Attachment not found after creation");
    }
    return formatInventoryCountAttachment(row);
  } finally {
    client?.release();
  }
};

export const getTicketFeedData = async (
  tenantId: string,
  logger: FastifyBaseLogger,
  limit = 10
): Promise<Ticket[]> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const ticketRows = (await client.query(recentTicketsSql, [tenantId, limit])).rows;
    if (ticketRows.length === 0) {
      return getSampleTickets();
    }
    const ticketIds = ticketRows.map((row) => row.id);
    const itemsRows = ticketIds.length
      ? (await client.query(ticketItemsSql, [tenantId, ticketIds])).rows
      : [];
    const itemsByTicket = collectTicketItems(itemsRows);
    return mapTickets(ticketRows, itemsByTicket);
  } catch (error) {
    return fallbackWithLog(logger, "portal.pos.fallback", getSampleTickets, error);
  } finally {
    client?.release();
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDayUtc = (date: Date) => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const addDaysUtc = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

const normalizePaymentRange = (startInput?: string, endInput?: string) => {
  const end = endInput ? new Date(endInput) : new Date();
  let start = startInput ? new Date(startInput) : new Date(end);
  if (!startInput) {
    start.setUTCDate(end.getUTCDate() - 6);
  }
  if (start > end) {
    const temp = new Date(start);
    start = end;
    end.setTime(temp.getTime());
  }
  const maxStart = new Date(end.getTime() - 89 * DAY_MS);
  if (start < maxStart) {
    start = maxStart;
  }
  return {
    start: startOfDayUtc(start),
    endExclusive: startOfDayUtc(addDaysUtc(end, 1))
  };
};

export const getPaymentsData = async (
  tenantId: string,
  logger: FastifyBaseLogger,
  options?: { limit?: number; method?: string | null; startDate?: string; endDate?: string }
): Promise<PaymentsSnapshot> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const summaryRow =
      (await client.query(paymentsSummarySql, [tenantId])).rows[0] ?? {
        total_today: 0,
        total_week: 0
      };
    const limit = Math.min(Math.max(options?.limit ?? 15, 5), 50);
    const methodFilter = options?.method ?? null;
    const { start, endExclusive } = normalizePaymentRange(options?.startDate, options?.endDate);
    const methodRows = (await client.query(paymentsByMethodSql, [tenantId, start, endExclusive])).rows;
    const paymentRows = (
      await client.query(recentPaymentsSql, [tenantId, start, endExclusive, limit, methodFilter])
    ).rows;
    const rangeTotalRow =
      (await client.query(paymentsRangeTotalSql, [tenantId, start, endExclusive, methodFilter])).rows[0] ?? {
        total: 0
      };

    if (paymentRows.length === 0) {
      return filterPaymentsSnapshot(getPaymentsSnapshot(), {
        method: methodFilter,
        limit,
        startDate: options?.startDate,
        endDate: options?.endDate
      });
    }

    return {
      summary: {
        totalToday: formatCurrency(Number(summaryRow.total_today ?? 0)),
        totalWeek: formatCurrency(Number(summaryRow.total_week ?? 0)),
        rangeTotal: formatCurrency(Number(rangeTotalRow.total ?? 0)),
        methods: methodRows.map((row) => ({
          method: String(row.method ?? "Card"),
          amount: formatCurrency(Number(row.total ?? 0))
        }))
      },
      payments: mapPayments(paymentRows)
    };
  } catch (error) {
    return fallbackWithLog(
      logger,
      "portal.payments.fallback",
      () =>
        filterPaymentsSnapshot(getPaymentsSnapshot(), {
          method: options?.method,
          limit: options?.limit,
          startDate: options?.startDate,
          endDate: options?.endDate
        }),
      error
    );
  } finally {
    client?.release();
  }
};

export const getReportingData = async (
  tenantId: string,
  logger: FastifyBaseLogger,
  options?: { windowDays?: number; category?: string | null; locationId?: string | null }
): Promise<ReportingSnapshot> => {
  const windowDays = Math.min(Math.max(options?.windowDays ?? 7, 7), 90);
  const locationFilter = options?.locationId ?? null;
  const normalizedCategory = options?.category?.trim() || undefined;
  const reportingFilters: ReportingFilterOptions = {
    windowDays,
    category: normalizedCategory,
    locationId: locationFilter ?? undefined
  };

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    if (locationFilter) {
      const exists = await client.query(
        "SELECT 1 FROM tenant_locations WHERE tenant_id = $1 AND id = $2 LIMIT 1",
        [tenantId, locationFilter]
      );
      if ((exists.rowCount ?? 0) === 0) {
        throw Errors.notFound("Location not found");
      }
    }
    const revenueRows = (
      await client.query(revenueSeriesSql, [tenantId, windowDays, locationFilter])
    ).rows;
    const ticketRows = (
      await client.query(ticketSeriesSql, [tenantId, windowDays, locationFilter])
    ).rows;
    const categoryRows = (
      await client.query(topCategoriesSql, [tenantId, Math.max(windowDays, 30), locationFilter])
    ).rows;

    if (revenueRows.length === 0 && ticketRows.length === 0 && categoryRows.length === 0) {
      return filterReportingSnapshot(getReportingSnapshot(), reportingFilters);
    }

    const revenueSeries = buildDailySeries(
      windowDays,
      revenueRows.map((row) => ({
        bucket_date: row.bucket_date,
        value: Number(row.total ?? 0)
      }))
    ).map((point) => ({
      date: point.date,
      total: formatCurrency(point.value)
    }));

    const ticketSeries = buildDailySeries(
      windowDays,
      ticketRows.map((row) => ({
        bucket_date: row.bucket_date,
        value: Number(row.count ?? 0)
      }))
    ).map((point) => ({
      date: point.date,
      count: Math.round(point.value)
    }));

    const topCategoriesRaw = categoryRows.map((row) => ({
      category: String(row.category_name ?? "Uncategorized"),
      revenue: formatCurrency(Number(row.revenue ?? 0))
    }));
    const categoryOptions = Array.from(new Set(topCategoriesRaw.map((row) => row.category)));
    const normalizedCategoryLower = normalizedCategory?.toLowerCase();
    let filteredCategories = topCategoriesRaw;
    if (normalizedCategoryLower && normalizedCategoryLower.length > 0) {
      const matches = topCategoriesRaw.filter(
        (row) => row.category.toLowerCase() === normalizedCategoryLower
      );
      if (matches.length > 0) {
        filteredCategories = matches;
      }
    }

    return {
      revenueSeries,
      ticketSeries,
      topCategories: filteredCategories,
      categoryOptions
    };
  } catch (error) {
    return fallbackWithLog(
      logger,
      "portal.reporting.fallback",
      () => filterReportingSnapshot(getReportingSnapshot(), reportingFilters),
      error
    );
  } finally {
    client?.release();
  }
};

export type PortalModuleState = {
  moduleId: string;
  enabled: boolean;
  source: string;
  updatedAt?: string;
};

export type PortalFeatureFlagState = {
  moduleId: string;
  featureKey: string;
  enabled: boolean;
  overridden?: boolean;
  updatedAt?: string;
};

export type PortalLocationAccessPayload = {
  isScoped: boolean;
  allowedLocationIds: string[];
  manageableLocationIds: string[];
};

export type PortalTenantSummary = {
  id: string;
  name: string;
  alias: string | null;
  status: string;
  planName: string;
  planId?: string | null;
  subscriptionStatus?: string | null;
  nextPayout?: string | null;
  nextPayoutAt?: string | null;
  locationCount?: number | null;
};

export type PortalContextPayload = {
  tenant: PortalTenantSummary;
  modules: PortalModuleState[];
  featureFlags: PortalFeatureFlagState[];
  permissions: string[];
  roles: string[];
  locationAccess: PortalLocationAccessPayload;
};

const fallbackLocationName = (locationId: string) =>
  locationId === ZERO_LOCATION_ID ? "Primary Location" : "Unmanaged Location";

const fallbackLocationCode = (locationId: string) =>
  locationId === ZERO_LOCATION_ID ? "primary" : `loc-${locationId.slice(0, 8)}`;

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
};

const toStringOrDefault = (value: unknown, fallback: string) =>
  toOptionalString(value) ?? fallback;

const toNumberOrDefault = (value: unknown, fallback = 0) => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const uniqueStrings = (values: unknown[]): string[] =>
  Array.from(
    new Set(
      values
        .map((value) => toOptionalString(value))
        .filter((value): value is string => Boolean(value))
    )
  );

const emptyLocationAccess: PortalLocationAccessPayload = {
  isScoped: false,
  allowedLocationIds: [],
  manageableLocationIds: []
};

const toLocationSummary = (row: DbRow): PortalLocationSummary => {
  const locationId = String(row.location_id ?? ZERO_LOCATION_ID);
  const hasMetadata = Boolean(row.id);
  const isPrimary = locationId === ZERO_LOCATION_ID;
  return {
    id: hasMetadata ? String(row.id) : locationId,
    name: toStringOrDefault(row.name, fallbackLocationName(locationId)),
    code: toStringOrDefault(row.code, fallbackLocationCode(locationId)),
    timezone: toStringOrDefault(row.timezone, "UTC"),
    status: toStringOrDefault(row.status, "active"),
    totalInventoryItems: toNumberOrDefault(row.total_inventory_items),
    totalMenuItems: toNumberOrDefault(row.total_menu_items),
    isPrimary,
    managed: hasMetadata
  };
};

const buildLocationAccessPayload = (rows: DbRow[]): PortalLocationAccessPayload => {
  if (!rows.length) {
    return emptyLocationAccess;
  }

  const allowedLocationIds = uniqueStrings(rows.map((row) => row.location_id));
  const manageableLocationIds = uniqueStrings(
    rows.filter((row) => Boolean(row.can_assign)).map((row) => row.location_id)
  );

  return {
    isScoped: true,
    allowedLocationIds,
    manageableLocationIds
  };
};

export const getUserLocationAccess = async (
  tenantId: string,
  userId: string | null | undefined
): Promise<PortalLocationAccessPayload> => {
  if (!userId) {
    return emptyLocationAccess;
  }

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const rows = (await client.query(userLocationAccessSql, [tenantId, userId])).rows;
    return buildLocationAccessPayload(rows);
  } finally {
    client?.release();
  }
};

export type PortalLocationSummary = {
  id: string;
  name: string;
  code: string;
  timezone: string;
  status: string;
  totalInventoryItems: number;
  totalMenuItems: number;
  isPrimary: boolean;
  managed: boolean;
};

export type LocationInventoryAssignment = {
  itemId: string;
  name: string;
  sku: string | null;
  unit: string;
  quantity: number;
  reserved: number;
  onOrder: number;
};

export type LocationInventoryCandidate = {
  itemId: string;
  name: string;
  sku: string | null;
  unit: string;
  baselineQuantity: number;
};

export type LocationMenuAssignment = {
  menuItemId: string;
  name: string;
  category: string | null;
  price: number;
  currency: string;
};

export type LocationMenuCandidate = {
  menuItemId: string;
  name: string;
  category: string | null;
  defaultPrice: number;
  currency: string;
};

export type LocationAssignmentSummary = {
  location: PortalLocationSummary;
  inventory: {
    assigned: LocationInventoryAssignment[];
    available: LocationInventoryCandidate[];
  };
  menu: {
    assigned: LocationMenuAssignment[];
    available: LocationMenuCandidate[];
  };
};

export type LocationAssignmentMutation = {
  assignInventory?: string[];
  removeInventory?: string[];
  assignMenuItems?: string[];
  removeMenuItems?: string[];
};

const mapModulesFallback = (): PortalModuleState[] =>
  registrationModuleDefaults.map((mod) => ({
    moduleId: mod.key,
    enabled: mod.enabled,
    source: "default",
    updatedAt: new Date().toISOString()
  }));

const mapFeatureFlags = (rows: DbRow[]): PortalFeatureFlagState[] =>
  rows.map((row) => ({
    moduleId: String(row.module_id),
    featureKey: String(row.feature_key),
    enabled: Boolean(row.enabled),
    overridden: Boolean(row.overridden),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : undefined
  }));

const mapModules = (rows: DbRow[]): PortalModuleState[] => {
  if (!rows.length) {
    return mapModulesFallback();
  }
  return rows.map((row) => ({
    moduleId: String(row.module_id),
    enabled: Boolean(row.enabled),
    source: String(row.source ?? "plan"),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : undefined
  }));
};

const buildTenantSummary = (
  row: DbRow | null | undefined,
  tenantId: string,
  extras?: { locationCount?: number | null }
): PortalTenantSummary => {
  const base: PortalTenantSummary = row
    ? {
        id: String(row.id),
        name: toStringOrDefault(row.name, "Tenant"),
        alias: toOptionalString(row.alias) ?? null,
        status: toStringOrDefault(row.status, "active"),
        planName: toStringOrDefault(row.plan_name, "Core"),
        planId: toOptionalString(row.plan_id) ?? null,
        subscriptionStatus: toOptionalString(row.subscription_status) ?? null,
        nextPayout: null,
        nextPayoutAt: null,
        locationCount: extras?.locationCount ?? null
      }
    : {
        id: tenantId,
        name: "Tenant",
        alias: null,
        status: "unknown",
        planName: "Core",
        planId: null,
        subscriptionStatus: null,
        nextPayout: null,
        nextPayoutAt: null,
        locationCount: extras?.locationCount ?? null
      };

  if (row?.current_period_end) {
    const raw = row.current_period_end;
    const date =
      raw instanceof Date
        ? raw
        : new Date(typeof raw === "string" || typeof raw === "number" ? raw : String(raw));
    if (!Number.isNaN(date.getTime())) {
      const iso = date.toISOString();
      base.nextPayoutAt = iso;
      base.nextPayout = formatFriendlyDate(iso);
    }
  }

  return base;
};

export const getPortalContext = async (
  tenantId: string,
  logger: FastifyBaseLogger,
  options: { userId: string | null; permissions: string[]; roles: string[] }
): Promise<PortalContextPayload> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const [tenantResult, modulesResult, featureFlagsResult, locationCountResult, locationAccessResult] =
      await Promise.all([
        client.query(tenantContextSql, [tenantId]),
        client.query(tenantModulesSql, [tenantId]),
        client.query(tenantFeatureFlagsSql, [tenantId]),
        client.query(tenantLocationCountSql, [tenantId, ZERO_LOCATION_ID]),
        options.userId
          ? client.query(userLocationAccessSql, [tenantId, options.userId])
          : Promise.resolve<{ rows: DbRow[]; rowCount: number }>({ rows: [], rowCount: 0 })
      ]);

    const locationCountRaw = Number(locationCountResult.rows[0]?.location_count ?? 0);
    const locationCount =
      Number.isFinite(locationCountRaw) && locationCountRaw > 0 ? locationCountRaw : null;

    return {
      tenant: buildTenantSummary(tenantResult.rows[0], tenantId, { locationCount }),
      modules: mapModules(modulesResult.rows),
      featureFlags: mapFeatureFlags(featureFlagsResult.rows),
      permissions: options.permissions,
      roles: options.roles,
      locationAccess: buildLocationAccessPayload(locationAccessResult.rows)
    };
  } catch (error) {
    return fallbackWithLog(
      logger,
      "portal.context.fallback",
      () => ({
        tenant: buildTenantSummary(null, tenantId, { locationCount: null }),
        modules: mapModulesFallback(),
        featureFlags: [],
        permissions: options.permissions,
        roles: options.roles,
        locationAccess: emptyLocationAccess
      }),
      error
    );
  } finally {
    client?.release();
  }
};

export const getTenantLocations = async (
  tenantId: string,
  logger: FastifyBaseLogger
): Promise<PortalLocationSummary[]> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const rows = (await client.query(tenantLocationsSql, [tenantId, ZERO_LOCATION_ID])).rows;
    if (!rows.length) {
      return [
        {
          id: ZERO_LOCATION_ID,
          name: "Primary Location",
          code: "primary",
          timezone: "UTC",
          status: "active",
          totalInventoryItems: 0,
          totalMenuItems: 0,
          isPrimary: true,
          managed: false
        }
      ];
    }
    return rows.map(toLocationSummary);
  } catch (error) {
    return fallbackWithLog(logger, "portal.locations.fallback", () => [
      {
        id: ZERO_LOCATION_ID,
        name: "Primary Location",
        code: "primary",
        timezone: "UTC",
        status: "active",
        totalInventoryItems: 0,
        totalMenuItems: 0,
        isPrimary: true,
        managed: false
      }
    ], error);
  } finally {
    client?.release();
  }
};

type CreateTenantLocationInput = {
  name: string;
  code: string;
  timezone?: string;
};

type UpdateTenantLocationInput = {
  name?: string;
  timezone?: string;
  status?: string;
};

export const createTenantLocation = async (
  tenantId: string,
  logger: FastifyBaseLogger,
  input: CreateTenantLocationInput
): Promise<PortalLocationSummary> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const row = (
      await client.query(insertTenantLocationSql, [
        tenantId,
        input.name.trim(),
        normalizeLocationCode(input.code),
        input.timezone ?? "UTC",
        "active"
      ])
    ).rows[0];
    return {
      id: String(row.id),
      name: toStringOrDefault(row.name, "Location"),
      code: toStringOrDefault(row.code, "location"),
      timezone: toStringOrDefault(row.timezone, "UTC"),
      status: toStringOrDefault(row.status, "active"),
      totalInventoryItems: 0,
      totalMenuItems: 0,
      isPrimary: false,
      managed: true
    };
  } finally {
    client?.release();
  }
};

export const updateTenantLocation = async (
  tenantId: string,
  locationId: string,
  logger: FastifyBaseLogger,
  input: UpdateTenantLocationInput
): Promise<PortalLocationSummary | null> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const row = (
      await client.query(updateTenantLocationSql, [
        tenantId,
        locationId,
        input.name?.trim(),
        input.timezone,
        input.status
      ])
    ).rows[0];
    if (!row) return null;
    // fetch latest stats for that location
    const stats = await client.query(
      `
        SELECT
          COALESCE(inv.total_inventory_items, 0) AS total_inventory_items,
          COALESCE(menu.total_menu_items, 0) AS total_menu_items
        FROM (SELECT COUNT(DISTINCT item_id) AS total_inventory_items
              FROM inventory_stock_levels
              WHERE tenant_id = $1 AND COALESCE(location_id, $3::uuid) = $2) inv,
             (SELECT COUNT(DISTINCT menu_item_id) AS total_menu_items
              FROM menu_item_prices
              WHERE tenant_id = $1 AND COALESCE(location_id, $3::uuid) = $2) menu
      `,
      [tenantId, row.id, ZERO_LOCATION_ID]
    );
    const statRow = stats.rows[0] ?? { total_inventory_items: 0, total_menu_items: 0 };
    return {
      id: String(row.id),
      name: toStringOrDefault(row.name, "Location"),
      code: toStringOrDefault(row.code, "location"),
      timezone: toStringOrDefault(row.timezone, "UTC"),
      status: toStringOrDefault(row.status, "active"),
      totalInventoryItems: Number(statRow.total_inventory_items ?? 0),
      totalMenuItems: Number(statRow.total_menu_items ?? 0),
      isPrimary: false,
      managed: true
    };
  } finally {
    client?.release();
  }
};

const loadManagedLocation = async (
  client: PoolClient,
  tenantId: string,
  locationId: string
): Promise<PortalLocationSummary> => {
  const row = (
    await client.query(singleTenantLocationSql, [tenantId, locationId]).catch((error: unknown) => {
      throw error;
    })
  ).rows[0];
  if (!row) {
    throw Errors.notFound("Location not found");
  }
  return {
    id: String(row.id),
    name: toStringOrDefault(row.name, "Location"),
    code: toStringOrDefault(row.code, "location"),
    timezone: toStringOrDefault(row.timezone, "UTC"),
    status: toStringOrDefault(row.status, "active"),
    totalInventoryItems: Number(row.total_inventory_items ?? 0),
    totalMenuItems: Number(row.total_menu_items ?? 0),
    isPrimary: false,
    managed: true
  };
};

const formatInventoryAssignment = (row: DbRow): LocationInventoryAssignment => ({
  itemId: String(row.item_id),
  name: toStringOrDefault(row.name, "Inventory Item"),
  sku: toOptionalString(row.sku) ?? null,
  unit: toStringOrDefault(row.unit, "unit"),
  quantity: toNumberOrDefault(row.quantity),
  reserved: toNumberOrDefault(row.reserved),
  onOrder: toNumberOrDefault(row.on_order)
});

const formatInventoryCandidate = (row: DbRow): LocationInventoryCandidate => ({
  itemId: String(row.item_id),
  name: toStringOrDefault(row.name, "Inventory Item"),
  sku: toOptionalString(row.sku) ?? null,
  unit: toStringOrDefault(row.unit, "unit"),
  baselineQuantity: toNumberOrDefault(row.baseline_quantity)
});

const formatMenuAssignment = (row: DbRow): LocationMenuAssignment => ({
  menuItemId: String(row.menu_item_id),
  name: toStringOrDefault(row.name, "Menu Item"),
  category: toOptionalString(row.category) ?? null,
  price: toNumberOrDefault(row.price),
  currency: toStringOrDefault(row.currency, "USD")
});

const formatMenuCandidate = (row: DbRow): LocationMenuCandidate => ({
  menuItemId: String(row.menu_item_id),
  name: toStringOrDefault(row.name, "Menu Item"),
  category: toOptionalString(row.category) ?? null,
  defaultPrice: toNumberOrDefault(row.default_price),
  currency: toStringOrDefault(row.currency, "USD")
});

export const getLocationAssignmentSummary = async (
  tenantId: string,
  locationId: string,
  _logger: FastifyBaseLogger
): Promise<LocationAssignmentSummary> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const location = await loadManagedLocation(client, tenantId, locationId);
    const [inventoryAssignedResult, inventoryAvailableResult, menuAssignedResult, menuAvailableResult] = await Promise.all([
      client.query(locationInventoryAssignedSql, [tenantId, locationId]),
      client.query(locationInventoryAvailableSql, [tenantId, locationId, ZERO_LOCATION_ID]),
      client.query(locationMenuAssignedSql, [tenantId, locationId]),
      client.query(locationMenuAvailableSql, [tenantId, locationId, ZERO_LOCATION_ID])
    ]);
    return {
      location,
      inventory: {
        assigned: inventoryAssignedResult.rows.map(formatInventoryAssignment),
        available: inventoryAvailableResult.rows.map(formatInventoryCandidate)
      },
      menu: {
        assigned: menuAssignedResult.rows.map(formatMenuAssignment),
        available: menuAvailableResult.rows.map(formatMenuCandidate)
      }
    };
  } finally {
    client?.release();
  }
};

const uniqueIds = (values?: Array<string | undefined | null>) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => toOptionalString(value))
        .filter((value): value is string => Boolean(value))
    )
  );

export const mutateLocationAssignments = async (
  tenantId: string,
  locationId: string,
  _logger: FastifyBaseLogger,
  input: LocationAssignmentMutation
): Promise<void> => {
  if (locationId === ZERO_LOCATION_ID) {
    throw Errors.validation("Primary location assignments cannot be modified");
  }
  const assignInventory = uniqueIds(input.assignInventory);
  const removeInventory = uniqueIds(input.removeInventory);
  const assignMenu = uniqueIds(input.assignMenuItems);
  const removeMenu = uniqueIds(input.removeMenuItems);
  if (
    assignInventory.length === 0 &&
    removeInventory.length === 0 &&
    assignMenu.length === 0 &&
    removeMenu.length === 0
  ) {
    return;
  }

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const locationCheck = await client.query(
      "SELECT 1 FROM tenant_locations WHERE tenant_id = $1 AND id = $2",
      [tenantId, locationId]
    );
    if ((locationCheck.rowCount ?? 0) === 0) {
      throw Errors.notFound("Location not found");
    }

    if (assignInventory.length) {
      await client.query(assignInventoryToLocationSql, [tenantId, locationId, assignInventory, ZERO_LOCATION_ID]);
    }
    if (removeInventory.length) {
      await client.query(removeInventoryFromLocationSql, [tenantId, locationId, removeInventory]);
    }
    if (assignMenu.length) {
      await client.query(assignMenuToLocationSql, [tenantId, locationId, assignMenu, ZERO_LOCATION_ID]);
    }
    if (removeMenu.length) {
      await client.query(removeMenuFromLocationSql, [tenantId, locationId, removeMenu]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
  }
};
