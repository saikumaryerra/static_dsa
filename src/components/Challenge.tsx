/**
 * Challenge — one Trace Trial, cleared through the visualizer's EXISTING
 * custom-input form (M8.3, designed in `docs/m8-gamification.md`; spec §11.3).
 * The server half of island `challenge`; the card's behaviour and its design
 * notes are in `ChallengeIsland.tsx`.
 *
 * Props:
 * - `id`  the trial's `{lessonSlug}/{challenge-slug}` id, defined in
 *         `src/lib/challenges.ts`. Everything else — title, prompt, hint, rules
 *         — comes from that catalog, so the card, the build guard and the
 *         storage id can never disagree about what the trial asks.
 *
 * BUILD-TIME GUARD: every trial in the catalog is run against the algorithms
 * that actually ship (`validateChallenge`), so a trial whose witness does not
 * satisfy its own rules — or one the lesson's own pinned example would clear
 * by pressing Run — FAILS THE BUILD as soon as a page renders it, rather than
 * meeting a reader as an unsolvable or free puzzle. The checks are async and a
 * React render is not, so they run once at module evaluation (the top-level
 * `await` below) and the render reads the verdict for its own trial.
 *
 * JS-OFF: the whole card is hidden by its own `<noscript>` kill-switch. The
 * grading needs both the event and storage, so a JS-off visitor would otherwise
 * be shown a puzzle with no way to complete it (the M8 rule: no gamification
 * affordance appears at all without JS).
 */
import type { JSX } from 'react';
import { Island } from '../render/Island';
import { useRenderContext } from '../render/context';
import {
  CHALLENGES,
  challengeById,
  validateChallenge,
  type ChallengeRule,
} from '../lib/challenges';
import {
  algorithms,
  loadedAlgorithm,
  preloadVizRegistry,
} from '../viz/registry';
import ChallengeIsland, { type ChallengeIslandProps } from './ChallengeIsland';

await preloadVizRegistry();

/**
 * Each catalog trial's build-guard verdict: `null` when it passed, the error
 * when it did not. Thrown by the render of the card that names it, so an
 * invalid trial that no page places does not fail the build — the same scope
 * the per-card legacy guard had (the unit suite checks the whole catalog).
 */
const verdicts = new Map<string, Error | null>(
  await Promise.all(
    CHALLENGES.map(async (challenge): Promise<[string, Error | null]> => {
      try {
        await validateChallenge(challenge, (algorithmId) =>
          algorithmId in algorithms
            ? Promise.resolve(loadedAlgorithm(algorithmId))
            : undefined,
        );
        return [challenge.id, null];
      } catch (error) {
        return [
          challenge.id,
          error instanceof Error ? error : new Error(String(error)),
        ];
      }
    }),
  ),
);

/** The legacy `<noscript>` block, verbatim. */
const NOSCRIPT = `<style>
    /* Kill-switch (mirrors MarkComplete): grading needs the run event and
       storage, so with JS off this card could only ever be a puzzle with no way
       to finish it. \`!important\` because a kill-switch must be unbeatable by any
       equal-specificity rule in the bundle. */
    .challenge {
      display: none !important;
    }
  </style>`;

/**
 * One Trace Trial card.
 *
 * @param props - The trial id.
 * @returns The card and its kill-switch.
 * @throws At build time on an unknown id, a trial placed on another lesson,
 *   or a trial that fails its build guard.
 */
export default function Challenge({ id }: { id: string }): JSX.Element {
  const context = useRenderContext();
  const challenge = challengeById(id);
  if (!challenge) {
    throw new Error(
      `Unknown challenge id "${id}" — add it to src/lib/challenges.ts (ids are {lessonSlug}/{challenge-slug}).`,
    );
  }

  // The page this card is on. Same derivation as the Visualizer's; empty
  // outside `/learn/{slug}`, where the check below simply does not apply.
  const routePath = context.pathname
    .replace(/(?:\/index)?\.html$/, '')
    .replace(/\/$/, '');
  const pageSlug = /^\/learn\/([^/]+)$/.exec(routePath)?.[1] ?? '';
  if (pageSlug && pageSlug !== challenge.lesson) {
    throw new Error(
      `Challenge "${id}" belongs to lesson "${challenge.lesson}" but was placed in "${pageSlug}". Its storage id names the lesson, so the two must match.`,
    );
  }

  const failure = verdicts.get(challenge.id);
  if (failure) throw failure;

  // The predicate is written out rather than left to inference: this reads
  // `rule.array`, which only one member of the union has.
  const pinned = challenge.rules.find(
    (rule): rule is Extract<ChallengeRule, { kind: 'pinnedArray' }> =>
      rule.kind === 'pinnedArray',
  );

  // Ids inside an island are minted HERE (islands render without context).
  const titleId = `ch-title-${context.uid()}`;
  const props: ChallengeIslandProps = {
    id: challenge.id,
    algorithm: challenge.algorithm,
    rules: challenge.rules,
    title: challenge.title,
    prompt: challenge.prompt,
    hint: challenge.hint,
    pinnedText: pinned ? `[${pinned.array.join(',')}]` : null,
    titleId,
  };

  return (
    <>
      <Island
        name="challenge"
        component={ChallengeIsland}
        props={props}
        rootProps={{
          className: 'challenge',
          role: 'group',
          'aria-labelledby': titleId,
          'data-challenge': '',
          'data-challenge-id': challenge.id,
          'data-challenge-algorithm': challenge.algorithm,
          'data-challenge-rules': JSON.stringify(challenge.rules),
        }}
      />
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
