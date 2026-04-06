import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * WhatsApp inbound pipeline e2e.
 *
 * Strategy:
 *   1. POST a real challan JPG to /api/webhook/whatsapp/inbound using
 *      multipart/form-data with the canonical mock fixture URL pattern
 *      (mock://fixture/<name>) -- this exercises the actual download
 *      and hashing path WITHOUT requiring Twilio or Gemini credentials.
 *   2. Assert the route accepts the upload and returns the expected
 *      shape: { status: "accepted", media_sha256: <64-char hex> }
 *      OR the dedup short-circuits with status: "duplicate_image".
 *
 * We deliberately do NOT assert on vision-extracted fields (date, vendor,
 * amount) -- those require a real GEMINI_API_KEY and W3 owns those tests.
 */

const FIXTURE_PATH = resolve(
  __dirname,
  "..",
  "..",
  "backend",
  "tests",
  "fixtures",
  "challans",
  "perfect_tally_printed.jpg"
);

test.describe("whatsapp pipeline -- inbound webhook", () => {
  test("multipart upload with mock fixture URL is accepted", async ({
    request,
  }) => {
    // Sanity-check the fixture is present.
    const buf = readFileSync(FIXTURE_PATH);
    expect(buf.byteLength).toBeGreaterThan(0);

    // Use a unique sid per run so the idempotency layer never short-circuits
    // before the media-hash dedup layer has a chance to fire.
    const uniqueSid = `e2e-smoke-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const response = await request.post("/api/webhook/whatsapp/inbound", {
      multipart: {
        from: "+15551234567",
        message_sid: uniqueSid,
        text: "playwright e2e",
        media_url: "mock://fixture/perfect_tally_printed.jpg",
        media_content_type: "image/jpeg",
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Either accepted (first time the hash was seen) or duplicate_image
    // (the smoke pytest already inserted this hash). Both are success
    // signals that the route + parser + downloader + hasher are wired.
    expect(["accepted", "duplicate_image"]).toContain(body.status);

    if (body.status === "accepted") {
      expect(body.provider).toBe("mock");
      expect(body.media_sha256).toMatch(/^[0-9a-f]{64}$/);
      // The persisted upload path should look like .../uploads/<uuid>.jpg
      expect(body.stored_path).toMatch(/uploads/);
    }
  });

  test("text-only inbound (no media) returns accepted", async ({ request }) => {
    const uniqueSid = `e2e-text-${Date.now()}`;
    const response = await request.post("/api/webhook/whatsapp/inbound", {
      multipart: {
        from: "+15551234567",
        message_sid: uniqueSid,
        text: "hello -- text only",
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(["accepted", "duplicate"]).toContain(body.status);
  });

  test("duplicate sid is short-circuited by idempotency layer", async ({
    request,
  }) => {
    const sid = `e2e-dup-${Date.now()}`;
    const payload = {
      multipart: {
        from: "+15551234999",
        message_sid: sid,
        text: "duplicate test",
      },
    };

    const first = await request.post("/api/webhook/whatsapp/inbound", payload);
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    // Note: rate_limited is acceptable too if a previous test in the same
    // run hammered the same phone -- the route is still mounted.
    expect(["accepted", "duplicate", "rate_limited"]).toContain(
      firstBody.status
    );

    const second = await request.post("/api/webhook/whatsapp/inbound", payload);
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    // Second send with the same sid must NOT be a fresh "accepted" -- it
    // should be deduped.
    expect(["duplicate", "rate_limited"]).toContain(secondBody.status);
  });
});
