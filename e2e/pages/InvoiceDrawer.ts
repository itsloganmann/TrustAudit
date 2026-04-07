import type { Locator, Page } from "@playwright/test";

/**
 * Page Object Model for the InvoiceDetailSheet drawer.
 *
 * The drawer slides in from the right when an invoice row is clicked.
 * It is rendered as a fixed overlay by InvoiceDetailSheet.jsx and contains:
 *   - A mock WhatsApp chat pane (left)
 *   - Extracted invoice fields (right)
 *   - An optional annotated challan image (W6 — not yet shipped)
 *   - An optional JustificationCanvas (W5 — Three.js canvas)
 *
 * All W5/W6 assertions are guarded by DOM probes so they skip gracefully
 * when the features aren't merged yet.
 */
export class InvoiceDrawer {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Waits for the drawer to slide into view. The drawer has an X close button
   * and an overlay backdrop. We wait for the backdrop to be visible.
   */
  async waitForOpen(): Promise<void> {
    // The drawer renders as a fixed div with a backdrop + slide panel.
    // We look for the close button (X) which is always present when open.
    await this.page
      .locator('button[aria-label="Close"], button:has(svg[data-lucide="x"]), button:has(.lucide-x)')
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
  }

  /**
   * Returns true if the drawer overlay is currently visible.
   */
  async isOpen(): Promise<boolean> {
    // The backdrop is a fixed full-screen div rendered by AnimatePresence.
    // InvoiceDetailSheet uses a fixed div with a semi-transparent background.
    const backdrop = this.page.locator("div.fixed").filter({
      hasText: /vendor|invoice|extracted|whatsapp/i,
    });
    return backdrop.isVisible();
  }

  /**
   * Returns the annotated challan image locator (W6 feature).
   * Callers should probe isAnnotationImagePresent() before asserting on it.
   */
  get annotationImage(): Locator {
    // W6 renders an <img> with a src pointing to /api/invoices/{id}/annotation
    // or a data URL. We probe by src pattern.
    return this.page.locator('img[src*="annotation"], img[src*="annotated"], img[alt*="annotated"], img[alt*="challan"]');
  }

  /**
   * Returns true if the annotated image element exists in the DOM.
   * Used to guard W6 assertions.
   */
  async isAnnotationImagePresent(): Promise<boolean> {
    return this.annotationImage.count().then((c) => c > 0);
  }

  /**
   * Returns the JustificationCanvas <canvas> element (W5 feature).
   * JustificationCanvas.jsx renders a Three.js canvas via @react-three/fiber.
   */
  get justificationCanvas(): Locator {
    return this.page.locator("canvas").first();
  }

  /**
   * Returns true if a <canvas> element is present inside the open drawer.
   * Used to guard W5 assertions.
   */
  async isJustificationCanvasPresent(): Promise<boolean> {
    return this.justificationCanvas.count().then((c) => c > 0);
  }

  /**
   * Closes the drawer via the X button.
   */
  async close(): Promise<void> {
    await this.page
      .locator('button[aria-label="Close"], button:has(svg[data-lucide="x"]), button:has(.lucide-x)')
      .first()
      .click();
  }
}
