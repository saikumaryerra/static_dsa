/**
 * Local progress — the ONE module that reads and clears the site's completion
 * state (site spec §6 client persistence; M7.2 "close the loops").
 *
 * WHY ONE MODULE: three surfaces now answer questions about the same keys — the
 * `/learn` resume CTA, its per-track counters and reset control, and the home
 * hero's continue line — and M8.1 layers mastery on top of exactly these keys by
 * extending this file rather than opening a second store (see the mastery
 * section at the bottom). Keeping the key format, the `try/catch` discipline,
 * the delete list and the rule for WHEN a surface re-reads storage (`onRestore`)
 * in one place is what stops them from drifting apart.
 *
 * WHY THE MASTERY HALF IS NOT A `mastery.ts` OF ITS OWN: it was built and
 * measured both ways during the M8.1 review. Rollup picks a chunk per MODULE,
 * not per export, so today the home page's resume island does download record
 * parsing and gate maths it can never execute — and splitting does remove that,
 * worth −656 B gz on `/`. But every page that needs BOTH halves then fetches two
 * separately-compressed chunks instead of one, which costs more than it saves:
 * `/learn` +263 B gz, a lesson page +282 B gz, and +290 B for a visitor who
 * loads `/` and then a lesson, because the shared chunk is cached site-wide, so
 * a session pays the boundary once and the home saving is only ever collected by
 * a visitor who bounces. The two pages that get worse are the two the
 * gamification budget names (`docs/m8-gamification.md`: lesson ≈ 4.3 KB gz,
 * `/learn` ≈ 2.2 KB), and against the review's own measurement of M8.1's ground
 * floor — ~22% over its ~2 KB allowance — the extra 282 B would take it to ~36%
 * over. The split therefore worsens the budget finding it was proposed to fix.
 * Revisit if M8.2/M8.3 grow the mastery half enough to flip that arithmetic;
 * every delta above is reproducible by bundling these exports under the five
 * real island import sets and gzipping each emitted chunk.
 *
 * WHAT IT NEVER DOES:
 * - **Enumerate `localStorage` by key prefix.** Every per-lesson function takes
 *   the lesson list injected from the build (`LessonRef[]`), so a renamed or
 *   unpublished lesson can never leave a stale key behind that inflates a count;
 *   M8.3's two GLOBAL keys are addressed by name, imported from their writer
 *   (see the import below), never found by sweeping for an `ld:` prefix.
 * - **Write completion.** `MarkComplete.astro` owns that write path; this module
 *   reads and deletes `lesson:{slug}:complete`, so it has exactly one writer.
 *   (The M8.1 mastery record is a *different* key, `progress:v1:{slug}`, and
 *   this module is the only thing that writes it — same rule, one writer each.
 *   M8.3's `ld:*` keys are the same story once more: `Challenge.astro` and
 *   `FinalRun.astro` write them, this module only clears them.)
 * - **Infer anything.** Only explicit user acts are stored (spec §6: no
 *   behavioral tracking — nothing here observes scroll depth or time on page).
 *   Every mastery timestamp below is stamped by a click the reader made.
 *
 * Every function is storage-safe: a browser that has no `localStorage` (the
 * build's Node pass, private modes that remove it) or that throws on access
 * (Safari's blocked-methods mode) degrades to "nothing is complete" instead of
 * throwing, so the caller's server-rendered fallback simply stays on screen.
 */

/**
 * M8.3's two GLOBAL progress keys and their delete path, IMPORTED from the module
 * that writes them (`src/lib/challenges.ts`) rather than retyped here.
 *
 * The rule this file already applies per-lesson — one writer per key, and the
 * key format stated once — is the reason: a literal spelled in both modules is a
 * literal free to drift, and a reset pointing at `ld:challenge:v1` while the card
 * writes `ld:challenges:v1` would fail silently, leaving the reader with data
 * they asked to delete and nothing on screen to say so.
 *
 * Cheap to import, which is what makes that rule affordable on a page with a
 * gzip budget: `challenges.ts` is side-effect free and its catalog, DSL and
 * build-time guard are all unreferenced from here, so they shake out and only
 * the two key strings plus this one function travel. Measured at +13 B gz over
 * retyping the literals here (both variants bundled under the `/learn` island's
 * real import set and gzipped; the catalog's own strings appear in neither).
 */
import { ENRICHMENT_KEYS, resetEnrichment } from './challenges';

/** A lesson's identity as injected from the build (never read back out of storage). */
export interface LessonRef {
  /** URL segment and storage-key component, e.g. `binary-search`. */
  slug: string;
  /** Lesson title as shown to the reader. */
  title: string;
  /** Global order across both tracks (§7 frontmatter `order`). */
  order: number;
  /** Track id, e.g. `foundations` — the subset key for per-track counts. */
  track: string;
}

/**
 * Completion key for one lesson (spec §6 progress keys). Never widened to a
 * prefix scan.
 *
 * Exported because `MarkComplete.astro` is the one WRITER: it used to re-type
 * this template literal, which made the format a convention held in two places
 * rather than one rule, and a rename here would have left the read and write
 * paths pointing at different keys with nothing failing.
 *
 * @param slug - Lesson slug, e.g. `binary-search`.
 * @returns The `localStorage` key holding that lesson's completion mark.
 */
export function completeKey(slug: string): string {
  return `lesson:${slug}:complete`;
}

/**
 * Mastery-record key for one lesson (spec §6 progress key, added by M8.1).
 *
 * The version sits in the KEY, not inside the value: if the record's shape ever
 * has to change incompatibly it moves to `progress:v2:{slug}`, and this reader
 * ignores the unknown version by construction rather than mis-parsing it.
 *
 * @param slug - Lesson slug, e.g. `binary-search`.
 * @returns The `localStorage` key holding that lesson's mastery record.
 */
export function masteryKey(slug: string): string {
  return `progress:v1:${slug}`;
}

/**
 * The `localStorage` object, or `null` when it is unavailable.
 *
 * Two failure shapes, both non-errors here: the global is absent (Node during
 * the build, some privacy modes) — hence the `typeof` probe, which never throws
 * — and the property getter itself throws (blocked storage), hence the catch.
 */
function getStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads completion for the given lessons.
 *
 * @param lessons - The build-injected lesson list to check (order preserved).
 * @returns The slugs marked complete, in the order they were passed in; `[]`
 * when storage is unavailable or a read throws.
 */
export function readCompleted(lessons: LessonRef[]): string[] {
  const store = getStore();
  if (!store) return [];
  const completed: string[] = [];
  try {
    for (const lesson of lessons) {
      if (store.getItem(completeKey(lesson.slug)) === '1') {
        completed.push(lesson.slug);
      }
    }
  } catch {
    // Blocked-methods mode throws per call. A partial list would silently
    // under-report every counter that derives from it, so report nothing rather
    // than something wrong — callers show their "unknown" state instead.
    return [];
  }
  return completed;
}

/**
 * True if that slug is marked complete.
 *
 * @param slug - Lesson slug.
 * @returns Whether `lesson:{slug}:complete` is set; `false` when storage fails.
 */
export function isComplete(slug: string): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    return store.getItem(completeKey(slug)) === '1';
  } catch {
    return false;
  }
}

/**
 * First lesson in **global** order that is not complete — the resume target.
 *
 * Global, not per-track: the curriculum is one sequence and prev/next follows it
 * too (M7.1 IA-5), so "continue" must never dead-end at a track boundary.
 *
 * @param lessons - The build-injected lesson list (any order).
 * @returns The lesson to resume at, or `null` when every one is complete (or the
 * list is empty). With storage unavailable this is the first lesson — the same
 * answer the server-rendered fallback already shows.
 */
export function nextIncomplete(lessons: LessonRef[]): LessonRef | null {
  const done = new Set(readCompleted(lessons));
  // Sort a COPY: the array the caller passed is usually its render order too.
  const inOrder = [...lessons].sort((a, b) => a.order - b.order);
  return inOrder.find((lesson) => !done.has(lesson.slug)) ?? null;
}

/**
 * `{ done, total }` for a subset (one track) or for everything.
 *
 * @param lessons - The lessons to count; pass a filtered list for one track.
 * @returns Completed and total counts; `done` is 0 when storage is unavailable.
 */
export function countComplete(lessons: LessonRef[]): {
  done: number;
  total: number;
} {
  return { done: readCompleted(lessons).length, total: lessons.length };
}

/**
 * Clears every PROGRESS key on this device — the delete half of the progress
 * system, shipped with the read half so the data is never one-way. Four keys in
 * two shapes go:
 * - PER-LESSON, for the injected slugs only: the completion mark and the M8.1
 *   mastery record.
 * - GLOBAL, cleared outright because they are not keyed by slug: M8.3's
 *   `ld:challenges:v1` and `ld:finalrun:v1`, through their own module's
 *   {@link resetEnrichment} (spec §6 lists both as progress keys, so a reset
 *   that skipped them would keep records the reader asked to delete while the
 *   control described itself as having nothing to clear).
 *
 * Still no prefix scan, in either shape: the per-lesson keys are addressed from
 * the build-injected list and the global ones are two names imported from their
 * writer. Nothing here ever enumerates storage looking for an `ld:` prefix,
 * which is what stops a reset from deleting a key this product does not own.
 *
 * SPEC-GAP: spec §6 enumerates a THIRD global progress key, `ld:days:v1` (the
 * M8.3 learning-days counter). No module writes it — `docs/m8-gamification.md`
 * lists Learning Days as the "first cut under budget pressure" and this batch
 * shipped without it — so no device can be holding one and there is nothing to
 * delete. Spelling the literal here anyway would put a key format in a module
 * that is not its writer, the exact drift this file's key rules exist to
 * prevent; when that counter lands, its writer exports the name and joins it to
 * the imported list above, the same way the two enrichment keys did.
 *
 * Preference keys (`theme`, `pref:viz-speed`, `pref:code-lang`) are deliberately
 * NOT cleared (spec §6): resetting progress must not also throw away the
 * reader's theme or speed — which is the whole reason the reset control routes
 * through this module rather than clearing the store.
 *
 * @param lessons - The build-injected lesson list; only these slugs are touched
 * per-lesson (the global keys belong to no lesson and always go).
 * @returns How many COMPLETION MARKS were actually removed (0 when storage is
 * unavailable). Mastery records and enrichment keys are cleared too but
 * deliberately not counted: the caller renders this number as "N completed marks
 * removed", and neither a practice record nor a cleared trial is a mark —
 * counting them would make that sentence false. Callers that need to NAME what
 * else went use {@link storedProgress} before calling this.
 */
export function resetProgress(lessons: LessonRef[]): number {
  const store = getStore();
  if (!store) return 0;
  let removed = 0;
  for (const lesson of lessons) {
    if (removeKey(store, completeKey(lesson.slug))) removed += 1;
    removeKey(store, masteryKey(lesson.slug));
  }
  // The global half, owned by the module that writes it: same per-key try/catch
  // discipline, so one blocked key cannot strand the others.
  resetEnrichment();
  return removed;
}

/**
 * Removes one key if it is there.
 *
 * Per-key `try/catch`, unlike `readCompleted`: a delete that stops halfway would
 * leave the reader with a partly-cleared device and no way to finish, so one
 * blocked key must not strand the rest.
 *
 * @param store - The storage to delete from.
 * @param key - The exact key (never a prefix).
 * @returns True only when the key existed and the delete did not throw, so a
 * caller counting removals never reports one that failed.
 */
