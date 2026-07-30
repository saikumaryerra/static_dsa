/**
 * Recursion / Call Stack — instrumented algorithm (site spec §5 L10, §11.4).
 * Runs `factorial(n)` and records the CALL STACK as it grows one frame per call,
 * hits the base case, then unwinds as each call returns:
 *   1. CALL   — push a new frame for `factorial(k)` (insert `+`, active `curr`).
 *   2. BASE   — `n <= 1` returns 1 without recursing (active on the top frame).
 *   3. RETURN — each frame computes `k * factorial(k-1)` and pops (delete `✕`).
 *
 * TState matches CallStackRenderer's `CallStackState` ({ frames: { label; args?;
 * returnValue? }[] }); `frames[0]` is the outermost call (bottom of the stack),
 * the last frame is the current top. Ids are `frameId(depth)` (`"f0"`). Imports
 * only core types + `snapshot` + the pure `frameId` helper (never a renderer —
 * architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { frameId } from '../core/ids';

/**
 * Cap so the stack stays readable AND the result stays a safe integer. `n = 10`
 * gives a 10-deep stack and `factorial(10) = 3_628_800`, still exact in a double.
 */
const MAX_N = 10;

/** Typed input: the argument `n` passed to `factorial`. */
export interface RecursionInput {
  n: number;
}

/** One call frame the renderer draws (mirrors CallStackRenderer's `CallFrame`). */
export interface CallFrame {
  label: string;
  args?: string;
  returnValue?: string | null;
}

/** Snapshot state CallStackRenderer draws: the live stack of frames. */
export interface RecursionState {
  frames: CallFrame[];
}

/**
 * Runs `factorial(input.n)`, emitting one `Step` per call, base case, and return
 * so the Player can walk the stack growing then unwinding. Each step deep-copies
 * its state via `snapshot()` (site spec §11.4). The recursion here mirrors the
 * lesson's code samples exactly: base case `n <= 1`, recursive case
 * `n * factorial(n - 1)`.
 */
function run(input: RecursionInput): Trace<RecursionState> {
  const frames: CallFrame[] = [];
  const trace: Trace<RecursionState> = [];
  const metrics = { calls: 0, maxDepth: 0 };

  const push = (explanation: string, highlights: Highlight[]): void => {
    trace.push({
      state: snapshot({ frames }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<RecursionState>);
  };

  push(
    `The call stack is empty. Calling factorial(${input.n}) pushes a frame per call, then pops them as each returns.`,
    [],
  );

  /** Recursive factorial that records each call/return as it happens. */
  const factorial = (n: number): number => {
    const depth = frames.length;
    frames.push({
      label: `factorial(${n})`,
      args: `n=${n}`,
      returnValue: null,
    });
    metrics.calls += 1;
    metrics.maxDepth = Math.max(metrics.maxDepth, frames.length);
    push(
      `Call factorial(${n}). Push its frame — the stack is now ${frames.length} deep.`,
      [
        { kind: 'insert', ids: [frameId(depth)] },
        { kind: 'active', ids: [frameId(depth)] },
      ],
    );

    let result: number;
    if (n <= 1) {
      result = 1;
      frames[depth]!.returnValue = String(result);
      push(
        `n = ${n} ≤ 1: base case reached. factorial(${n}) returns 1 without recursing.`,
        [{ kind: 'active', ids: [frameId(depth)] }],
      );
    } else {
      push(
        `n = ${n} > 1: recursive case. Compute factorial(${n - 1}) first, then multiply by ${n}.`,
        [{ kind: 'active', ids: [frameId(depth)] }],
      );
      const sub = factorial(n - 1);
      result = n * sub;
      frames[depth]!.returnValue = String(result);
      push(
        `factorial(${n - 1}) returned ${sub}. Compute ${n} × ${sub} = ${result}; factorial(${n}) returns ${result}.`,
        [{ kind: 'active', ids: [frameId(depth)] }],
      );
    }

    // Return: mark the frame for removal (✕) while it is still present, then pop
    // it — mirroring how the demo keeps the frame visible during its own pop.
    push(`factorial(${n}) returns ${result}. Pop its frame off the stack.`, [
      { kind: 'delete', ids: [frameId(depth)] },
    ]);
    frames.pop();
    return result;
  };

  const answer = factorial(input.n);

  push(
    `The stack is empty again — every frame has returned. factorial(${input.n}) = ${answer}.`,
    [],
  );
  return trace;
}

/**
 * Parses the custom-input box into an `n`. The generic form composes an "array"
 * and "target" field, so we accept the first whole number found anywhere (e.g.
 * `"5"`). Returns `{ error }` (never throws) and enforces `0 ≤ n ≤ 10`.
 */
function parseInput(raw: string): RecursionInput | { error: string } {
  const match = raw.match(/-?\d+/);
  if (!match) {
    return { error: 'Type a whole number for n, e.g. 5' };
  }
  const n = Number(match[0]);
  if (n < 0) {
    return {
      error: 'n must be 0 or greater — factorial is undefined below 0.',
    };
  }
  if (n > MAX_N) {
    return { error: `Keep n at ${MAX_N} or less so the stack stays readable.` };
  }
  return { n };
}

/** The registered Recursion (call stack) algorithm. */
export const recursionCallStack: Algorithm<RecursionInput, RecursionState> = {
  id: 'recursion-callstack',
  label: 'Recursion: the factorial call stack',
  run,
  defaultInput: () => ({ n: 4 }),
  parseInput,
};
