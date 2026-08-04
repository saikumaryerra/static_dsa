/**
 * Predict-the-Step question builders shared by more than one algorithm (M8.2,
 * site spec §11.2 `predictStep`).
 *
 * WHY A SHARED MODULE: two families ask the *same* question under the *same*
 * grading rule — the adjacent-swap sorts ("do these two swap next?") and the two
 * traversals ("which node comes off the frontier next?"). One copy of each rule
 * is what stops bubble and insertion (or BFS and DFS) from drifting into two
 * subtly different graders. Binary search's question reads its own state shape,
 * so it stays in `binary-search.ts`.
 *
 * Every export here is PURE: it reads the trace the Player already holds and
 * returns a question. No DOM, no timers, no storage, no second run of the
 * algorithm — predict mode consumes the precomputed trace rather than forking
 * the pipeline (CLAUDE.md hard constraints).
 *
 * Traces are typed `Trace<unknown>` because neither rule reads `state`: the swap
 * rule reads the `swaps` metric, the traversal rule reads highlights. Every
 * concrete `Trace<TState>` is assignable to it, so each algorithm keeps its own
 * typed `predictStep` signature.
 */
import type { PredictQuestion, Step, Trace } from '../core/types';

/** The two answers an adjacent-swap compare can have; index 0 is "Swap". */
const SWAP_CHOICES = ['Swap', 'No swap'];

/**
 * Matches a node element id (`ids.ts` `nodeId`, e.g. `"n5"`) and NOTHING else —
 * in particular not an edge id (`edgeId`, e.g. `"e2_5"`), which a discovery step
 * carries as a second `active` highlight.
 */
const NODE_ID = /^n\d+$/;

/** The first `active` highlight's first id, or `null` when the step has none. */
function firstActiveId(step: Step<unknown>): string | null {
  const active = (step.highlights ?? []).find((h) => h.kind === 'active');
  return active?.ids[0] ?? null;
}

/** `"n5"` → `5`. Only ever called on an id that already matched {@link NODE_ID}. */
const nodeNumber = (id: string): number => Number(id.slice(1));

/**
 * "Do these two values swap in the next step?" — the generic question an
 * ADJACENT-swap sort gets for free, graded from the cumulative `swaps` metric
 * delta between this step and the next.
 *
 * ONLY VALID for bubble and insertion sort, where a swap step immediately
 * follows its own compare. Quick sort and selection sort defer their swap until
 * after the LAST compare of a partition/pass, so this same delta would grade
 * "Swap" on a compare that did not swap and mark a correct learner wrong — they
 * deliberately expose no `predictStep` at all (see `docs/m8-gamification.md`
 * M8.2; their unit specs regression-test the deferral). Merge sort has no
 * `swaps` metric, so the metric guard below returns `null` for it anyway.
 *
 * Returns `null` on the last step (no successor) and on any step that is not a
 * compare — a wrong answer here is a fine outcome, but an unanswerable question
 * is not.
 */
export function predictAdjacentSwap(
  trace: Trace<unknown>,
  i: number,
): PredictQuestion | null {
  const step = trace[i];
  const next = trace[i + 1];
  if (!step || !next) return null;
  // Ask only where two values are actually being compared.
  if (!(step.highlights ?? []).some((h) => h.kind === 'compare')) return null;

  const swaps = step.metrics?.['swaps'];
  const nextSwaps = next.metrics?.['swaps'];
  if (typeof swaps !== 'number' || typeof nextSwaps !== 'number') return null;

  return {
    prompt: 'Do these two values swap in the next step?',
    // A fresh array per call, so rendering one question can never mutate the
    // shared constant behind the next one.
    choices: [...SWAP_CHOICES],
    correctIndex: nextSwaps > swaps ? 0 : 1,
  };
}

/**
 * "Which node comes off the frontier next?" — the question BFS and DFS share,
 * where the answer *is* the queue-vs-stack difference the lesson teaches.
 * `prompt` names the structure ("queue"/"stack"), so each algorithm owns its
 * copy; `nodeIds` is the graph's vertex list, taken from the parsed input.
 *
 * Asked only when `trace[i + 1]` is a VISIT step. Its first `active` highlight
 * must name a node — a discovery step carries a second `active` for the
 * traversed edge, so only the first id is read and it must match
 * {@link NODE_ID} — must differ from the node this step is already processing
 * (that equality is exactly what a discovery step looks like), and must be
 * waiting in this step's `frontier`.
 *
 * Choices are the answer plus up to two decoys, ordered by node number so the
 * answer's position never leaks it. The decoy pool deliberately reaches past the
 * frontier: the shipped graph is nearly a path, so the frontier frequently holds
 * only the answer, and a one-button "prediction" is not a retrieval act (M8.2's
 * mandatory floor guard). Preference order is other frontier nodes (the true
 * FIFO-vs-LIFO distractors), then nodes not yet marked visited, then the rest.
 * When fewer than two distinct candidates exist at all, the step is not asked.
 */
export function predictNextVisit(
  trace: Trace<unknown>,
  i: number,
  nodeIds: number[],
  prompt: string,
): PredictQuestion | null {
  const step = trace[i];
  const next = trace[i + 1];
  if (!step || !next) return null;

  const answerId = firstActiveId(next);
  if (!answerId || !NODE_ID.test(answerId)) return null;
  const activeId = firstActiveId(step);
  // The same node is still active ⇒ `next` is a discovery, not a visit.
  if (answerId === activeId) return null;

  const frontier = (step.highlights ?? [])
    .filter((h) => h.kind === 'frontier')
    .flatMap((h) => h.ids)
    .filter((id) => NODE_ID.test(id));
  if (!frontier.includes(answerId)) return null;

  const answer = nodeNumber(answerId);

  // Already-marked nodes are weak decoys — a reader can eliminate a ticked node
  // without recalling anything — so they sort last. The node this step is
  // processing counts as marked: a visit step's `visited` highlight excludes it.
  const marked = new Set<number>();
  for (const h of step.highlights ?? []) {
    if (h.kind !== 'visited') continue;
    for (const id of h.ids) if (NODE_ID.test(id)) marked.add(nodeNumber(id));
  }
  if (activeId && NODE_ID.test(activeId)) marked.add(nodeNumber(activeId));

  const pool: number[] = [];
  const consider = (n: number): void => {
    if (n !== answer && !pool.includes(n)) pool.push(n);
  };
  for (const id of frontier) consider(nodeNumber(id));
  for (const n of nodeIds) if (!marked.has(n)) consider(n);
  for (const n of nodeIds) consider(n);

  const decoys = pool.slice(0, 2);
  // A single candidate would render one button — not a prediction. Skip the step.
  if (decoys.length === 0) return null;

  const choices = [answer, ...decoys].sort((a, b) => a - b);
  return {
    prompt,
    choices: choices.map((n) => `Node ${n}`),
    correctIndex: choices.indexOf(answer),
  };
}
