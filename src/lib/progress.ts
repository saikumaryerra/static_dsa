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
 * - **Enumerate `localStorage` by key prefix.** Every function takes the lesson
 *   list injected from the build (`LessonRef[]`), so a renamed or unpublished
 *   lesson can never leave a stale key behind that inflates a count.
 * - **Write completion.** `MarkComplete.astro` owns that write path; this module
 *   reads and deletes `lesson:{slug}:complete`, so it has exactly one writer.
 *   (The M8.1 mastery record is a *different* key, `progress:v1:{slug}`, and
 *   this module is the only thing that writes it — same rule, one writer each.)
 * - **Infer anything.** Only explicit user acts are stored (spec §6: no
 *   behavioral tracking — nothing here observes scroll depth or time on page).
 *   Every mastery timestamp below is stamped by a click the reader made.
 *
 * Every function is storage-safe: a browser that has no `localStorage` (the
 * build's Node pass, private modes that remove it) or that throws on access
 * (Safari's blocked-methods mode) degrades to "nothing is complete" instead of
 * throwing, so the caller's server-rendered fallback simply stays on screen.
 */

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
 * Clears every per-lesson PROGRESS key for the given lessons — the delete half
 * of the progress system, shipped with the read half so the data is never
 * one-way. Both keys go: the completion mark AND the M8.1 mastery record.
 *
 * Preference keys (`theme`, `pref:viz-speed`, `pref:code-lang`) are deliberately
 * NOT cleared (spec §6): resetting progress must not also throw away the
 * reader's theme or speed. M8.2/M8.3's remaining progress keys
 * (`ld:challenges:v1`, `ld:finalrun:v1`, `ld:days:v1`) are global rather than
 * per-lesson and join this clear list when those phases land — which is the
 * whole reason the reset control routes through this module.
 *
 * @param lessons - The build-injected lesson list; only these slugs are touched.
 * @returns How many COMPLETION MARKS were actually removed (0 when storage is
 * unavailable). Mastery records are cleared too but deliberately not counted:
 * the caller renders this number as "N completed marks removed", and a practice
 * record is not a mark — counting it would make that sentence false. Callers
 * that need "is there anything at all to clear?" use {@link hasStoredProgress}.
 */
export function resetProgress(lessons: LessonRef[]): number {
  const store = getStore();
  if (!store) return 0;
  let removed = 0;
  for (const lesson of lessons) {
    if (removeKey(store, completeKey(lesson.slug))) removed += 1;
    removeKey(store, masteryKey(lesson.slug));
  }
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
 * Whether ANY per-lesson progress is stored for the given lessons — a completion
 * mark or a mastery record.
 *
 * Exists because `resetProgress`'s return value counts only marks: a reader who
 * self-graded practice without ever clicking "Mark as complete" still has data
 * on the device, and a reset control gated on the completion count alone would
 * present itself as "nothing to clear" while holding their practice records.
 *
 * @param lessons - The build-injected lesson list.
 * @returns True if at least one progress key exists; false when storage is
 * unavailable or every read throws.
 */
export function hasStoredProgress(lessons: LessonRef[]): boolean {
  const store = getStore();
  if (!store) return false;
  return lessons.some((lesson) => {
    try {
      return (
        store.getItem(completeKey(lesson.slug)) !== null ||
        store.getItem(masteryKey(lesson.slug)) !== null
      );
    } catch {
      return false;
    }
  });
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
 * Timestamps rather than booleans: the Mastered gate and M8.2's review schedule
 * are both derived from them, so a boolean would have to be re-derived from a
 * date anyway. M8.2/M8.3 extend this record (`intervalIndex`, `lastReviewAt`,
 * `note`) with no migration, which has to work in BOTH directions: a record that
 * lacks the newer fields parses fine here, and a record that already has them
 * survives a write from this version untouched (see {@link readStored}).
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
  return { practicedAt: null, masteredAt: null, checks: [] };
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
  const { practicedAt, masteredAt, checks, ...extra } = parsed as Record<
    string,
    unknown
  >;
  return {
    record: {
      practicedAt: toIso(practicedAt),
      masteredAt: toIso(masteredAt),
      checks: Array.isArray(checks)
        ? checks.slice(0, MAX_CHECKS).map(toCheck)
        : [],
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
 * never stamps `masteredAt`: after a pass the stored checks are all `1`, so
 * storage cannot tell a re-pass from a re-write — only the caller's in-memory
 * count of this visit can, which is what {@link recordPass} is for.
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
    // `??`, so an earned first-pass timestamp is never re-stamped and never
    // cleared: it is only ever ADDED, when the bar is met and nothing is there.
    practicedAt:
      record.practicedAt ??
      (allChecksPassed(checks, total) ? now.toISOString() : null),
    masteredAt: record.masteredAt,
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
 * Safe to call on the first pass too — `writeCheck` has just stamped
 * `practicedAt`, the gate is then zero days old, and this returns unchanged.
 *
 * @param slug - Lesson slug.
 * @param now - Clock, injected in tests.
 * @returns The record as it now stands in storage: `practicedAt` stamped if this
 * is the first pass, `masteredAt` stamped if the gate has opened, otherwise
 * unchanged (an already-Mastered lesson is never re-stamped, and a failed write
 * returns the previous record).
 */
export function recordPass(
  slug: string,
  now: Date = new Date(),
): MasteryRecord {
  const { record, extra } = readStored(slug);
  let next: MasteryRecord;
  if (!record.practicedAt) {
    next = { ...record, practicedAt: now.toISOString() };
  } else if (!record.masteredAt && masteryGateOpen(record.practicedAt, now)) {
    next = { ...record, masteredAt: now.toISOString() };
  } else {
    // Gate still closed, or already Mastered: nothing to write. Costing the
    // learner nothing for coming back early is the point of the gate.
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
