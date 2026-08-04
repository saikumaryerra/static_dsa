/**
 * Trace Trials and the Final Run — the M8.3 enrichment layer's DATA
 * (`docs/m8-gamification.md` "M8.3 — Enrichment"; site spec §6 keys, §11.3).
 *
 * Three things live here, and they live TOGETHER on purpose:
 *
 * 1. **The trial catalog.** Every challenge is data — id, lesson, algorithm,
 *    title, prompt, hint, rules, witness — so the card, the build-time guard and
 *    any future counter read ONE source. Client code cannot call
 *    `getCollection()`, and an authored MDX prop could not be validated at all.
 * 2. **The predicate DSL and its evaluator.** Five rule kinds, AND-ed, graded
 *    against the FINAL step of a run the reader triggered from the visualizer's
 *    existing custom-input form. The evaluator is a pure function over injected
 *    facts (the harness runs Vitest in `node` with no DOM), which is what lets
 *    the witness guard below be a unit test rather than a hand-broken fixture.
 * 3. **The two enrichment storage keys** (`ld:challenges:v1`, `ld:finalrun:v1`),
 *    because `Challenge.astro` and `FinalRun.astro` would otherwise each grow
 *    their own copy of the same `try/catch` discipline. Same rule as
 *    `src/lib/progress.ts`: one writer per key, never a prefix scan.
 *
 * WHAT THIS MODULE NEVER DOES:
 * - **Re-run the algorithm the reader just ran.** Trials CONSUME the precomputed
 *   trace (spec §11.3: no mechanic may add algorithm logic to the island, the
 *   Player or a renderer) — the island hands over its own final step in the
 *   `viz:run` event and this module only reads it. The one place an algorithm is
 *   executed here is {@link runFinalStep}, used for the BUILD-time witness guard
 *   and for the rival side of a `duel` rule, which by definition is a run the
 *   island never made.
 * - **Award mastery.** Clearing a trial writes `ld:challenges:v1` and nothing
 *   else: `docs/m8-gamification.md` names exactly three Practiced paths (all
 *   practice checks self-graded, a predict session, a cleared Final Run), and a
 *   trial is not one of them. Only `FinalRun.astro` calls `recordPass()`, which
 *   is where the 3-day Mastered gate lives (M8.1 owns it).
 * - **Keep a score.** There is no attempt count, no clear-rate, no "n of N
 *   collected" (the badge cabinet was killed for being exactly that). A trial is
 *   cleared or it is open, and a run that does not clear one costs nothing.
 */
import type { Algorithm, Step, Trace } from '../viz/core/types';

// ---------------------------------------------------------------------------
// The predicate DSL
// ---------------------------------------------------------------------------

/** How a rule compares a run's number against its own target. */
export type CompareOp = 'lte' | 'gte' | 'eq';

/**
 * One condition on a finished run. Rules are AND-ed: every rule of a challenge
 * must hold for the same run.
 *
 * Deliberately five kinds and no boolean algebra. The set covers every trial the
 * design's algorithm audit found authorable (see {@link CHALLENGES}), and each
 * kind is checkable against data the island already has, so adding a sixth
 * should mean a new FACT is available — not that a prompt got cleverer.
 */
export type ChallengeRule =
  /** A cumulative counter on the final step, e.g. `comparisons <= 5`. */
  | { kind: 'metric'; metric: string; op: CompareOp; value: number }
  /** How many numbers the submitted input names, e.g. `inputLen == 6`. */
  | { kind: 'inputLen'; op: CompareOp; value: number }
  /** The run ended on a hit (a terminal state with a `foundIndex`). */
  | { kind: 'found' }
  /** The reader had to keep THIS array and vary something else about the run. */
  | { kind: 'pinnedArray'; array: readonly number[] }
  /**
   * This run's metric beats another algorithm's metric on the SAME input. The
   * rival is run separately (it is a run the island never made); `lt` is the
   * only operator because "beats" is the only question a duel asks.
   */
  | { kind: 'duel'; other: string; metric: string; op: 'lt' };

/**
 * One Trace Trial.
 *
 * `id` is `{lessonSlug}/{challenge-slug}` — LESSON slugs, not algorithm ids, so
 * quick sort's trial is `sorting-efficient/worst-case`. That is the exact shape
 * `ld:challenges:v1` stores, and the reason it must be the lesson: an id keyed
 * by algorithm would silently merge two lessons that happen to share a
 * visualization (`docs/m8-gamification.md`, data model).
 */
