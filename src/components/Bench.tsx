/**
 * `<Bench>` — one instrument and the prose that explains it, side by side
 * (redesign 2026-08, amendment L-2).
 * Ported from `Bench.astro` (React migration P1 markup, P2 CSS); the CSS lives
 * in `src/styles/components/bench.css`.
 *
 * WHAT PROBLEM THIS SOLVES. Until now a lesson was an essay with a figure in it:
 * the drawing sat in the reading column at 824px, the sentence describing what
 * to press sat *below* the thing it described, and the run's ledger was folded
 * shut under both. A reader following "watch `lo` and `hi` close in" had to hold
 * the sentence in memory, scroll, and look. That is textbook split attention, on
 * the one page whose entire promise is that you can WATCH the algorithm.
 *
 * A bench pairs exactly one instrument with the prose that narrates it. On a wide
 * screen the prose scrolls in the reading column while the instrument stays
 * pinned beside it, so the sentence and the thing it describes are on screen at
 * the same time — and `<StepLink>` in that prose now moves a drawing the reader
 * can see, rather than scrolling them away from the sentence they were reading.
 *
 * DOM ORDER IS THE MOBILE ORDER, and it is deliberately unchanged from what the
 * lesson shipped before: heading, prose, instrument. The two columns are a grid
 * placement at ≥1200px, never a reordering — so a narrow screen, a printed page,
 * and a screen reader all get the sequence the prose was written for. Nothing is
 * hoisted.
 *
 * SLOTS. Astro routed a child carrying `slot="stage"` into the stage column
 * and removed the attribute. MDX hands React that child with a `slot` PROP, so
 * this component partitions its children by that prop and strips it before
 * rendering — `<div slot="stage">` must not emit `slot="stage"` (D-07). The
 * 42 `slot="stage"` uses in the lessons need no edit.
 *
 * WHY STICKY WORKS HERE. The stage is a grid item with `align-items: start`, so
 * it keeps its own content height while its containing block is as tall as the
 * reading column. That difference IS the travel. A bench whose prose cannot
 * outrun its instrument therefore has nothing to stick to — which is what `solo`
 * is for.
 *
 * Props:
 * - `solo`  the prose here is too short to give the pin any travel (a bare
 *           heading, or a couple of challenge cards). The bench renders as one
 *           full-width column instead, which is *wider* than the old reading
 *           column rather than narrower — a comparison set of three sorts reads
 *           better stacked at full width than squeezed into half of one.
 *           Authored, not inferred: only the author knows whether the prose
 *           beside an instrument is its explanation or just a label.
 * - `id`    optional anchor, for the lesson's `#visualizer` contract.
 *
 * There is no `<noscript>` kill-switch and no client script: a bench is CSS
 * layout over content that already works, so with JavaScript off it is simply a
 * lesson section in its original order.
 */
import {
  Children,
  createElement,
  isValidElement,
  type JSX,
  type ReactElement,
  type ReactNode,
} from 'react';

/** Props of `<Bench>`. */
export interface BenchProps {
  solo?: boolean;
  id?: string;
  children?: ReactNode;
}

/** A child element's props, as far as slot routing reads them. */
type SlottedProps = { slot?: unknown } & Record<string, unknown>;

/**
 * Split children into the default slot and the `stage` slot, stripping `slot`.
 *
 * @param children - The bench's children.
 * @returns `[read, stage]`.
 */
export function partitionSlots(
  children: ReactNode,
): [ReactNode[], ReactNode[]] {
  const read: ReactNode[] = [];
  const stage: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement<SlottedProps>(child) && child.props.slot === 'stage') {
      const props: SlottedProps = { ...child.props };
      delete props.slot;
      stage.push(
        createElement((child as ReactElement<SlottedProps>).type, {
          ...props,
          key: child.key ?? stage.length,
        }),
      );
      return;
    }
    read.push(child);
  });
  return [read, stage];
}

/**
 * A bench.
 *
 * @param props - See `BenchProps`.
 * @returns The bench.
 */
export default function Bench({
  solo = false,
  id,
  children,
}: BenchProps): JSX.Element {
  const [read, stage] = partitionSlots(children);
  return (
    <div className={solo ? 'bench bench--solo' : 'bench'} id={id}>
      <div className="bench__read">{read}</div>
      <div className="bench__stage">{stage}</div>
    </div>
  );
}
