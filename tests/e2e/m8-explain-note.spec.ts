/**
 * M8.3 — Explain-it-back: the optional "why does this work?" note
 * (`docs/m8-gamification.md` → "M8.3 — Enrichment"; spec §6 keys, §7's
 * `explainPrompt` frontmatter field).
 *
 * This is the ONLY mechanic in the product that stores free-form reader text,
 * which is why the design calls it "not one component but four obligations":
 * a delete button beside Save, the note named in the reset control's copy, the
 * "saved only in this browser" label adjacent to the textarea, and a `note`
 * field carried through every read-modify-write. Each of those is a test below,
 * and the delete one is the ethics requirement — a privacy promise with no
 * deletion path is an erosion of it — so it is asserted against the WHOLE
 * record (`toEqual`), not against the presence of a note.
 *
 * WHAT IS TESTED HERE VS ELSEWHERE. The record-level forward compatibility (an
 * unknown field surviving a write, the note riding through `writeCheck` and
 * `recordPass`) is pure and lives in `tests/unit/progress.test.ts`. What only a
 * browser can answer is what a reader sees and what lands in `localStorage`
 * when they press the buttons — everything in this file.
 *
 * ADDRESSED THE WAY A READER MEETS IT, not through hooks this suite invented.
 * The prompt is found by the STRING the lesson's frontmatter authors, the
 * controls by their accessible names, and the storage assertions by the two
 * §6 key formats. A test keyed to a class name would pass a note box that had
 * been quietly emptied of its privacy label, and a test that hard-coded a slug
 * would go silently vacuous the day the author moved the prompt to another
 * lesson.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  blockStorage,
  completeKey,
  daysAgo,
  masteryKey,
  readKey,
  seedComplete,
  trackPageErrors,
  writeStorage,
  type MasteryRecord,
} from './utils/mastery';

/** The authored lessons, read from source so no slug is hard-coded here. */
const LESSON_DIR = fileURLToPath(
  new URL('../../src/content/lessons', import.meta.url),
);

/** One published lesson's identity plus the optional §7 prompt field. */
interface AuthoredLesson {
  slug: string;
  /** The `explainPrompt` frontmatter string, or `null` when unauthored. */
  explainPrompt: string | null;
}

/**
 * Reads one scalar frontmatter field.
 *
 * Deliberately refuses YAML block scalars (`>`/`|`) rather than half-parsing
 * them: this file compares the authored prompt to the rendered page character
 * for character, so a value this reader folded differently from Astro's real
 * YAML parser would produce a mismatch that looks like a product bug.
 *
 * @param frontmatter - The text between the two `---` fences.
 * @param field - The key to read.
 * @returns The unquoted value, or `null` when the field is absent.
 */
function scalar(frontmatter: string, field: string): string | null {
  const match = frontmatter.match(
    new RegExp(`^${field}:[ \\t]*(.+?)[ \\t]*$`, 'm'),
  );
  const raw = match?.[1];
  if (raw === undefined) return null;
  if (raw.startsWith('>') || raw.startsWith('|')) {
    throw new Error(
      `${field} is authored as a YAML block scalar; this reader only supports a single-line value.`,
    );
  }
  // Unquoted the way YAML does it, escapes included: a prompt reading
  // `'why doesn''t it overflow?'` renders one apostrophe, and a reader that
  // returned two would fail this file on a page that is perfectly correct.
  if (raw.length > 1 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw.length > 1 && raw.startsWith('"') && raw.endsWith('"')) {
    return JSON.parse(raw) as string;
  }
  return raw;
}

/** Every PUBLISHED lesson, with the prompt field if it carries one. */
function authoredLessons(): AuthoredLesson[] {
  const lessons: AuthoredLesson[] = [];
  for (const file of readdirSync(LESSON_DIR)) {
    if (!file.endsWith('.mdx')) continue;
    const source = readFileSync(join(LESSON_DIR, file), 'utf8');
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
    if (frontmatter === undefined) continue;
    // §15: an unpublished lesson builds no page, so it can neither pass nor
    // fail anything here.
    if (!/^published:[ \t]*true[ \t]*$/m.test(frontmatter)) continue;
    const slug = scalar(frontmatter, 'slug');
    if (slug === null) continue;
    lessons.push({ slug, explainPrompt: scalar(frontmatter, 'explainPrompt') });
  }
  return lessons.sort((a, b) => a.slug.localeCompare(b.slug));
}

