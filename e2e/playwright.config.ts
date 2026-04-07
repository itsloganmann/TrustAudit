import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for TrustAudit Phase-M critical journey tests.
 *
 * Targets the pm2-managed local dev stack by default:
 *   - Frontend: http://127.0.0.1:5173 (Vite dev server)
 *   - Backend:  http://127.0.0.1:8000 (FastAPI, proxied via Vite /api)
 *
 * Override against a remote environment:
 *   PLAYWRIGHT_BASE_URL=https://trustaudit-wxd7.onrender.com npx playwright test
 */

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // No webServer block — the pm2 dev stack is already running.
});
