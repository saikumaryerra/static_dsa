/**
 * FinalRun — one numeric prediction about the run the reader can watch on this
 * page, with the truth computed at BUILD time (M8.3, designed in
 * `docs/m8-gamification.md`; spec §7 body-section 8). The server half of
 * island `final-run`; the card's behaviour and its earning rule are in
 * `FinalRunIsland.tsx`.
 *
 * Props:
 * - `slug`      the lesson that owns the storage record; pass `frontmatter.slug`.
 * - `algorithm` WHICH visualizer this asks about. Explicit because five of the
 *               six Algorithms lessons host two or three visualizers, so "the
 *               lesson's visualizer" names nothing.
 * - `metric`    the counter to predict, e.g. `comparisons`. The build fails if
 *               that run never emits it, so an authored question can never be
 *               one the visualization does not answer.
 * - `anchor`    where "Watch it happen" points. OPTIONAL, and best left unset:
 *               the default resolves to the instrument this lesson's
 *               `<Visualizer algorithm="…">` renders. An explicit value is
 *               checked against the lesson's real heading ids, so a typo fails
 *               the build instead of shipping a link to nowhere.
 * - `subject`   how the algorithm is named in the question (default: its
 *               registry label, e.g. "Quick sort (Lomuto partition)").
 *
 * WHY THE ANSWER CANNOT BE WRONG: it is not authored. This runs the algorithm
 * on the lesson's PINNED input and reads the final step's metric — so the
 * number in the card is by construction the number the reader will watch the
 * player reach. The pinned input comes from `src/lib/challenges.ts`, the one
 * module both this component and the lesson's `<Visualizer input>` read, and
 * `tests/unit/challenges.test.ts` holds that map against the `.mdx` bodies.
 *
 * JS-OFF: the whole card is hidden by its own `<noscript>` kill-switch —
 * nothing here can be checked without a script. That kill-switch is ALSO why
 * no lesson authors a `## Final run` heading: a heading in the MDX body
 * survives it, leaving an empty section and dead table-of-contents links. So
 * the card titles itself (the "Final run" kicker), and heading, card and ToC
 * entry live and die together.
 */
import type { JSX } from 'react';
import { getLessons } from '../content/lessons';
import {
  finalMetric,
  metricNoun,
  metricsSentence,
  pinnedInput,
} from '../lib/challenges';
import { Island } from '../render/Island';
import { useRenderContext } from '../render/context';
import { instrumentIdFor } from '../viz/core/instrument-id';
import {
  algorithms,
  loadedAlgorithm,
  preloadVizRegistry,
} from '../viz/registry';
import FinalRunIsland, { type FinalRunIslandProps } from './FinalRunIsland';

await preloadVizRegistry();

/** Props of {@link FinalRun} — the legacy component's, unchanged. */
export interface FinalRunProps {
  slug: string;
  algorithm: string;
  metric: string;
  anchor?: string;
  subject?: string;
}

/** The legacy `<noscript>` block, verbatim. */
const NOSCRIPT = `<style>
    /* Kill-switch (mirrors MarkComplete): the check, the reveal and the saved
       state are all JS-only, so with JS off this is a question with no answer.
       \`!important\` because a kill-switch must be unbeatable by any
       equal-specificity rule in the bundle. */
    .final-run {
      display: none !important;
    }
  </style>`;

/**
 * One Final Run card.
 *
 * @param props - See {@link FinalRunProps}.
 * @returns The card and its kill-switch.
 * @throws At build time on a bad anchor, an unknown algorithm, a missing or
 *   rejected pinned input, a metric the run never emits, or nowhere to point.
 */