const LESSONS = authoredLessons();
const WITH_PROMPT = LESSONS.filter((lesson) => lesson.explainPrompt !== null);
const WITHOUT_PROMPT = LESSONS.filter(
  (lesson) => lesson.explainPrompt === null,
);

/** The lesson under test — the first one that authors a prompt. */
const SUBJECT = WITH_PROMPT[0];

/** A note a reader could plausibly write, and short enough to store whole. */
const NOTE =
  'It works because the array is sorted, so one comparison rules out half of what is left.';

/** The textarea the note is typed into (the site ships no other one). */
const textarea = (page: Page) => page.locator('textarea');

/** The Save control, by its accessible name. */
const saveButton = (page: Page) => page.getByRole('button', { name: /save/i });

/** The Delete control — the design requires it BESIDE Save, never buried. */
const deleteButton = (page: Page) =>
  page.getByRole('button', { name: /delete|remove/i });

/**
 * The note block's rendered text: the smallest element that holds BOTH the
 * textarea and its Save button.
 *
 * Computed rather than selected so the assertions about what sits "adjacent to
 * the textarea" (the privacy label, the prompt) are about what a reader
 * actually sees grouped together, whatever the markup is called.
 *
 * @param page - A lesson page whose note box is on screen.
 * @returns The whitespace-collapsed text, or `null` when there is no note box.
 */
async function noteBlockText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const field = document.querySelector('textarea');
    if (!field) return null;
    let node: HTMLElement | null = field.parentElement;
    while (node) {
      const hasSave = [...node.querySelectorAll('button')].some((button) =>
        /save/i.test(button.textContent ?? ''),
      );
      if (hasSave) return (node.innerText ?? '').replace(/\s+/g, ' ').trim();
      node = node.parentElement;
    }
    return null;
  });
}

/**
 * Types a note and saves it, then waits for the record to actually hold it.
 *
 * Waiting on STORAGE rather than on a status message is deliberate: every
 * assertion that follows a save is about what was persisted, and a test that
 * proceeded on a rendered "Saved" could not tell a real write from a claim.
 *
 * @param page - The lesson page, with the note box on screen.
 * @param slug - The lesson slug, for the record key.
 * @param text - The note to type.
 */
async function saveNote(page: Page, slug: string, text: string): Promise<void> {
  await textarea(page).fill(text);
  await saveButton(page).click();
  await expect
    .poll(
      async () => {
        const raw = await readKey(page, masteryKey(slug));
        return raw === null
          ? null
          : ((JSON.parse(raw) as { note?: unknown }).note ?? null);
      },
      { timeout: 5_000 },
    )
    .not.toBeNull();
}

