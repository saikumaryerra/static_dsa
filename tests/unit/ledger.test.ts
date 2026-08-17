/**
 * ledger — the run written out (redesign §7).
 *
 * The module is pure by design so this harness (`environment: 'node'`, no DOM)
 * can reach it, and the cases below are the reason that mattered: the ledger's
 * two provenance rules are exactly the sort of invariant that survives review
 * and then quietly rots.
 *
 *   1. A value cell reads `step.state` and nothing else.
 *   2. The "what happened" cell is AUTHORED text, never re-derived from
 *      `highlights`.
 *
 * Rule 2 is asserted structurally rather than by inspection: a trace is built
 * whose highlights say one thing and whose `explanation` says another, and the
 * test demands the table follow the sentence. A future refactor that "helpfully"
 * infers the column from highlight kinds fails here rather than in production,
 * on the one product whose promise is that nothing is faked.
 *
 * The traces are the REAL ones — `binarySearch.run()` and `bstOperations.run()`
 * on their own default inputs — so the shapes cannot drift from what ships.
 */
import { describe, expect, it } from 'vitest';
import { binarySearch } from '../../src/viz/algorithms/binary-search';
import { bstOperations } from '../../src/viz/algorithms/bst-operations';
import { buildLedger, firstSentence } from '../../src/viz/core/ledger';
import type { LedgerSpec } from '../../src/viz/core/ledger';
import type { Step, Trace } from '../../src/viz/core/types';

/** The spec binary-search declares, restated here so the test is self-contained. */
const SEARCH_SPEC: LedgerSpec<{
  array: number[];
  lo: number;
  mid: number | null;
  hi: number;
  foundIndex: number | null;
}> = {
  columns: [
    { label: 'lo', from: (s) => s.state.lo },
    { label: 'mid', from: (s) => s.state.mid },
    { label: 'hi', from: (s) => s.state.hi },
  ],
  costKey: 'comparisons',
};

describe('firstSentence', () => {
  it('truncates at the first clause boundary and drops the punctuation', () => {
    expect(
      firstSentence(
        'Search window is indices 0–5; middle index 2 holds 5, which is less than 7. Discard the left half.',
      ),
    ).toBe('Search window is indices 0–5');
  });

  it('returns a short sentence unchanged apart from its full stop', () => {
    expect(firstSentence('Push 56 onto the top (index 2).')).toBe(
      'Push 56 onto the top (index 2)',
    );
  });

  it('is total: never throws, never returns undefined', () => {
    expect(firstSentence('')).toBe('');
    expect(firstSentence('no terminator here')).toBe('no terminator here');
  });
});

describe('buildLedger — a declared spec', () => {
  const trace = binarySearch.run(binarySearch.defaultInput());
  const ledger = buildLedger(trace, SEARCH_SPEC);

  it('emits one row per step, in trace order, with seekable indices', () => {
    expect(ledger.rows).toHaveLength(trace.length);
    expect(ledger.rows.map((r) => r.index)).toEqual(
      trace.map((_step, index) => index),
    );
    expect(ledger.rows.map((r) => r.n)).toEqual(
      trace.map((_step, index) => index + 1),
    );
  });

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

  it('reads value cells out of step.state', () => {
    trace.forEach((step, index) => {
      const row = ledger.rows[index];
      expect(row.cells[0].text).toBe(String(step.state.lo));
      expect(row.cells[2].text).toBe(String(step.state.hi));
    });
  });

  it('renders a null state value as the absent mark, not as "null"', () => {
    const readyRow = ledger.rows[0];
    // Step 0 has no probe yet, so `mid` is null by construction.
    expect(trace[0].state.mid).toBeNull();
    expect(readyRow.cells[1].text).toBe('·');
    expect(readyRow.cells[1].withheld).toBe(false);
  });

  it('takes the "what happened" cell from the authored explanation', () => {
    trace.forEach((step, index) => {
      expect(ledger.rows[index].what).toBe(firstSentence(step.explanation));
    });
  });
});

