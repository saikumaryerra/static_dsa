/**
 * Shared browser-side helpers for the M8.1 mastery suite
 * (`docs/m8-gamification.md`; spec §6 keys, §8 surfaces).
 *
 * Lives OUTSIDE the `*.spec.ts` pattern for the same reason `color.ts` and
 * `scroll.ts` do: importing one spec from another makes Playwright register the
 * imported file's tests a second time.
 *
 * Everything here is written against the two keys spec §6 enumerates for this
 * phase — `lesson:{slug}:complete` and `progress:v1:{slug}` — and nothing here
 * ever enumerates storage by prefix, which is the same rule the product code
 * lives under: a helper that scanned for `progress:v1:*` would happily pass a
 * build that had started writing keys the spec does not allow.
 */
import { expect, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Delays passed to `setInterval` since {@link trackIntervals} installed. */
    __m8Intervals?: number[];
    /** DOM rewrites seen since {@link watchRewrites} started observing. */
    __m8Rewrites?: number;
  }
}

/** One lesson as the build injects it into `data-lessons` (src/lib/progress.ts). */
export interface LessonRef {
  slug: string;
  title: string;
  order: number;
  track: string;
}

/**
 * The stored shape of `progress:v1:{slug}` (src/lib/progress.ts `MasteryRecord`).
 *
 * The two scheduler fields are optional here on purpose: M8.1's tests seed
 * records without them (the store defaults both), while M8.2's review tests have
 * to read them back to prove a pass moved — or did not move — the schedule.
 */
export interface MasteryRecord {
  practicedAt: string | null;
  masteredAt: string | null;
  checks: (0 | 1 | null)[];
  /** Position in `REVIEW_INTERVAL_DAYS`; absent reads as the first interval. */
  intervalIndex?: number;
  /** When the last review pass landed; absent means none has. */
  lastReviewAt?: string | null;
}

/** Completion key for one lesson — the M7 key M8 leaves untouched (spec §6). */
export function completeKey(slug: string): string {
  return `lesson:${slug}:complete`;
}

/** Mastery-record key for one lesson (spec §6, added by M8.1). */
export function masteryKey(slug: string): string {
  return `progress:v1:${slug}`;
}

/** Milliseconds in a day — the 3-day gate is elapsed time, not a calendar diff. */
const DAY_MS = 86_400_000;

/**
 * An ISO timestamp `days` in the past — how every test fakes the clock.
 *
 * The gate the design specifies ("Mastered = re-meeting the Practiced bar ≥3
 * days after `practicedAt`") cannot be waited out in a test, and the store reads
 * the wall clock, so the only honest lever is the STORED timestamp. Nothing in
 * the suite mocks `Date`: that would test a fake gate.
 *
 * @param days - How many days ago (fractions allowed).
 * @returns The ISO string to store as `practicedAt`.
 */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/**
 * Seeds keys BEFORE any page script runs, for every navigation in the test.
 *
 * The re-run is the trap: an init script fires again on each `goto`, so a test
 * that seeds a record here and then navigates away will have that record
 * re-written underneath whatever the page just saved. Use this only while the
 * test stays on one page (or when re-seeding is harmless); use
 * {@link writeStorage} when a write has to survive a navigation.
 *
 * @param page - The page to install the script on.
 * @param entries - Key/value pairs to set.
 */
export async function seedStorage(
  page: Page,
  entries: Record<string, string>,
): Promise<void> {
  await page.addInitScript((values: Record<string, string>) => {
    for (const [key, value] of Object.entries(values)) {
      localStorage.setItem(key, value);
    }
  }, entries);
}

/**
 * Seeds completion marks before any page script runs (see {@link seedStorage}
 * for the re-run caveat).
 *
 * @param page - The page to install the script on.
 * @param slugs - Lessons to mark complete.
 */
export async function seedComplete(page: Page, slugs: string[]): Promise<void> {
  const entries: Record<string, string> = {};
  // Built from `completeKey`, never a retyped template literal: a test that
  // spelled the key itself could keep passing after the product renamed it.
  for (const slug of slugs) entries[completeKey(slug)] = '1';
  await seedStorage(page, entries);
}

/**
 * Seeds one mastery record before any page script runs (see {@link seedStorage}
 * for the re-run caveat).
 *
 * @param page - The page to install the script on.
 * @param slug - Lesson slug.
 * @param record - The record to store.
 */
export async function seedMastery(
  page: Page,
  slug: string,
  record: MasteryRecord,
): Promise<void> {
  await seedStorage(page, { [masteryKey(slug)]: JSON.stringify(record) });
}

