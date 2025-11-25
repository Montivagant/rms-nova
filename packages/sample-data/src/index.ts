export type Trend = "up" | "down";

export interface DashboardMetric {
  label: string;
  value: string;
  delta?: string;
  helper?: string;
  trend?: Trend;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: string;
  taxRate: string;
  status: "Available" | "86d";
  isActive: boolean;
  soldToday: number;
  grossToday: string;
  recipeLinked: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  parLevel: number;
  costPerUnit: string;
}

export interface InventoryAuditEntry {
  id: string;
  itemId: string;
  itemName: string;
  locationId: string;
  locationName: string;
  delta: number;
  unit: string;
  reason: string;
  user: string;
  notes?: string;
  status: "applied" | "pending";
  createdAtIso: string;
  source: string;
  countId?: string | null;
  attachmentUrl?: string | null;
}

export interface MenuModifier {
  id: string;
  name: string;
  priceDelta: number;
  maxSelect?: number | null;
}

export interface TicketItem {
  name: string;
  quantity: number;
}

export interface Ticket {
  id: string;
  channel: "POS" | "Kiosk" | "Online";
  total: string;
  status: "Paid" | "Refunded" | "Open";
  processedAt: string;
  items: TicketItem[];
}

export interface TenantSummary {
  name: string;
  plan: string;
  locationCount: number;
  nextPayout: string;
  timezone: string;
}

export interface DashboardSnapshot {
  metrics: DashboardMetric[];
  topMenuItems: MenuItem[];
  inventoryAlerts: InventoryItem[];
  recentTickets: Ticket[];
}

