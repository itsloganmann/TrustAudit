import type { Page } from "@playwright/test";

/**
 * Page Object Model for the public /verify/:id page.
 *
 * This page is backed by VerificationPage.jsx which calls
 * GET /api/public/verify/{id} (or GET /api/verify/{id}) and renders
 * a zero-PII verification card. The backend only returns 200 for
 * invoices in VERIFIED or SUBMITTED_TO_GOV state.
 */
export class VerifyPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigates to /verify/{id}.
   * If the router doesn't mount /verify/:id yet (W10 not merged), the
   * catch-all will redirect to "/" — callers should probe the URL after goto.
   */
  async goto(id: number | string): Promise<void> {
    await this.page.goto(`/verify/${id}`);
    // Wait for the page to settle — either the verification card or the
    // spinner, then the card. Give it up to 10s.
    await this.page
      .locator("main")
      .waitFor({ state: "visible", timeout: 10_000 });
  }

  /**
   * Returns the full visible text of the page body.
   * Used to assert absence of PII strings.
   */
  async bodyText(): Promise<string> {
    return this.page.locator("body").innerText();
  }

  /**
   * Returns true if the verification route is mounted (not redirected to /).
   * If the router catch-all fired, we land on "/" and the URL changes.
   */
  async isRouteMounted(): Promise<boolean> {
    return this.page.url().includes("/verify/");
  }

  /**
   * Returns true if the verification card shows a "verified" state.
   * Checks for the ShieldCheck icon + "Document Verified" heading.
   */
  async isVerified(): Promise<boolean> {
    const heading = this.page.getByText(/document verified/i);
    return heading.isVisible();
  }

  /**
   * Returns true if the page shows a "Cannot verify" or "not found" error.
   */
  async isNotFound(): Promise<boolean> {
    const el = this.page.getByText(/cannot verify|not found|invalid|expired/i);
    return el.isVisible();
  }
}
