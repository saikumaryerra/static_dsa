/**
 * Collapsible — styled native `<details>` (design §6.8, site spec §9).
 * Ported from `Collapsible.astro` (React migration P1 markup, P2 CSS); the CSS lives
 * in `src/styles/components/collapsible.css`.
 *
 * Props:
 * - `summary` the always-visible clickable label.
 * - `open`    optional; render expanded by default.
 *
 * Native `<details>` = keyboard operable and fully functional with JS off. The
 * chevron rotates on `[open]`; the rotation is gated by `prefers-reduced-motion`
 * via the global `--duration-*` collapse. Content goes in the children.
 *
 * M7.3 CMP-13: opening a multi-paragraph Practice answer used to snap the page
 * open under the reader, so the answer arrived with the surrounding text already
 * shoved elsewhere. The expand is now animated — CSS only, zero JS — and the
 * whole ruleset is a progressive enhancement: an engine without
 * `::details-content` (pre-Chrome 131 / Safari 18.4 / Firefox 139) drops it and
 * keeps today's instant open.
 *
 * This component has **no `<noscript>` kill-switch of its own**, deliberately:
 * it needs no JavaScript at all, so there is nothing to switch off. Anything
 * that composes it and adds JS-only affordances must therefore ship its own —
 * `PracticeCheck` (M8.1) wraps this disclosure with self-grading buttons
 * and hides exactly those, leaving this `<details>` untouched with JS off.
 */
import type { JSX, ReactNode } from 'react';

/**
 * A disclosure.
 *
 * @param props - Summary, initial state and content.
 * @returns The `<details>`.
 */
export default function Collapsible({
  summary,
  open = false,
  children,
}: {
  summary: string;
  open?: boolean;
  children?: ReactNode;
}): JSX.Element {
  return (
    <details className="collapsible" open={open}>
      <summary>
        <svg
          className="collapsible__chevron"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6"></path>
        </svg>
        <span>{summary}</span>
      </summary>
      <div className="collapsible__content">{children}</div>
    </details>
  );
}