export interface PaymentRecord {
  id: string;
  ticketId: string;
  method: string;
  methodType?: string;
  methodBrand?: string;
  methodLast4?: string;
  status: "Completed" | "Pending" | "Failed" | "Refunded";
  amount: string;
  amountValue?: number;
  tipAmount: string;
  tipAmountValue?: number;
  totalAmountValue?: number;
  processedAt: string;
  processedAtIso?: string;
  processor?: string;
  processorPaymentId?: string;
  receiptUrl?: string;
  capturedAtIso?: string;
  failureReason?: string;
  refundedAmount?: string;
  refundedAmountValue?: number;
  remainingAmountValue?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentsSnapshot {
  summary: {
    totalToday: string;
    totalWeek: string;
    rangeTotal: string;
    methods: Array<{ method: string; amount: string }>;
  };
  payments: PaymentRecord[];
}

export interface ReportingSnapshotData {
  revenueSeries: Array<{ date: string; total: string }>;
  ticketSeries: Array<{ date: string; count: number }>;
  topCategories: Array<{ category: string; revenue: string }>;
  categoryOptions?: string[];
}

export interface ReportingSnapshot extends ReportingSnapshotData {
  locations?: Record<string, ReportingSnapshotData>;
}

const tenant: TenantSummary = {
  name: "Demo Coffee Collective",
  plan: "Pro",
  locationCount: 3,
  nextPayout: "Nov 09",
  timezone: "America/Los_Angeles"
};

const today = new Date();
const buildIsoTime = (hours: number, minutes: number) => {
  const date = new Date(today);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

const menuItems: MenuItem[] = [
  {
    id: "menu-nitro",
    name: "Nitro Cold Brew",
    category: "Coffee Bar",
    price: "$6.50",
    taxRate: "8.5%",
    status: "Available",
    isActive: true,
    soldToday: 86,
    grossToday: "$559",
    recipeLinked: true
  },
  {
    id: "menu-flatwhite",
    name: "Oat Milk Flat White",
    category: "Coffee Bar",
    price: "$5.75",
    taxRate: "8.5%",
    status: "Available",
    isActive: true,
    soldToday: 64,
    grossToday: "$368",
    recipeLinked: true
  },
  {
    id: "menu-avotoast",
    name: "Avocado Toast",
    category: "Kitchen Favorites",
    price: "$9.50",
    taxRate: "8.5%",
    status: "Available",
    isActive: true,
    soldToday: 42,
    grossToday: "$399",
    recipeLinked: true
  },
  {
    id: "menu-breakfast",
    name: "Market Breakfast Sandwich",
    category: "Kitchen Favorites",
    price: "$10.00",
    taxRate: "8.5%",
    status: "Available",
    isActive: true,
    soldToday: 31,
    grossToday: "$310",
    recipeLinked: true
  }
];

const inventoryItems: InventoryItem[] = [
  {
    id: "inv-coffee",
    name: "Guatemalan Coffee Beans (5lb)",
    unit: "bag",
    onHand: 18,
    parLevel: 24,
    costPerUnit: "$48.00"
  },
  {
    id: "inv-oatmilk",
    name: "Oat Milk (case)",
    unit: "case",
    onHand: 6,
    parLevel: 8,
    costPerUnit: "$26.00"
  },
  {
    id: "inv-eggs",
    name: "Farm Eggs (15dz)",
    unit: "crate",
    onHand: 4,
    parLevel: 6,
    costPerUnit: "$42.00"
  },
  {
    id: "inv-avocado",
    name: "Hass Avocados",
    unit: "flat",
    onHand: 2,
    parLevel: 5,
    costPerUnit: "$38.00"
  }
];

const inventoryAuditEntries: InventoryAuditEntry[] = [
  {
    id: "audit-001",
    itemId: "inv-coffee",
    itemName: "Guatemalan Coffee Beans (5lb)",
    locationId: "loc-primary",
    locationName: "Downtown",
    delta: -2,
    unit: "bag",
    reason: "Cycle count variance",
    user: "Avery Jensen",
    notes: "Two bags discarded after QC.",
    status: "applied",
    createdAtIso: buildIsoTime(7, 45),
    source: "inventory_count",
    countId: "count-morning",
    attachmentUrl: null
  },
  {
    id: "audit-002",
    itemId: "inv-oatmilk",
    itemName: "Oat Milk (case)",
    locationId: "loc-primary",
    locationName: "Downtown",
    delta: -1,
    unit: "case",
    reason: "Spillage during prep",
    user: "Sara Patel",
    status: "applied",
    createdAtIso: buildIsoTime(9, 20),
    source: "manual_adjustment",
    countId: null,
    attachmentUrl: null
  },
  {
    id: "audit-003",
    itemId: "inv-eggs",
    itemName: "Farm Eggs (15dz)",
    locationId: "loc-roastery",
    locationName: "Roastery",
    delta: 2,
    unit: "crate",
    reason: "Supplier catch-up delivery",
    user: "Micah Wells",
    notes: "Documented on PO #4311.",
    status: "applied",
    createdAtIso: buildIsoTime(10, 55),
    source: "inventory_transfer",
    countId: null,
    attachmentUrl: null
  },
  {
    id: "audit-004",
    itemId: "inv-avocado",
    itemName: "Hass Avocados",
    locationId: "loc-primary",
    locationName: "Downtown",
    delta: -3,
    unit: "flat",
    reason: "Waste log entry",
    user: "Avery Jensen",
    notes: "Soft fruit removed from line.",
    status: "pending",
    createdAtIso: buildIsoTime(13, 5),
    source: "inventory_count",
    countId: "count-afternoon",
    attachmentUrl: null
  },
  {
    id: "audit-005",
    itemId: "inv-coffee",
    itemName: "Guatemalan Coffee Beans (5lb)",
    locationId: "loc-roastery",
    locationName: "Roastery",
    delta: 4,
    unit: "bag",
    reason: "Transfer received",
    user: "Micah Wells",
    status: "applied",
    createdAtIso: buildIsoTime(15, 40),
    source: "inventory_transfer",
    countId: null,
    attachmentUrl: null
  }
];

export const getInventoryAuditLog = (): InventoryAuditEntry[] => inventoryAuditEntries;

const menuModifiers: MenuModifier[] = [
  {
    id: "mod-extra-shot",
    name: "Extra Shot",
    priceDelta: 1.5,
    maxSelect: 2
  },
  {
    id: "mod-oat-milk",
    name: "Oat Milk",
    priceDelta: 0.75,
    maxSelect: null
  },
  {
    id: "mod-whipped-cream",
    name: "Whipped Cream",
    priceDelta: 0.5,
    maxSelect: 1
  }
];

const menuModifierAssignments: Record<string, string[]> = {
  "menu-nitro": ["mod-extra-shot", "mod-oat-milk"],
  "menu-flatwhite": ["mod-oat-milk"],
  "menu-avotoast": ["mod-whipped-cream"],
  "menu-breakfast": []
};

const tickets: Ticket[] = [
  {
    id: "#48221",
    channel: "POS",
    total: "$32.40",
    status: "Paid",
    processedAt: "09:42",
    items: [
      { name: "Nitro Cold Brew", quantity: 2 },
      { name: "Avocado Toast", quantity: 1 }
    ]
  },
  {
    id: "#48218",
    channel: "Online",
    total: "$18.75",
    status: "Paid",
    processedAt: "09:10",
    items: [
      { name: "Flat White", quantity: 1 },
      { name: "Market Breakfast Sandwich", quantity: 1 }
    ]
  },
  {
    id: "#48211",
    channel: "POS",
    total: "$9.50",
    status: "Refunded",
    processedAt: "08:32",
    items: [{ name: "Avocado Toast", quantity: 1 }]
  }
];

const dashboardSnapshot: DashboardSnapshot = {
  metrics: [
    {
      label: "Today's Revenue",
      value: "$2,940",
      delta: "+12% vs yesterday",
      trend: "up",
      helper: "Last payout $2,625"
    },
    {
      label: "Tickets",
      value: "148",
      delta: "+8% vs avg weekday",
      trend: "up",
      helper: "12 open tabs"
    },
    {
      label: "Avg. Ticket Size",
      value: "$19.87",
      delta: "-4% vs last week",
      trend: "down",
      helper: "Goal $20.50"
    },
    {
      label: "Inventory Spend (7d)",
      value: "$4,310",
      delta: "+5% vs plan",
      trend: "down",
      helper: "Next delivery tomorrow"
    }
  ],
  topMenuItems: menuItems.slice(0, 3),
  inventoryAlerts: inventoryItems.filter((item) => item.onHand <= item.parLevel),
  recentTickets: tickets
};

const paymentsSnapshot: PaymentsSnapshot = {
  summary: {
    totalToday: "$52.15",
    totalWeek: "$412.40",
    rangeTotal: "$412.40",
    methods: [
      { method: "Card", amount: "$310.20" },
      { method: "Cash", amount: "$82.70" },
      { method: "Online", amount: "$19.50" }
    ]
  },
  payments: [
    {
      id: "pay-1",
      ticketId: "#48221",
      method: "Card",
      methodType: "Card",
      methodBrand: "Visa",
      methodLast4: "4242",
      status: "Completed",
      amount: "$32.40",
      amountValue: 32.4,
      tipAmount: "$2.50",
      tipAmountValue: 2.5,
      totalAmountValue: 34.9,
      processedAt: "09:42",
      processedAtIso: buildIsoTime(9, 42),
      processor: "stripe",
      processorPaymentId: "pi_sample_1",
      receiptUrl: "https://example.org/receipts/pay-1",
      capturedAtIso: buildIsoTime(9, 42),
      refundedAmount: "$0.00",
      refundedAmountValue: 0,
      remainingAmountValue: 34.9,
      currency: "USD",
      metadata: { source: "mock" }
    },
    {
      id: "pay-2",
      ticketId: "#48218",
      method: "Online",
      methodType: "Online",
      status: "Completed",
      amount: "$18.75",
      amountValue: 18.75,
      tipAmount: "$0.00",
      tipAmountValue: 0,
      totalAmountValue: 18.75,
      processedAt: "09:10",
      processedAtIso: buildIsoTime(9, 10),
      processor: "square",
      processorPaymentId: "pi_sample_2",
      receiptUrl: "https://example.org/receipts/pay-2",
      capturedAtIso: buildIsoTime(9, 10),
      refundedAmount: "$0.00",
      refundedAmountValue: 0,
      remainingAmountValue: 18.75,
      currency: "USD",
      metadata: { channel: "web" }
    },
    {
      id: "pay-3",
      ticketId: "#48211",
      method: "Card",
      methodType: "Card",
      methodBrand: "Amex",
      methodLast4: "1881",
      status: "Refunded",
      amount: "$9.50",
      amountValue: 9.5,
      tipAmount: "$0.00",
      tipAmountValue: 0,
      totalAmountValue: 9.5,
      processedAt: "08:35",
      processedAtIso: buildIsoTime(8, 35),
      processor: "stripe",
      processorPaymentId: "pi_sample_3",
      receiptUrl: "https://example.org/receipts/pay-3",
      capturedAtIso: buildIsoTime(8, 30),
      failureReason: "Customer request",
      refundedAmount: "$9.50",
      refundedAmountValue: 9.5,
      remainingAmountValue: 0,
      currency: "USD",
      metadata: { dispute: false }
    }
  ]
};

const reportingSnapshot: ReportingSnapshot = {
  revenueSeries: [
    { date: "Nov 02", total: "$2,310" },
    { date: "Nov 03", total: "$2,640" },
    { date: "Nov 04", total: "$2,785" },
    { date: "Nov 05", total: "$2,410" },
    { date: "Nov 06", total: "$2,965" },
    { date: "Nov 07", total: "$3,125" },
    { date: "Nov 08", total: "$2,940" }
  ],
  ticketSeries: [
    { date: "Nov 02", count: 138 },
    { date: "Nov 03", count: 145 },
    { date: "Nov 04", count: 151 },
    { date: "Nov 05", count: 133 },
    { date: "Nov 06", count: 162 },
    { date: "Nov 07", count: 168 },
    { date: "Nov 08", count: 148 }
  ],
  topCategories: [
    { category: "Coffee Bar", revenue: "$14,520" },
    { category: "Kitchen Favorites", revenue: "$9,880" },
    { category: "Seasonal Specials", revenue: "$4,310" }
  ],
  categoryOptions: ["Coffee Bar", "Kitchen Favorites", "Seasonal Specials"],
  locations: {
    "managed-sample": {
      revenueSeries: [
        { date: "Nov 02", total: "$1,210" },
        { date: "Nov 03", total: "$1,380" },
        { date: "Nov 04", total: "$1,420" },
        { date: "Nov 05", total: "$1,305" },
        { date: "Nov 06", total: "$1,555" },
        { date: "Nov 07", total: "$1,610" },
        { date: "Nov 08", total: "$1,495" }
      ],
      ticketSeries: [
        { date: "Nov 02", count: 76 },
        { date: "Nov 03", count: 81 },
        { date: "Nov 04", count: 86 },
        { date: "Nov 05", count: 72 },
        { date: "Nov 06", count: 90 },
        { date: "Nov 07", count: 94 },
        { date: "Nov 08", count: 83 }
      ],
      topCategories: [
        { category: "Coffee Bar", revenue: "$7,820" },
        { category: "Kitchen Favorites", revenue: "$4,110" },
        { category: "Seasonal Specials", revenue: "$1,640" }
      ],
      categoryOptions: ["Coffee Bar", "Kitchen Favorites", "Seasonal Specials"]
    },
    "uptown-sample": {
      revenueSeries: [
        { date: "Nov 02", total: "$890" },
        { date: "Nov 03", total: "$1,060" },
        { date: "Nov 04", total: "$1,085" },
        { date: "Nov 05", total: "$1,020" },
        { date: "Nov 06", total: "$1,210" },
        { date: "Nov 07", total: "$1,280" },
        { date: "Nov 08", total: "$1,180" }
      ],
      ticketSeries: [
        { date: "Nov 02", count: 62 },
        { date: "Nov 03", count: 64 },
        { date: "Nov 04", count: 65 },
        { date: "Nov 05", count: 61 },
        { date: "Nov 06", count: 72 },
        { date: "Nov 07", count: 74 },
        { date: "Nov 08", count: 65 }
      ],
      topCategories: [
        { category: "Coffee Bar", revenue: "$6,700" },
        { category: "Kitchen Favorites", revenue: "$3,540" },
        { category: "Seasonal Specials", revenue: "$2,670" }
      ],
      categoryOptions: ["Coffee Bar", "Kitchen Favorites", "Seasonal Specials"]
    }
  }
};

export const getTenantSummary = (): TenantSummary => tenant;
export const getMenuItems = (): MenuItem[] => menuItems;
export const getMenuModifiers = (): MenuModifier[] => menuModifiers;
export const getMenuModifierAssignments = (): Record<string, string[]> => menuModifierAssignments;
export const getInventoryItems = (): InventoryItem[] => inventoryItems;
export const getTicketFeed = (): Ticket[] => tickets;
export const getDashboardSnapshot = (): DashboardSnapshot => dashboardSnapshot;
export const getPaymentsSnapshot = (): PaymentsSnapshot => paymentsSnapshot;
export const getReportingSnapshot = (): ReportingSnapshot => reportingSnapshot;

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const formatUsd = (value: number) => USD_FORMATTER.format(Number.isFinite(value) ? value : 0);

const parseCurrency = (value: string) => {
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const startOfDayUtc = (date: Date) => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const endOfDayUtc = (date: Date) => {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 90;

const normalizeRangeInputs = (startInput?: string, endInput?: string) => {
  const start = startInput ? new Date(startInput) : undefined;
  const end = endInput ? new Date(endInput) : undefined;
  if (start && end && start > end) {
    return { start: end, end: start };
  }
  return { start, end };
};

export type PaymentsFilterOptions = {
  method?: string | null;
  limit?: number;
  startDate?: string;
  endDate?: string;
};

export const filterPaymentsSnapshot = (
  snapshot: PaymentsSnapshot,
  options?: PaymentsFilterOptions
): PaymentsSnapshot => {
  const limit = clampNumber(options?.limit ?? 15, 5, 50);
  const normalizedMethod = options?.method?.toLowerCase();
  const { start, end } = normalizeRangeInputs(options?.startDate, options?.endDate);
  let startBoundary = start ? startOfDayUtc(start) : undefined;
  const endBoundary = end ? endOfDayUtc(end) : undefined;

  if (startBoundary && endBoundary) {
    const maxStart = new Date(endBoundary);
    maxStart.setTime(endBoundary.getTime() - (MAX_RANGE_DAYS - 1) * DAY_MS);
    if (startBoundary < maxStart) {
      startBoundary = maxStart;
    }
  }

  const filtered = snapshot.payments.filter((payment) => {
    if (normalizedMethod && payment.method.toLowerCase() !== normalizedMethod) {
      return false;
    }
    if (!startBoundary && !endBoundary) return true;
    if (!payment.processedAtIso) return false;
    const timestamp = new Date(payment.processedAtIso).getTime();
    if (startBoundary && timestamp < startBoundary.getTime()) return false;
    if (endBoundary && timestamp > endBoundary.getTime()) return false;
    return true;
  });

  const limited = filtered.slice(0, limit);
  const rangeTotal = formatUsd(
    limited.reduce((total, record) => total + parseCurrency(record.amount), 0)
  );

  return {
    summary: {
      ...snapshot.summary,
      rangeTotal
    },
    payments: limited
  };
};

export type ReportingFilterOptions = {
  windowDays?: number;
  category?: string;
  locationId?: string;
};

const buildSeries = <T>(
  windowDays: number,
  values: number[],
  projector: (value: number) => T
) => {
  const today = new Date();
  const normalizedValues = values.length > 0 ? values : [0];
  const series: Array<{ date: string; value: T }> = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const label = date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
    const valueIndex = (windowDays - 1 - i) % normalizedValues.length;
    const baseValue = normalizedValues[valueIndex] ?? 0;
    series.push({
      date: label,
      value: projector(baseValue)
    });
  }
  return series;
};

export const filterReportingSnapshot = (
  snapshot: ReportingSnapshot,
  options?: ReportingFilterOptions
): ReportingSnapshot => {
  const windowDays = clampNumber(options?.windowDays ?? 7, 7, 90);
  const normalizedCategory = options?.category?.toLowerCase().trim();
  const baseSnapshot =
    (options?.locationId && snapshot.locations?.[options.locationId]) || snapshot;
  const revenueValues = baseSnapshot.revenueSeries.map((point) => parseCurrency(point.total));
  const ticketValues = baseSnapshot.ticketSeries.map((point) => Number(point.count ?? 0));
  const revenueSeries = buildSeries(windowDays, revenueValues, (value) => formatUsd(value)).map(
    (entry) => ({
      date: entry.date,
      total: entry.value
    })
  );
  const ticketSeries = buildSeries(windowDays, ticketValues, (value) => Math.round(value)).map(
    (entry) => ({
      date: entry.date,
      count: entry.value
    })
  );
  const categoryOptions = Array.from(
    new Set(
      baseSnapshot.categoryOptions ?? baseSnapshot.topCategories.map((category) => category.category)
    )
  );
  let topCategories = baseSnapshot.topCategories;
  if (normalizedCategory) {
    const filtered = topCategories.filter(
      (category) => category.category.toLowerCase() === normalizedCategory
    );
    if (filtered.length > 0) {
      topCategories = filtered;
    }
  }

  return {
    revenueSeries,
    ticketSeries,
    topCategories,
    categoryOptions
  };
};
