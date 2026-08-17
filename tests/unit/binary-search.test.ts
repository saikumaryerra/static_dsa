import { describe, expect, it } from 'vitest';
import {
  binarySearch,
  type BinarySearchInput,
} from '../../src/viz/algorithms/binary-search';
import type { Highlight } from '../../src/viz/core/types';

/** Collects every highlight of a given kind across a whole trace. */
function highlightsOfKind(
  trace: ReturnType<typeof binarySearch.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('binarySearch.run', () => {
  it('ends in a `found` highlight on the correct index for a present target', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7], target: 5 });
    const last = trace[trace.length - 1]!;

    expect(last.state.foundIndex).toBe(2);
    expect(last.highlights).toContainEqual({ kind: 'found', ids: ['i2'] });
    // The very last step is the terminal found step.
    expect(last.explanation).toMatch(/Found 5 at index 2/);
  });

  it('ends with an empty range and a "not in the array" explanation for an absent target', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7], target: 4 });
    const last = trace[trace.length - 1]!;

    // Empty window: lo has passed hi.
    expect(last.state.lo).toBeGreaterThan(last.state.hi);
    expect(last.explanation).toMatch(/not in the array/);
    // No `found` highlight anywhere in the trace, and no found index.
    expect(highlightsOfKind(trace, 'found')).toHaveLength(0);
    expect(last.state.foundIndex).toBeNull();
    // The terminal step carries no in-range cells.
    expect(last.highlights ?? []).toHaveLength(0);
  });

  it('emits the default input trace ending in found (defaultInput present target)', () => {
    const trace = binarySearch.run(binarySearch.defaultInput());
    const last = trace[trace.length - 1]!;
    expect(last.state.foundIndex).toBe(3); // value 7 at index 3 in [1,3,5,7,9,11]
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7], target: 5 });
    const firstBefore = trace[0]!.state.array[0];

    // Corrupt the last step's array; earlier snapshots must be untouched.
    trace[trace.length - 1]!.state.array[0] = 999;

    expect(trace[0]!.state.array[0]).toBe(firstBefore);
    expect(trace[0]!.state.array[0]).not.toBe(999);
  });

  it('states the comparison count in the final explanation (A11Y-2)', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7, 9, 11], target: 11 });
    const last = trace[trace.length - 1]!;
    // The metrics pill and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `after ${last.metrics!['comparisons']} comparisons`,
    );
  });

  it('says "1 comparison", not "1 comparisons", after a single probe', () => {
    const trace = binarySearch.run({ array: [5], target: 5 });
    expect(trace[trace.length - 1]!.explanation).toContain(
      'after 1 comparison.',
    );
  });

  it('reports comparisons as a monotonic non-decreasing metric', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7, 9, 11], target: 11 });
    let previous = -1;
    for (const step of trace) {
      const comparisons = step.metrics?.['comparisons'] ?? 0;
      expect(comparisons).toBeGreaterThanOrEqual(previous);
      previous = comparisons;
    }
  });
});

