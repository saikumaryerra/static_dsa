/**
 * Shared browser-side helpers for the M8.2 Predict-the-Step suite
 * (`docs/m8-gamification.md` → "M8.2 — Retrieval engine"; spec §11.2/§11.3).
 *
 * Lives OUTSIDE the `*.spec.ts` pattern for the same reason `mastery.ts`,
 * `color.ts` and `scroll.ts` do: importing one spec from another makes
 * Playwright register the imported file's tests a second time.
 *
 * Everything here addresses the island through the hooks the component already
 * ships (`data-viz-*`), never through class names that exist for painting, and
 * never through the injected strip's internal structure beyond the three parts
 * the design names: the prompt, the choice buttons, and the session line.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Waits for one visualizer island to finish hydrating.
 *
 * Scrolls it into view first because the island mounts from an
 * `IntersectionObserver` — a viz below the fold never hydrates on its own, which
 * is exactly what a `#practice` deep link produces (the review queue's link
 * lands the reader past the visualization).
 *
 * @param scope - The viz root itself, or an ancestor of one (`:scope` in the
 * selector below is what makes both work — a lesson wraps some visualizers in a
 * `#viz-*` div and addresses others by their own `data-algorithm`).
 * @returns The `[data-viz]` element, hydrated.
 */
export async function hydrateViz(scope: Locator): Promise<Locator> {
  const viz = scope.locator(':scope[data-viz], [data-viz]').first();
  await viz.scrollIntoViewIfNeeded();
  await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
    timeout: 15_000,
  });
  return viz;
}

/** The Predict mode toggle — present only where the build proved a question exists. */
export function predictToggle(viz: Locator): Locator {
  return viz.locator('[data-viz-predict]');
}

/** The stated reason the two watching controls are unavailable while predicting. */
export function predictNote(viz: Locator): Locator {
  return viz.locator('[data-viz-predict-note]');
}

/**
 * The question strip — injected at runtime only, so its very existence is
 * evidence the island ran (a JS-off page cannot have one).
 */
export function predictStrip(viz: Locator): Locator {
  return viz.locator('[data-viz-predict-strip]');
}

/** The answer buttons for the current step (2–4 of them, or none). */
export function predictChoices(viz: Locator): Locator {
  return predictStrip(viz).locator('button');
}

/** The question above the buttons. */
export function predictPrompt(viz: Locator): Locator {
  return predictStrip(viz).locator('.viz-predict__prompt');
}

/**
 * The session line. It reports ACTIVITY only — "7 answered · 2 skipped" — and
 * the calm invariant this whole file exists to protect is that it never becomes
 * a ratio, a percentage or a score.
 */
export function activityChip(viz: Locator): Locator {
  return predictStrip(viz).locator('.viz-predict__activity');
}

/** The step counter, e.g. `2 / 6` (aria-hidden decoration for the slider). */
export function counter(viz: Locator): Locator {
  return viz.locator('[data-viz-counter]');
}

/** The polite live region the step explanation — and any verdict — is written to. */
export function explanation(viz: Locator): Locator {
  return viz.locator('[data-viz-explain]');
}

/**
 * Turns Predict on through the real control and waits for the strip to appear.
 *
 * @param viz - A hydrated viz root that offers the toggle.
 */
export async function enablePredict(viz: Locator): Promise<void> {
  const toggle = predictToggle(viz);
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(predictStrip(viz)).toBeVisible();
}

/**
 * Answers the current question by its visible label, the way a reader does.
 *
 * Asserts the button is there before clicking so a step that asks nothing fails
 * as "no such choice" rather than as a timeout with no explanation.
 *
 * @param viz - The hydrated viz root, with Predict on.
 * @param label - The choice's visible text, e.g. `'Go left'`.
 */
export async function answer(viz: Locator, label: string): Promise<void> {
  const button = predictChoices(viz).filter({ hasText: label });
  await expect(button).toHaveCount(1);
  await button.click();
}

/**
 * Runs a custom input through the island's own form (§5.4) and waits for the
 * new trace to load.
 *
 * The predict session deliberately survives this: the submit path reassigns the
 * parsed input and the trace that predict grades against, and resets nothing
 * else — which is what lets a reader reach a five-question run on a lesson whose
 * authored example is shorter.
 *
 * @param viz - The hydrated viz root.
 * @param array - The array literal, e.g. `[1,2,3]`.
 * @param target - The target field's value.
 * @param steps - How many steps the resulting trace must have; asserted, so a
 * changed algorithm surfaces here instead of corrupting a later count.
 */
export async function runCustomInput(
  viz: Locator,
  array: string,
  target: string,
  steps: number,
): Promise<void> {
  await viz.locator('[data-viz-array]').fill(array);
  await viz.locator('[data-viz-target]').fill(target);
  await viz.locator('[data-viz-run]').click();
  await expect(viz.locator('[data-viz-error]')).toBeHidden();
  await expect(counter(viz)).toHaveText(`1 / ${steps}`);
}

/**
 * Every string the predict surfaces put on screen, whitespace-collapsed.
 *
 * Scoped to the strip and the explanation on purpose. A page-wide scan for a
 * ratio would fail on the STEP COUNTER ("2 / 6"), which is a position and not a
 * score — and a test that cries wolf gets deleted, which is worse than not
 * having it.
 *
 * @param viz - The viz root to read.
 * @returns The visible predict copy, in DOM order.
 */
export async function predictCopy(viz: Locator): Promise<string[]> {
  return viz.evaluate((root) =>
    [
      '[data-viz-predict-strip]',
      '[data-viz-explain]',
      '[data-viz-predict-note]',
    ]
      .flatMap((selector) => [...root.querySelectorAll(selector)])
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 0),
  );
}

/**
 * The whole `localStorage` for the current origin, canonicalised.
 *
 * Keys are sorted so the comparison is about CONTENT, not about the order two
 * islands happened to write in; the result is compared with `toBe`, which is the
 * byte-identity the "Predict is never persisted" invariant asks for.
 *
 * @param page - A page on the site's origin.
 * @returns A stable string for the entire store.
 */
export async function storageFingerprint(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify(
      Object.keys(localStorage)
        .sort()
        .map((key) => [key, localStorage.getItem(key)]),
    ),
  );
}
