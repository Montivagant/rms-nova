import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { registrationModuleDefaults } from "@nova/module-registry";

dotenv.config({ path: process.env.ENV_FILE || undefined });

type ModuleToggle = {
  key: string;
  name: string;
  enabled: boolean;
  category?: string;
};

type RegistrationRecord = {
  id: string;
  status: "pending" | "approved" | "rejected";
  tenantId?: string;
  business: Record<string, unknown>;
  owner: Record<string, unknown>;
  modules?: ModuleToggle[];
};

type SeedOptions = {
  apiBaseUrl: string;
  superadminToken: string;
  databaseUrl: string;
  businessName: string;
  doingBusinessAs: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerFirstName: string;
  ownerLastName: string;
  contactEmail: string;
  contactPhone: string;
  timezone: string;
  country: string;
  skipSampleData: boolean;
};

const args = process.argv.slice(2);

const getFlagValue = (flag: string) => {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) return undefined;
  return args[index + 1];
};

const hasFlag = (flag: string) => args.includes(flag);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || `tenant-${randomUUID().slice(0, 8)}`;

const normalizeApiBaseUrl = (value: string) => {
  const trimmed = value.replace(/\/$/, "");
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
};

const resolveOptions = (): SeedOptions => {
  const businessName = getFlagValue("--business-name") ?? process.env.SEED_BUSINESS_NAME ?? "Demo Coffee Collective";
  const doingBusinessAs =
    getFlagValue("--doing-business-as") ?? process.env.SEED_DOING_BUSINESS_AS ?? businessName;
  const aliasSlug = slugify(doingBusinessAs);
  const rawApiBase =
    getFlagValue("--api-base-url") ??
    process.env.SEED_API_BASE_URL ??
    process.env.API_URL ??
    process.env.API_BASE_URL ??
    "http://localhost:3001/v1";
  const apiBaseUrl = normalizeApiBaseUrl(rawApiBase);
  const superadminToken =
    getFlagValue("--superadmin-token") ?? process.env.SEED_SUPERADMIN_TOKEN ?? process.env.SUPERADMIN_TOKEN;
  const databaseUrl = getFlagValue("--database-url") ?? process.env.DATABASE_URL;
  if (!superadminToken) {
    throw new Error("Set --superadmin-token or SUPERADMIN_TOKEN so the script can call superadmin endpoints.");
  }
  if (!databaseUrl) {
    throw new Error("Set --database-url or DATABASE_URL so the sample data seed can connect to Postgres.");
  }
  const ownerEmail =
    getFlagValue("--owner-email") ?? process.env.SEED_OWNER_EMAIL ?? `owner+${aliasSlug}@demo.local`;
  const ownerPassword =
    getFlagValue("--owner-password") ?? process.env.SEED_OWNER_PASSWORD ?? "Owner@12345";
  const ownerFirstName =
    getFlagValue("--owner-first-name") ?? process.env.SEED_OWNER_FIRST_NAME ?? "Ava";
  const ownerLastName =
    getFlagValue("--owner-last-name") ?? process.env.SEED_OWNER_LAST_NAME ?? "Operator";
  const contactEmail =
    getFlagValue("--business-email") ?? process.env.SEED_BUSINESS_EMAIL ?? `ops+${aliasSlug}@demo.local`;
  const contactPhone = getFlagValue("--business-phone") ?? process.env.SEED_BUSINESS_PHONE ?? "555-010-8899";
  const timezone = getFlagValue("--timezone") ?? process.env.SEED_TIMEZONE ?? "America/Los_Angeles";
  const country = getFlagValue("--country") ?? process.env.SEED_COUNTRY ?? "US";
  const skipSampleData = hasFlag("--skip-sample-data") || process.env.SEED_SKIP_SAMPLE_DATA === "true";

  return {
    apiBaseUrl,
    superadminToken,
    databaseUrl,
    businessName,
    doingBusinessAs,
    ownerEmail,
    ownerPassword,
    ownerFirstName,
    ownerLastName,
    contactEmail,
    contactPhone,
    timezone,
    country,
    skipSampleData
  };
};

const buildHeaders = (opts: SeedOptions, authorized: boolean, extra?: Record<string, string>) => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extra ?? {})
  };
  if (authorized) {
    headers.Authorization = `Bearer ${opts.superadminToken}`;
  }
  return headers;
};

