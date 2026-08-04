/**
 * Learning Days — the anti-streak (`docs/m8-gamification.md`, M8.3; spec §6's
 * `ld:days:v1`).
 *
 * ONE NUMBER: how many calendar days this device has seen an explicit learning
 * act on. It exists **because daily streaks were killed** — "pedagogically
 * backwards (the spacing effect says the gap is the point) and a loss-aversion
 * guilt mechanic that manufactures a quit moment" — and it is the shape the
 * design calls "the honest ceiling". Every rule below follows from that:
 *
 * - **Monotonic.** Nothing here ever writes a count lower than the one it read,
 *   and no gap is ever inspected. A reader who comes back after six months finds
 *   their number where they left it, one higher. There is therefore no state in
 *   which a broken chain could be rendered, which is the entire point.
 * - **`{ count, last }` and nothing else.** No history array: a per-day ledger is
 *   the one genuinely sensitive artifact this product could hold, it is what
 *   would make a chain drawable, and it enables nothing any surface shows.
 *   {@link recordLearningDay} writes exactly those two fields.
 * - **Explicit acts only.** This module writes when a CALLER says a learning act
 *   happened; it observes nothing itself. Spec §6 bans behavioral tracking, and a
 *   counter that ticked on arrival would be attendance — the very goal the design
 *   refuses to set. The callers are `LessonLayout`'s island (a completion click, a
 *   practice self-grade) and any writer that announces a landed retrieval pass on
 *   `PROGRESS_CHANGED_EVENT`.
 * - **No target, ever.** {@link learningDaysLine} states a fact and asks for
 *   nothing; a target would re-create the attendance goal by the back door.
 *
 * PURE/IMPURE SPLIT, as everywhere else here (mirroring `resolveTheme` in
 * `src/lib/theme.ts` and the mastery half of `src/lib/progress.ts`): the day
 * boundary and the increment rule are pure functions with an injected clock, so
 * Vitest can test them in `node` with no DOM and no `localStorage`; the two
 * storage wrappers degrade to "nothing recorded" instead of throwing.
 *
 * WHY ITS OWN MODULE rather than more of `src/lib/progress.ts`: this key has no
 * relationship to a lesson, and `progress.ts`'s rule is that the module which
 * WRITES a key owns its name and its delete path — the same rule that moved the
 * two enrichment keys into `src/lib/enrichment-store.ts`. `progress.ts` imports
 * {@link resetLearningDays} and {@link hasLearningDays} from here for the reset
 * control, exactly as it imports the enrichment pair from there.
 */

/**
 * Spec §6's learning-days key — GLOBAL, not per lesson.
 *
 * The version sits in the KEY: an incompatible shape moves to `ld:days:v2` and
 * this reader ignores the unknown version by construction rather than
 * mis-parsing it.
 */
export const LEARNING_DAYS_KEY = 'ld:days:v1';

/** The stored value: a count, and the day stamp that count last moved on. */
export interface LearningDays {
  /** Days with at least one explicit learning act. Only ever goes up. */
  count: number;
  /**
   * The day stamp {@link dayStamp} produced when the count last moved — the ONE
   * thing needed to answer "has today already been counted?".
   *
   * Never a list, and never read as a date: it is compared for equality with
   * today's stamp and nothing else, so no surface can derive a gap from it.
   */
  last: string;
}

/**
 * `localStorage`, or `null` when it is unavailable.
 *
 * A deliberate third copy of the same private helper `src/lib/progress.ts` and
 * `src/lib/enrichment-store.ts` each keep (neither exports one), for the reason
 * recorded there: both failure shapes must be handled identically — an absent
 * global (the build's Node pass, some privacy modes) and a getter that throws
 * (Safari's blocked-methods mode).
 */
function getStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Today, as the reader's own calendar sees it: `YYYY-MM-DD` in LOCAL time.
 *
 * Local rather than UTC because "a day" here means the reader's day — a study
 * session at 23:30 and one at 00:30 are two days to them, and a UTC stamp would
 * disagree with that by up to 14 hours. Built from the local getters rather than
 * `toISOString()` (which converts to UTC) or `toLocaleDateString()` (whose format
 * varies by locale, and this string is compared for equality, not displayed).
 *
 * @param now - The moment to stamp (injected in tests).
 * @returns The local calendar day, e.g. `2026-08-04`.
 */
export function dayStamp(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Parses the stored value defensively.
 *
 * Same contract as `parseLessonRefs` in `src/lib/progress.ts`: the value crosses
 * a boundary this module does not control (another tab, a hand edit, a truncated
 * write), so anything unusable degrades to "nothing recorded" rather than
 * throwing inside an island or painting a `NaN`.
 *
 * `last` is kept as WHATEVER STRING is stored, not validated against a format.
 * It is only ever compared with today's stamp for equality, so a value this
 * version did not write simply reads as "not today" — one extra count at worst,
 * never a lost one, and the next write replaces it with a canonical stamp.
 *
 * @param raw - The raw `localStorage` value, or `null`.
 * @returns The record, or `null` when there is nothing usable stored.
 */
export function parseLearningDays(raw: string | null): LearningDays | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const { count, last } = parsed as { count?: unknown; last?: unknown };
  // A count that is not a whole, positive, representable number is not a count.
  // `Number.isSafeInteger` also rejects `NaN`, `Infinity` and a hand-edited
  // 1e30, none of which any surface could honestly render.
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) {
    return null;
  }
  return { count, last: typeof last === 'string' ? last : '' };
}