/** Marks the lesson complete through the real control and waits for the state. */
async function markComplete(page: Page): Promise<void> {
  const button = page.locator('[data-mark-complete]');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

test.describe('the field is authored at all', () => {
  test('at least one lesson authors an explainPrompt', () => {
    // A mechanic with no authored prompt is dead code: spec §7 makes the field
    // optional per lesson, so the only thing that can prove Explain-it-back
    // ships is a lesson that carries one. Every other test in this file is
    // skipped when this one fails, so the report says "unauthored" once instead
    // of timing out nine times on `/learn/undefined`.
    expect(
      WITH_PROMPT.map((lesson) => lesson.slug),
      'no published lesson authors an `explainPrompt` (spec §7)',
    ).not.toEqual([]);
  });
});

test.describe('the prompt appears exactly where it was authored', () => {
  test.skip(SUBJECT === undefined, 'no lesson authors an explainPrompt');

  test('a lesson with a prompt shows nothing until it is marked complete', async ({
    page,
  }) => {
    const lesson = SUBJECT!;
    await page.goto(`/learn/${lesson.slug}`);

    // Before the reader says they finished: no box, no prompt, nothing to
    // answer. The design places the note AFTER completion — self-explanation
    // of a lesson nobody has read yet is a prompt with no referent.
    //
    // Asserted as HIDDEN rather than absent: `toBeHidden()` is satisfied by an
    // element that does not exist as well as by one the island has not revealed
    // yet, so this passes for either shape the component takes and fails for the
    // one thing that is wrong — a note box a reader can reach before they have
    // said they finished.
    await expect(textarea(page)).toBeHidden();
    await expect(saveButton(page)).toBeHidden();
    expect(await page.locator('body').innerText()).not.toContain(
      lesson.explainPrompt!,
    );

    await markComplete(page);

    // …and immediately afterwards, without a reload: the design mounts this by
    // delegating a click listener on `[data-mark-complete]`. Visibility, not
    // presence: a textarea nobody can see is not an affordance. (Each locator
    // resolves to exactly one element or Playwright's strict mode fails the
    // assertion, so this is also where "one Save, one Delete" is pinned.)
    await expect(textarea(page)).toBeVisible();
    await expect(saveButton(page)).toBeVisible();
    await expect(deleteButton(page)).toBeVisible();
    await expect(
      page.getByText(lesson.explainPrompt!, { exact: false }),
    ).toBeVisible();

    // The textarea is a real, named field — a bare box with no accessible name
    // is unusable by a screen reader (WCAG 2.1 AA, spec §14).
    const name = await textarea(page).evaluate((field) => {
      const labelled = field.getAttribute('aria-label');
      if (labelled) return labelled;
      const by = field.getAttribute('aria-labelledby');
      if (by) return document.getElementById(by)?.textContent ?? '';
      const id = field.id;
      return id
        ? (document.querySelector(`label[for="${id}"]`)?.textContent ?? '')
        : (field.closest('label')?.textContent ?? '');
    });
    expect(
      name.trim().length,
      'the note field has no accessible name',
    ).toBeGreaterThan(0);

    // On a return visit the box is still there, because completion persisted.
    await page.reload();
    await expect(textarea(page)).toBeVisible();
  });

  test('a lesson without a prompt shows no note box, even when complete', async ({
    page,
  }) => {
    test.skip(
      WITHOUT_PROMPT.length === 0,
      'every published lesson authors an explainPrompt',
    );
    const lesson = WITHOUT_PROMPT[0]!;
    await page.goto(`/learn/${lesson.slug}`);
    await markComplete(page);

    // The field is optional per lesson (spec §7), so an unauthored lesson must
    // stay exactly as it was: no box, no buttons, no orphaned label.
    await expect(textarea(page)).toBeHidden();
    await expect(saveButton(page)).toBeHidden();
    await expect(deleteButton(page)).toBeHidden();
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/why does (this|it) work/i);
  });

  test('every authored prompt reaches its own lesson, verbatim', async ({
    page,
  }) => {
    // One navigation per authored lesson, so the budget is a multiple of the
    // curriculum rather than of one page. `test.slow()` rather than a bespoke
    // timeout: it scales with whatever the project timeout is, on whatever
    // machine is running.
    test.slow();
    // The prompt is the label AND the field's accessible name, so a lesson
    // whose frontmatter never reached the component ships a box asking nothing.
    // Checked across the whole curriculum rather than on one lesson: this is the
    // only assertion that would catch a prompt authored into a lesson the layout
    // does not pass it through, and the authored set is what a content change
    // moves.
    // Seeded through the shared helper, which builds the key from
    // `completeKey`: a test that retyped that template literal could keep
    // passing after the product renamed it.
    await seedComplete(
      page,
      WITH_PROMPT.map((lesson) => lesson.slug),
    );

    for (const lesson of WITH_PROMPT) {
      await page.goto(`/learn/${lesson.slug}`);
      await expect(
        textarea(page),
        `${lesson.slug} shows no note box`,
      ).toBeVisible();
      // The authored question, character for character — a component that
      // decorated it would be answering for the author.
      await expect(
        page.getByText(lesson.explainPrompt!, { exact: false }),
        `${lesson.slug} does not render its own prompt`,
      ).toBeVisible();
    }
  });
});