function removeKey(store: Storage, key: string): boolean {
  try {
    if (store.getItem(key) === null) return false;
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * What this device is actually holding, by KIND — the read half of the reset,
 * and the only place a caller can learn what a reset is about to remove.
 *
 * The kinds are separate because the reader is told about them in different
 * words: `resetProgress` reports completion marks and nothing else, so a control
 * that named only that number would describe a delete of practice records and
 * cleared trials as "0 completed marks" — a no-op it is not. `/learn` composes
 * its confirm warning and its announcement from these three fields, which is how
 * both sentences stay true on a device holding any combination of them.
 *
 * @param lessons - The build-injected lesson list; per-lesson keys are counted
 * for these slugs only, so a renamed lesson's leftover key can never inflate a
 * count (the global keys belong to no lesson and are simply present or absent).
 * @returns Counts of completion marks and mastery records, plus whether either
 * enrichment key holds anything. All zero/false when storage is unavailable or a
 * read throws — the same "report nothing rather than something wrong" rule
 * {@link readCompleted} follows, since a partial answer here would understate a
 * delete the reader is being asked to confirm.
 */
export function storedProgress(lessons: LessonRef[]): {
  /** Lessons with a `lesson:{slug}:complete` key present. */
  marks: number;
  /** Lessons with a `progress:v1:{slug}` record present. */
  records: number;
  /** Whether `ld:challenges:v1` or `ld:finalrun:v1` holds anything. */
  enrichment: boolean;
} {
  const nothing = { marks: 0, records: 0, enrichment: false };
  const store = getStore();
  if (!store) return nothing;
  let marks = 0;
  let records = 0;
  try {
    for (const lesson of lessons) {
      // Presence, not value: `removeKey` deletes any key that is there, so
      // counting the same way is what keeps "N will be removed" and "N were
      // removed" the same number.
      if (store.getItem(completeKey(lesson.slug)) !== null) marks += 1;
      if (store.getItem(masteryKey(lesson.slug)) !== null) records += 1;
    }
    // Named, never found by prefix: the two keys are imported from their writer.
    for (const key of ENRICHMENT_KEYS) {
      if (store.getItem(key) !== null)
        return { marks, records, enrichment: true };
    }
  } catch {
    return nothing;
  }
  return { marks, records, enrichment: false };
}

/**
 * Whether ANY progress at all is stored — a completion mark, a mastery record,
 * or an enrichment key.
 *
 * Exists because `resetProgress`'s return value counts only marks: a reader who
 * self-graded practice without ever clicking "Mark as complete", or who cleared
 * a Trace Trial and nothing else, still has data on the device, and a reset
 * control gated on the completion count alone would present itself as "nothing
 * to clear" while holding it.
 *
 * Derived from {@link storedProgress} rather than short-circuiting on the first
 * hit: one definition of "what counts as progress" is worth the handful of extra
 * synchronous reads (at most two per lesson plus two), and a second predicate
 * here is a second list of keys free to fall behind the delete list.
 *
 * @param lessons - The build-injected lesson list.
 * @returns True if at least one progress key exists; false when storage is
 * unavailable or a read throws.
 */
export function hasStoredProgress(lessons: LessonRef[]): boolean {
  const stored = storedProgress(lessons);
  return stored.marks > 0 || stored.records > 0 || stored.enrichment;
}

/**
 * Parses the build-injected lesson list out of a `data-lessons` attribute.
 *
 * Pure and defensive on purpose: the JSON crosses a DOM boundary, so a truncated
 * or hand-edited attribute must degrade to "no list" (every caller then leaves
 * its server-rendered fallback alone) instead of throwing inside an island.
 *
 * @param json - Raw attribute value, e.g. `element.dataset.lessons`.
 * @returns The well-formed entries only; `[]` for missing or malformed input.
 */
export function parseLessonRefs(json: string | undefined | null): LessonRef[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isLessonRef);
}

/** Shape guard for one injected entry — all four fields, right types. */
function isLessonRef(value: unknown): value is LessonRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Partial<LessonRef>;
  return (
    typeof ref.slug === 'string' &&
    typeof ref.title === 'string' &&
    typeof ref.order === 'number' &&
    typeof ref.track === 'string'
  );
}

/**
 * The one place the resume CTA's wording lives, so the server-rendered fallback
 * and the hydrated rewrite cannot drift (the `/learn` and home pages both call
 * this at build time for the fallback and again at runtime).
 *
 * Three states, and the "start" wording is deliberate: a reader with nothing
 * stored is not "continuing" anything.
 *
 * @param next - The lesson to resume at, or `null` when all are complete.
 * @param completed - How many lessons are complete on this device.
 * @param total - How many lessons exist (callers render nothing when this is 0).
 * @returns The CTA's visible text — link text for the first two states, a plain
 * sentence for the third (which has no honest destination to link to).
 */
export function resumeLabel(
  next: LessonRef | null,
  completed: number,
  total: number,
): string {
  if (!next) return `All ${total} done — revisit any lesson.`;
  const number = String(next.order).padStart(2, '0');
  return completed === 0
    ? `Start with ${number} · ${next.title}`
    : `Continue: ${number} · ${next.title}`;
}

/**
 * Re-runs a progress surface's own render after a back/forward-cache restore.
 *
 * Every surface paints from storage once, when its island executes. A bfcache
 * restore — Back out of a lesson you just marked done — replays neither that
 * execution nor any load event, so the reader meets the DOM exactly as they left
 * it: stale counters, a resume CTA pointing at a finished lesson, a missing
 * checkmark. `pageshow` is the one event that does fire on that path, and
 * `persisted` is what separates it from an ordinary first paint (where the
 * caller has already rendered inline).
 *
 * Shared here for the same reason the key format is: three islands, one rule
 * about when progress is re-read.
 *
 * @param refresh - The caller's own render function; invoked with no arguments.
 */
export function onRestore(refresh: () => void): void {
  // The build's Node pass imports this module for `resumeLabel`; it must not
  // reach for a global that only exists in the browser.
  if (typeof window === 'undefined') return;
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) refresh();
  });
}

/**
 * Same-page channel announcing that {@link resetProgress} has just run — the
 * second rule about WHEN a surface re-reads storage, and here for the same
 * reason {@link onRestore} is.
 *
 * `/learn` now paints its progress from TWO islands (the page's own, and the
 * review strip's), and only the first of them owns the delete. Astro gives
 * component scripts no shared scope, so without a channel the island that did
 * not run the reset keeps whatever it last drew: cleared records, and a strip
 * still inviting the reader to review lessons the device no longer remembers.
 * A `storage` event cannot cover this — browsers fire it in OTHER tabs only.
 *
 * Dispatch on `document` with no detail, mirroring `codetabs:lang` and
 * `viz:speed`: every listener re-reads storage itself, so the message carries no
 * state that could be stale by the time it arrives.
 */
export const PROGRESS_RESET_EVENT = 'progress:reset';

