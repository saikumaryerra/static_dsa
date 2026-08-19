/**
 * `core/ledger.ts` — the trace, written out (Plan C §1).
 *
 * The derivation lives in a pure module precisely so this harness can reach it:
 * Vitest runs `environment: 'node'` with no DOM, and nothing below needs one.
 * Its DOM half — the `<details>`, the row seeks, the predict gate — belongs to
 * `tests/e2e/plan-c-ledger.spec.ts`.
 *
 * The two PROVENANCE RULES are asserted here rather than trusted to review,
 * because they are exactly the kind of invariant that rots silently:
 *
 *   1. A value cell reads `step.state` — the data model — and nothing else.
 *   2. The "what happened" cell is AUTHORED text, never re-derived from
 *      `highlights`.
 *
 * Rule 2 is tested structurally: a trace is built whose highlights say one
 * thing and whose `explanation` says another, and the table must follow the
 * sentence. Two drafts of this design broke that — one paraphrased the
 * algorithm, one derived a column from highlight kinds — on the one product
 * whose promise is that nothing is faked.
 *
 * Where a shape could drift from what ships, the trace is the REAL one:
 * `binarySearch.run(defaultInput())` and the whole registry, not a fixture.
 */
import { describe, expect, it } from 'vitest';
import { binarySearch } from '../../src/viz/algorithms/binary-search';
import { bstOperations } from '../../src/viz/algorithms/bst-operations';
import {
  buildLedger,
  firstSentence,
  withoutCost,
  type LedgerSpec,
} from '../../src/viz/core/ledger';
import { algorithms } from '../../src/viz/registry';
import type { Algorithm, Step, Trace } from '../../src/viz/core/types';

/** The columns binary-search declares, restated so this file is self-contained. */
interface SearchState {
  array: number[];
  lo: number;
  mid: number | null;
  hi: number;
  foundIndex: number | null;
}
const SEARCH_SPEC: LedgerSpec<SearchState> = {
  columns: [
    { label: 'lo', from: (s) => s.state.lo, numeric: true },
    { label: 'mid', from: (s) => s.state.mid, numeric: true },
    { label: 'hi', from: (s) => s.state.hi, numeric: true },
  ],
  costKey: 'comparisons',
};

describe('firstSentence', () => {
  it('does NOT split on a semicolon, and keeps the terminator', () => {
    // The flagship lesson's own sentence. An earlier draft used /[.;]/ and
    // truncated to "Search window is indices 0–5", losing the probe — the
    // single most-read cell on the site.
    expect(
      firstSentence(
        'Search window is indices 0–5; middle index 2 holds 5, which is less than 7. Discard the left half.',
      ),
    ).toBe(
      'Search window is indices 0–5; middle index 2 holds 5, which is less than 7.',
    );
  });

  it('splits on ? and ! as well as .', () => {
    expect(firstSentence('Is 5 the target? No, keep going.')).toBe(
      'Is 5 the target?',
    );
    expect(firstSentence('Found it! Stop here.')).toBe('Found it!');
  });

  it('does not split inside a number: a terminator needs whitespace or the end', () => {
    expect(firstSentence('The load factor is 0.75 after this insert.')).toBe(
      'The load factor is 0.75 after this insert.',
    );
  });

  it('is total — never throws, never returns undefined', () => {
    expect(firstSentence('')).toBe('');
    expect(firstSentence('   ')).toBe('');
    expect(firstSentence('no terminator here')).toBe('no terminator here');
    expect(firstSentence('  Trimmed.  ')).toBe('Trimmed.');
  });

  it('leaves every sentence a lesson actually ships intact', async () => {
    // The 160-character bound is a guard against a pathological explanation,
    // not a working truncation: measured across every algorithm's default run,
    // the longest first sentence is 128 characters (insertion-sort's opener),
    // and every one of them ends in a terminator the regex finds.
    for (const step of await everyShippedStep()) {
      const sentence = firstSentence(step.explanation);
      expect(step.explanation.startsWith(sentence)).toBe(true);
      expect(sentence).not.toBe('');
    }
  });
});