describe('binarySearch.parseInput', () => {
  it('parses a valid "[..] target=n" string into typed input', () => {
    expect(binarySearch.parseInput('[1,3,5,7] target=5')).toEqual({
      array: [1, 3, 5, 7],
      target: 5,
    } satisfies BinarySearchInput);
  });

  it('tolerates whitespace and negative numbers', () => {
    expect(binarySearch.parseInput('[ -3, 0, 4 ]  target = -3')).toEqual({
      array: [-3, 0, 4],
      target: -3,
    });
  });

  it('rejects a string with no array, naming the field that is actually empty', () => {
    // The message may not say "type an array AND target" — the reader who sees
    // it has a target on screen (this string is what the island composes from a
    // filled target field and an empty array field), and being told to supply
    // what you already supplied is why the old wording sent people in circles.
    expect(binarySearch.parseInput('target=5')).toEqual({
      error: 'Type the numbers to search, e.g. 1,3,5,7',
    });
    expect(binarySearch.parseInput('')).toEqual({
      error: 'Type the numbers to search, e.g. 1,3,5,7',
    });
    expect(binarySearch.parseInput('   target = -12  ')).toEqual({
      error: 'Type the numbers to search, e.g. 1,3,5,7',
    });
  });

  it('still reads the EMPTY array literal as an empty array, not as "no array"', () => {
    // `[]` is a value the trace handles ("The array is empty, so 5 cannot be
    // found"); only a blank field is missing input.
    expect(binarySearch.parseInput('[] target=5')).toEqual({
      array: [],
      target: 5,
    });
  });

  it('rejects a missing target', () => {
    expect(binarySearch.parseInput('[1,3,5,7]')).toEqual({
      error: 'Add a target, e.g. [1,3,5,7] target=5',
    });
  });

  it('rejects non-integer values', () => {
    expect(binarySearch.parseInput('[1,2,x] target=5')).toEqual({
      error: 'Use whole numbers only, e.g. [1,3,5,7]',
    });
  });

  it('rejects arrays longer than 30 (the input cap)', () => {
    const thirtyOne = Array.from({ length: 31 }, (_, i) => i);
    const raw = `[${thirtyOne.join(',')}] target=5`;
    expect(binarySearch.parseInput(raw)).toEqual({
      error: 'Keep the array to 30 numbers or fewer.',
    });
  });

  it('rejects an unsorted array (the binary-search precondition)', () => {
    expect(binarySearch.parseInput('[3,1,2] target=2')).toEqual({
      error: 'Binary search needs a sorted array — try [1,3,5,7].',
    });
  });
});

/**
 * THE P0 GUARD: the field's own help text reads "Up to 30 whole numbers,
 * comma-separated", and the bracketed placeholder that showed the other form
 * disappears on the first keystroke. A parser that demanded the brackets was
 * therefore refusing the only format still on screen — the product's central
 * promise ("run it on your own input") failing on its own instructions. Both
 * forms are legal now, and everything downstream of reading them is unchanged.
 */
describe('binarySearch.parseInput: the bare comma-separated form', () => {
  /** The two spellings of one input must be indistinguishable afterwards. */
  const bothForms = (bare: string, bracketed: string): void => {
    const fromBare = binarySearch.parseInput(bare);
    expect(fromBare, bare).toEqual(binarySearch.parseInput(bracketed));
    // Not just the same parse — the same RUN, which is what the reader sees.
    expect(binarySearch.run(fromBare as BinarySearchInput), bare).toEqual(
      binarySearch.run(binarySearch.parseInput(bracketed) as BinarySearchInput),
    );
  };

  it('accepts a bare list and produces the same trace as the bracketed form', () => {
    expect(binarySearch.parseInput('1,3,5,7 target=5')).toEqual({
      array: [1, 3, 5, 7],
      target: 5,
    } satisfies BinarySearchInput);
    bothForms('1,3,5,7 target=5', '[1,3,5,7] target=5');
  });

  it('accepts every whitespace variant of both forms', () => {
    bothForms('1, 3, 5, 7 target=5', '[1,3,5,7] target=5');
    bothForms('  1 , 3 , 5 , 7   target = 5 ', '[ 1, 3, 5, 7 ] target=5');
    bothForms('-3, 0, 4 target=-3', '[-3,0,4] target = -3');
    bothForms('5 target=5', '[5] target=5');
  });

  it('reports the documented repro accurately instead of misdiagnosing it', () => {
    // The reader types the documented format, `9,2,7,4,1` with target 4. It is
    // now READ — so the only thing left to say is the real problem, the one the
    // lesson teaches, on the field that holds it.
    expect(binarySearch.parseInput('9,2,7,4,1 target=4')).toEqual({
      error: 'Binary search needs a sorted array — try [1,3,5,7].',
    });
  });

  it('keeps the 30-item cap on the bare form', () => {
    const thirty = Array.from({ length: 30 }, (_, i) => i).join(',');
    const thirtyOne = Array.from({ length: 31 }, (_, i) => i).join(',');
    expect(binarySearch.parseInput(`${thirty} target=5`)).toEqual({
      array: Array.from({ length: 30 }, (_, i) => i),
      target: 5,
    });
    expect(binarySearch.parseInput(`${thirtyOne} target=5`)).toEqual({
      error: 'Keep the array to 30 numbers or fewer.',
    });
  });

  it('keeps every other guarantee on the bare form', () => {
    // Whole numbers only.
    expect(binarySearch.parseInput('1,2,x target=5')).toEqual({
      error: 'Use whole numbers only, e.g. [1,3,5,7]',
    });
    expect(binarySearch.parseInput('1,2.5,3 target=5')).toEqual({
      error: 'Use whole numbers only, e.g. [1,3,5,7]',
    });
    // Sorted precondition.
    expect(binarySearch.parseInput('3,1,2 target=2')).toEqual({
      error: 'Binary search needs a sorted array — try [1,3,5,7].',
    });
    // A missing target is still a target problem, so it still names the target.
    expect(binarySearch.parseInput('1,3,5,7')).toEqual({
      error: 'Add a target, e.g. [1,3,5,7] target=5',
    });
    expect(binarySearch.parseInput('1,3,5,7 target=')).toEqual({
      error: 'Add a target, e.g. [1,3,5,7] target=5',
    });
  });

  it('blames the target field, not the array, for an unreadable target', () => {
    // The island composes `${array} target=${target}`, so a junk target would
    // land inside the array's own tokens if the clause were merely deleted —
    // and the reader would be sent to fix the field they got right.
    expect(binarySearch.parseInput('1,3,5,7 target=abc')).toEqual({
      error: 'Add a target, e.g. [1,3,5,7] target=5',
    });
  });

  it('never throws, whatever is typed', () => {
    const nonsense = [
      '',
      '   ',
      ',',
      ',,,',
      '[',
      '[1,3,5',
      '1,3,5]',
      'target=',
      'target=target=5',
      '[1,3] [5,7] target=5',
      '💥 target=5',
      'target=5 1,3,5,7',
    ];
    for (const raw of nonsense) {
      expect(() => binarySearch.parseInput(raw), raw).not.toThrow();
      const result = binarySearch.parseInput(raw);
      // Either typed input or a friendly, non-empty message. Never a throw,
      // never an empty string the error region would render as a blank alert.
      if ('error' in result) {
        expect(result.error.length, raw).toBeGreaterThan(0);
      } else {
        expect(Array.isArray(result.array), raw).toBe(true);
      }
    }
  });
});

