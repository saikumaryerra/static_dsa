/**
 * Predict-the-Step session rules (`src/viz/core/session.ts`; React migration
 * plan §5 P2 WS-I step 4). These were closure variables inside the legacy
 * `Visualizer.astro` script, testable only through Playwright; as a pure
 * reducer they are pinned here: skip counting, answer → one step, the
 * `min(5, authoredItems)` pass floor, `recordPass` asked for exactly once,
 * predict never persisted, and the ledger hidden while the mode is on.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  activityLine,
  askable,
  INITIAL_SESSION,
  ledgerHidden,
  passFloorFor,
  PASS_ANSWERS,
  reduceSession,
  type SessionAction,
  type SessionConfig,
  type SessionEffect,
  type SessionState,
} from '../../src/viz/core/session';

const LESSON: SessionConfig = { passFloor: 3, lessonSlug: 'binary-search' };

/** Runs actions in order, collecting every effect. */
function run(
  actions: SessionAction[],
  config: SessionConfig = LESSON,
  from: SessionState = INITIAL_SESSION,
): { state: SessionState; effects: SessionEffect[] } {
  let state = from;
  const effects: SessionEffect[] = [];
  for (const action of actions) {
    const result = reduceSession(state, action, config);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

const ON: SessionAction = { type: 'toggle', on: true };
const right: SessionAction = { type: 'answer', choice: 1, correctIndex: 1 };
const wrong: SessionAction = { type: 'answer', choice: 0, correctIndex: 1 };
const stepped: SessionAction = { type: 'stepped' };

describe('toggle', () => {
  it('turning predict on pauses the run and builds the strip', () => {
    const { state, effects } = run([ON]);
    expect(state.predictOn).toBe(true);
    expect(state.stripBuilt).toBe(true);
    expect(effects).toEqual([{ type: 'pause' }]);
  });

  it('each switch-on starts a fresh session; off keeps the strip built', () => {
    const { state } = run([
      ON,
      right,
      stepped,
      { type: 'forward', questionShown: true },
    ]);
    expect(state.answered).toBe(1);
    expect(state.skipped).toBe(1);
    const off = run([{ type: 'toggle', on: false }], LESSON, state).state;
    expect(off.predictOn).toBe(false);
    expect(off.stripBuilt).toBe(true);
    const again = run([ON], LESSON, off).state;
    expect([again.answered, again.correct, again.skipped]).toEqual([0, 0, 0]);
    expect(again.passRecorded).toBe(false);
  });

  it('toggling to the state it is already in changes nothing', () => {
    const result = reduceSession(
      INITIAL_SESSION,
      { type: 'toggle', on: false },
      LESSON,
    );
    expect(result.state).toBe(INITIAL_SESSION);
    expect(result.effects).toEqual([]);
  });
});

describe('skip counting', () => {
  it('stepping past an on-screen question counts a skip and steps', () => {
    const { state, effects } = run([
      ON,
      { type: 'forward', questionShown: true },
    ]);
    expect(state.skipped).toBe(1);
    expect(state.answered).toBe(0);
    expect(effects).toContainEqual({ type: 'stepForward' });
  });

  it('no question on screen, or predict off: a plain step, nothing counted', () => {
    expect(
      run([ON, { type: 'forward', questionShown: false }]).state.skipped,
    ).toBe(0);
    const off = run([{ type: 'forward', questionShown: true }]);
    expect(off.state.skipped).toBe(0);
    expect(off.effects).toEqual([{ type: 'stepForward' }]);
  });
});

describe('answering', () => {
  it('advances exactly one step and grades into the next explanation', () => {
    const answered = run([ON, wrong]);
    expect(
      answered.effects.filter((e) => e.type === 'stepForward'),
    ).toHaveLength(1);
    expect(answered.state.pendingVerdict).toBe('wrong');
    expect(answered.state.verdict).toBeNull();
    const shown = run([stepped], LESSON, answered.state).state;
    expect(shown.verdict).toBe('wrong');
    // One explanation carries it: the next step is plain again.
    expect(run([stepped], LESSON, shown).state.verdict).toBeNull();
  });

  it('is ignored while predict is off', () => {
    const { state, effects } = run([right]);
    expect(state).toBe(INITIAL_SESSION);
    expect(effects).toEqual([]);
  });
});

describe('the pass floor', () => {
  it('is min(5, authored items), with an unknown count meaning the full bar', () => {
    expect(passFloorFor(3)).toBe(3);
    expect(passFloorFor(9)).toBe(PASS_ANSWERS);
    expect(passFloorFor(0)).toBe(PASS_ANSWERS);
  });

  it('asks for recordPass once, at the floor, at ≥80%', () => {
    const before = run([ON, right, stepped, right, stepped]);
    expect(before.effects).not.toContainEqual({ type: 'recordPass' });
    const at = run([right, stepped, right, stepped], LESSON, before.state);
    expect(at.effects.filter((e) => e.type === 'recordPass')).toHaveLength(1);
    expect(at.state.passRecorded).toBe(true);
  });

  it('withholds the pass below 80% and on a page with no lesson to credit', () => {
    const five: SessionConfig = { passFloor: 5, lessonSlug: 'bfs' };
    const low = run([ON, right, right, right, wrong, wrong], five);
    expect(low.effects).not.toContainEqual({ type: 'recordPass' });
    const about = run([ON, right, right, right], {
      passFloor: 3,
      lessonSlug: '',
    });
    expect(about.effects).not.toContainEqual({ type: 'recordPass' });
  });

  it('a failed write lets the next answer try again', () => {
    const passed = run([ON, right, right, right]);
    const failed = run([{ type: 'passFailed' }], LESSON, passed.state);
    expect(failed.state.passRecorded).toBe(false);
    expect(run([right], LESSON, failed.state).effects).toContainEqual({
      type: 'recordPass',
    });
  });
});

describe('what the reader sees', () => {
  it('the activity line counts activity and never a score', () => {
    expect(activityLine(INITIAL_SESSION)).toBeNull();
    const line = activityLine(
      run([ON, right, wrong, { type: 'forward', questionShown: true }]).state,
    );
    expect(line).toBe('2 answered · 1 skipped');
    expect(line).not.toMatch(/%|correct|score|\/\s*\d/i);
  });

  it('the ledger is hidden exactly while predicting', () => {
    expect(ledgerHidden(INITIAL_SESSION)).toBe(false);
    const on = run([ON]).state;
    expect(ledgerHidden(on)).toBe(true);
    expect(
      ledgerHidden(run([{ type: 'toggle', on: false }], LESSON, on).state),
    ).toBe(false);
  });

  it('askable keeps only 2–4 choices with the answer among them', () => {
    const q = (choices: number, correctIndex: number) => ({
      prompt: 'Next?',
      choices: Array.from({ length: choices }, (_, i) => `c${i}`),
      correctIndex,
    });
    expect(askable(q(2, 1))).not.toBeNull();
    expect(askable(q(4, 3))).not.toBeNull();
    expect(askable(q(1, 0))).toBeNull();
    expect(askable(q(5, 0))).toBeNull();
    expect(askable(q(3, 3))).toBeNull();
    expect(askable(null)).toBeNull();
  });
});

describe('predict is never persisted', () => {
  const globals = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete globals['localStorage'];
    delete globals['sessionStorage'];
  });

  it('a whole session touches no storage', () => {
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error('session.ts touched storage');
        },
      },
    );
    globals['localStorage'] = trap;
    globals['sessionStorage'] = trap;
    expect(() =>
      run([
        ON,
        right,
        stepped,
        { type: 'forward', questionShown: true },
        wrong,
        stepped,
        right,
        { type: 'passFailed' },
        { type: 'toggle', on: false },
      ]),
    ).not.toThrow();
  });
});
