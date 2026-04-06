import { expect, test } from "@playwright/test";

/**
 * Smoke tests against the deployed FastAPI bundle.
 *
 * Goals:
 *   1. /health responds with {status:"healthy"}
 *   2. /api/invoices and /api/stats return live data
 *   3. The root document loads the React bundle (index.html + /assets/*.js)
 *   4. Best-effort: /help/demo and /live render (these depend on the
 *      frontend router which is owned by W7; if the router is not yet
 *      wired the catch-all serves index.html, so we still assert the
 *      bundle loaded).
 */

test.describe("smoke -- backend health", () => {
  test("/health returns healthy", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "healthy" });
  });

  test("/api/invoices returns the seeded fixture set", async ({ request }) => {
    const response = await request.get("/api/invoices");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(50);
    expect(body[0]).toHaveProperty("vendor_name");
    expect(body[0]).toHaveProperty("invoice_amount");
    expect(body[0]).toHaveProperty("status");
  });

  test("/api/stats has the dashboard fields", async ({ request }) => {
    const response = await request.get("/api/stats");
    expect(response.status()).toBe(200);
    const body = await response.json();
    for (const key of [
      "total_invoices",
      "verified_count",
      "critical_count",
      "liability_saved",
      "total_at_risk",
      "compliance_rate",
    ]) {
      expect(body).toHaveProperty(key);
    }
    expect(body.total_invoices).toBe(50);
  });

  test("/api/webhook/whatsapp/health surfaces all providers", async ({ request }) => {
    const response = await request.get("/api/webhook/whatsapp/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("active_provider");
    expect(body).toHaveProperty("providers");
    for (const provider of ["mock", "twilio", "baileys"]) {
      expect(body.providers).toHaveProperty(provider);
      expect(body.providers[provider]).toHaveProperty("status");
    }
  });

  test("/api/demo/health returns healthy + active_sessions", async ({ request }) => {
    const response = await request.get("/api/demo/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.healthy).toBe(true);
    expect(body).toHaveProperty("active_sessions");
  });
});

test.describe("smoke -- React bundle", () => {
  test("/ loads the React bundle and reaches an interactive state", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);

    // The bundle's index.html mounts a React tree on #root.
    await expect(page.locator("#root")).toBeAttached();

    // Wait for the network to settle so the bundle had a chance to
    // hydrate (TrustAudit is a SPA -- React mounts after JS executes).
    await page.waitForLoadState("networkidle");

    // The bundle either renders the legacy dashboard (which always
    // shows the "TrustAudit" wordmark in the header) or the future
    // landing page (which also shows the brand). Either passes.
    await expect(page.getByText(/TrustAudit/i).first()).toBeVisible();
  });

  test("/help/demo serves the bundle (frontend router resolves it client-side)", async ({
    page,
  }) => {
    // The FastAPI catch-all returns index.html for any non-asset path,
    // so this should always 200 even before W7 mounts the route.
    const response = await page.goto("/help/demo");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("#root")).toBeAttached();
  });

  test("/live serves the bundle (frontend router resolves it client-side)", async ({
    page,
  }) => {
    const response = await page.goto("/live");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("#root")).toBeAttached();
  });
});
