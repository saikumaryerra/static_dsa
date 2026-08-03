/**
 * Token contrast matrix — the automated half of spec §12/§13's AA claim, and the
 * standing guard for M7.1 A11Y-4 (the `--hl-found` / `--hl-swap` light repairs).
 *
 * Why a unit test and not axe: axe never evaluates SVG `<text>`, and it cannot
 * see a `color-mix()` fill at all, so the two places the highlight palette is
 * actually read — the tinted cell fills and the marker glyphs — have no runtime
 * a11y coverage. This test reads `src/styles/tokens.css` from disk, parses the
 * declared hex values, and computes WCAG 2.1 contrast in plain arithmetic: pure,
 * dependency-free, and correct under the harness's `environment: 'node'` (no DOM,
 * no `getComputedStyle`).
 *
 * The pairings mirror what the browser paints, not what the token table implies:
 * a highlighted cell is FILLED `color-mix(in srgb, var(--hl-x) 15%, var(--surface))`
 * (18% for the found/insert roles) and STROKED with the raw `--hl-x`, with the
 * cell value drawn in `--text` on top of that mixed fill (`Visualizer.astro`
 * cell + node rules). So the stroke owes 3:1 against its own tint (WCAG 1.4.11
 * non-text contrast) and the value text owes 4.5:1 against it (1.4.3) — never
 * against `--surface`, which is not what is behind them.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TOKENS_PATH = fileURLToPath(
  new URL('../../src/styles/tokens.css', import.meta.url),
);
const CSS = readFileSync(TOKENS_PATH, 'utf8');

// --------------------------------------------------------------------------
// CSS parsing (deliberately tiny: three known selectors, flat declarations)
// --------------------------------------------------------------------------

/** Drops comments so a commented-out declaration can never be read as live. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Returns the text inside the declaration block introduced by `selector`.
 * Brace-balanced so an `@media` wrapper or a nested block cannot truncate it.
 */
function blockFor(source: string, selector: RegExp): string {
  const match = selector.exec(source);
  if (!match) throw new Error(`tokens.css: no block matched ${selector}`);
  const open = source.indexOf('{', match.index);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`tokens.css: unbalanced braces after ${selector}`);
}

/**
 * Parses `prop: value;` pairs in source order. Custom properties AND regular
 * declarations (`color-scheme`) are captured — the dark-mirror invariant below
 * has to compare the whole block, not just the variables.
 */
function declarations(block: string): [string, string][] {
  const pairs: [string, string][] = [];
  const decl = /([a-zA-Z-][\w-]*)\s*:\s*([^;{}]+);/g;
  let match: RegExpExecArray | null;
  while ((match = decl.exec(block)) !== null) {
    // Collapse interior whitespace: tokens.css aligns some values with extra
    // spaces purely for readability, which must not read as a value change.
    pairs.push([match[1]!, match[2]!.trim().replace(/\s+/g, ' ')]);
  }
  if (pairs.length === 0)
    throw new Error('tokens.css: empty declaration block');
  return pairs;
}

