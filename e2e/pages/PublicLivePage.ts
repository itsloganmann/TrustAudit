import type { Locator, Page } from "@playwright/test";

/**
 * Page Object Model for the public /live demo page.
 *
 * The page uses SSE (falling back to 2-second polling) to stream invoice
 * rows from /api/live/invoices?session=<id>. A fresh session id is generated
 * on first load and written to the URL as ?session=<hex6>.
 */
export class PublicLivePage {
  readonly page: Page;
  readonly url = "/live";

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    // Wait for React to mount (the table header is always rendered).
    await this.page.locator("table thead").waitFor({ state: "visible", timeout: 15_000 });
  }

  /**
   * Reads the session id currently shown in the URL query string.
   * Returns null if not yet written.
   */
  async sessionId(): Promise<string | null> {
    const url = new URL(this.page.url());
    return url.searchParams.get("session");
  }

  /**
   * Returns all table body rows in the live submissions table.
   */
  get tableRows(): Locator {
    return this.page.locator("table tbody tr");
  }

  /**
   * Waits until at least `minCount` rows appear in the live table.
   * Maximum wait is `timeoutMs` milliseconds (default 28s to stay under 30s).
   */
  async waitForRow(minCount = 1, timeoutMs = 28_000): Promise<void> {
    await this.page.waitForFunction(
      (min) => {
        const rows = document.querySelectorAll("table tbody tr");
        return rows.length >= min;
      },
      minCount,
      { timeout: timeoutMs }
    );
  }

  /**
   * Returns the text content of the "session:" chip shown in the header.
   * Falls back to the URL query param if the chip is not found.
   */
  async sessionChipText(): Promise<string> {
    const chip = this.page.locator("span.font-mono, code").filter({
      hasText: /session/i,
    });
    const count = await chip.count();
    if (count > 0) {
      return chip.first().innerText();
    }
    return (await this.sessionId()) ?? "";
  }

  /**
   * Clicks the "New session" button to mint a fresh session id.
   */
  async clickNewSession(): Promise<void> {
    await this.page.locator("button", { hasText: /new session/i }).click();
  }
}
