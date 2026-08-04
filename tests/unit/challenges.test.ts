/**
 * Trace Trials + the Final Run — the enrichment layer's standing guards (M8.3,
 * workstream D; designed in `docs/m8-gamification.md`).
 *
 * Four kinds of invariant, all of which rot silently in production rather than
 * failing loudly:
 *
 * 1. **The DSL means what it says.** Every rule kind, every operator, and every
 *    missing-fact case, over injected facts — pure functions in the harness's
 *    `environment: 'node'`, no DOM and no storage (`vitest.config.ts`).
 * 2. **The build guard is regression-tested.** `validateChallenge` throws when a
 *    witness fails its own predicate, which is how "an unsolvable challenge fails
 *    the build" is covered in CI *without* committing a deliberately broken
 *    fixture (`docs/m8-gamification.md`, M8.3 accept criteria). The same call
 *    runs every shipped trial against the real algorithms, so a change to an
 *    instrumented algorithm that moves a metric fails here first.
 * 3. **No trial is free.** A trial the lesson's own pinned example already clears
 *    would be handed out by pressing Run, teaching nothing.
 * 4. **The pinned inputs are the ones on the page.** `PINNED_INPUTS` is the
 *    Final Run's source of truth for "the run the reader can watch", so it is
 *    checked against the actual `.mdx` bodies — the guarantee holds from this
 *    commit, not from whenever the MDX migrates to importing it.
 *
 * Plus the calm invariants this workstream owns: the two storage keys are
 * exactly the ones spec §6 enumerates, and nothing in the trial copy keeps score.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHALLENGES,
  CHALLENGES_KEY,
  ENRICHMENT_KEYS,
  FINAL_RUN_KEY,
  PINNED_INPUTS,
  challengeById,
  challengesFor,
  evaluateRules,
  factsForInput,
  factsFrom,
  finalMetric,
  findVisualizerInput,
  metricNoun,
  metricsOf,
  metricsSentence,
  parseArrayLiteral,
  pinnedInput,
  rivalIds,
  runFinalStep,
  validateChallenge,
} from '../../src/lib/challenges';
import type { Challenge, RunFacts } from '../../src/lib/challenges';
import { algorithms } from '../../src/viz/registry';
import type { Algorithm } from '../../src/viz/core/types';
import type { Step } from '../../src/viz/core/types';

/**
 * The real registry as an {@link AlgorithmLoader}. The catalog is validated
 * against the algorithms that actually ship, not against a stub — a trial's
 * whole claim is about numbers a reader will see.
 */
const load = (id: string): Promise<Algorithm<unknown, unknown>> | undefined =>
  (algorithms as Record<string, () => Promise<Algorithm<unknown, unknown>>>)[
    id
  ]?.();

/** Facts with nothing set, so each test states only what it is about. */
function facts(partial: Partial<RunFacts> = {}): RunFacts {
  return {
    algorithm: 'bubble-sort',
    metrics: {},
    inputArray: null,
    foundIndex: null,
    rivals: {},
    ...partial,
  };
}

/** A minimal final step, for the `viz:run` payload shape. */
function step(
  metrics: Record<string, number>,
  state: unknown = { array: [] },
): Step<unknown> {
  return { state, explanation: '', metrics };
}

const LESSONS_DIR = fileURLToPath(
  new URL('../../src/content/lessons', import.meta.url),
);

/** Every lesson's raw MDX, keyed by its frontmatter slug. */
function readLessonBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const file of readdirSync(LESSONS_DIR).filter((f) =>
    f.endsWith('.mdx'),
  )) {
    const source = readFileSync(`${LESSONS_DIR}/${file}`, 'utf8');
    const slug = /^slug:\s*'([^']+)'/m.exec(source)?.[1];
    if (slug) bodies.set(slug, source);
  }
  return bodies;
}

