/**
 * ComplexityTable — P1 INSTRUMENT STUB (React migration plan §5 P1 step 7): the Big-O table.
 *
 * Renders only the legacy root element, so the prose-parity projection
 * (`proseHash`, `scripts/migration/inventory.mjs`) can place it. The real
 * component replaces this file with the port of `ComplexityTable.astro` (WS-C, P2).
 */
import type { JSX } from 'react';

/**
 * Stub: the root element.
 *
 * @returns The placeholder markup.
 */
export default function ComplexityTable(): JSX.Element {
  return <table className="complexity-table" />;
}
