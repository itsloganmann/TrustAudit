import type { Page } from "@playwright/test";

/**
 * Page Object Model for the vendor sign-in page at /auth/vendor/signin.
 *
 * The page uses EmailPasswordForm (react-hook-form + Zod) so we wait for
 * the form to be interactive before filling it. No data-testid attributes
 * exist yet; we fall back to accessible role + type selectors which are
 * stable across Tailwind class changes.
 */
export class SignInPage {
  readonly page: Page;
  readonly url = "/auth/vendor/signin";

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    // Wait for the React bundle to hydrate — the email input is our signal.
    await this.page.locator('input[type="email"]').waitFor({ state: "visible" });
  }

  async fillEmail(email: string): Promise<void> {
    await this.page.locator('input[type="email"]').fill(email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.page.locator('input[type="password"]').fill(password);
  }

  async submit(): Promise<void> {
    // The submit button text is "Sign in" when idle.
    await this.page
      .locator('button[type="submit"]', { hasText: /sign in/i })
      .click();
  }

  /**
   * Convenience: fill + submit, then wait for navigation away from /auth/*.
   */
  async signIn(email: string, password: string): Promise<void> {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
    // Navigation to /vendor happens after a successful cookie is set.
    // Allow 20s to cover slow first loads (React hydration + auth round-trip).
    await this.page.waitForURL(/\/vendor/, { timeout: 20_000 });
  }
}
