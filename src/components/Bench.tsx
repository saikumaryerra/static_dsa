/**
 * `<Bench>` — one instrument and the prose that explains it, side by side
 * (redesign 2026-08, amendment L-2). Ported markup (React migration P1 step 7);
 * the reasoning lives with the legacy component, `Bench.astro`, whose CSS
 * moves to `src/styles/components/bench.css` in P2 together with this file's
 * remaining comment block.
 *
 * DOM ORDER IS THE MOBILE ORDER: heading, prose, instrument. The two columns
 * are a grid placement at >=1200px, never a reordering.
 *
 * SLOTS. Astro routed a child carrying `slot="stage"` into the stage column
 * and removed the attribute. MDX hands React that child with a `slot` PROP, so
 * this component partitions its children by that prop and strips it before
 * rendering — `<div slot="stage">` must not emit `slot="stage"` (D-07). The
 * 42 `slot="stage"` uses in the lessons need no edit.
 *
 * Props:
 * - `solo`  the prose here is too short to give the pin any travel; the bench
 *           renders as one full-width column instead. Authored, not inferred.
 * - `id`    optional anchor, for the lesson's `#visualizer` contract.
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
