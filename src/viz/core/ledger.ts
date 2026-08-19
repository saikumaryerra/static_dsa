/**
 * The ledger — the trace, written out (Plan C §1).
 *
 * A `Step` already holds `{ state, highlights, explanation, metrics }`. That is
 * one ROW with columns, and `Trace = Step[]` is the TABLE; this module is the
 * transcription and nothing else. It never re-runs an algorithm and never
 * inspects a highlight: it consumes the same precomputed trace the Player
 * indexes into, so the drawing and the table can never tell different stories.
 *
 * It is deliberately pure — no DOM, no imports beyond `core/types` — so the
 * harness's `environment: 'node'` can unit-test it (`tests/unit/ledger.test.ts`),
 * which is the whole reason the derivation lives here rather than inside
 * `Visualizer.astro`, and why the same function can build the server-rendered
 * table and the island's rebuild after a custom run.
 *
 * TWO PROVENANCE RULES, enforced by those tests rather than by review, because
 * they are exactly the kind of thing that rots silently:
 *
 *   1. A value cell reads `step.state` — the data model — and nothing else.
 *   2. The "what happened" cell is AUTHORED text: `firstSentence(explanation)`.
 *      There is deliberately NO code path from `highlights` into a cell. A view
 *      layer that reconstructs meaning out of highlight ids is a second
 *      narration channel able to disagree with the sentence the lesson author
 *      wrote, on the one product whose promise is that nothing is faked.
 *
 * Both rules were learned the hard way: two drafts of this design broke them
 * (one paraphrased the algorithm, one derived a column from highlight kinds).
 */
import type { LedgerColumn, LedgerSpec, Trace } from './types';

// The CONTRACT (`LedgerColumn`, `LedgerSpec`) lives in `core/types.ts`, the root
// of the dependency graph, because `Algorithm.ledger` needs the shape. This
// module owns the BEHAVIOUR. Re-exported so a caller that only cares about the
// ledger has one import rather than two.
export type { LedgerColumn, LedgerSpec };

/** One rendered value: its text, and whether the column sets it in numerals. */
export interface LedgerCell {
  text: string;
  numeric: boolean;
}

/** One step of the run, as a row. */
export interface LedgerRow {
  /** 1-based row number, shown to the reader and used for "Go to step N". */
  n: number;
  /** Zero-based index into the trace — what `Player.seek()` takes. */
  index: number;
  /** One cell per header, in the same order (the renderer walks them together). */
  cells: LedgerCell[];
  /**
   * The authored sentence, truncated. Identical to its own cell's text; carried
   * on the row as well so the renderer can style that column without having to
   * know which index it landed at.
   */
  what: string;
}

/** A whole trace as a table. */
export interface Ledger {
  headers: string[];
  rows: LedgerRow[];
  /** Index into `headers` of the first cost column, or `null` when there is none. */
  costIndex: number | null;
  /** Total steps in the trace, which may exceed `rows.length` when the cap binds. */
  total: number;
}

/**
 * The most rows this module will ever emit, on EVERY path — server render and
 * the island's rebuild alike, so there is one rule instead of two behaviours to
 * keep in sync.
 *
 * Sized by measurement rather than taste: the largest run any lesson actually
 * ships is 33 rows (selection-sort; bubble 29, insertion 31, BST 19,
 * binary-search 4), so the cap can never bind on authored content. It binds
 * only on a custom run near the input caps, where a trace reaches 901 steps and
 * a table stops being something a person reads.
 *
 * The caller must SAY SO whenever it binds — `rows.length < total` is the test,
 * and both numbers are exposed for the message, because a bounded output that
 * does not admit it is a lie about the run.
 */
export const LEDGER_ROW_CAP = 200;

/** Placeholder for a value that does not exist at this step. Never a real value. */
const ABSENT = '·';