describe('binarySearch.ledger (redesign §7)', () => {
  it('declares lo · mid · hi over comparisons', () => {
    expect(binarySearch.ledger?.columns.map((c) => c.label)).toEqual([
      'lo',
      'mid',
      'hi',
    ]);
    expect(binarySearch.ledger?.costKey).toBe('comparisons');
  });

  it('reads each column straight off the step state the renderer draws', () => {
    const trace = binarySearch.run({ array: [1, 3, 5, 7, 9, 11], target: 7 });
    const read = (i: number): (string | number | null)[] =>
      binarySearch.ledger!.columns.map((c) => c.from(trace[i]!));

    // Step 0 has no probe yet: `mid` is absent, not zero and not carried over.
    expect(read(0)).toEqual([0, null, 5]);
    // Every row's values are the SAME snapshot the picture is drawn from.
    for (let i = 0; i < trace.length; i += 1) {
      const { lo, mid, hi } = trace[i]!.state;
      expect(read(i), `row ${i}`).toEqual([lo, mid, hi]);
    }
  });

  it('names a cost key the trace actually emits', () => {
    const trace = binarySearch.run(binarySearch.defaultInput());
    const key = binarySearch.ledger!.costKey!;
    for (const step of trace) {
      expect(step.metrics?.[key]).toBeTypeOf('number');
    }
  });
});

