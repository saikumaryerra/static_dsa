/**
 * The M8.3 enrichment layer's PAGE-WIDE half — the two storage keys and the
 * `viz:run` contract (`docs/m8-gamification.md` "M8.3 — Enrichment"; spec §6
 * keys, §11.3).
 *
 * WHY THIS IS ITS OWN MODULE — MEASURED, not assumed. Everything here is
 * reached by pages that host no Trace Trial at all: `src/lib/progress.ts` needs
 * {@link ENRICHMENT_KEYS} and {@link resetEnrichment} for `/learn`'s reset
 * control, and every page it serves imports it; `Visualizer.astro` needs
 * {@link VIZ_RUN_EVENT} because the island announces its runs whether or not
 * anything is listening. With those living beside the trial catalog and its
 * predicate DSL, one chunk carrying all of it was pulled into **18 of the 21
 * built pages** — home, /learn, /about and the ten lessons with no
 * `<Challenge>` — at 2946 raw / 1323 gz.
 *
 * Splitting it here and leaving the DSL with its single consumer was measured
 * both ways (`npx astro build --outDir` into a scratch copy, then gzipping each
 * chunk of every page's static import closure):
 *
 * | page | before | after |
 * |---|---|---|
 * | `/learn` | 6202 gz, 6 chunks | 5299 gz, 6 chunks |
 * | home | 4070 gz, 4 chunks | 3166 gz, 4 chunks |
 * | `/about` | 8491 gz, 5 chunks | 7591 gz, 5 chunks |
 * | `/learn/binary-search` (hosts two trials) | 14852 gz, 13 chunks | 14773 gz, 13 chunks |
 *
 * The budgeted pages get BETTER on both counts, which is the thing an earlier
 * split proposal failed: no page gains a request, because the DSL has exactly
 * one entry that uses it and the bundler folds it into that entry's own chunk
 * instead of minting a second shared one. The lesson page's 79 bytes come from
 * the shared chunk's export glue going away.
 *
 * SAME DISCIPLINE AS `src/lib/progress.ts`: the version lives in the KEY (an
 * incompatible shape moves to `v2` and this reader ignores the unknown version
 * by construction), every access is `try/catch`-guarded (private mode), storage
 * is never prefix-scanned, and each key has ONE writer — `Challenge.astro` for
 * the first, `FinalRun.astro` for the second.
 */
import type { Step } from '../viz/core/types';

// ---------------------------------------------------------------------------
// The run a trial is graded against
// ---------------------------------------------------------------------------

/**
 * The event the visualizer island dispatches after a SUCCESSFUL custom run
 * (spec §11.3, M8 amendment). Bubbling, so a card anywhere below the island
 * hears it on `document`.
 *
 * Named here rather than in the island because two components consume it and
 * one dispatches it; a retyped string literal is how those three drift apart.
 */
export const VIZ_RUN_EVENT = 'viz:run';

/** The `detail` of a {@link VIZ_RUN_EVENT}. */
export interface VizRunDetail {
  /** Registry algorithm id of the island that ran. */
  algorithmId: string;
  /** The RAW string the reader submitted, exactly as `parseInput` received it. */
  input: string;
  /** The last step of the trace the island just computed — never a second run. */
  finalStep: Step<unknown>;
}

// ---------------------------------------------------------------------------
// Storage (spec §6 progress keys)
//
// Both keys are PROGRESS keys, so the reset-progress control must clear them —
// which is what {@link resetEnrichment} is for. `src/lib/progress.ts` owns that
// delete list and calls this from `resetProgress()`.
// ---------------------------------------------------------------------------

/** Cleared Trace Trials: `{ "sorting-efficient/worst-case": 1 }`. */
export const CHALLENGES_KEY = 'ld:challenges:v1';

/** Cleared Final Runs: `{ "binary-search": { c: 1 } }`. Cleared-only — there is
 * deliberately no attempt count and no first-try flag (killed: loss-framing the
 * errorful first attempt destroys the testing-effect value it decorates). */
export const FINAL_RUN_KEY = 'ld:finalrun:v1';

