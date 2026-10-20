/**
 * Collapsible — styled native `<details>` (design §6.8, site spec §9). Ported
 * markup (React migration P1 step 7); the animation rationale (M7.3 CMP-13)
 * lives with `Collapsible.astro`, whose CSS moves to
 * `src/styles/components/collapsible.css` in P2.
 *
 * Props:
 * - `summary` the always-visible clickable label.
 * - `open`    optional; render expanded by default.
 *
 * Native `<details>` = keyboard operable and fully functional with JS off.
 * This component has **no `<noscript>` kill-switch of its own**, deliberately:
 * it needs no JavaScript at all. Anything that composes it and adds JS-only
 * affordances ships its own (`PracticeCheck`).
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
