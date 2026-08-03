/**
 * M7.2 — the progress loop (docs/m7-ux-overhaul.md "Phase M7.2", spec §6/§8).
 *
 * The loop the audit found open: nothing on the site said where to resume, no
 * counter said how far the reader had got, and there was no way to clear any of
 * it. M7.2 closes it with four surfaces over the SAME `lesson:{slug}:complete`
 * keys — the `/learn` resume CTA, the per-track counters, the card checkmarks,
 * and the reset control — plus the home hero's continue line and the
 * end-of-lesson "What's next" section (mark-complete + prev/next).
 *
 * All of it is storage- and DOM-shaped, so none of it can be unit tested
 * (`vitest.config.ts` is `environment: 'node'`); the pure half of
 * `src/lib/progress.ts` is covered in `tests/unit/progress.test.ts`.
 *
 * Three states get exercised, because each renders differently and each is a
 * real reader: JS off, script running with a working store, and script running
 * with a BLOCKED store (private mode / "block all cookies"). The last one is
 * where a progress feature usually breaks, and where the site promises the most:
 * every surface must degrade to its server-rendered fallback rather than throw
 * or claim a save that never happened.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const LEARN = '/learn';
const HOME = '/';
const FIRST_LESSON = { slug: 'complexity-big-o', title: 'Complexity & Big-O' };
const SECOND_LESSON = { slug: 'arrays', title: 'Arrays' };
/** Foundations 9 + Algorithms 6 = the 15 published lessons (M6).  */
const FOUNDATIONS_TOTAL = 9;

/** Completion key for a lesson — the one `MarkComplete` writes (spec §6). */
function completeKey(slug: string): string {
  return `lesson:${slug}:complete`;
}

/** Seeds completion marks before any page script runs. */
async function seedComplete(page: Page, slugs: string[]): Promise<void> {
  await page.addInitScript((list: string[]) => {
    for (const slug of list)
      localStorage.setItem(`lesson:${slug}:complete`, '1');
  }, slugs);
}

/**
 * Makes `localStorage` throw on every access, for the whole context.
 *
 * This is the shape Safari's "block all cookies" and some private modes take:
 * the property EXISTS but reading it raises, which is nastier than a missing
 * global because every unguarded access is an uncaught exception that kills the
 * rest of the island's script. Installed via `addInitScript` so it is in place
 * before the first inline script (the theme applier) runs.
 */
async function blockStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('storage is blocked', 'SecurityError');
      },
    });
  });
}

/** Fails the test if any page script threw — the failure mode blocked storage causes. */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const resumeLink = (page: Page) => page.locator('[data-resume-link]');
const resumeLabel = (page: Page) => page.locator('[data-resume-label]');
const trackCount = (page: Page, track: string) =>
  page.locator(`[data-track-progress="${track}"] [data-track-count]`);