test.describe('what a save actually stores', () => {
  test.skip(SUBJECT === undefined, 'no lesson authors an explainPrompt');

  test('the note lands in the EXISTING record and mints no key of its own', async ({
    page,
  }) => {
    const lesson = SUBJECT!;
    await page.goto(`/learn/${lesson.slug}`);
    await markComplete(page);
    await saveNote(page, lesson.slug, NOTE);

    // It is a field of `progress:v1:{slug}` — the key spec §6 already permits
    // and the reset control already clears — so no migration and no new key.
    const record = JSON.parse(
      (await readKey(page, masteryKey(lesson.slug)))!,
    ) as {
      note?: unknown;
    };
    expect(record.note).toBe(NOTE);

    // Nothing anywhere else in the store holds it, and every key present is one
    // §6 enumerates. Asserted over the WHOLE origin: "no new storage key" is a
    // claim about the store, not about the record.
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    const permitted =
      /^(lesson:[a-z0-9-]+:complete|progress:v1:[a-z0-9-]+|ld:(challenges|finalrun|days):v1|theme|pref:(viz-speed|code-lang))$/;
    for (const key of keys) {
      expect(key, `${key} is not a key spec §6 permits`).toMatch(permitted);
      expect(key, 'the note must not get a key of its own').not.toMatch(
        /note|explain/i,
      );
    }

    // The reader's words are stored verbatim — a note that came back mangled
    // would make the replay below a misquote.
    await page.reload();
    await expect(textarea(page)).toHaveValue(NOTE);
  });

  test('a long note is bounded before it reaches storage', async ({ page }) => {
    // The design specifies a 280-character note. The cap matters because this
    // is reader-supplied text going into a shared 5 MB origin quota: unbounded,
    // one paste can cost the reader every other record on the device.
    const lesson = SUBJECT!;
    await page.goto(`/learn/${lesson.slug}`);
    await markComplete(page);
    await expect(textarea(page)).toHaveAttribute('maxlength', /^\d+$/);
    const limit = Number(await textarea(page).getAttribute('maxlength'));
    expect(limit, 'the note cap is missing or implausible').toBeLessThanOrEqual(
      300,
    );
    expect(limit).toBeGreaterThan(0);
  });

  test('deleting removes the note and NOTHING else', async ({ page }) => {
    // THE ETHICS TEST. The delete path is what makes the privacy label true, so
    // it is asserted against the whole record: a delete that also dropped the
    // reader's practice history would be a data loss dressed as a privacy
    // control.
    const lesson = SUBJECT!;
    const stored: MasteryRecord = {
      practicedAt: daysAgo(12),
      masteredAt: daysAgo(2),
      checks: [1, 1, 1],
      intervalIndex: 1,
      lastReviewAt: daysAgo(2),
    };
    await page.goto(`/learn/${lesson.slug}`);
    // Written after the first navigation, not through an init script: an init
    // script re-runs on every `goto` and would overwrite the note this test is
    // about to save.
    await writeStorage(page, {
      [completeKey(lesson.slug)]: '1',
      [masteryKey(lesson.slug)]: JSON.stringify(stored),
    });
    await page.reload();

    await saveNote(page, lesson.slug, NOTE);
    // The save carried every existing field through untouched…
    expect(JSON.parse((await readKey(page, masteryKey(lesson.slug)))!)).toEqual(
      { ...stored, note: NOTE },
    );

    await deleteButton(page).click();
    // …and the delete took exactly one field back out.
    await expect
      .poll(async () =>
        JSON.parse((await readKey(page, masteryKey(lesson.slug)))!),
      )
      .toEqual(stored);

    // The reader sees the deletion too: an empty box, not their words still on
    // screen beside a claim that they are gone.
    await expect(textarea(page)).toHaveValue('');
    await page.reload();
    await expect(textarea(page)).toHaveValue('');
    // Completion and the record survive, so nothing else the reader earned
    // went with the note.
    expect(await readKey(page, completeKey(lesson.slug))).toBe('1');
  });

  test('a note earns nothing — no stage, no tally, no count moves', async ({
    page,
  }) => {
    // Self-explanation is its own reward and is never graded: the design's one
    // currency is mastery, and writing a sentence is not retrieval practice.
    const lesson = SUBJECT!;
    await page.goto(`/learn/${lesson.slug}`);
    await markComplete(page);

    const pips = page.locator('[data-lesson-stage] [data-mastery-pips]');
    await expect(pips).toHaveAttribute('data-stage', 'learned');
    const tallyBefore = await page
      .locator('[data-practice-tally]')
      .first()
      .textContent();

    await saveNote(page, lesson.slug, NOTE);

    await expect(pips).toHaveAttribute('data-stage', 'learned');
    expect(
      await page.locator('[data-practice-tally]').first().textContent(),
    ).toBe(tallyBefore);

    const record = JSON.parse(
      (await readKey(page, masteryKey(lesson.slug)))!,
    ) as MasteryRecord & { note?: string };
    // The two timestamps that ARE the Practiced and Mastered stages stay empty,
    // and no self-grade was invented on the reader's behalf.
    expect(record.practicedAt ?? null).toBeNull();
    expect(record.masteredAt ?? null).toBeNull();
    expect((record.checks ?? []).filter((check) => check === 1)).toEqual([]);

    // …and the macro counters agree: a note moves no number on `/learn`.
    await page.goto('/learn');
    await expect(
      page.locator('[data-track-progress] [data-track-mastery]').first(),
    ).toHaveText('Practiced 0 · Mastered 0');
  });
});