export interface Challenge {
  /** `{lessonSlug}/{challenge-slug}`; also the storage id. */
  id: string;
  /** The lesson this trial belongs to — always `id`'s first segment. */
  lesson: string;
  /** Registry algorithm id whose run can clear it, e.g. `quick-sort`. */
  algorithm: string;
  /**
   * The named title, e.g. "Worst Case Scenario". These names ARE the identity
   * payoff the killed badge cabinet would have carried
   * (`docs/m8-gamification.md`, designed-and-killed) — which is why they are
   * written as achievements rather than as instructions.
   */
  title: string;
  /** What to craft, in one sentence. Never timed, never scored. */
  prompt: string;
  /**
   * The always-present hint. Not a reward and not rationed: a trial the reader
   * cannot get into is not a learning act, and hiding the hint behind attempts
   * would price the first wrong try — the thing the design refuses to do.
   */
  hint: string;
  /** Conditions on the final step; AND-ed, never empty. */
  rules: readonly ChallengeRule[];
  /**
   * An input that really does satisfy `rules`, in the exact form the reader
   * types into the visualizer's custom-input box.
   *
   * It is the trial's own proof of solvability: {@link validateChallenge} runs it
   * at build time (and over the whole catalog in CI), so an unsolvable trial
   * cannot ship. It is never shown to the reader.
   */
  witness: string;
}

// ---------------------------------------------------------------------------
// The catalog
//
// AUDITED PER ALGORITHM, as `docs/m8-gamification.md` requires ("trials authored
// only where the metric exists"). What the audit decided:
// - `merge-sort` exposes comparisons ONLY (no swaps metric), so its trial is
//   comparison-shaped — which turns out to be the better trial anyway.
// - `bfs`/`dfs` expose only `visited`, and no rule can constrain how big the
//   graph WAS. Every honest prompt there ("reach only part of the graph") would
//   be clearable by simply drawing a graph of that size, so lesson 14 gets no
//   trial: its enrichment is the Final Run. Under-checking a stricter prompt
//   would be worse than shipping nothing.
// - Every trial below is verified twice by `tests/unit/challenges.test.ts`: its
//   witness clears it, and the lesson's OWN pinned example does NOT — a trial the
//   authored input already satisfies is cleared by pressing Run, which teaches
//   nothing and would hand out a "cleared" the reader never earned.
// ---------------------------------------------------------------------------

/**
 * Every Trace Trial, in curriculum order.
 *
 * Written as a plain data literal with no side effects so a bundler can drop it
 * from the client chunk, and kept droppable by what the card does: it serialises
 * only the ONE trial it renders into a data attribute, and its script imports
 * the evaluator — never this array, and never the two lookups below that close
 * over it. Re-check that when adding a client import from this module.
 */
