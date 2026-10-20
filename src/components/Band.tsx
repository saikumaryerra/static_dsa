/**
 * `<Band>` — a run of sibling cards laid out across the full lesson width
 * (redesign 2026-08). Ported markup (React migration P1 step 7); the reasoning
 * lives with `Band.astro`, whose CSS moves to `src/styles/components/band.css`
 * in P2. One column on a phone, two side by side once there is room; no props,
 * no script, no `<noscript>`.
 */
import type { JSX, ReactNode } from 'react';

/**
 * A band of peer cards.
 *
 * @param props - The cards.
 * @returns The band.
 */
export default function Band({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  return <div className="band">{children}</div>;
}
