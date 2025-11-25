import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../services/api/src/server.js";
import { truncateAll } from "../helpers/db.js";
import { seedTenantViaApi } from "../helpers/tenant.js";
import { registrationModuleDefaults } from "@nova/module-registry";
import { makeSuperadminAuthHeader, superadminPermissions } from "../helpers/superadmin.js";

describe("superadmin registration listing", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("returns filtered pending registrations", async () => {
    const app = createServer();
    const pendingOne = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        business: {
          legalName: "Pending One",
          doingBusinessAs: "Pending One",
          contactEmail: "pending1@nova.test",
          contactPhone: "+123456781",
          country: "US",
          timezone: "UTC"
        },
        owner: {
          firstName: "Penny",
          lastName: "One",
          email: "pending1@nova.test",
          password: "Password123!"
        }
      }
    });
    const firstId = pendingOne.json().data.registrationId as string;

    const pendingTwo = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        business: {
          legalName: "Pending Two",
          doingBusinessAs: "Pending Two",
          contactEmail: "pending2@nova.test",
          contactPhone: "+123456782",
          country: "US",
          timezone: "UTC"
        },
        owner: {
          firstName: "Penny",
          lastName: "Two",
          email: "pending2@nova.test",
          password: "Password123!"
        }
      }
    });
    const secondId = pendingTwo.json().data.registrationId as string;

    await seedTenantViaApi(app, {
      business: { legalName: "Approved Tenant" },
      owner: { email: "approved@nova.test" }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/superadmin/registrations?status=pending&limit=10&offset=0",
      headers: {
        authorization: await makeSuperadminAuthHeader()
      }
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data).toHaveLength(2);
    const returnedIds = payload.data.map((item: { id: string }) => item.id);
    expect(returnedIds).toEqual([secondId, firstId]);
    expect(payload.data[0]).toMatchObject({
      status: "pending",
      business: expect.objectContaining({ legalName: "Pending Two" }),
      modules: expect.arrayContaining([
        expect.objectContaining({ key: "pos", enabled: true }),
        expect.objectContaining({ key: "menu", enabled: false })
      ])
    });
  });

  it("validates query parameters", async () => {
    const app = createServer();
    await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        business: {
          legalName: "Pending Bad",
          doingBusinessAs: "Pending Bad",
          contactEmail: "pendingbad@nova.test",
          contactPhone: "+123456783",
          country: "US",
          timezone: "UTC"
        },
        owner: {
          firstName: "Penny",
          lastName: "Bad",
          email: "pendingbad@nova.test",
          password: "Password123!"
        }
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/superadmin/registrations?status=unknown",
      headers: {
        authorization: await makeSuperadminAuthHeader()
      }
    });

    expect(response.statusCode).toBe(400);
    const payload = response.json();
    expect(payload.error).toMatchObject({ code: "VALIDATION" });
  });
});

describe("superadmin registration module toggles", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("allows updating module presets while pending", async () => {
    const app = createServer();
    const registrationResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        business: {
          legalName: "Toggle Corp",
          doingBusinessAs: "Toggle Corp",
          contactEmail: "toggle@corp.test",
          contactPhone: "+123456789",
          country: "US",
          timezone: "UTC"
        },
        owner: {
          firstName: "Taylor",
          lastName: "Toggle",
          email: "toggle@corp.test",
          password: "Password123!"
        }
      }
    });
    const registrationId = registrationResponse.json().data.registrationId as string;

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/superadmin/registrations/${registrationId}/modules`,
      headers: {
        authorization: await makeSuperadminAuthHeader()
      },
      payload: {
        modules: [
          { key: "pos", name: "Point of Sale", enabled: true },
          { key: "inventory", name: "Inventory", enabled: false }
        ]
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    const expectedUpdatedModules = registrationModuleDefaults.map((module) =>
      module.key === "inventory" ? { ...module, enabled: false } : { ...module }
    );
    expect(updateResponse.json().data.modules).toEqual(expectedUpdatedModules);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/superadmin/registrations?status=pending",
      headers: {
        authorization: await makeSuperadminAuthHeader()
      }
    });

    const registration = listResponse.json().data.find((item: { id: string }) => item.id === registrationId);
    expect(registration.modules).toEqual(expectedUpdatedModules);
  });

  it("returns applied modules after approval", async () => {
    const app = createServer();
    const registrationResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        business: {
          legalName: "Approved modular",
          doingBusinessAs: "Approved modular",
          contactEmail: "approved@modules.test",
          contactPhone: "+198765432",
          country: "US",
          timezone: "UTC"
        },
        owner: {
          firstName: "Alex",
          lastName: "Mod",
          email: "approved@modules.test",
          password: "Password123!"
        }
      }
    });
    const registrationId = registrationResponse.json().data.registrationId as string;

    await app.inject({
      method: "PATCH",
      url: `/v1/superadmin/registrations/${registrationId}/modules`,
      headers: {
        authorization: await makeSuperadminAuthHeader()
      },
      payload: {
        modules: [
          { key: "pos", name: "Point of Sale", enabled: true },
          { key: "menu", name: "Menu Manager", enabled: true },
          { key: "inventory", name: "Inventory", enabled: false }
        ]
      }
    });

    await app.inject({
      method: "POST",
      url: `/v1/superadmin/registrations/${registrationId}/decision`,
      headers: {
        authorization: await makeSuperadminAuthHeader(superadminPermissions)
      },
      payload: {
        decision: "approve"
      }
    });

    const approvedResponse = await app.inject({
      method: "GET",
      url: "/v1/superadmin/registrations?status=approved",
      headers: {
        authorization: await makeSuperadminAuthHeader()
      }
    });

    const approvedRegistration = approvedResponse.json().data.find((item: { id: string }) => item.id === registrationId);
    expect(approvedRegistration.status).toBe("approved");
    const expectedApprovedModules = registrationModuleDefaults.map((module) => {
      if (module.key === "menu") return { ...module, enabled: true };
      if (module.key === "inventory") return { ...module, enabled: false };
      return { ...module };
    });
    expect(approvedRegistration.modules).toEqual(expectedApprovedModules);
  });
});
