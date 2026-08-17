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

// --- viewBox arithmetic (the frame-height policy, RenderOpts.fixedViewBox) ---

/** A parsed `viewBox`, in user units. */
export interface ViewBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Trims float noise so a unioned box stays as readable as a hand-written one. */
const round = (n: number): number => Number(n.toFixed(2));

/**
 * Parses a `viewBox` string (`"minX minY width height"`, space- or
 * comma-separated per SVG 1.1) into numbers.
 *
 * @param viewBox - The attribute value.
 * @returns The rect, or `null` when it is not four finite numbers with a
 *   positive extent (a zero/negative width or height disables rendering, so it
 *   is never a useful union input).
 */
export function parseViewBox(viewBox: string): ViewBoxRect | null {
  const parts = viewBox.trim().split(/[\s,]+/);
  if (parts.length !== 4) return null;
  const [x, y, width, height] = parts.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/**
 * Reads the `viewBox` out of a rendered `<svg>` string — the measuring half of
 * the frame-height policy. Deliberately markup-level rather than a new renderer
 * method: `renderStatic` is the ONE surface every renderer already exposes
 * (including `ArrayRenderer`, which does not use the shared draw plumbing), so
 * measuring through it means the frame can be sized without touching, or even
 * knowing, any individual renderer's geometry.
 *
 * @param svg - A `renderStatic()` result.
 * @returns The raw `viewBox` value, or `null` if the markup carries none.
 */
export function readViewBox(svg: string): string | null {
  const match = /viewBox="([^"]*)"/.exec(svg);
  return match?.[1] ?? null;
}

/**
 * The smallest box that contains every box given — i.e. the frame that fits the
 * whole trace, so no step needs to resize it (see `RenderOpts.fixedViewBox`).
 * Unparseable entries are skipped rather than throwing: a measurement helper
 * that can crash the build over one odd frame is worse than one that falls back
 * to per-step sizing.
 *
 * @param boxes - `viewBox` strings, e.g. one per step of a trace.
 * @returns The unioned `viewBox` string, or `null` when nothing parsed.
 */
export function unionViewBox(boxes: Iterable<string>): string | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    const rect = parseViewBox(box);
    if (!rect) continue;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return `${round(minX)} ${round(minY)} ${round(maxX - minX)} ${round(maxY - minY)}`;
}

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