export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'recursion/base-case-only',
    lesson: 'recursion',
    algorithm: 'recursion-callstack',
    title: 'Straight to the Base Case',
    prompt:
      'Find an n where factorial makes exactly one call — answered on the spot, with no recursion at all.',
    hint: 'factorial stops when n is 1 or less and returns without calling itself. Two values of n hit that on the very first call.',
    // factorial(0) and factorial(1) both emit `calls: 1`; the lesson's pinned
    // n = 4 emits 4.
    rules: [{ kind: 'metric', metric: 'calls', op: 'eq', value: 1 }],
    witness: '0',
  },
  {
    id: 'binary-search/two-probes',
    lesson: 'binary-search',
    algorithm: 'binary-search',
    title: 'Two Probes, Fifteen Doors',
    prompt:
      'Keep this fifteen-number array and choose a target binary search finds in two comparisons or fewer.',
    hint: 'The first probe is always the middle. If it misses, the second is the middle of whichever half survives — so exactly three of the fifteen values are reachable that fast.',
    // Verified: indices 7 (1 comparison), 3 and 11 (2) — and nothing else.
    rules: [
      {
        kind: 'pinnedArray',
        array: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      },
      { kind: 'found' },
      { kind: 'metric', metric: 'comparisons', op: 'lte', value: 2 },
    ],
    witness: '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] target=4',
  },
  {
    id: 'binary-search/every-door',
    lesson: 'binary-search',
    algorithm: 'linear-search',
    title: 'Every Door Opened',
    prompt:
      'Make linear search examine all ten items of a ten-number array before it stops.',
    hint: 'Linear search stops the moment it finds the target. Give it something it can only settle after the last item.',
    // Verified: a missing target (or the final element) costs all 10.
    rules: [
      { kind: 'inputLen', op: 'eq', value: 10 },
      { kind: 'metric', metric: 'comparisons', op: 'gte', value: 10 },
    ],
    witness: '[1,2,3,4,5,6,7,8,9,10] target=99',
  },
  {
    id: 'sorting-basics/one-clean-pass',
    lesson: 'sorting-basics',
    algorithm: 'bubble-sort',
    title: 'One Clean Pass',
    prompt:
      'Get bubble sort through six numbers in five comparisons — a single pass and out.',
    hint: 'Bubble sort quits early when a pass makes no swaps at all. What input lets the very first pass be that pass?',
    // Verified: [1,2,3,4,5,6] → 5 comparisons, 0 swaps; the lesson's pinned
    // [5,2,9,1,7,3] → 14 comparisons.
    rules: [
      { kind: 'inputLen', op: 'eq', value: 6 },
      { kind: 'metric', metric: 'comparisons', op: 'lte', value: 5 },
    ],
    witness: '[1,2,3,4,5,6]',
  },
  {
    id: 'sorting-basics/no-shortcuts',
    lesson: 'sorting-basics',
    algorithm: 'selection-sort',
    title: 'No Shortcuts',
    prompt:
      'Find six numbers selection sort finishes without a single swap — then look at how many comparisons it still made.',
    hint: 'Selection sort scans the whole remaining array on every pass whatever it finds there. Only the swap is ever skippable.',
    // Verified: sorted input still costs the full 15 comparisons — selection
    // sort has no best case, which is the reveal. The pinned [5,2,9,1,7,3] also
    // makes 15 comparisons but 2 swaps, so it cannot clear this.
    rules: [
      { kind: 'inputLen', op: 'eq', value: 6 },
      { kind: 'metric', metric: 'comparisons', op: 'gte', value: 15 },
      { kind: 'metric', metric: 'swaps', op: 'eq', value: 0 },
    ],
    witness: '[1,2,3,4,5,6]',
  },
  {
    id: 'sorting-basics/insertions-edge',
    lesson: 'sorting-basics',
    algorithm: 'insertion-sort',
    title: "Insertion's Edge",
    prompt:
      'Find six numbers where insertion sort makes fewer comparisons than bubble sort does on the same array — and stays at six comparisons or fewer itself.',
    hint: 'Insertion sort stops shifting as soon as the value to its left is smaller. Nearly sorted input plays to that; perfectly sorted input lets bubble sort tie it.',
    // Verified: [2,1,3,4,5,6] → insertion 5 vs bubble 9. The tie the hint names
    // is real — [1,2,3,4,5,6] is 5 vs 5, which the `lt` duel does not clear.
    rules: [
      { kind: 'inputLen', op: 'eq', value: 6 },
      { kind: 'metric', metric: 'comparisons', op: 'lte', value: 6 },
      { kind: 'duel', other: 'bubble-sort', metric: 'comparisons', op: 'lt' },
    ],
    witness: '[2,1,3,4,5,6]',
  },
  {
    id: 'sorting-efficient/worst-case',
    lesson: 'sorting-efficient',
    algorithm: 'quick-sort',
    title: 'Worst Case Scenario',
    prompt:
      'Find seven numbers that cost quick sort 21 comparisons — the most it can ever make on seven — while it performs not one swap.',
    hint: 'This partition takes the LAST element as its pivot. What ordering makes that pivot the largest value in every partition it ever forms?',
    // Verified: [1,2,3,4,5,6,7] → 21 comparisons AND 0 swaps. The twin reveal is
    // the point — already-sorted input is quick sort's worst case, and the zero
    // comes from both self-swap guards (`i !== j` in the scan, `i !== hi` on
    // pivot placement), so nothing moves while everything is compared.
    rules: [
      { kind: 'inputLen', op: 'eq', value: 7 },
      { kind: 'metric', metric: 'comparisons', op: 'gte', value: 21 },
      { kind: 'metric', metric: 'swaps', op: 'eq', value: 0 },
    ],
    witness: '[1,2,3,4,5,6,7]',
  },
  {
    id: 'sorting-efficient/pivot-in-the-middle',
    lesson: 'sorting-efficient',
    algorithm: 'quick-sort',
    title: 'Pivot in the Middle',
    prompt:
      'Now the other end of the same algorithm: sort seven numbers with quick sort in twelve comparisons or fewer.',
    hint: 'The pivot is the last element of each partition. Put the middle value of a group at the end of it and the split comes out even — do that for the whole array, then for each half.',
    // Verified: 10 is the floor for seven distinct values, and the hint's own
    // constructive answer — median of each group placed last, [1,3,2,5,7,6,4] —
    // makes 11, because placing the pivot re-orders the half behind it. The bar
    // is 12 precisely so the reasoning the hint teaches clears it; a bar of 10
    // would demand a search rather than an idea.
    rules: [
      { kind: 'inputLen', op: 'eq', value: 7 },
      { kind: 'metric', metric: 'comparisons', op: 'lte', value: 12 },
    ],
    witness: '[1,3,2,5,7,6,4]',
  },
  {
    id: 'sorting-efficient/merges-best-day',
    lesson: 'sorting-efficient',
    algorithm: 'merge-sort',
    title: "Merge's Best Day",
    prompt:
      'Sort six numbers with merge sort in eight comparisons or fewer. The lesson example takes eleven.',
    hint: 'A merge stops comparing the moment one side runs out and copies the rest for free. Which arrangement makes every merge run out as early as possible?',
    // Comparison-shaped because merge sort exposes no swaps metric (the audit
    // note above). Verified: [6,5,4,3,2,1] → 7, the reversed input that is
    // bubble and insertion sort's worst case; the pinned [5,2,9,1,7,3] → 11.
    rules: [
      { kind: 'inputLen', op: 'eq', value: 6 },
      { kind: 'metric', metric: 'comparisons', op: 'lte', value: 8 },
    ],
    witness: '[6,5,4,3,2,1]',
  },
  {
    id: 'dynamic-programming/cache-earns-its-keep',
    lesson: 'dynamic-programming',
    algorithm: 'dp-fib-memoization',
    title: 'The Cache Earns Its Keep',
    prompt: 'Push memoized Fibonacci to eight cache hits or more.',
    hint: 'Every subproblem below the top is asked for twice — once computed, once served from the table. The bigger n is, the more reuse there is to find.',
    // Verified: cache hits are n - 2 for n >= 2, so n = 10 gives 8; the lesson's
    // pinned n = 6 gives 4.
    rules: [{ kind: 'metric', metric: 'cacheHits', op: 'gte', value: 8 }],
    witness: '10',
  },
  {
    id: 'dynamic-programming/nothing-to-add',
    lesson: 'dynamic-programming',
    algorithm: 'dp-fib-tabulation',
    title: 'Nothing Left to Add',
    prompt: 'Find an n where the table is filled without a single addition.',
    hint: 'dp[0] and dp[1] are written down as base cases, not computed. Which n is already answered by those two alone?',
    // Verified: additions are n - 1 for n >= 1 and 0 at n = 0, so n = 0 and
    // n = 1 both qualify; the pinned n = 6 makes 5.
    rules: [{ kind: 'metric', metric: 'additions', op: 'eq', value: 0 }],
    witness: '1',
  },
];

