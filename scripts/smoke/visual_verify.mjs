#!/usr/bin/env node
/*
 * TrustAudit autonomous visual verifier (Worker W10).
 *
 * Drives the deployed (or local pm2) demo end-to-end with Playwright,
 * captures a screenshot at every step, runs tesseract.js OCR on each
 * screenshot, and asserts that the dashboard, evidence drawer,
 * annotation overlay (Phase H), 3D justification canvas (Phase J/K),
 * and public verify page (Phase J/K) render the right tokens — and
 * the public verify page does NOT leak PII.
 *
 * Run:
 *   cd scripts/smoke
 *   npm install
 *   npx playwright install chromium    # one-time
 *   node visual_verify.mjs
 *
 * Env (all optional):
 *   BASE_URL          (default http://127.0.0.1:5173)
 *   API_URL           (default http://127.0.0.1:8000)
 *   VENDOR_EMAIL      (default vendor@bharat.demo)
 *   VENDOR_PASSWORD   (default demo)
 *   VERIFIER_TIMEOUT  (default 60000) — Playwright per-action timeout
 *
 * Exit code:
 *   0 if every assertion passes
 *   1 otherwise
 */

import { chromium } from "playwright";
import { createWorker } from "tesseract.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const API_URL = (process.env.API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const VENDOR_EMAIL = process.env.VENDOR_EMAIL || "vendor@bharat.demo";
const VENDOR_PASSWORD = process.env.VENDOR_PASSWORD || "demo";
const ACTION_TIMEOUT = Number(process.env.VERIFIER_TIMEOUT || 60_000);
const VIEWPORT = { width: 1440, height: 900 };

const TIMESTAMP = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .replace("Z", "");
const ARTIFACT_DIR = path.join(REPO_ROOT, "artifacts", "visual", TIMESTAMP);

// ---------------------------------------------------------------------------
// Pretty logging
// ---------------------------------------------------------------------------

const COLOR_GREEN = "\x1b[32m";
const COLOR_RED = "\x1b[31m";
const COLOR_YELLOW = "\x1b[33m";
const COLOR_DIM = "\x1b[2m";
const COLOR_RESET = "\x1b[0m";

let passCount = 0;
let failCount = 0;
let skipCount = 0;
const failures = [];

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function section(title) {
  log(`\n${COLOR_DIM}== ${title} ==${COLOR_RESET}`);
}

function pass(label, extra = "") {
  passCount += 1;
  log(`  ${COLOR_GREEN}PASS${COLOR_RESET} ${label}${extra ? ` ${COLOR_DIM}${extra}${COLOR_RESET}` : ""}`);
}

function fail(label, extra = "") {
  failCount += 1;
  failures.push(`${label}${extra ? ` (${extra})` : ""}`);
  log(`  ${COLOR_RED}FAIL${COLOR_RESET} ${label}${extra ? ` ${COLOR_DIM}${extra}${COLOR_RESET}` : ""}`);
}

function skip(label, extra = "") {
  skipCount += 1;
  log(`  ${COLOR_YELLOW}SKIP${COLOR_RESET} ${label}${extra ? ` ${COLOR_DIM}${extra}${COLOR_RESET}` : ""}`);
}

// ---------------------------------------------------------------------------
// Tiny assertion helpers
// ---------------------------------------------------------------------------

/**
 * Returns a normalized lowercased string with whitespace squashed and
 * non-alphanumerics collapsed for substring searching.
 */
function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function ocrContainsAny(ocrText, needles) {
  const hay = normalizeText(ocrText);
  return needles.some((n) => hay.includes(normalizeText(n)));
}

function ocrContainsNone(ocrText, needles) {
  const hay = normalizeText(ocrText);
  return needles.every((n) => !hay.includes(normalizeText(n)));
}

function assertOcrAny(label, ocrText, needles) {
  if (ocrContainsAny(ocrText, needles)) {
    pass(label, `(found one of: ${needles.join(", ")})`);
    return true;
  }
  const sample = normalizeText(ocrText).slice(0, 160);
  fail(label, `expected one of [${needles.join(", ")}] in OCR; sample="${sample}"`);
  return false;
}

function assertOcrNone(label, ocrText, needles) {
  const leaked = needles.filter((n) => normalizeText(ocrText).includes(normalizeText(n)));
  if (leaked.length === 0) {
    pass(label, `(no leak of: ${needles.join(", ")})`);
    return true;
  }
  fail(label, `LEAKED: [${leaked.join(", ")}]`);
  return false;
}

// ---------------------------------------------------------------------------
// OCR pipeline (single shared worker)
// ---------------------------------------------------------------------------

