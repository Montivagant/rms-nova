import { createHash } from "node:crypto";
import dotenv from "dotenv";
import { Pool, type PoolClient } from "pg";

dotenv.config({ path: process.env.ENV_FILE || undefined });

type MenuCategorySeed = {
  key: string;
  name: string;
  position: number;
};

type MenuItemSeed = {
  key: string;
  name: string;
  description: string;
  categoryKey: string;
  price: number;
  currency?: string;
  taxRate: number;
  recipe: Array<{
    inventoryItemKey: string;
    quantity: number;
    unit: string;
  }>;
};

type InventoryItemSeed = {
  key: string;
  name: string;
  sku: string;
  unit: string;
  reorderPoint: number;
  reorderQuantity: number;
  costPerUnit: number;
  openingQuantity: number;
};

type TicketSeed = {
  key: string;
  taxRate: number;
  tipAmount: number;
  method: string;
  reference?: string;
  processor?: string;
  processorPaymentId?: string;
  methodType?: string;
  methodBrand?: string;
  methodLast4?: string;
  receiptUrl?: string;
  metadata?: Record<string, unknown>;
  notes?: string;
  items: Array<{
    menuItemKey: string;
    quantity: number;
  }>;
};

type LoyaltyTransactionSeed = {
  key: string;
  type: "earn" | "redeem";
  points: number;
  reference?: string;
  source?: string;
};

type LoyaltySeed = {
  key: string;
  externalCustomerId: string;
  transactions: LoyaltyTransactionSeed[];
};

const menuCategories: MenuCategorySeed[] = [
  { key: "coffee-bar", name: "Coffee Bar", position: 1 },
  { key: "kitchen-favorites", name: "Kitchen Favorites", position: 2 }
];

const inventoryItems: InventoryItemSeed[] = [
  {
    key: "coffee-beans",
    name: "House Coffee Beans",
    sku: "CB-001",
    unit: "lb",
    reorderPoint: 5,
    reorderQuantity: 20,
    costPerUnit: 8.5,
    openingQuantity: 25
  },
  {
    key: "oat-milk",
    name: "Barista Oat Milk",
    sku: "OM-001",
    unit: "liter",
    reorderPoint: 10,
    reorderQuantity: 36,
    costPerUnit: 2.1,
    openingQuantity: 32
  },
  {
    key: "farm-eggs",
    name: "Free-Range Eggs",
    sku: "EG-001",
    unit: "dozen",
    reorderPoint: 6,
    reorderQuantity: 18,
    costPerUnit: 4.25,
    openingQuantity: 18
  },
  {
    key: "avocado",
    name: "Hass Avocado",
    sku: "AV-001",
    unit: "each",
    reorderPoint: 12,
    reorderQuantity: 48,
    costPerUnit: 1.1,
    openingQuantity: 36
  }
];

const menuItems: MenuItemSeed[] = [
  {
    key: "cold-brew",
    name: "Cold Brew",
    description: "18-hour steeped blend over ice.",
    categoryKey: "coffee-bar",
    price: 4.75,
    currency: "USD",
    taxRate: 0.0825,
    recipe: [
      { inventoryItemKey: "coffee-beans", quantity: 0.05, unit: "lb" }
    ]
  },
  {
    key: "classic-latte",
    name: "Classic Latte",
    description: "Double espresso with steamed oat milk.",
    categoryKey: "coffee-bar",
    price: 5.25,
    currency: "USD",
    taxRate: 0.0825,
    recipe: [
      { inventoryItemKey: "coffee-beans", quantity: 0.03, unit: "lb" },
      { inventoryItemKey: "oat-milk", quantity: 0.25, unit: "liter" }
    ]
  },
  {
    key: "breakfast-burrito",
    name: "Breakfast Burrito",
    description: "Scrambled eggs, cheddar, poblano relish.",
    categoryKey: "kitchen-favorites",
    price: 9.5,
    currency: "USD",
    taxRate: 0.0825,
    recipe: [
      { inventoryItemKey: "farm-eggs", quantity: 0.33, unit: "dozen" }
    ]
  },
  {
    key: "avocado-toast",
    name: "Avocado Toast",
    description: "Grilled sourdough, smashed avocado, chili crunch.",
    categoryKey: "kitchen-favorites",
    price: 8.25,
    currency: "USD",
    taxRate: 0.0825,
    recipe: [
      { inventoryItemKey: "avocado", quantity: 2, unit: "each" }
    ]
  }
];

