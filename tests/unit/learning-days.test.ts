/**
 * `src/lib/learning-days.ts` — the day boundary, the once-per-day rule, and the
 * copy (M8.3's anti-streak; spec §6's `ld:days:v1`).
 *
 * THE HARNESS SPLIT `docs/m8-gamification.md` SPECIFIES: Vitest runs
 * `environment: 'node'` with no DOM and no `localStorage`, so the PURE halves
 * live here — `dayStamp`, `nextLearningDays`, `parseLearningDays` and the
 * exported line — each with its inputs injected. What only a browser can answer
 * (does an act write? does a visit not? does the reset clear it? is the line on
 * screen?) is `tests/e2e/m8-learning-days.spec.ts`.
 *
 * WHAT THESE TESTS ARE REALLY ABOUT. Daily streaks were killed on the evidence,
 * and this counter is what replaced them, so the properties below are not
 * arithmetic trivia — they are the difference between the two mechanics:
 *
 * - **Monotonic.** A gap of one day, forty days or four hundred days produces
 *   the same `+ 1`. There is no input to any function here that returns a count
 *   lower than the one it was given, which is why no surface can ever render a
 *   broken chain.
 * - **At most once per calendar day**, as a property of the RULE rather than of
 *   a caller remembering to check — `nextLearningDays` returns `null` for "today
 *   is already counted", so a component that calls it on every act is correct by
 *   construction.
 * - **`{ count, last }` and nothing else.** The absent history array is the
 *   design's data-minimisation decision: a per-day ledger is what would make a
 *   chain drawable, so the shape is asserted, not assumed.
 * - **The line states a fact and asks for nothing.** The vocabulary ban is read
 *   off the exported constant here, exactly as `REVIEW_COPY`'s is, because copy
 *   is where a calm design erodes first.
 *
 * The last block covers the case Node gives for free and every private-mode
 * reader lives in: no `localStorage` at all. Spec §6 requires every access to be
 * guarded, and "nothing recorded" — never a throw — is the only honest answer
 * when the store cannot be read.
 */
import { describe, expect, it } from 'vitest';
import {
  dayStamp,
  hasLearningDays,
  learningDaysLine,
  LEARNING_DAYS_KEY,
  nextLearningDays,
  parseLearningDays,
  readLearningDays,
  recordLearningDay,
  resetLearningDays,
  type LearningDays,
} from '../../src/lib/learning-days';

/**
 * The chain and guilt vocabulary the design killed.
 *
 * "Streak" is handled by {@link withoutDenial} rather than by absence from this
 * list, for the reason `tests/e2e/m8-learning-days.spec.ts` records at length:
 * `docs/m8-gamification.md` offers copy that names the mechanic in order to deny
 * it ("there's no streak to break here"), so the word is banned in every shape
 * except an explicit denial.
 */
