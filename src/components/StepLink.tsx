/**
 * `<StepLink>` — a prose link to one step of a lesson's run (Plan C §7).
 *
 * The ledger gave every step a durable id (`${uid}-row-${n}`) and every
 * instrument has a durable `uid`, which together make a sentence able to point
 * at the exact row it is describing: *"…that is step 2 in the run below."* This
 * is that pointer, and it is an ordinary `<a href="#…">` — so it works with
 * JavaScript off, it can be middle-clicked, and the address bar keeps it.
 *
 * HOW IT RESOLVES THE INSTRUMENT. `claimInstrumentId` MINTS: asking it for
 * binary-search's id a second time returns `…-2`, the id of a second instrument
 * that does not exist. So this component derives the id instead, through
 * `instrumentIdFor` — the read-only half of the same function. The alternative,
 * an authored `id="viz-binary-search-3f0k1p"` prop, would paste an opaque hash
 * into prose that silently stops resolving the moment the lesson's path,
 * algorithm or renderer changes. Deriving it means the link follows all three.
 *
 * WHAT IT COSTS THE AUTHOR: repeating the `algorithm` and `renderer` of the
 * `<Visualizer>` being pointed at. Both are checked against the registry here,
 * so a typo fails the BUILD rather than shipping a dead link, and
 * `tests/e2e/plan-c-ledger.spec.ts` walks every published lesson asserting that
 * each `[data-step-link]` resolves to a row that exists — the half a build-time
 * check cannot see, because this component does not know how long the run is.
 *
 * THE SCROLL is the interesting part, and it is documented in the client
 * module, `src/client/modules/step-link.ts`.
 */
import type { JSX, ReactNode } from 'react';
import { useClientModule, useRenderContext } from '../render/context';
import { instrumentIdFor } from '../viz/core/instrument-id';
import { algorithms, renderers } from '../viz/registry';

/** Props of {@link StepLink}. */
export interface StepLinkProps {
  /** Registry id of the instrument's algorithm, e.g. `'binary-search'`. */
  algorithm: string;
  /** Registry id of its renderer, e.g. `'array'`. */
  renderer: string;
  /** 1-based step number — the `#` the reader sees in the table. */
  step: number;
  /**
   * Which instrument of that algorithm+renderer on this page, 1-based. Only
   * needed if a page ever mounts two of the same pair; none does today.
   */
  nth?: number;
  /** The link's own words; without them it names the step. */
  children?: ReactNode;
}

/**
 * A prose link to a ledger row.
 *
 * @param props - See {@link StepLinkProps}.
 * @returns The link.
 * @throws At build time on an unknown algorithm or renderer, or a step that is
 *   not a whole number from 1.
 */
export default function StepLink({
  algorithm,
  renderer,
  step,
  nth = 1,
  children,
}: StepLinkProps): JSX.Element {
  const context = useRenderContext();
  useClientModule('step-link');

  // Fail the build, not the reader. An unknown id here is a link to nowhere,
  // and a link to nowhere in prose is worse than no link at all: it reads as a
  // promise the page then refuses to keep.
  if (!(algorithm in algorithms)) {
    throw new Error(
      `<StepLink>: unknown algorithm "${algorithm}". It must be one of the ids in src/viz/registry.ts, and must match the <Visualizer> this link points at.`,
    );
  }
  if (!(renderer in renderers)) {
    throw new Error(
      `<StepLink>: unknown renderer "${renderer}" (algorithm "${algorithm}"). It must match the <Visualizer> this link points at, not just be a real renderer.`,
    );
  }
  if (!Number.isInteger(step) || step < 1) {
    throw new Error(
      `<StepLink>: step must be a whole number from 1 (the table's own "#" column). Got ${String(step)}.`,
    );
  }

  const uid = instrumentIdFor(context.pathname, algorithm, renderer, nth);
  const rowId = `${uid}-row-${step}`;

  // Whether the author supplied their own words. With none, the link names the
  // step itself, so the default can never be a link whose text says nothing
  // about where it goes; with some, the step number moves into the hidden half
  // instead of being lost.
  //
  // The two suffixes differ by a dash and nothing else, and that is
  // deliberate: an accessible name concatenates adjacent inline text WITH A
  // SPACE, so a suffix that opened with a comma came out as "step 2 , in the
  // run…" — visible in the aria baseline, which is how it was caught.
  const authored =
    children !== undefined && children !== null && children !== '';

  // `data-step-link` carries the INSTRUMENT id, not the row's: the module
  // needs somewhere to land when the row cannot be shown — Predict mode hides
  // the whole table, and `showLedger={false}` means there is no table. The
  // href stays the row, because that is what a browser with no script should
  // do with it.
  return (
    <a className="step-link" href={`#${rowId}`} data-step-link={uid}>
      {authored ? children : `step ${step}`}
      <span className="sr-only">
        {authored
          ? `— step ${step} in the run written out below`
          : 'in the run written out below'}
      </span>
    </a>
  );
}