describe('buildLedger — provenance', () => {
  it('reads step.state for value cells and NEVER highlights', () => {
    // A step whose highlights say one thing and whose state says another. The
    // cell must follow the state. This is provenance rule 1, and it is a test
    // because two drafts of this design broke it.
    const trace: Trace<{ lo: number }> = [
      {
        state: { lo: 7 },
        explanation: 'x.',
        highlights: [{ kind: 'range', ids: ['i0', 'i9'] }],
      },
    ];
    const spec: LedgerSpec<{ lo: number }> = {
      columns: [{ label: 'lo', from: (s) => s.state.lo, numeric: true }],
    };
    expect(buildLedger(trace, spec).rows[0]!.cells[0]!.text).toBe('7');
  });

  it('takes "what happened" verbatim from the authored explanation', () => {
    // Provenance rule 2. No paraphrase, no derivation from highlight kinds —
    // both were tried and rejected in review.
    const trace: Trace<unknown> = [
      {
        state: {},
        explanation: 'Swap 5 and 2. They were out of order.',
        highlights: [{ kind: 'swap', ids: ['i0', 'i1'] }],
      },
    ];
    expect(buildLedger(trace).rows[0]!.what).toBe('Swap 5 and 2.');
  });

  it('lets no word of a highlight kind reach any cell', () => {
    const trace: Trace<{ n: number }> = [
      {
        state: { n: 1 },
        explanation: 'The queue is empty.',
        highlights: [{ kind: 'swap', ids: ['i0', 'i1'] }],
        metrics: { steps: 0 },
      },
    ];
    const rendered = buildLedger(trace)
      .rows[0]!.cells.map((cell) => cell.text)
      .join(' ');
    expect(rendered).not.toMatch(/swap/i);
  });
});

describe('buildLedger — the row cap', () => {
  it('caps at 200 rows and reports the true total', () => {
    const trace: Trace<unknown> = Array.from({ length: 901 }, (_, i) => ({
      state: {},
      explanation: `Step ${i}.`,
    }));
    const ledger = buildLedger(trace);
    expect(ledger.rows).toHaveLength(200);
    expect(ledger.total).toBe(901);
    // The reader is told, in words, by the caller comparing these two numbers —
    // so a bounded output can never be a silent one.
    expect(ledger.rows.length).toBeLessThan(ledger.total);
  });

  it('reports rows.length === total whenever it does not bind', () => {
    const trace: Trace<unknown> = Array.from({ length: 33 }, (_, i) => ({
      state: {},
      explanation: `Step ${i}.`,
    }));
    const ledger = buildLedger(trace);
    expect(ledger.rows).toHaveLength(33);
    expect(ledger.total).toBe(33);
  });

  it('never binds on any run a lesson actually ships', async () => {
    // Measured, not assumed: the largest default run in the registry is
    // selection-sort at 33 steps (bubble 29, insertion 31, BST 19,
    // binary-search 4), so the cap has ~6x of headroom over authored content
    // and binds only on a custom run near the input caps.
    const lengths = await Promise.all(
      Object.keys(algorithms).map(async (id) => {
        const algo = await (algorithms as AnyAlgoMap)[id]!();
        const trace = algo.run(algo.defaultInput());
        expect(buildLedger(trace).rows).toHaveLength(trace.length);
        return trace.length;
      }),
    );
    expect(Math.max(...lengths)).toBeLessThan(200);
  });

  it('numbers the rows it kept from 1 and seeks by trace index', () => {
    const trace: Trace<unknown> = Array.from({ length: 250 }, (_, i) => ({
      state: {},
      explanation: `Step ${i}.`,
    }));
    const rows = buildLedger(trace).rows;
    expect(rows[0]!.n).toBe(1);
    expect(rows[0]!.index).toBe(0);
    expect(rows[199]!.n).toBe(200);
    expect(rows[199]!.index).toBe(199);
  });
});