test.describe('the note comes back at review time', () => {
  test.skip(SUBJECT === undefined, 'no lesson authors an explainPrompt');

  test('a due review replays what the reader wrote', async ({ page }) => {
    // Elaborative interrogation only pays off if the reader meets their own
    // earlier explanation again — that replay is the mechanic, not decoration.
    const lesson = SUBJECT!;
    const due: MasteryRecord & { note: string } = {
      practicedAt: daysAgo(30),
      masteredAt: null,
      checks: [1, 1, 1],
      intervalIndex: 0,
      lastReviewAt: null,
      note: NOTE,
    };
    await page.goto('/learn');
    await writeStorage(page, {
      [completeKey(lesson.slug)]: '1',
      [masteryKey(lesson.slug)]: JSON.stringify(due),
    });

    // The review path as the product defines it: the strip's deep link.
    const surfaces = [`/learn/${lesson.slug}?review=1#practice`, '/learn'];
    const seen: string[] = [];
    let replay: string | null = null;
    for (const path of surfaces) {
      await page.goto(path);
      const text = await page.locator('body').innerText();
      seen.push(path);
      if (text.includes(NOTE)) {
        replay = text;
        break;
      }
    }
    expect(
      replay,
      `the stored note was replayed on none of: ${seen.join(', ')}`,
    ).not.toBeNull();
    // Framed as the reader's own past words, not as an authored answer —
    // "You wrote last time: …" is the design's phrasing.
    expect(replay!).toMatch(
      /(you wrote|wrote last time|last time you|earlier you)/i,
    );
  });
});

test.describe('the promises around the note', () => {
  test.skip(SUBJECT === undefined, 'no lesson authors an explainPrompt');

  test("the privacy label sits with the textarea, in the reader's words", async ({
    page,
  }) => {
    const lesson = SUBJECT!;
    await page.goto(`/learn/${lesson.slug}`);
    await markComplete(page);

    const block = await noteBlockText(page);
    expect(
      block,
      'no element holds both the textarea and its Save button',
    ).not.toBeNull();
    // "Privacy is a feature" is only true if the reader is told where their
    // words go — and this is the one surface storing text they authored.
    expect(block!).toMatch(/(this browser|this device)/i);
  });

  test('the reset control names the note it is about to delete', async ({
    page,
  }) => {
    // One of the design's four obligations: "the note named in the reset
    // control's warning and announcement copy". A delete the reader confirms
    // must describe what actually goes.
    const lesson = SUBJECT!;
    await page.goto('/learn');
    await writeStorage(page, {
      [masteryKey(lesson.slug)]: JSON.stringify({
        practicedAt: null,
        masteredAt: null,
        checks: [],
        note: NOTE,
      }),
    });
    await page.reload();

    const toggle = page.locator('[data-reset-toggle]');
    await expect(toggle).toHaveAttribute('aria-disabled', 'false');
    await toggle.click();
    await expect(page.locator('[data-reset-warn]')).toHaveText(/\bnotes?\b/i);

    await page.locator('[data-reset-confirm]').click();
    await expect(page.locator('[data-progress-status]')).not.toHaveText('');
    expect(await readKey(page, masteryKey(lesson.slug))).toBeNull();
  });

  test('nothing claims a save that did not happen when storage is blocked', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await blockStorage(page);
    const lesson = SUBJECT!;
    await page.goto(`/learn/${lesson.slug}`);

    const mark = page.locator('[data-mark-complete]');
    await mark.click();
    await expect(mark).toHaveAttribute('aria-pressed', 'true');

    const before = await page.locator('body').innerText();
    if (await textarea(page).isVisible()) {
      // Either state is honest here — the box may appear and refuse to promise
      // anything, or stay away because nothing it wrote could be kept. What is
      // never allowed is a claim.
      await textarea(page).fill(NOTE);
      await saveButton(page).click();
    }
    const after = await page.locator('body').innerText();

    const added = after
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !before.includes(line));
    for (const line of added) {
      const claimsASave =
        /\bsaved\b/i.test(line) &&
        !/\b(not|no|couldn't|could not|cannot|can't|unable|isn't|won't)\b/i.test(
          line,
        );
      expect(claimsASave, `"${line}" claims a save that never landed`).toBe(
        false,
      );
    }
    expect(errors, 'no script may throw when storage is blocked').toEqual([]);
  });
});

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });
  test.skip(SUBJECT === undefined, 'no lesson authors an explainPrompt');

  test('no textarea, no buttons, and no prompt left dangling', async ({
    page,
  }) => {
    const lesson = SUBJECT!;
    await page.goto(`/learn/${lesson.slug}`);

    // Every M8 component ships its own `<noscript>` kill-switch. A note box
    // with no script cannot save anything, and a prompt with no box is an
    // instruction the reader cannot follow.
    await expect(textarea(page)).toBeHidden();
    await expect(saveButton(page)).toBeHidden();
    await expect(deleteButton(page)).toBeHidden();

    const text = await page.locator('body').innerText();
    expect(
      text,
      'the prompt is dangling with no way to answer it',
    ).not.toContain(lesson.explainPrompt!);
    expect(text).not.toMatch(/you wrote last time/i);

    // DISCRIMINATOR: the M7 lesson underneath is intact, so the absences above
    // are a kill-switch and not a page that failed to render.
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
    await expect(page.locator('[data-practice-check]').first()).toBeVisible();
  });
});

