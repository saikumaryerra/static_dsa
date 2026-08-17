/**
 * The ledger — the run written out (redesign §7, "Show Your Work").
 *
 * A `Step` already holds `{ state, highlights, explanation, metrics }`. That is
 * one ROW with columns, and `Trace = Step[]` is the table; this module is the
 * transcription and nothing else. It is deliberately pure — no DOM, no imports
 * beyond `core/types` — so the harness's `environment: 'node'` can unit-test it
 * (`tests/unit/ledger.test.ts`), which is the whole reason the derivation lives
 * here rather than inside `Visualizer.astro`.
 *
 * TWO PROVENANCE RULES, enforced here rather than by review, because they are
 * exactly the kind of thing that rots silently:
 *
 *   1. A value cell reads `step.state` — the data model — and nothing else.
 *   2. The "what happened" cell is AUTHORED text: `firstSentence(explanation)`.
 *      There is deliberately NO code path from `highlights` into a cell. A view
 *      layer that reconstructs meaning out of highlight ids is a second
 *      narration channel able to disagree with the sentence the lesson author
 *      wrote, on the one product whose promise is that nothing is faked.
 *
 * Both rules were learned the hard way: two drafts of the redesign broke them
 * (one paraphrased the algorithm, one derived the column from highlight kinds)
 * and both were caught in review. The tests pin them.
 */
import type { LedgerColumn, LedgerSpec, Trace } from './types';

// The CONTRACT (`LedgerColumn`, `LedgerSpec`) lives in `core/types.ts`, which is
// the root of the dependency graph and imports nothing — `Algorithm.ledger`
// needs the shape. This module owns the BEHAVIOUR. Re-exported here so callers
// that only care about the ledger have one import.
export type { LedgerColumn, LedgerSpec };

export interface LedgerCell {
  text: string;
  numeric: boolean;
  /**
   * True when the cell's content is deliberately ABSENT from the DOM rather
   * than merely hidden — the Final Run suppression below, and the Predict veil
   * in the island. Styling a leak is not hiding it: opacity and colour are
   * defeated by forced-colors mode, by a screen reader reading the accessible
   * name rather than the paint, by select-all, and by print.
   */
  withheld: boolean;
}

export interface LedgerRow {
  /** 1-based row number, shown to the reader and used for "Go to step N". */
  n: number;
  /** Zero-based index into the trace — what `Player.seek()` takes. */
  index: number;
  cells: LedgerCell[];
  /** The authored sentence, truncated. Also the text of its own wide cell. */
  what: string;
}

export interface Ledger {
  headers: string[];
  rows: LedgerRow[];
  /** Index into `headers` of the first cost column, or `null` when there is none. */
  costIndex: number | null;
}

export interface BuildLedgerOptions {
  /**
   * Blank the cost cell of the LAST row.
   *
   * Not a hypothetical: `src/lib/challenges.ts` pins `binary-search/binary-search`
   * to `[1,3,5,7,9,11] target=7` and `binary-search.mdx` mounts its visualizer on
   * that identical string, so a server-rendered "comparisons" column would print
   * the Final Run's answer above the fold, at build time, on page load. Worse
   * than a spoiler: `FinalRun.astro` grants Practiced credit on the basis that
   * the number "came out of the reader's head" because the card had not shown
   * it — and the ledger is not the card, so that flag never trips and the ladder
   * would record an earned pass with the answer already on screen.
   */
  suppressFinalCost?: boolean;
}

/** Placeholder for a withheld or inapplicable value. Never a real value. */
const ABSENT = '·';

/**
 * The authored sentence, truncated deterministically to its first clause.
 *
 * Deterministic because the alternative — a designer writing terser copy for the
 * table — is hand-mocking the product. When an optional `Step.summary` ships
 * (a §11 amendment with a stated per-algorithm authoring cost) this reads that
 * instead; until then the first sentence of `explanation` is the honest source.
 */
export function firstSentence(text: string): string {
  const clean = String(text ?? '').trim();
  const match = clean.match(/^(.{0,120}?[.;])(\s|$)/);
  const picked = match ? match[1] : clean;
  return picked.replace(/[.;]$/, '');
}

/** Numbers are numeric unless a column says otherwise; strings never are. */
function cellOf(value: string | number | null, numeric?: boolean): LedgerCell {
  if (value === null || value === undefined || value === '') {
    return { text: ABSENT, numeric: numeric ?? false, withheld: false };
  }
  return {
    text: String(value),
    numeric: numeric ?? typeof value === 'number',
    withheld: false,
  };
}

/** Every metrics key any step emits, in first-seen order (the generic fallback). */
function metricKeys<TState>(trace: Trace<TState>): string[] {
  const keys: string[] = [];
  for (const step of trace) {
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
 * the row's own `n`, and it carries the "Go to step N" button, because a `<tr>`
 * with `role="button"` stops being a row and takes the column-header
 * association down with it.
 */
export function buildLedger<TState>(
  trace: Trace<TState>,
  spec?: LedgerSpec<TState>,
  options: BuildLedgerOptions = {},
): Ledger {
  const declared = spec?.columns ?? [];
  // With no declared columns, surface whatever counters the algorithm already
  // emits, so a structure lesson still gets a table with something in it.
  const fallbackCostKeys = declared.length === 0 ? metricKeys(trace) : [];
  const costKeys = spec?.costKey ? [spec.costKey] : fallbackCostKeys;

  const headers = [
    ...declared.map((column) => column.label),
    'what happened',
    ...costKeys,
  ];
  const costIndex =
    costKeys.length > 0 ? headers.length - costKeys.length : null;

  const rows: LedgerRow[] = trace.map((step, index) => {
    const valueCells = declared.map((column) =>
      cellOf(column.from(step), column.numeric),
    );
    const what = firstSentence(step.explanation);
    const costCells = costKeys.map((key) =>
      cellOf(step.metrics?.[key] ?? null, true),
    );

    return {
      n: index + 1,
      index,
      what,
      cells: [
        ...valueCells,
        { text: what, numeric: false, withheld: false },
        ...costCells,
      ],
    };
  });

  if (options.suppressFinalCost && costIndex !== null && rows.length > 0) {
    const last = rows[rows.length - 1];
    for (let i = costIndex; i < last.cells.length; i += 1) {
      last.cells[i] = { text: ABSENT, numeric: true, withheld: true };
    }
  }

  return { headers, rows, costIndex };
}
