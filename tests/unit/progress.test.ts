/**
 * `src/lib/progress.ts` — the pure halves, the degraded halves, and the rules
 * that govern the stored keys.
 *
 * Vitest runs `environment: 'node'` with no DOM and no `localStorage`
 * (`vitest.config.ts`), which gives the first two blocks below for free: the
 * pure helpers (`parseLessonRefs`, `resumeLabel`, ordering), and the proof that
 * every storage-touching function degrades to "nothing is complete" instead of
 * throwing when `localStorage` is absent — exactly what a private mode or a
 * blocked store looks like from the module's point of view.
 *
 * The third block installs a MINIMAL in-memory `Storage` on `globalThis` and
 * exercises the same shipped code path with a store present. That is not a
 * DOM harness and not a new dependency (CLAUDE.md's rule stands): `progress.ts`
 * reads the global `localStorage` and nothing else, so a ~15-line object is the
 * whole environment it needs. It buys the two invariants M8 inherits and that no
 * amount of pure testing can reach — resuming ACROSS the track boundary, and
 * `resetProgress` deleting progress keys while never touching a preference key.
 * How those states appear on screen stays with Playwright.
 *
 * The M8.1 MASTERY blocks live at the bottom of this file rather than in one of
 * their own, for one reason: they test the same module through the same store
 * harness, and a second copy of `memoryStorage` would be a second definition of
 * "what storage does" free to drift from this one. They are the invariants the
 * whole gamification layer rests on — the Practiced predicate and its
 * total-vs-checks trap, the 3-day gate, "the later grade wins but no STAGE ever
 * decays", Learned = the completion mark, the unknown fields M8.2/M8.3 will add
 * surviving a write from this version, and the reset that must take mastery
 * records but never a preference.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  allChecksPassed,
  countComplete,
  countMastery,
  countPassed,
  hasStoredProgress,
  isComplete,
  isPracticed,
  MASTERY_GATE_DAYS,
  masteryGateOpen,
  masteryKey,
  masteryStage,
  masteryStageOf,
  nextIncomplete,
  parseLessonRefs,
  readCompleted,
  readMastery,
  recordPass,
  resetProgress,
  resumeLabel,
  writeCheck,
  type LessonRef,
  type MasteryRecord,
} from '../../src/lib/progress';

/** Three lessons across both tracks, deliberately NOT in `order` sequence. */
const LESSONS: LessonRef[] = [
  { slug: 'stacks', title: 'Stacks', order: 4, track: 'foundations' },
  {
    slug: 'binary-search',
    title: 'Binary Search',
    order: 11,
    track: 'algorithms',
  },
  {
    slug: 'complexity-big-o',
    title: 'Complexity & Big-O',
    order: 1,
    track: 'foundations',
  },
];

describe('storage-free degradation (no localStorage, as in Node)', () => {
  it('reads no completions instead of throwing', () => {
    expect(readCompleted(LESSONS)).toEqual([]);
    expect(isComplete('stacks')).toBe(false);
  });

  it('counts a subset with a real total and zero done', () => {
    const foundations = LESSONS.filter((l) => l.track === 'foundations');
    expect(countComplete(foundations)).toEqual({ done: 0, total: 2 });
    expect(countComplete(LESSONS)).toEqual({ done: 0, total: 3 });
    expect(countComplete([])).toEqual({ done: 0, total: 0 });
  });

  it('resolves the resume target to the first lesson — the same answer the server-rendered fallback shows', () => {
    expect(nextIncomplete(LESSONS)?.slug).toBe('complexity-big-o');
  });

  it('reports that it removed nothing', () => {
    expect(resetProgress(LESSONS)).toBe(0);
  });
});

describe('nextIncomplete', () => {
  it('follows GLOBAL order, not the order the list happens to arrive in', () => {
    // `LESSONS` starts with order 4; the resume target must still be order 1.
    expect(nextIncomplete(LESSONS)?.order).toBe(1);
  });

  it('does not mutate the caller list (it is also the render order)', () => {
    const before = LESSONS.map((l) => l.slug);
    nextIncomplete(LESSONS);
    expect(LESSONS.map((l) => l.slug)).toEqual(before);
  });

  it('returns null for an empty list', () => {
    expect(nextIncomplete([])).toBeNull();
  });
});

describe('parseLessonRefs', () => {
  it('parses a well-formed injected list', () => {
    expect(parseLessonRefs(JSON.stringify(LESSONS))).toEqual(LESSONS);
  });

  it('returns [] for a missing attribute', () => {
    expect(parseLessonRefs(undefined)).toEqual([]);
    expect(parseLessonRefs(null)).toEqual([]);
    expect(parseLessonRefs('')).toEqual([]);
  });

  it('returns [] for malformed JSON rather than throwing inside an island', () => {
    expect(parseLessonRefs('[{"slug":')).toEqual([]);
    expect(parseLessonRefs('not json at all')).toEqual([]);
  });

  it('returns [] when the payload is not an array', () => {
    expect(parseLessonRefs('{"slug":"stacks"}')).toEqual([]);
    expect(parseLessonRefs('42')).toEqual([]);
    expect(parseLessonRefs('null')).toEqual([]);
  });

  it('drops entries with a missing or wrong-typed field', () => {
    const raw = JSON.stringify([
      LESSONS[0],
      { slug: 'queues', title: 'Queues', order: '5', track: 'foundations' },
      { slug: 'heaps', title: 'Heaps', track: 'foundations' },
      null,
      'arrays',
    ]);
    expect(parseLessonRefs(raw)).toEqual([LESSONS[0]]);
  });
});