describe('parseArrayLiteral', () => {
  it('reads the numbers a submitted input names', () => {
    // The island composes `${array} target=${target}` even when the second field
    // is hidden, so the tail must never confuse the list.
    expect(parseArrayLiteral('[5,2,9,1,7,3] target=')).toEqual([
      5, 2, 9, 1, 7, 3,
    ]);
    expect(parseArrayLiteral('  [1, 3 , 5] target=7 ')).toEqual([1, 3, 5]);
    expect(parseArrayLiteral('[-4,0,4]')).toEqual([-4, 0, 4]);
    expect(parseArrayLiteral('[]')).toEqual([]);
  });

  it('reports "no array here" rather than guessing', () => {
    // A graph edge list, an `n`, and a malformed list are all inputs with no
    // array to talk about — every array-shaped rule must fail on them.
    expect(parseArrayLiteral('0-1,0-2 target=0')).toBeNull();
    expect(parseArrayLiteral('6 target=')).toBeNull();
    expect(parseArrayLiteral('[1,two,3]')).toBeNull();
    expect(parseArrayLiteral('[1.5,2]')).toBeNull();
  });
});

describe('metricsOf / metricsSentence / metricNoun', () => {
  it('keeps only finite counters', () => {
    expect(metricsOf(step({ comparisons: 9, swaps: Number.NaN }))).toEqual({
      comparisons: 9,
    });
    expect(metricsOf({ state: {}, explanation: '' })).toEqual({});
  });

  it('says what a run did, in the algorithm’s own units', () => {
    expect(metricsSentence({ comparisons: 9, swaps: 4 })).toBe(
      '9 comparisons, 4 swaps',
    );
    expect(metricsSentence({ comparisons: 1, swaps: 1 })).toBe(
      '1 comparison, 1 swap',
    );
    expect(metricsSentence({ cacheHits: 4 })).toBe('4 cache hits');
    // No entry in the word list: the key is already a plural noun.
    expect(metricsSentence({ pushes: 3 })).toBe('3 pushes');
    expect(metricsSentence({})).toBe('');
  });

  it('never reports a ratio, a percentage or a score', () => {
    // The calm invariant, asserted on the only string this workstream renders
    // from run data (`docs/m8-gamification.md`): activity, never accuracy.
    const sentence = metricsSentence({ comparisons: 9, swaps: 4, visited: 6 });
    expect(sentence).not.toMatch(/%|\bof\b|score|accuracy|\d+\s*\/\s*\d+/i);
  });

  it('names a metric for the Final Run’s question', () => {
    expect(metricNoun('comparisons')).toBe('comparisons');
    expect(metricNoun('cacheHits')).toBe('cache hits');
    expect(metricNoun('maxDepth')).toBe('levels deep');
    expect(metricNoun('enqueues')).toBe('enqueues');
  });
});