const ticketSeed: TicketSeed = {
  key: "sunrise-sale",
  taxRate: 0.0825,
  tipAmount: 2.5,
  method: "card",
  methodType: "card",
  methodBrand: "Visa",
  methodLast4: "4242",
  processor: "stripe",
  processorPaymentId: "pi_seed_demo",
  reference: "sample-pos-ticket",
  receiptUrl: "https://example.org/receipts/seed-ticket",
  metadata: { source: "seed" },
  notes: "Baseline sale used to validate POS reports.",
  items: [
    { menuItemKey: "cold-brew", quantity: 2 },
    { menuItemKey: "breakfast-burrito", quantity: 1 }
  ]
};

const loyaltySeeds: LoyaltySeed[] = [
  {
    key: "avery",
    externalCustomerId: "avery@example.com",
    transactions: [
      {
        key: "avery-initial",
        type: "earn",
        points: 320,
        reference: ticketSeed.reference,
        source: "seed"
      }
    ]
  }
];

const ZERO_LOCATION = "00000000-0000-0000-0000-000000000000";
const args = process.argv.slice(2);

const getFlagValue = (flag: string) => {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return undefined;
  }
  return args[index + 1];
};

const hasFlag = (flag: string) => args.includes(flag);

const databaseUrl = process.env.DATABASE_URL ?? getFlagValue("--database-url");

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (set in env or pass --database-url).");
}

const tenantIdInput = getFlagValue("--tenant-id") ?? process.env.SEED_TENANT_ID;
const tenantAliasInput = getFlagValue("--tenant-alias") ?? process.env.SEED_TENANT_ALIAS;

if (!tenantIdInput && !tenantAliasInput) {
  throw new Error("Provide --tenant-id or --tenant-alias (or set SEED_TENANT_ID/SEED_TENANT_ALIAS).");
}

let locationId =
  getFlagValue("--location-id") ?? process.env.SEED_LOCATION_ID ?? ZERO_LOCATION;
const explicitUserId = getFlagValue("--user-id") ?? process.env.SEED_SAMPLE_USER_ID ?? null;
const dryRun = hasFlag("--dry-run");

const pool = new Pool({ connectionString: databaseUrl });