const BANNED =
  /\b(streaks?|chains?|in a row|consecutive|don'?t break|keep it (going|up)|back to (zero|1|one)|you lost|missed a day|leaderboard|best ever|than (most|others)|goal|target)\b/i;

/** Strips the one permitted use of "streak" — an explicit denial. */
function withoutDenial(text: string): string {
  return text.replace(/\b(no|not a|never a|isn'?t a)\s+streaks?\b/gi, '');
}

describe('the key itself (spec §6)', () => {
  it('is the exact literal spec §6 enumerates', () => {
    // Pinned as a literal rather than imported into the assertion: this is the
    // one place the chain from the spec to the writer is checked, and a test
    // that described the implementation with the implementation could not catch
    // a rename. `tests/unit/progress.test.ts` pins the same string from the
    // DELETE side, so both ends of that chain are covered.
    expect(LEARNING_DAYS_KEY).toBe('ld:days:v1');
  });
});

describe('dayStamp — the reader’s calendar day', () => {
  it('is a zero-padded YYYY-MM-DD', () => {
    // The format is load-bearing twice over: it is compared for EQUALITY (so it
    // must be canonical, never locale-dependent) and it sorts lexicographically
    // the way it sorts chronologically.
    expect(dayStamp(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
    expect(dayStamp(new Date(2026, 10, 30, 12, 0, 0))).toBe('2026-11-30');
    expect(dayStamp()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('gives one stamp for a whole local day, from first tick to last', () => {
    // Two study sessions on the same day are one learning day, whatever the
    // hour — this is what makes the once-per-day cap a calendar rule rather
    // than a 24-hour timer.
    const first = new Date(2026, 7, 4, 0, 0, 0, 0);
    const last = new Date(2026, 7, 4, 23, 59, 59, 999);
    expect(dayStamp(first)).toBe('2026-08-04');
    expect(dayStamp(last)).toBe(dayStamp(first));
  });

  it('changes at local midnight, not at some other hour', () => {
    // 23:30 and 00:30 are two days to the reader. A UTC-based stamp would agree
    // with that only in a UTC timezone, which is exactly the bug this catches
    // when the suite runs anywhere else: the dates below are built from LOCAL
    // components, so a UTC implementation returns the neighbouring day.
    expect(dayStamp(new Date(2026, 7, 4, 23, 30))).toBe('2026-08-04');
    expect(dayStamp(new Date(2026, 7, 5, 0, 30))).toBe('2026-08-05');
  });

  it('crosses a month and a year boundary correctly', () => {
    expect(dayStamp(new Date(2026, 0, 31, 23, 59))).toBe('2026-01-31');
    expect(dayStamp(new Date(2026, 1, 1, 0, 1))).toBe('2026-02-01');
    expect(dayStamp(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(dayStamp(new Date(2027, 0, 1, 0, 1))).toBe('2027-01-01');
  });

  it('sorts lexicographically in calendar order', () => {
    const days = [
      dayStamp(new Date(2026, 11, 31)),
      dayStamp(new Date(2026, 0, 5)),
      dayStamp(new Date(2027, 0, 1)),
    ];
    expect([...days].sort()).toEqual([
      '2026-01-05',
      '2026-12-31',
      '2027-01-01',
    ]);
  });
});

describe('nextLearningDays — the once-per-day rule', () => {
  const TODAY = '2026-08-04';

  it('starts a device at one', () => {
    expect(nextLearningDays(null, TODAY)).toEqual({ count: 1, last: TODAY });
  });

  it('writes exactly { count, last } and no history', () => {
    // The absent array is the design decision, not an omission: a per-day
    // ledger is the one genuinely sensitive artifact this product could hold,
    // and it is what would make a chain drawable.
    expect(Object.keys(nextLearningDays(null, TODAY)!).sort()).toEqual([
      'count',
      'last',
    ]);
    expect(
      Object.keys(
        nextLearningDays({ count: 4, last: '2026-08-01' }, TODAY)!,
      ).sort(),
    ).toEqual(['count', 'last']);
  });

  it('returns null when today is already counted — the cap itself', () => {
    expect(nextLearningDays({ count: 9, last: TODAY }, TODAY)).toBeNull();
  });

  it('counts one more for a new day', () => {
    expect(nextLearningDays({ count: 9, last: '2026-08-03' }, TODAY)).toEqual({
      count: 10,
      last: TODAY,
    });
  });

  it('adds exactly one after a gap of days, weeks or a year — never resets', () => {
    // THE ANTI-STREAK PROPERTY. A streak reads the gap and sets the count back
    // to 1; this rule cannot see the gap at all, because `last` is compared for
    // equality and never subtracted.
    for (const last of [
      '2026-08-03',
      '2026-07-25',
      '2025-08-04',
      '2019-01-01',
    ]) {
      expect(nextLearningDays({ count: 41, last }, TODAY)).toEqual({
        count: 42,
        last: TODAY,
      });
    }
  });

  it('never returns a count lower than the one it was given', () => {
    // Stated as a property over the awkward inputs — a stamp from the future
    // (a device whose clock moved), an unparseable stamp, an empty one — since
    // "monotonic" has to hold for records this version did not write.
    for (const stored of [
      { count: 7, last: '2099-12-31' },
      { count: 7, last: 'yesterday-ish' },
      { count: 7, last: '' },
      { count: 1, last: '2026-08-03' },
    ] satisfies LearningDays[]) {
      const next = nextLearningDays(stored, TODAY);
      expect(next === null || next.count >= stored.count).toBe(true);
    }
  });

  it('counts a day once however many acts happen in it', () => {
    // The caller calls this on every act; the rule is what makes that safe.
    let record = nextLearningDays(null, '2026-08-04')!;
    for (let i = 0; i < 5; i += 1) {
      expect(nextLearningDays(record, '2026-08-04')).toBeNull();
    }
    record = nextLearningDays(record, '2026-08-05')!;
    expect(record).toEqual({ count: 2, last: '2026-08-05' });
  });

  it('does not mutate the record it was given', () => {
    const stored: LearningDays = { count: 3, last: '2026-08-01' };
    nextLearningDays(stored, TODAY);
    expect(stored).toEqual({ count: 3, last: '2026-08-01' });
  });
});

describe('parseLearningDays — a value this build did not write', () => {
  it('reads a well-formed record', () => {
    expect(parseLearningDays('{"count":3,"last":"2026-08-01"}')).toEqual({
      count: 3,
      last: '2026-08-01',
    });
  });

  it('keeps exactly the two fields, dropping anything else stored beside them', () => {
    // A history array added by a future version — or by a hand edit — must not
    // survive a read into a shape this product can render.
    const parsed = parseLearningDays(
      '{"count":3,"last":"2026-08-01","history":["2026-08-01"],"best":9}',
    );
    expect(Object.keys(parsed!).sort()).toEqual(['count', 'last']);
  });

  it('reads nothing rather than throwing on a corrupt value', () => {
    for (const raw of [
      null,
      '',
      'not json at all',
      '{"count":',
      '[]',
      '[{"count":3}]',
      '"3"',
      'null',
    ]) {
      expect(parseLearningDays(raw)).toBeNull();
    }
  });

  it('rejects a count no surface could honestly render', () => {
    for (const raw of [
      '{"count":"3","last":"2026-08-01"}',
      '{"count":0,"last":"2026-08-01"}',
      '{"count":-4,"last":"2026-08-01"}',
      '{"count":2.5,"last":"2026-08-01"}',
      '{"count":1e30,"last":"2026-08-01"}',
      '{"last":"2026-08-01"}',
    ]) {
      expect(parseLearningDays(raw), raw).toBeNull();
    }
  });

  it('tolerates a missing or wrong-typed stamp, costing at most one extra day', () => {
    // `last` is only ever compared with today for equality, so an unusable one
    // reads as "not today": the reader gains a count they might already have
    // had, and can never lose one.
    expect(parseLearningDays('{"count":3}')).toEqual({ count: 3, last: '' });
    expect(parseLearningDays('{"count":3,"last":42}')).toEqual({
      count: 3,
      last: '',
    });
    expect(nextLearningDays({ count: 3, last: '' }, '2026-08-04')).toEqual({
      count: 4,
      last: '2026-08-04',
    });
  });
});

describe('learningDaysLine — the one sentence this feature says', () => {
  it('says nothing at all before the first act', () => {
    // No empty state: "0 days" would be a scoreboard at zero, which is the
    // guilt the design forbids.
    for (const count of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(learningDaysLine(count)).toBe('');
    }
  });

  it('agrees with itself about singular and plural', () => {
    expect(learningDaysLine(1)).toContain('1 day');
    expect(learningDaysLine(1)).not.toContain('1 days');
    expect(learningDaysLine(2)).toContain('2 days');
    expect(learningDaysLine(365)).toContain('365 days');
  });

  it('states where the record lives, like every persistent surface here', () => {
    expect(learningDaysLine(4)).toMatch(/this (device|browser)/i);
  });

  it('sets no target, draws no chain and compares with nobody', () => {
    for (const count of [1, 2, 30, 365]) {
      const line = withoutDenial(learningDaysLine(count));
      expect(line, `banned vocabulary in "${line}"`).not.toMatch(BANNED);
      // A fraction is a target with extra steps.
      expect(line).not.toMatch(/\b\d+\s*(of|\/)\s*\d+\b/);
      expect(line).not.toMatch(/%/);
      // No countdown, and no gap arithmetic — a lesson that waited a year is
      // described in exactly the words one that waited a week is.
      expect(line).not.toMatch(
        /\b(days? left|ready in|come back in|expires?|resets?|since|ago)\b/i,
      );
    }
  });

  it('names the reader’s own act, not their attendance', () => {
    // "learned on N days" is a fact about what they did; "visited"/"logged in"
    // would be attendance, which is the goal this design refuses to set.
    expect(learningDaysLine(3)).toMatch(/learn(ed|ing)/i);
    expect(learningDaysLine(3)).not.toMatch(
      /\b(visit(ed|s)?|logged in|opened|showed up|active)\b/i,
    );
  });
});

describe('no localStorage at all (Node, and every private mode)', () => {
  // Nothing is installed on `globalThis` here, which is exactly the state the
  // build's Node pass runs in — and the state a blocked store is
  // indistinguishable from, from this module's point of view.
  it('reads as "nothing recorded" instead of throwing', () => {
    expect(readLearningDays()).toBeNull();
    expect(hasLearningDays()).toBe(false);
  });

  it('records nothing, and says so, rather than promising a save', () => {
    expect(recordLearningDay()).toBeNull();
    expect(recordLearningDay(new Date(2026, 7, 4))).toBeNull();
  });

  it('reports that the reset removed nothing, because it did', () => {
    expect(resetLearningDays()).toBe(0);
  });
});