describe('buildLedger — a declared spec', () => {
  const trace = binarySearch.run(binarySearch.defaultInput());
  const ledger = buildLedger(trace, SEARCH_SPEC);

  it('orders headers: declared columns, what happened, then cost', () => {
    expect(ledger.headers).toEqual([
      'lo',
      'mid',
      'hi',
      'what happened',
      'comparisons',
    ]);
    expect(ledger.costIndex).toBe(4);
  });

  it('emits one row per step, in trace order, with seekable indices', () => {
    expect(ledger.rows).toHaveLength(trace.length);
    expect(ledger.rows.map((row) => row.index)).toEqual(
      trace.map((_step, index) => index),
    );
    expect(ledger.rows.map((row) => row.n)).toEqual(
      trace.map((_step, index) => index + 1),
    );
  });

  it('keeps every row aligned with the headers, cell for cell', () => {
    // The renderer walks headers and cells in lockstep, so a row that is one
    // cell short would silently shift every value under the wrong heading.
    for (const row of ledger.rows) {
      expect(row.cells).toHaveLength(ledger.headers.length);
    }
  });

  it('reads value cells out of step.state', () => {
    trace.forEach((step, index) => {
      const row = ledger.rows[index]!;
      expect(row.cells[0]!.text).toBe(String(step.state.lo));
      expect(row.cells[2]!.text).toBe(String(step.state.hi));
    });
  });

  it('renders a null state value as the absent mark, not as "null"', () => {
    // Step 0 has no probe yet, so `mid` is null by construction.
    expect(trace[0]!.state.mid).toBeNull();
    expect(ledger.rows[0]!.cells[1]!.text).toBe('·');
    // Still a numeric column: the absent mark must not knock the column out of
    // its right-aligned, tabular-numeral rhythm.
    expect(ledger.rows[0]!.cells[1]!.numeric).toBe(true);
  });

  it('carries the cost from step.metrics under the declared costKey', () => {
    trace.forEach((step, index) => {
      expect(ledger.rows[index]!.cells[4]!.text).toBe(
        String(step.metrics?.['comparisons']),
      );
    });
  });

  it('puts the authored sentence in its own cell as well as on the row', () => {
    trace.forEach((step, index) => {
      const row = ledger.rows[index]!;
      expect(row.what).toBe(firstSentence(step.explanation));
      expect(row.cells[3]!.text).toBe(row.what);
      expect(row.cells[3]!.numeric).toBe(false);
    });
  });
});

describe('buildLedger — the generic fallback', () => {
  const trace = bstOperations.run(bstOperations.defaultInput());
  const ledger = buildLedger(trace);

  it('still produces a row per step for a structure with no declared columns', () => {
    expect(ledger.rows).toHaveLength(trace.length);
    expect(ledger.rows.length).toBeGreaterThan(1);
  });

  it('surfaces every metric key the trace emits, in first-seen order', () => {
    const firstSeen: string[] = [];
    for (const step of trace) {
      for (const key of Object.keys(step.metrics ?? {})) {
        if (!firstSeen.includes(key)) firstSeen.push(key);
      }
    }
    expect(ledger.headers).toEqual(['what happened', ...firstSeen]);
    expect(ledger.costIndex).toBe(firstSeen.length > 0 ? 1 : null);
  });

  it('offers what happened alone when the algorithm emits no metrics', () => {
    const trace: Trace<unknown> = [{ state: {}, explanation: 'Nothing yet.' }];
    const ledger = buildLedger(trace);
    expect(ledger.headers).toEqual(['what happened']);
    expect(ledger.costIndex).toBeNull();
    expect(ledger.rows[0]!.cells).toHaveLength(1);
  });

  it('marks a missing metric absent rather than inventing a zero', () => {
    // A counter that starts at step 2 must not read as "0 comparisons" on step
    // 1 — a fabricated number is worse than a blank on a table that claims to
    // be the run itself.
    const trace: Trace<unknown> = [
      { state: {}, explanation: 'Ready.' },
      { state: {}, explanation: 'Compare.', metrics: { comparisons: 1 } },
    ];
    const ledger = buildLedger(trace);
    expect(ledger.headers).toEqual(['what happened', 'comparisons']);
    expect(ledger.rows[0]!.cells[1]!.text).toBe('·');
    expect(ledger.rows[1]!.cells[1]!.text).toBe('1');
  });
});