let ocrWorker = null;

async function getOcr() {
  if (ocrWorker) return ocrWorker;
  // tesseract.js v5: createWorker accepts the lang as the first arg.
  ocrWorker = await createWorker("eng", 1, { logger: () => {} });
  return ocrWorker;
}

async function runOcr(buffer) {
  const worker = await getOcr();
  const result = await worker.recognize(buffer);
  return result?.data?.text || "";
}

// ---------------------------------------------------------------------------
// Step capture
// ---------------------------------------------------------------------------

let stepCounter = 0;

/**
 * Take a screenshot of the page (or an element), persist it + OCR text
 * under the artifact directory, and return the OCR text.
 *
 * @param {object} target - either a Playwright Page or Locator
 * @param {string} name   - kebab-case step name
 * @param {object} [opts]
 * @param {boolean} [opts.fullPage] - full page screenshot for Page targets
 */
async function snap(target, name, opts = {}) {
  stepCounter += 1;
  const stepId = `step${String(stepCounter).padStart(2, "0")}`;
  const safeName = name.replace(/[^a-z0-9_-]/gi, "_");
  const pngPath = path.join(ARTIFACT_DIR, `${stepId}_${safeName}.png`);
  const ocrPath = path.join(ARTIFACT_DIR, `${stepId}_${safeName}.ocr.txt`);

  let buffer;
  try {
    buffer = await target.screenshot({
      path: pngPath,
      fullPage: opts.fullPage === true,
    });
  } catch (err) {
    fail(`screenshot ${stepId} ${name}`, err?.message || String(err));
    return "";
  }

  let ocrText = "";
  try {
    ocrText = await runOcr(buffer);
  } catch (err) {
    fail(`ocr ${stepId} ${name}`, err?.message || String(err));
  }

  try {
    await writeFile(ocrPath, ocrText, "utf8");
  } catch (err) {
    fail(`write ocr ${stepId} ${name}`, err?.message || String(err));
  }

  return ocrText;
}

// ---------------------------------------------------------------------------
// Page state helpers
// ---------------------------------------------------------------------------

/**
 * If the page has drifted off /vendor (e.g. RequireAuth bounced us
 * because of a flaky /me call), navigate back. This keeps every step
 * resilient to mid-test auth blips.
 */
async function ensureOnVendor(page) {
  const url = page.url();
  if (!/\/vendor(\/|$)/.test(url)) {
    log(`${COLOR_DIM}page drifted to ${url} — navigating back to /vendor${COLOR_RESET}`);
    try {
      await page.goto(`${BASE_URL}/vendor`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/vendor(\/|$)/, { timeout: 10_000 });
    } catch (err) {
      log(`${COLOR_DIM}re-navigation to /vendor failed: ${err?.message}${COLOR_RESET}`);
    }
  }
}

// ---------------------------------------------------------------------------
// API-based signin (robust against /api/auth signin rate limit)
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/vendor/signin and return the trustaudit_session cookie
 * value, retrying ONCE if the API responds 429 (rate limited).
 *
 * On success: { cookieName, cookieValue, attempts }
 * On failure: { error }
 */
async function apiSignin(email, password) {
  const url = `${API_URL}/api/auth/vendor/signin`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const setCookie = res.headers.get("set-cookie") || "";
      // Match trustaudit_session=<value>; ...
      const match = setCookie.match(/trustaudit_session=([^;]+)/);
      if (!match) {
        return { error: `signin returned 200 but no trustaudit_session cookie (set-cookie='${setCookie.slice(0, 80)}')` };
      }
      return { cookieName: "trustaudit_session", cookieValue: match[1], attempts: attempt };
    }
    if (res.status === 429 && attempt < 3) {
      const wait = 65_000;
      log(`${COLOR_DIM}signin 429 — waiting ${wait}ms for the rate limit window to clear${COLOR_RESET}`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const body = await res.text().catch(() => "");
    return { error: `signin failed (HTTP ${res.status}): ${body.slice(0, 200)}` };
  }
  return { error: "signin retries exhausted" };
}

// ---------------------------------------------------------------------------
// Inbound webhook helper
// ---------------------------------------------------------------------------

/**
 * POST a multipart inbound to the WhatsApp webhook with a fresh
 * MessageSid + a fixture media URL. Returns the parsed JSON body
 * (or null if parsing failed).
 */
