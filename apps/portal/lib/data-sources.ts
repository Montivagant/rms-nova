import { cache } from "react";
import { requestJson } from "./api-client";
import {
  getDashboardSnapshot,
  getInventoryItems,
  getInventoryAuditLog as getSampleInventoryAuditLog,
  getMenuItems,
  getMenuModifiers as getSampleMenuModifiers,
  getMenuModifierAssignments as getSampleMenuModifierAssignments,
  getTicketFeed,
  getPaymentsSnapshot,
  getReportingSnapshot,
  filterPaymentsSnapshot,
  filterReportingSnapshot,
  type DashboardMetric,
  type InventoryItem,
  type InventoryAuditEntry as SampleInventoryAuditEntry,
  type MenuItem,
  type MenuModifier as SampleMenuModifier,
  type Ticket,
  type PaymentsSnapshot,
  type ReportingSnapshot
} from "@nova/sample-data";
import { getPortalAuthHeaders } from "./server-auth";
import { portalNavLinks } from "./navigation";

type ApiResponse<T> = { data: T };

const shouldLogFallbacks = process.env.PORTAL_LOG_FALLBACKS === "true";

const fallbackWithLog = <T>(label: string, fallback: () => T) => (error: unknown) => {
  if (shouldLogFallbacks) {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "unknown error");
    console.warn(`[portal] Falling back to sample data for ${label} - ${message}`);
  }
  return fallback();
};

const fetchResource = async <T>({
  path,
  fallback,
  label,
  query
}: {
  path: string;
  fallback: () => T;
  label: string;
  query?: Record<string, string | number | undefined>;
}): Promise<T> => {
  const searchParams = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      searchParams.set(key, String(value));
    }
  }
  const urlPath = searchParams.size > 0 ? `${path}?${searchParams.toString()}` : path;
  try {
    const authHeaders = await getPortalAuthHeaders();
    const response = await requestJson<ApiResponse<T>>({
      path: urlPath,
      cache: "no-store",
      headers: authHeaders
    });
    return response.data;
  } catch (error) {
    return fallbackWithLog(label, fallback)(error);
  }
};

export interface DashboardSnapshot {
  metrics: DashboardMetric[];
  topMenuItems: MenuItem[];
  inventoryAlerts: InventoryItem[];
  recentTickets: Ticket[];
}

export type InventoryAuditEntry = SampleInventoryAuditEntry;

export interface InventoryCountSession {
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
}

export interface InventoryCountEntry {
  itemId: string;
  itemName: string;
  sku: string | null;
  unit: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  notes: string | null;
}

