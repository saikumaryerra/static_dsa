/**
 * StepLink — P1 INSTRUMENT STUB (React migration plan §5 P1 step 7): a prose link to one ledger row.
 *
 * Renders only the legacy root element, so the prose-parity projection
 * (`proseHash`, `scripts/migration/inventory.mjs`) can place it. The real
 * component replaces this file with the port of `StepLink.astro` (WS-I, P2).
 */
import type { JSX } from 'react';

/**
 * Stub: the root element.
 *
 * @returns The placeholder markup.
 */
export default function StepLink(): JSX.Element {
  return <a className="step-link" />;
}