/**
 * Seeds a Practiced record for each of `slugs` before any page script runs (see
 * {@link seedStorage} for the re-run caveat).
 *
 * `checks` stays empty on purpose. The store's Practiced predicate reads the
 * stored `practicedAt` and nothing else — that is why `/learn` never needs
 * per-lesson question counts — so this stands in for ANY of the design's three
 * retrieval paths (a full set of "I had it" grades, M8.2's predict session, a
 * cleared Final Run) rather than hard-coding the shape of one of them.
 *
 * @param page - The page to install the script on.
 * @param slugs - Lessons that have been practiced on this device.
 * @param practicedAt - When (ISO); defaults to yesterday, which is inside the
 * 3-day gate, so nothing here silently reads as Mastered.
 */
export async function seedPracticed(
  page: Page,
  slugs: string[],
  practicedAt: string = daysAgo(1),
): Promise<void> {
  const entries: Record<string, string> = {};
  for (const slug of slugs) {
    const record: MasteryRecord = { practicedAt, masteredAt: null, checks: [] };
    entries[masteryKey(slug)] = JSON.stringify(record);
  }
  await seedStorage(page, entries);
}

/**
 * Writes keys into the CURRENT origin's storage once, with no init script.
 *
 * The counterpart to {@link seedStorage}: nothing re-runs, so a later
 * navigation sees exactly what the page (or this call) last wrote. Requires the
 * page to already be on the site's origin.
 *
 * @param page - A page already navigated to the site.
 * @param entries - Key/value pairs to set.
 */
export async function writeStorage(
  page: Page,
  entries: Record<string, string>,
): Promise<void> {
  await page.evaluate((values: Record<string, string>) => {
    for (const [key, value] of Object.entries(values)) {
      localStorage.setItem(key, value);
    }
  }, entries);
}

/** Reads one localStorage key from the page (null when unset). */
export function readKey(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/**
 * Reads one lesson's mastery record back out of storage.
 *
 * @param page - A page on the site's origin.
 * @param slug - Lesson slug.
 * @returns The parsed record, or `null` when the key is unset.
 */
export async function readRecord(
  page: Page,
  slug: string,
): Promise<MasteryRecord | null> {
  const raw = await readKey(page, masteryKey(slug));
  return raw === null ? null : (JSON.parse(raw) as MasteryRecord);
}

/**
 * Makes `localStorage` throw on every access, for the whole context.
 *
 * The shape Safari's "block all cookies" and some private modes take: the
 * property EXISTS but reading it raises, so every unguarded access is an
 * uncaught exception that kills the rest of an island. Installed via
 * `addInitScript` so it is in place before the first inline script runs.
 *
 * @param page - The page to block storage on.
 */
export async function blockStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('storage is blocked', 'SecurityError');
      },
    });
  });
}

/**
 * Collects uncaught page errors — the failure mode a blocked or corrupt store
 * causes, and the one thing that must never happen (§6: every access guarded).
 *
 * @param page - The page to listen on.
 * @returns A live array of error messages; assert it is empty at the end.
 */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * The build-injected curriculum, read out of `/learn`'s `data-lessons`.
 *
 * Read rather than hardcoded so no test here assumes a lesson count, title or
 * track membership the build no longer ships.
 *
 * @param page - Page to load `/learn` in (left on `/learn` afterwards).
 * @returns Every published lesson in global `order`.
 */
export async function curriculum(page: Page): Promise<LessonRef[]> {
  await page.goto('/learn');
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-lessons]');
    const parsed = JSON.parse(host?.dataset['lessons'] ?? '[]') as {
      slug: string;
      title: string;
      order: number;
      track: string;
    }[];
    return parsed.sort((a, b) => a.order - b.order);
  });
}

/**
 * The lessons of one track, in global order.
 *
 * @param page - Page to load `/learn` in (left on `/learn` afterwards).
 * @param track - Track id, e.g. `foundations`.
 * @returns That track's lessons.
 */
export async function trackLessons(
  page: Page,
  track: string,
): Promise<LessonRef[]> {
  return (await curriculum(page)).filter((lesson) => lesson.track === track);
}

/**
 * Waits until an element's layout box has come to rest.
 *
 * The same class of problem `waitForAnchorScroll` exists for, one component
 * along: `Collapsible` animates `block-size: 0 → auto` over `--duration-slow`
 * (M7.3 CMP-13), so opening one Practice answer moves every question below it.
 * Playwright's actionability check re-scrolls on each retry and can race that
 * animation indefinitely — measured with JS disabled as a hard timeout on the
 * SECOND summary in 3 runs out of 3, and passing with JS on, i.e. exactly the
 * kind of environment-dependent flake that is worse than no test at all.
 *
 * Waits for a CONDITION (N consecutive identical boxes), never a fixed sleep,
 * and requires more than one matching pair for the reason recorded on
 * `waitForAnchorScroll`: a slow eased tail can repeat one rounded sample
 * mid-flight.
 *
 * @param locator - The element to settle (must resolve to exactly one node).
 * @param samples - How many consecutive identical samples count as at rest.
 */