const requestJson = async <T>(
  opts: SeedOptions,
  path: string,
  init: RequestInit = {},
  authorized = false
): Promise<T> => {
  const response = await fetch(`${opts.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(opts, authorized, init.headers as Record<string, string> | undefined),
      ...(init.body ? { "Content-Type": "application/json" } : {})
    }
  });
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    throw new Error(`Request to ${path} failed (${response.status} ${response.statusText}): ${JSON.stringify(detail)}`);
  }
  if (response.status === 204) {
    return {} as T;
  }
  return (await response.json()) as T;
};

const fetchRegistrations = async (
  opts: SeedOptions,
  status: "pending" | "approved"
): Promise<RegistrationRecord[]> => {
  const search = new URLSearchParams({ status, limit: "100" });
  const payload = await requestJson<{ data: RegistrationRecord[] }>(
    opts,
    `/superadmin/registrations?${search.toString()}`,
    { method: "GET" },
    true
  );
  return payload.data ?? [];
};

const findRegistrationByAlias = (
  records: RegistrationRecord[],
  doingBusinessAs: string
) =>
  records.find((record) => {
    const businessDoingBusinessAs = (record.business.doingBusinessAs ??
      record.business.doing_business_as ??
      record.business.doing_businessAs ??
      record.business.doingBusiness_as) as string | undefined;
    return businessDoingBusinessAs?.toLowerCase() === doingBusinessAs.toLowerCase();
  });

const resolveRegistration = async (opts: SeedOptions): Promise<RegistrationRecord | null> => {
  const approved = await fetchRegistrations(opts, "approved");
  const existingApproved = findRegistrationByAlias(approved, opts.doingBusinessAs);
  if (existingApproved) return existingApproved;
  const pending = await fetchRegistrations(opts, "pending");
  return findRegistrationByAlias(pending, opts.doingBusinessAs) ?? null;
};

const createRegistration = async (opts: SeedOptions): Promise<string> => {
  const payload = {
    business: {
      legalName: opts.businessName,
      doingBusinessAs: opts.doingBusinessAs,
      contactEmail: opts.contactEmail,
      contactPhone: opts.contactPhone,
      country: opts.country,
      timezone: opts.timezone
    },
    owner: {
      firstName: opts.ownerFirstName,
      lastName: opts.ownerLastName,
      email: opts.ownerEmail,
      password: opts.ownerPassword
    }
  };
  const response = await requestJson<{ data: { registrationId: string } }>(opts, "/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.data.registrationId;
};

const approveRegistration = async (
  opts: SeedOptions,
  registrationId: string,
  modules?: ModuleToggle[]
): Promise<string> => {
  const body = {
    decision: "approve",
    modules: modules ?? registrationModuleDefaults
  };
  const response = await requestJson<{ data: { tenantId: string } }>(
    opts,
    `/superadmin/registrations/${registrationId}/decision`,
    { method: "POST", body: JSON.stringify(body) },
    true
  );
  return response.data.tenantId;
};

const runSampleDataSeed = async (tenantId: string, opts: SeedOptions) => {
  if (opts.skipSampleData) {
    console.log(`Skipping sample data seed for tenant ${tenantId} (per flag).`);
    return;
  }
  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  console.log(`Seeding deterministic menu/inventory/POS data for tenant ${tenantId}...`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pnpmCmd, ["seed:sample-data", "--", "--tenant-id", tenantId], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        DATABASE_URL: opts.databaseUrl
      }
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pnpm seed:sample-data exited with code ${code}`));
      }
    });
    child.on("error", (error) => reject(error));
  });
};

const main = async () => {
  const opts = resolveOptions();
  console.log(`Connecting to API at ${opts.apiBaseUrl}`);
  const registration = await resolveRegistration(opts);
  let registrationId = registration?.id;

  if (!registrationId) {
    console.log(`No existing registration for "${opts.doingBusinessAs}", creating one now...`);
    registrationId = await createRegistration(opts);
    console.log(`Created registration ${registrationId}`);
  } else if (registration) {
    console.log(`Found existing registration ${registrationId} (${registration.status}).`);
  } else {
    console.log(`Found existing registration ${registrationId}.`);
  }

  let tenantId = registration?.tenantId;
  if (registration?.status !== "approved") {
    console.log(`Approving registration ${registrationId} via superadmin API...`);
    tenantId = await approveRegistration(opts, registrationId, registration?.modules);
    console.log(`Registration approved and tenant ${tenantId} created.`);
  } else if (!tenantId) {
    throw new Error(`Registration ${registrationId} is approved but tenantId is missing.`);
  } else {
    console.log(`Registration already approved for tenant ${tenantId}.`);
  }

  if (!tenantId) {
    throw new Error("Tenant ID missing after registration approval.");
  }
  await runSampleDataSeed(tenantId, opts);
  console.log(`Tenant ${tenantId} is ready with seeded data and owner account ${opts.ownerEmail}.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
