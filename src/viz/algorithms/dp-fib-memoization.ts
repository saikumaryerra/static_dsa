/**
 * Fibonacci by memoization — instrumented algorithm (site spec §5 L15, M6 design §1.7).
 *
 * Top-down dynamic programming: run the natural recursion `fib(n) = fib(n-1) +
 * fib(n-2)` but cache each answer in `dp[]` so a subproblem is never recomputed.
 * The visual signature is the CACHE HIT: when a needed `dp[k]` is already filled,
 * the algorithm emits a `visited` highlight (violet `✓`, "reused, not recomputed")
 * instead of a `compare` — the exact contrast that distinguishes memoization from
 * plain recursion (recursion lesson) and from tabulation's dull L→R fill.
 *
 * Emitted steps:
 *   1. DESCENT   — `dp[k]` is `active` while its dependencies are still empty
 *      (dimmed); the recursion walks left toward the base cases.
 *   2. BASE      — `dp[0] = 0` / `dp[1] = 1` are written outright (`insert`).
 *   3. CACHE HIT — a call to an already-filled `dp[k]` returns immediately
 *      (`visited`, `✓`) — the payoff DP delivers.
 *   4. BACKFILL  — `dp[k]` is written from its two (now cached) dependencies,
 *      shown `active` + `insert` with the deps `visited` and tie-lined in.
 *   5. DONE      — `dp[n]` is the answer (`found`).
 *
 * TState mirrors TableRenderer's `TableState`; a `null` slot is uncomputed and
 * doubles as the cache ("computed" ⇔ non-null). Ids are `cellId(i)`; the file
 * imports only core types + `snapshot` + the pure `cellId` (architecture §8). The
 * recursion mirrors the lesson's memoized code sample: the recursion lesson's
 * `fib`, now remembering answers.
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { cellId } from '../core/ids';
import type { DpFibInput, DpTableState } from './dp-fib-tabulation';

/** Cap on `n` so the table stays ≤ 31 cells (CLAUDE.md: arrays ≤ 30 → n ≤ 30). */
const MAX_N = 30;

/**
 * Runs top-down Fibonacci for `input.n`, caching answers in `table` so each
 * subproblem is solved once. Each step deep-copies its state via `snapshot()`
 * (spec §11.4). The `visited` highlight marks every cache hit.
 */
function run(input: DpFibInput): Trace<DpTableState> {
  const { n } = input;
  const table: (number | null)[] = new Array<number | null>(n + 1).fill(null);
  const trace: Trace<DpTableState> = [];
  const metrics = { calls: 0, cacheHits: 0 };

  const push = (explanation: string, highlights: Highlight[]): void => {
    trace.push({
      state: snapshot({ table, n }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<DpTableState>);
  };

  push(
    `Computing Fibonacci(${n}) top-down. We start from dp[${n}] and recurse toward the base cases, caching every answer so it is reused — never recomputed.`,
    [],
  );

  /** Recursive fib that records descents, cache hits, base cases, and backfills. */
  const fib = (k: number): number => {
    metrics.calls += 1;

    // CACHE HIT: this subproblem is already solved — reuse it, do not recompute.
    const cached = table[k];
    if (cached !== null) {
      metrics.cacheHits += 1;
      push(
        `dp[${k}] is already computed (${cached}) — reusing the cached value instead of recomputing it. This is the cache hit that makes memoization fast.`,
        [{ kind: 'visited', ids: [cellId(k)] }],
      );
      return cached;
    }

    // BASE CASE: dp[0] = 0, dp[1] = 1.
    if (k <= 1) {
      table[k] = k;
      push(`Base case: dp[${k}] = ${k}. Store it in the cache.`, [
        { kind: 'insert', ids: [cellId(k)] },
      ]);
      return k;
    }

    // DESCENT: dp[k] is being computed; its dependencies are not filled yet.
    push(
      `Computing dp[${k}] needs dp[${k - 1}] and dp[${k - 2}]; neither is cached yet, so recurse down first.`,
      [{ kind: 'active', ids: [cellId(k)], meta: { label: `dp[${k}]` } }],
    );

    const a = fib(k - 1);
    const b = fib(k - 2);
    const sum = a + b;
    table[k] = sum;

    // BACKFILL: both dependencies are now cached; combine and store dp[k].
    push(
      `Both are ready now: dp[${k}] = dp[${k - 1}] + dp[${k - 2}] = ${a} + ${b} = ${sum}. Cache dp[${k}] on the way back up.`,
      [
        { kind: 'active', ids: [cellId(k)], meta: { label: `dp[${k}]` } },
        { kind: 'insert', ids: [cellId(k)] },
        { kind: 'visited', ids: [cellId(k - 1)] },
        { kind: 'visited', ids: [cellId(k - 2)] },
      ],
    );
    return sum;
  };

  const answer = fib(n);

  push(
    `Done: dp[${n}] = ${answer} is the answer. Every subproblem was solved once — Fibonacci(${n}) = ${answer}.`,
    [{ kind: 'found', ids: [cellId(n)] }],
  );
  return trace;
}

/**
 * Parses the custom-input box into an `n` (first whole number found). Returns
 * `{ error }` (never throws) and enforces `0 ≤ n ≤ 30` — same contract as the
 * tabulation variant so the two visualizers accept identical input.
 */
function parseInput(raw: string): DpFibInput | { error: string } {
  const match = raw.match(/-?\d+/);
  if (!match) {
    return { error: 'Type a whole number for n, e.g. 6' };
  }
  const value = Number(match[0]);
  if (value < 0) {
    return {
      error: 'n must be 0 or greater — Fibonacci is undefined below 0.',
    };
  }
  if (value > MAX_N) {
    return { error: `Keep n at ${MAX_N} or less so the table stays readable.` };
  }
  return { n: value };
}

/** The registered Fibonacci-by-memoization algorithm. */
export const dpFibMemoization: Algorithm<DpFibInput, DpTableState> = {
  id: 'dp-fib-memoization',
  label: 'Fibonacci by memoization (top-down)',
  run,
  defaultInput: () => ({ n: 6 }),
  parseInput,
};