describe('buildLedger — the shape of a cell', () => {
  it('has exactly text and numeric — cost withholding stays deleted', () => {
    // The abandoned build shipped `LedgerCell.withheld` plus a
    // `suppressFinalCost` option to blank a Final Run's answer. Review killed
    // the premise, and the implementation was independently wrong: it read
    // PINNED_INPUTS (12 pairs, because Trace Trials share it) to guard the 6
    // lessons that host a Final Run, so twelve instruments lost a legitimate
    // value to protect six.
    const ledger = buildLedger([{ state: {}, explanation: 'Ready.' }]);
    expect(Object.keys(ledger.rows[0]!.cells[0]!).sort()).toEqual([
      'numeric',
      'text',
    ]);
  });

  it('takes no options parameter, so withholding cannot return by the back door', () => {
    expect(buildLedger.length).toBe(2);
    // @ts-expect-error buildLedger takes (trace, spec?) and nothing else. If a
    // third parameter is ever re-added, this suppression goes unused and
    // `astro check` fails the build — which is the point of asserting it here
    // as well as by arity, since a defaulted parameter would not change arity.
    buildLedger([{ state: {}, explanation: 'Ready.' }], undefined, {
      suppressFinalCost: true,
    });
  });
});

describe('withoutCost — the cost column inherits showMetrics', () => {
  it('drops the whole cost column, headers and cells together', () => {
    // `<Visualizer showMetrics={false}>` is /about's way of saying "no counters
    // on this demo". The generic fallback surfaces every metric key, so without
    // this the table printed `comparisons` on the one instrument whose prop
    // forbids it — the abandoned build's actual behaviour.
    const trace: Trace<unknown> = [
      { state: {}, explanation: 'Start.', metrics: { comparisons: 0 } },
      { state: {}, explanation: 'Probe.', metrics: { comparisons: 1 } },
    ];
    const full = buildLedger(trace);
    expect(full.headers).toEqual(['what happened', 'comparisons']);

    const bare = withoutCost(full);
    expect(bare.headers).toEqual(['what happened']);
    expect(bare.costIndex).toBeNull();
    for (const row of bare.rows) expect(row.cells).toHaveLength(1);
  });

  it('keeps the declared value columns and the authored sentence', () => {
    const spec: LedgerSpec<{ lo: number }> = {
      columns: [{ label: 'lo', from: (step) => step.state.lo, numeric: true }],
      costKey: 'comparisons',
    };
    const bare = withoutCost(
      buildLedger(
        [
          {
            state: { lo: 3 },
            explanation: 'Halve it. Again.',
            metrics: { comparisons: 9 },
          },
        ],
        spec,
      ),
    );

    expect(bare.headers).toEqual(['lo', 'what happened']);
    expect(bare.rows[0]!.cells.map((cell) => cell.text)).toEqual([
      '3',
      'Halve it.',
    ]);
    // The row still knows its sentence and its seek target.
    expect(bare.rows[0]!.what).toBe('Halve it.');
    expect(bare.rows[0]!.index).toBe(0);
  });

  it('returns a ledger that has no cost column unchanged', () => {
    const spec: LedgerSpec<{ lo: number }> = {
      columns: [{ label: 'lo', from: (step) => step.state.lo }],
    };
    const ledger = buildLedger(
      [{ state: { lo: 1 }, explanation: 'Go.' }],
      spec,
    );
    expect(ledger.costIndex).toBeNull();
    // Same object, not a copy: nothing to do is nothing done.
    expect(withoutCost(ledger)).toBe(ledger);
  });

  it('does not touch the true total, so the cap notice still reads correctly', () => {
    const trace = Array.from({ length: 240 }, (_, i) => ({
      state: {},
      explanation: `Step ${i}.`,
      metrics: { comparisons: i },
    }));
    const bare = withoutCost(buildLedger(trace));
    expect(bare.rows).toHaveLength(200);
    expect(bare.total).toBe(240);
  });
});

/** The registry's thunks, widened the way `Visualizer.astro` widens them. */
type AnyAlgoMap = Record<string, () => Promise<Algorithm<unknown, unknown>>>;

/** Every step of every algorithm's default run — the real authored corpus. */
async function everyShippedStep(): Promise<Step<unknown>[]> {
  const traces = await Promise.all(
    Object.keys(algorithms).map(async (id) => {
      const algo = await (algorithms as AnyAlgoMap)[id]!();
      return algo.run(algo.defaultInput());
    }),
  );
  return traces.flat();
}