describe('binarySearch.predictStep (M8.2)', () => {
  /** The question for step `i`, or `null`. */
  const ask = (
    input: BinarySearchInput,
    i: number,
  ): ReturnType<NonNullable<typeof binarySearch.predictStep>> =>
    binarySearch.predictStep!(binarySearch.run(input), i, input);

  it('returns null on the last step — there is no successor to grade against', () => {
    const input: BinarySearchInput = { array: [1, 3, 5, 7], target: 5 };
    const trace = binarySearch.run(input);
    expect(ask(input, trace.length - 1)).toBeNull();
    // Every earlier step DOES have a question — binary search always decides.
    for (let i = 0; i < trace.length - 1; i += 1) {
      expect(ask(input, i)).not.toBeNull();
    }
  });

  it('checks foundIndex FIRST: the hit grades "Found it", not a left/right read', () => {
    // [1,3,5,7] target 5: step 1 probes index 1 (3 < 5), step 2 probes index 2
    // and hits. That hit's value (5) is NOT less than the target, so a grader
    // that compared before checking foundIndex would answer "Go left".
    const input: BinarySearchInput = { array: [1, 3, 5, 7], target: 5 };
    expect(binarySearch.run(input)[2]!.state.foundIndex).toBe(2);
    expect(ask(input, 1)!.choices[ask(input, 1)!.correctIndex]).toBe(
      'Found it',
    );
  });

  it('checks the empty-window terminal before reading array[mid]', () => {
    // [1,3,5,7] target 4 ends with mid === null. A grader that read
    // array[mid] first would get `undefined`, and `undefined < 4` is false —
    // silently answering "Go left" on the step where the search gives up.
    const input: BinarySearchInput = { array: [1, 3, 5, 7], target: 4 };
    const trace = binarySearch.run(input);
    const terminal = trace[trace.length - 1]!;
    expect(terminal.state.mid).toBeNull();
    expect(terminal.state.foundIndex).toBeNull();

    const q = ask(input, trace.length - 2)!;
    expect(q.choices[q.correctIndex]).toBe('Not present');
  });

  it('grades the next probe against the target, not the lo/hi window', () => {
    // Probe below the target → the search moves right.
    const right: BinarySearchInput = { array: [1, 3, 5, 7, 9, 11], target: 11 };
    expect(binarySearch.run(right)[1]!.state.mid).toBe(2); // holds 5
    const qRight = ask(right, 0)!;
    expect(qRight.choices[qRight.correctIndex]).toBe('Go right');

    // Probe above the target → the search moves left.
    const left: BinarySearchInput = { array: [1, 3, 5, 7], target: 1 };
    expect(binarySearch.run(left)[1]!.state.mid).toBe(1); // holds 3
    const qLeft = ask(left, 0)!;
    expect(qLeft.choices[qLeft.correctIndex]).toBe('Go left');
  });

  it('asks about the FIRST probe on the step where none has happened yet', () => {
    const input = binarySearch.defaultInput();
    const trace = binarySearch.run(input);
    // The initial step is the only one that can have a successor without a
    // probe of its own: the empty-window terminal is `mid === null` too, but it
    // is always the last step.
    expect(trace[0]!.state.mid).toBeNull();
    expect(binarySearch.predictStep!(trace, 0, input)!.prompt).toBe(
      'What happens at the first probe?',
    );
  });

  it('asks nothing about an array that never probes at all', () => {
    // Step 0 of an empty array already reads "The array is empty, so 5 cannot
    // be found" — the answer, in words, on screen — and there is no first probe
    // to name. A question here would be free, not retrieval.
    const input: BinarySearchInput = { array: [], target: 5 };
    const trace = binarySearch.run(input);
    expect(trace).toHaveLength(2);
    expect(trace[0]!.explanation).toContain('cannot be found');
    expect(binarySearch.predictStep!(trace, 0, input)).toBeNull();
  });

  /**
   * THE REGRESSION GUARD for the whole "marked wrong for reading the screen
   * correctly" class of bug.
   *
   * Grading is one step ahead on purpose (grading the current step would let
   * the reader read the answer off the explanation the strip sits above), so
   * the fix has to live in the prompt: it must scope the question past the step
   * the reader is looking at. Note the guard is on the PROMPT and never on the
   * answer — the answer legitimately equals the direction the current
   * explanation names whenever two probes run the same way, which the last case
   * in this block pins.
   */
  describe('the prompt always names WHICH probe it asks about', () => {
    /**
     * The authored run (defaultInput is the same input the lesson passes), an
     * absent target so the empty-window terminal is covered, a target the first
     * probe overshoots, a single-item array, and a longer even-length run.
     */
    const INPUTS: BinarySearchInput[] = [
      binarySearch.defaultInput(),
      { array: [1, 3, 5, 7], target: 4 },
      { array: [1, 3, 5, 7], target: 1 },
      { array: [5], target: 5 },
      { array: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], target: 10 },
    ];

    it('reproduces the defect it fixes: at index 1 the screen says "right" and the answer is "Go left"', () => {
      // The lesson's authored <Visualizer input="[1,3,5,7,9,11] target=7">.
      const input = binarySearch.parseInput(
        '[1,3,5,7,9,11] target=7',
      ) as BinarySearchInput;
      const trace = binarySearch.run(input);

      expect(trace[1]!.explanation).toContain('search the right');
      const q = binarySearch.predictStep!(trace, 1, input)!;
      // The graded answer is the NEXT probe's direction, not this step's.
      expect(q.choices[q.correctIndex]).toBe('Go left');
      // So the prompt must say which probe it means. Spelled out rather than
      // imported: a test that read the constant could not catch a bad edit.
      expect(q.prompt).toBe('After this step, what happens at the next probe?');
    });

    it('scopes every question past the step on screen, and leaks no answer word', () => {
      for (const input of INPUTS) {
        const trace = binarySearch.run(input);
        for (let i = 0; i < trace.length; i += 1) {
          const q = binarySearch.predictStep!(trace, i, input);
          if (!q) continue;
          const label = `step ${i} of [${input.array.join(',')}] target=${input.target}`;

          // Every prompt names the probe it asks about.
          expect(q.prompt, label).toMatch(/\b(first|next) probe\b/);
          // The moment the step on screen has resolved a direction, the prompt
          // has to put the question AFTER it — the exact trap this guards.
          if (/search the (left|right)/.test(trace[i]!.explanation)) {
            expect(q.prompt, label).toBe(
              'After this step, what happens at the next probe?',
            );
          }
          // And the prompt never carries an answer word itself, in either
          // direction: it may not leak the outcome, and it may not repeat the
          // decision the explanation below has already made.
          expect(q.prompt, label).not.toMatch(/left|right|found|present/i);
        }
      }
    });

    it('cannot be a guard on the ANSWER: consecutive probes may share a direction', () => {
      // [1,3,5,7,9,11] target 11 probes index 2 (5 < 11) and then index 4
      // (9 < 11) — both go right. So "the answer never matches the direction
      // the current explanation names" is FALSE for correct traces, and only
      // the prompt's wording can carry the invariant.
      const input: BinarySearchInput = {
        array: [1, 3, 5, 7, 9, 11],
        target: 11,
      };
      const trace = binarySearch.run(input);
      expect(trace[1]!.explanation).toContain('search the right');
      const q = binarySearch.predictStep!(trace, 1, input)!;
      expect(q.choices[q.correctIndex]).toBe('Go right');
    });
  });

  it('offers three questions on the authored run — the floor a pass is credited at', () => {
    // The Visualizer counts these at build time and hands the number to the
    // island (`data-predict-items`), which credits a predict pass at ≥80%
    // across min(5, that count) answers. Pinned here so the number quoted in
    // `Visualizer.astro` cannot rot: four steps, three predictable.
    const input = binarySearch.parseInput(
      '[1,3,5,7,9,11] target=7',
    ) as BinarySearchInput;
    const trace = binarySearch.run(input);
    const asked = trace.filter(
      (_, i) => binarySearch.predictStep!(trace, i, input) !== null,
    );
    expect(trace).toHaveLength(4);
    expect(asked).toHaveLength(3);
  });

  it('offers the four fixed choices with a correctIndex inside them, at every step', () => {
    const inputs: BinarySearchInput[] = [
      binarySearch.defaultInput(),
      { array: [1, 3, 5, 7], target: 4 },
      { array: [], target: 5 },
      { array: [5], target: 5 },
    ];
    for (const input of inputs) {
      const trace = binarySearch.run(input);
      for (let i = 0; i < trace.length; i += 1) {
        const q = binarySearch.predictStep!(trace, i, input);
        if (!q) continue;
        expect(q.choices).toEqual([
          'Go left',
          'Go right',
          'Found it',
          'Not present',
        ]);
        // §11.2 caps choices at 4.
        expect(q.choices.length).toBeLessThanOrEqual(4);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(q.choices.length);
      }
    }
  });
});
