// Client module for the Practice questions
// (`src/components/PracticeCheck.tsx`): the legacy `PracticeCheck.astro`
// `<script>`, moved verbatim (React migration plan §5 P2 WS-C step 4). Loaded
// as a `<script type="module">` on every page that renders the component.
import {
  countPassed,
  onRestore,
  readMastery,
  recordPass,
  writeCheck,
} from '../../lib/progress';
import type { MasteryRecord } from '../../lib/progress';

/** One rendered question and the nodes its state drives. */
interface Question {
  /**
   * This question's position in the store's `checks[]`: the 1-based `index`
   * prop minus one. The conversion happens here and nowhere else, so the
   * author-facing question number and the storage position cannot drift.
   */
  slot: number;
  /** How many questions this lesson's Practice section has. */
  total: number;
  had: HTMLButtonElement;
  not: HTMLButtonElement;
  /** The "N of M answered / Saved on this device only." line, if present. */
  saved: HTMLElement | null;
  tally: HTMLElement | null;
}

/** The grade shown as chosen on one question's pair of buttons. */
type Choice = 'had' | 'not';

/** Questions grouped by the lesson whose record they write to. */
const bySlug = new Map<string, Question[]>();
/** The one polite live region per lesson (rendered by question 1). */
const statusBySlug = new Map<string, HTMLElement>();
/** The record as the store last returned it — what the tally is painted from. */
const recordBySlug = new Map<string, MasteryRecord>();
/**
 * Claims the store did NOT take, kept for this visit only. Blocked storage is
 * what produces one: nothing persists, but the button still has to answer the
 * click (MarkComplete's rule — the view updates, only the saved note is
 * withheld). The entry is decided by comparing the record the store RETURNS
 * against what was pressed, never by assuming which writes it accepts, so any
 * grade it declines is covered by the same three lines. Everything else is
 * painted straight from the record, so a clear from another tab wins at the
 * next repaint.
 */
const claimsBySlug = new Map<string, Map<number, Choice>>();
/**
 * Questions graded "I had it" IN THIS VISIT, per lesson. A re-pass is the one
 * thing storage cannot show — a second pass writes the same `1`s the first one
 * did — so this per-visit set is what lets the store stamp Mastered on a
 * return visit. In memory only: never `sessionStorage`, which spec §6 forbids.
 */
const passedBySlug = new Map<string, Set<number>>();

/** The per-visit claim map for one lesson, created on first use. */
function claimsOf(slug: string): Map<number, Choice> {
  const existing = claimsBySlug.get(slug);
  if (existing) return existing;
  const created = new Map<number, Choice>();
  claimsBySlug.set(slug, created);
  return created;
}

/** The per-visit "I had it" set for one lesson, created on first use. */
function passedOf(slug: string): Set<number> {
  const existing = passedBySlug.get(slug);
  if (existing) return existing;
  const created = new Set<number>();
  passedBySlug.set(slug, created);
  return created;
}

/** The lesson's record, read through the store on first use. */
function recordOf(slug: string): MasteryRecord {
  const existing = recordBySlug.get(slug);
  if (existing) return existing;
  const read = readMastery(slug);
  recordBySlug.set(slug, read);
  return read;
}

/**
 * The one sentence both the visible tally and the live region carry — built
 * here so the two can never word it differently.
 *
 * It describes ACTIVITY, not achievement: the count is of questions ANSWERED,
 * so an honest "Not yet" moves it forward exactly as "I had it" does. A tally
 * of passes only would meet the reader's first honest self-report with a zero,
 * which is the loss frame the design killed XP and streaks to avoid.
 *
 * `''` means nothing for this lesson is on disk, which is what keeps the
 * "Saved on this device only." line hidden: with storage blocked the record
 * never gains an answer, so the promise is never made.
 */
function tallyText(slug: string): string {
  const total = (bySlug.get(slug) ?? [])[0]?.total ?? 0;
  // `countPassed` counts the `1`s inside the lesson's question window, so
  // every ANSWERED grade is projected to `1` first: this line asks how many
  // questions were answered, not how many were passed. The window rule — only
  // indices 0…total-1 count, so a grade left behind by a question the lesson
  // has since dropped can never read as "4 of 3" — stays in the store, where
  // the Practiced bar reads it too.
  const answered = countPassed(
    recordOf(slug).checks.map((check) => (check === null ? null : 1)),
    total,
  );
  return answered > 0 ? `${answered} of ${total} answered` : '';
}

/** The grade to show as chosen: this visit's refused claim, else the record. */
function chosen(slug: string, slot: number): Choice | null {
  const claim = claimsOf(slug).get(slot);
  if (claim) return claim;
  const stored = recordOf(slug).checks[slot];
  if (stored === 1) return 'had';
  if (stored === 0) return 'not';
  return null;
}