export interface InventoryCountAttachment {
  id: string;
  countId: string;
  url: string;
  label: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface InventoryCountDetail {
  session: InventoryCountSession;
  entries: InventoryCountEntry[];
  attachments: InventoryCountAttachment[];
}

export interface PortalLocationSummary {
  id: string;
  name: string;
  code: string;
  timezone: string;
  status: string;
  totalInventoryItems: number;
  totalMenuItems: number;
  isPrimary: boolean;
  managed: boolean;
}

export interface LocationAssignmentSummary {
  location: PortalLocationSummary;
  inventory: {
    assigned: Array<{
      itemId: string;
      name: string;
      sku: string | null;
      unit: string;
      quantity: number;
      reserved: number;
      onOrder: number;
    }>;
    available: Array<{
      itemId: string;
      name: string;
      sku: string | null;
      unit: string;
      baselineQuantity: number;
    }>;
  };
  menu: {
    assigned: Array<{
      menuItemId: string;
      name: string;
      category: string | null;
      price: number;
      currency: string;
    }>;
    available: Array<{
      menuItemId: string;
      name: string;
      category: string | null;
      defaultPrice: number;
      currency: string;
    }>;
  };
}

export interface AccountProfile {
  firstName: string;
  lastName: string;
  title: string | null;
  email: string;
  bio: string | null;
}

export interface BusinessProfile {
  legalName: string;
  doingBusinessAs: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  website: string | null;
  timezone: string;
  notes: string | null;
}

export type MenuModifier = SampleMenuModifier;

export interface LoyaltyRules {
  earnRate: number;
  redeemRate: number;
  minRedeemPoints: number;
  expirationDays: number | null;
  status: string;
  updatedAt: string;
}

export interface LoyaltyStats {
  totalAccounts: number;
  activeAccounts: number;
  totalPoints: number;
}

export interface LoyaltyAccount {
  id: string;
  externalCustomerId: string | null;
  balance: number;
  pendingBalance: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface LoyaltyTransaction {
  id: string;
  type: string;
  points: number;
  balanceAfter: number;
  reference: string | null;
  source: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface LoyaltyOverview {
  rules: LoyaltyRules;
  stats: LoyaltyStats;
  accounts: LoyaltyAccount[];
}

export interface LoyaltyAccountDetail {
  account: LoyaltyAccount;
  transactions: LoyaltyTransaction[];
}

export const getDashboardData = async (): Promise<DashboardSnapshot> =>
  fetchResource<DashboardSnapshot>({
    path: "/v1/portal/dashboard",
    fallback: getDashboardSnapshot,
    label: "dashboard"
  });

export const getLocationSummaries = async (): Promise<PortalLocationSummary[]> =>
  fetchResource<PortalLocationSummary[]>({
    path: "/v1/portal/locations",
    fallback: () => [
      {
        id: "primary",
        name: "Primary Location",
        code: "primary",
        timezone: "UTC",
        status: "active",
        totalInventoryItems: 0,
        totalMenuItems: 0,
        isPrimary: true,
        managed: false
      },
      {
        id: "managed-sample",
        name: "Downtown",
        code: "downtown",
        timezone: "America/Los_Angeles",
        status: "active",
        totalInventoryItems: 6,
        totalMenuItems: 4,
        isPrimary: false,
        managed: true
      }
    ],
    label: "locations"
  });

export const getLocationAssignmentSummary = async (
  locationId: string
): Promise<LocationAssignmentSummary> =>
  fetchResource<LocationAssignmentSummary>({
    path: `/v1/portal/locations/${locationId}/assignments`,
    fallback: () => ({
      location: {
        id: locationId,
        name: "Sample Location",
        code: "sample-location",
        timezone: "UTC",
        status: "active",
        totalInventoryItems: 1,
        totalMenuItems: 1,
        isPrimary: false,
        managed: true
      },
      inventory: {
        assigned: [
          {
            itemId: "inv-sample",
            name: "Sample Beans",
            sku: "beans-001",
            unit: "lb",
            quantity: 12,
            reserved: 0,
            onOrder: 0
          }
        ],
        available: [
          {
            itemId: "inv-available",
            name: "Sample Milk",
            sku: "milk-001",
            unit: "gal",
            baselineQuantity: 6
          }
        ]
      },
      menu: {
        assigned: [
          {
            menuItemId: "menu-sample",
            name: "Latte",
            category: "Coffee",
            price: 5,
            currency: "USD"
          }
        ],
        available: [
          {
            menuItemId: "menu-available",
            name: "Cold Brew",
            category: "Coffee",
            defaultPrice: 4.5,
            currency: "USD"
          }
        ]
      }
    }),
    label: "location assignments"
  });

export const getMenuData = async (): Promise<MenuItem[]> =>
  fetchResource<MenuItem[]>({
    path: "/v1/portal/menu/items",
    fallback: getMenuItems,
    label: "menu"
  });

export const getMenuItemsData = getMenuData;

export const getMenuModifiers = async (): Promise<MenuModifier[]> =>
  fetchResource<MenuModifier[]>({
    path: "/v1/portal/menu/modifiers",
    fallback: () => getSampleMenuModifiers(),
    label: "menu modifiers"
  });

export const getMenuModifierAssignments = async (): Promise<Record<string, string[]>> =>
  fetchResource<Record<string, string[]>>({
    path: "/v1/portal/menu/modifiers/assignments",
    fallback: () => getSampleMenuModifierAssignments(),
    label: "menu modifier assignments"
  });

export const getInventoryData = async (): Promise<InventoryItem[]> =>
  fetchResource<InventoryItem[]>({
    path: "/v1/portal/inventory/items",
    fallback: getInventoryItems,
    label: "inventory"
  });

export const getInventoryAuditLog = async (options?: {
  limit?: number;
  locationId?: string;
}): Promise<InventoryAuditEntry[]> =>
  fetchResource<InventoryAuditEntry[]>({
    path: "/v1/portal/inventory/audit",
    fallback: () => {
      let entries = getSampleInventoryAuditLog();
      if (options?.locationId) {
        entries = entries.filter((entry) => entry.locationId === options.locationId);
      }
      const limit = options?.limit ?? 10;
      return entries.slice(0, limit);
    },
    label: "inventory audit",
    query: {
      limit: options?.limit,
      locationId: options?.locationId
    }
  });

export const getInventoryCounts = async (limit = 10): Promise<InventoryCountSession[]> =>
  fetchResource<InventoryCountSession[]>({
    path: "/v1/portal/inventory/counts",
    fallback: () => [],
    label: "inventory counts",
    query: { limit }
  });

export const getInventoryCountDetail = async (
  countId: string
): Promise<InventoryCountDetail> =>
  fetchResource<InventoryCountDetail>({
    path: `/v1/portal/inventory/counts/${countId}`,
    fallback: () => ({
      session: {
        id: countId,
        name: "Inventory Count",
        status: "draft",
        locationId: "primary",
        locationName: "Primary Location",
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        updatedAt: null,
        notes: null,
        totalItems: 0,
        totalVariance: 0,
        attachmentsCount: 0
      },
      entries: [],
      attachments: []
    }),
    label: "inventory count detail"
  });

export const getTicketData = async (): Promise<Ticket[]> =>
  fetchResource<Ticket[]>({
    path: "/v1/portal/pos/tickets",
    fallback: getTicketFeed,
    label: "pos tickets"
  });

export const getPaymentsData = async (options?: {
  method?: string | null;
  limit?: number;
  startDate?: string;
  endDate?: string;
}): Promise<PaymentsSnapshot> =>
  fetchResource<PaymentsSnapshot>({
    path: "/v1/portal/payments",
    fallback: () =>
      filterPaymentsSnapshot(getPaymentsSnapshot(), {
        method: options?.method,
        limit: options?.limit,
        startDate: options?.startDate,
        endDate: options?.endDate
      }),
    label: "payments",
    query: {
      method: options?.method || undefined,
      limit: options?.limit,
      startDate: options?.startDate,
      endDate: options?.endDate
    }
  });

export const getReportingData = async (options?: {
  windowDays?: number;
  category?: string;
  locationId?: string;
}): Promise<ReportingSnapshot> =>
  fetchResource<ReportingSnapshot>({
    path: "/v1/portal/reporting",
    fallback: () => filterReportingSnapshot(getReportingSnapshot(), options),
    label: "reporting",
    query: {
      windowDays: options?.windowDays,
      category: options?.category,
      locationId: options?.locationId
    }
  });

export interface PortalModuleState {
  moduleId: string;
  enabled: boolean;
  source: string;
  updatedAt?: string;
}

export interface PortalFeatureFlagState {
  moduleId: string;
  featureKey: string;
  enabled: boolean;
  overridden?: boolean;
  updatedAt?: string;
}

export interface PortalLocationAccess {
  isScoped: boolean;
  allowedLocationIds: string[];
  manageableLocationIds: string[];
}

export interface PortalContext {
  tenant: {
    id: string;
    name: string;
    alias: string | null;
    status: string;
    planName: string;
    planId?: string | null;
    subscriptionStatus?: string | null;
    locationCount?: number | null;
    nextPayout?: string | null;
    nextPayoutAt?: string | null;
  };
  modules: PortalModuleState[];
  featureFlags: PortalFeatureFlagState[];
  permissions: string[];
  roles: string[];
  locationAccess: PortalLocationAccess;
}

const buildDefaultPortalContext = (): PortalContext => {
  const seen = new Set<string>();
  const defaultModules: PortalModuleState[] = portalNavLinks
    .filter((link) => Boolean(link.moduleId))
    .map((link) => link.moduleId as string)
    .filter((moduleId) => {
      if (seen.has(moduleId)) return false;
      seen.add(moduleId);
      return true;
    })
    .map((moduleId) => ({
      moduleId,
      enabled: true,
      source: "default"
    }));

  const fallbackFlagTimestamp = "2024-01-01T00:00:00.000Z";
  const defaultFeatureFlags: PortalFeatureFlagState[] = [
    {
      moduleId: "global",
      featureKey: "multi_location",
      enabled: true,
      updatedAt: fallbackFlagTimestamp
    },
    {
      moduleId: "reporting",
      featureKey: "advanced_reporting",
      enabled: true,
      updatedAt: fallbackFlagTimestamp
    }
  ];

  return {
    tenant: {
      id: "unavailable",
      name: "Your Tenant",
      alias: null,
      status: "unknown",
      planName: "Plan pending",
      planId: null,
      subscriptionStatus: null,
      locationCount: 2,
      nextPayout: "Awaiting payouts",
      nextPayoutAt: null
    },
    modules: defaultModules,
    featureFlags: defaultFeatureFlags,
    permissions: [],
    roles: [],
    locationAccess: {
      isScoped: false,
      allowedLocationIds: [],
      manageableLocationIds: []
    }
  };
};

const buildDefaultAccountProfile = (): AccountProfile => ({
  firstName: "Avery",
  lastName: "Jensen",
  title: "Founder",
  email: "avery.jensen@example.com",
  bio: "Operator focused on multi-location readiness. Placeholder profile stored locally."
});

const buildDefaultBusinessProfile = (): BusinessProfile => ({
  legalName: "Nova Demo Co",
  doingBusinessAs: "Nova Demo Co",
  supportEmail: "support@example.com",
  supportPhone: null,
  website: null,
  timezone: "America/Los_Angeles",
  notes: "Share support contacts, payout notes, and branding instructions. These sync to invoices + statements."
});

export const getPortalContext = cache(async (): Promise<PortalContext> =>
  fetchResource<PortalContext>({
    path: "/v1/portal/context",
    fallback: buildDefaultPortalContext,
    label: "portal context"
  })
);

export const getAccountProfile = cache(async (): Promise<AccountProfile> =>
  fetchResource<AccountProfile>({
    path: "/v1/portal/account/profile",
    fallback: buildDefaultAccountProfile,
    label: "account profile"
  })
);

export const getBusinessProfile = cache(async (): Promise<BusinessProfile> =>
  fetchResource<BusinessProfile>({
    path: "/v1/portal/account/business",
    fallback: buildDefaultBusinessProfile,
    label: "business profile"
  })
);

export const getLoyaltyOverview = cache(async (): Promise<LoyaltyOverview> =>
  fetchResource<LoyaltyOverview>({
    path: "/v1/portal/loyalty/overview",
    fallback: buildFallbackLoyaltyOverview,
    label: "loyalty overview"
  })
);

export const getLoyaltyAccountDetail = cache(
  async (accountId: string): Promise<LoyaltyAccountDetail> =>
    fetchResource<LoyaltyAccountDetail>({
      path: `/v1/portal/loyalty/accounts/${accountId}`,
      fallback: () => buildFallbackLoyaltyAccountDetail(accountId),
      label: "loyalty account detail"
    })
);

const buildFallbackLoyaltyOverview = (): LoyaltyOverview => ({
  rules: {
    earnRate: 1,
    redeemRate: 0.01,
    minRedeemPoints: 25,
    expirationDays: null,
    status: "active",
    updatedAt: new Date().toISOString()
  },
  stats: {
    totalAccounts: 1,
    activeAccounts: 1,
    totalPoints: 320
  },
  accounts: fallbackLoyaltyAccounts
});

const fallbackLoyaltyAccounts: LoyaltyAccount[] = [
  {
    id: "fallback-loyalty-account",
    externalCustomerId: "avery@example.com",
    balance: 320,
    pendingBalance: 0,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: null
  }
];

const fallbackLoyaltyTransactions: LoyaltyTransaction[] = [
  {
    id: "fallback-txn-earn",
    type: "earn",
    points: 100,
    balanceAfter: 320,
    reference: "sample-ticket",
    source: "sample",
    metadata: { seed: true },
    createdAt: new Date().toISOString()
  }
];

const buildFallbackLoyaltyAccountDetail = (accountId: string): LoyaltyAccountDetail => {
  const account = fallbackLoyaltyAccounts.find((entry) => entry.id === accountId);
  if (!account) {
    return {
      account: {
        id: accountId,
        externalCustomerId: "customer@example.com",
        balance: 0,
        pendingBalance: 0,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: null
      },
      transactions: []
    };
  }
  return {
    account,
    transactions: fallbackLoyaltyTransactions
  };
};