// ---------------------------------------------------------------------------
// Mastery (M8.1) — the one currency: Learned → Practiced → Mastered.
//
// Every rule that decides a stage lives HERE, once, because five surfaces will
// ask about it (practice checks, the lesson header pips, `LessonCard`, the
// track arc, and M8.2's review queue) and a predicate copied into any of them
// is a definition free to drift.
//
// The rules, in full (`docs/m8-gamification.md`):
// - **Learned is the completion mark.** `lesson:{slug}:complete` (the M7 key,
//   untouched) is the only thing that earns it, exactly as the loop table
//   specifies — so every M7-era device keeps its progress with no migration and
//   no stage is ever conjured out of a partial self-grade.
// - **Practiced** = all `total` questions self-graded "I had it" at least once,
//   or another retrieval path through `recordPass`. `total` is passed in from
//   the build: `checks[]` alone cannot say how many questions a lesson has, so
//   a 1-entry array must never satisfy a 3-question lesson.
// - **Mastered** = re-meeting that bar at least `MASTERY_GATE_DAYS` days after
//   `practicedAt`. Ungrindable in one sitting by construction — the design, not
//   an obstacle to work around.
// - **No stage decays and no stage demotes.** Nothing here clears `practicedAt`
//   or `masteredAt`, and no function that RESOLVES a stage takes a clock, so a
//   record reads the same a year from now; only `resetProgress` clears anything.
//   A self-GRADE is a different thing from a stage: the reader may correct one
//   at any time (see `writeCheck`), and honouring that correction is honesty,
//   not decay.
//
// Pure/impure split mirrors `resolveTheme` in `src/lib/theme.ts`: the predicate
// and the date arithmetic are exported as pure functions with injected inputs
// (Vitest runs in `node` with no `localStorage`), and the storage wrappers around
// them degrade to "nothing recorded" instead of throwing.
// ---------------------------------------------------------------------------

/**
 * Where a lesson stands in the one progress currency
 * (`docs/m8-gamification.md`); rendered as the three pips of spec §8.
 */
export type MasteryStage = 'none' | 'learned' | 'practiced' | 'mastered';

/**
 * The stored shape of `progress:v1:{slug}` — the fields THIS version knows.
 *
 * Timestamps rather than booleans: the Mastered gate and the review schedule are
 * both derived from them, so a boolean would have to be re-derived from a date
 * anyway. M8.2 added the last two fields and M8.3 adds `note`, all with no
 * migration step, which has to work in BOTH directions: a record written before
 * they existed parses fine here (an M8.1 record reads as "first interval, never
 * reviewed", which is exactly what a lesson that has only ever been practised
 * is), and a record that already carries a field this version has no name for
 * survives a write from it untouched (see {@link readStored}).
 */
export interface MasteryRecord {
  /**
   * ISO timestamp of the first time the Practiced bar was met — every question
   * self-graded "I had it", or another earning path through {@link recordPass}.
   */
  practicedAt: string | null;
  /** ISO timestamp of the re-pass that opened the gate; `null` until one happens. */
  masteredAt: string | null;
  /** Self-grades indexed by question order: 1 = "I had it", 0 = "Not yet". */
  checks: (0 | 1 | null)[];
  /**
   * Which spacing interval this lesson is on — a position in
   * {@link REVIEW_INTERVAL_DAYS}, advanced by each review pass (M8.2). `0` for a
   * lesson that has been practised but never reviewed.
   */
  intervalIndex: number;
  /**
   * ISO timestamp of the most recent review pass; `null` until one happens, when
   * the schedule measures from {@link MasteryRecord.practicedAt} instead.
   */
  lastReviewAt: string | null;
}

/**
 * Days that must pass after `practicedAt` before a re-pass counts as Mastered.
 *
 * Exported so a component can render the honest static line the design requires
 * ("Mastery needs a return visit after a few days — that's how memory
 * consolidates") from the same number the gate below enforces. That line is an
 * explanation of how memory works, never a lockout: a static date is permitted,
 * a ticking countdown is banned.
 */
export const MASTERY_GATE_DAYS = 3;

/** Milliseconds in a day — the gate is elapsed time, not a calendar diff. */
const DAY_MS = 86_400_000;

/**
 * Upper bound on stored self-grades per lesson. §7 authors 2–3 practice
 * questions, so this is far above any real lesson; it exists only so a bad
 * `total` prop (a typo, a computed value gone wrong) cannot make a component
 * allocate an enormous array in the reader's storage.
 */
const MAX_CHECKS = 32;

/** A record with nothing recorded — the answer for "no key" and "unreadable key". */
function blankMastery(): MasteryRecord {
  return {
    practicedAt: null,
    masteredAt: null,
    checks: [],
    intervalIndex: 0,
    lastReviewAt: null,
  };
}

/**
 * How many of a lesson's questions are graded "I had it" — the tally
 * `PracticeCheck.astro` shows and announces ("2 of 3 checked").
 *
 * Exported so that component calls this instead of re-deriving the same count
 * from `record.checks` inline: the tally on screen and the bar that stamps
 * `practicedAt` must never disagree about what "all of them" means, and the
 * `total` they both take is the same build-injected prop.
 *
 * Both readings look only at indices `0…total-1`, so a stale grade left by a
 * removed question can never make the tally read higher than the questions on
 * screen.
 *
 * @param checks - Stored self-grades (may be shorter or longer than `total`).
 * @param total - How many questions the lesson has, injected from the build.
 * @returns The count of `1`s within the first `total` entries; 0 for a total
 * that describes no questions.
 */
export function countPassed(
  checks: readonly (0 | 1 | null)[],
  total: number,
): number {
  if (!Number.isInteger(total) || total < 1) return 0;
  let passed = 0;
  for (let i = 0; i < total; i += 1) {
    if (checks[i] === 1) passed += 1;
  }
  return passed;
}

