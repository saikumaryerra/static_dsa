/**
 * FinalRun — P1 INSTRUMENT STUB (React migration plan §5 P1 step 7): the Final Run card (island `final-run`).
 *
 * Renders only the legacy root element, so the prose-parity projection
 * (`proseHash`, `scripts/migration/inventory.mjs`) can place it, plus the
 * legacy `<noscript>` kill-switch that follows the root inside the lesson body
 * — that block IS prose-level markup and is compared. The real component
 * replaces this file with the port of `FinalRun.astro` (WS-I, P2).
 */
import type { JSX } from 'react';

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
 * Stub: the root element and the kill-switch.
 *
 * @returns The placeholder markup.
 */
export default function FinalRun(): JSX.Element {
  return (
    <>
      <div className="final-run" />
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