const deterministicId = (tenantId: string, scope: string) => {
  const hash = createHash("sha1").update(`${tenantId}:${scope}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

const DEFAULT_LOCATION = {
  name: "Downtown",
  code: "downtown",
  timezone: "America/Los_Angeles"
};

const ensureManagedLocation = async (client: PoolClient, tenantId: string): Promise<string> => {
  const deterministicLocationId = deterministicId(tenantId, "location:downtown");
  await client.query(
    `
      INSERT INTO tenant_locations (id, tenant_id, name, code, timezone, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        timezone = EXCLUDED.timezone,
        status = EXCLUDED.status,
        updated_at = NOW()
    `,
    [
      deterministicLocationId,
      tenantId,
      DEFAULT_LOCATION.name,
      DEFAULT_LOCATION.code,
      DEFAULT_LOCATION.timezone
    ]
  );
  return deterministicLocationId;
};

const assertTenantLocationExists = async (
  client: PoolClient,
  tenantId: string,
  candidateLocationId: string
) => {
  const exists = await client.query(
    "SELECT 1 FROM tenant_locations WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, candidateLocationId]
  );
  if (exists.rowCount === 0) {
    throw new Error(
      `Location ${candidateLocationId} was not found for tenant ${tenantId}. Create it first or omit --location-id to seed the default location.`
    );
  }
};

type TenantRecord = {
  id: string;
  name: string;
  alias: string;
};

const resolveTenant = async (client: PoolClient): Promise<TenantRecord> => {
  if (tenantIdInput) {
    const byId = await client.query<TenantRecord>("SELECT id, name, alias FROM tenants WHERE id = $1", [tenantIdInput]);
    if (byId.rowCount === 0) {
      throw new Error(`No tenant found with id ${tenantIdInput}`);
    }
    return byId.rows[0];
  }
  const byAlias = await client.query<TenantRecord>("SELECT id, name, alias FROM tenants WHERE alias = $1", [tenantAliasInput]);
  if (byAlias.rowCount === 0) {
    throw new Error(`No tenant found with alias ${tenantAliasInput}`);
  }
  return byAlias.rows[0];
};

const resolveUserId = async (client: PoolClient, tenantId: string): Promise<string | null> => {
  if (explicitUserId) {
    const hasUser = await client.query("SELECT id FROM users WHERE id = $1 AND tenant_id = $2", [explicitUserId, tenantId]);
    if (hasUser.rowCount === 0) {
      throw new Error(`No user ${explicitUserId} belongs to tenant ${tenantId}`);
    }
    return explicitUserId;
  }
  const firstUser = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1",
    [tenantId]
  );
  return firstUser.rows[0]?.id ?? null;
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const seedMenu = async (client: PoolClient, tenantId: string) => {
  const categoryMap = new Map<string, string>();
  for (const category of menuCategories) {
    const id = deterministicId(tenantId, `menu-category:${category.key}`);
    categoryMap.set(category.key, id);
    await client.query(
      `
        INSERT INTO menu_categories (id, tenant_id, name, position)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, position = EXCLUDED.position
      `,
      [id, tenantId, category.name, category.position]
    );
  }

  const menuItemMap = new Map<string, string>();
  const menuPriceMap = new Map<string, number>();
  const menuItemNames = new Map<string, string>();

  for (const item of menuItems) {
    const id = deterministicId(tenantId, `menu-item:${item.key}`);
    menuItemMap.set(item.key, id);
    menuPriceMap.set(item.key, item.price);
    menuItemNames.set(item.key, item.name);

    await client.query(
      `
        INSERT INTO menu_items (id, tenant_id, category_id, name, description, is_active, tax_rate, updated_at)
        VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW())
        ON CONFLICT (id) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            tax_rate = EXCLUDED.tax_rate,
            updated_at = NOW()
      `,
      [id, tenantId, categoryMap.get(item.categoryKey), item.name, item.description, item.taxRate]
    );

    await client.query(
      `
        INSERT INTO menu_item_prices (tenant_id, menu_item_id, location_id, price, currency)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, menu_item_id, location_id)
        DO UPDATE SET price = EXCLUDED.price, currency = EXCLUDED.currency
      `,
      [tenantId, id, locationId, item.price, item.currency ?? "USD"]
    );

    const recipePayload = {
      components: item.recipe.map((component) => ({
        inventoryItemKey: component.inventoryItemKey,
        inventoryItemId: deterministicId(tenantId, `inventory-item:${component.inventoryItemKey}`),
        quantity: component.quantity,
        unit: component.unit
      })),
      yield: 1
    };

    await client.query(
      `
        INSERT INTO menu_recipes (menu_item_id, tenant_id, ingredient_map, last_costed_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (menu_item_id)
        DO UPDATE SET ingredient_map = EXCLUDED.ingredient_map, last_costed_at = NOW()
      `,
      [id, tenantId, JSON.stringify(recipePayload)]
    );
  }

  return { menuItemMap, menuPriceMap, menuItemNames };
};

const seedInventory = async (client: PoolClient, tenantId: string) => {
  const inventoryMap = new Map<string, string>();

  for (const item of inventoryItems) {
    const id = deterministicId(tenantId, `inventory-item:${item.key}`);
    inventoryMap.set(item.key, id);

    await client.query(
      `
        INSERT INTO inventory_items (id, tenant_id, name, sku, unit, reorder_point, reorder_quantity, cost_per_unit, active, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, NOW())
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            sku = EXCLUDED.sku,
            unit = EXCLUDED.unit,
            reorder_point = EXCLUDED.reorder_point,
            reorder_quantity = EXCLUDED.reorder_quantity,
            cost_per_unit = EXCLUDED.cost_per_unit,
            updated_at = NOW()
      `,
      [
        id,
        tenantId,
        item.name,
        item.sku,
        item.unit,
        item.reorderPoint,
        item.reorderQuantity,
        item.costPerUnit
      ]
    );

    await client.query(
      `
        INSERT INTO inventory_stock_levels (tenant_id, item_id, location_id, quantity, reserved, on_order)
        VALUES ($1, $2, $3, $4, 0, 0)
        ON CONFLICT (tenant_id, item_id, location_id)
        DO UPDATE SET quantity = EXCLUDED.quantity
      `,
      [tenantId, id, locationId, item.openingQuantity]
    );

    const movementId = deterministicId(tenantId, `inventory-movement:${item.key}`);
    await client.query(
      `
        INSERT INTO inventory_movements (
          id,
          tenant_id,
          item_id,
          quantity,
          reason,
          previous_quantity,
          new_quantity,
          reference,
          notes,
          created_at,
          location_id,
          source,
          attachment_url,
          count_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'opening_stock',
          0,
          $5,
          'sample-kit-v1',
          'Baseline sample data seeding.',
          NOW(),
          $6,
          'seed',
          NULL,
          NULL
        )
        ON CONFLICT (id)
        DO UPDATE SET quantity = EXCLUDED.quantity,
                      reason = EXCLUDED.reason,
                      previous_quantity = EXCLUDED.previous_quantity,
                      new_quantity = EXCLUDED.new_quantity,
                      notes = EXCLUDED.notes,
                      location_id = EXCLUDED.location_id,
                      source = EXCLUDED.source
      `,
      [
        movementId,
        tenantId,
        id,
        item.openingQuantity,
        item.openingQuantity,
        locationId === ZERO_LOCATION ? null : locationId
      ]
    );
  }

  return inventoryMap;
};

const seedSampleTicket = async (
  client: PoolClient,
  tenantId: string,
  menuPriceMap: Map<string, number>,
  menuItemMap: Map<string, string>,
  menuItemNames: Map<string, string>,
  userId: string | null,
  saleLocationId: string
) => {
  const ticketId = deterministicId(tenantId, `ticket:${ticketSeed.key}`);
  const openedAt = new Date(Date.now() - 5 * 60 * 1000);
  const closedAt = new Date();

  let subtotal = 0;
  for (const line of ticketSeed.items) {
    const price = menuPriceMap.get(line.menuItemKey);
    if (typeof price !== "number") {
      throw new Error(`Missing price for menu item ${line.menuItemKey}`);
    }
    subtotal += price * line.quantity;
  }
  subtotal = roundCurrency(subtotal);
  const taxAmount = roundCurrency(subtotal * ticketSeed.taxRate);
  const total = roundCurrency(subtotal + taxAmount);

  await client.query(
    `
      INSERT INTO pos_tickets (id, tenant_id, status, subtotal, tax_amount, total, notes, opened_by, closed_by, opened_at, closed_at, location_id)
      VALUES ($1, $2, 'settled', $3, $4, $5, $6, $7, $7, $8, $9, $10)
      ON CONFLICT (id)
      DO UPDATE SET subtotal = EXCLUDED.subtotal,
                    tax_amount = EXCLUDED.tax_amount,
                    total = EXCLUDED.total,
                    notes = EXCLUDED.notes,
                    opened_by = EXCLUDED.opened_by,
                    closed_by = EXCLUDED.closed_by,
                    opened_at = EXCLUDED.opened_at,
                    closed_at = EXCLUDED.closed_at,
                    location_id = EXCLUDED.location_id
    `,
    [
      ticketId,
      tenantId,
      subtotal,
      taxAmount,
      total,
      ticketSeed.notes ?? null,
      userId,
      openedAt,
      closedAt,
      saleLocationId
    ]
  );

  for (const line of ticketSeed.items) {
    const price = menuPriceMap.get(line.menuItemKey) ?? 0;
    const menuItemId = menuItemMap.get(line.menuItemKey);
    if (!menuItemId) {
      throw new Error(`Missing menu item id for key ${line.menuItemKey}`);
    }
    const menuItemName = menuItemNames.get(line.menuItemKey) ?? line.menuItemKey;
    const lineId = deterministicId(tenantId, `ticket-item:${ticketSeed.key}:${line.menuItemKey}`);
    const totalPrice = roundCurrency(price * line.quantity);
    await client.query(
      `
        INSERT INTO pos_ticket_items (id, tenant_id, ticket_id, menu_item_id, name, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id)
        DO UPDATE SET quantity = EXCLUDED.quantity,
                      unit_price = EXCLUDED.unit_price,
                      total_price = EXCLUDED.total_price
      `,
      [lineId, tenantId, ticketId, menuItemId, menuItemName, line.quantity, price, totalPrice]
    );
  }

  const paymentId = deterministicId(tenantId, `ticket-payment:${ticketSeed.key}`);
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
        'completed',
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
        NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET amount = EXCLUDED.amount,
                    tip_amount = EXCLUDED.tip_amount,
                    method = EXCLUDED.method,
                    processed_by = EXCLUDED.processed_by,
                    reference = EXCLUDED.reference,
                    location_id = EXCLUDED.location_id,
                    processor = EXCLUDED.processor,
                    processor_payment_id = EXCLUDED.processor_payment_id,
                    method_type = EXCLUDED.method_type,
                    method_brand = EXCLUDED.method_brand,
                    method_last4 = EXCLUDED.method_last4,
                    receipt_url = EXCLUDED.receipt_url,
                    metadata = EXCLUDED.metadata,
                    captured_at = EXCLUDED.captured_at
    `,
    [
      paymentId,
      tenantId,
      ticketId,
      total,
      ticketSeed.tipAmount,
      ticketSeed.method,
      userId,
      ticketSeed.reference ?? null,
      saleLocationId,
      ticketSeed.processor ?? "offline",
      ticketSeed.processorPaymentId ?? null,
      ticketSeed.methodType ?? ticketSeed.method,
      ticketSeed.methodBrand ?? null,
      ticketSeed.methodLast4 ?? null,
      ticketSeed.receiptUrl ?? null,
      ticketSeed.metadata ?? { source: "seed" }
    ]
  );
};