test.describe('/learn resume CTA', () => {
  test('a reader with nothing stored is told to START, at lesson 01', async ({
    page,
  }) => {
    await page.goto(LEARN);

    // "Start", not "Continue": a reader with no history is not continuing
    // anything. The server renders exactly this string too (see the JS-off
    // test below), so hydration is a no-op here rather than a flash of
    // different wording.
    await expect(resumeLabel(page)).toHaveText(
      `Start with 01 · ${FIRST_LESSON.title}`,
    );
    await expect(resumeLink(page)).toHaveAttribute(
      'href',
      `/learn/${FIRST_LESSON.slug}`,
    );
    await expect(page.locator('[data-resume-done]')).toBeHidden();
  });

  test('marking a lesson complete moves the CTA to the next one', async ({
    page,
  }) => {
    // Through the real UI, not a seeded key: this is the one test that proves
    // MarkComplete's write and the /learn read agree on the key format.
    await page.goto(`/learn/${FIRST_LESSON.slug}`);
    await page.locator('[data-mark-complete]').click();
    await expect(page.locator('[data-mark-complete]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.goto(LEARN);
    await expect(resumeLabel(page)).toHaveText(
      `Continue: 02 · ${SECOND_LESSON.title}`,
    );
    await expect(resumeLink(page)).toHaveAttribute(
      'href',
      `/learn/${SECOND_LESSON.slug}`,
    );
  });

  test('the CTA follows global order across the track boundary', async ({
    page,
  }) => {
    // Every Foundations lesson done: the resume target is the first ALGORITHMS
    // lesson, never a dead end at the end of the track (spec §3 "no dead ends").
    const slugs = await slugsOfTrack(page, 'foundations');
    expect(slugs.length).toBe(FOUNDATIONS_TOTAL);
    await seedComplete(page, slugs);

    await page.goto(LEARN);
    await expect(resumeLabel(page)).toContainText('Continue: 10 ·');
    await expect(resumeLink(page)).toHaveAttribute(
      'href',
      /^\/learn\/[a-z-]+$/,
    );
    // The CTA links into the OTHER track, which is the whole point.
    const href = await resumeLink(page).getAttribute('href');
    expect(slugs).not.toContain(href!.replace('/learn/', ''));
  });

  test('with everything complete the CTA stands down instead of linking somewhere arbitrary', async ({
    page,
  }) => {
    const all = await slugsOfTrack(page, null);
    await seedComplete(page, all);

    await page.goto(LEARN);
    await expect(resumeLink(page)).toBeHidden();
    const done = page.locator('[data-resume-done]');
    await expect(done).toBeVisible();
    await expect(done).toHaveText(
      `All ${all.length} done — revisit any lesson.`,
    );
  });
});

/**
 * The home hero's continue line — the resume rewrite's second surface, and the
 * one with the most to lose: it sits above the fold on the site's most-visited
 * page, and it personalises a hero that must stay stable for first-time
 * visitors. The primary "Start learning" CTA is therefore asserted UNTOUCHED in
 * every state below.
 */
test.describe('home hero continue line', () => {
  /** The hero's primary CTA — deliberately never rewritten by the island. */
  const startLearning = (page: Page) =>
    page.getByRole('link', { name: 'Start learning' });

  test('a first-time visitor gets the server-rendered "start" wording', async ({
    page,
  }) => {
    await page.goto(HOME);

    await expect(resumeLabel(page)).toHaveText(
      `Start with 01 · ${FIRST_LESSON.title}`,
    );
    await expect(resumeLink(page)).toHaveAttribute(
      'href',
      `/learn/${FIRST_LESSON.slug}`,
    );
    await expect(page.locator('[data-resume-done]')).toBeHidden();
    // The hero itself is unchanged for someone with no history: same primary
    // CTA, same destination, one clear starting point.
    await expect(startLearning(page)).toHaveAttribute('href', '/learn');
  });

  test('a returning reader is pointed at their own next lesson', async ({
    page,
  }) => {
    await seedComplete(page, [FIRST_LESSON.slug]);
    await page.goto(HOME);

    await expect(resumeLabel(page)).toHaveText(
      `Continue: 02 · ${SECOND_LESSON.title}`,
    );
    await expect(resumeLink(page)).toHaveAttribute(
      'href',
      `/learn/${SECOND_LESSON.slug}`,
    );
    await expect(startLearning(page)).toHaveAttribute('href', '/learn');
  });

  test('with everything complete the line stands down instead of linking somewhere arbitrary', async ({
    page,
  }) => {
    const all = await slugsOfTrack(page, null);
    await seedComplete(page, all);
    await page.goto(HOME);

    await expect(resumeLink(page)).toBeHidden();
    const done = page.locator('[data-resume-done]');
    await expect(done).toBeVisible();
    await expect(done).toHaveText(
      `All ${all.length} done — revisit any lesson.`,
    );
  });

  test('coming BACK from a lesson never leaves a stale line', async ({
    page,
  }) => {
    // The mechanism this exercises is the fragile one: a back/forward-cache
    // restore replays no script, so without the `pageshow` hook the reader
    // returns to a hero still naming the lesson they just finished. Whether
    // Chromium actually serves this navigation from bfcache is not the test's
    // business — either way the line must be true when it is on screen.
    await page.goto(HOME);
    await expect(resumeLabel(page)).toHaveText(
      `Start with 01 · ${FIRST_LESSON.title}`,
    );

    // Followed through the hero's own link, i.e. the real reader path.
    await resumeLink(page).click();
    await expect(page).toHaveURL(new RegExp(`/learn/${FIRST_LESSON.slug}`));
    await page.locator('[data-mark-complete]').click();
    await expect(page.locator('[data-mark-complete]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.goBack();
    await expect(resumeLabel(page)).toHaveText(
      `Continue: 02 · ${SECOND_LESSON.title}`,
    );
    await expect(resumeLink(page)).toHaveAttribute(
      'href',
      `/learn/${SECOND_LESSON.slug}`,
    );
  });
});

/** One lesson as the build injects it into `data-lessons` (src/lib/progress.ts). */
interface LessonRef {
  slug: string;
  title: string;
  order: number;
  track: string;
}

/**
 * Reads the build-injected curriculum out of the page's `data-lessons`
 * attribute — the same list the islands read, so no test here assumes a lesson
 * count, title or neighbour the build no longer ships.
 *
 * @param page - Page to load `/learn` in (left on `/learn` afterwards).
 * @returns Every published lesson in global `order`.
 */
async function curriculum(page: Page): Promise<LessonRef[]> {
  await page.goto(LEARN);
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-lessons]');
    const list = JSON.parse(host?.dataset['lessons'] ?? '[]') as {
      slug: string;
      title: string;
      order: number;
      track: string;
    }[];
    return list.sort((a, b) => a.order - b.order);
  });
}

/**
 * Slugs of one track (or of everything) in global curriculum order.
 *
 * @param page - Page to load `/learn` in (left on `/learn` afterwards).
 * @param track - Track id to filter by, or `null` for the whole curriculum.
 * @returns Slugs in global curriculum order.
 */
async function slugsOfTrack(page: Page, track: string | null) {
  const lessons = await curriculum(page);
  return lessons
    .filter((l) => track === null || l.track === track)
    .map((l) => l.slug);
}

test.describe('/learn per-track counters and card marks', () => {
  test('counters report this device and update with a completion', async ({
    page,
  }) => {
    await page.goto(LEARN);
    await expect(trackCount(page, 'foundations')).toHaveText(
      `0 of ${FOUNDATIONS_TOTAL} done on this device`,
    );

    await seedComplete(page, [FIRST_LESSON.slug, SECOND_LESSON.slug]);
    await page.goto(LEARN);
    await expect(trackCount(page, 'foundations')).toHaveText(
      `2 of ${FOUNDATIONS_TOTAL} done on this device`,
    );
    // The other track is counted against ITS OWN total, not the curriculum's.
    await expect(trackCount(page, 'algorithms')).toHaveText(
      /^0 of \d+ done on this device$/,
    );

    // The completed cards carry the mark; the rest do not (a card that is not
    // complete must not inherit the state from a sibling).
    await expect(
      page.locator(`[data-slug="${FIRST_LESSON.slug}"]`),
    ).toHaveAttribute('data-complete', 'true');
    await expect(page.locator('[data-lesson-card][data-complete]')).toHaveCount(
      2,
    );
  });
});

test.describe('/learn reset control', () => {
  test('asks for confirmation, then clears completion and restores the new-user state', async ({
    page,
  }) => {
    // Written directly rather than through `seedComplete`: an init script re-runs
    // on EVERY navigation, so it would silently re-seed the marks this test then
    // reloads to prove are gone.
    await page.goto(LEARN);
    await page.evaluate(
      (slugs: string[]) => {
        for (const slug of slugs)
          localStorage.setItem(`lesson:${slug}:complete`, '1');
      },
      [FIRST_LESSON.slug, SECOND_LESSON.slug],
    );
    await page.reload();

    const toggle = page.locator('[data-reset-toggle]');
    const panel = page.locator('[data-reset-panel]');
    // Something to delete → the control becomes available (it ships
    // aria-disabled because the build cannot know the device).
    await expect(toggle).toHaveAttribute('aria-disabled', 'false');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    // Nothing is destroyed by the first click — the confirm step is the point.
    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-reset-warn]')).toContainText(
      '2 completed marks',
    );
    expect(await readKey(page, completeKey(FIRST_LESSON.slug))).toBe('1');

    // Cancel really cancels: panel closed, marks intact, focus back on the
    // control that opened it (a keyboard user must not be stranded).
    await page.locator('[data-reset-cancel]').click();
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
    expect(await readKey(page, completeKey(FIRST_LESSON.slug))).toBe('1');

    await toggle.click();
    await page.locator('[data-reset-confirm]').click();

    // Every surface is back to the new-user state, in place, without a reload.
    await expect(panel).toBeHidden();
    await expect(resumeLabel(page)).toHaveText(
      `Start with 01 · ${FIRST_LESSON.title}`,
    );
    await expect(trackCount(page, 'foundations')).toHaveText(
      `0 of ${FOUNDATIONS_TOTAL} done on this device`,
    );
    await expect(page.locator('[data-lesson-card][data-complete]')).toHaveCount(
      0,
    );
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[data-progress-status]')).toContainText(
      '2 completed marks removed',
    );
    expect(await readKey(page, completeKey(FIRST_LESSON.slug))).toBeNull();

    // …and it survives a reload, i.e. the keys are really gone rather than the
    // DOM merely repainted.
    await page.reload();
    await expect(resumeLabel(page)).toHaveText(
      `Start with 01 · ${FIRST_LESSON.title}`,
    );
  });

  test('clears PROGRESS keys only — never a preference (spec §6)', async ({
    page,
  }) => {
    // The §6 split is the reason the reset routes through `src/lib/progress.ts`:
    // resetting progress must not throw away the reader's theme, playback speed
    // or code language. M8's progress keys join the same list; the preference
    // keys never do.
    await seedComplete(page, [FIRST_LESSON.slug]);
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('pref:viz-speed', '2');
      localStorage.setItem('pref:code-lang', 'javascript');
    });
    await page.goto(LEARN);

    await page.locator('[data-reset-toggle]').click();
    await page.locator('[data-reset-confirm]').click();
    await expect(page.locator('[data-progress-status]')).toContainText(
      'Progress reset',
    );

    expect(await readKey(page, completeKey(FIRST_LESSON.slug))).toBeNull();
    expect(await readKey(page, 'theme')).toBe('dark');
    expect(await readKey(page, 'pref:viz-speed')).toBe('2');
    expect(await readKey(page, 'pref:code-lang')).toBe('javascript');
  });

  test('is keyboard operable and dismissible with Escape', async ({ page }) => {
    await seedComplete(page, [FIRST_LESSON.slug]);
    await page.goto(LEARN);

    const toggle = page.locator('[data-reset-toggle]');
    const panel = page.locator('[data-reset-panel]');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();

    // Focus deliberately stays on the toggle rather than jumping onto a
    // destructive button under a keypress the reader has not released.
    await expect(toggle).toBeFocused();

    // Tab reaches Confirm, and Escape from inside the panel closes it and hands
    // focus back — the only exit that is not "tab through the rest of the page".
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-reset-confirm]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
    expect(await readKey(page, completeKey(FIRST_LESSON.slug))).toBe('1');
  });
});

