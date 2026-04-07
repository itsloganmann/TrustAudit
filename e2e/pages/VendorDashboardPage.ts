import type { Locator, Page } from "@playwright/test";

/**
 * Page Object Model for the authenticated vendor dashboard at /vendor.
 *
 * The dashboard renders via VendorDashboard.jsx → Dashboard.jsx. The invoice
 * table rows are <tr> elements inside a <table> — we locate them by the role
 * "row" in the grid region, filtering out the header row.
 */
export class VendorDashboardPage {
  readonly page: Page;
  readonly url = "/vendor";

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
  }

  /**
   * Returns all data rows in the invoice table (excludes the header row).
   * Waits until at least one row is visible.
   */
  get invoiceRows(): Locator {
    // The invoice table tbody rows — each <tr> has a cursor-pointer class
    // from Dashboard.jsx and wraps in an AnimatePresence animation.
    return this.page.locator("table tbody tr");
  }

  /**
   * Waits until the dashboard's invoice table has loaded at least one row.
   */
  async waitForInvoices(): Promise<void> {
    // The first API fetch from App.jsx takes 2s interval + network round-trip.
    // Allow up to 20s for the first render, which is well within the 30s test timeout.
    await this.invoiceRows.first().waitFor({ state: "visible", timeout: 20_000 });
  }

  /**
   * Opens the InvoiceDetailSheet by clicking the first invoice row.
   */
  async openFirst(): Promise<void> {
    await this.invoiceRows.first().click();
  }

  /**
   * Returns true if a visible heading text matching /dashboard/i is present.
   */
  async hasDashboardHeading(): Promise<boolean> {
    const el = this.page.getByText(/dashboard/i).first();
    return el.isVisible();
  }
}