describe('buildLedger — provenance rule 2', () => {
  it('follows the authored sentence even when highlights say otherwise', () => {
    // Highlights and prose deliberately disagree. The table must follow prose.
    const trace: Trace<{ n: number }> = [
      {
        state: { n: 1 },
        explanation: 'The queue is empty.',
        highlights: [{ kind: 'swap', ids: ['i0', 'i1'] }],
        metrics: { steps: 0 },
      } as Step<{ n: number }>,
    ];

    const ledger = buildLedger(trace);

    expect(ledger.rows[0].what).toBe('The queue is empty');
    // Nothing anywhere in the row may have come from the `swap` highlight.
    const rendered = ledger.rows[0].cells.map((c) => c.text).join(' ');
    expect(rendered).not.toMatch(/swap/i);
  });
});

describe('buildLedger — the generic fallback', () => {
  const trace = bstOperations.run(bstOperations.defaultInput());
  const ledger = buildLedger(trace);

  it('still produces a row per step for a structure with no declared columns', () => {
    expect(ledger.rows).toHaveLength(trace.length);
    expect(ledger.rows.length).toBeGreaterThan(1);
  });

  it('carries the authored sentence as its only narrative column', () => {
    expect(ledger.headers[0]).toBe('what happened');
    expect(ledger.rows[0].what).toBe(firstSentence(trace[0].explanation));
  });

  it('surfaces whatever metrics the algorithm emits, and no cost column when it emits none', () => {
    const emitted = new Set(
      trace.flatMap((step) => Object.keys(step.metrics ?? {})),
    );
    if (emitted.size === 0) {
      expect(ledger.headers).toEqual(['what happened']);
      expect(ledger.costIndex).toBeNull();
    } else {
      for (const key of emitted) expect(ledger.headers).toContain(key);
    }
  });
});

describe('buildLedger — the Final Run leak', () => {
  const trace = binarySearch.run(binarySearch.defaultInput());

  it('withholds the last row cost when the lesson pins a Final Run to this input', () => {
    const ledger = buildLedger(trace, SEARCH_SPEC, { suppressFinalCost: true });
    const last = ledger.rows[ledger.rows.length - 1];
    const costCell = last.cells[ledger.costIndex!];

    expect(costCell.withheld).toBe(true);
    expect(costCell.text).toBe('·');
  });

  /**
   * The second half of the same leak, and the half that is easy to miss.
   *
   * Suppressing the cost CELL is not enough if the authored sentence says the
   * number out loud. Binary search's final explanation is "Middle index 3 holds
   * 7, which equals the target. Found 7 at index 3 after 3 comparisons." — the
   * count is in the SECOND sentence, so `firstSentence` drops it. That is luck,
   * not design: an author who rewrote it as one sentence would silently print
   * the Final Run's answer above the fold.
   *
   * So the guard lives here rather than in `ledger.ts`. Blanking the sentence
   * automatically would destroy real teaching content to fix a copy problem;
   * failing CI hands it to whoever changed the copy, with the reason attached.
   * If this breaks: reword the lesson's last step, or re-pin the Final Run to an
   * input the page never displays.
   */
  it('the authored sentence of the final row does not state the answer', () => {
    const ledger = buildLedger(trace, SEARCH_SPEC, { suppressFinalCost: true });
    const last = ledger.rows[ledger.rows.length - 1];
    const answer = String(trace[trace.length - 1].metrics?.comparisons);

    expect(last.what).not.toMatch(
      new RegExp(`\\b${answer}\\s+comparison`, 'i'),
    );
  });

  it('leaves every earlier row intact — only the answer is withheld', () => {
    const ledger = buildLedger(trace, SEARCH_SPEC, { suppressFinalCost: true });
    ledger.rows.slice(0, -1).forEach((row) => {
      expect(row.cells[ledger.costIndex!].withheld).toBe(false);
    });
  });

  it('does not withhold anything when the lesson has no pinned Final Run', () => {
    const ledger = buildLedger(trace, SEARCH_SPEC);
    const last = ledger.rows[ledger.rows.length - 1];
    expect(last.cells[ledger.costIndex!].withheld).toBe(false);
    expect(last.cells[ledger.costIndex!].text).toBe(
      String(trace[trace.length - 1].metrics?.comparisons),
    );
  });
});
