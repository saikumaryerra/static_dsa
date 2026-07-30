/**
 * Canonical highlight mapping (design §1, architecture §3).
 *
 * The SINGLE source that maps each of the 10 `Highlight` kinds to its design
 * token, its `is-*` CSS class, and the NAME of its mandatory non-color marker.
 * Every renderer reads this table so none invents its own token pairing, and so
 * the "no `--hl-*` colour without a paired marker" rule (design §1 hardening
 * condition, §3.2 QA gate) is enforced from one place.
 *
 * Token reuse (design §1 RESOLVED decision — the six `--hl-*` tokens stand, no
 * new tokens): `insert` reuses `--hl-found`, `delete`/`range`-nothing… — the
 * kinds are disambiguated purely by their distinct marker, never by colour. To
 * promote a reuse to a real token later, change one row here.
 *
 * Imports only `./types` — a near-leaf of the one-way dependency graph.
 */
import type { Highlight } from './types';

/** The 10 highlight kinds (mirrors `Highlight['kind']`). */
export type HighlightKind = Highlight['kind'];

/** One row of the canonical table. */
export interface HighlightSpec {
  /** `is-*` class the renderer puts on the element's group. */
  cssClass: string;
  /** `--hl-*` design token used for fill/stroke (may be shared across kinds). */
  token: string;
  /** Human name of the REQUIRED non-color marker (documentation + test intent). */
  marker: string;
}

/**
 * kind → { cssClass, token, marker }. Encodes design §1 verbatim. `insert`,
 * `delete`, `pointer`, `range` reuse an existing token, distinguished by marker.
 */
export const HIGHLIGHTS: Record<HighlightKind, HighlightSpec> = {
  compare: {
    cssClass: 'is-compare',
    token: '--hl-compare',
    marker: 'dashed tie-line + ring',
  },
  swap: { cssClass: 'is-swap', token: '--hl-swap', marker: '↔ arrow glyph' },
  active: {
    cssClass: 'is-active',
    token: '--hl-active',
    marker: 'named caret + lift',
  },
  visited: { cssClass: 'is-visited', token: '--hl-visited', marker: '✓ badge' },
  frontier: {
    cssClass: 'is-frontier',
    token: '--hl-frontier',
    marker: 'dashed ring',
  },
  found: { cssClass: 'is-found', token: '--hl-found', marker: '✓ glyph' },
  insert: { cssClass: 'is-insert', token: '--hl-found', marker: '+ caret' },
  delete: {
    cssClass: 'is-delete',
    token: '--hl-swap',
    marker: '✕ glyph + strikethrough',
  },
  pointer: {
    cssClass: 'is-pointer',
    token: '--hl-active',
    marker: 'named label caret',
  },
  range: {
    cssClass: 'is-range',
    token: '--hl-active',
    marker: 'underbar bracket',
  },
};

/**
 * Fill/stroke precedence when one element carries several kinds (design §1). The
 * FIRST kind in this list an element has wins the rect/circle treatment; markers
 * (carets, tie-lines, ↔, ✓, +, ✕) are additive overlays drawn separately, so
 * they always stack regardless of precedence. `pointer` is last: it contributes
 * no fill (caret only), so any other kind's fill wins.
 */
const PRECEDENCE: HighlightKind[] = [
  'found',
  'active',
  'swap',
  'compare',
  'insert',
  'delete',
  'visited',
  'frontier',
  'range',
  'pointer',
];

/** Lower rank = higher precedence. Unknown kinds sort last. */
const rank = (kind: HighlightKind): number => {
  const i = PRECEDENCE.indexOf(kind);
  return i === -1 ? PRECEDENCE.length : i;
};

/**
 * Resolves, for every highlighted id, the single winning `is-*` class per the
 * precedence rule. Renderers apply the returned class to the element's group and
 * add their non-color markers on top.
 *
 * @param highlights - The step's highlights (may be `undefined`).
 * @returns Map of element id → winning `is-*` class.
 */
export function applyHighlights(
  highlights: Highlight[] | undefined,
): Map<string, string> {
  const winner = new Map<string, HighlightKind>();
  for (const h of highlights ?? []) {
    for (const id of h.ids) {
      const current = winner.get(id);
      if (current === undefined || rank(h.kind) < rank(current)) {
        winner.set(id, h.kind);
      }
    }
  }
  const out = new Map<string, string>();
  for (const [id, kind] of winner) out.set(id, HIGHLIGHTS[kind].cssClass);
  return out;
}