const seedLoyalty = async (client: PoolClient, tenantId: string) => {
  if (!loyaltySeeds.length) return;
  await client.query("INSERT INTO loyalty_rules (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING", [
    tenantId
  ]);
  for (const seed of loyaltySeeds) {
    const accountId = deterministicId(tenantId, `loyalty-account:${seed.key}`);
    const deltas = seed.transactions.map((txn) =>
      txn.type === "redeem" ? -Math.abs(txn.points) : Math.abs(txn.points)
    );
    const finalBalance = deltas.reduce((sum, delta) => sum + delta, 0);
    await client.query(
      `
        INSERT INTO loyalty_accounts (id, tenant_id, external_customer_id, balance, pending_balance, status)
        VALUES ($1, $2, $3, $4, 0, 'active')
        ON CONFLICT (id)
        DO UPDATE SET
          external_customer_id = EXCLUDED.external_customer_id,
          balance = EXCLUDED.balance,
          pending_balance = EXCLUDED.pending_balance,
          status = EXCLUDED.status,
          updated_at = NOW()
      `,
      [accountId, tenantId, seed.externalCustomerId, finalBalance]
    );
    let runningBalance = 0;
    for (const txn of seed.transactions) {
      const delta = txn.type === "redeem" ? -Math.abs(txn.points) : Math.abs(txn.points);
      runningBalance += delta;
      const transactionId = deterministicId(
        tenantId,
        `loyalty-transaction:${seed.key}:${txn.key}`
      );
      await client.query(
        `
          INSERT INTO loyalty_transactions (
            id,
            tenant_id,
            account_id,
            type,
            points,
            balance_after,
            reference,
            source,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
          ON CONFLICT (id)
          DO UPDATE SET
            type = EXCLUDED.type,
            points = EXCLUDED.points,
            balance_after = EXCLUDED.balance_after,
            reference = EXCLUDED.reference,
            source = EXCLUDED.source,
            metadata = EXCLUDED.metadata,
            created_at = EXCLUDED.created_at
        `,
        [
          transactionId,
          tenantId,
          accountId,
          txn.type,
          delta,
          runningBalance,
          txn.reference ?? null,
          txn.source ?? null,
          JSON.stringify({ seed: true })
        ]
      );
    }
  }
};

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tenant = await resolveTenant(client);
    const userId = await resolveUserId(client, tenant.id);
    if (locationId === ZERO_LOCATION) {
      locationId = await ensureManagedLocation(client, tenant.id);
    } else {
      await assertTenantLocationExists(client, tenant.id, locationId);
    }

    const inventoryMap = await seedInventory(client, tenant.id);
    const { menuItemMap, menuPriceMap, menuItemNames } = await seedMenu(client, tenant.id);

    // Ensure recipes reference the resolved inventory ids.
    for (const item of menuItems) {
      for (const component of item.recipe) {
        const inventoryId = inventoryMap.get(component.inventoryItemKey);
        if (!inventoryId) {
          throw new Error(`Missing inventory item for recipe component ${component.inventoryItemKey}`);
        }
      }
    }

    await seedSampleTicket(
      client,
      tenant.id,
      menuPriceMap,
      menuItemMap,
      menuItemNames,
      userId,
      locationId
    );
    await seedLoyalty(client, tenant.id);

    if (dryRun) {
      await client.query("ROLLBACK");
      console.log("Dry run enabled - database changes were rolled back.");
    } else {
      await client.query("COMMIT");
      console.log(
        `Seeded sample data for tenant ${tenant.name} (${tenant.id}) at location ${locationId}.`
      );
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
