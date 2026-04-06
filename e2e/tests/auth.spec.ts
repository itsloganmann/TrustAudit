import { expect, test } from "@playwright/test";

/**
 * Auth smoke tests.
 *
 * The vendor signin route is owned by W5/W6 and the frontend signin
 * pages are owned by W7. To stay decoupled from W7's still-in-flight
 * router work, we exercise the API directly via `request.post(...)`
 * and only verify that the bundle loads at the canonical /auth/* paths.
 */

const DEMO_VENDOR = {
  email: "vendor@bharat.demo",
  password: "demo",
};

test.describe("auth -- API contract", () => {
  test("POST /api/auth/vendor/signin succeeds with seeded demo creds", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/vendor/signin", {
      data: DEMO_VENDOR,
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.user.role).toBe("vendor");
    expect(body.user.email).toBe(DEMO_VENDOR.email);

    // Cookie jar should now have the session cookie.
    const cookies = await request.storageState();
    const cookieNames = cookies.cookies.map((c) => c.name);
    expect(cookieNames).toContain("trustaudit_session");
  });

  test("POST /api/auth/vendor/signin with bad password rejects", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/vendor/signin", {
      data: {
        email: DEMO_VENDOR.email,
        password: "wrong-password-on-purpose",
      },
    });
    expect(response.status()).toBe(401);
  });

  test("driver signin endpoint exists and rejects unknown email", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/driver/signin", {
      data: {
        email: "no-such-driver@example.invalid",
        password: "whatever",
      },
    });
    // Either 401 (invalid creds) or 403 (wrong role) -- both prove the
    // route is mounted and not 404.
    expect([401, 403]).toContain(response.status());
  });
});

test.describe("auth -- frontend pages", () => {
  test("/auth/vendor/signin serves the bundle", async ({ page }) => {
    const response = await page.goto("/auth/vendor/signin");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("#root")).toBeAttached();
  });

  test("/auth/driver/signin serves the bundle", async ({ page }) => {
    const response = await page.goto("/auth/driver/signin");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("#root")).toBeAttached();
  });
});
