/**
 * CodeTabs — P1 INSTRUMENT STUB (React migration plan §5 P1 step 7): tabbed code samples.
 *
 * Renders only the legacy root element, so the prose-parity projection
 * (`proseHash`, `scripts/migration/inventory.mjs`) can place it, plus the
 * legacy `<noscript>` kill-switch that follows the root inside the lesson body
 * — that block IS prose-level markup and is compared. The real component
 * replaces this file with the port of `CodeTabs.astro` (WS-C, P2).
 */
import type { JSX } from 'react';

/** The legacy `<noscript>` block, verbatim. */
const NOSCRIPT = `<style>
    /* Kill-switch (mirrors ThemeToggle): without JS, tabs can't switch — show
       every panel stacked with its language heading, hide the tablist + copy. */
    .codetabs__tablist,
    .codetabs__copy {
      display: none !important;
    }
    /* \`@layer base\` is load-bearing, not decoration: Tailwind's preflight hides
       \`[hidden]\` with \`display: none !important\` from inside that layer, and for
       IMPORTANT declarations a layered rule beats an unlayered one no matter how
       specific the unlayered one is. Unlayered, this override silently lost and
       the JS-off fallback showed only the first language — the other two code
       blocks were unreachable without JS. Joining the same layer puts the two
       rules on equal footing, where this one's higher specificity (class +
       attribute vs \`[hidden]:where(…)\`) decides. Same preflight quirk
       MarkComplete.astro documents from the other direction. */
    @layer base {
      .codetabs__panel[hidden] {
        display: block !important;
      }
    }
    .codetabs__lang {
      position: static !important;
      width: auto !important;
      height: auto !important;
      clip: auto !important;
      clip-path: none !important;
      white-space: normal !important;
      margin: var(--space-4) 0 var(--space-2) !important;
      font-weight: var(--weight-semibold) !important;
      color: var(--text) !important;
    }
  </style>`;

/**
 * Stub: the root element and the kill-switch.
 *
 * @returns The placeholder markup.
 */
export default function CodeTabs(): JSX.Element {
  return (
    <>
      <div className="codetabs" />
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