/**
 * The increment rule — pure, so the day boundary is testable without a clock.
 *
 * Returns `null` for "nothing to write", which is what makes the once-per-day
 * cap a property of the RULE rather than of a caller remembering to check: two
 * acts on one day produce one write, and the stamp does not move on the second.
 *
 * Monotonic by construction: the only arithmetic here is `+ 1`, and the stored
 * count is never compared against a date. A clock that jumped backwards can
 * therefore cost an extra count and can never cost the reader one.
 *
 * @param stored - The record on the device, or `null` when there is none.
 * @param today - Today's stamp, from {@link dayStamp}.
 * @returns The record to write, or `null` when today is already counted.
 */
export function nextLearningDays(
  stored: LearningDays | null,
  today: string,
): LearningDays | null {
  if (!stored) return { count: 1, last: today };
  if (stored.last === today) return null;
  return { count: stored.count + 1, last: today };
}

/**
 * Reads the count on this device.
 *
 * @returns The record, or `null` when nothing is stored, the value is unusable,
 * or storage is unavailable — all three of which render as no line at all
 * rather than as a zero nobody could verify.
 */
export function readLearningDays(): LearningDays | null {
  const store = getStore();
  if (!store) return null;
  try {
    return parseLearningDays(store.getItem(LEARNING_DAYS_KEY));
  } catch {
    return null;
  }
}

/**
 * Is the key PRESENT on this device?
 *
 * Presence, not parseability, and for the same reason `storedProgress` counts
 * completion marks by presence: {@link resetLearningDays} deletes any value that
 * is there, so a control that asked "is it readable?" would tell a reader
 * holding a corrupt record that there was nothing to clear — and then delete it.
 *
 * @returns True when `ld:days:v1` exists; false when it does not, or when
 * storage cannot be read.
 */
export function hasLearningDays(): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    return store.getItem(LEARNING_DAYS_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Records that an explicit learning act happened NOW — at most once per calendar
 * day.
 *
 * The caller decides what counts, because only it can see the act; this function
 * decides whether the day is already counted. Nothing here observes the reader,
 * so a page that is merely open, scrolled or reloaded never reaches it.
 *
 * Idempotent within a day, which is what lets every caller call it
 * unconditionally: the second act of the day reads, finds today's stamp, and
 * writes nothing.
 *
 * @param now - The moment of the act (injected in tests).
 * @returns The record as it now stands, or `null` when storage is unavailable
 * and nothing could be kept. A failed write returns the previously stored
 * record, so no caller can render a count that did not land.
 */
export function recordLearningDay(now: Date = new Date()): LearningDays | null {
  const store = getStore();
  if (!store) return null;
  const stored = readLearningDays();
  const next = nextLearningDays(stored, dayStamp(now));
  if (!next) return stored;
  try {
    // Exactly the two fields, serialised from a fresh object literal: the shape
    // is the design's whole data model for this key, so it is stated here rather
    // than spread from whatever happened to be on the device.
    store.setItem(
      LEARNING_DAYS_KEY,
      JSON.stringify({ count: next.count, last: next.last }),
    );
    return next;
  } catch {
    return stored;
  }
}

/**
 * Removes the count — the delete half, shipped with the read half so this
 * number is never one-way.
 *
 * Called by the reset-progress control through `src/lib/progress.ts`, which owns
 * the delete list; spec §6 lists this as a PROGRESS key, so a reset that skipped
 * it would keep a record the reader asked to delete.
 *
 * @returns 1 when a stored key was removed, 0 otherwise (including a blocked
 * store), so the caller never reports a removal that failed.
 */
export function resetLearningDays(): number {
  const store = getStore();
  if (!store) return 0;
  try {
    if (store.getItem(LEARNING_DAYS_KEY) === null) return 0;
    store.removeItem(LEARNING_DAYS_KEY);
    return 1;
  } catch {
    return 0;
  }
}

/**
 * The one sentence this feature says — exported so the vocabulary rules are a
 * unit test rather than a review habit, exactly as `REVIEW_COPY` is.
 *
 * WHAT IS ABSENT IS THE DESIGN: no target, no fraction, no comparison, no gap,
 * no chain, no calendar, no "current" anything, and nothing that could be true
 * for only a moment. What is PRESENT is the device scope every persistent
 * surface in this product owes the reader, and the promise stated out loud in
 * the design's own words — "there's no streak to break here", plus the reason it
 * is true: the number cannot fall.
 *
 * NAMING THE KILLED MECHANIC IS THE POINT, and the one place this product is
 * allowed to. A reader arriving from an app that punishes gaps will assume this
 * number does too, and the honest answer to an assumption is to address it
 * rather than to hope it goes unmade; `docs/m8-gamification.md` specifies this
 * sentence for exactly that reason. The page-wide vocabulary scans therefore
 * strip an explicit DENIAL before applying the ban, so "no streak" passes while
 * anything that renders one still fails.
 *
 * @param count - Days recorded on this device.
 * @returns The line, or `''` for a count of zero — there is no line to draw for
 * a reader who has not acted yet, and an empty state here would be exactly the
 * guilt the design forbids.
 */
export function learningDaysLine(count: number): string {
  if (!Number.isSafeInteger(count) || count < 1) return '';
  const days = count === 1 ? '1 day' : `${count} days`;
  return `You've learned on ${days} — counted on this device only. There is no streak to break here: the number never goes down.`;
}