/**
 * The Practiced predicate: has every question been self-graded "I had it"?
 *
 * Pure, and the ONE definition — every mechanic that can earn Practiced (M8.1's
 * checks, M8.2's predict session, M8.3's Final Run) resolves to the same bar.
 *
 * Counted over `total`, never over `checks.length`: reading only the array would
 * let a learner who graded question 1 of 3 satisfy a 3-question lesson, since
 * `[1].every(...)` is true. Indices past the end read as `undefined`, which is
 * not `1`, so a short array correctly fails.
 *
 * @param checks - Stored self-grades (may be shorter or longer than `total`).
 * @param total - How many questions the lesson has, injected from the build.
 * @returns True only when indices `0…total-1` are all `1`; false for a
 * non-positive or non-integer `total` (nothing can be "all graded" out of none).
 */
export function allChecksPassed(
  checks: readonly (0 | 1 | null)[],
  total: number,
): boolean {
  if (!Number.isInteger(total) || total < 1) return false;
  return countPassed(checks, total) === total;
}

/**
 * The Mastered gate: is the re-pass far enough after the first pass to count?
 *
 * Pure and injectable so the boundary is unit-testable without waiting three
 * days. Measured as elapsed milliseconds rather than calendar days, which makes
 * it timezone- and DST-proof; exactly `MASTERY_GATE_DAYS` counts as open.
 *
 * @param practicedAt - ISO timestamp of the first pass, or `null`.
 * @param now - The moment to measure to (injected in tests).
 * @returns False when there is no first pass, when the timestamp is
 * unparseable, or when the gap is shorter than the gate — including a negative
 * gap, so a device whose clock jumped backwards cannot promote.
 */
export function masteryGateOpen(
  practicedAt: string | null,
  now: Date | number = new Date(),
): boolean {
  if (!practicedAt) return false;
  const from = Date.parse(practicedAt);
  if (Number.isNaN(from)) return false;
  const to = typeof now === 'number' ? now : now.getTime();
  return to - from >= MASTERY_GATE_DAYS * DAY_MS;
}

/**
 * Resolves a stage from a record plus the M7 completion mark — pure, so the rule
 * can be tested without storage.
 *
 * LEARNED IS THE COMPLETION MARK AND NOTHING ELSE, which is the loop table's
 * rule ("the existing 'Mark as complete' click — unchanged key and unchanged
 * completion semantics"). A self-grade never earns it, for two reasons that both
 * outrank the tempting argument that grading a question is itself a retrieval
 * act:
 * - The reader who graded question 1 of 3 has not said they finished the lesson.
 *   Labelling their card "Learned" is the product making a claim on their
 *   behalf, which is the same defect as overriding a self-report.
 * - It would make the stage DECAY. Since {@link writeCheck} lets a later grade
 *   win, a reader correcting their only "I had it" to "Not yet" would watch a
 *   pip disappear — and no stage in this system may ever go down. Retrieval
 *   already has a stage of its own: Practiced, which needs the whole set.
 *
 * @param record - The lesson's mastery record, as {@link readMastery} returns it.
 * @param complete - Whether `lesson:{slug}:complete` is set.
 * @returns The highest stage the evidence supports.
 */
export function masteryStageOf(
  record: MasteryRecord,
  complete: boolean,
): MasteryStage {
  if (record.masteredAt) return 'mastered';
  if (record.practicedAt) return 'practiced';
  return complete ? 'learned' : 'none';
}

/** Coerces one stored entry to a self-grade; anything unexpected reads as ungraded. */
function toCheck(value: unknown): 0 | 1 | null {
  if (value === 1) return 1;
  if (value === 0) return 0;
  return null;
}

/** Keeps a stored timestamp only if it is a string a `Date` can actually parse. */
function toIso(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

/**
 * Coerces a stored `intervalIndex`; anything unusable reads as the first
 * interval, which only ever makes a lesson due SOONER — the safe direction for a
 * corrupt value, since a review invitation costs the reader nothing.
 *
 * Deliberately NOT clamped to the interval list here. The clamp belongs at the
 * lookup ({@link intervalDays}), because a record outlives the bundle that wrote
 * it: rewriting the stored number on read would hide a value a future version
 * gives more positions to, and would move the clamp away from the one place that
 * must never index past the end.
 */
function toIntervalIndex(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : 0;
}

/**
 * A parsed record plus the fields this version did not recognise.
 *
 * The second half is not decoration: `docs/m8-gamification.md` has M8.2 and M8.3
 * adding `intervalIndex`, `lastReviewAt` and `note` to THIS key with no
 * migration step. A read-modify-write that serialised only the three known
 * fields would erase a newer one every time an older bundle graded a question —
 * a tab left open across a deploy, or a browser holding the previous build.
 */
interface StoredMastery {
  record: MasteryRecord;
  /** Verbatim fields from storage that are not part of {@link MasteryRecord}. */
  extra: Record<string, unknown>;
}

/** Nothing stored, and nothing unknown to carry forward. */
function blankStored(): StoredMastery {
  return { record: blankMastery(), extra: {} };
}

/**
 * Parses one stored record defensively.
 *
 * Same contract as {@link parseLessonRefs}: the value crosses a boundary this
 * module does not control (another tab, a hand-edited store, a truncated write),
 * so anything unexpected degrades to "nothing recorded" rather than throwing
 * inside an island or fabricating a stage.
 *
 * @param raw - The raw `localStorage` value, or `null`.
 * @returns The well-formed record and any unknown fields. A timestamp that fails
 * its check comes back `null` and an unusable `checks` comes back `[]`, so a
 * partly-corrupt record costs only the fields that were actually corrupt;
 * unknown fields are kept verbatim and never inspected.
 */
function parseMastery(raw: string | null): StoredMastery {
  if (!raw) return blankStored();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return blankStored();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return blankStored();
  }
  // Rest destructuring IS the forward-compatibility mechanism: whatever this
  // version has no name for lands in `extra` and is written straight back.
  const {
    practicedAt,
    masteredAt,
    checks,
    intervalIndex,
    lastReviewAt,
    ...extra
  } = parsed as Record<string, unknown>;
  return {
    record: {
      practicedAt: toIso(practicedAt),
      masteredAt: toIso(masteredAt),
      checks: Array.isArray(checks)
        ? checks.slice(0, MAX_CHECKS).map(toCheck)
        : [],
      intervalIndex: toIntervalIndex(intervalIndex),
      lastReviewAt: toIso(lastReviewAt),
    },
    extra,
  };
}

