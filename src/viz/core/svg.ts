/**
 * DOM-free SVG string primitives (architecture §3).
 *
 * Every renderer's `renderStatic(step): string` builds its still from these pure
 * string→string helpers, so the same markup can be produced at BUILD TIME (in
 * Node, no DOM, no jsdom) as the client draws — this is what lets the Visualizer
 * frontmatter emit a correct JS-off/pre-hydration still at zero client cost
 * (architecture §1) and what makes `renderStatic` a dependency-free unit-test
 * surface (architecture §5).
 *
 * Imports nothing — a leaf of the one-way dependency graph. No `xmlns` is emitted
 * because the strings are always injected into an existing HTML/SVG context
 * (Astro `set:html`, or an `<svg>`/`<g>` `innerHTML` in the browser).
 */

/** Attribute bag; `undefined`/`null`/`false` values are skipped entirely. */
export type Attrs = Record<
  string,
  string | number | boolean | undefined | null
>;

/**
 * Escapes text/attribute content for safe inlining into markup. Covers the five
 * characters that can break out of an SVG element or attribute context.
 *
 * @param value - Raw string (or number/boolean coerced to string).
 * @returns The XML/HTML-escaped string.
 */
export const esc = (value: string | number | boolean): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Serializes an {@link Attrs} bag to ` k="v"` pairs, escaping every value. */
function attrs(a: Attrs): string {
  let out = '';
  for (const key in a) {
    const value = a[key];
    if (value === undefined || value === null || value === false) continue;
    out += ` ${key}="${esc(value)}"`;
  }
  return out;
}

/** `<rect …/>`. */
export const rect = (a: Attrs): string => `<rect${attrs(a)}/>`;

/** `<circle …/>`. */
export const circle = (a: Attrs): string => `<circle${attrs(a)}/>`;

/** `<line …/>`. */
export const line = (a: Attrs): string => `<line${attrs(a)}/>`;

/** `<polyline …/>` (caller supplies `points`). */
export const polyline = (a: Attrs): string => `<polyline${attrs(a)}/>`;

/** `<polygon …/>` (caller supplies `points`); used for hand-drawn arrowheads. */
export const polygon = (a: Attrs): string => `<polygon${attrs(a)}/>`;

/** `<path …/>` (caller supplies `d`). */
export const path = (a: Attrs): string => `<path${attrs(a)}/>`;

/** `<text …>content</text>`; `content` is escaped. */
export const text = (content: string | number, a: Attrs): string =>
  `<text${attrs(a)}>${esc(content)}</text>`;

/** `<g …>children</g>`; `children` is raw markup (already-built primitives). */
export const group = (children: string, a: Attrs = {}): string =>
  `<g${attrs(a)}>${children}</g>`;

/** Options for {@link svgRoot}. */
export interface SvgRootOptions {
  /** `viewBox` string, e.g. `"0 0 960 340"`. */
  viewBox: string;
  /** SVG `<title>` — the algorithm label (static per instance). */
  title: string;
  /** SVG `<desc>` — mirrors `step.explanation` (rewritten every step). */
  desc: string;
  /** Unique-per-instance id for the `<title>` element (aria-labelledby target). */
  titleId: string;
  /** Unique-per-instance id for the `<desc>` element (aria-labelledby target). */
  descId: string;
}

/**
 * Builds a complete responsive `role="img"` `<svg>` wrapping `children`. The
 * `<title>`+`<desc>` are the accessible name/description (design §3.1); the
 * fluid `width="100%"`/`height:auto` + `preserveAspectRatio` mean the frame
 * scales the diagram without a fixed pixel width (architecture §4 common
 * contract).
 *
 * @param o - Root metadata (viewBox, title/desc text + their element ids).
 * @param children - Pre-built inner markup.
 * @returns A full `<svg>…</svg>` string.
 */
export const svgRoot = (o: SvgRootOptions, children: string): string =>
  `<svg role="img" viewBox="${esc(o.viewBox)}" preserveAspectRatio="xMidYMid meet"` +
  ` width="100%" style="max-width:100%;height:auto"` +
  ` aria-labelledby="${esc(o.titleId)} ${esc(o.descId)}">` +
  `<title id="${esc(o.titleId)}">${esc(o.title)}</title>` +
  `<desc id="${esc(o.descId)}">${esc(o.desc)}</desc>` +
  children +
  `</svg>`;