/**
 * The authored sentence, truncated deterministically to its first sentence.
 *
 * Terminators are `.` `?` `!` — NOT `;`. An earlier draft included the
 * semicolon and gutted the flagship lesson: "Search window is indices 0–5;
 * middle index 2 holds 5…" truncated before the probe, which is the whole
 * point of the row. The terminator is RETAINED, because a cell ending in a
 * bare word reads as a truncation bug rather than a sentence.
 *
 * A terminator only counts when whitespace or the end of the string follows it,
 * so "0.75" and "1.5x" stay intact. The 160-character bound is a guard against
 * a pathological explanation, not a working truncation — the longest first
 * sentence in the shipped corpus is 128 characters — and past it the whole
 * string is returned rather than a hard cut mid-word.
 *
 * Deterministic because the alternative — a designer writing terser copy for
 * the table — is hand-mocking the product.
 *
 * @param text - One step's `explanation`.
 * @returns Its first sentence, with the terminator, or the trimmed input.
 */
export function firstSentence(text: string): string {
  const clean = String(text ?? '').trim();
  const match = clean.match(/^(.{0,160}?[.?!])(\s|$)/);
  return match ? match[1]! : clean;
}

/** Numbers are numeric unless a column says otherwise; strings never are. */
function cellOf(value: string | number | null, numeric?: boolean): LedgerCell {
  if (value === null || value === undefined || value === '') {
    // Absent, not zero: a counter that starts later in the run must not read as
    // "0" on the rows before it existed.
    return { text: ABSENT, numeric: numeric ?? false };
  }
  return { text: String(value), numeric: numeric ?? typeof value === 'number' };
}

/** Every metrics key the given steps emit, in first-seen order. */
function metricKeys<TState>(steps: Trace<TState>): string[] {
  const keys: string[] = [];
  for (const step of steps) {
    for (const key of Object.keys(step.metrics ?? {})) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/**
 * Transcribes a trace into a table.
 *
 * Column order is always: the declared value columns, `what happened`, then the
 * cost column(s) when there are any. The row NUMBER is not in `headers` — it is
 * the row's own `n`, and it carries the "Go to step N" control, because a `<tr>`
 * with `role="button"` stops being a row and takes the column-header
 * association down with it.
 *
 * With no spec, the fallback surfaces whatever counters the algorithm already
 * emits, so a structure lesson that declares nothing still gets a table with
 * something in it (`# · what happened · comparisons`).
 *
 * There is NO options parameter, and that is load-bearing. The abandoned build
 * had one — `suppressFinalCost`, to blank a Final Run's answer — and review
 * killed the premise; the shape stays closed so the mechanism cannot return by
 * the back door. Predict mode hides the whole table instead, in the island,
 * which is a different thing: nothing is blanked, and nothing is withheld from
 * a reader who is not being asked a question.
 *
 * @param trace - The precomputed steps the Player already holds.
 * @param spec - What the algorithm declares about its own columns, if anything.
 * @returns The table, capped at {@link LEDGER_ROW_CAP} rows, with the true total.
 */
export function buildLedger<TState>(
  trace: Trace<TState>,
  spec?: LedgerSpec<TState>,
): Ledger {
  // Capped FIRST, so the headers describe the rows that are actually shown: a
  // metric key that only appears past the cap would otherwise add a column of
  // nothing but absent marks.
  const shown = trace.slice(0, LEDGER_ROW_CAP);
  const declared: LedgerColumn<TState>[] = spec?.columns ?? [];
  const costKeys = spec?.costKey
    ? [spec.costKey]
    : declared.length === 0
      ? metricKeys(shown)
      : [];

  const headers = [
    ...declared.map((column) => column.label),
    'what happened',
    ...costKeys,
  ];
  const costIndex =
    costKeys.length > 0 ? headers.length - costKeys.length : null;

  const rows: LedgerRow[] = shown.map((step, index) => {
    const what = firstSentence(step.explanation);
    return {
      n: index + 1,
      index,
      what,
      cells: [
        ...declared.map((column) => cellOf(column.from(step), column.numeric)),
        { text: what, numeric: false },
        ...costKeys.map((key) => cellOf(step.metrics?.[key] ?? null, true)),
      ],
    };
  });

  return { headers, rows, costIndex, total: trace.length };
}