/** Paints every question of one lesson. Silent — announcing is separate. */
function render(slug: string): void {
  const text = tallyText(slug);
  for (const question of bySlug.get(slug) ?? []) {
    const choice = chosen(slug, question.slot);
    question.had.setAttribute(
      'aria-pressed',
      choice === 'had' ? 'true' : 'false',
    );
    question.not.setAttribute(
      'aria-pressed',
      choice === 'not' ? 'true' : 'false',
    );
    if (question.tally) question.tally.textContent = text;
    // No text means no answer reached the disk (see `tallyText`), so the line
    // stays hidden rather than claiming a save that did not happen.
    if (question.saved) question.saved.hidden = !text;
  }
}

/**
 * Announces the tally politely — but ONLY when the words actually changed.
 *
 * Rewriting a live region with an identical string still re-announces it, so a
 * click that moves the tally nowhere would repeat it: pressing the same grade
 * twice, or regrading a question that already counted as answered. Neither act
 * goes unspoken — the `aria-pressed` flip announces the button itself, which is
 * also why this region carries the tally ALONE (M7.1 CMP-4 — two announcements
 * for one action read as a stutter).
 *
 * Only ever called from a click, so the region stays empty on load.
 */
function announce(slug: string): void {
  const status = statusBySlug.get(slug);
  if (!status) return;
  const text = tallyText(slug);
  if (status.textContent === text) return;
  status.textContent = text;
}

/** Records one self-grade and repaints the lesson's questions. */
function grade(slug: string, question: Question, value: 0 | 1): void {
  // The store is the only writer of `progress:v1:{slug}`: it owns the value
  // range, the Practiced stamp and every storage guard, and it returns the
  // record as it now really stands (a blocked write returns the previous one).
  let record = writeCheck(slug, question.slot, question.total, value);

  const passed = passedOf(slug);
  if (value === 1) passed.add(question.slot);
  else passed.delete(question.slot);
  // Meeting the bar again within one visit is the re-pass the store cannot
  // see; three or more days after the first pass it is what earns Mastered.
  // Safe on the first pass too — the gate is then zero days old and the store
  // returns the record unchanged.
  if (passed.size >= question.total) record = recordPass(slug);

  recordBySlug.set(slug, record);

  // Keep a claim only where the store did not take this grade, so the record
  // stays the source of truth everywhere else.
  const claims = claimsOf(slug);
  if (record.checks[question.slot] === value) claims.delete(question.slot);
  else claims.set(question.slot, value === 1 ? 'had' : 'not');

  render(slug);
  announce(slug);
}

/** Re-reads the record and drops this visit's refused claims, then repaints. */
function refresh(slug: string): void {
  recordBySlug.set(slug, readMastery(slug));
  claimsOf(slug).clear();
  render(slug);
}

for (const root of Array.from(
  document.querySelectorAll<HTMLElement>('[data-practice-check]'),
)) {
  const slug = root.dataset['slug'] ?? '';
  const index = Number(root.dataset['index']);
  const total = Number(root.dataset['total']);
  const had = root.querySelector<HTMLButtonElement>(
    '[data-practice-grade="had"]',
  );
  const not = root.querySelector<HTMLButtonElement>(
    '[data-practice-grade="not"]',
  );
  // A malformed instance is skipped rather than throwing: one bad question
  // must not cost the reader the other two.
  if (!slug || !had || !not) continue;
  if (!Number.isInteger(index) || index < 1) continue;
  if (!Number.isInteger(total) || total < index) continue;

  const question: Question = {
    slot: index - 1,
    total,
    had,
    not,
    saved: root.querySelector<HTMLElement>('[data-practice-saved]'),
    tally: root.querySelector<HTMLElement>('[data-practice-tally]'),
  };
  const group = bySlug.get(slug);
  if (group) group.push(question);
  else bySlug.set(slug, [question]);

  const status = root.querySelector<HTMLElement>('[data-practice-status]');
  if (status && !statusBySlug.has(slug)) statusBySlug.set(slug, status);

  // Hydrated: the buttons ship `disabled` so a click before this line cannot
  // look like it worked (the Visualizer's A3 pattern).
  had.disabled = false;
  not.disabled = false;
  had.addEventListener('click', () => grade(slug, question, 1));
  not.addEventListener('click', () => grade(slug, question, 0));
}

for (const slug of bySlug.keys()) render(slug);

// A back/forward-cache restore replays no script, so a reader who graded a
// question, navigated away and came Back would meet the DOM exactly as they
// left it — including grades another tab has since cleared. Repaint from
// storage, but stay silent: nobody just acted.
onRestore(() => {
  for (const slug of bySlug.keys()) refresh(slug);
});