describe('resumeLabel', () => {
  const first = LESSONS[2]!;

  it('says "start" when nothing is complete — a reader with no history is not continuing', () => {
    expect(resumeLabel(first, 0, 15)).toBe(
      'Start with 01 · Complexity & Big-O',
    );
  });

  it('says "continue" once anything is complete', () => {
    expect(resumeLabel(LESSONS[0]!, 3, 15)).toBe('Continue: 04 · Stacks');
  });

  it('zero-pads the lesson number the way the cards do', () => {
    expect(resumeLabel(LESSONS[1]!, 5, 15)).toBe(
      'Continue: 11 · Binary Search',
    );
  });

  it('reports completion as a sentence when there is no next lesson', () => {
    expect(resumeLabel(null, 15, 15)).toBe('All 15 done — revisit any lesson.');
  });
});

// ---------------------------------------------------------------------------
// With a store installed. Shape mirrors the real curriculum: a run of
// `foundations` lessons, then `algorithms` — so "the next lesson" has a track
// boundary to cross, which is the case M7.1's global prev/next and this module's
// resume CTA both exist to get right.
// ---------------------------------------------------------------------------
const CURRICULUM: LessonRef[] = [
  {
    slug: 'complexity-big-o',
    title: 'Complexity & Big-O',
    order: 1,
    track: 'foundations',
  },
  { slug: 'arrays', title: 'Arrays', order: 2, track: 'foundations' },
  { slug: 'stacks', title: 'Stacks', order: 3, track: 'foundations' },
  {
    slug: 'binary-search',
    title: 'Binary Search',
    order: 4,
    track: 'algorithms',
  },
  { slug: 'sorting-basics', title: 'Sorting', order: 5, track: 'algorithms' },
];

const FOUNDATIONS = CURRICULUM.filter((l) => l.track === 'foundations');
const ALGORITHMS = CURRICULUM.filter((l) => l.track === 'algorithms');

/** The completion key `MarkComplete` writes — spelled out, never imported. */
function key(slug: string): string {
  return `lesson:${slug}:complete`;
}

/**
 * A minimal in-memory `Storage`.
 *
 * @param seed - Key/value pairs the store starts with.
 * @param failOn - Method names that throw instead of answering, simulating
 * Safari's blocked-methods mode (the store exists; every call raises).
 * @returns A `Storage` suitable for `globalThis.localStorage`.
 */
function memoryStorage(
  seed: Record<string, string> = {},
  failOn: ReadonlyArray<'getItem' | 'removeItem' | 'setItem'> = [],
): Storage {
  const map = new Map(Object.entries(seed));
  const guard = (name: 'getItem' | 'removeItem' | 'setItem') => {
    if (failOn.includes(name)) throw new Error(`${name} is blocked`);
  };
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => {
      guard('getItem');
      return map.get(k) ?? null;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (k: string) => {
      guard('removeItem');
      map.delete(k);
    },
    setItem: (k: string, value: string) => {
      guard('setItem');
      map.set(k, value);
    },
  } as Storage;
}

/** Installs a store for one test; `afterEach` puts the Node default (none) back. */
function install(store: Storage): Storage {
  globalThis.localStorage = store;
  return store;
}