/** Reads one localStorage key from the page (null when unset). */
function readKey(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

test.describe("What's next — the saved note", () => {
  test('confirms the save, says how far the reader has got, and where it lives', async ({
    page,
  }) => {
    // The total comes from the injected curriculum, never a hardcoded 15: the
    // note's whole point is that it counts the lessons the BUILD ships.
    const total = (await curriculum(page)).length;
    await page.goto(`/learn/${SECOND_LESSON.slug}`);

    const button = page.locator('[data-mark-complete]');
    const note = page.locator('[data-mark-complete-note]');
    // Nothing is claimed before the reader acts.
    await expect(note).toBeHidden();

    await button.click();
    await expect(note).toBeVisible();
    await expect(page.locator('[data-mark-complete-count]')).toHaveText(
      `Saved — 1 of ${total} complete`,
    );
    // The privacy line is the honest half of the promise: it explains WHERE the
    // save went, which is the question "Saved" otherwise raises (no account
    // exists to sync it to).
    await expect(note).toContainText(
      'Saved only in this browser — no account needed.',
    );

    // Deliberately not a live region: `aria-pressed` already announces the state
    // change, and a second announcement on the same action reads as a stutter
    // (M7.1 CMP-4). This is supplementary, visible confirmation.
    await expect(note).not.toHaveAttribute('aria-live');
    await expect(note).not.toHaveAttribute('role');

    // Un-marking retracts the claim rather than leaving a "Saved" line under a
    // button that is no longer pressed.
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(note).toBeHidden();
  });

  test('the count covers the whole curriculum, not just this lesson', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    // Two lessons OTHER than the one being marked, so a count that only ever
    // reported "1" would fail here.
    const [seedA, target, seedB] = lessons as [LessonRef, LessonRef, LessonRef];
    await seedComplete(page, [seedA.slug, seedB.slug]);

    await page.goto(`/learn/${target.slug}`);
    await page.locator('[data-mark-complete]').click();
    await expect(page.locator('[data-mark-complete-count]')).toHaveText(
      `Saved — 3 of ${lessons.length} complete`,
    );
  });
});