/**
 * Reads one lesson's record together with the fields this version does not know.
 *
 * Internal: only the write paths need the second half, and exporting it would
 * invite a caller to persist a record without it.
 *
 * @param slug - Lesson slug.
 * @returns The stored record and its unknown fields; blank and empty when there
 * is nothing stored, storage is unavailable, or the read throws.
 */
function readStored(slug: string): StoredMastery {
  const store = getStore();
  if (!store) return blankStored();
  try {
    return parseMastery(store.getItem(masteryKey(slug)));
  } catch {
    return blankStored();
  }
}

/**
 * Reads one lesson's mastery record.
 *
 * @param slug - Lesson slug.
 * @returns The stored record, or an empty one when there is nothing stored,
 * storage is unavailable, or the read throws.
 */
export function readMastery(slug: string): MasteryRecord {
  return readStored(slug).record;
}

/**
 * Writes one record, carrying any unknown fields through unchanged.
 *
 * @param slug - Lesson slug.
 * @param record - The record to store.
 * @param extra - Unknown fields from the read that produced `record`. Spread
 * FIRST so a known field always wins: `extra` cannot contain one (the parser
 * strips them), and this ordering makes that impossible rather than merely true.
 * @returns True only if the write did not throw; a blocked or full store is a
 * "nothing recorded", never an exception, and the callers below return the
 * previously stored record so nothing on screen claims a save that never landed.
 */
