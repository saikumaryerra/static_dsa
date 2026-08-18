/**
 * `composeCustomInput` — the bracket-wrap that makes the custom-input box
 * accept the format its own help text advertises ("Up to 30 whole numbers,
 * comma-separated"), gated so it cannot corrupt a non-array instrument's field
 * or a companion token an array instrument already accepts.
 *
 * Pure `(string, string, string) → string`, which is why it is testable here at
 * all: the composition it replaces lives inside `Visualizer.astro`'s `<script>`,
 * and nothing in there is reachable from the `environment: 'node'` harness. The
 * DOM half — that the island actually calls this with the AUTHORED first field
 * — is asserted in `tests/e2e/plan-a-frames.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { composeCustomInput } from '../../src/viz/core/input-hint';

/** The authored first field of an array instrument (`binary-search`). */
const ARRAY = '[1,3,5,7,9,11]';
/** The authored first field of a graph instrument (`bfs`). */
const GRAPH = '0-1,0-2,1-3';
/** The authored first field of a DP instrument (`dp-fib-tabulation`). */
const DP = '6';
/** The authored first field of the one instrument with a companion token. */
const HASH = '[11,24,6,15,20] cap=5';

describe('composeCustomInput', () => {
  it('wraps a bare list for an instrument whose authored input is bracketed', () => {
    expect(composeCustomInput('9,2,7,4,1', '4', ARRAY)).toBe(
      '[9,2,7,4,1] target=4',
    );
  });

  it('leaves an already-bracketed list alone', () => {
    expect(composeCustomInput('[9,2,7]', '4', ARRAY)).toBe('[9,2,7] target=4');
  });

  it('trims before wrapping', () => {
    expect(composeCustomInput('  9, 2 ', '4', ARRAY)).toBe('[9, 2] target=4');
  });

  it('NEVER wraps for a graph instrument', () => {
    expect(composeCustomInput(GRAPH, '0', GRAPH)).toBe('0-1,0-2,1-3 target=0');
  });

  it('NEVER wraps for a DP instrument', () => {
    expect(composeCustomInput('7', '', DP)).toBe('7 target=');
  });

  it('never wraps when the instrument authored no input at all', () => {
    // `arrayPlaceholder`'s build-time fallback would have claimed "[1,3,5,7,9,11]"
    // here and corrupted the field; the authored value is the honest gate.
    expect(composeCustomInput('1,2,3', '2', '')).toBe('1,2,3 target=2');
  });

  it('does not wrap an empty first field into an empty array literal', () => {
    expect(composeCustomInput('', '4', ARRAY)).toBe(' target=4');
  });

  it('normalises nothing else — a malformed list still reaches parseInput', () => {
    expect(composeCustomInput('1,,x', '4', ARRAY)).toBe('[1,,x] target=4');
  });

  it('leaves a companion token alone rather than swallowing it into the list', () => {
    // The hash-table lesson is the one instrument whose first field carries more
    // than a list. `cap=5 [11,24,6]` parses TODAY; wrapping it would produce
    // `[cap=5 [11,24,6]]`, whose first `[…]` is `[cap=5 [11,24,6]` — a working
    // input turned into an error by the fix that was meant to accept more.
    expect(composeCustomInput('cap=5 [11,24,6]', '6', HASH)).toBe(
      'cap=5 [11,24,6] target=6',
    );
    expect(composeCustomInput('11,24,6 cap=5', '6', HASH)).toBe(
      '11,24,6 cap=5 target=6',
    );
  });

  it('leaves a stray closing bracket alone rather than silently truncating', () => {
    // `[9,2],7]` would parse as the array [9,2] — the reader's `7` dropped with
    // no error at all. Unwrapped it reaches the algorithm's own message, which
    // is the honest outcome.
    expect(composeCustomInput('9,2],7', '4', ARRAY)).toBe('9,2],7 target=4');
  });
});