/**
 * "What's next" pagination (PrevNext's M7.2 redesign).
 *
 * The end of a lesson used to be a fork of two equal cards with no recommended
 * branch. It is now one recommendation — next promoted to a card with an
 * explicit CTA, prev demoted to a text link below it — and, on the last lesson,
 * a synthetic card back to the curriculum, because §3 forbids dead ends.
 * Neighbours are read from the injected curriculum so this asserts the SHAPE,
 * not a lesson list that will change.
 */
test.describe("What's next — prev/next", () => {
  /** The pagination's two (or one) links, in DOM order. */
  function navLinks(page: Page) {
    return page
      .getByRole('navigation', { name: 'Lesson navigation' })
      .getByRole('link');
  }

  test('next is the card and comes first; prev is a demoted link below it', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    const [prev, current, next] = lessons as [LessonRef, LessonRef, LessonRef];
    await page.goto(`/learn/${current.slug}`);

    const links = navLinks(page);
    await expect(links).toHaveCount(2);

    // DOM order is the requirement, not just the visual order: a keyboard or
    // screen-reader user must meet the recommended branch BEFORE the way back.
    const nextLink = links.nth(0);
    const prevLink = links.nth(1);
    await expect(nextLink).toHaveAttribute('href', `/learn/${next.slug}`);
    await expect(prevLink).toHaveAttribute('href', `/learn/${prev.slug}`);

    // Next is a card: the shared `.track-card` affordance, an overline, the
    // lesson's title and an explicit CTA.
    await expect(nextLink).toHaveClass(/track-card/);
    await expect(nextLink).toContainText('Next');
    await expect(nextLink).toContainText(next.title);
    await expect(nextLink).toContainText('Start lesson');

    // Prev is demoted — it names where it goes and nothing more, with no
    // competing CTA — but stays a comfortable target (44px, design §6.3).
    await expect(prevLink).toContainText('Previous');
    await expect(prevLink).toContainText(prev.title);
    await expect(prevLink).not.toContainText('Start lesson');
    await expect(prevLink).not.toHaveClass(/track-card/);
    const box = await prevLink.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('lesson 01 offers no "previous", only the way forward', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    const first = lessons[0]!;
    await page.goto(`/learn/${first.slug}`);

    const links = navLinks(page);
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveAttribute(
      'href',
      `/learn/${lessons[1]!.slug}`,
    );
  });

  test('the last lesson is not a dead end', async ({ page }) => {
    const lessons = await curriculum(page);
    const last = lessons[lessons.length - 1]!;
    await page.goto(`/learn/${last.slug}`);

    // The synthetic card keeps the same treatment as a real "next", so the end
    // of the curriculum reads as an ending rather than as missing markup.
    const links = navLinks(page);
    await expect(links).toHaveCount(2);
    const card = links.nth(0);
    await expect(card).toHaveAttribute('href', '/learn');
    await expect(card).toHaveClass(/track-card/);
    await expect(card).toContainText("That's the whole curriculum");
    await expect(card).toContainText('Back to all lessons');
    // …and the way back is still there.
    await expect(links.nth(1)).toHaveAttribute(
      'href',
      `/learn/${lessons[lessons.length - 2]!.slug}`,
    );
  });

  test('the one track crossing is named in both directions (IA-5)', async ({
    page,
  }) => {
    const lessons = await curriculum(page);
    // Derived, never hardcoded: the boundary is wherever the track changes in
    // global order.
    const index = lessons.findIndex(
      (lesson, i) => i > 0 && lesson.track !== lessons[i - 1]!.track,
    );
    expect(
      index,
      'the curriculum must cross tracks exactly once',
    ).toBeGreaterThan(0);
    const before = lessons[index - 1]!;
    const after = lessons[index]!;

    // Entering the new track: the card says which track it is.
    await page.goto(`/learn/${before.slug}`);
    await expect(navLinks(page).nth(0)).toContainText('Next track: Algorithms');

    // Leaving it again: the demoted link names the track it goes back to, so
    // the crossing is explicit from both sides instead of silent.
    await page.goto(`/learn/${after.slug}`);
    await expect(navLinks(page).nth(1)).toContainText(
      'Previous track: Foundations',
    );
  });
});

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('the home hero keeps a real continue link, and its primary CTA', async ({
    page,
  }) => {
    await page.goto(HOME);

    // Server-rendered, so the secondary line is a true and useful link even
    // though the island that personalises it never runs.
    await expect(resumeLabel(page)).toHaveText(
      `Start with 01 · ${FIRST_LESSON.title}`,
    );
    await expect(resumeLink(page)).toHaveAttribute(
      'href',
      `/learn/${FIRST_LESSON.slug}`,
    );
    // The all-complete line is JS-only and unknowable at build time: it must
    // stay hidden rather than appear empty under the link.
    await expect(page.locator('[data-resume-done]')).toBeHidden();
    await expect(
      page.getByRole('link', { name: 'Start learning' }),
    ).toBeVisible();
  });

  test('/learn still points somewhere useful and exposes no dead control', async ({
    page,
  }) => {
    await page.goto(LEARN);

    // The CTA is server-rendered, so it works with no script at all.
    await expect(resumeLabel(page)).toHaveText(
      `Start with 01 · ${FIRST_LESSON.title}`,
    );
    await expect(resumeLink(page)).toHaveAttribute(
      'href',
      `/learn/${FIRST_LESSON.slug}`,
    );

    // JS-only controls hide behind the <noscript> kill-switch rather than
    // sitting there doing nothing when clicked.
    await expect(page.locator('[data-reset-toggle]')).toBeHidden();
    // Counters stay hidden rather than reporting "0 of 9" about a device the
    // build cannot see.
    await expect(
      page.locator('[data-track-progress="foundations"]'),
    ).toBeHidden();
    await expect(page.locator('[data-lesson-card][data-complete]')).toHaveCount(
      0,
    );

    // The curriculum itself is fully usable: every card is a real link.
    const cards = page.locator('[data-lesson-card]');
    expect(await cards.count()).toBeGreaterThanOrEqual(15);
    await expect(cards.first()).toHaveAttribute('href', /^\/learn\//);
  });

  test('a lesson keeps its "What\'s next" section, minus the JS-only button', async ({
    page,
  }) => {
    await page.goto(`/learn/${SECOND_LESSON.slug}`);

    // Server-rendered and therefore EXPECTED to be readable without script.
    await expect(
      page.getByRole('heading', { name: "What's next" }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Lesson navigation' }),
    ).toBeVisible();

    // The completion toggle and the note it reveals are both JS-only, so the
    // kill-switch removes the WHOLE group — a visible button that cannot save
    // is worse than no button.
    await expect(page.locator('[data-mark-complete-group]')).toBeHidden();
    await expect(page.locator('[data-mark-complete]')).toBeHidden();
  });
});