afterEach(() => {
  // Delete rather than assign `undefined`: `getStore()` probes with `typeof`,
  // and only a genuinely absent global reproduces the Node/SSR case the first
  // block above tests.
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('readCompleted (with storage)', () => {
  it('returns the marked slugs in the order the caller passed them', () => {
    install(
      memoryStorage({
        [key('stacks')]: '1',
        [key('complexity-big-o')]: '1',
      }),
    );
    // Passed in curriculum order, so the answer must be curriculum order too —
    // not storage order, which no browser guarantees.
    expect(readCompleted(CURRICULUM)).toEqual(['complexity-big-o', 'stacks']);
  });

  it('counts only the exact value MarkComplete writes', () => {
    install(
      memoryStorage({
        [key('arrays')]: '1',
        [key('stacks')]: '0',
        [key('binary-search')]: 'true',
      }),
    );
    expect(readCompleted(CURRICULUM)).toEqual(['arrays']);
    expect(isComplete('stacks')).toBe(false);
    expect(isComplete('binary-search')).toBe(false);
  });

  it('ignores a stale key for a lesson that no longer exists', () => {
    // The reason every function takes the build-injected list instead of
    // scanning by prefix: a renamed lesson leaves `lesson:{old}:complete`
    // behind, and a prefix scan would count it forever.
    install(
      memoryStorage({
        [key('arrays')]: '1',
        [key('linked-lists-old-name')]: '1',
      }),
    );
    expect(readCompleted(CURRICULUM)).toEqual(['arrays']);
    expect(countComplete(CURRICULUM)).toEqual({ done: 1, total: 5 });
  });
});

describe('nextIncomplete (with storage)', () => {
  it('crosses the track boundary instead of dead-ending at the last foundation', () => {
    install(
      memoryStorage(
        Object.fromEntries(FOUNDATIONS.map((l) => [key(l.slug), '1'])),
      ),
    );
    const next = nextIncomplete(CURRICULUM);
    expect(next?.slug).toBe('binary-search');
    expect(next?.track).toBe('algorithms');
  });

  it('skips completed lessons in the middle of the sequence', () => {
    install(
      memoryStorage({
        [key('complexity-big-o')]: '1',
        [key('arrays')]: '1',
        // stacks is NOT done, but a later lesson is — order decides, not recency.
        [key('binary-search')]: '1',
      }),
    );
    expect(nextIncomplete(CURRICULUM)?.slug).toBe('stacks');
  });

  it('returns null once everything is complete, so the CTA can stand down', () => {
    install(
      memoryStorage(
        Object.fromEntries(CURRICULUM.map((l) => [key(l.slug), '1'])),
      ),
    );
    expect(nextIncomplete(CURRICULUM)).toBeNull();
    expect(resumeLabel(nextIncomplete(CURRICULUM), 5, 5)).toBe(
      'All 5 done — revisit any lesson.',
    );
  });
});

describe('countComplete (with storage)', () => {
  it('counts each track against its own total', () => {
    install(
      memoryStorage({
        [key('arrays')]: '1',
        [key('stacks')]: '1',
        [key('binary-search')]: '1',
      }),
    );
    expect(countComplete(FOUNDATIONS)).toEqual({ done: 2, total: 3 });
    expect(countComplete(ALGORITHMS)).toEqual({ done: 1, total: 2 });
    expect(countComplete(CURRICULUM)).toEqual({ done: 3, total: 5 });
  });
});

describe('resetProgress (with storage)', () => {
  /** The three §6 PREFERENCE keys — deliberately outside the delete list. */
  const PREFERENCES = {
    theme: 'dark',
    'pref:viz-speed': '2',
    'pref:code-lang': 'javascript',
  };

  it('removes every completion mark and reports how many went', () => {
    const store = install(
      memoryStorage({
        [key('complexity-big-o')]: '1',
        [key('stacks')]: '1',
        [key('sorting-basics')]: '1',
      }),
    );
    expect(resetProgress(CURRICULUM)).toBe(3);
    expect(readCompleted(CURRICULUM)).toEqual([]);
    expect(store.length).toBe(0);
  });

  it('never touches a preference key', () => {
    // The whole reason the reset control routes through this module: clearing
    // progress must not throw away the reader's theme, playback speed or code
    // language. M8 adds ITS progress keys to the same list — and must not
    // widen it to a prefix sweep, which is what this test stands against.
    const store = install(
      memoryStorage({ ...PREFERENCES, [key('arrays')]: '1' }),
    );
    expect(resetProgress(CURRICULUM)).toBe(1);
    expect(store.getItem('theme')).toBe('dark');
    expect(store.getItem('pref:viz-speed')).toBe('2');
    expect(store.getItem('pref:code-lang')).toBe('javascript');
    expect(store.getItem(key('arrays'))).toBeNull();
  });

  it('reports 0 — and deletes nothing — when nothing was stored', () => {
    const store = install(memoryStorage(PREFERENCES));
    expect(resetProgress(CURRICULUM)).toBe(0);
    expect(store.length).toBe(Object.keys(PREFERENCES).length);
  });

  it('leaves keys for lessons outside the injected list alone', () => {
    const store = install(
      memoryStorage({
        [key('arrays')]: '1',
        [key('linked-lists-old-name')]: '1',
      }),
    );
    // Only the lessons the build knows about are addressed — the same contract
    // that keeps the counters honest, seen from the delete side.
    expect(resetProgress(CURRICULUM)).toBe(1);
    expect(store.getItem(key('linked-lists-old-name'))).toBe('1');
  });
});

describe('a store that throws on every call (blocked-methods mode)', () => {
  beforeEach(() => {
    install(
      memoryStorage({ [key('arrays')]: '1' }, [
        'getItem',
        'removeItem',
        'setItem',
      ]),
    );
  });

  it('reads as "nothing complete" rather than throwing into the island', () => {
    expect(readCompleted(CURRICULUM)).toEqual([]);
    expect(isComplete('arrays')).toBe(false);
    expect(countComplete(FOUNDATIONS)).toEqual({ done: 0, total: 3 });
  });

  it('still resolves a resume target — the server-rendered fallback', () => {
    expect(nextIncomplete(CURRICULUM)?.slug).toBe('complexity-big-o');
  });

  it('reports that the reset removed nothing, because it did', () => {
    // The count is what the reader is told ("N marks removed"), so it must
    // never be optimistic about deletes that raised.
    expect(resetProgress(CURRICULUM)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// M8.1 — mastery. Learned → Practiced → Mastered is the product's ONLY progress
// currency, so these are the invariants every later mechanic inherits.
// ---------------------------------------------------------------------------

/**
 * The mastery key, spelled out rather than built with the module's own
 * `masteryKey` — the same rule as `key()` above: setup that describes the
 * implementation with the implementation cannot catch a rename. `masteryKey` is
 * imported once below, only to pin the format the spec enumerates.
 */
function mkey(slug: string): string {
  return `progress:v1:${slug}`;
}

/** A record with nothing recorded — what every degraded path must return. */
const BLANK: MasteryRecord = {
  practicedAt: null,
  masteredAt: null,
  checks: [],
};

const DAY_MS = 86_400_000;
/** First pass. A fixed instant, so the gate boundaries below are exact. */
const T0 = new Date('2026-08-01T10:00:00.000Z');
/** `T0` plus `days` (and optionally a millisecond nudge across a boundary). */
function later(days: number, ms = 0): Date {
  return new Date(T0.getTime() + days * DAY_MS + ms);
}

/** Grades every question of a lesson "I had it" at `at` — one full pass. */
function passAll(slug: string, total: number, at: Date): void {
  for (let i = 0; i < total; i += 1) writeCheck(slug, i, total, 1, at);
}

/**
 * The stored JSON for a record — a seed value for states a test wants to start
 * from rather than earn (an already-Mastered lesson, a legacy short `checks`).
 */
function seedRecord(record: Partial<MasteryRecord>): string {
  return JSON.stringify({ ...BLANK, ...record });
}

describe('allChecksPassed (the Practiced predicate, pure)', () => {
  it('needs every question, not every stored entry — the total-vs-checks trap', () => {
    // `[1].every(c => c === 1)` is true, which would let one graded question
    // satisfy a three-question lesson. `total` comes from the build for exactly
    // this reason.
    expect(allChecksPassed([1], 3)).toBe(false);
    expect(allChecksPassed([1, 1], 3)).toBe(false);
    expect(allChecksPassed([1, 1, 1], 3)).toBe(true);
  });

  it('fails on an ungraded or "Not yet" question', () => {
    expect(allChecksPassed([1, null, 1], 3)).toBe(false);
    expect(allChecksPassed([1, 0, 1], 3)).toBe(false);
  });

  it('ignores stale entries past the last question', () => {
    // An author removed question 4; its old grade must not be part of the bar.
    expect(allChecksPassed([1, 1, 1, 0], 3)).toBe(true);
  });

  it('is false for a total that describes no questions', () => {
    expect(allChecksPassed([1, 1], 0)).toBe(false);
    expect(allChecksPassed([1, 1], -1)).toBe(false);
    expect(allChecksPassed([1, 1], 2.5)).toBe(false);
    expect(allChecksPassed([], 1)).toBe(false);
  });
});

describe('countPassed (the announced tally, pure)', () => {
  it('counts only inside the lesson question window', () => {
    expect(countPassed([1, 0, null], 3)).toBe(1);
    expect(countPassed([1, 1, 1], 3)).toBe(3);
    // A stale grade for a removed question must not read as "4 of 3".
    expect(countPassed([1, 1, 1, 1], 3)).toBe(3);
    expect(countPassed([1, 1], 3)).toBe(2);
  });

  it('is 0 for a total that describes no questions', () => {
    expect(countPassed([1, 1], 0)).toBe(0);
    expect(countPassed([1, 1], -2)).toBe(0);
  });

  it('agrees with the Practiced bar exactly at total', () => {
    // One rule, two readings: the tally the reader sees and the bar that
    // stamps `practicedAt` can never disagree about what "all of them" means.
    for (const checks of [
      [1, 1, 1],
      [1, 1, null],
      [0, 1, 1],
    ] as const) {
      expect(allChecksPassed(checks, 3)).toBe(countPassed(checks, 3) === 3);
    }
  });
});

describe('masteryGateOpen (the 3-day gate, pure)', () => {
  it('is the gate the design specifies', () => {
    expect(MASTERY_GATE_DAYS).toBe(3);
  });

  it('is closed with no first pass', () => {
    expect(masteryGateOpen(null, T0)).toBe(false);
  });

  it('is closed in the same sitting — Mastered is ungrindable by construction', () => {
    expect(masteryGateOpen(T0.toISOString(), T0)).toBe(false);
    expect(masteryGateOpen(T0.toISOString(), later(0, 60_000))).toBe(false);
  });

  it('is closed one millisecond under the gate and open exactly on it', () => {
    expect(masteryGateOpen(T0.toISOString(), later(3, -1))).toBe(false);
    expect(masteryGateOpen(T0.toISOString(), later(3))).toBe(true);
    expect(masteryGateOpen(T0.toISOString(), later(3, 1))).toBe(true);
  });

  it('accepts a millisecond timestamp as well as a Date', () => {
    expect(masteryGateOpen(T0.toISOString(), later(4).getTime())).toBe(true);
  });

  it('is closed for a clock that jumped backwards', () => {
    expect(masteryGateOpen(T0.toISOString(), later(-10))).toBe(false);
  });

  it('is closed for an unparseable timestamp rather than promoting on garbage', () => {
    expect(masteryGateOpen('whenever', later(30))).toBe(false);
  });
});

describe('masteryStageOf (which act earns which stage, pure)', () => {
  it('is none with no mark and nothing recorded', () => {
    expect(masteryStageOf(BLANK, false)).toBe('none');
  });

  it('is learned from the M7 completion mark alone — no migration needed', () => {
    expect(masteryStageOf(BLANK, true)).toBe('learned');
  });

  it('is NOT learned from a self-grade: Learned is the completion click', () => {
    // The loop table's rule (`docs/m8-gamification.md`): Learned is earned by
    // "Mark as complete", unchanged. A reader who graded question 1 of 3 has
    // not said they finished the lesson, and — because a later grade wins
    // (`writeCheck`) — a stage earned this way could be taken away again by an
    // honest correction, which no stage here may ever be.
    expect(masteryStageOf({ ...BLANK, checks: [1, null] }, false)).toBe('none');
    expect(masteryStageOf({ ...BLANK, checks: [1, 1] }, false)).toBe('none');
  });

  it('is none when the only self-reports are "Not yet"', () => {
    // "Not yet" is an explicit report that they did NOT have it. It costs
    // nothing either — there is no state below none.
    expect(masteryStageOf({ ...BLANK, checks: [0, 0] }, false)).toBe('none');
  });

  it('reaches practiced without a completion mark, which is the real union', () => {
    // Retrieval has a stage of its own, and it does not need the click: a full
    // pass stamps `practicedAt`, and that alone resolves Practiced.
    expect(
      masteryStageOf({ ...BLANK, practicedAt: T0.toISOString() }, false),
    ).toBe('practiced');
  });

  it('is mastered once masteredAt exists', () => {
    expect(
      masteryStageOf(
        {
          practicedAt: T0.toISOString(),
          masteredAt: later(5).toISOString(),
          checks: [1],
        },
        true,
      ),
    ).toBe('mastered');
  });
});

describe('mastery with no localStorage (as in Node)', () => {
  it('reads an empty record instead of throwing', () => {
    expect(readMastery('stacks')).toEqual(BLANK);
    expect(isPracticed('stacks')).toBe(false);
    expect(masteryStage('stacks')).toBe('none');
  });

  it('records nothing, and says so, instead of throwing', () => {
    expect(writeCheck('stacks', 0, 3, 1, T0)).toEqual(BLANK);
    expect(recordPass('stacks', T0)).toEqual(BLANK);
  });

  it('counts nothing against a real total', () => {
    expect(countMastery(CURRICULUM)).toEqual({
      learned: 0,
      practiced: 0,
      mastered: 0,
      total: 5,
    });
    expect(hasStoredProgress(CURRICULUM)).toBe(false);
  });
});

describe('masteryKey', () => {
  it('is the exact key enumerated in spec §6', () => {
    // Pinned: the key is a spec'd surface, and renaming it silently would
    // orphan every reader's progress.
    expect(masteryKey('binary-search')).toBe('progress:v1:binary-search');
  });
});

describe('writeCheck (with storage)', () => {
  it('records one grade and pads the array to the lesson question count', () => {
    install(memoryStorage());
    const record = writeCheck('stacks', 1, 3, 1, T0);
    expect(record.checks).toEqual([null, 1, null]);
    expect(record.practicedAt).toBeNull();
    expect(readMastery('stacks')).toEqual(record);
  });

  it('stamps practicedAt only when the LAST question is graded "I had it"', () => {
    install(memoryStorage());
    writeCheck('stacks', 0, 3, 1, T0);
    writeCheck('stacks', 1, 3, 1, T0);
    expect(isPracticed('stacks')).toBe(false);
    // Two of three graded earns NOTHING: Learned is the completion click, and
    // Practiced needs the whole set. A partial pass is not a stage.
    expect(masteryStage('stacks')).toBe('none');

    const record = writeCheck('stacks', 2, 3, 1, T0);
    expect(record.practicedAt).toBe(T0.toISOString());
    expect(isPracticed('stacks')).toBe(true);
    expect(masteryStage('stacks')).toBe('practiced');
  });

  it('does not let a short stored array satisfy a longer lesson', () => {
    // The same trap as the pure test, seen through the shipped write path: a
    // record written when the lesson had one question must not pass a
    // three-question lesson on the next grade.
    install(memoryStorage({ [mkey('stacks')]: seedRecord({ checks: [1] }) }));
    const record = writeCheck('stacks', 1, 3, 1, T0);
    expect(record.checks).toEqual([1, 1, null]);
    expect(record.practicedAt).toBeNull();
  });

  it('lets a later "Not yet" overwrite a stored "I had it" — the reader is the authority', () => {
    // The premise of a self-report system: the most recent report is the true
    // one. Keeping the flattering answer would tally a question the reader has
    // just explicitly said they did not have.
    install(memoryStorage());
    writeCheck('stacks', 0, 2, 1, T0);
    const record = writeCheck('stacks', 0, 2, 0, later(1));
    expect(record.checks).toEqual([0, null]);
    expect(countPassed(record.checks, 2)).toBe(0);
    expect(readMastery('stacks')).toEqual(record);
  });

  it('keeps practicedAt when a later visit grades a question "Not yet"', () => {
    // The correction takes the lesson back below the Practiced BAR for this
    // session — the tally falls and the bar must be met again — but the stage
    // itself never goes down.
    install(memoryStorage());
    passAll('stacks', 2, T0);
    const record = writeCheck('stacks', 1, 2, 0, later(9));
    expect(record.checks).toEqual([1, 0]);
    expect(allChecksPassed(record.checks, 2)).toBe(false);
    expect(record.practicedAt).toBe(T0.toISOString());
    expect(masteryStage('stacks')).toBe('practiced');
  });

  it('keeps masteredAt when a later visit grades a question "Not yet"', () => {
    // The strongest form of the same rule: nothing a reader can do to their own
    // self-grades takes an EARNED stage away. Only the reset control clears.
    install(
      memoryStorage({
        [mkey('stacks')]: seedRecord({
          practicedAt: T0.toISOString(),
          masteredAt: later(4).toISOString(),
          checks: [1, 1],
        }),
      }),
    );
    const record = writeCheck('stacks', 0, 2, 0, later(20));
    expect(record.checks).toEqual([0, 1]);
    expect(record.practicedAt).toBe(T0.toISOString());
    expect(record.masteredAt).toBe(later(4).toISOString());
    expect(masteryStage('stacks')).toBe('mastered');
  });

  it('does not re-stamp practicedAt when a corrected grade meets the bar again', () => {
    // `practicedAt` is the FIRST pass, and M8.2's review schedule is measured
    // from it; re-stamping would silently push every future review out.
    install(memoryStorage());
    passAll('stacks', 2, T0);
    writeCheck('stacks', 1, 2, 0, later(1));
    const record = writeCheck('stacks', 1, 2, 1, later(2));
    expect(record.checks).toEqual([1, 1]);
    expect(record.practicedAt).toBe(T0.toISOString());
  });

  it('never stamps masteredAt, however long the learner takes over one pass', () => {
    // Persisted checks stay 1 after the first pass, so storage alone cannot see
    // a re-pass; only `recordPass` (fed by the caller's in-memory count) can.
    install(memoryStorage());
    writeCheck('stacks', 0, 2, 1, T0);
    const record = writeCheck('stacks', 1, 2, 1, later(30));
    expect(record.masteredAt).toBeNull();
    expect(masteryStage('stacks')).toBe('practiced');
  });

  it('writes nothing for an out-of-range index or an impossible total', () => {
    const store = install(memoryStorage());
    const first = writeCheck('stacks', 0, 3, 1, T0);
    for (const call of [
      () => writeCheck('stacks', 3, 3, 1, T0),
      () => writeCheck('stacks', -1, 3, 1, T0),
      () => writeCheck('stacks', 1.5, 3, 1, T0),
      () => writeCheck('stacks', 0, 0, 1, T0),
      () => writeCheck('stacks', 0, 1_000_000, 1, T0),
      () => writeCheck('stacks', 0, 2.5, 1, T0),
    ]) {
      expect(call()).toEqual(first);
    }
    expect(readMastery('stacks')).toEqual(first);
    expect(store.length).toBe(1);
  });

  it('returns the PREVIOUS record when the write throws, so nothing claims a save', () => {
    // Storage full or blocked-on-write: reads still work, so the honest answer
    // is what is actually stored — not what would have been.
    install(
      memoryStorage({ [mkey('stacks')]: seedRecord({ checks: [1, null] }) }, [
        'setItem',
      ]),
    );
    const record = writeCheck('stacks', 1, 2, 1, T0);
    expect(record).toEqual({ ...BLANK, checks: [1, null] });
    expect(record.practicedAt).toBeNull();
  });
});

describe('recordPass (the Mastered gate, with storage)', () => {
  it('does not promote a re-pass in the same sitting', () => {
    install(memoryStorage());
    passAll('stacks', 2, T0);
    const record = recordPass('stacks', T0);
    expect(record.masteredAt).toBeNull();
    expect(masteryStage('stacks')).toBe('practiced');
  });

  it('does not promote one millisecond under the gate, and does on it', () => {
    install(memoryStorage());
    passAll('stacks', 2, T0);
    expect(recordPass('stacks', later(3, -1)).masteredAt).toBeNull();

    const record = recordPass('stacks', later(3));
    expect(record.masteredAt).toBe(later(3).toISOString());
    expect(masteryStage('stacks')).toBe('mastered');
  });

  it('stamps practicedAt for an earning path that has no practice checks', () => {
    // M8.2's ≥80% predict session and M8.3's cleared Final Run converge here.
    install(memoryStorage());
    const record = recordPass('binary-search', T0);
    expect(record).toEqual({
      practicedAt: T0.toISOString(),
      masteredAt: null,
      checks: [],
    });
    expect(masteryStage('binary-search')).toBe('practiced');
  });

  it('never re-stamps an already-Mastered lesson', () => {
    install(
      memoryStorage({
        [mkey('stacks')]: seedRecord({
          practicedAt: T0.toISOString(),
          masteredAt: later(4).toISOString(),
          checks: [1],
        }),
      }),
    );
    expect(recordPass('stacks', later(90)).masteredAt).toBe(
      later(4).toISOString(),
    );
  });

  it('costs nothing when the gate is still closed', () => {
    const store = install(memoryStorage());
    passAll('stacks', 1, T0);
    const before = store.getItem(mkey('stacks'));
    expect(recordPass('stacks', later(1))).toEqual(readMastery('stacks'));
    expect(store.getItem(mkey('stacks'))).toBe(before);
  });
});

describe('no STAGE decays and no stage demotes', () => {
  // The self-grades underneath are a different thing: the reader may correct one
  // at any time (see the `writeCheck` block above). What is fixed is the ladder.
  it('keeps a stage forever without activity — absence is never punished', () => {
    install(
      memoryStorage({
        [mkey('stacks')]: seedRecord({
          practicedAt: T0.toISOString(),
          masteredAt: later(3).toISOString(),
          checks: [1, 1],
        }),
      }),
    );
    // The read path takes no clock at all, which is exactly how "no decay" is
    // enforced: there is no elapsed time a stage could be lowered by, so this
    // record reads as Mastered a year from now for the same reason it does now.
    expect(masteryStage('stacks')).toBe('mastered');
    expect(countMastery([CURRICULUM[2]!]).mastered).toBe(1);
  });

  it('keeps a practice record when the completion mark is un-toggled', () => {
    // MarkComplete removes its key on un-toggle; that is a self-report, not an
    // erasure of what the learner actually retrieved.
    const store = install(
      memoryStorage({
        [key('stacks')]: '1',
        [mkey('stacks')]: seedRecord({
          practicedAt: T0.toISOString(),
          checks: [1],
        }),
      }),
    );
    store.removeItem(key('stacks'));
    expect(masteryStage('stacks')).toBe('practiced');
  });
});

describe('countMastery (with storage)', () => {
  it('counts a legacy completion mark as Learned with no record at all', () => {
    install(memoryStorage({ [key('arrays')]: '1' }));
    expect(readMastery('arrays')).toEqual(BLANK);
    expect(masteryStage('arrays')).toBe('learned');
    expect(countMastery(CURRICULUM)).toEqual({
      learned: 1,
      practiced: 0,
      mastered: 0,
      total: 5,
    });
  });

  it('counts cumulatively, so a promotion never makes a number go down', () => {
    install(
      memoryStorage({
        [key('arrays')]: '1',
        [mkey('stacks')]: seedRecord({
          practicedAt: T0.toISOString(),
          checks: [1, 1],
        }),
        [mkey('binary-search')]: seedRecord({
          practicedAt: T0.toISOString(),
          masteredAt: later(5).toISOString(),
          checks: [1],
        }),
      }),
    );
    // The mastered lesson is counted in `practiced` and `learned` as well.
    expect(countMastery(CURRICULUM)).toEqual({
      learned: 3,
      practiced: 2,
      mastered: 1,
      total: 5,
    });
  });

  it('counts each track against its own total', () => {
    install(
      memoryStorage({
        [key('arrays')]: '1',
        [mkey('binary-search')]: seedRecord({
          practicedAt: T0.toISOString(),
          checks: [1],
        }),
      }),
    );
    expect(countMastery(FOUNDATIONS)).toEqual({
      learned: 1,
      practiced: 0,
      mastered: 0,
      total: 3,
    });
    expect(countMastery(ALGORITHMS)).toEqual({
      learned: 1,
      practiced: 1,
      mastered: 0,
      total: 2,
    });
  });

  it('counts a lesson practiced but never marked complete, so it can exceed countComplete', () => {
    // A lesson practiced without ever clicking "Mark as complete" is Learned by
    // the OR-win rule, which is why the two numbers answer different questions —
    // and why a surface that shows one must show the other beside it.
    install(
      memoryStorage({
        [mkey('stacks')]: seedRecord({
          practicedAt: T0.toISOString(),
          checks: [1],
        }),
      }),
    );
    expect(countComplete(CURRICULUM).done).toBe(0);
    expect(countMastery(CURRICULUM).learned).toBe(1);
  });

  it('ignores a stale record for a lesson that no longer exists', () => {
    install(
      memoryStorage({
        [mkey('arrays')]: seedRecord({
          practicedAt: T0.toISOString(),
          checks: [1],
        }),
        [mkey('linked-lists-old-name')]: seedRecord({
          practicedAt: T0.toISOString(),
          checks: [1],
        }),
      }),
    );
    expect(countMastery(CURRICULUM)).toEqual({
      learned: 1,
      practiced: 1,
      mastered: 0,
      total: 5,
    });
  });
});

describe('readMastery (defensive parse)', () => {
  it('degrades a corrupt payload to "nothing recorded"', () => {
    install(
      memoryStorage({
        [mkey('stacks')]: '{"practicedAt":',
        [mkey('arrays')]: '[]',
        [mkey('binary-search')]: 'null',
      }),
    );
    expect(readMastery('stacks')).toEqual(BLANK);
    expect(readMastery('arrays')).toEqual(BLANK);
    expect(readMastery('binary-search')).toEqual(BLANK);
    expect(masteryStage('stacks')).toBe('none');
  });

  it('drops fields with the wrong type or an unparseable date', () => {
    install(
      memoryStorage({
        [mkey('stacks')]: JSON.stringify({
          practicedAt: 1_754_042_400_000,
          masteredAt: 'sometime last week',
          checks: 'yes',
        }),
      }),
    );
    expect(readMastery('stacks')).toEqual(BLANK);
  });

  it('coerces unexpected check entries to ungraded', () => {
    install(
      memoryStorage({
        [mkey('stacks')]: JSON.stringify({
          practicedAt: null,
          masteredAt: null,
          checks: [1, 0, '1', true, undefined, 7],
        }),
      }),
    );
    expect(readMastery('stacks').checks).toEqual([
      1,
      0,
      null,
      null,
      null,
      null,
    ]);
  });

  it('ignores an unknown version, because the version is in the key', () => {
    install(
      memoryStorage({
        'progress:v2:stacks': seedRecord({
          practicedAt: T0.toISOString(),
          checks: [1],
        }),
      }),
    );
    expect(readMastery('stacks')).toEqual(BLANK);
    expect(masteryStage('stacks')).toBe('none');
  });
});

describe('forward compatibility (fields this version has no name for)', () => {
  /**
   * The record as M8.2/M8.3 will write it. `docs/m8-gamification.md` extends
   * THIS key with `intervalIndex`, `lastReviewAt` and `note` and promises no
   * migration step — which only holds if a write from an older bundle carries
   * the newer fields through.
   */
  const FUTURE = {
    practicedAt: T0.toISOString(),
    masteredAt: null,
    checks: [1, 1],
    intervalIndex: 2,
    lastReviewAt: later(6).toISOString(),
    note: 'the window halves every step',
  };

  /** The raw JSON actually on disk for one lesson. */
  function stored(store: Storage, slug: string): Record<string, unknown> {
    return JSON.parse(store.getItem(mkey(slug)) ?? '{}') as Record<
      string,
      unknown
    >;
  }

  it('ignores the unknown fields on read rather than choking on them', () => {
    install(memoryStorage({ [mkey('stacks')]: JSON.stringify(FUTURE) }));
    expect(readMastery('stacks')).toEqual({
      practicedAt: FUTURE.practicedAt,
      masteredAt: null,
      checks: [1, 1],
    });
  });

  it('carries them through a writeCheck, so a stale tab cannot erase them', () => {
    // The failure this stands against: a browser one deploy behind grades a
    // question and silently deletes the reader's whole review schedule.
    const store = install(
      memoryStorage({ [mkey('stacks')]: JSON.stringify(FUTURE) }),
    );
    writeCheck('stacks', 0, 2, 0, later(7));
    const raw = stored(store, 'stacks');
    expect(raw['intervalIndex']).toBe(2);
    expect(raw['lastReviewAt']).toBe(FUTURE.lastReviewAt);
    expect(raw['note']).toBe(FUTURE.note);
    // …and this version's own write still landed.
    expect(raw['checks']).toEqual([0, 1]);
  });

  it('carries them through a recordPass too', () => {
    const store = install(
      memoryStorage({ [mkey('stacks')]: JSON.stringify(FUTURE) }),
    );
    expect(recordPass('stacks', later(10)).masteredAt).toBe(
      later(10).toISOString(),
    );
    const raw = stored(store, 'stacks');
    expect(raw['note']).toBe(FUTURE.note);
    expect(raw['masteredAt']).toBe(later(10).toISOString());
  });

  it('never lets an unknown field masquerade as a known one', () => {
    // The known three are always written from the PARSED record, whatever the
    // raw payload said — so a value this version rejected cannot survive a
    // write and be believed by the next reader.
    const store = install(
      memoryStorage({
        [mkey('stacks')]: JSON.stringify({
          practicedAt: 42,
          masteredAt: 'never',
          checks: 'yes',
          tag: 'keep me',
        }),
      }),
    );
    writeCheck('stacks', 0, 1, 1, T0);
    const raw = stored(store, 'stacks');
    expect(raw['practicedAt']).toBe(T0.toISOString());
    expect(raw['masteredAt']).toBeNull();
    expect(raw['checks']).toEqual([1]);
    expect(raw['tag']).toBe('keep me');
  });
});

describe('resetProgress (mastery)', () => {
  /** The three §6 PREFERENCE keys — deliberately outside the delete list. */
  const PREFERENCES = {
    theme: 'dark',
    'pref:viz-speed': '2',
    'pref:code-lang': 'javascript',
  };

  it('clears mastery records as well as completion marks, but no preference', () => {
    const store = install(
      memoryStorage({
        ...PREFERENCES,
        [key('arrays')]: '1',
        [mkey('arrays')]: seedRecord({ checks: [1] }),
        [mkey('stacks')]: seedRecord({
          practicedAt: T0.toISOString(),
          masteredAt: later(4).toISOString(),
          checks: [1, 1],
        }),
      }),
    );
    resetProgress(CURRICULUM);
    expect(readMastery('arrays')).toEqual(BLANK);
    expect(readMastery('stacks')).toEqual(BLANK);
    expect(readCompleted(CURRICULUM)).toEqual([]);
    expect(store.getItem('theme')).toBe('dark');
    expect(store.getItem('pref:viz-speed')).toBe('2');
    expect(store.getItem('pref:code-lang')).toBe('javascript');
  });

  it('still counts only completion marks — a practice record is not a mark', () => {
    // The caller renders this number as "N completed marks removed", so it must
    // keep speaking in the unit that sentence uses.
    install(
      memoryStorage({
        [key('arrays')]: '1',
        [mkey('arrays')]: seedRecord({ checks: [1] }),
        [mkey('stacks')]: seedRecord({ checks: [1] }),
      }),
    );
    expect(resetProgress(CURRICULUM)).toBe(1);
  });

  it('leaves a record for a lesson outside the injected list alone', () => {
    const store = install(
      memoryStorage({
        [mkey('arrays')]: seedRecord({ checks: [1] }),
        [mkey('linked-lists-old-name')]: seedRecord({ checks: [1] }),
      }),
    );
    resetProgress(CURRICULUM);
    expect(store.getItem(mkey('arrays'))).toBeNull();
    expect(store.getItem(mkey('linked-lists-old-name'))).not.toBeNull();
  });
});

describe('hasStoredProgress', () => {
  it('sees a practice-only device that the completion count cannot', () => {
    // The reason it exists: a reset control gated on marks alone would say
    // "nothing to clear" while holding this reader's practice records.
    install(
      memoryStorage({
        [mkey('stacks')]: seedRecord({ checks: [1] }),
      }),
    );
    expect(countComplete(CURRICULUM).done).toBe(0);
    expect(hasStoredProgress(CURRICULUM)).toBe(true);
  });

  it('is false on a clean device and ignores preferences', () => {
    install(memoryStorage({ theme: 'dark', 'pref:viz-speed': '2' }));
    expect(hasStoredProgress(CURRICULUM)).toBe(false);
  });

  it('ignores a stale key for a lesson that no longer exists', () => {
    install(memoryStorage({ [mkey('linked-lists-old-name')]: seedRecord({}) }));
    expect(hasStoredProgress(CURRICULUM)).toBe(false);
  });
});

describe('mastery on a store that throws on every call', () => {
  beforeEach(() => {
    install(
      memoryStorage(
        {
          [key('arrays')]: '1',
          [mkey('arrays')]: seedRecord({ checks: [1] }),
        },
        ['getItem', 'removeItem', 'setItem'],
      ),
    );
  });

  it('renders as "nothing recorded" — absent pips, not broken ones', () => {
    expect(readMastery('arrays')).toEqual(BLANK);
    expect(masteryStage('arrays')).toBe('none');
    expect(isPracticed('arrays')).toBe(false);
    expect(countMastery(CURRICULUM)).toEqual({
      learned: 0,
      practiced: 0,
      mastered: 0,
      total: 5,
    });
    expect(hasStoredProgress(CURRICULUM)).toBe(false);
  });

  it('records nothing without throwing into the island', () => {
    expect(writeCheck('arrays', 0, 2, 1, T0)).toEqual(BLANK);
    expect(recordPass('arrays', later(30))).toEqual(BLANK);
  });
});