describe('evaluateRules', () => {
  it('AND-s every rule', () => {
    const rules = [
      { kind: 'inputLen', op: 'eq', value: 6 },
      { kind: 'metric', metric: 'comparisons', op: 'lte', value: 5 },
    ] as const;
    expect(
      evaluateRules(
        rules,
        facts({ inputArray: [1, 2, 3, 4, 5, 6], metrics: { comparisons: 5 } }),
      ),
    ).toBe(true);
    // Either half failing fails the trial.
    expect(
      evaluateRules(
        rules,
        facts({ inputArray: [1, 2, 3], metrics: { comparisons: 5 } }),
      ),
    ).toBe(false);
    expect(
      evaluateRules(
        rules,
        facts({ inputArray: [1, 2, 3, 4, 5, 6], metrics: { comparisons: 6 } }),
      ),
    ).toBe(false);
  });

  it('fails closed on an empty rule list', () => {
    // A challenge with no conditions would be cleared by any run at all.
    expect(evaluateRules([], facts({ metrics: { comparisons: 1 } }))).toBe(
      false,
    );
  });

  it('compares metrics with each operator, and fails on a missing one', () => {
    const at = (metrics: Record<string, number>) => facts({ metrics });
    expect(
      evaluateRules(
        [{ kind: 'metric', metric: 'swaps', op: 'eq', value: 0 }],
        at({ swaps: 0 }),
      ),
    ).toBe(true);
    expect(
      evaluateRules(
        [{ kind: 'metric', metric: 'swaps', op: 'gte', value: 21 }],
        at({ swaps: 21 }),
      ),
    ).toBe(true);
    expect(
      evaluateRules(
        [{ kind: 'metric', metric: 'swaps', op: 'lte', value: 2 }],
        at({ swaps: 3 }),
      ),
    ).toBe(false);
    // merge-sort has no swaps metric: a rule about one it never emits must fail,
    // never read as "0 swaps, cleared".
    expect(
      evaluateRules(
        [{ kind: 'metric', metric: 'swaps', op: 'eq', value: 0 }],
        at({ comparisons: 7 }),
      ),
    ).toBe(false);
  });

  it('reads input length only from a real array', () => {
    const rule = [{ kind: 'inputLen', op: 'gte', value: 3 }] as const;
    expect(evaluateRules(rule, facts({ inputArray: [1, 2, 3] }))).toBe(true);
    expect(evaluateRules(rule, facts({ inputArray: [1, 2] }))).toBe(false);
    expect(evaluateRules(rule, facts({ inputArray: null }))).toBe(false);
  });

  it('treats `found` as the run’s terminal hit index', () => {
    const rule = [{ kind: 'found' }] as const;
    expect(evaluateRules(rule, facts({ foundIndex: 0 }))).toBe(true);
    expect(evaluateRules(rule, facts({ foundIndex: null }))).toBe(false);
  });

  it('pins an array exactly, in order', () => {
    const rule = [{ kind: 'pinnedArray', array: [1, 2, 3] }] as const;
    expect(evaluateRules(rule, facts({ inputArray: [1, 2, 3] }))).toBe(true);
    expect(evaluateRules(rule, facts({ inputArray: [1, 3, 2] }))).toBe(false);
    expect(evaluateRules(rule, facts({ inputArray: [1, 2, 3, 4] }))).toBe(
      false,
    );
    expect(evaluateRules(rule, facts({ inputArray: null }))).toBe(false);
  });

  it('duels only when both sides really reported the metric', () => {
    const rule = [
      { kind: 'duel', other: 'bubble-sort', metric: 'comparisons', op: 'lt' },
    ] as const;
    const mine = { comparisons: 5 };
    expect(
      evaluateRules(
        rule,
        facts({ metrics: mine, rivals: { 'bubble-sort': { comparisons: 9 } } }),
      ),
    ).toBe(true);
    // A tie is not a win — [1,2,3,4,5,6] really does tie insertion against
    // bubble at 5 comparisons each.
    expect(
      evaluateRules(
        rule,
        facts({ metrics: mine, rivals: { 'bubble-sort': { comparisons: 5 } } }),
      ),
    ).toBe(false);
    // Rival never resolved (chunk missing, unknown id): still open, never cleared.
    expect(evaluateRules(rule, facts({ metrics: mine, rivals: {} }))).toBe(
      false,
    );
  });
});

describe('factsFrom', () => {
  it('builds facts from the island’s own final step', () => {
    const built = factsFrom({
      algorithmId: 'binary-search',
      input: '[1,3,5] target=3',
      finalStep: step({ comparisons: 2 }, { array: [1, 3, 5], foundIndex: 1 }),
    });
    expect(built).toMatchObject({
      algorithm: 'binary-search',
      metrics: { comparisons: 2 },
      inputArray: [1, 3, 5],
      foundIndex: 1,
    });
  });

  it('reads `found` from the state, not from a `found` highlight', () => {
    // Every sort ends with a `found` highlight over the whole array to mean
    // "sorted"; grading off that would make every completed sort a hit.
    const sorted = factsFrom({
      algorithmId: 'quick-sort',
      input: '[1,2,3]',
      finalStep: {
        state: { array: [1, 2, 3] },
        explanation: 'Sorted!',
        highlights: [{ kind: 'found', ids: ['i0', 'i1', 'i2'] }],
        metrics: { comparisons: 2, swaps: 0 },
      },
    });
    expect(sorted.foundIndex).toBeNull();
  });
});