test.describe('storage blocked (private mode)', () => {
  test('/learn degrades to its server-rendered state without throwing', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await blockStorage(page);
    await page.goto(LEARN);

    // FIRST, the discriminator: every assertion below also passes on a page
    // whose island never executed at all, which would make this test unable to
    // tell "degrades gracefully" from "died on load" — the exact failure a
    // blocked store causes. `data-track-pending` is server-rendered as "true"
    // and removed by nothing but `renderTracks`, so its absence is proof the
    // island ran to completion WITH the store throwing under it.
    const foundations = page.locator('[data-track-progress="foundations"]');
    await expect(foundations).not.toHaveAttribute('data-track-pending');

    // The CTA keeps the fallback the server rendered…
    await expect(resumeLabel(page)).toHaveText(
      `Start with 01 · ${FIRST_LESSON.title}`,
    );
    // …no card claims a completion that could never have been stored…
    await expect(page.locator('[data-lesson-card][data-complete]')).toHaveCount(
      0,
    );
    // …and the reset control stays inert, because there is provably nothing to
    // delete. It must stay aria-disabled rather than `disabled`, so a reader who
    // has tabbed onto it does not lose focus to <body>.
    const toggle = page.locator('[data-reset-toggle]');
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    // `force`, because Playwright's actionability check reads `aria-disabled`
    // as "not enabled" and would wait forever — a real pointer has no such
    // scruples, and the point of the test is that the handler declines.
    await toggle.click({ force: true });
    await expect(page.locator('[data-reset-panel]')).toBeHidden();

    // No counter may claim progress it cannot read. Zero is the only honest
    // number here (with the store blocked nothing can have been saved), and it
    // is asserted EXACTLY — an empty counter would mean the island stopped
    // before this surface, which is what the pending-attribute check above
    // already refuses to accept.
    await expect(trackCount(page, 'foundations')).toHaveText(
      `0 of ${FOUNDATIONS_TOTAL} done on this device`,
    );
    for (const text of await page
      .locator('[data-track-count]')
      .allTextContents()) {
      expect(text.trim()).toMatch(/^0 of \d+ done on this device$/);
    }

    expect(errors, 'no script may throw when storage is blocked').toEqual([]);
  });

  test('a lesson toggle still works, but never claims it was saved', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await blockStorage(page);
    await page.goto(`/learn/${SECOND_LESSON.slug}`);

    const button = page.locator('[data-mark-complete]');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.click();

    // The toggle reflects the click for this view…
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    // …but the "Saved — N of 15 complete" note stays away, because the read-back
    // that would justify it fails. Promising a save that did not happen is the
    // one thing this surface must not do.
    await expect(page.locator('[data-mark-complete-note]')).toBeHidden();
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// axe: /learn is the one key route the existing six-file matrix misses
// (docs/m7-ux-overhaul.md "Considered & rejected"), and M7.2 is what puts new
// controls on it. Both themes, zero critical AND zero serious: this page ships
// no Shiki code blocks, so the one tracked contrast debt cannot appear here.
// ---------------------------------------------------------------------------
for (const theme of ['light', 'dark'] as const) {
  test(`axe: /learn (${theme} theme) — zero critical, zero serious`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value);
    }, theme);
    // Scan the page with progress ON: the reset panel, the counters and the card
    // checkmarks only exist in that state, and they are exactly what M7.2 added.
    await seedComplete(page, [FIRST_LESSON.slug]);
    await page.goto(LEARN);
    await page.locator('[data-reset-toggle]').click();
    await expect(page.locator('[data-reset-panel]')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.impact} ${v.id}: ${v.help}`);
    expect(blocking).toEqual([]);
  });
}
