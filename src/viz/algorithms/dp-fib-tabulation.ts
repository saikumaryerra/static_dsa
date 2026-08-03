/**
 * Fibonacci by tabulation — instrumented algorithm (site spec §5 L15, M6 design §1.7).
 *
 * Bottom-up dynamic programming: fill `dp[0..n]` strictly left→right, where every
 * value is ready before it is needed. Emits one `Step` per meaningful state
 * change so the Player can walk the fill:
 *   1. BASE — `dp[0] = 0`, `dp[1] = 1` are known outright (`insert`).
 *   2. READ — for each `i`, `dp[i]` is `active` while its two already-filled
 *      neighbours `dp[i-1]`, `dp[i-2]` are `compare` (dashed tie-lines).
 *   3. FILL — `dp[i]` is written (`insert`).
 *   4. DONE — `dp[n]` is the answer (`found`).
 *
 * TState mirrors TableRenderer's `TableState` ({ table:(number|null)[]; n }); a
 * `null` slot is a cell not yet filled. Ids are `cellId(i)` (`"i3"`), so the
 * algorithm and the renderer agree without the algorithm importing the renderer
 * (architecture §8 — it imports only core types + `snapshot` + the pure `cellId`).
 * The logic mirrors the lesson's tabulation code sample exactly (a `dp` array in a
 * `for i in range(2, n+1)` loop).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { cellId } from '../core/ids';

/** Cap on `n` so the table stays ≤ 31 cells (CLAUDE.md: arrays ≤ 30 → n ≤ 30). */
const MAX_N = 30;

/** Typed input: the Fibonacci index `n` to compute. */
export interface DpFibInput {
  n: number;
}

/** Snapshot state TableRenderer draws (mirrors its `TableState`). */
export interface DpTableState {
  table: (number | null)[];
  n: number;
}

/**
 * Runs bottom-up Fibonacci for `input.n`, emitting one `Step` per read/fill so the
 * Player can watch the table fill left→right. Each step deep-copies its state via
 * `snapshot()` so earlier steps are never corrupted by later fills (spec §11.4).
 */
function run(input: DpFibInput): Trace<DpTableState> {
  const { n } = input;
  const table: (number | null)[] = new Array<number | null>(n + 1).fill(null);
  const trace: Trace<DpTableState> = [];
  const metrics = { additions: 0 };

  /**
   * The addition metric in words, e.g. `"5 additions"` — one per filled cell,
   * the whole cost of the bottom-up fill. The final step states it so the
   * metrics pill's payoff also reaches the `aria-live` explanation and the SVG
   * `<desc>` (A11Y-2), where it contrasts with memoization's call count.
   */
  const additionCount = (): string =>
    `${metrics.additions} addition${metrics.additions === 1 ? '' : 's'}`;

  const push = (explanation: string, highlights: Highlight[]): void => {
    trace.push({
      state: snapshot({ table, n }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<DpTableState>);
  };

  push(
    `Building the Fibonacci table dp[0..${n}] bottom-up. Each dp[i] is filled once, left to right, and reused — no value is ever recomputed.`,
    [],
  );

  // Base cases. dp[0] = 0 always; dp[1] = 1 exists only when n ≥ 1.
  table[0] = 0;
  if (n >= 1) {
    table[1] = 1;
    push('Base cases: dp[0] = 0 and dp[1] = 1 are known outright.', [
      { kind: 'insert', ids: [cellId(0)] },
      { kind: 'insert', ids: [cellId(1)] },
    ]);
  } else {
    push('Base case: dp[0] = 0.', [{ kind: 'insert', ids: [cellId(0)] }]);
  }

  for (let i = 2; i <= n; i += 1) {
    const a = table[i - 1] as number;
    const b = table[i - 2] as number;
    const sum = a + b;
    metrics.additions += 1;

    // READ: dp[i] is the cell being computed; its two neighbours feed it.
    push(
      `dp[${i}] = dp[${i - 1}] + dp[${i - 2}] = ${a} + ${b} = ${sum}. Both neighbours are already in the table, so nothing is recomputed.`,
      [
        { kind: 'active', ids: [cellId(i)], meta: { label: `dp[${i}]` } },
        { kind: 'compare', ids: [cellId(i - 1)] },
        { kind: 'compare', ids: [cellId(i - 2)] },
      ],
    );

    // FILL: write the value into dp[i].
    table[i] = sum;
    push(`Write ${sum} into dp[${i}] and move on.`, [
      { kind: 'insert', ids: [cellId(i)] },
    ]);
  }

  push(
    `Done: dp[${n}] = ${table[n]} is the answer. Fibonacci(${n}) = ${table[n]} after ${additionCount()}.`,
    [{ kind: 'found', ids: [cellId(n)] }],
  );
  return trace;
}

/**
 * Parses the custom-input box into an `n`. The generic input form composes an
 * array/target pair, so we accept the first whole number found (e.g. `"6"`).
 * Returns `{ error }` (never throws) and enforces `0 ≤ n ≤ 30`.
 */
function parseInput(raw: string): DpFibInput | { error: string } {
  const match = raw.match(/-?\d+/);
  if (!match) {
    return { error: 'Type a whole number for n, e.g. 6' };
  }
  const n = Number(match[0]);
  if (n < 0) {
    return {
      error: 'n must be 0 or greater — Fibonacci is undefined below 0.',
    };
  }
  if (n > MAX_N) {
    return { error: `Keep n at ${MAX_N} or less so the table stays readable.` };
  }
  return { n };
}

/** The registered Fibonacci-by-tabulation algorithm. */
export const dpFibTabulation: Algorithm<DpFibInput, DpTableState> = {
  id: 'dp-fib-tabulation',
  label: 'Fibonacci by tabulation (bottom-up)',
  run,
  defaultInput: () => ({ n: 6 }),
  parseInput,
};