test.describe('reachable by keyboard, and never a focus trap', () => {
  test.skip(SUBJECT === undefined, 'no lesson authors an explainPrompt');

  test('deleting keeps focus on the control that did it', async ({ page }) => {
    // M7.1 CMP-3, applied to the one destructive control in a lesson: Delete
    // must be `aria-disabled`, never `disabled`, because it is exactly where
    // focus stands the instant the note goes — and a real `disabled` would drop
    // that focus onto <body>, stranding a keyboard reader mid-page.
    const lesson = SUBJECT!;
    await page.goto(`/learn/${lesson.slug}`);
    await markComplete(page);
    await saveNote(page, lesson.slug, NOTE);

    const remove = deleteButton(page);
    await expect(remove).toHaveAttribute('aria-disabled', 'false');
    await remove.click();

    await expect(remove).toBeFocused();
    await expect(remove).toHaveAttribute('aria-disabled', 'true');
    await expect(remove).not.toHaveAttribute('disabled', /.*/);
    // The outcome is announced, not merely drawn — the reader who cannot see
    // the emptied box is told it is empty.
    await expect(
      page.locator('[role="status"]').filter({ hasText: /delete/i }),
    ).toHaveCount(1);
  });

  test('the whole flow is typeable and pressable from the keyboard alone', async ({
    page,
  }) => {
    const lesson = SUBJECT!;
    await page.goto(`/learn/${lesson.slug}`);
    await markComplete(page);

    // Real focus, real keystrokes: `fill()` would set the value without ever
    // proving the field can be reached or typed into.
    await textarea(page).focus();
    await expect(textarea(page)).toBeFocused();
    await page.keyboard.type('Because the array is sorted.');
    await saveButton(page).focus();
    await page.keyboard.press('Enter');

    await expect
      .poll(async () => {
        const raw = await readKey(page, masteryKey(lesson.slug));
        return raw === null
          ? null
          : ((JSON.parse(raw) as { note?: unknown }).note ?? null);
      })
      .toBe('Because the array is sorted.');
  });
});

// ---------------------------------------------------------------------------
// axe, on the state that only exists after a reader acts.
//
// Scoped to the note box (through the hook the component itself ships, the way
// `m8-practice-check.spec.ts` scopes to `[data-practice-check]`) so this can
// gate at zero SERIOUS as well as zero critical: the whole-page scans elsewhere
// carry the tracked Shiki code-comment contrast debt, and a box holding a
// labelled field, a live region and two buttons should meet a stricter bar than
// the page it sits in.
// ---------------------------------------------------------------------------
for (const theme of ['light', 'dark'] as const) {
  test(`axe: the note box (${theme} theme) — zero critical, zero serious`, async ({
    page,
  }) => {
    test.skip(SUBJECT === undefined, 'no lesson authors an explainPrompt');
    const lesson = SUBJECT!;
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value);
    }, theme);
    await page.goto(`/learn/${lesson.slug}`);
    await markComplete(page);
    await saveNote(page, lesson.slug, NOTE);

    const results = await new AxeBuilder({ page })
      .include('[data-explain-back]')
      .analyze();
    const blocking = results.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.impact} ${v.id}: ${v.help}`);
    expect(blocking).toEqual([]);
  });
}
