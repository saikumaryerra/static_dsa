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
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  countComplete,
  isComplete,
  nextIncomplete,
  parseLessonRefs,
  readCompleted,
  resetProgress,
  resumeLabel,
  type LessonRef,
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
