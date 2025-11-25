import { test, expect } from "@playwright/test";

test.describe("Superadmin registrations", () => {
  test("allows reviewing and rejecting a registration", async ({ page }) => {
    const initialPayload = {
      data: [
        {
          id: "reg-12345678",
          status: "pending",
          business: {
            legalName: "Aurora Coffee Collective",
            contactEmail: "owner@aurora.example"
          },
          owner: {
            firstName: "Jamie",
            lastName: "Velasquez",
            email: "jamie@aurora.example"
          },
          createdAt: "2025-10-15T18:30:00.000Z",
          modules: [
            { key: "pos", name: "Point of Sale", enabled: true },
            { key: "inventory", name: "Inventory", enabled: true },
            { key: "menu", name: "Menu Manager", enabled: false },
            { key: "reports", name: "Reporting & Insights", enabled: false }
          ]
        }
      ]
    };
    const emptyPayload = { data: [] };
    const approvedPayload = {
      data: [
        {
          id: "reg-approved-001",
          tenantId: "tenant-borealis",
          status: "approved",
          business: {
            legalName: "Nebula Bistro",
            contactEmail: "hello@nebula.example"
          },
          owner: {
            firstName: "Taylor",
            lastName: "Nguyen",
            email: "taylor@nebula.example"
          },
          createdAt: "2025-10-01T15:00:00.000Z",
          decidedAt: "2025-10-02T12:15:00.000Z",
          reason: "Documents verified and contract countersigned.",
          modules: [
            { key: "pos", name: "Point of Sale", enabled: true },
            { key: "inventory", name: "Inventory", enabled: true },
            { key: "menu", name: "Menu Manager", enabled: false },
            { key: "reports", name: "Reporting & Insights", enabled: false }
          ]
        }
      ]
    };

    let listRequestCount = 0;
    let decisionAccepted = false;
    const modulePatchPayloads: Array<{ modules: unknown }> = [];

    await page.route("**/v1/superadmin/registrations?status=pending", async (route) => {
      const payload = !decisionAccepted && listRequestCount < 2 ? initialPayload : emptyPayload;
      listRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload)
      });
    });

    await page.route("**/v1/superadmin/registrations?status=approved", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(approvedPayload)
      });
    });

    await page.route("**/v1/superadmin/registrations/*/decision", async (route) => {
      expect(route.request().method()).toBe("POST");
      decisionAccepted = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" })
      });
    });

    await page.route("**/v1/superadmin/registrations/*/modules", async (route) => {
      const body = route.request().postDataJSON() ?? {};
      modulePatchPayloads.push(body as { modules: unknown });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { modules: (body as { modules?: unknown }).modules ?? [] } })
      });
    });

    await page.goto("/registrations");

    await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrations" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Billing" })).toHaveAttribute("href", "/billing");
    await expect(page.getByRole("button", { name: "superadmin@nova.dev" })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Tenant registrations" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "1 pending registration" })).toBeVisible();
    await expect(page.getByText("Aurora Coffee Collective")).toBeVisible();
    await expect(page.getByText("Onboarding checklist")).toBeVisible();
    await expect(page.getByText("Checklist unlocks after approval.")).toBeVisible();
    await expect(page.getByText("Module toggles")).toBeVisible();
    await expect(page.getByText("Configure modules before approval.")).toBeVisible();

    const menuToggle = page.getByRole("button", { name: "Menu Manager" });
    await expect(menuToggle).toHaveAttribute("aria-pressed", "false");
    await menuToggle.click();

    await expect.poll(() => modulePatchPayloads.length).toBe(1);
    expect(modulePatchPayloads[0]).toEqual({
      modules: [
        { key: "pos", name: "Point of Sale", enabled: true },
        { key: "inventory", name: "Inventory", enabled: true },
        { key: "menu", name: "Menu Manager", enabled: true },
        { key: "reports", name: "Reporting & Insights", enabled: false }
      ]
    });
    await expect(menuToggle).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Decide" }).click();
    const modal = page.getByRole("dialog", { name: /decide on/i });
    await expect(modal).toBeVisible();

    await modal.getByLabel("Decision").selectOption("reject");
    await modal.getByRole("button", { name: "Reject" }).click();
    await expect(modal.getByText("A reason is required when rejecting a registration.")).toBeVisible();

    await modal.getByLabel("Reason").fill("Insufficient documentation provided.");
    await modal.getByRole("button", { name: "Reject" }).click();

    await expect(modal).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "No pending registrations" })).toBeVisible();

    await page.getByLabel("Status filter").selectOption("approved");
    await expect(page.getByRole("heading", { name: "1 approved registration" })).toBeVisible();
    await expect(page.getByText("Nebula Bistro")).toBeVisible();
    await expect(page.getByText("Tenant ID")).toBeVisible();
    await expect(page.getByText("tenant-borealis")).toBeVisible();
    await expect(page.getByText("Documents verified and contract countersigned.")).toBeVisible();
    await expect(page.getByText("Mark items as complete as you activate this tenant.")).toBeVisible();
    await expect(page.getByText("Reflects current tenant module state.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Point of Sale" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reporting & Insights" })).toHaveAttribute("aria-pressed", "false");
  });
});

