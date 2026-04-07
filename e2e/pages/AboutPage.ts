import type { Locator, Page } from "@playwright/test";

/**
 * Page Object Model for the public /about page.
 *
 * The page renders two FounderCard components (Logan Mann, Arnav Bhardwaj)
 * inside a motion.section grid. The hero text contains "Two founders, one mission".
 * Social links are plain <a> elements with href attributes.
 */
export class AboutPage {
  readonly page: Page;
  readonly url = "/about";

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    // Wait for framer-motion to render the hero heading.
    await this.heroText().waitFor({ state: "visible", timeout: 15_000 });
  }

  /**
   * Locator for the main hero heading that contains "Two founders, one mission".
   */
  heroText(): Locator {
    return this.page.locator("h1").filter({ hasText: /two founders, one mission/i });
  }

  /**
   * Locator for a founder card identified by the founder's name.
   * The name appears in an <h2> inside a <motion.article>.
   */
  founderCard(name: string): Locator {
    return this.page.locator("article").filter({ has: this.page.locator("h2", { hasText: name }) });
  }

  /**
   * Returns all founder card article elements.
   * Expect exactly 2 (Logan Mann and Arnav Bhardwaj).
   */
  get founderCards(): Locator {
    return this.page.locator("article");
  }

  /**
   * Returns the LinkedIn anchor for a given founder by name.
   * The About.jsx links include {kind: "linkedin", href: "https://www.linkedin.com/in/..."}
   */
  linkedInLink(founderName: string): Locator {
    return this.founderCard(founderName).locator('a[href*="linkedin.com"]');
  }

  /**
   * Returns the GitHub anchor for Logan Mann (the only founder with a GitHub link).
   */
  githubLink(founderName: string): Locator {
    return this.founderCard(founderName).locator('a[href*="github.com"]');
  }

  /**
   * Returns the photo <img> for a given founder by slug.
   * Source is at /team/<slug>.jpg. The image may 404 gracefully (initials fallback).
   */
  founderPhoto(slug: string): Locator {
    return this.page.locator(`img[src*="${slug}"]`);
  }
}
