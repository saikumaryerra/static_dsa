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
 * decays", Learned = the completion mark, the unknown fields M8.3 will add
 * surviving a write from this version, and the reset that must take mastery
 * records but never a preference.
 *
 * The M8.2 REVIEW blocks follow them, for the same reason and one more: the
 * queue is derived from those very records, so the schedule and the stage ladder
 * have to be exercised against ONE store or they are not being tested together
 * at all. They cover the calm invariants the design says must be tests rather
 * than intentions — at most two cards, `[]` when nothing is due, the interval
 * clamp that decides whether a lesson is ever offered again, and the vocabulary
 * ban read off the exported copy.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  allChecksPassed,
  countComplete,
  countMastery,
  countNotes,
  countPassed,
  deleteNote,
  hasStoredProgress,
  isComplete,
  isPracticed,
  isReviewDue,
  MASTERY_GATE_DAYS,
  masteryGateOpen,
  masteryKey,
  masteryStage,
  masteryStageOf,
  MAX_REVIEW_CARDS,
  nextIncomplete,
  NOTE_MAX_CHARS,
  parseLessonRefs,
  readCompleted,
  readMastery,
  readNote,
  recordPass,
  resetProgress,
  resumeLabel,
  REVIEW_COPY,
  REVIEW_INTERVAL_DAYS,
  reviewHref,
  reviewReadyAt,
  selectDueReviews,
  storedProgress,
  writeCheck,
  writeNote,
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

/**
 * A record with nothing recorded — what every degraded path must return.
 *
 * The last two fields are M8.2's review schedule, and their defaults are a
 * statement in themselves: a lesson nobody has practised is on the FIRST
 * interval and has never been reviewed, which is exactly what an M8.1-era record
 * with neither field stored parses as. That is the no-migration promise, seen
 * from the blank end.
 */
