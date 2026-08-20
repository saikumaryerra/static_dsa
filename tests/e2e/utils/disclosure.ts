import type { Locator, Page } from '@playwright/test';

/**
 * Helpers for the two `<details>` disclosures inside an instrument, both of
 * which changed state in the 2026-08 redesign
 * (`docs/redesign-2026-08/03-amendments.md`, amendments C-1 and C-2).
 *
 * They exist so a spec says what it MEANS — "the run's table is open", "the
 * custom-input form is available" — instead of encoding today's default. A
 * `summary.click()` is a TOGGLE: it opened the ledger while the ledger shipped
 * closed and it closes it now that the ledger ships open, and a suite written
 * against the toggle has to be rewritten every time a default moves. These are
 * idempotent, so they are correct under either default.
 */

/**
 * Ensures a `<details>` is open, whatever state it is in.
 *
 * Sets the property rather than clicking the summary: a click is a toggle, and
 * it also scrolls the summary into view, which moves the page under a test that
 * is about to measure something. Where the CLICK ITSELF is the thing under test
 * (keyboard operability, focus, the marker's rotation), drive the summary
 * directly instead of calling this.
 *
 * @param details - Locator for the `<details>` element.
 */
export async function openDetails(details: Locator): Promise<void> {
  await details.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
}

/** Ensures a `<details>` is closed, whatever state it is in. */
export async function closeDetails(details: Locator): Promise<void> {
  await details.evaluate((el) => {
    (el as HTMLDetailsElement).open = false;
  });
}

/**
 * Opens the "Run it on your own input — …" disclosure so the custom-input
 * fields are reachable (amendment C-2: the form was measured at 300px of a
 * 550px control region on a phone, and a pinned stage column has to fit one
 * viewport, so it now ships behind a labelled summary).
 *
 * @param scope - A page, or a locator scoped to one instrument. With a page,
 *                EVERY instrument's form on it is opened, which is what a spec
 *                driving "the lesson's visualizer" wants and costs nothing on a
 *                page with one.
 */
export async function openCustomInput(scope: Page | Locator): Promise<void> {
  await scope.locator('details.viz-custom-open').evaluateAll((list) =>
    list.forEach((el) => {
      (el as HTMLDetailsElement).open = true;
    }),
  );
}

/**
 * Opens an instrument's ledger — the run written out under the drawing.
 *
 * @param scope - A page, or a locator scoped to one instrument.
 */
export async function openLedger(scope: Page | Locator): Promise<void> {
  await scope.locator('[data-ledger]').evaluateAll((list) =>
    list.forEach((el) => {
      (el as HTMLDetailsElement).open = true;
    }),
  );
}