/**
 * The trials of one lesson, in catalog order.
 *
 * @param lesson - Lesson slug, e.g. `sorting-efficient`.
 * @returns Its challenges; `[]` for a lesson with none.
 */
export function challengesFor(lesson: string): Challenge[] {
  return CHALLENGES.filter((challenge) => challenge.lesson === lesson);
}

/**
 * One challenge by id.
 *
 * @param id - `{lessonSlug}/{challenge-slug}`.
 * @returns The challenge, or `null` when nothing has that id (the component
 * turns that `null` into a build failure — an authored typo must never render a
 * card that can't be cleared).
 */
export function challengeById(id: string): Challenge | null {
  return CHALLENGES.find((challenge) => challenge.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Pinned inputs — the one place a lesson's authored `<Visualizer input>` lives
// ---------------------------------------------------------------------------

/**
 * The input string each lesson's visualizer is pinned to, keyed
 * `{lessonSlug}/{algorithmId}`.
 *
 * WHY THIS EXISTS: `FinalRun.astro` computes its answer at build time from the
 * run the reader can actually watch, and an Astro component cannot read a
 * sibling MDX component's props. Rather than assert agreement after the fact,
 * this module holds the string and BOTH sides read it — the MDX
 * `<Visualizer input={…}>` and the Final Run — so divergence is impossible by
 * construction (`docs/m8-gamification.md`, M8.3).
 *
 * Until the MDX bodies are migrated to import from here, the values below are
 * the ones authored inline, and `tests/unit/challenges.test.ts` reads the `.mdx`
 * files and fails if any of them drifts — so the guarantee holds in CI from the
 * moment this lands, not from the moment the migration finishes.
 *
 * Algorithms track only: these are the lessons that host Trials and Final Runs.
 */
export const PINNED_INPUTS: Readonly<Record<string, string>> = {
  'recursion/recursion-callstack': '4',
  'binary-search/binary-search': '[1,3,5,7,9,11] target=7',
  'binary-search/linear-search': '[8,3,5,9,1,7] target=9',
  'sorting-basics/bubble-sort': '[5,2,9,1,7,3]',
  'sorting-basics/selection-sort': '[5,2,9,1,7,3]',
  'sorting-basics/insertion-sort': '[5,2,9,1,7,3]',
  'sorting-efficient/merge-sort': '[5,2,9,1,7,3]',
  'sorting-efficient/quick-sort': '[5,2,9,1,7,3]',
  'graph-traversal/bfs': '0-1,0-2,1-3,2-3,3-4,4-5 target=0',
  'graph-traversal/dfs': '0-1,0-2,1-3,2-3,3-4,4-5 target=0',
  'dynamic-programming/dp-fib-tabulation': '6',
  'dynamic-programming/dp-fib-memoization': '6',
};

/**
 * The pinned input for one lesson's visualizer.
 *
 * @param lesson - Lesson slug.
 * @param algorithm - Registry algorithm id.
 * @returns The exact authored input string, or `null` when that pair has none
 * (callers that need one — the Final Run — fail the build on `null` rather than
 * guessing a default that would grade against a different run).
 */
export function pinnedInput(lesson: string, algorithm: string): string | null {
  return PINNED_INPUTS[`${lesson}/${algorithm}`] ?? null;
}

/**
 * What a `<Visualizer>` tag in a lesson body says about one algorithm — the pure
 * half of the "the Final Run grades the run you can watch" guarantee.
 *
 * Text matching rather than parsing, and that is a deliberate ceiling: it exists
 * to catch DRIFT between {@link PINNED_INPUTS} and the MDX, so it must be
 * conservative. An `input={…}` binding is reported as an expression rather than
 * guessed at, because after the migration that is exactly what a correct lesson
 * looks like.
 *
 * @param body - Raw MDX source of one lesson.
 * @param algorithm - Registry algorithm id to look for.
 * @returns How many tags name that algorithm, plus the single match's literal
 * input (`null` when it has none or binds an expression).
 */
export function findVisualizerInput(
  body: string,
  algorithm: string,
): { count: number; input: string | null; expression: boolean } {
  const tags = [...body.matchAll(/<Visualizer\b([\s\S]*?)\/>/g)].map(
    (match) => match[1] ?? '',
  );
  const mine = tags.filter((attrs) =>
    new RegExp(`algorithm=(["'])${algorithm}\\1`).test(attrs),
  );
  const only = mine.length === 1 ? mine[0]! : '';
  const literal = /input=(["'])([\s\S]*?)\1/.exec(only);
  return {
    count: mine.length,
    input: literal?.[2] ?? null,
    expression: mine.length === 1 && /input=\{/.test(only),
  };
}

// ---------------------------------------------------------------------------
// The run a trial is graded against
// ---------------------------------------------------------------------------

/**
 * The event the visualizer island dispatches after a SUCCESSFUL custom run
 * (spec §11.3, M8 amendment). Bubbling, so a card anywhere below the island
 * hears it on `document`.
 *
 * Named here rather than in the island because two components consume it and
 * one dispatches it; a retyped string literal is how those three drift apart.
 */
export const VIZ_RUN_EVENT = 'viz:run';

/** The `detail` of a {@link VIZ_RUN_EVENT}. */
export interface VizRunDetail {
  /** Registry algorithm id of the island that ran. */
  algorithmId: string;
  /** The RAW string the reader submitted, exactly as `parseInput` received it. */
  input: string;
  /** The last step of the trace the island just computed — never a second run. */
  finalStep: Step<unknown>;
}

/**
 * Everything a rule may ask about one finished run. Injected rather than read,
 * so {@link evaluateRules} stays pure and testable in the `node` harness.
 */
export interface RunFacts {
  /** Which algorithm produced it. */
  algorithm: string;
  /** Cumulative counters from the final step; finite numbers only. */
  metrics: Readonly<Record<string, number>>;
  /** The numbers the submitted input named, or `null` when it named no list. */
  inputArray: readonly number[] | null;
  /** The terminal hit index, or `null` for a run that ended without one. */
  foundIndex: number | null;
  /** Rival algorithms' metrics on the SAME input (duel rules only). */
  rivals: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/**
 * The numbers inside the first `[…]` of an input string.
 *
 * Every array-shaped `parseInput` in `src/viz/algorithms` accepts exactly this
 * literal, so reading it back is how `inputLen` and `pinnedArray` learn what the
 * reader submitted without this module knowing any algorithm's typed shape.
 *
 * @param raw - A submitted input string, e.g. `"[5,2,9] target="`.
 * @returns The whole numbers listed, `[]` for `"[]"`, or `null` when there is no
 * bracketed list or any entry is not a whole number — a graph or `n` input, or a
 * malformed one, each of which means "this run has no array to talk about".
 */
export function parseArrayLiteral(raw: string): number[] | null {
  const match = /\[([^\]]*)\]/.exec(raw);
  if (!match) return null;
  const inner = match[1]!.trim();
  if (inner.length === 0) return [];
  const values: number[] = [];
  for (const token of inner.split(',')) {
    const text = token.trim();
    if (!/^-?\d+$/.test(text)) return null;
    values.push(Number(text));
  }
  return values;
}

/**
 * The final step's counters, with anything unusable dropped.
 *
 * @param step - The last step of a trace.
 * @returns Finite numbers only, so a `NaN` sneaking in fails its rule instead of
 * making every comparison against it quietly false in an unpredictable place.
 */
export function metricsOf(step: Step<unknown>): Record<string, number> {
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(step.metrics ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
  }
  return clean;
}

/**
 * The terminal hit index of a run, if its state has one.
 *
 * Read from the state's own `foundIndex` (binary and linear search both carry
 * it) rather than from a `found` highlight, which the sorts also emit — over the
 * whole array, on the last step, to mean "sorted". Grading `found` off a
 * highlight would therefore make every completed sort a "hit".
 *
 * @param step - The last step of a trace.
 * @returns The index, or `null` when the state carries no such field or the run
 * ended without a hit.
 */
function foundIndexOf(step: Step<unknown>): number | null {
  const state = step.state;
  if (typeof state !== 'object' || state === null) return null;
  const found = (state as { foundIndex?: unknown }).foundIndex;
  return typeof found === 'number' && found >= 0 ? found : null;
}

/**
 * Facts for a run the island already computed.
 *
 * @param detail - The `viz:run` payload.
 * @param rivals - Rival metrics for duel rules; `{}` when there are none.
 * @returns The facts {@link evaluateRules} grades against.
 */
export function factsFrom(
  detail: VizRunDetail,
  rivals: Readonly<Record<string, Readonly<Record<string, number>>>> = {},
): RunFacts {
  return {
    algorithm: detail.algorithmId,
    metrics: metricsOf(detail.finalStep),
    inputArray: parseArrayLiteral(detail.input),
    foundIndex: foundIndexOf(detail.finalStep),
    rivals,
  };
}

/** Applies one comparison operator. */
function compare(actual: number, op: CompareOp, value: number): boolean {
  if (op === 'lte') return actual <= value;
  if (op === 'gte') return actual >= value;
  return actual === value;
}

/**
 * Does this run clear these rules? Pure — the whole DSL in one function.
 *
 * Rules are AND-ed, and an EMPTY rule list is `false`: a challenge with no
 * conditions would be cleared by any run at all, so the degenerate case fails
 * closed (the catalog test also asserts no challenge ships empty rules).
 *
 * Every missing fact is a `false`, never a throw: this runs inside an island on
 * data that crossed an event boundary, and a trial that cannot be graded is
 * simply still open.
 *
 * @param rules - The challenge's conditions.
 * @param facts - Facts for one finished run.
 * @returns True only when every rule holds.
 */
export function evaluateRules(
  rules: readonly ChallengeRule[],
  facts: RunFacts,
): boolean {
  if (rules.length === 0) return false;
  return rules.every((rule) => {
    switch (rule.kind) {
      case 'metric': {
        const actual = facts.metrics[rule.metric];
        return actual === undefined
          ? false
          : compare(actual, rule.op, rule.value);
      }
      case 'inputLen':
        return facts.inputArray === null
          ? false
          : compare(facts.inputArray.length, rule.op, rule.value);
      case 'found':
        return facts.foundIndex !== null;
      case 'pinnedArray': {
        const array = facts.inputArray;
        if (array === null || array.length !== rule.array.length) return false;
        return rule.array.every((value, i) => array[i] === value);
      }
      case 'duel': {
        const mine = facts.metrics[rule.metric];
        const theirs = facts.rivals[rule.other]?.[rule.metric];
        return mine === undefined || theirs === undefined
          ? false
          : mine < theirs;
      }
      default:
        // Unreachable for a well-typed catalog; a rule kind added to the union
        // without a case here fails closed rather than clearing everything.
        return false;
    }
  });
}

/**
 * The algorithms a challenge needs a rival run from.
 *
 * @param rules - The challenge's conditions.
 * @returns Unique rival ids, in first-mention order; `[]` for a challenge with
 * no duel rule (which is what lets the card skip loading the registry at all).
 */
export function rivalIds(rules: readonly ChallengeRule[]): string[] {
  const ids: string[] = [];
  for (const rule of rules) {
    if (rule.kind === 'duel' && !ids.includes(rule.other)) ids.push(rule.other);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Metric words — one vocabulary for the trial status line and the Final Run's
// question, so the two can never name the same counter differently.
// ---------------------------------------------------------------------------

/** Singular/plural for each counter the instrumented algorithms emit. */
const METRIC_WORDS: Readonly<Record<string, { one: string; many: string }>> = {
  comparisons: { one: 'comparison', many: 'comparisons' },
  swaps: { one: 'swap', many: 'swaps' },
  visited: { one: 'node visited', many: 'nodes visited' },
  calls: { one: 'call', many: 'calls' },
  maxDepth: { one: 'level deep', many: 'levels deep' },
  cacheHits: { one: 'cache hit', many: 'cache hits' },
  additions: { one: 'addition', many: 'additions' },
  shifts: { one: 'shift', many: 'shifts' },
  hops: { one: 'hop', many: 'hops' },
  collisions: { one: 'collision', many: 'collisions' },
};

/**
 * The plural noun for one metric, e.g. `cacheHits` → "cache hits".
 *
 * @param metric - Metric key as the algorithm emits it.
 * @returns Its plural name; the key itself for a metric with no entry (every
 * such key in this codebase is already a plural noun — `pushes`, `enqueues`).
 */
export function metricNoun(metric: string): string {
  return METRIC_WORDS[metric]?.many ?? metric;
}

/**
 * One run's counters as a phrase, e.g. `"9 comparisons, 4 swaps"`.
 *
 * ACTIVITY, never accuracy: it reports what the run did, in the algorithm's own
 * units. It may never grow a ratio, a percentage or a "best so far"
 * (`docs/m8-gamification.md`, calm invariants) — a score during a learning act
 * makes beginners protect the number instead of experimenting, which is the one
 * behaviour a crafting puzzle cannot survive.
 *
 * @param metrics - The final step's counters.
 * @returns The phrase, or `''` when there are none to report.
 */
export function metricsSentence(
  metrics: Readonly<Record<string, number>>,
): string {
  return Object.entries(metrics)
    .map(([key, value]) => {
      const words = METRIC_WORDS[key];
      if (!words) return `${value} ${key}`;
      return `${value} ${value === 1 ? words.one : words.many}`;
    })
    .join(', ');
}

/**
 * The value of one metric on a trace's final step — the Final Run's answer.
 *
 * @param trace - A completed trace.
 * @param metric - Metric key, e.g. `comparisons`.
 * @returns The final cumulative value, or `null` when the trace is empty or
 * never emitted that metric (`FinalRun.astro` fails the build on `null`, so an
 * authored question can never be one the run does not answer).
 */
export function finalMetric(
  trace: Trace<unknown>,
  metric: string,
): number | null {
  const last = trace[trace.length - 1];
  if (!last) return null;
  return metricsOf(last)[metric] ?? null;
}

// ---------------------------------------------------------------------------
// Build-time validation (also the CI regression for the build guard)
// ---------------------------------------------------------------------------

/**
 * How the validator reaches an algorithm. Injected rather than imported so this
 * module stays free of the registry — `Challenge.astro` passes the registry's
 * own lazy thunks (the Visualizer-still pattern), and the unit test passes the
 * same map without the module ever depending on it.
 */
export type AlgorithmLoader = (
  id: string,
) => Promise<Algorithm<unknown, unknown>> | undefined;

/**
 * Runs one algorithm on one raw input and returns the final step.
 *
 * The ONLY place this module executes an algorithm, and never for a run the
 * island already made: build-time witness checks, and the rival half of a duel.
 *
 * @param algorithm - Registry algorithm id.
 * @param raw - The input string to parse.
 * @param load - Thunk resolver.
 * @returns The last step of the resulting trace.
 * @throws If the id is unknown, the input does not parse, or the trace is empty
 * — all three are authoring mistakes that must stop a build rather than render a
 * trial nobody can clear.
 */
export async function runFinalStep(
  algorithm: string,
  raw: string,
  load: AlgorithmLoader,
): Promise<Step<unknown>> {
  const algo = await load(algorithm);
  if (!algo) throw new Error(`Unknown algorithm "${algorithm}".`);
  const parsed = algo.parseInput(raw);
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    throw new Error(
      `Input "${raw}" was rejected by "${algorithm}": ${(parsed as { error: string }).error}`,
    );
  }
  const trace = algo.run(parsed);
  const last = trace[trace.length - 1];
  if (!last) throw new Error(`"${algorithm}" produced an empty trace.`);
  return last;
}

/**
 * Facts for running one challenge's algorithm — plus any rival it duels — on a
 * given input.
 *
 * @param challenge - The trial being checked.
 * @param raw - The input to run.
 * @param load - Thunk resolver.
 * @returns Facts for that run, rivals resolved.
 */
export async function factsForInput(
  challenge: Challenge,
  raw: string,
  load: AlgorithmLoader,
): Promise<RunFacts> {
  const finalStep = await runFinalStep(challenge.algorithm, raw, load);
  const rivals: Record<string, Record<string, number>> = {};
  for (const id of rivalIds(challenge.rules)) {
    rivals[id] = metricsOf(await runFinalStep(id, raw, load));
  }
  return factsFrom(
    { algorithmId: challenge.algorithm, input: raw, finalStep },
    rivals,
  );
}

/**
 * Proves a trial is worth shipping. Throws — the build guard
 * (`docs/m8-gamification.md`: "an unsolvable challenge fails the build").
 *
 * Two assertions, and the second is as load-bearing as the first:
 * 1. the `witness` really does clear the rules, so no reader can meet a puzzle
 *    with no solution;
 * 2. the lesson's own pinned example does NOT clear them, so no trial is handed
 *    out by pressing Run on the input the page already shows.
 *
 * Called by `Challenge.astro` at build time for the card it renders, and by
 * `tests/unit/challenges.test.ts` for the whole catalog — which is how the guard
 * is regression-tested in CI without committing a deliberately broken fixture.
 *
 * @param challenge - The trial to check.
 * @param load - Thunk resolver.
 * @throws With the failing id and input named, on either count.
 */
export async function validateChallenge(
  challenge: Challenge,
  load: AlgorithmLoader,
): Promise<void> {
  const witness = await factsForInput(challenge, challenge.witness, load);
  if (!evaluateRules(challenge.rules, witness)) {
    throw new Error(
      `Challenge "${challenge.id}" is unsolvable: its witness "${challenge.witness}" does not satisfy its own rules (${metricsSentence(witness.metrics) || 'no metrics'}).`,
    );
  }
  const pinned = pinnedInput(challenge.lesson, challenge.algorithm);
  if (pinned === null) return;
  const example = await factsForInput(challenge, pinned, load);
  if (evaluateRules(challenge.rules, example)) {
    throw new Error(
      `Challenge "${challenge.id}" is already cleared by the lesson's own example "${pinned}" — a trial the authored input satisfies is cleared by pressing Run.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Storage (spec §6 progress keys)
//
// Both keys are PROGRESS keys, so the reset-progress control must clear them —
// which is what {@link resetEnrichment} is for. `src/lib/progress.ts` owns that
// delete list, and calling this from `resetProgress()` is the one-line handoff
// M8.3 leaves it (the module comment there already names these two keys as
// joining the list "when those phases land"). UNTIL THAT CALL EXISTS, a reader
// who resets progress keeps their cleared trials and Final Runs — a real spec §6
// gap, and the reason this function is exported rather than kept private.
//
// Same discipline as that module: version in the KEY (an incompatible shape
// moves to `v2` and this reader ignores the unknown version by construction),
// every access `try/catch`-guarded, never a prefix scan, and one writer per key
// — `Challenge.astro` for the first, `FinalRun.astro` for the second.
// ---------------------------------------------------------------------------

/** Cleared Trace Trials: `{ "sorting-efficient/worst-case": 1 }`. */
export const CHALLENGES_KEY = 'ld:challenges:v1';

/** Cleared Final Runs: `{ "binary-search": { c: 1 } }`. Cleared-only — there is
 * deliberately no attempt count and no first-try flag (killed: loss-framing the
 * errorful first attempt destroys the testing-effect value it decorates). */
export const FINAL_RUN_KEY = 'ld:finalrun:v1';

/**
 * Every key this module writes — the list the reset control clears.
 *
 * Exported so the invariant "no mechanic here has a hidden storage surface" is
 * assertable: notably the Predict toggle appears in NO list anywhere, because it
 * is never persisted at all (spec §6).
 */
export const ENRICHMENT_KEYS = [CHALLENGES_KEY, FINAL_RUN_KEY] as const;

/**
 * `localStorage`, or `null` when it is unavailable.
 *
 * Deliberately a second copy of `src/lib/progress.ts`'s private helper rather
 * than an import: that one is not exported, and both failure shapes must be
 * handled identically — an absent global (the build's Node pass, some privacy
 * modes) and a getter that throws (blocked storage).
 */
function getStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads and parses one key as a plain object; `{}` for anything unusable. */
function readMap(key: string): Record<string, unknown> {
  const store = getStore();
  if (!store) return {};
  try {
    const raw = store.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    // Blocked storage, or a value another tab or a hand edit left malformed.
    // "Nothing cleared" is the honest degradation: the reader can clear it
    // again, and nothing on screen claims progress that isn't there.
    return {};
  }
}

/**
 * Merges one entry into a stored map, keeping every other entry verbatim.
 *
 * Read-modify-write rather than overwrite: an older bundle in another tab must
 * not drop trials this one has never heard of, and neither must a newer one.
 *
 * @returns True only if the write landed, so a caller never announces a save a
 * blocked store refused.
 */
function writeEntry(key: string, id: string, value: unknown): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    const map = readMap(key);
    map[id] = value;
    store.setItem(key, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/**
 * Has this trial been cleared on this device?
 *
 * @param id - `{lessonSlug}/{challenge-slug}`.
 * @returns True only for an explicit stored `1`; false when storage is
 * unavailable, so a blocked store shows an open trial rather than a wrong one.
 */
export function isChallengeCleared(id: string): boolean {
  return readMap(CHALLENGES_KEY)[id] === 1;
}

/**
 * Records a cleared trial. Nothing ever un-clears one: no trial decays, and only
 * the reset control removes it.
 *
 * @param id - `{lessonSlug}/{challenge-slug}`.
 * @returns Whether the write landed.
 */
export function markChallengeCleared(id: string): boolean {
  return writeEntry(CHALLENGES_KEY, id, 1);
}

/**
 * Has this lesson's Final Run been cleared on this device?
 *
 * @param slug - Lesson slug.
 * @returns True only for a stored `{ c: 1 }`.
 */
export function isFinalRunCleared(slug: string): boolean {
  const entry = readMap(FINAL_RUN_KEY)[slug];
  return (
    typeof entry === 'object' &&
    entry !== null &&
    (entry as { c?: unknown }).c === 1
  );
}

/**
 * Records a cleared Final Run.
 *
 * The record is cleared-only, by design: no attempt count, no first-try flag,
 * nothing that could later be rendered as a score. Promotion to Practiced is
 * NOT done here — `FinalRun.astro` calls `recordPass()` in `progress.ts`, which
 * owns the 3-day Mastered gate and is the single promotion path.
 *
 * @param slug - Lesson slug.
 * @returns Whether the write landed.
 */
export function markFinalRunCleared(slug: string): boolean {
  return writeEntry(FINAL_RUN_KEY, slug, { c: 1 });
}

/**
 * Removes both enrichment keys — the delete half, shipped with the read half so
 * this data is never one-way.
 *
 * Called by the reset-progress control through `src/lib/progress.ts`. Per-key
 * `try/catch`: one blocked key must not strand the other.
 *
 * @returns How many keys were actually removed (0 when storage is unavailable).
 */
export function resetEnrichment(): number {
  const store = getStore();
  if (!store) return 0;
  let removed = 0;
  for (const key of ENRICHMENT_KEYS) {
    try {
      if (store.getItem(key) === null) continue;
      store.removeItem(key);
      removed += 1;
    } catch {
      // Blocked per call; keep going so the other key still clears.
    }
  }
  return removed;
}