export async function settle(locator: Locator, samples = 3): Promise<void> {
  let previous = '';
  let stable = 0;
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox();
        const key = box
          ? `${Math.round(box.x)}:${Math.round(box.y)}:${Math.round(box.height)}`
          : 'none';
        stable = key === previous ? stable + 1 : 0;
        previous = key;
        return stable;
      },
      { intervals: [50, 50, 100, 100, 250], timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(samples - 1);
}

/**
 * Opens one Practice question's disclosure, the way a reader does.
 *
 * @param page - The lesson page.
 * @param index - Question position, 0-based (question 1 is index 0).
 */
export async function openQuestion(page: Page, index: number): Promise<void> {
  const root = page.locator('[data-practice-check]').nth(index);
  const content = root.locator('.collapsible__content');
  if (await content.isVisible()) return;
  const summary = root.locator('summary');
  await settle(summary);
  await summary.click();
  await expect(content).toBeVisible();
}

/**
 * Opens one Practice question's disclosure and self-grades it.
 *
 * Goes through the real reader path — the grade buttons live INSIDE the
 * `<details>`, so a test that clicked them without opening it would be asserting
 * against an element no reader can reach.
 *
 * @param page - The lesson page.
 * @param index - Question position, 0-based (question 1 is index 0).
 * @param grade - `had` for "I had it", `not` for "Not yet".
 */
export async function gradeQuestion(
  page: Page,
  index: number,
  grade: 'had' | 'not',
): Promise<void> {
  const root = page.locator('[data-practice-check]').nth(index);
  await openQuestion(page, index);
  const button = root.locator(`[data-practice-grade="${grade}"]`);
  // The button rides inside the box that just finished expanding, so it is
  // settled here for the same reason the summary was.
  await settle(button);
  await button.click();
}

/**
 * Self-grades every Practice question on the page the same way.
 *
 * @param page - The lesson page.
 * @param grade - The grade to give each question.
 * @returns How many questions were graded.
 */
export async function gradeAll(
  page: Page,
  grade: 'had' | 'not',
): Promise<number> {
  const count = await page.locator('[data-practice-check]').count();
  for (let i = 0; i < count; i += 1) await gradeQuestion(page, i, grade);
  return count;
}

/** The lesson header's stage wrapper (hidden until an island resolves a stage). */
export function headerStage(page: Page) {
  return page.locator('[data-lesson-stage]');
}

/** The lesson header's pips root — `data-stage` is the whole contract. */
export function headerPips(page: Page) {
  return page.locator('[data-lesson-stage] [data-mastery-pips]');
}

/** The lesson header's stage word (the accessible signal; pips are decoration). */
export function headerLabel(page: Page) {
  return page.locator('[data-lesson-stage] [data-mastery-label]');
}

/** One curriculum card's pips root. */
export function cardPips(page: Page, slug: string) {
  return page.locator(`[data-slug="${slug}"] [data-mastery-pips]`);
}

/** One curriculum card's stage word (sr-only inside the card link). */
export function cardLabel(page: Page, slug: string) {
  return page.locator(`[data-slug="${slug}"] [data-mastery-label]`);
}

/** One track's arc block — the ring plus both count lines. */
export function trackArc(page: Page, track: string) {
  return page.locator(`[data-track-progress="${track}"]`);
}

/** A track's "N of M done on this device" line. */
export function trackCount(page: Page, track: string) {
  return page.locator(`[data-track-progress="${track}"] [data-track-count]`);
}

/** A track's "Practiced n · Mastered n" line — never displayed without the count. */
export function trackMastery(page: Page, track: string) {
  return page.locator(`[data-track-progress="${track}"] [data-track-mastery]`);
}

/**
 * Opens every disclosure on the page — the legend is allowed to be collapsed
 * reference material, and this is what a reader does to read it.
 *
 * Sets `open` rather than clicking each summary: it is the same state change
 * (and the same one the browser makes with no script at all), it needs no
 * selector for copy the test does not own, and it cannot race the
 * `Collapsible` height animation.
 *
 * @param page - The page to open everything on.
 */
export async function openAllDisclosures(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((details) => {
      details.open = true;
    });
  });
}