/**
 * Every key this module writes — the list the reset control clears.
 *
 * Exported so the invariant "no mechanic here has a hidden storage surface" is
 * assertable: notably the Predict toggle appears in NO list anywhere, because it
 * is never persisted at all (spec §6).
 */
export const ENRICHMENT_KEYS = [CHALLENGES_KEY, FINAL_RUN_KEY] as const;

/**
 * `localStorage`, or `null` when it is unavailable.
 *
 * Deliberately a second copy of `src/lib/progress.ts`'s private helper rather
 * than an import: that one is not exported, and both failure shapes must be
 * handled identically — an absent global (the build's Node pass, some privacy
 * modes) and a getter that throws (blocked storage).
 */
function getStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads and parses one key as a plain object; `{}` for anything unusable. */
function readMap(key: string): Record<string, unknown> {
  const store = getStore();
  if (!store) return {};
  try {
    const raw = store.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    // Blocked storage, or a value another tab or a hand edit left malformed.
    // "Nothing cleared" is the honest degradation: the reader can clear it
    // again, and nothing on screen claims progress that isn't there.
    return {};
  }
}

/**
 * Merges one entry into a stored map, keeping every other entry verbatim.
 *
 * Read-modify-write rather than overwrite: an older bundle in another tab must
 * not drop trials this one has never heard of, and neither must a newer one.
 *
 * @returns True only if the write landed, so a caller never announces a save a
 * blocked store refused.
 */
function writeEntry(key: string, id: string, value: unknown): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    const map = readMap(key);
    map[id] = value;
    store.setItem(key, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/**
 * Has this trial been cleared on this device?
 *
 * @param id - `{lessonSlug}/{challenge-slug}`.
 * @returns True only for an explicit stored `1`; false when storage is
 * unavailable, so a blocked store shows an open trial rather than a wrong one.
 */
export function isChallengeCleared(id: string): boolean {
  return readMap(CHALLENGES_KEY)[id] === 1;
}

/**
 * Records a cleared trial. Nothing ever un-clears one: no trial decays, and only
 * the reset control removes it.
 *
 * @param id - `{lessonSlug}/{challenge-slug}`.
 * @returns Whether the write landed.
 */
export function markChallengeCleared(id: string): boolean {
  return writeEntry(CHALLENGES_KEY, id, 1);
}

/**
 * Has this lesson's Final Run been cleared on this device?
 *
 * @param slug - Lesson slug.
 * @returns True only for a stored `{ c: 1 }`.
 */
export function isFinalRunCleared(slug: string): boolean {
  const entry = readMap(FINAL_RUN_KEY)[slug];
  return (
    typeof entry === 'object' &&
    entry !== null &&
    (entry as { c?: unknown }).c === 1
  );
}

/**
 * Records a cleared Final Run.
 *
 * The record is cleared-only, by design: no attempt count, no first-try flag,
 * nothing that could later be rendered as a score. Promotion to Practiced is
 * NOT done here — `FinalRun.astro` calls `recordPass()` in `progress.ts`, which
 * owns the 3-day Mastered gate and is the single promotion path.
 *
 * @param slug - Lesson slug.
 * @returns Whether the write landed.
 */
export function markFinalRunCleared(slug: string): boolean {
  return writeEntry(FINAL_RUN_KEY, slug, { c: 1 });
}

/**
 * Removes both enrichment keys — the delete half, shipped with the read half so
 * this data is never one-way.
 *
 * Called by the reset-progress control through `src/lib/progress.ts`. Per-key
 * `try/catch`: one blocked key must not strand the other.
 *
 * @returns How many keys were actually removed (0 when storage is unavailable).
 */
export function resetEnrichment(): number {
  const store = getStore();
  if (!store) return 0;
  let removed = 0;
  for (const key of ENRICHMENT_KEYS) {
    try {
      if (store.getItem(key) === null) continue;
      store.removeItem(key);
      removed += 1;
    } catch {
      // Blocked per call; keep going so the other key still clears.
    }
  }
  return removed;
}
