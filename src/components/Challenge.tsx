/**
 * Challenge — P1 INSTRUMENT STUB (React migration plan §5 P1 step 7): a Trace Trial card (island `challenge`).
 *
 * Renders only the legacy root element, so the prose-parity projection
 * (`proseHash`, `scripts/migration/inventory.mjs`) can place it, plus the
 * legacy `<noscript>` kill-switch that follows the root inside the lesson body
 * — that block IS prose-level markup and is compared. The real component
 * replaces this file with the port of `Challenge.astro` (WS-I, P2).
 */
import type { JSX } from 'react';

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
 * Stub: the root element and the kill-switch.
 *
 * @returns The placeholder markup.
 */
export default function Challenge(): JSX.Element {
  return (
    <>
      <div className="challenge" />
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
