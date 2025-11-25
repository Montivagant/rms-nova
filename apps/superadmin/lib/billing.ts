import { getSuperadminToken } from "@lib/auth";

export type BillingRenewal = {
  id: string;
  subscriptionId?: string;
  tenantName: string;
  planName: string;
  priceCents: number;
  currentPeriodEnd: string | null;
  status: string;
};

export type BillingInvoice = {
  id: string;
  invoiceId?: string;
  tenantName: string;
  totalDue: number;
  dueAt: string | null;
  status: string;
};

export type BillingSummary = {
  activeTenantCount: number;
  monthlyRecurringRevenueCents: number;
  pastDueTenantCount: number;
  upcomingRenewalCount: number;
  cancelAtPeriodEndCount: number;
  openInvoiceCount: number;
  upcomingRenewals: BillingRenewal[];
  openInvoices: BillingInvoice[];
};

export type BillingPaginationMeta = {
  limit: number;
  offset: number;
};

export type BillingRenewalList = {
  data: BillingRenewal[];
  meta: BillingPaginationMeta;
};

export type BillingInvoiceList = {
  data: BillingInvoice[];
  meta: BillingPaginationMeta;
};

const defaultBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? "http://localhost:3001";

const emptySummary: BillingSummary = {
  activeTenantCount: 0,
  monthlyRecurringRevenueCents: 0,
  pastDueTenantCount: 0,
  upcomingRenewalCount: 0,
  cancelAtPeriodEndCount: 0,
  openInvoiceCount: 0,
  upcomingRenewals: [],
  openInvoices: []
};

async function request(path: string, token: string | null, init?: RequestInit) {
  const response = await fetch(`${defaultBaseUrl}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    credentials: "include",
    cache: "no-store",
    ...init
  });
  return response;
}

export async function getBillingSummary(): Promise<BillingSummary> {
  const token = await getSuperadminToken();

  try {
    const response = await request("/v1/superadmin/billing/summary", token);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Object.assign(new Error("Failed to fetch billing summary"), {
        response,
        payload: error
      });
    }

    const payload = (await response.json()) as {
      data: Omit<BillingSummary, "upcomingRenewals" | "openInvoices"> & {
        upcomingRenewals?: BillingRenewal[];
        openInvoices?: BillingInvoice[];
      };
    };

    return {
      ...payload.data,
      upcomingRenewals: Array.isArray(payload.data.upcomingRenewals)
        ? payload.data.upcomingRenewals
        : [],
      openInvoices: Array.isArray(payload.data.openInvoices) ? payload.data.openInvoices : []
    };
  } catch (error) {
    console.warn("[billing] Falling back to empty summary (API unreachable).", error);
    return emptySummary;
  }
}

export async function listUpcomingRenewals(
  limit?: number,
  offset?: number
): Promise<BillingRenewalList> {
  const token = await getSuperadminToken();
  const params = new URLSearchParams();
  if (typeof limit === "number") params.set("limit", String(limit));
  if (typeof offset === "number") params.set("offset", String(offset));

  try {
    const response = await request(
      `/v1/superadmin/billing/renewals${params.toString() ? `?${params.toString()}` : ""}`,
      token
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Object.assign(new Error("Failed to fetch upcoming renewals"), {
        response,
        payload: error
      });
    }

    return (await response.json()) as BillingRenewalList;
  } catch (error) {
    console.warn("[billing] Falling back to empty renewal list.", error);
    return { data: [], meta: { limit: limit ?? 0, offset: offset ?? 0 } };
  }
}

export async function listOpenInvoices(limit?: number, offset?: number): Promise<BillingInvoiceList> {
  const token = await getSuperadminToken();
  const params = new URLSearchParams();
  if (typeof limit === "number") params.set("limit", String(limit));
  if (typeof offset === "number") params.set("offset", String(offset));

  try {
    const response = await request(
      `/v1/superadmin/billing/open-invoices${params.toString() ? `?${params.toString()}` : ""}`,
      token
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Object.assign(new Error("Failed to fetch open invoices"), {
        response,
        payload: error
      });
    }

    return (await response.json()) as BillingInvoiceList;
  } catch (error) {
    console.warn("[billing] Falling back to empty invoice list.", error);
    return { data: [], meta: { limit: limit ?? 0, offset: offset ?? 0 } };
  }
}