function writeMastery(
  slug: string,
  record: MasteryRecord,
  extra: Record<string, unknown>,
): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    store.setItem(masteryKey(slug), JSON.stringify({ ...extra, ...record }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Records one self-grade for one practice question.
 *
 * THE LATER GRADE WINS, including a "Not yet" on a question stored as "I had
 * it". The reader's most recent self-report is the honest one, and a store that
 * kept the flattering answer would be tallying a question they have just
 * explicitly said they did not have. It costs them nothing: the correction can
 * take this lesson back below the Practiced bar for the current session — the
 * tally falls, and the bar has to be met again before anything new is earned —
 * but it never clears an earned `practicedAt` or `masteredAt`, because no stage
 * in this system ever goes down. "Not yet" is not a wrong answer; it is a
 * request to come back.
 *
 * Stamps `practicedAt` when a grade completes the bar for the FIRST time. It
 * never stamps `masteredAt` and never moves the review schedule: after a pass
 * the stored checks are all `1`, so storage cannot tell a re-pass from a
 * re-write — only the caller's in-memory count of this visit can, which is what
 * {@link recordPass} is for.
 *
 * @param slug - Lesson slug.
 * @param index - Question position, from the component's explicit `index` prop.
 * @param total - How many questions the lesson has, from the build.
 * @param value - `1` for "I had it", `0` for "Not yet".
 * @param now - Clock, injected in tests.
 * @returns The record as it now stands in storage. Out-of-range arguments and a
 * failed write both return the previous record UNCHANGED, so a caller that
 * renders this value never shows progress that was not persisted.
 */
export function writeCheck(
  slug: string,
  index: number,
  total: number,
  value: 0 | 1,
  now: Date = new Date(),
): MasteryRecord {
  const { record, extra } = readStored(slug);
  if (!Number.isInteger(total) || total < 1 || total > MAX_CHECKS)
    return record;
  if (!Number.isInteger(index) || index < 0 || index >= total) return record;

  // Rebuild at exactly `total` entries: a question added since the last write
  // shows up as `null`, and one that was removed takes its stale grade with it
  // (both readings only ever look at indices < total, so a stale entry could not
  // have inflated anything — but storage should not keep grades for questions
  // no reader can see).
  const checks: (0 | 1 | null)[] = [];
  for (let i = 0; i < total; i += 1) {
    checks.push(i === index ? value : (record.checks[i] ?? null));
  }

  const next: MasteryRecord = {
    // Spread first so every field this function does not decide — `masteredAt`
    // and the whole review schedule ({@link recordPass} owns both) — rides
    // through a self-grade untouched, and so a field added to the record later
    // cannot be dropped here by omission.
    ...record,
    // `??`, so an earned first-pass timestamp is never re-stamped and never
    // cleared: it is only ever ADDED, when the bar is met and nothing is there.
    practicedAt:
      record.practicedAt ??
      (allChecksPassed(checks, total) ? now.toISOString() : null),
    checks,
  };
  return writeMastery(slug, next, extra) ? next : record;
}

/**
 * Records that the learner has just met the Practiced bar again, in THIS visit.
 *
 * The caller decides when that happened, because only it can: a pass leaves
 * every check at `1` and a second pass writes those same `1`s again, so a
 * re-pass is visible in the component's in-memory count for this page visit and
 * nowhere else (per-visit and in memory
 * — never `sessionStorage`, which spec §6 forbids). The DATE arithmetic stays
 * here so no caller can invent its own gate. Every earning path converges on
 * this function: M8.1's practice checks, and M8.2/M8.3's predict session and
 * cleared Final Run.
 *
 * It is also the ONE place the review schedule advances (M8.2), and it moves it
 * without any caller changing: a re-pass on a lesson the schedule says is DUE
 * *is* the review the strip invited, whichever surface the learner met it on. So
 * a due pass stamps `lastReviewAt` and moves the lesson to the next interval,
 * and an early one changes nothing at all — the same "coming back early costs
 * nothing" rule the Mastered gate already had, now covering the spacing too, so
 * a keen re-pass on day 1 can never push the real review out to day 11.
 *
 * A failed review is deliberately not a case here: "Not yet" writes no pass, so
 * the schedule does not move and the card simply stays. (`docs/m8-gamification.md`
 * describes the failure path as halving the current interval; leaving the
 * schedule untouched is that rule's limit — the lesson stays due right now,
 * which is sooner than any halved interval — and it needs no failure signal to
 * reach this module, which keeps the promotion path single.)
 *
 * Safe to call on the first pass too — `writeCheck` has just stamped
 * `practicedAt`, the gate is then zero days old, and this returns unchanged.
 *
 * @param slug - Lesson slug.
 * @param now - Clock, injected in tests.
 * @returns The record as it now stands in storage: `practicedAt` stamped if this
 * is the first pass; on a due review `lastReviewAt` stamped, `intervalIndex`
 * advanced and `masteredAt` stamped if the gate has opened; otherwise unchanged
 * (an already-Mastered lesson is never re-stamped, and a failed write returns
 * the previous record).
 */
export function recordPass(
  slug: string,
  now: Date = new Date(),
): MasteryRecord {
  const { record, extra } = readStored(slug);
  let next: MasteryRecord;
  if (!record.practicedAt) {
    next = { ...record, practicedAt: now.toISOString() };
  } else if (isReviewDue(record, now)) {
    next = {
      ...record,
      // The gate is asked again rather than assumed: today the first interval
      // and MASTERY_GATE_DAYS are both 3 days, so a due review always clears it
      // — but that is an arithmetic coincidence of two numbers this module lets
      // move independently, and Mastered may only ever be stamped by the gate.
      masteredAt:
        record.masteredAt ??
        (masteryGateOpen(record.practicedAt, now) ? now.toISOString() : null),
      intervalIndex: nextIntervalIndex(record.intervalIndex),
      lastReviewAt: now.toISOString(),
    };
  } else {
    // Not due yet: nothing to write. Costing the learner nothing for coming back
    // early is the point of both the gate and the spacing.
    return record;
  }
  return writeMastery(slug, next, extra) ? next : record;
}

/**
 * The shared Practiced predicate for a lesson, read from storage.
 *
 * Reads the stored `practicedAt` rather than re-deriving from `checks`, which is
 * why `/learn` never needs per-lesson question counts.
 *
 * @param slug - Lesson slug.
 * @returns Whether this lesson has ever been Practiced (still true once Mastered).
 */
export function isPracticed(slug: string): boolean {
  return readMastery(slug).practicedAt !== null;
}

/**
 * The stage one lesson is at, from storage.
 *
 * @param slug - Lesson slug.
 * @returns The stage; `'none'` when storage is unavailable, so a blocked store
 * renders no pips at all rather than wrong ones.
 */
export function masteryStage(slug: string): MasteryStage {
  return masteryStageOf(readMastery(slug), isComplete(slug));
}

/**
 * Stage tallies for a subset (one track) or for everything.
 *
 * Counts are CUMULATIVE — a Mastered lesson counts in `practiced` and `learned`
 * too. That keeps every displayed number monotone: promoting a lesson from
 * Practiced to Mastered must never make the Practiced count go DOWN on screen,
 * which is what exclusive buckets would do and would read as a demotion in a
 * system that has none.
 *
 * `learned` therefore counts completion marks PLUS any lesson that reached
 * Practiced without one — a lesson can be practiced by a reader who never
 * clicked "Mark as complete" — so it can exceed `countComplete().done`. A
 * surface showing the completion count must show these beside it: the design
 * forbids displaying the self-reported number alone.
 *
 * @param lessons - The lessons to count; pass a filtered list for one track.
 * @returns Cumulative stage counts plus the total; all zero (with a real total)
 * when storage is unavailable.
 */
export function countMastery(lessons: LessonRef[]): {
  learned: number;
  practiced: number;
  mastered: number;
  total: number;
} {
  let learned = 0;
  let practiced = 0;
  let mastered = 0;
  for (const lesson of lessons) {
    const stage = masteryStage(lesson.slug);
    if (stage === 'none') continue;
    learned += 1;
    if (stage === 'practiced' || stage === 'mastered') practiced += 1;
    if (stage === 'mastered') mastered += 1;
  }
  return { learned, practiced, mastered, total: lessons.length };
}

// ---------------------------------------------------------------------------
// The ready-to-review queue (M8.2) — spacing, and the ONLY surface in this
// product that ever prompts the reader.
//
// It lives in this file, beside the record it reads, for the reason the module
// header gives: `/learn` is one of the two pages that would pay the extra
// compressed chunk boundary a split costs, and everything below is ~0.5 KB gz of
// date arithmetic over a record this module already owns (measured by minifying
// and gzipping the module with and without it).
//
// The rules, in full (`docs/m8-gamification.md`):
// - **Due** when `now - max(practicedAt, lastReviewAt)` reaches the lesson's
//   current interval — 3, then 10, then 30 days. Spacing (Cepeda et al.) and
//   successive relearning (Rawson & Dunlosky), which is why the gaps GROW.
// - **Derived at render, never stored.** There is no queue key and no "dismissed"
//   list: two tabs open on `/learn` cannot disagree about a queue neither of them
//   wrote, and nothing can be left behind pointing at a lesson that no longer
//   exists.
// - **At most {@link MAX_REVIEW_CARDS} cards**, and none at all until a first
//   `practicedAt` exists — so week one is pure learning. The cap is the design's
//   own answer to felt obligation: a 15-item list of things "to do" is a chore,
//   and a chore is what kills the intrinsic motivation this whole phase is built
//   around.
// - **Never punished, never counted.** No lateness, no lapse count, no "days
//   since" (the vocabulary ban lives on {@link REVIEW_COPY}, where a unit test
//   can read it). A lesson that has waited a year is offered in exactly the words
//   one that waited a week is.
//
// Pure/impure split as everywhere else here: the schedule arithmetic takes a
// record and an injected clock, so the cap, the empty case and the interval
// clamp are testable in Vitest's `node` environment with no storage at all.
// ---------------------------------------------------------------------------

/**
 * The spacing schedule in days: the gap before the first review, then the
 * second, then every one after that.
 *
 * Three fixed steps rather than a scheduler: at 15 lessons an SM-2 with ease
 * factors is complexity theater (`docs/m8-gamification.md` killed it), and a
 * learner can read this list and predict what the product will do.
 */
export const REVIEW_INTERVAL_DAYS = [3, 10, 30] as const;

/**
 * How many review cards may ever be offered at once.
 *
 * A design rule, not a layout one — see the note above — so it is exported and
 * asserted rather than left implicit in a `slice`.
 */
export const MAX_REVIEW_CARDS = 2;

/**
 * The gap a record is currently on, in days.
 *
 * THE CLAMP IS LOAD-BEARING: a stored `intervalIndex` can sit past the end of
 * this list — a hand-edited record, or a build with more intervals than this one
 * — and an unclamped lookup would return `undefined`, making every comparison
 * against it false. The lesson would then silently never become reviewable
 * again, which is the one failure mode a queue nobody can see would never
 * report.
 *
 * @param intervalIndex - The record's position in the schedule.
 * @returns The current gap in days; the first gap for any unusable index, the
 * last gap for anything past the end.
 */
function intervalDays(intervalIndex: number): number {
  const last = REVIEW_INTERVAL_DAYS.length - 1;
  const index =
    Number.isInteger(intervalIndex) && intervalIndex > 0
      ? Math.min(intervalIndex, last)
      : 0;
  return REVIEW_INTERVAL_DAYS[index];
}

/**
 * The position one review pass moves a record to.
 *
 * Stopped at the last interval on the WRITE as well as the read, so a decade of
 * reviews cannot inflate a stored integer that has no meaning past the end. The
 * read clamp is still the load-bearing one ({@link intervalDays}): records
 * outlive the bundles that wrote them.
 *
 * @param intervalIndex - The record's current position.
 * @returns The next position, never past the last interval.
 */
function nextIntervalIndex(intervalIndex: number): number {
  const last = REVIEW_INTERVAL_DAYS.length - 1;
  const current =
    Number.isInteger(intervalIndex) && intervalIndex > 0 ? intervalIndex : 0;
  return Math.min(current + 1, last);
}

/**
 * When a lesson becomes offerable again — pure, so the whole schedule is
 * testable without storage or a wall clock.
 *
 * Measured from the LATER of the first pass and the last review: once a review
 * has landed the schedule runs from it, and a record whose two timestamps
 * disagree (a device whose clock moved between them) can never pull the next
 * offer backwards.
 *
 * @param record - The lesson's mastery record.
 * @returns The instant (ms) the lesson is ready for review, or `null` when it
 * never becomes ready — a lesson with no first pass has nothing to space out, so
 * a reader who has only read lessons is never prompted at all.
 */
export function reviewReadyAt(record: MasteryRecord): number | null {
  if (!record.practicedAt) return null;
  const practiced = Date.parse(record.practicedAt);
  if (Number.isNaN(practiced)) return null;
  const reviewed = record.lastReviewAt
    ? Date.parse(record.lastReviewAt)
    : Number.NaN;
  const from = Number.isNaN(reviewed)
    ? practiced
    : Math.max(practiced, reviewed);
  return from + intervalDays(record.intervalIndex) * DAY_MS;
}

/**
 * Is this lesson ready to be offered for review? Pure, clock injected.
 *
 * @param record - The lesson's mastery record.
 * @param now - The moment to measure at (injected in tests).
 * @returns True once the gap has elapsed; false for a lesson never practised, an
 * unparseable timestamp, or a device whose clock sits before the last pass.
 */
export function isReviewDue(
  record: MasteryRecord,
  now: Date | number = new Date(),
): boolean {
  const readyAt = reviewReadyAt(record);
  if (readyAt === null) return false;
  return (typeof now === 'number' ? now : now.getTime()) >= readyAt;
}

/**
 * The lessons to offer for review right now — at most {@link MAX_REVIEW_CARDS}.
 *
 * Derived on every render from the records themselves; nothing here is stored,
 * so a pass in another tab simply changes what the next render selects.
 *
 * @param lessons - The build-injected lesson list (a stale key for a lesson that
 * no longer exists can therefore never surface a card for it).
 * @param now - Clock, injected in tests.
 * @returns Up to two lessons, the ones ready longest first so a lesson can never
 * be starved by newer ones, ties broken by curriculum order for a stable render.
 * `[]` when nothing is due, which is what lets the strip render zero DOM.
 */
export function selectDueReviews(
  lessons: LessonRef[],
  now: Date | number = new Date(),
): LessonRef[] {
  const at = typeof now === 'number' ? now : now.getTime();
  const due: { lesson: LessonRef; readyAt: number }[] = [];
  for (const lesson of lessons) {
    const readyAt = reviewReadyAt(readMastery(lesson.slug));
    if (readyAt === null || readyAt > at) continue;
    due.push({ lesson, readyAt });
  }
  due.sort((a, b) => a.readyAt - b.readyAt || a.lesson.order - b.lesson.order);
  return due.slice(0, MAX_REVIEW_CARDS).map((entry) => entry.lesson);
}

/**
 * Every word the review strip says — exported so the vocabulary ban is a unit
 * test rather than a review habit (`docs/m8-gamification.md`, calm invariants).
 *
 * Copy lives in this module for the same reason {@link resumeLabel} does: one
 * place per sentence. What is BANNED here is as load-bearing as what is present
 * — no "overdue", no "missed", no count of days waited, no countdown, no urgency
 * — because felt obligation is what turns a spacing prompt into a chore, and a
 * chore is quit. A lesson that has waited a year is offered in exactly these
 * words, which is the whole point: the invitation never escalates, and it never
 * keeps score.
 */
export const REVIEW_COPY = {
  /** The strip's own heading — an invitation, in the reader's own time. */
  heading: 'Ready to review',
  /**
   * Why it is here at all, and where the record lives. It explains the spacing
   * in one line (the same honesty the Mastered gate's line owes) and carries the
   * device scope every persistent surface in this product states.
   */
  note: 'Coming back after a gap is what makes it stick — saved on this device only.',
  /** What the card offers. Small, finite, and honest about the size of the ask. */
  check: 'quick check (~2 min)',
} as const;

/**
 * Where a review card points: the lesson's Practice section, with Predict on.
 *
 * `?review=1` is the mechanism ON PURPOSE. The Predict toggle is never persisted
 * — spec §6 permits no key for it and this module's key list has none — so a
 * review visit has no preference to rewrite and nothing to restore afterwards:
 * the mode lasts exactly one page visit and leaves the device byte-identical.
 * (The lesson island reads the parameter; nothing writes it.)
 *
 * @param slug - Lesson slug.
 * @returns The deep link, e.g. `/learn/binary-search?review=1#practice`.
 */
export function reviewHref(slug: string): string {
  return `/learn/${slug}?review=1#practice`;
}
