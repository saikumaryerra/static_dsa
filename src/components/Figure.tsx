/**
 * Figure — P1 INSTRUMENT STUB (React migration plan §5 P1 step 7): a captioned inline-SVG diagram frame.
 *
 * Renders only the legacy root element, so the prose-parity projection
 * (`proseHash`, `scripts/migration/inventory.mjs`) can place it. The real
 * component replaces this file with the port of `Figure.astro` (WS-C, P3).
 */
import type { JSX } from 'react';

/**
 * Stub: the root element.
 *
 * @returns The placeholder markup.
 */
export default function Figure(): JSX.Element {
  return <figure className="figure" />;
}