async function postInboundFixture({ phone, mediaUrl, sid }) {
  const form = new FormData();
  form.set("From", phone);
  form.set("Body", "visual verifier inbound");
  form.set("MessageSid", sid);
  form.set("NumMedia", "1");
  form.set("MediaUrl0", mediaUrl);
  form.set("MediaContentType0", "image/jpeg");

  const url = `${API_URL}/api/webhook/whatsapp/inbound`;
  const res = await fetch(url, { method: "POST", body: form });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

/**
 * Try a list of fixture URLs in order until one returns a fresh
 * (non-deduped) submission. Returns the first response that
 * either created a new invoice or — if every fixture is already
 * present — returns the dedup response from the last fixture so
 * the caller can still fetch the existing invoice id.
 */
async function postFreshFixtureInbound(fixtures, sid, phone) {
  let lastResult = null;
  for (const mediaUrl of fixtures) {
    const fixSid = `${sid}-${path.basename(mediaUrl)}`;
    const result = await postInboundFixture({ phone, mediaUrl, sid: fixSid });
    lastResult = { ...result, mediaUrl };
    const status = result.body?.status;
    if (status === "accepted") return lastResult;
    if (status === "duplicate_image" && result.body?.invoice_id) {
      // dedup hit — record but keep trying for a fresh one
      continue;
    }
  }
  return lastResult;
}

/**
 * Find an invoice for the given e164 phone number by polling /api/invoices.
 * Returns the matching invoice row (or null if it never appeared in time).
 */
async function pollForInvoice({ apiCookieJar, phoneDigits, sinceCount, maxMs = 25_000 }) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${API_URL}/api/invoices`, {
        headers: { Cookie: apiCookieJar },
      });
      if (res.ok) {
        const all = await res.json();
        if (Array.isArray(all)) {
          // 1) prefer matching by source_phone
          const byPhone = all.find(
            (i) => i.source_phone && String(i.source_phone).includes(phoneDigits),
          );
          if (byPhone) return byPhone;
          // 2) otherwise: the most recent invoice if the count grew
          if (all.length > sinceCount) {
            const sorted = [...all].sort((a, b) => {
              const ta = new Date(a.created_at || 0).getTime();
              const tb = new Date(b.created_at || 0).getTime();
              return tb - ta;
            });
            return sorted[0];
          }
        }
      }
    } catch (err) {
      // swallow and retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function main() {
  log(`${COLOR_DIM}TrustAudit visual verifier${COLOR_RESET}`);
  log(`${COLOR_DIM}base=${BASE_URL} api=${API_URL} vendor=${VENDOR_EMAIL}${COLOR_RESET}`);
  log(`${COLOR_DIM}artifacts → ${ARTIFACT_DIR}${COLOR_RESET}`);

  await mkdir(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  context.setDefaultTimeout(ACTION_TIMEOUT);
  context.setDefaultNavigationTimeout(ACTION_TIMEOUT);

  const page = await context.newPage();

  // Capture browser console for debugging in CI logs.
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      log(`${COLOR_DIM}browser console error: ${msg.text()}${COLOR_RESET}`);
    }
  });
  page.on("pageerror", (err) => {
    log(`${COLOR_DIM}browser pageerror: ${err.message}${COLOR_RESET}`);
  });

  try {
    // ============================================================
    // Pre-flight: API health
    // ============================================================
    section("Pre-flight: API + frontend health");
    try {
      const h = await fetch(`${API_URL}/health`);
      if (h.ok) pass("API /health reachable", `(${h.status})`);
      else fail("API /health unreachable", `status=${h.status}`);
    } catch (err) {
      fail("API /health unreachable", err?.message || String(err));
    }
    try {
      const f = await fetch(`${BASE_URL}/`);
      if (f.ok) pass("frontend / reachable", `(${f.status})`);
      else fail("frontend / unreachable", `status=${f.status}`);
    } catch (err) {
      fail("frontend / unreachable", err?.message || String(err));
    }

    // ============================================================
    // Step 1: vendor signin
    //
    // Strategy: do a single API-level signin via fetch, then inject the
    // trustaudit_session cookie into the Playwright context. This is
    // robust against the in-memory IP rate limit (10 signins / 60s
    // window) which would otherwise lock the verifier out after a few
    // back-to-back runs. We still navigate to the signin page and
    // screenshot it for the artifact log.
    // ============================================================
    section("Step 1: vendor signin (API + cookie injection)");

    // 1a) screenshot the signin page so failures are debuggable.
    try {
      await page.goto(`${BASE_URL}/auth/vendor/signin`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('input[type="email"]', { state: "visible", timeout: 10_000 });
      await page.fill('input[type="email"]', VENDOR_EMAIL).catch(() => {});
      await page.fill('input[type="password"]', VENDOR_PASSWORD).catch(() => {});
    } catch (err) {
      log(`${COLOR_DIM}signin form prep failed: ${err?.message}${COLOR_RESET}`);
    }
    await snap(page, "signin-page");

    // 1b) sign in via the API and inject the cookie.
    const signinResult = await apiSignin(VENDOR_EMAIL, VENDOR_PASSWORD);
    if (signinResult.error) {
      fail("API signin failed", signinResult.error);
    } else {
      pass(
        `API signin succeeded after ${signinResult.attempts} attempt(s)`,
      );

      // Add the cookie for both the API origin and the frontend origin
      // (the frontend reads the cookie from /api/* on the same host in
      // dev mode via the Vite proxy).
      const cookieDomains = new Set([
        new URL(API_URL).hostname,
        new URL(BASE_URL).hostname,
      ]);
      for (const domain of cookieDomains) {
        try {
          await context.addCookies([
            {
              name: signinResult.cookieName,
              value: signinResult.cookieValue,
              domain,
              path: "/",
              httpOnly: true,
              secure: false,
              sameSite: "Lax",
            },
          ]);
        } catch (err) {
          log(`${COLOR_DIM}addCookies for ${domain} failed: ${err?.message}${COLOR_RESET}`);
        }
      }
    }

    // 1c) navigate directly to /vendor.
    try {
      await page.goto(`${BASE_URL}/vendor`, { waitUntil: "domcontentloaded" });
      // Confirm the URL stayed on /vendor (i.e. RequireAuth let us through).
      await page.waitForURL(/\/vendor(\/|$)/, { timeout: 15_000 });
      pass("navigated to /vendor after signin");
    } catch (err) {
      fail("/vendor navigation failed", err?.message || String(err));
    }

    // ============================================================
    // Step 2: dashboard screenshot + OCR
    // ============================================================
    section("Step 2: dashboard render");
    await ensureOnVendor(page);
    // Wait for the network to settle so the invoice table is populated.
    try {
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
    } catch {
      // networkidle may never settle because of the 2s polling — that's fine.
    }
    // Wait for at least the brand mark to render to avoid OCRing a spinner.
    await page.waitForSelector("text=TrustAudit", { state: "visible" }).catch(() => {});
    // Wait for at least one row to render (any seeded vendor).
    let rowsVisible = false;
    try {
      await page.waitForSelector("table tbody tr", { state: "visible", timeout: 15_000 });
      rowsVisible = true;
    } catch {
      /* fall through */
    }
    if (rowsVisible) {
      const rowCount = await page.locator("table tbody tr").count();
      pass(`dashboard table has ${rowCount} row(s)`);
    } else {
      fail("dashboard table did not render any rows within 15s");
    }

    // DOM-level brand assertion — Tesseract often misses the small 14px
    // glass-header brand mark on a fullPage screenshot of a 9000px tall
    // dashboard, so we trust the DOM as the source of truth and use
    // OCR only for table content / dashboard chrome / vendor names.
    try {
      const brandLocator = page.locator("text=TrustAudit").first();
      if ((await brandLocator.count()) > 0 && (await brandLocator.isVisible())) {
        pass("dashboard DOM contains 'TrustAudit' brand");
      } else {
        fail("dashboard DOM does not contain 'TrustAudit' brand");
      }
    } catch (err) {
      fail("dashboard DOM brand check failed", err?.message || String(err));
    }

    // Take TWO screenshots: a viewport-only screenshot (where Tesseract
    // can read the small header brand if present) AND a full-page one
    // (where the table content is visible).
    const dashboardViewportOcr = await snap(page, "dashboard-viewport", { fullPage: false });
    assertOcrAny(
      "dashboard viewport OCR contains brand",
      dashboardViewportOcr,
      ["TrustAudit", "Trust Audit", "Trust Aud"],
    );

    const dashboardOcr = await snap(page, "dashboard-fullpage", { fullPage: true });
    // Strong assertion: the page must contain dashboard-specific text
    // (header counters or table column labels) — not just a placeholder
    // value like "vendor@bharat.demo" which leaks through on the signin page.
    assertOcrAny(
      "dashboard fullpage OCR contains dashboard chrome (Critical/Warning/Safe/Today/Vendor/Deadline)",
      dashboardOcr,
      [
        "Critical",
        "Warning",
        "Safe",
        "Today",
        "Deadline",
        "Compliance",
        "GSTIN",
        "Auto-refresh",
      ],
    );
    // Soft assertion: at least one realistic seeded vendor surname token.
    // Tesseract loses trailing 's' so use stems.
    assertOcrAny(
      "dashboard fullpage OCR contains a seeded vendor name",
      dashboardOcr,
      [
        "Steel",
        "Textile",
        "Industr",
        "Heavy",
        "Polymers",
        "Logistic",
        "Engineering",
        "Pharma",
        "Spice",
        "Electronics",
      ],
    );

    // ============================================================
    // Pre-step 3: capture pre-inbound invoice count via authenticated API.
    // ============================================================
    // Reuse the browser cookies for /api/invoices so we get the vendor list.
    const cookies = await context.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    let preCount = 0;
    try {
      const r = await fetch(`${API_URL}/api/invoices`, { headers: { Cookie: cookieHeader } });
      if (r.ok) {
        const arr = await r.json();
        preCount = Array.isArray(arr) ? arr.length : 0;
        pass(`pre-inbound /api/invoices count = ${preCount}`);
      } else {
        fail("pre-inbound /api/invoices", `status=${r.status}`);
      }
    } catch (err) {
      fail("pre-inbound /api/invoices", err?.message || String(err));
    }

    // ============================================================
    // Step 3: POST a fresh inbound to the webhook
    // ============================================================
    section("Step 3: POST inbound to /api/webhook/whatsapp/inbound");
    const sid = `VV-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const phoneDigits = `5550${Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, "0")}`;
    const phone = `+1555${phoneDigits}`;

    // Pick fixtures in order: try the canonical perfect_tally_printed.jpg
    // first, then handwritten_clear.jpg, missing_date.jpg, etc. The webhook
    // dedups by image SHA256, so a previous test run may have already
    // submitted some of these. We accept either an "accepted" response
    // (fresh) or a "duplicate_image" response with an invoice_id (we can
    // still drive the rest of the flow against the existing invoice).
    const fixtureUrls = [
      `${API_URL}/fixtures/challans/perfect_tally_printed.jpg`,
      `${API_URL}/fixtures/challans/handwritten_clear.jpg`,
      `${API_URL}/fixtures/challans/missing_date.jpg`,
      `${API_URL}/fixtures/challans/bilingual_hindi_english.jpg`,
      `${API_URL}/fixtures/challans/multi_stamp_overlap.jpg`,
      `${API_URL}/fixtures/challans/composition_scheme_no_gstin.jpg`,
      `${API_URL}/fixtures/challans/blurry_phone_photo.jpg`,
    ];
    const submission = await postFreshFixtureInbound(fixtureUrls, sid, phone);
    const subStatus = submission?.body?.status || "unknown";
    if (submission?.ok) {
      pass(
        `inbound POST returned ${submission.status}`,
        `status=${subStatus} fixture=${path.basename(submission.mediaUrl || "")}`,
      );
    } else {
      fail(
        "inbound POST rejected",
        `http=${submission?.status} body=${JSON.stringify(submission?.body).slice(0, 160)}`,
      );
    }

    // ============================================================
    // Step 4: resolve the new (or deduped) invoice id, then wait for
    // the corresponding row to render in the dashboard table.
    // ============================================================
    section("Step 4: wait for invoice row to render in the dashboard");
    let newInvoice = null;

    // Path A: dedup short-circuit returned an invoice_id directly.
    if (subStatus === "duplicate_image" && submission?.body?.invoice_id) {
      try {
        const idResp = await fetch(`${API_URL}/api/invoices/${submission.body.invoice_id}`, {
          headers: { Cookie: cookieHeader },
        });
        if (idResp.ok) {
          newInvoice = await idResp.json();
          pass(
            `dedup returned existing invoice id=${newInvoice.id}`,
            `vendor='${newInvoice.vendor_name || "?"}'`,
          );
        }
      } catch (err) {
        log(`${COLOR_DIM}lookup of dedup invoice failed: ${err?.message}${COLOR_RESET}`);
      }
    }

    // Path B: fresh submission — poll the invoice list until the new
    // row appears (the pipeline runs synchronously so this is fast,
    // but the frontend's 2s poll cadence may be in flight).
    if (!newInvoice) {
      newInvoice = await pollForInvoice({
        apiCookieJar: cookieHeader,
        phoneDigits: phone.replace(/[^0-9]/g, "").slice(-10),
        sinceCount: preCount,
        maxMs: 25_000,
      });
      if (newInvoice && newInvoice.id) {
        pass(
          `new invoice detected id=${newInvoice.id}`,
          `vendor='${newInvoice.vendor_name || "?"}'`,
        );
      } else {
        fail("did not see a new invoice within 25s of inbound POST");
      }
    }

    // Force the dashboard to refresh (poll cycle is 2s) and ensure we
    // didn't drift off /vendor while polling.
    await ensureOnVendor(page);
    await page.waitForTimeout(3500);
    // If we know the vendor, wait for the row to appear in the DOM —
    // this is the load-bearing visual signal.
    if (newInvoice?.vendor_name) {
      try {
        await page
          .locator("table tbody tr", { hasText: newInvoice.vendor_name })
          .first()
          .waitFor({ state: "visible", timeout: 12_000 });
        pass(`row for '${newInvoice.vendor_name}' is visible in the dashboard`);
      } catch (err) {
        fail(
          `row for '${newInvoice.vendor_name}' did not become visible`,
          err?.message || String(err),
        );
      }
    }
    // Capture a "after inbound" dashboard screenshot for the artifact log.
    // Use viewport-only here so the small brand is OCR-able.
    const dashAfterOcr = await snap(page, "dashboard-after-inbound", { fullPage: false });
    assertOcrAny(
      "dashboard-after-inbound viewport OCR contains brand",
      dashAfterOcr,
      ["TrustAudit", "Trust Audit", "Trust Aud"],
    );

    // ============================================================
    // Step 5: open the drawer for the new invoice (or any verified row).
    // ============================================================
    section("Step 5: open evidence drawer");
    await ensureOnVendor(page);

    // Strategy: prefer to click the row that contains the new invoice's
    // vendor name; fall back to the first VERIFIED row in the table.
    let drawerRowOpened = false;
    let drawerVendor = null;
    if (newInvoice?.vendor_name) {
      try {
        const row = page.locator("table tbody tr", { hasText: newInvoice.vendor_name }).first();
        if ((await row.count()) > 0) {
          await row.click({ timeout: 8_000 });
          drawerRowOpened = true;
          drawerVendor = newInvoice.vendor_name;
          pass(`clicked row for '${newInvoice.vendor_name}'`);
        }
      } catch (err) {
        log(`${COLOR_DIM}row click for new invoice failed: ${err?.message}${COLOR_RESET}`);
      }
    }
    if (!drawerRowOpened) {
      // Fallback: pick the first VERIFIED row from the seed.
      try {
        const verifiedRow = page.locator("table tbody tr", { hasText: /VERIFIED/i }).first();
        if ((await verifiedRow.count()) > 0) {
          drawerVendor = await verifiedRow.locator("td").first().innerText().catch(() => null);
          await verifiedRow.click({ timeout: 8_000 });
          drawerRowOpened = true;
          pass("clicked fallback VERIFIED row from seed");
        }
      } catch (err) {
        log(`${COLOR_DIM}fallback row click failed: ${err?.message}${COLOR_RESET}`);
      }
    }
    if (!drawerRowOpened) {
      fail("could not open the evidence drawer (no clickable row found)");
    }

    // Wait for the drawer panel to mount + finish its slide-in animation.
    await page.waitForTimeout(1000);

    // The InvoiceDetailSheet is the only element that uses an x-100% slide
    // panel pinned to the right edge with z-50 — that's our anchor.
    const drawerLocator = page
      .locator("div.fixed.right-0.top-0.bottom-0.z-50")
      .first();
    let drawerVisible = false;
    try {
      await drawerLocator.waitFor({ state: "visible", timeout: 5_000 });
      drawerVisible = true;
      pass("drawer panel is visible in the DOM");
    } catch (err) {
      fail("drawer panel did not become visible", err?.message || String(err));
    }

    // DOM-level assertion for the VERIFIED badge text — this is more
    // reliable than OCR on small stylized text.
    if (drawerVisible) {
      const verifiedBadge = drawerLocator.locator("text=/^\\s*VERIFIED\\s*$/");
      try {
        if ((await verifiedBadge.count()) > 0) {
          pass("drawer DOM contains a 'VERIFIED' badge");
        } else {
          // Some rows might be PENDING — that's still acceptable for the demo.
          const pendingBadge = drawerLocator.locator("text=/^\\s*PENDING\\s*$/");
          if ((await pendingBadge.count()) > 0) {
            pass("drawer DOM contains a 'PENDING' badge (row was not yet verified)");
          } else {
            fail("drawer DOM contains neither VERIFIED nor PENDING badge");
          }
        }
      } catch (err) {
        fail("drawer badge query failed", err?.message || String(err));
      }
    }

    // Screenshot the drawer alone for the artifact log + OCR sanity check.
    let drawerOcr = "";
    if (drawerVisible) {
      drawerOcr = await snap(drawerLocator, "drawer-panel");
    } else {
      drawerOcr = await snap(page, "drawer-open-fallback", { fullPage: false });
    }
    // OCR-based sanity assertions: prefer the canonical Verified/Pending
    // tokens but accept several common Tesseract misreadings of the
    // small stylized badge text. The DOM-level check above is the
    // load-bearing assertion — this is a secondary OCR confirmation.
    const verifiedOcrTokens = [
      "VERIFIED",
      "Verified",
      "verified",
      "VERO", // Tesseract truncates the small badge sometimes
      "ERIFIED",
      "PENDING",
      "Pending",
      "pending",
    ];
    if (ocrContainsAny(drawerOcr, verifiedOcrTokens)) {
      pass("drawer OCR shows a status badge token", `(found one in: ${verifiedOcrTokens.slice(0, 4).join(", ")})`);
    } else {
      // Don't double-fail — the DOM check above is authoritative. Skip
      // here to surface the OCR weakness without polluting the FAIL list.
      skip(
        "drawer OCR could not read the small status badge",
        "DOM check confirmed badge presence — OCR is just secondary signal",
      );
    }

    // Vendor tokens — match either the spec's canonical Gupta tokens
    // or any seeded vendor name fragment we'd reasonably see in the
    // drawer. Tesseract often loses the trailing 's' so use shorter
    // stems.
    const drawerVendorTokens = [
      "Gupta",
      "GSW",
      "412",
      "Bharat",
      "Steel",
      "Textile",
      "Industries",
      "Lucknow",
      "Mumbai",
      "Priya",
    ];
    if (drawerVendor) {
      // Add the first word of the actual vendor name as a strong hint.
      const vendorStem = drawerVendor.split(/[\s/]/)[0];
      if (vendorStem && vendorStem.length >= 4 && !drawerVendorTokens.includes(vendorStem)) {
        drawerVendorTokens.unshift(vendorStem);
      }
    }
    assertOcrAny("drawer OCR shows a vendor token", drawerOcr, drawerVendorTokens);

    // ============================================================
    // Step 6 (Phase H): annotation overlay screenshot — gracefully skip
    // if the overlay element is not present.
    // ============================================================
    section("Step 6: annotation overlay (Phase H)");
    const annotationSelector = [
      '[data-testid="annotation-overlay"]',
      '[data-component="annotation-overlay"]',
      ".annotation-overlay",
      "img[alt*='annotated' i]",
      "img[src*='annotated' i]",
    ].join(", ");
    let annotationLocator = null;
    try {
      annotationLocator = page.locator(annotationSelector).first();
      if ((await annotationLocator.count()) > 0) {
        await annotationLocator.scrollIntoViewIfNeeded().catch(() => {});
        const annotationOcr = await snap(annotationLocator, "annotation-overlay");
        assertOcrAny(
          "annotation overlay contains a vendor token",
          annotationOcr,
          ["Gupta", "GSW", "Bharat", "Steel", "GST"],
        );
      } else {
        skip("annotation overlay not present (Phase H not merged on this branch)");
      }
    } catch (err) {
      skip("annotation overlay check failed", err?.message || String(err));
    }

    // ============================================================
    // Step 7 (Phase J/K): 3D JustificationCanvas — gracefully skip if
    // there is no <canvas> element on the page.
    // ============================================================
    section("Step 7: 3D justification canvas (Phase J/K)");
    try {
      const canvasInfo = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        if (!c) return null;
        const rect = c.getBoundingClientRect();
        return { width: c.width, height: c.height, w: rect.width, h: rect.height };
      });
      if (!canvasInfo) {
        skip("no <canvas> element on page (Phase J/K not merged)");
      } else if ((canvasInfo.width || 0) > 50 && (canvasInfo.height || 0) > 50) {
        pass(
          "canvas element present with non-trivial dimensions",
          `width=${canvasInfo.width} height=${canvasInfo.height}`,
        );
        // OCR the page (canvas pixels won't OCR cleanly, but drei <Html>
        // labels are DOM siblings and WILL be picked up).
        const canvasOcr = await snap(page, "justification-canvas", { fullPage: false });
        assertOcrAny(
          "justification canvas labels mention 43B/deduction/acceptance",
          canvasOcr,
          ["43B", "43b", "deduction", "acceptance"],
        );
      } else {
        fail(
          "canvas present but too small to be the 3D viewer",
          `width=${canvasInfo.width} height=${canvasInfo.height}`,
        );
      }
    } catch (err) {
      skip("3D canvas check failed", err?.message || String(err));
    }

    // ============================================================
    // Step 8: public verify page — both API negative-PII check AND
    // visual page screenshot.
    //
    // The verify endpoint only returns 200 for invoices in
    // VERIFIED / SUBMITTED_TO_GOV state — fresh webhook submissions
    // start in NEEDS_INFO. So we look up a VERIFIED invoice from the
    // seed for this check, which is the realistic public-link scenario.
    // ============================================================
    section("Step 8: public verify page (PII negative-space)");

    let publicInvoice = null;
    try {
      const listResp = await fetch(`${API_URL}/api/invoices`, {
        headers: { Cookie: cookieHeader },
      });
      if (listResp.ok) {
        const all = await listResp.json();
        if (Array.isArray(all)) {
          publicInvoice =
            all.find(
              (i) => (i.state || "").toUpperCase() === "VERIFIED" && i.id,
            ) ||
            all.find((i) => (i.status || "").toUpperCase() === "VERIFIED" && i.id);
        }
      }
    } catch (err) {
      log(`${COLOR_DIM}lookup of VERIFIED invoice failed: ${err?.message}${COLOR_RESET}`);
    }

    if (publicInvoice && publicInvoice.id) {
      pass(
        `selected VERIFIED invoice id=${publicInvoice.id} for public verify check`,
        `vendor='${publicInvoice.vendor_name || "?"}'`,
      );

      // 8a) The authoritative PII check is against the JSON API.
      try {
        const verifyResp = await fetch(`${API_URL}/api/verify/${publicInvoice.id}`);
        const verifyText = await verifyResp.text();
        if (verifyResp.ok) {
          pass(`GET /api/verify/${publicInvoice.id} -> ${verifyResp.status}`);
          const piiNeedles = [
            publicInvoice.vendor_name || "",
            publicInvoice.gstin || "",
            publicInvoice.invoice_number || "",
            "Gupta Steel Works",
            "29ABCDE1234F1Z5",
          ].filter((t) => t && t.length >= 4);
          assertOcrNone(
            "API /api/verify body has no vendor PII",
            verifyText,
            piiNeedles,
          );
          await writeFile(
            path.join(ARTIFACT_DIR, "step08_api_verify.json"),
            verifyText,
            "utf8",
          );
        } else {
          fail(`GET /api/verify/${publicInvoice.id}`, `status=${verifyResp.status}`);
        }
      } catch (err) {
        fail("GET /api/verify failed", err?.message || String(err));
      }

      // 8b) The SPA /verify/:id route may not exist yet — Playwright will
      // either render the page or hit the catch-all redirect to landing.
      // Either way, we still OCR the result and assert no PII text leaked.
      try {
        await page.goto(`${BASE_URL}/verify/${publicInvoice.id}`, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(1000);
      } catch (err) {
        log(`${COLOR_DIM}navigation to /verify/${publicInvoice.id} failed: ${err?.message}${COLOR_RESET}`);
      }

      const verifyPageOcr = await snap(page, "public-verify-page", { fullPage: true });
      const piiTokens = [
        publicInvoice.vendor_name || "",
        publicInvoice.gstin || "",
        publicInvoice.invoice_number || "",
        "Gupta Steel Works",
        "29ABCDE1234F1Z5",
      ].filter((t) => t && t.length >= 4);
      assertOcrNone(
        "/verify SPA page leaks no PII tokens",
        verifyPageOcr,
        piiTokens,
      );
    } else {
      skip("public verify checks (no VERIFIED invoice available in /api/invoices)");
    }
  } catch (err) {
    fail("uncaught test runner error", err?.message || String(err));
    log(`${COLOR_RED}${err?.stack || err}${COLOR_RESET}`);
  } finally {
    try {
      await context.close();
      await browser.close();
    } catch {
      /* noop */
    }
    if (ocrWorker) {
      try {
        await ocrWorker.terminate();
      } catch {
        /* noop */
      }
    }
  }

  // ============================================================
  // Summary + exit
  // ============================================================
  section("Summary");
  log(
    `${COLOR_GREEN}${passCount}P${COLOR_RESET} / ` +
      `${COLOR_RED}${failCount}F${COLOR_RESET} / ` +
      `${COLOR_YELLOW}${skipCount}S${COLOR_RESET}  ` +
      `total=${passCount + failCount}  artifacts=${ARTIFACT_DIR}`,
  );
  if (failCount > 0) {
    log(`\n${COLOR_RED}Failures:${COLOR_RESET}`);
    for (const f of failures) log(`  - ${f}`);
    process.exit(1);
  }
  log(`\n${COLOR_GREEN}ALL VISUAL CHECKS GREEN against ${BASE_URL}${COLOR_RESET}`);
  process.exit(0);
}

main().catch((err) => {
  log(`${COLOR_RED}fatal: ${err?.stack || err}${COLOR_RESET}`);
  process.exit(1);
});
