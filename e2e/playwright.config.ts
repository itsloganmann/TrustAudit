import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for TrustAudit.
 *
 * Default behavior:
 *   * `webServer` boots the real FastAPI app on port 8000 from a fresh
 *     ../backend/venv. The server serves the built frontend bundle from
 *     ../frontend/dist (so you must run `npm run build` in ../frontend
 *     before invoking `npm test` here).
 *   * `baseURL` is `http://localhost:8000`.
 *
 * Override against a deployed environment:
 *   PLAYWRIGHT_BASE_URL=https://trustaudit.onrender.com npm test
 *
 * In that case the local webServer is skipped automatically (set
 * REUSE_REMOTE=1 to make it explicit).
 */

const PORT = Number(process.env.PORT ?? 8000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const IS_REMOTE = !!process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: IS_REMOTE
    ? undefined
    : {
        // Boot the real FastAPI app from the repo's backend venv. We use
        // the absolute path so the test can run from any cwd.
        command:
          "bash -lc 'cd ../backend && source venv/bin/activate && uvicorn app.main:app --host 127.0.0.1 --port 8000'",
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