export default function FinalRun({
  slug,
  algorithm,
  metric,
  anchor,
  subject,
}: FinalRunProps): JSX.Element {
  const context = useRenderContext();

  if (anchor !== undefined && !anchor.startsWith('#')) {
    throw new Error(
      `FinalRun ("${slug}"): anchor must be a same-page fragment like "#quick-sort" (got "${anchor}").`,
    );
  }
  if (!(algorithm in algorithms)) {
    throw new Error(`FinalRun ("${slug}"): unknown algorithm "${algorithm}".`);
  }
  const algo = loadedAlgorithm(algorithm);

  // The pinned input — the ONE string this lesson's visualizer is also seeded
  // with. Without an entry there is no run to grade against, and guessing a
  // default would ask about a run nobody can watch.
  const input = pinnedInput(slug, algorithm);
  if (input === null) {
    throw new Error(
      `FinalRun ("${slug}"): no pinned input for "${algorithm}" — add "${slug}/${algorithm}" to PINNED_INPUTS in src/lib/challenges.ts (it must equal the lesson's <Visualizer input>).`,
    );
  }
  const parsed = algo.parseInput(input);
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    throw new Error(
      `FinalRun ("${slug}"): pinned input "${input}" was rejected by "${algorithm}": ${(parsed as { error: string }).error}`,
    );
  }
  const answer = finalMetric(algo.run(parsed), metric);
  if (answer === null) {
    throw new Error(
      `FinalRun ("${slug}"): "${algorithm}" emits no "${metric}" metric on "${input}", so that question has no answer.`,
    );
  }

  // --- Where "Watch it happen" points ---
  // It has to land on something that EXISTS: the old flat `#visualizer` was a
  // link to nowhere on three of the six Algorithms lessons, and it is the one
  // affordance a reader reaches for straight after a miss. So the target is
  // RESOLVED against the lesson itself, never assumed.
  const entry = getLessons().find((lesson) => lesson.data.slug === slug);
  if (!entry) {
    throw new Error(
      `FinalRun ("${slug}"): no lesson has that slug — pass frontmatter.slug.`,
    );
  }
  const { headings, body } = entry;
  const headingIds = new Set(headings.map((heading) => heading.slug));

  // Tag by tag, lazily up to each `/>` — the segmentation `findVisualizerInput`
  // uses in `src/lib/challenges.ts`. A single regex spanning `algorithm="…"`
  // would match from the FIRST tag on the page, which on a two-visualizer
  // lesson silently anchors quick sort's question to merge sort's heading.
  const names = new RegExp(`algorithm=(["'])${algorithm}\\1`);
  const tag = [...body.matchAll(/<Visualizer\b([\s\S]*?)\/>/g)].find((match) =>
    names.test(match[1] ?? ''),
  );

  /**
   * The id of the heading THIS algorithm's visualizer sits under, read from
   * the lesson body (the last heading line before the matching tag) and
   * matched back to the rendered heading list, so the id is one the page
   * really has. `null` when the tag or its heading cannot be found.
   */
  const visualizerHeadingId = (): string | null => {
    if (!tag) return null;
    const above = [
      ...body.slice(0, tag.index).matchAll(/^#{2,6}[ \t]+(.+?)\s*$/gm),
    ];
    const nearest = above[above.length - 1]?.[1];
    if (nearest === undefined) return null;
    // Markdown emphasis and code ticks are styling, not part of the heading
    // text the slugger saw.
    const text = nearest.replace(/[*_`]/g, '').trim();
    return (
      headings.find((heading) => heading.text.trim() === text)?.slug ?? null
    );
  };

  // Resolved to THE INSTRUMENT rather than to a heading (redesign 2026-08):
  // now that instruments sit in a bench's stage column, the heading is no
  // longer where the drawing is. Derived through `instrumentIdFor` — the
  // read-only half of the function `Visualizer` claims with, seeded from the
  // same pathname — with the renderer taken from the very tag found above.
  const rendererId = /renderer=(["'])(.*?)\1/.exec(tag?.[1] ?? '')?.[2];
  const ownHeading = visualizerHeadingId();
  const target =
    anchor ??
    (rendererId !== undefined
      ? `#${instrumentIdFor(context.pathname, algorithm, rendererId, 1)}`
      : ownHeading !== null
        ? `#${ownHeading}`
        : null);
  if (target === null) {
    throw new Error(
      `FinalRun ("${slug}"): "Watch it happen" has nowhere to point — no <Visualizer algorithm="${algorithm}" …/> tag was found in this lesson, and no anchor was passed. Heading ids available: ${[...headingIds].map((id) => `#${id}`).join(', ')}.`,
    );
  }
  // An AUTHORED anchor is still checked against the real heading ids.
  if (anchor !== undefined && !headingIds.has(anchor.slice(1))) {
    throw new Error(
      `FinalRun ("${slug}"): anchor "${anchor}" is not a heading on this lesson. Available: ${[...headingIds].map((id) => `#${id}`).join(', ')}.`,
    );
  }

  // Ids inside an island are minted HERE (islands render without context).
  const uid = context.uid();
  const promptId = `fr-prompt-${uid}`;
  // "14 comparisons" / "1 comparison" — composed at BUILD time from the same
  // number the check uses, through the trial cards' vocabulary.
  const answerText = metricsSentence({ [metric]: answer });
  const props: FinalRunIslandProps = {
    slug,
    answer,
    answerText,
    label: subject ?? algo.label,
    input,
    noun: metricNoun(metric),
    target,
    promptId,
    inputId: `fr-input-${uid}`,
    statusId: `fr-status-${uid}`,
  };

  return (
    <>
      <Island
        name="final-run"
        component={FinalRunIsland}
        props={props}
        rootProps={{
          className: 'final-run',
          role: 'group',
          'aria-labelledby': promptId,
          'data-final-run': '',
          'data-slug': slug,
          'data-answer': String(answer),
          'data-answer-text': answerText,
        }}
      />
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
