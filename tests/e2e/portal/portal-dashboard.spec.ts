import { test, expect } from "./mock-api";

const TEST_COOKIE = {
  name: "portal_access_token",
  value: "playwright-portal-token",
  domain: "127.0.0.1",
  path: "/"
};

test.describe("Customer portal smoke", () => {
  test("renders login form and shows validation error for empty submission", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid credentials payload")).toBeVisible();
  });
});

test.describe("Authenticated portal experience", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([TEST_COOKIE]);
  });

  test("loads dashboard metrics and navigates through all modules", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Nova Portal")).toBeVisible({
      timeout: 10_000
    });
    await expect(page.locator(".portal-grid--metrics .metric-card__value").first()).toBeVisible();

    const navTargets: Array<{ link: RegExp; heading: string; level?: number }> = [
      { link: /^Menu/, heading: "Menu", level: 2 },
      { link: /^Inventory/, heading: "Inventory", level: 2 },
      { link: /^Loyalty/, heading: "Loyalty", level: 2 },
      { link: /^Locations/, heading: "Locations", level: 2 },
      { link: /^POS/, heading: "Point of Sale", level: 2 },
      { link: /^Payments/, heading: "Payments", level: 2 },
      { link: /^Reporting/, heading: "Reporting", level: 2 }
    ];

    for (const target of navTargets) {
      await page.getByRole("link", { name: target.link }).click();
      await expect(
        page.getByRole("heading", { name: target.heading, level: target.level ?? 2 })
      ).toBeVisible();
    }
  });

  test("applies payments/reporting drill-down filters", async ({ page }) => {
    await page.goto("/payments");

    await page.getByLabel("Method").selectOption("Card");
    const startInput = page.getByLabel("Start Date");
    const endInput = page.getByLabel("End Date");
    const endValue = await endInput.inputValue();
    await startInput.fill(endValue);
    await page.getByRole("button", { name: "Apply filters" }).click();

    await expect(page.getByText("Selected Range")).toBeVisible();
    await expect(page.locator("table")).toContainText("Card");
    const paymentsExportButton = page.getByRole("button", { name: "Export CSV" });
    await expect(paymentsExportButton).toBeDisabled();

    await page.goto("/reporting");
    await page.getByLabel("Window").selectOption("30");
    const categorySelect = page.getByLabel("Category");
    if (await categorySelect.isEnabled()) {
      await categorySelect.selectOption("Coffee Bar");
      await page.getByRole("button", { name: "Update" }).click();
    } else {
      await expect(categorySelect).toBeDisabled();
    }

    await expect(page.locator("table")).toContainText("Coffee Bar");
    const reportingExportButton = page.getByRole("button", { name: "Export CSV" });
    await expect(reportingExportButton).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Advanced reporting insights" })).toBeVisible();
  });

  test("submits an inline payment refund", async ({ page }) => {
    await page.goto("/payments");
    const refundButton = page.getByRole("button", { name: "Issue refund" }).first();
    await refundButton.click();
    const amountInput = page.getByLabel(/Amount/).first();
    await amountInput.fill("5");
    await page.getByRole("button", { name: "Submit refund" }).click();
    await expect(refundButton).toBeVisible();
  });

  test("shows the location assignment workspace", async ({ page }) => {
    await page.goto("/locations");
    await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible();
    await expect(page.getByText("Assignment workspace")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Inventory assignments", level: 4 })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Menu assignments", level: 4 })
    ).toBeVisible();
    await expect(page.getByLabel("Available inventory")).toBeVisible();
    await expect(page.getByLabel("Available menu items")).toBeVisible();
  });

  test("renders the POS quick sale form", async ({ page }) => {
    await page.goto("/pos");
    await expect(page.getByRole("heading", { name: "Point of Sale" })).toBeVisible();
    await expect(page.getByText("Quick sale")).toBeVisible();
    await expect(page.locator("form.pos-sale-form")).toBeVisible();
    await expect(page.getByLabel("Menu item")).toBeVisible();
    await expect(page.getByLabel("Payment method")).toBeVisible();
    const posRecordButton = page.getByRole("main").getByRole("button", { name: "Record sale" });
    await expect(posRecordButton).toBeVisible();
  });

  test("renders the menu authoring forms", async ({ page }) => {
    await page.goto("/menu");
    await expect(page.getByText("Edit menu item")).toBeVisible();
    const saveButton = page.getByRole("button", { name: "Save changes" });
    await expect(saveButton).toBeVisible();
    await expect(page.getByText("Create menu item")).toBeVisible();
    const createButton = page.getByRole("button", { name: "Create item" });
    await expect(createButton).toBeVisible();
    await expect(page.getByText("Modifier assignments")).toBeVisible();
  });
});