const SOURCE = stripComments(CSS);
const ROOT = declarations(blockFor(SOURCE, /(^|\s):root\s*\{/));
const DARK_OVERRIDES = declarations(
  blockFor(SOURCE, /\[data-theme="dark"\]\s*\{/),
);
const MIRROR_OVERRIDES = declarations(
  blockFor(SOURCE, /:root:not\(\[data-theme\]\)\s*\{/),
);

/** Theme lookup tables: dark is `:root` with the dark block cascaded over it. */
const THEMES: Record<string, Map<string, string>> = {
  light: new Map(ROOT),
  dark: new Map([...ROOT, ...DARK_OVERRIDES]),
};

/** Reads a token, failing loudly if it was renamed or removed. */
function token(theme: string, name: string): string {
  const value = THEMES[theme]?.get(name);
  if (value === undefined) {
    throw new Error(`tokens.css: ${theme} theme declares no ${name}`);
  }
  return value;
}

// --------------------------------------------------------------------------
// Color math (WCAG 2.1 relative luminance + CSS color-mix in srgb)
// --------------------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses `#RRGGBB` into 0–255 channels; rejects anything else outright. */
function parseHex(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (!hex) throw new Error(`tokens.css: ${value} is not a 6-digit hex color`);
  const n = parseInt(hex[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** sRGB → linear-light for one 0–1 channel (WCAG 2.1 relative luminance). */
function toLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function luminance({ r, g, b }: Rgb): number {
  return (
    0.2126 * toLinear(r / 255) +
    0.7152 * toLinear(g / 255) +
    0.0722 * toLinear(b / 255)
  );
}

/** WCAG contrast ratio, order-independent. */
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Reproduces `color-mix(in srgb, top <ratio>, bottom)`: the `srgb` space is
 * gamma-encoded, so the interpolation happens on the channel values as authored
 * (no linearization), and both operands are opaque so alpha premultiplication
 * is a no-op. Channels stay fractional — the browser composites in float, and
 * rounding to 8-bit here would move a ratio by <0.5/255 for no gain.
 */
function mixSrgb(top: Rgb, bottom: Rgb, ratio: number): Rgb {
  return {
    r: top.r * ratio + bottom.r * (1 - ratio),
    g: top.g * ratio + bottom.g * (1 - ratio),
    b: top.b * ratio + bottom.b * (1 - ratio),
  };
}

// --------------------------------------------------------------------------
// The matrix
// --------------------------------------------------------------------------

const AA_TEXT = 4.5; // WCAG 1.4.3, body-size text
const AA_GRAPHICS = 3; // WCAG 1.4.11, non-text (strokes, borders)

const THEME_NAMES = ['light', 'dark'] as const;

/**
 * Highlight roles and the `color-mix()` ratio their cell/node fill uses in
 * `Visualizer.astro`. `is-insert` reuses `--hl-found` at 18% and `is-delete`
 * reuses `--hl-swap` at 15%, so those two states are covered by these entries.
 */
const HIGHLIGHT_FILLS: { name: string; ratio: number }[] = [
  { name: '--hl-active', ratio: 0.15 },
  { name: '--hl-compare', ratio: 0.15 },
  { name: '--hl-swap', ratio: 0.15 },
  { name: '--hl-visited', ratio: 0.15 },
  { name: '--hl-frontier', ratio: 0.15 },
  { name: '--hl-found', ratio: 0.18 },
];

/**
 * Highlight tokens that also fill SVG `<text>` — the ✓ / + / ✕ / ↔ marker band
 * and the visit-order badge (`.viz-found-mark`, `.viz-insert-mark`,
 * `.viz-delete-mark`, `.viz-swap-mark`, `.viz-badge`). Those glyphs are the
 * NON-color layer of the highlight system: they are text on the `--surface`
 * viz frame and owe 4.5:1, not the 3:1 a stroke owes. This is the assertion
 * that pins A11Y-4 — it is written against the requirement, so it fails on any
 * future palette edit that reverts the repair.
 */
const MARKER_GLYPHS = ['--hl-found', '--hl-swap', '--hl-visited'];

/** Chrome pairings the token table claims, with the level each owes. */
const CORE_PAIRS: { fg: string; bg: string; min: number }[] = [
  { fg: '--text', bg: '--bg', min: AA_TEXT },
  { fg: '--text', bg: '--surface', min: AA_TEXT },
  { fg: '--text-muted', bg: '--bg', min: AA_TEXT },
  { fg: '--text-muted', bg: '--surface', min: AA_TEXT },
  { fg: '--brand', bg: '--bg', min: AA_TEXT },
  { fg: '--brand-contrast', bg: '--brand', min: AA_TEXT },
  // tokens.css documents --border-strong as "input borders, meaningful icons
  // (>=3:1)" — a 1.4.11 obligation, so it is gated at the graphics level.
  { fg: '--border-strong', bg: '--surface', min: AA_GRAPHICS },
  { fg: '--border-strong', bg: '--bg', min: AA_GRAPHICS },
];

for (const theme of THEME_NAMES) {
  describe(`tokens.css — ${theme} theme contrast`, () => {
    const color = (name: string): Rgb => parseHex(token(theme, name));

    for (const { fg, bg, min } of CORE_PAIRS) {
      it(`${fg} on ${bg} is at least ${min}:1`, () => {
        expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(min);
      });
    }

    for (const { name, ratio } of HIGHLIGHT_FILLS) {
      const percent = `${ratio * 100}%`;

      it(`${name} stroke is at least ${AA_GRAPHICS}:1 on its own ${percent} tinted fill`, () => {
        const hl = color(name);
        const fill = mixSrgb(hl, color('--surface'), ratio);
        expect(contrast(hl, fill)).toBeGreaterThanOrEqual(AA_GRAPHICS);
      });

      it(`--text is at least ${AA_TEXT}:1 on the ${name} ${percent} tinted fill`, () => {
        const fill = mixSrgb(color(name), color('--surface'), ratio);
        expect(contrast(color('--text'), fill)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }

    for (const name of MARKER_GLYPHS) {
      it(`${name} marker glyphs are at least ${AA_TEXT}:1 on --surface`, () => {
        expect(
          contrast(color(name), color('--surface')),
        ).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  });
}

describe('tokens.css — dark theme mirror', () => {
  /**
   * tokens.css states the `prefers-color-scheme: dark` fallback "MUST stay
   * byte-identical" to `[data-theme="dark"]`; miss an addition there and OS-dark
   * readers with no stored theme key get an undefined variable. Literal bytes
   * cannot be compared (the two blocks differ in nesting indent and one carries
   * an explanatory comment), so the invariant is enforced at the level that
   * actually matters: the same declarations, with the same values, in the same
   * order.
   */
  it('declares exactly the same properties, values, and order as [data-theme="dark"]', () => {
    expect(MIRROR_OVERRIDES).toEqual(DARK_OVERRIDES);
  });

  it('overrides every color token the light theme declares as a hex value', () => {
    const lightHexTokens = ROOT.filter(
      ([name, value]) => name.startsWith('--') && /^#[0-9a-f]{6}$/i.test(value),
    ).map(([name]) => name);
    const overridden = new Set(DARK_OVERRIDES.map(([name]) => name));
    expect(lightHexTokens.filter((name) => !overridden.has(name))).toEqual([]);
  });
});