const BLANK: MasteryRecord = {
  practicedAt: null,
  masteredAt: null,
  checks: [],
  intervalIndex: 0,
  lastReviewAt: null,
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
          ...BLANK,
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
    // The same pass is also the first REVIEW: the two numbers coincide by
    // design (the first interval is the gate), so a return visit that earns
    // Mastered is exactly the one the review strip invited.
    expect(record.lastReviewAt).toBe(later(3).toISOString());
    expect(record.intervalIndex).toBe(1);
  });

  it('stamps practicedAt for an earning path that has no practice checks', () => {
    // M8.2's ≥80% predict session and M8.3's cleared Final Run converge here.
    install(memoryStorage());
    const record = recordPass('binary-search', T0);
    expect(record).toEqual({
      ...BLANK,
      practicedAt: T0.toISOString(),
    });
    expect(masteryStage('binary-search')).toBe('practiced');
    // A first pass is not a review: it puts the lesson ON the schedule (the
    // first interval, measured from this instant) rather than through one.
    expect(record.lastReviewAt).toBeNull();
    expect(record.intervalIndex).toBe(0);
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
   * The record as M8.3 will write it. `docs/m8-gamification.md` extends THIS key
   * with `intervalIndex`, `lastReviewAt` and `note` and promises no migration
   * step — which only holds if a write from an older bundle carries the newer
   * fields through. M8.2 has since claimed the first two, so `note` is the
   * unknown one here now; the schedule fields stay in the fixture because the
   * same payload must also prove that CLAIMING a field kept its value intact.
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

  it('ignores the unknown field on read, and parses the schedule it now knows', () => {
    install(memoryStorage({ [mkey('stacks')]: JSON.stringify(FUTURE) }));
    expect(readMastery('stacks')).toEqual({
      practicedAt: FUTURE.practicedAt,
      masteredAt: null,
      checks: [1, 1],
      intervalIndex: 2,
      lastReviewAt: FUTURE.lastReviewAt,
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
    // Day 40: the record's last review was day 6 and it is on the 30-day
    // interval, so this pass is a DUE one — the only kind that writes.
    expect(recordPass('stacks', later(40)).masteredAt).toBe(
      later(40).toISOString(),
    );
    const raw = stored(store, 'stacks');
    expect(raw['note']).toBe(FUTURE.note);
    expect(raw['masteredAt']).toBe(later(40).toISOString());
    expect(raw['lastReviewAt']).toBe(later(40).toISOString());
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

// ---------------------------------------------------------------------------
// M8.2 — the ready-to-review queue: the only surface in this product that ever
// prompts the reader, and therefore the one with the strictest rules about what
// it may say and how much of it there may be.
// ---------------------------------------------------------------------------

/** A record for a lesson first passed at `at`, plus any schedule state. */
function practisedAt(
  at: Date,
  extra: Partial<MasteryRecord> = {},
): MasteryRecord {
  return { ...BLANK, practicedAt: at.toISOString(), ...extra };
}

describe('the review schedule (pure)', () => {
  it('is the schedule the design specifies, and its first step IS the gate', () => {
    expect(REVIEW_INTERVAL_DAYS).toEqual([3, 10, 30]);
    // Not a coincidence worth relying on in code, but worth stating here: the
    // first review a reader is invited to is exactly the return visit that can
    // earn Mastered, so the strip never offers a trip that cannot pay.
    expect(REVIEW_INTERVAL_DAYS[0]).toBe(MASTERY_GATE_DAYS);
    expect(MAX_REVIEW_CARDS).toBe(2);
  });

  it('never offers a lesson that was never practised', () => {
    // Week one is pure learning: with no first pass there is nothing to space
    // out, so the strip is structurally invisible rather than empty.
    expect(reviewReadyAt(BLANK)).toBeNull();
    expect(isReviewDue(BLANK, later(365))).toBe(false);
    // A partial self-grade is not a pass, and Learned alone gates nothing.
    expect(isReviewDue({ ...BLANK, checks: [1, null] }, later(365))).toBe(
      false,
    );
  });

  it('offers a first review exactly three days after the first pass', () => {
    const record = practisedAt(T0);
    expect(reviewReadyAt(record)).toBe(later(3).getTime());
    expect(isReviewDue(record, later(3, -1))).toBe(false);
    expect(isReviewDue(record, later(3))).toBe(true);
  });

  it('measures from the last review once one exists, and the gaps GROW', () => {
    const record = practisedAt(T0, {
      intervalIndex: 1,
      lastReviewAt: later(3).toISOString(),
    });
    // Ten days from the review, not three from the first pass. Growing gaps are
    // the spacing effect; they are never a penalty for having been away.
    expect(isReviewDue(record, later(12))).toBe(false);
    expect(isReviewDue(record, later(13))).toBe(true);
  });

  it('still becomes due after the LAST interval when the index runs past the end', () => {
    // THE CLAMP, which is the whole reason this function is unit-tested.
    // Unclamped, `REVIEW_INTERVAL_DAYS[3]` is `undefined`, every comparison
    // against it is false, and the lesson is silently never offered again — a
    // queue that fails SHUT, which nothing on screen could ever report.
    const record = practisedAt(T0, {
      intervalIndex: 3,
      lastReviewAt: later(1).toISOString(),
    });
    expect(reviewReadyAt(record)).toBe(later(31).getTime());
    expect(isReviewDue(record, later(30))).toBe(false);
    expect(isReviewDue(record, later(31))).toBe(true);
  });

  it('treats an unusable index as the first interval, which only offers SOONER', () => {
    // The safe direction for a corrupt value: an invitation costs nothing, and
    // a lesson offered early is a lesson the reader can ignore.
    expect(reviewReadyAt(practisedAt(T0, { intervalIndex: -2 }))).toBe(
      later(3).getTime(),
    );
    expect(reviewReadyAt(practisedAt(T0, { intervalIndex: 1.5 }))).toBe(
      later(3).getTime(),
    );
  });

  it('offers nothing on garbage timestamps or a clock that ran backwards', () => {
    expect(reviewReadyAt({ ...BLANK, practicedAt: 'whenever' })).toBeNull();
    expect(isReviewDue(practisedAt(T0), later(-10))).toBe(false);
    // An unparseable review date falls back to the first pass rather than
    // dropping the lesson out of the schedule entirely.
    expect(
      reviewReadyAt(practisedAt(T0, { lastReviewAt: 'last tuesday' })),
    ).toBe(later(3).getTime());
    // A review stamped in the FUTURE (a clock that jumped) pushes the offer
    // out: the schedule takes the later of the two dates, never the earlier.
    expect(
      isReviewDue(
        practisedAt(T0, { lastReviewAt: later(100).toISOString() }),
        later(50),
      ),
    ).toBe(false);
  });

  it('accepts a millisecond clock as well as a Date', () => {
    expect(isReviewDue(practisedAt(T0), later(4).getTime())).toBe(true);
  });
});

describe('selectDueReviews (with storage)', () => {
  /** The stored record for a lesson first passed at `at`. */
  function seedPractised(at: Date, extra: Partial<MasteryRecord> = {}): string {
    return seedRecord(practisedAt(at, extra));
  }

  it('offers nothing when nothing is due — so the strip has no empty state', () => {
    install(memoryStorage({ [mkey('arrays')]: seedPractised(T0) }));
    expect(selectDueReviews(CURRICULUM, later(2))).toEqual([]);
  });

  it('offers nothing on a device that has only completion marks', () => {
    install(memoryStorage({ [key('arrays')]: '1', theme: 'dark' }));
    expect(selectDueReviews(CURRICULUM, later(365))).toEqual([]);
  });

  it('never offers more than two, however many are ready', () => {
    // The cap is a design rule, not a layout convenience: a list of fifteen
    // things owed is a chore, and a chore is the felt obligation this whole
    // phase exists to avoid.
    install(
      memoryStorage(
        Object.fromEntries(
          CURRICULUM.map((lesson) => [mkey(lesson.slug), seedPractised(T0)]),
        ),
      ),
    );
    const due = selectDueReviews(CURRICULUM, later(90));
    expect(due).toHaveLength(MAX_REVIEW_CARDS);
    expect(due.length).toBeLessThanOrEqual(2);
  });

  it('offers the ones ready longest first, ties broken by curriculum order', () => {
    install(
      memoryStorage({
        // Ready on day 23 — the newest, so it waits.
        [mkey('sorting-basics')]: seedPractised(later(20)),
        // Both ready on day 3; `arrays` is order 2 and `stacks` order 3.
        [mkey('stacks')]: seedPractised(T0),
        [mkey('arrays')]: seedPractised(T0),
        [mkey('binary-search')]: seedPractised(later(10)),
      }),
    );
    expect(
      selectDueReviews(CURRICULUM, later(30)).map((lesson) => lesson.slug),
    ).toEqual(['arrays', 'stacks']);
  });

  it('ignores a stale record for a lesson that no longer exists', () => {
    // The same rule every function here lives under: the lesson list comes from
    // the build, so a renamed lesson can never surface a card for itself.
    install(
      memoryStorage({ [mkey('linked-lists-old-name')]: seedPractised(T0) }),
    );
    expect(selectDueReviews(CURRICULUM, later(90))).toEqual([]);
  });

  it('offers a Mastered lesson again — the loop is relearning, not a finish line', () => {
    install(
      memoryStorage({
        [mkey('stacks')]: seedPractised(T0, {
          masteredAt: later(3).toISOString(),
          intervalIndex: 1,
          lastReviewAt: later(3).toISOString(),
        }),
      }),
    );
    expect(
      selectDueReviews(CURRICULUM, later(13)).map((lesson) => lesson.slug),
    ).toEqual(['stacks']);
  });

  it('offers a record parked past the end of the schedule (the clamp, end to end)', () => {
    install(
      memoryStorage({
        [mkey('stacks')]: seedPractised(T0, {
          masteredAt: later(3).toISOString(),
          intervalIndex: 3,
          lastReviewAt: later(30).toISOString(),
        }),
      }),
    );
    expect(selectDueReviews(CURRICULUM, later(59))).toEqual([]);
    expect(
      selectDueReviews(CURRICULUM, later(60)).map((lesson) => lesson.slug),
    ).toEqual(['stacks']);
  });

  it('stops offering a lesson the moment its review pass lands', () => {
    install(memoryStorage({ [mkey('stacks')]: seedPractised(T0) }));
    expect(
      selectDueReviews(CURRICULUM, later(5)).map((lesson) => lesson.slug),
    ).toEqual(['stacks']);

    recordPass('stacks', later(5));
    expect(selectDueReviews(CURRICULUM, later(5))).toEqual([]);
    // …and comes back on the NEXT gap — ten days later, not three.
    expect(selectDueReviews(CURRICULUM, later(14))).toEqual([]);
    expect(
      selectDueReviews(CURRICULUM, later(15)).map((lesson) => lesson.slug),
    ).toEqual(['stacks']);
  });

  it('offers nothing with no storage, and nothing when every read throws', () => {
    // No install: the Node/SSR case, where the strip must simply never appear.
    expect(selectDueReviews(CURRICULUM, later(90))).toEqual([]);
    install(
      memoryStorage({ [mkey('stacks')]: seedPractised(T0) }, ['getItem']),
    );
    expect(selectDueReviews(CURRICULUM, later(90))).toEqual([]);
  });

  it('reads the wall clock when no clock is injected', () => {
    // The shipped path: the island calls this with one argument.
    install(
      memoryStorage({
        [mkey('stacks')]: seedRecord({
          practicedAt: new Date(Date.now() - 40 * DAY_MS).toISOString(),
        }),
        [mkey('arrays')]: seedRecord({
          practicedAt: new Date(Date.now() + DAY_MS).toISOString(),
        }),
      }),
    );
    expect(selectDueReviews(CURRICULUM).map((lesson) => lesson.slug)).toEqual([
      'stacks',
    ]);
  });
});

describe('recordPass (the review schedule)', () => {
  it('advances one interval per due pass, and stops at the last', () => {
    install(memoryStorage());
    passAll('stacks', 1, T0);
    expect(recordPass('stacks', later(3)).intervalIndex).toBe(1);
    expect(recordPass('stacks', later(13)).intervalIndex).toBe(2);
    const third = recordPass('stacks', later(43));
    // Clamped: the last gap simply repeats. An index that kept climbing would
    // eventually index past the end of the schedule, and an unclamped LOOKUP
    // there stops offering the lesson at all.
    expect(third.intervalIndex).toBe(2);
    expect(third.lastReviewAt).toBe(later(43).toISOString());
  });

  it('changes nothing when the reader comes back early', () => {
    const store = install(memoryStorage());
    passAll('stacks', 1, T0);
    const before = store.getItem(mkey('stacks'));
    expect(recordPass('stacks', later(2))).toEqual(readMastery('stacks'));
    expect(store.getItem(mkey('stacks'))).toBe(before);
    // The point of asking: an eager re-pass on day 2 must not push the real
    // review from day 3 out to day 12. Studying more can never cost anything.
    expect(isReviewDue(readMastery('stacks'), later(3))).toBe(true);
  });

  it('costs nothing when a review goes badly — the card simply stays', () => {
    install(memoryStorage());
    passAll('stacks', 2, T0);
    // Day 5, the lesson is due, the reader returns and answers "Not yet". No
    // pass is recorded, so nothing moves: no stage falls, no schedule shifts,
    // and the invitation is still there when they want it.
    const record = writeCheck('stacks', 1, 2, 0, later(5));
    expect(record.practicedAt).toBe(T0.toISOString());
    expect(record.lastReviewAt).toBeNull();
    expect(record.intervalIndex).toBe(0);
    expect(
      selectDueReviews(CURRICULUM, later(5)).map((lesson) => lesson.slug),
    ).toEqual(['stacks']);
  });

  it('promotes and reschedules in ONE write, so a review is never half-recorded', () => {
    const store = install(memoryStorage());
    passAll('stacks', 1, T0);
    recordPass('stacks', later(4));
    const raw = JSON.parse(store.getItem(mkey('stacks')) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(raw['masteredAt']).toBe(later(4).toISOString());
    expect(raw['lastReviewAt']).toBe(later(4).toISOString());
    expect(raw['intervalIndex']).toBe(1);
  });
});

describe('the review strip copy (the vocabulary ban, read off the exports)', () => {
  /** Every word the strip can say. Exported precisely so this can read them. */
  const COPY: string[] = Object.values(REVIEW_COPY);

  it('never uses lateness, guilt, or a second currency', () => {
    // Each word is a mechanic the design killed on the evidence: "overdue" and
    // "missed" punish the very absence the spacing effect says is the point,
    // and every currency term is a scoreboard this product does not keep.
    for (const line of COPY) {
      expect(line, `banned vocabulary in "${line}"`).not.toMatch(
        /\b(overdue|missed|behind|late|expired|lost|streak|xp|points?|levels?|badges?|score|rank|leaderboard)\b/i,
      );
    }
  });

  it('never counts down, counts days waited, or shows a ratio', () => {
    for (const line of COPY) {
      expect(line, `countdown in "${line}"`).not.toMatch(
        /\b(in \d+ (seconds?|minutes?|hours?|days?)|\d+ (seconds?|minutes?|hours?|days?) (left|remaining|to go|ago)|ready in|come back in|counting down)\b|\d{1,2}:\d{2}/i,
      );
      expect(line, `a score in "${line}"`).not.toMatch(/%|\d\s*\/\s*\d/);
    }
  });

  it('invites rather than instructs', () => {
    expect(REVIEW_COPY.heading).toBe('Ready to review');
    for (const line of COPY) {
      expect(line, `an obligation in "${line}"`).not.toMatch(
        /\b(must|should|need to|have to|don't forget)\b/i,
      );
    }
  });

  it('says where the record lives, like every persistent surface here', () => {
    expect(REVIEW_COPY.note).toMatch(/on this device/i);
  });

  it('is honest about the size of the ask', () => {
    expect(REVIEW_COPY.check).toMatch(/quick check/);
  });
});

describe('reviewHref', () => {
  it('deep-links to the practice section with predict on for one visit', () => {
    expect(reviewHref('binary-search')).toBe(
      '/learn/binary-search?review=1#practice',
    );
  });
});

describe('the Predict toggle has no storage surface at all', () => {
  /** Every key the store currently holds. */
  function keysOf(store: Storage): string[] {
    return Array.from({ length: store.length }, (_, i) => store.key(i) ?? '');
  }

  it('writes only the per-lesson keys spec §6 enumerates', () => {
    // A whole review round-trip through the shipped write paths — grade the
    // questions, meet the bar again on the due day, ask what is due — and then
    // ask what actually landed on the device. The review deep link is a URL,
    // not a stored flag, so the mode it enables has nothing to persist and the
    // reset control has nothing extra to miss.
    const store = install(memoryStorage({ theme: 'dark' }));
    passAll('stacks', 2, T0);
    recordPass('stacks', later(4));
    selectDueReviews(CURRICULUM, later(4));
    expect(keysOf(store).filter((name) => name !== 'theme')).toEqual([
      mkey('stacks'),
    ]);
  });
});

// ---------------------------------------------------------------------------
// M8.3 — the enrichment keys, from the delete side.
//
// Spec §6 lists `ld:challenges:v1` and `ld:finalrun:v1` as PROGRESS keys, so the
// reset control owns them: the delete path ships with the read path, or a reader
// who asks to clear their device keeps records nothing on screen admits to. They
// are GLOBAL rather than per-lesson, which is the one structural difference from
// everything above — cleared outright, never per-slug — and the rule they must
// NOT bend is the one this module has held since M7.2: no prefix sweep, which is
// what the "never sweeps by prefix" case below stands against.
//
// Their names are spelled out here rather than imported from
// `src/lib/challenges.ts`, exactly as `key()` and `mkey()` are: a test that
// describes the implementation with the implementation cannot catch a rename.
// (`tests/unit/challenges.test.ts` pins the same two literals to the exported
// constants, so the chain from spec §6 to the writer to this delete list is
// covered end to end.)
// ---------------------------------------------------------------------------

/** Cleared Trace Trials — `Challenge.astro` is the one writer. */
const CHALLENGES_KEY = 'ld:challenges:v1';
/** Cleared Final Runs — `FinalRun.astro` is the one writer. */
const FINAL_RUN_KEY = 'ld:finalrun:v1';

/** One cleared trial, in the shape `Challenge.astro` writes. */
const CLEARED_TRIAL = JSON.stringify({ 'sorting-efficient/worst-case': 1 });
/** One cleared Final Run, in the shape `FinalRun.astro` writes. */
const CLEARED_FINAL_RUN = JSON.stringify({ 'binary-search': { c: 1 } });

/** A device that has cleared one Trace Trial and one Final Run. */
const ENRICHMENT: Record<string, string> = {
  [CHALLENGES_KEY]: CLEARED_TRIAL,
  [FINAL_RUN_KEY]: CLEARED_FINAL_RUN,
};

/** The three §6 PREFERENCE keys — deliberately outside every delete list. */
const PREFERENCE_KEYS: Record<string, string> = {
  theme: 'dark',
  'pref:viz-speed': '2',
  'pref:code-lang': 'javascript',
};

describe('resetProgress (enrichment keys)', () => {
  it('clears both global keys alongside the per-lesson ones, and no preference', () => {
    const store = install(
      memoryStorage({
        ...PREFERENCE_KEYS,
        ...ENRICHMENT,
        [key('arrays')]: '1',
        [mkey('arrays')]: seedRecord({ checks: [1] }),
      }),
    );
    resetProgress(CURRICULUM);
    expect(store.getItem(CHALLENGES_KEY)).toBeNull();
    expect(store.getItem(FINAL_RUN_KEY)).toBeNull();
    expect(store.getItem(key('arrays'))).toBeNull();
    expect(store.getItem(mkey('arrays'))).toBeNull();
    expect(store.getItem('theme')).toBe('dark');
    expect(store.getItem('pref:viz-speed')).toBe('2');
    expect(store.getItem('pref:code-lang')).toBe('javascript');
  });

  it('clears them on a device that has nothing else at all', () => {
    // The gap this closed: the enrichment layer is reachable without ever
    // marking a lesson complete or grading a question, so "only trials" is a
    // real device state and not a contrived one.
    const store = install(memoryStorage({ ...ENRICHMENT }));
    expect(resetProgress(CURRICULUM)).toBe(0);
    expect(store.length).toBe(0);
  });

  it('still counts only completion marks — a cleared trial is not a mark', () => {
    // The caller renders this number as "N completed marks removed" and names
    // the other kinds separately, so it must keep speaking in that one unit.
    install(
      memoryStorage({
        ...ENRICHMENT,
        [key('arrays')]: '1',
        [mkey('stacks')]: seedRecord({ checks: [1] }),
      }),
    );
    expect(resetProgress(CURRICULUM)).toBe(1);
  });

  it('never sweeps by prefix: an `ld:` key it does not own survives', () => {
    // The module deletes NAMED keys, each imported from the module that writes
    // it. A prefix sweep is the easy shortcut here and would take whatever else
    // the origin holds under `ld:` — including a key this product never wrote.
    // Pinned shut rather than merely avoided.
    //
    // The fixture used to be spec §6's own `ld:days:v1`, which was then a
    // permitted key with no writer. M8.3's learning-days counter now writes it,
    // so it belongs to the delete list (asserted in the learning-days block
    // below) and can no longer stand for "a key this module does not own" — a
    // name from outside §6 does.
    const store = install(
      memoryStorage({ ...ENRICHMENT, 'ld:experiment:v1': '{"count":3}' }),
    );
    resetProgress(CURRICULUM);
    expect(store.getItem(CHALLENGES_KEY)).toBeNull();
    expect(store.getItem('ld:experiment:v1')).toBe('{"count":3}');
  });

  it('removes nothing and throws nothing when the store is blocked', () => {
    install(
      memoryStorage({ ...ENRICHMENT, [key('arrays')]: '1' }, [
        'getItem',
        'removeItem',
        'setItem',
      ]),
    );
    expect(resetProgress(CURRICULUM)).toBe(0);
  });
});

describe('storedProgress', () => {
  it('names each kind separately, so a sentence can be true about any device', () => {
    install(
      memoryStorage({
        ...PREFERENCE_KEYS,
        ...ENRICHMENT,
        [key('arrays')]: '1',
        [key('stacks')]: '1',
        [mkey('stacks')]: seedRecord({ checks: [1] }),
      }),
    );
    expect(storedProgress(CURRICULUM)).toEqual({
      marks: 2,
      records: 1,
      enrichment: true,
    });
  });

  it('reports a device holding only cleared trials', () => {
    install(memoryStorage({ ...ENRICHMENT }));
    expect(storedProgress(CURRICULUM)).toEqual({
      marks: 0,
      records: 0,
      enrichment: true,
    });
  });

  it('is all-zero for preferences alone — they are not progress', () => {
    install(memoryStorage({ ...PREFERENCE_KEYS }));
    expect(storedProgress(CURRICULUM)).toEqual({
      marks: 0,
      records: 0,
      enrichment: false,
    });
  });

  it('counts a mark by PRESENCE, exactly as the delete does', () => {
    // `removeKey` deletes any key that is there, whatever it holds, and
    // `resetProgress` counts what it deleted. Counting presence here is what
    // keeps "N will be removed" and "N were removed" the same number on a
    // device holding a value `MarkComplete` never writes.
    install(memoryStorage({ [key('arrays')]: '0' }));
    expect(countComplete(CURRICULUM).done).toBe(0);
    expect(storedProgress(CURRICULUM).marks).toBe(1);
    expect(resetProgress(CURRICULUM)).toBe(1);
  });

  it('ignores keys for lessons outside the injected list', () => {
    install(
      memoryStorage({
        [key('linked-lists-old-name')]: '1',
        [mkey('linked-lists-old-name')]: seedRecord({ checks: [1] }),
      }),
    );
    expect(storedProgress(CURRICULUM)).toEqual({
      marks: 0,
      records: 0,
      enrichment: false,
    });
  });

  it('reports nothing rather than something wrong when the store throws', () => {
    install(memoryStorage({ ...ENRICHMENT }, ['getItem']));
    expect(storedProgress(CURRICULUM)).toEqual({
      marks: 0,
      records: 0,
      enrichment: false,
    });
  });

  it("reports nothing with no store at all (the build's Node pass)", () => {
    // No `install` — `afterEach` has removed the global, which is the SSR case.
    expect(storedProgress(CURRICULUM)).toEqual({
      marks: 0,
      records: 0,
      enrichment: false,
    });
  });
});

describe('hasStoredProgress (enrichment)', () => {
  it('is true for a device whose only stored data is a cleared trial', () => {
    // The failure this fixes: the reset control reads `aria-disabled="true"`
    // from this predicate, so a reader with real stored data was told there was
    // nothing to clear.
    install(memoryStorage({ [CHALLENGES_KEY]: CLEARED_TRIAL }));
    expect(countComplete(CURRICULUM).done).toBe(0);
    expect(hasStoredProgress(CURRICULUM)).toBe(true);
  });

  it('is true for a device whose only stored data is a cleared Final Run', () => {
    install(memoryStorage({ [FINAL_RUN_KEY]: CLEARED_FINAL_RUN }));
    expect(hasStoredProgress(CURRICULUM)).toBe(true);
  });

  it('is still false when only preferences are stored', () => {
    install(memoryStorage({ ...PREFERENCE_KEYS }));
    expect(hasStoredProgress(CURRICULUM)).toBe(false);
  });

  it('is false — never a throw — when the store is blocked', () => {
    install(memoryStorage({ ...ENRICHMENT }, ['getItem']));
    expect(hasStoredProgress(CURRICULUM)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M8.3 — Explain-it-back: the reader's own words.
//
// This is the ONLY free-form text the product stores, so these tests are about
// obligations rather than features (`docs/m8-gamification.md`): the note earns
// NOTHING, it can be deleted on its own, it never leaves the record it lives in,
// and it survives every other write path — including one from a bundle that
// predates it.
//
// It lives in `progress:v1:{slug}` as a field this version's `MasteryRecord`
// deliberately does not name, which is why the note assertions below read the
// RAW stored JSON as often as they read `readNote`: the promise is about what
// lands on the device, not about what one accessor happens to return.
// ---------------------------------------------------------------------------

describe('the note (Explain-it-back)', () => {
  /** A note a reader could plausibly write. */
  const NOTE = 'The window halves because the array is sorted.';

  /** The raw JSON on the device for one lesson. */
  function raw(store: Storage, slug: string): Record<string, unknown> {
    return JSON.parse(store.getItem(mkey(slug)) ?? 'null') as Record<
      string,
      unknown
    >;
  }

  it('saves into the EXISTING record, touching no other field', () => {
    const store = install(
      memoryStorage({
        [mkey('stacks')]: seedRecord({
          practicedAt: T0.toISOString(),
          masteredAt: later(4).toISOString(),
          checks: [1, 1],
          intervalIndex: 1,
          lastReviewAt: later(4).toISOString(),
        }),
      }),
    );
    const before = readMastery('stacks');

    expect(writeNote('stacks', NOTE)).toBe(NOTE);

    expect(readNote('stacks')).toBe(NOTE);
    expect(raw(store, 'stacks')['note']).toBe(NOTE);
    // Every field the stages and the schedule are made of is untouched — a note
    // is not an event in the mastery system.
    expect(readMastery('stacks')).toEqual(before);
  });

  it('earns nothing: no stage, no pass, no count', () => {
    // The design's one currency is mastery, and writing a sentence is
    // elaboration rather than retrieval. Skipping the prompt has to cost the
    // reader exactly nothing, which is only true if writing one gains nothing.
    install(memoryStorage({}));
    writeNote('arrays', NOTE);
    expect(masteryStage('arrays')).toBe('none');
    expect(isPracticed('arrays')).toBe(false);
    expect(readMastery('arrays')).toEqual(BLANK);
    expect(countMastery(CURRICULUM)).toEqual({
      learned: 0,
      practiced: 0,
      mastered: 0,
      total: CURRICULUM.length,
    });
  });

  it('trims, and caps at the length the textarea advertises', () => {
    // The cap is enforced in the STORE as well as the DOM: `maxlength` bounds
    // the typed case only, and reader-supplied text with no bound lets one
    // paste cost the reader every other record in the origin's quota.
    const store = install(memoryStorage({}));
    expect(writeNote('arrays', `   ${NOTE}   `)).toBe(NOTE);
    expect(raw(store, 'arrays')['note']).toBe(NOTE);

    const long = 'x'.repeat(NOTE_MAX_CHARS + 120);
    expect(writeNote('stacks', long)).toHaveLength(NOTE_MAX_CHARS);
    expect(readNote('stacks')).toHaveLength(NOTE_MAX_CHARS);
  });

  it('writes nothing at all for an empty box', () => {
    // An empty note is not a note: it must not mint a record for a lesson the
    // reader has otherwise never touched, which would make the reset control
    // claim data that is not there.
    const store = install(memoryStorage({}));
    expect(writeNote('arrays', '   ')).toBeNull();
    expect(store.getItem(mkey('arrays'))).toBeNull();
    expect(readNote('arrays')).toBeNull();
  });

  it('deletes ONLY the note, leaving the record — and unknown fields — whole', () => {
    // THE ETHICS TEST, from the store's side. A privacy promise with no
    // deletion path is an erosion of it, and "clear all progress" is not a
    // deletion path: the reader must not have to give up their completion marks
    // and practice history to take their own words back.
    const store = install(
      memoryStorage({
        [mkey('stacks')]: JSON.stringify({
          ...BLANK,
          practicedAt: T0.toISOString(),
          checks: [1, 1],
          intervalIndex: 2,
          lastReviewAt: later(6).toISOString(),
          note: NOTE,
          // A field some future version added. It must survive the delete too:
          // this write path is a read-modify-write like every other one here.
          tag: 'keep me',
        }),
      }),
    );

    expect(deleteNote('stacks')).toBe(true);

    expect(raw(store, 'stacks')).toEqual({
      practicedAt: T0.toISOString(),
      masteredAt: null,
      checks: [1, 1],
      intervalIndex: 2,
      lastReviewAt: later(6).toISOString(),
      tag: 'keep me',
    });
    // Absent, not emptied: an empty string is a value the record would keep
    // carrying, and "deleted" has to mean gone.
    expect('note' in raw(store, 'stacks')).toBe(false);
    expect(readNote('stacks')).toBeNull();
  });

  it('is a no-op — and still reports success — when there is no note', () => {
    const store = install(memoryStorage({}));
    expect(deleteNote('arrays')).toBe(true);
    expect(store.getItem(mkey('arrays'))).toBeNull();
  });

  it('survives a self-grade and a review pass written beside it', () => {
    // The note rides in the `extra` bag every write path spreads back, so no
    // other mechanic can erase the reader's words — including a tab left open
    // across a deploy, running a bundle that never heard of them.
    install(memoryStorage({}));
    writeNote('stacks', NOTE);
    passAll('stacks', 2, T0);
    expect(readNote('stacks')).toBe(NOTE);
    recordPass('stacks', later(4));
    expect(readMastery('stacks').masteredAt).toBe(later(4).toISOString());
    expect(readNote('stacks')).toBe(NOTE);
  });

  it('counts notes for the injected lessons only, for the reset sentence', () => {
    install(
      memoryStorage({
        [mkey('linked-lists-old-name')]: JSON.stringify({
          ...BLANK,
          note: 'a note for a lesson that no longer exists',
        }),
      }),
    );
    writeNote('arrays', NOTE);
    writeNote('stacks', NOTE);
    // The renamed lesson's leftover key is invisible here for the same reason
    // it is everywhere else in this module: the list comes from the build, and
    // storage is never swept by prefix.
    expect(countNotes(CURRICULUM)).toBe(2);
  });

  it('goes with the record when progress is reset', () => {
    // Spec §6: the note lives inside a PROGRESS key, so the reset control that
    // clears the record clears the note with it — no orphaned text survives a
    // delete the reader asked for.
    const store = install(memoryStorage({ ...PREFERENCE_KEYS }));
    writeNote('arrays', NOTE);
    expect(hasStoredProgress(CURRICULUM)).toBe(true);
    resetProgress(CURRICULUM);
    expect(store.getItem(mkey('arrays'))).toBeNull();
    expect(countNotes(CURRICULUM)).toBe(0);
    expect(store.getItem('theme')).toBe('dark');
  });

  it('promises nothing when the store is blocked or absent', () => {
    // Nothing installed: the build's Node pass, and every private mode.
    expect(readNote('arrays')).toBeNull();
    expect(writeNote('arrays', NOTE)).toBeNull();
    expect(countNotes(CURRICULUM)).toBe(0);

    install(memoryStorage({}, ['getItem', 'setItem', 'removeItem']));
    // A write that could not land must not report the text back, or the
    // component announces a save the device never took.
    expect(writeNote('arrays', NOTE)).toBeNull();
    expect(readNote('arrays')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// M8.3 — the learning-days key, from the delete side.
//
// `src/lib/learning-days.ts` owns the name, the once-per-day rule and the write
// (its own tests are in `tests/unit/learning-days.test.ts`). What belongs HERE
// is the half this module owns: spec §6 lists `ld:days:v1` as a PROGRESS key, so
// the reset control must clear it and must know it is there.
//
// The literal is spelled out below rather than imported, exactly as the two
// enrichment keys are: a test that describes the implementation with the
// implementation cannot catch a rename.
// ---------------------------------------------------------------------------

/** The learning-days counter — `src/lib/learning-days.ts` is the one writer. */
const DAYS_KEY = 'ld:days:v1';

/** A device that has recorded three learning days. */
const DAYS_VALUE = JSON.stringify({ count: 3, last: '2026-08-01' });

describe('resetProgress (the learning-days key)', () => {
  it('clears it alongside every other progress key, and no preference', () => {
    const store = install(
      memoryStorage({
        ...PREFERENCE_KEYS,
        ...ENRICHMENT,
        [DAYS_KEY]: DAYS_VALUE,
        [key('arrays')]: '1',
        [mkey('arrays')]: seedRecord({ checks: [1] }),
      }),
    );
    resetProgress(CURRICULUM);
    expect(store.getItem(DAYS_KEY)).toBeNull();
    expect(store.getItem(CHALLENGES_KEY)).toBeNull();
    expect(store.getItem(key('arrays'))).toBeNull();
    expect(store.getItem('theme')).toBe('dark');
    expect(store.getItem('pref:viz-speed')).toBe('2');
  });

  it('clears it on a device that holds nothing else', () => {
    // A real device state, not a contrived one: a reader can mark one lesson
    // done and then change their mind, leaving nothing behind but the day that
    // act counted.
    const store = install(memoryStorage({ [DAYS_KEY]: DAYS_VALUE }));
    expect(resetProgress(CURRICULUM)).toBe(0);
    expect(store.length).toBe(0);
  });

  it('still counts only completion marks — a learning day is not a mark', () => {
    install(memoryStorage({ [DAYS_KEY]: DAYS_VALUE, [key('arrays')]: '1' }));
    // The caller renders this number as "N completed marks removed", so it must
    // keep speaking in that one unit.
    expect(resetProgress(CURRICULUM)).toBe(1);
  });

  it('removes nothing and throws nothing when the store is blocked', () => {
    install(
      memoryStorage({ [DAYS_KEY]: DAYS_VALUE }, [
        'getItem',
        'removeItem',
        'setItem',
      ]),
    );
    expect(resetProgress(CURRICULUM)).toBe(0);
  });
});

describe('hasStoredProgress (the learning-days key)', () => {
  it('is true for a device whose only stored data is the day count', () => {
    // The reset control reads `aria-disabled` from this predicate, so a reader
    // holding only this key must not be told there is nothing to clear — and
    // then have it deleted anyway.
    install(memoryStorage({ [DAYS_KEY]: DAYS_VALUE }));
    expect(countComplete(CURRICULUM).done).toBe(0);
    expect(storedProgress(CURRICULUM)).toEqual({
      marks: 0,
      records: 0,
      enrichment: false,
    });
    expect(hasStoredProgress(CURRICULUM)).toBe(true);
  });

  it('is false — never a throw — when the store is blocked', () => {
    install(memoryStorage({ [DAYS_KEY]: DAYS_VALUE }, ['getItem']));
    expect(hasStoredProgress(CURRICULUM)).toBe(false);
  });
});
