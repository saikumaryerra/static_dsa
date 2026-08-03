/**
 * Build-time legend model (M7.2 Player v2; audit VIZ-6 "the colours are unexplained").
 *
 * The Visualizer's frontmatter already runs the whole trace at BUILD time, so
 * which highlight kinds a given lesson actually uses is knowable with zero client
 * JS. This module turns a trace into an ordered legend: one row per kind that
 * really occurs, each carrying the SAME `--hl-*` token the renderer paints with
 * (read from `HIGHLIGHTS`, never re-declared here) plus the marker glyph and the
 * plain word the reader sees.
 *
 * `HIGHLIGHTS[kind].marker` is deliberately NOT reused as the glyph: it holds a
 * prose DESCRIPTION of the marker ("dashed tie-line + ring"), which is right for
 * documentation and wrong for a 14px pill. Two kinds have no text marker at all —
 * `active` (a lift) and `frontier` (a dashed ring) — so their glyph is `null` and
 * the pill is swatch + word, with the swatch's own dashed border carrying
 * frontier's non-colour cue (design §1: colour is never the only signal).
 *
 * Pure and DOM-free (imports only `./types` + `./highlight`), so it is unit
 * testable in the `node` Vitest harness and costs the client nothing.
 */
import { HIGHLIGHTS, type HighlightKind } from './highlight';
import type { Trace } from './types';

/** The reader-facing half of one legend row. */
export interface LegendLabel {
  /** Text marker the renderer draws for this kind; `null` when it is shape-only. */
  glyph: string | null;
  /** Plain word for the pill — lesson vocabulary, not renderer jargon. */
  word: string;
}

/** One legend row: everything the pill needs for a kind the trace uses. */
export interface LegendEntry extends LegendLabel {
  /** The highlight kind this row explains. */
  kind: HighlightKind;
  /** The `--hl-*` custom property the renderer fills/strokes this kind with. */
  token: string;
}

/**
 * kind → { glyph, word }, in DISPLAY order (the insertion order below is the
 * render order: what is happening now, then what is being moved, then what has
 * already been settled). Glyphs mirror the characters the renderers actually
 * draw — `shared.ts`'s `✓ / + / ✕ / ↔` marks and the `▲` caret — so the legend
 * cannot drift from the drawing. `compare`'s dashed tie-line and `range`'s
 * underbar have no character of their own; `⋯` and `▁` are their closest
 * typographic equivalents, chosen because both read as "a line, not a box" at
 * pill size.
 */
export const LEGEND_LABELS: Record<HighlightKind, LegendLabel> = {
  active: { glyph: null, word: 'Current' },
  pointer: { glyph: '▲', word: 'Pointer' },
  range: { glyph: '▁', word: 'Range' },
  compare: { glyph: '⋯', word: 'Comparing' },
  swap: { glyph: '↔', word: 'Swapping' },
  frontier: { glyph: null, word: 'Frontier' },
  visited: { glyph: '✓', word: 'Visited' },
  insert: { glyph: '+', word: 'Inserted' },
  delete: { glyph: '✕', word: 'Removed' },
  found: { glyph: '✓', word: 'Found' },
};

/** Display order — the key order of {@link LEGEND_LABELS}, resolved once. */
const ORDER = Object.keys(LEGEND_LABELS) as HighlightKind[];

/**
 * Collects the legend for a trace: every highlight kind the trace emits at least
 * once, in {@link LEGEND_LABELS} order, deduplicated.
 *
 * @param trace - The precomputed trace (the same one the Player will index into).
 * @returns Legend rows for the kinds actually used; `[]` when nothing is highlighted.
 */
export function collectLegend(trace: Trace<unknown>): LegendEntry[] {
  const used = new Set<HighlightKind>();
  for (const step of trace) {
    for (const highlight of step.highlights ?? []) used.add(highlight.kind);
  }
  return ORDER.filter((kind) => used.has(kind)).map((kind) => ({
    kind,
    token: HIGHLIGHTS[kind].token,
    ...LEGEND_LABELS[kind],
  }));
}