describe('rivalIds', () => {
  it('lists each duel rival once', () => {
    expect(
      rivalIds([
        { kind: 'metric', metric: 'comparisons', op: 'lte', value: 6 },
        { kind: 'duel', other: 'bubble-sort', metric: 'comparisons', op: 'lt' },
        { kind: 'duel', other: 'bubble-sort', metric: 'swaps', op: 'lt' },
      ]),
    ).toEqual(['bubble-sort']);
  });

  it('is empty without a duel, so a card can skip the registry entirely', () => {
    expect(rivalIds([{ kind: 'found' }])).toEqual([]);
  });
});

describe('the catalog', () => {
  it('ids every trial `{lessonSlug}/{challenge-slug}`, uniquely', () => {
    const seen = new Set<string>();
    for (const challenge of CHALLENGES) {
      expect(seen.has(challenge.id)).toBe(false);
      seen.add(challenge.id);
      // Lesson slugs, never algorithm ids: quick sort's trial is
      // `sorting-efficient/worst-case` (the design's data model).
      expect(challenge.id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
      expect(challenge.id.split('/')[0]).toBe(challenge.lesson);
    }
  });

  it('names only registered algorithms', () => {
    for (const challenge of CHALLENGES) {
      expect(Object.keys(algorithms)).toContain(challenge.algorithm);
    }
  });

  it('ships a prompt, a hint and at least one rule for every trial', () => {
    for (const challenge of CHALLENGES) {
      expect(challenge.title.length).toBeGreaterThan(0);
      expect(challenge.prompt.length).toBeGreaterThan(0);
      // The hint is ALWAYS present — never rationed by attempts, which would
      // price the first wrong try (`docs/m8-gamification.md`).
      expect(challenge.hint.length).toBeGreaterThan(0);
      expect(challenge.rules.length).toBeGreaterThan(0);
      expect(challenge.witness.length).toBeGreaterThan(0);
    }
  });

  it('never keeps score or races the reader, in any word it renders', () => {
    // The vocabulary ban, asserted over the copy rather than left to review
    // habit — the same shape as the review strip's. Nothing here may imply a
    // timer, a streak, a point, a badge or a leaderboard: every one of those is
    // on the design's killed list.
    const banned =
      /\b(score|points?|xp|level up|badge|streak|leaderboard|rank|fastest|timer|timed|seconds|record|combo|perfect)\b/i;
    for (const challenge of CHALLENGES) {
      const copy = `${challenge.title} ${challenge.prompt} ${challenge.hint}`;
      expect(copy).not.toMatch(banned);
      expect(copy).not.toMatch(/%/);
    }
  });

  it('finds trials by lesson and by id', () => {
    expect(challengesFor('sorting-efficient').map((c) => c.id)).toEqual([
      'sorting-efficient/worst-case',
      'sorting-efficient/pivot-in-the-middle',
      'sorting-efficient/merges-best-day',
    ]);
    // Graph traversal deliberately has none: BFS/DFS expose only `visited`, and
    // no rule can constrain how big the graph was (the audit in challenges.ts).
    expect(challengesFor('graph-traversal')).toEqual([]);
    expect(challengeById('sorting-efficient/worst-case')?.algorithm).toBe(
      'quick-sort',
    );
    expect(challengeById('nope/nope')).toBeNull();
  });

  it('ramps: one trial in the first Algorithms lesson, more later', () => {
    // Progressive disclosure (`docs/m8-gamification.md`): the demanding mechanics
    // concentrate where complexity reasoning is the objective.
    expect(challengesFor('recursion')).toHaveLength(1);
    expect(challengesFor('sorting-efficient').length).toBeGreaterThan(1);
    expect(CHALLENGES.every((c) => challengesFor(c.lesson).length <= 3)).toBe(
      true,
    );
  });
});

describe('validateChallenge (the build guard)', () => {
  it('throws when a witness does not satisfy its own predicate', async () => {
    // THE REGRESSION FOR THE BUILD GUARD. Constructed here rather than committed
    // to the catalog, so CI covers the failure path without shipping a broken
    // trial (`docs/m8-gamification.md`, M8.3 accept).
    const broken: Challenge = {
      id: 'sorting-basics/impossible',
      lesson: 'sorting-basics',
      algorithm: 'bubble-sort',
      title: 'Impossible',
      prompt: 'Sort six numbers with no comparisons at all.',
      hint: 'There is no such input.',
      rules: [{ kind: 'metric', metric: 'comparisons', op: 'eq', value: 0 }],
      witness: '[5,2,9,1,7,3]',
    };
    await expect(validateChallenge(broken, load)).rejects.toThrow(
      /unsolvable/i,
    );
  });

  it('throws when the lesson’s own example already clears it', async () => {
    const free: Challenge = {
      id: 'sorting-basics/free',
      lesson: 'sorting-basics',
      algorithm: 'bubble-sort',
      title: 'Free',
      prompt: 'Sort six numbers.',
      hint: 'Press Run.',
      rules: [{ kind: 'inputLen', op: 'eq', value: 6 }],
      witness: '[1,2,3,4,5,6]',
    };
    await expect(validateChallenge(free, load)).rejects.toThrow(
      /already cleared by the lesson/i,
    );
  });

  it('throws on an input the algorithm rejects', async () => {
    const unparseable: Challenge = {
      id: 'binary-search/unsorted',
      lesson: 'binary-search',
      algorithm: 'binary-search',
      title: 'Unsorted',
      prompt: 'Search an unsorted array.',
      hint: 'You cannot.',
      rules: [{ kind: 'found' }],
      witness: '[9,1,5] target=5',
    };
    await expect(validateChallenge(unparseable, load)).rejects.toThrow(
      /rejected by "binary-search"/,
    );
  });

  it('proves every shipped trial: solvable, and not already cleared', async () => {
    // Runs the REAL algorithms, so a change that moves a metric (an extra
    // compare step, a different pivot rule) fails here before it can leave a
    // reader with an unclearable puzzle.
    for (const challenge of CHALLENGES) {
      await expect(validateChallenge(challenge, load)).resolves.toBeUndefined();
    }
  });

  it('pins the numbers the trial copy promises', async () => {
    // The prompts state specific counts, so those counts are asserted here
    // rather than trusted: prose and predicate must agree.
    const quick = await factsForInput(
      challengeById('sorting-efficient/worst-case')!,
      '[1,2,3,4,5,6,7]',
      load,
    );
    expect(quick.metrics).toEqual({ comparisons: 21, swaps: 0 });

    // The hint's constructive answer — median of each group last — costs 11,
    // which is why the bar is 12 and not the 10 that is theoretically reachable.
    const balanced = await factsForInput(
      challengeById('sorting-efficient/pivot-in-the-middle')!,
      '[1,3,2,5,7,6,4]',
      load,
    );
    expect(balanced.metrics['comparisons']).toBe(11);

    const merge = await factsForInput(
      challengeById('sorting-efficient/merges-best-day')!,
      '[6,5,4,3,2,1]',
      load,
    );
    expect(merge.metrics['comparisons']).toBe(7);
    // "The lesson example takes eleven."
    const mergeExample = await factsForInput(
      challengeById('sorting-efficient/merges-best-day')!,
      '[5,2,9,1,7,3]',
      load,
    );
    expect(mergeExample.metrics['comparisons']).toBe(11);

    const duel = await factsForInput(
      challengeById('sorting-basics/insertions-edge')!,
      '[2,1,3,4,5,6]',
      load,
    );
    expect(duel.metrics['comparisons']).toBe(5);
    expect(duel.rivals['bubble-sort']?.['comparisons']).toBe(9);

    // Three of the fifteen values are reachable in <= 2 comparisons, and no
    // others — the claim "exactly three" in the hint.
    const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const fast: number[] = [];
    for (const target of array) {
      const run = await factsForInput(
        challengeById('binary-search/two-probes')!,
        `[${array.join(',')}] target=${target}`,
        load,
      );
      if ((run.metrics['comparisons'] ?? 0) <= 2) fast.push(target);
    }
    expect(fast).toEqual([4, 8, 12]);
  });
});

describe('finalMetric (the Final Run’s answer)', () => {
  it('reads the last step’s cumulative counter', async () => {
    const algo = await load('bubble-sort')!;
    const trace = algo.run(algo.parseInput('[5,2,9,1,7,3]') as never);
    expect(finalMetric(trace, 'comparisons')).toBe(14);
    expect(finalMetric(trace, 'swaps')).toBe(8);
    // A metric this algorithm never emits is `null`, not 0 — FinalRun.astro
    // fails the build on it rather than asking an unanswerable question.
    expect(finalMetric(trace, 'cacheHits')).toBeNull();
    expect(finalMetric([], 'comparisons')).toBeNull();
  });

  it('answers every pinned Algorithms run with a real number', async () => {
    // One metric per lesson is what a Final Run asks about; each is confirmed to
    // exist on the pinned run, so an authored `metric` prop cannot be a typo
    // that only surfaces on the page.
    const asked: Array<[string, string, string, number]> = [
      ['recursion', 'recursion-callstack', 'calls', 4],
      ['binary-search', 'binary-search', 'comparisons', 3],
      ['sorting-basics', 'bubble-sort', 'comparisons', 14],
      ['sorting-efficient', 'quick-sort', 'comparisons', 9],
      ['graph-traversal', 'bfs', 'visited', 6],
      ['dynamic-programming', 'dp-fib-memoization', 'cacheHits', 4],
    ];
    for (const [lesson, algorithm, metric, expected] of asked) {
      const raw = pinnedInput(lesson, algorithm)!;
      const algo = await load(algorithm)!;
      const trace = algo.run(algo.parseInput(raw) as never);
      expect(finalMetric(trace, metric)).toBe(expected);
    }
  });
});

describe('runFinalStep', () => {
  it('refuses an unknown algorithm id', async () => {
    await expect(runFinalStep('no-such-algo', '[1,2]', load)).rejects.toThrow(
      /Unknown algorithm/,
    );
  });
});

describe('pinned inputs', () => {
  it('are the inputs the lessons actually author', () => {
    // The Final Run computes its answer from PINNED_INPUTS, so a lesson whose
    // <Visualizer> drifts from this map would grade a run nobody can watch.
    // An `input={…}` binding is the post-migration shape and passes: the tag is
    // then reading this very map.
    const bodies = readLessonBodies();
    for (const [key, input] of Object.entries(PINNED_INPUTS)) {
      const [lesson, algorithm] = key.split('/') as [string, string];
      const body = bodies.get(lesson);
      expect(body, `no lesson "${lesson}"`).toBeDefined();
      const tag = findVisualizerInput(body!, algorithm);
      expect(tag.count, `${key}: <Visualizer> tags naming it`).toBe(1);
      if (!tag.expression) expect(tag.input, key).toBe(input);
    }
  });

  it('parse under the algorithm they belong to', async () => {
    for (const [key, input] of Object.entries(PINNED_INPUTS)) {
      const algorithm = key.split('/')[1]!;
      const algo = await load(algorithm)!;
      const parsed = algo.parseInput(input);
      expect(parsed, key).not.toHaveProperty('error');
    }
  });

  it('cover every algorithm a trial is graded on', () => {
    // Without a pinned entry, `validateChallenge` cannot run the
    // not-already-cleared half of its guard — so a missing one would silently
    // weaken the guard rather than fail.
    for (const challenge of CHALLENGES) {
      expect(
        pinnedInput(challenge.lesson, challenge.algorithm),
        challenge.id,
      ).not.toBeNull();
    }
  });

  it('resolves a missing pair to null rather than a default', () => {
    expect(pinnedInput('arrays', 'array-operations')).toBeNull();
  });
});

describe('findVisualizerInput', () => {
  const body = `
<Visualizer algorithm="bubble-sort" renderer="bars" input="[5,2,9,1,7,3]" />

<Visualizer
  algorithm="bfs"
  renderer="graph"
  input="0-1,0-2 target=0"
  inputLabel="Edges"
/>
`;

  it('finds the single tag naming an algorithm, multi-line or not', () => {
    expect(findVisualizerInput(body, 'bubble-sort')).toEqual({
      count: 1,
      input: '[5,2,9,1,7,3]',
      expression: false,
    });
    expect(findVisualizerInput(body, 'bfs').input).toBe('0-1,0-2 target=0');
  });

  it('reports zero and duplicate matches instead of picking one', () => {
    expect(findVisualizerInput(body, 'quick-sort').count).toBe(0);
    const twice = `${body}\n<Visualizer algorithm="bfs" renderer="graph" input="0-1" />`;
    expect(findVisualizerInput(twice, 'bfs').count).toBe(2);
  });

  it('reports an expression binding rather than guessing its value', () => {
    const migrated =
      '<Visualizer algorithm="quick-sort" renderer="bars" input={PINNED_INPUTS["sorting-efficient/quick-sort"]} />';
    expect(findVisualizerInput(migrated, 'quick-sort')).toEqual({
      count: 1,
      input: null,
      expression: true,
    });
  });
});

describe('authored placements', () => {
  // These pass vacuously until the MDX bodies gain the components (authoring is
  // a separate act — see the handoff in the workstream report), and start
  // guarding the moment they do.
  const bodies = readLessonBodies();

  it('every <Challenge id> in a lesson names a trial of THAT lesson', () => {
    for (const [slug, body] of bodies) {
      for (const match of body.matchAll(/<Challenge\b[\s\S]*?\/>/g)) {
        const id = /id=(["'])([^"']+)\1/.exec(match[0])?.[2];
        expect(id, `${slug}: <Challenge> without an id`).toBeDefined();
        const challenge = challengeById(id!);
        expect(challenge, `${slug}: unknown challenge "${id}"`).not.toBeNull();
        expect(challenge!.lesson, `${slug}: trial belongs elsewhere`).toBe(
          slug,
        );
      }
    }
  });

  it('every <FinalRun> asks about a metric its pinned run really emits', async () => {
    for (const [slug, body] of bodies) {
      for (const match of body.matchAll(/<FinalRun\b[\s\S]*?\/>/g)) {
        const tag = match[0];
        const algorithm = /algorithm=(["'])([^"']+)\1/.exec(tag)?.[2];
        const metric = /metric=(["'])([^"']+)\1/.exec(tag)?.[2];
        expect(
          algorithm,
          `${slug}: <FinalRun> without an algorithm`,
        ).toBeDefined();
        expect(metric, `${slug}: <FinalRun> without a metric`).toBeDefined();
        // It must anchor a visualizer the reader can actually watch.
        expect(findVisualizerInput(body, algorithm!).count, slug).toBe(1);
        const raw = pinnedInput(slug, algorithm!);
        expect(raw, `${slug}: no pinned input for ${algorithm}`).not.toBeNull();
        const algo = await load(algorithm!)!;
        const trace = algo.run(algo.parseInput(raw!) as never);
        expect(finalMetric(trace, metric!), `${slug}/${metric}`).not.toBeNull();
      }
    }
  });
});

describe('storage keys', () => {
  it('are exactly the two spec §6 enumerates for this phase', () => {
    expect(CHALLENGES_KEY).toBe('ld:challenges:v1');
    expect(FINAL_RUN_KEY).toBe('ld:finalrun:v1');
    expect(ENRICHMENT_KEYS).toEqual([CHALLENGES_KEY, FINAL_RUN_KEY]);
  });

  it('carry a version in the key, so an unknown shape is ignored by construction', () => {
    for (const key of ENRICHMENT_KEYS) expect(key).toMatch(/:v\d+$/);
  });

  it('include no predict key — the toggle is never persisted at all', () => {
    // The calm invariant, from this module's side: predict has no storage
    // surface anywhere in the product (spec §6).
    for (const key of ENRICHMENT_KEYS) expect(key).not.toMatch(/predict/i);
  });
});
