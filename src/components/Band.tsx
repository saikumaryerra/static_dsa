/**
 * `<Band>` — a run of sibling cards laid out across the full lesson width
 * (redesign 2026-08).
 * Ported from `Band.astro` (React migration P1 markup, P2 CSS); the CSS lives
 * in `src/styles/components/band.css`.
 *
 * The lesson body is a reading column: everything in it is capped at `--measure`
 * so a paragraph never runs past a comfortable line. That is right for prose and
 * wrong for a set of cards — two Trace Trials stacked at 68ch in a 1328px body
 * leave half the page empty and make a pair of small, equal things look like a
 * list of one-and-then-another.
 *
 * A band says "these belong together and they are peers": one column on a phone,
 * two side by side once there is room. It is a `<Bench>`'s opposite number —
 * bench pairs words with an artifact, band arranges peers — and between them the
 * lesson has no section that has to sit in a half-empty page.
 *
 * `align-items: start` so a taller card does not stretch its neighbour into
 * matching whitespace; the cards keep their own heights.
 *
 * No props, no script, no `<noscript>`: it is layout over content that already
 * works, and with JavaScript off — or below the breakpoint — it is exactly the
 * stack it always was.
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
