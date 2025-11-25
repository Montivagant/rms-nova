import { randomUUID } from "node:crypto";
import { pool } from "../../services/api/src/db.js";
import { hashPassword } from "@nova/auth";
import { makeSuperadminAuthHeader } from "./superadmin.js";
import type { NovaServerInstance } from "../../services/api/src/server.js";

export type SeedOptions = {
  business?: Partial<{ legalName: string; doingBusinessAs: string; contactEmail: string; contactPhone: string; country: string; timezone: string }>;
  owner?: Partial<{ firstName: string; lastName: string; email: string; password: string }>;
};

const defaultBusiness = {
  legalName: "Nova Test Tenant",
  doingBusinessAs: "Nova Test",
  contactEmail: "owner@nova.test",
  contactPhone: "+123456789",
  country: "US",
  timezone: "UTC"
};

const defaultOwner = {
  firstName: "Avery",
  lastName: "Lane",
  email: "owner@nova.test",
  password: "Password123!"
};

export const seedTenantViaApi = async (app: NovaServerInstance, options: SeedOptions = {}) => {
  const business = { ...defaultBusiness, ...options.business };
  const owner = { ...defaultOwner, ...options.owner };

  const registrationResponse = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      business,
      owner
    }
  });
  if (registrationResponse.statusCode !== 200) {
    throw new Error(`Registration failed: ${registrationResponse.body}`);
  }
  const registrationId = registrationResponse.json().data.registrationId as string;

  const approvalResponse = await app.inject({
    method: "POST",
    url: `/v1/superadmin/registrations/${registrationId}/decision`,
    headers: {
      authorization: await makeSuperadminAuthHeader()
    },
    payload: { decision: "approve" }
  });
  if (approvalResponse.statusCode !== 200) {
    throw new Error(`Approval failed: ${approvalResponse.body}`);
  }

  const loginResponse = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      email: owner.email,
      password: owner.password
    }
  });
  if (loginResponse.statusCode !== 200) {
    throw new Error(`Login failed: ${loginResponse.body}`);
  }

  return {
    tokens: loginResponse.json().data.tokens,
    user: loginResponse.json().data.user
  };
};

export const seedUser = async (tenantId: string, email: string, password: string, firstName = "User", lastName = "Seed") => {
  const client = await pool.connect();
  try {
    await client.query(
      "INSERT INTO users (id, tenant_id, email, first_name, last_name, status, hashed_password) VALUES ($1, $2, $3, $4, $5, 'active', $6)",
      [randomUUID(), tenantId, email.toLowerCase(), firstName, lastName, JSON.stringify(await hashPassword(password))]
    );
  } finally {
    client.release();
  }
};