/**
 * The smallest RENDERED block of text that names all three mastery stages, and
 * satisfies every extra pattern asked of it — the currency legend, found by what
 * it must SAY rather than by a hook.
 *
 * Deliberately markup-agnostic: the rule under test is that the reader is told
 * what the three words mean, who decided them and where they are stored, and a
 * test keyed to a class name would pass a legend that had been quietly emptied
 * (or fail a correct one that moved).
 *
 * RENDERED is checked explicitly with `checkVisibility()` rather than inferred
 * from `innerText`, which would be a false pass in exactly the case that
 * matters: `innerText` falls back to `textContent` for an element that is NOT
 * being rendered, so a legend switched off by a `<noscript>` rule (or sitting
 * inside a closed `<details>`) still reads back in full. What the reader can
 * actually see is the whole question here.
 *
 * @param page - The page to search (already loaded).
 * @param requires - Extra case-insensitive regex sources the block must also
 * match; each is applied to the same element, so a clause in a sibling
 * paragraph resolves to their common ancestor — the legend as a whole.
 * @returns The whitespace-collapsed text of the smallest such element, or
 * `null` when no rendered element qualifies.
 */
export async function currencyLegend(
  page: Page,
  requires: string[] = [],
): Promise<string | null> {
  return page.evaluate((patterns) => {
    const stages = ['Learned', 'Practiced', 'Mastered'];
    const extra = patterns.map((source) => new RegExp(source, 'i'));
    let smallest: string | null = null;
    for (const element of Array.from(document.querySelectorAll('body *'))) {
      // `innerText` is an HTMLElement property; the pips' SVG elements would
      // throw on it.
      if (!(element instanceof HTMLElement)) continue;
      if (
        !element.checkVisibility({
          contentVisibilityAuto: true,
          opacityProperty: true,
          visibilityProperty: true,
        })
      ) {
        continue;
      }
      const text = element.innerText.replace(/\s+/g, ' ').trim();
      if (!stages.every((stage) => text.includes(stage))) continue;
      if (!extra.every((pattern) => pattern.test(text))) continue;
      if (smallest === null || text.length < smallest.length) smallest = text;
    }
    return smallest;
  }, requires);
}

/**
 * Records every `setInterval` the page schedules, from before its first script.
 *
 * This is how "no countdown" is asserted without watching a clock: a line that
 * ticks has to be re-rendered on a timer, and `setInterval` is the only repeating
 * timer any code here could use that a test can see without waiting for it.
 * (A self-rescheduling `setTimeout` would slip past this one, which is why the
 * caller also watches the line itself for rewrites — see {@link watchRewrites}.)
 *
 * @param page - The page to instrument (before `goto`).
 * @returns A reader for the delays scheduled so far.
 */
export async function trackIntervals(
  page: Page,
): Promise<() => Promise<number[]>> {
  await page.addInitScript(() => {
    window.__m8Intervals = [];
    const real = window.setInterval.bind(window);
    window.setInterval = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => {
      // Timers the HARNESS schedules are excluded by where they come from, not
      // by how fast they tick: the e2e suite normally runs against the built
      // `dist/`, which has none of this code in it, but a run against
      // `astro dev` also gets the dev server's own timers (a 30 000 ms ping was
      // observed from Vite's HMR client; the dev toolbar's scripts are excluded
      // by the same rule). Filtering by CALLER keeps the assertion "no
      // repeating timer at all" — weakening it to "no FAST timer" would leave a
      // slow countdown somewhere to hide.
      const stack = new Error().stack ?? '';
      if (!/\/@vite\/|\/@id\/astro\/runtime\/client\/|vite\/dist\//.test(stack))
        window.__m8Intervals?.push(timeout ?? 0);
      return real(handler, timeout, ...args);
    }) as typeof window.setInterval;
  });
  return () => page.evaluate(() => window.__m8Intervals ?? []);
}

/**
 * Starts counting DOM rewrites under one element, from now.
 *
 * Counts REWRITES rather than value changes, which is the distinction two of
 * these tests turn on: assigning a live region the string it already holds still
 * replaces its text node, and assistive tech still announces it. A mutation
 * count of 0 is therefore the only proof that a repaint stayed silent — and the
 * only proof that a line of copy is not quietly re-rendering itself on a timer.
 *
 * @param target - The element to observe; must resolve to exactly one node.
 * @returns A reader for the number of mutations seen so far.
 */
export async function watchRewrites(
  target: Locator,
): Promise<() => Promise<number>> {
  await target.evaluate((node) => {
    window.__m8Rewrites = 0;
    new MutationObserver((records) => {
      window.__m8Rewrites = (window.__m8Rewrites ?? 0) + records.length;
    }).observe(node, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  const page = target.page();
  return () => page.evaluate(() => window.__m8Rewrites ?? 0);
}
