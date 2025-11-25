import {
  filterPaymentsSnapshot,
  filterReportingSnapshot,
  getPaymentsSnapshot,
  getReportingSnapshot
} from "@nova/sample-data";

describe("sample-data helpers", () => {
  it("filters payments by method + date range", () => {
    const snapshot = getPaymentsSnapshot();
    const firstPaymentDate = snapshot.payments[0]?.processedAt.slice(0, 10) ?? "2024-01-01";
    const filtered = filterPaymentsSnapshot(snapshot, {
      method: "card",
      startDate: firstPaymentDate,
      endDate: firstPaymentDate,
      limit: 1
    });
    expect(filtered.payments.length).toBeGreaterThan(0);
    expect(filtered.payments.length).toBeLessThanOrEqual(5);
    expect(filtered.payments.every((payment) => payment.method === "Card")).toBe(true);
    expect(filtered.summary.rangeTotal).toMatch(/^\$/);
  });

  it("builds reporting windows with category pivot", () => {
    const snapshot = getReportingSnapshot();
    const reporting = filterReportingSnapshot(snapshot, { windowDays: 30, category: "Coffee Bar" });
    expect(reporting.revenueSeries).toHaveLength(30);
    expect(reporting.ticketSeries).toHaveLength(30);
    expect(reporting.categoryOptions).toContain("Coffee Bar");
    expect(reporting.topCategories.every((category) => category.category === "Coffee Bar")).toBe(true);
  });

  it("filters reporting snapshot by location id", () => {
    const snapshot = getReportingSnapshot();
    const reporting = filterReportingSnapshot(snapshot, {
      windowDays: 7,
      locationId: "managed-sample"
    });
    expect(reporting.topCategories[0]?.revenue).toBe("$7,820");
    expect(reporting.revenueSeries).toHaveLength(7);
  });
});
