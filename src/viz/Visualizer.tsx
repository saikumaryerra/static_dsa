/**
 * Visualizer — P1 INSTRUMENT STUB (React migration plan §5 P1 step 7): the step-through instrument (island `visualizer`).
 *
 * Renders only the legacy root element, so the prose-parity projection
 * (`proseHash`, `scripts/migration/inventory.mjs`) can place it, plus the
 * legacy `<noscript>` kill-switch that follows the root inside the lesson body
 * — that block IS prose-level markup and is compared. The real component
 * replaces this file with the port of `Visualizer.astro` (WS-I, P2).
 */
import type { JSX } from 'react';

/** The legacy `<noscript>` block, verbatim. */
const NOSCRIPT = `<style>
    /* Kill-switch (mirrors ThemeToggle): JS off → hide interactive controls,
       reveal the static-preview note. !important beats the bundled stylesheet. */
    [data-viz] .viz-controls {
      display: none !important;
    }
    [data-viz] .viz-nojs-note {
      display: flex !important;
    }
  </style>`;

/**
 * Stub: the root element and the kill-switch.
 *
 * @returns The placeholder markup.
 */
export default function Visualizer(): JSX.Element {
  return (
    <>
      <section className="viz" />
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
