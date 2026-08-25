/**
 * Token contrast matrix — the automated half of spec §12/§13's AA claim, and the
 * standing guard for M7.1 A11Y-4 (the `--hl-found` / `--hl-swap` light repairs)
 * and M7.3 VD-3 (the elevation inversion, which moved the backdrop under every
 * pairing below).
 *
 * Why a unit test and not axe: axe never evaluates SVG `<text>`, and it cannot
 * see a `color-mix()` fill at all, so the two places the highlight palette is
 * actually read — the tinted cell fills and the marker glyphs — have no runtime
 * a11y coverage. This test reads the stylesheets from disk, parses the declared
 * hex values, and computes WCAG 2.1 contrast in plain arithmetic: pure,
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
 *
 * THREE FILES, because M7.3 spread the palette across three:
 *   src/styles/tokens.css ......... the source of truth, in three theme blocks.
 *   src/styles/global.css ......... a FOURTH copy of the light palette inside
 *     `@media print`, which forces light tokens onto paper (PRN-1). Its own
 *     comment asks for a test pinning it to `:root` "identical in VALUE, not in
 *     bytes" — that is the print-palette describe below.
 *   src/components/DifficultyChip.astro ... which declares NO palette of its
 *     own. VD-6's semantic `--chip-*` fills were built and then not shipped
 *     (design review withheld sign-off), so the chip is back to reading
 *     `--text-muted` / `--surface` / `--border` — and the describe near the foot
 *     of this file is what keeps it that way, since a component-local hex is
 *     precisely what the three blocks above cannot reach.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

// --------------------------------------------------------------------------
// CSS parsing (deliberately tiny: known selectors, flat declarations)
// --------------------------------------------------------------------------

/** Drops comments so a commented-out declaration can never be read as live. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** One `selector { … }` (or at-rule) found anywhere in a stylesheet. */
interface CssRule {
  /** Selector or at-rule prelude, trimmed with interior whitespace collapsed. */
  prelude: string;
  /** Everything between this rule's braces, verbatim. */
  body: string;
  /** Preludes of the enclosing rules, outermost first (`@media print`, …). */
  ancestors: string[];
}

/**
 * Every rule in `source`, at every nesting depth.
 *
 * Written by hand rather than with a CSS parser dependency (spec §4), and
 * brace-balanced so an `@media` wrapper cannot truncate a block. `;` resets the
 * prelude accumulator, which is what keeps a declaration (`color: red;`) from
 * being read as the start of a selector.
 */
function cssRules(source: string, ancestors: string[] = []): CssRule[] {
  const found: CssRule[] = [];
  let prelude = '';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (char === ';') {
      prelude = '';
      continue;
    }
    if (char !== '{') {
      prelude += char;
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let j = i; j < source.length; j += 1) {
      if (source[j] === '{') depth += 1;
      else if (source[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) throw new Error(`unbalanced braces after "${prelude.trim()}"`);
    const rule: CssRule = {
      prelude: prelude.trim().replace(/\s+/g, ' '),
      body: source.slice(i + 1, end),
      ancestors,
    };
    found.push(rule, ...cssRules(rule.body, [...ancestors, rule.prelude]));
    prelude = '';
    i = end;
  }
  return found;
}

/**
 * Parses `prop: value;` pairs in source order. Custom properties AND regular
 * declarations (`color-scheme`) are captured — the mirror invariants below have
 * to compare the whole block, not just the variables.
 */
function declarations(block: string): [string, string][] {
  const pairs: [string, string][] = [];
  const decl = /([a-zA-Z-][\w-]*)\s*:\s*([^;{}]+);/g;
  let match: RegExpExecArray | null;
  while ((match = decl.exec(block)) !== null) {
    // Collapse interior whitespace: tokens.css aligns some values with extra
    // spaces purely for readability, and Prettier wraps long shadow values —
    // neither must read as a value change.
    pairs.push([match[1]!, match[2]!.trim().replace(/\s+/g, ' ')]);
  }
  if (pairs.length === 0) throw new Error('empty declaration block');
  return pairs;
}

/**
 * The declarations of the ONE rule matching `match`.
 *
 * "One" is the point: two hits mean the selector is ambiguous and the test would
 * silently assert against whichever came first, so ambiguity fails loudly here
 * instead of quietly weakening every assertion downstream.
 */
function block(
  rules: CssRule[],
  what: string,
  match: (rule: CssRule) => boolean,
): [string, string][] {
  const hits = rules.filter(match);
  if (hits.length !== 1) {
    throw new Error(
      `${what}: expected exactly 1 matching rule, found ${hits.length}`,
    );
  }
  return declarations(hits[0]!.body);
}

/** Top-level (not nested in an at-rule) rule with exactly this selector. */
const topLevel =
  (selector: string) =>
  (rule: CssRule): boolean =>
    rule.ancestors.length === 0 && rule.prelude === selector;

const TOKENS = cssRules(stripComments(read('../../src/styles/tokens.css')));
const GLOBAL = cssRules(stripComments(read('../../src/styles/global.css')));

const ROOT = block(TOKENS, 'tokens.css :root', topLevel(':root'));
const DARK_OVERRIDES = block(
  TOKENS,
  'tokens.css [data-theme="dark"]',
  topLevel('[data-theme="dark"]'),
);
const MIRROR_OVERRIDES = block(
  TOKENS,
  'tokens.css prefers-color-scheme mirror',
  (rule) =>
    rule.prelude === ':root:not([data-theme])' &&
    rule.ancestors.join(' ') === '@media (prefers-color-scheme: dark)',
);
/** global.css's `@media print` copy of the light palette (M7.3 PRN-1). */
const PRINT_PALETTE = block(
  GLOBAL,
  'global.css @media print palette',
  (rule) =>
    rule.ancestors.join(' ') === '@media print' &&
    rule.prelude.startsWith(':root,'),
);

/** Every `:root` token whose value is a literal colour (so: theme-dependent). */
const LIGHT_HEX_TOKENS = ROOT.filter(
  ([name, value]) => name.startsWith('--') && /^#[0-9a-f]{6}$/i.test(value),
).map(([name]) => name);

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
  if (!hex) throw new Error(`${value} is not a 6-digit hex color`);
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
  // M7.2's --accent-warn, gated by the ROLE it plays on each backdrop rather
  // than by one blanket level — it is the only chrome token that is both text
  // and a keyline. BOTH rows are now text-level:
  //   on --bg  — `.codetabs__copy[data-copy-failed]` colours its "Copy failed"
  //     label with it at --text-xs, on a button still filled with --bg after
  //     VD-8. Small text, so 1.4.3 asks the full 4.5:1 (this row also subsumes
  //     the keyline that button, and `[aria-invalid]` inputs, draw on --bg).
  //   on --surface — M7.3 CMP-11 routes the WARNING CALLOUT's head through it,
  //     and a callout is filled with --surface, so what used to be a 3:1
  //     keyline obligation is now a 4.5:1 text one. The keylines that share the
  //     backdrop (`.viz-error` / `.viz-unavailable` border-left, the /learn
  //     reset panel) are subsumed by the stricter floor.
  { fg: '--accent-warn', bg: '--bg', min: AA_TEXT },
  { fg: '--accent-warn', bg: '--surface', min: AA_TEXT },

  // ---- M7.3 VD-3: the two elevation levels the inversion added ----
  // Level -1, `--surface-sunken`: input wells, code chrome, `.viz-pill` (metric
  // and legend chips, whose label is --text-muted and whose <b> value is
  // --text), and `.btn-secondary:active`.
  { fg: '--text', bg: '--surface-sunken', min: AA_TEXT },
  { fg: '--text-muted', bg: '--surface-sunken', min: AA_TEXT },
  { fg: '--border-strong', bg: '--surface-sunken', min: AA_GRAPHICS },
  // Level 2, `--surface-raised`. The keyline for a raised panel is --text-muted,
  // and that is the pairing gated here. There is still deliberately NO
  // --border-strong row for this backdrop, but its original reason is gone: the
  // pairing was a documented 1.4.11 trap at 2.64:1 in dark, and the achromatic
  // repaint took it to 3.15:1 dark / 4.05:1 light. Two reasons the row stays out
  // anyway — nothing in src/ paints it (this matrix gates what the browser
  // draws, never what the token table permits), and 0.15 above the graphics
  // floor is no reason to move a keyline that already has 6.61:1. Add the row if
  // and only if something starts drawing that pairing.
  { fg: '--text', bg: '--surface-raised', min: AA_TEXT },
  // --text-muted on the raised fill does TWO jobs and is gated by the stricter
  // of them. It is the level-2 KEYLINE (1.4.11, 3:1), but the level-2 surface is
  // reached by hovering a level-1 card, and `.track-card` is a block of copy
  // whose label, summary and meta lines are all --text-muted — so the same
  // pairing is also body TEXT at 1.4.3's 4.5:1 for as long as the pointer rests
  // there. Measured 7.58:1 light / 4.89:1 dark: the dark side clears the text
  // floor by 0.39, which is exactly why this row is gated at 4.5 rather than 3 —
  // at the graphics floor a dark-scale tweak could take the hovered card's own
  // description below AA without failing anything.
  { fg: '--text-muted', bg: '--surface-raised', min: AA_TEXT },

  // ---- M7.3 VD-5: the brand tint family ----
  // `--brand-soft` is a real reading surface: the home hero's demo panel and the
  // /404 panel are filled with it (both captions --text-muted; only the hero's
  // panel carries a --brand CTA — /404's figure is deliberately not a link and
  // paints no --brand at all), `.btn-secondary` and `.viz-btn` hover into it
  // with --text on top, and the glossary letter strip hovers into it with a
  // --brand edge. The third row is what holds the hero CTA to AA (14.86:1 light
  // / 12.90:1 dark) and, at the same numbers by construction, the strip's hover
  // keyline to 1.4.11.
  // It used to be described as holding the strip's hovered LETTER: the strip
  // hovered its label to --brand, and the achromatic repaint made --brand
  // byte-identical to --text, so that half became a no-op and the chip took a
  // border instead (glossary.astro). The row survives the rewrite because the
  // hero CTA still draws it — but rows one and three are now the same
  // measurement, and only row one is load-bearing on its own.
  { fg: '--text', bg: '--brand-soft', min: AA_TEXT },
  { fg: '--text-muted', bg: '--brand-soft', min: AA_TEXT },
  { fg: '--brand', bg: '--brand-soft', min: AA_TEXT },
  // `.btn-primary:hover` swaps the fill to --brand-hover and keeps the label.
  { fg: '--brand-contrast', bg: '--brand-hover', min: AA_TEXT },
  // Post-inversion a card is --surface, so every brand affordance ON a card
  // (`.lesson-card__cta`, the hovered card title, inline prose links) is read
  // against white rather than the old grey.
  { fg: '--brand', bg: '--surface', min: AA_TEXT },
  // `--brand-border` is absent ON PURPOSE. tokens.css declares it decorative,
  // exactly like `--border` (1.49:1 light / 1.61:1 dark on --surface): it may
  // tint an edge but must never be the only thing defining an interactive
  // control's boundary, so no contrast floor applies to it. Giving it one here
  // would quietly promote it to a keyline token.
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

    /**
     * The elevation ladder, as ORDER rather than as ratios (M7.3 VD-3).
     *
     * No contrast floor applies — the levels are deliberately close (1.06:1 to
     * 1.21:1) and the pre-attentive separation comes from `--shadow-1`, not from
     * the fill. What must never change is the DIRECTION: a card sits above the
     * canvas and a well sits below the card, in both themes. Light used to have
     * exactly one surface level, and this is the assertion that fails if the
     * inversion is ever undone by a well-meaning "the page should be white" edit.
     */
    it('stacks sunken < surface <= raised, with the canvas below the card', () => {
      const level = (name: string): number => luminance(color(name));
      expect(level('--surface-sunken')).toBeLessThan(level('--surface'));
      expect(level('--bg')).toBeLessThan(level('--surface'));
      expect(level('--surface-raised')).toBeGreaterThanOrEqual(
        level('--surface'),
      );
    });

    for (const name of MARKER_GLYPHS) {
      it(`${name} marker glyphs are at least ${AA_TEXT}:1 on --surface`, () => {
        expect(
          contrast(color(name), color('--surface')),
        ).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  });
}

// --------------------------------------------------------------------------
// M7.3 VD-5 — the one token with no floor at all
// --------------------------------------------------------------------------

/** Every `.css` and `.astro` file under `src/`, for the source scan below. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  const here = fileURLToPath(new URL(dir, import.meta.url));
  for (const entry of readdirSync(here, { withFileTypes: true })) {
    if (entry.isDirectory()) sourceFiles(`${dir}/${entry.name}`, found);
    else if (/\.(css|astro)$/.test(entry.name))
      found.push(`${dir}/${entry.name}`);
  }
  return found;
}

/**
 * Selector shapes that mean "a pointer or a keyboard can reach this": an
 * interactive element name, a state pseudo-class, or one of the naming
 * conventions this codebase uses for controls.
 *
 * It reads SELECTOR TEXT, and that bounds what it can see: a control styled
 * through a class that says nothing about interactivity — `.hero-demo`, which is
 * an `<a>` — is invisible to it, and its resting/hover rules would have to be
 * caught by review. What it does catch is every rule that names the element, its
 * state, or the `btn`/`link`/`-control` conventions, which is where a keyline
 * mistake actually gets written.
 */
const INTERACTIVE =
  /(^|[\s,>+~(])(a|button|input|select|textarea|summary|label)\b|:hover|:focus|:active|\[href|btn|link|-control/;

/**
 * `--brand-border` is the only colour token the matrix above gates at NOTHING,
 * on the strength of one word in tokens.css: "decorative". That is a claim, and
 * an unverified claim in a comment is how a token drifts into a job it cannot
 * do — so both halves of it are checked here.
 *
 * The measurement is the reason the exemption is safe (it cannot carry meaning,
 * so nothing may make it try); the scan is the reason it stays safe.
 */
describe('tokens.css — --brand-border carries no meaning', () => {
  /** The fills a brand-tinted edge could plausibly be drawn on. */
  const BACKDROPS = ['--surface', '--surface-raised', '--brand-soft', '--bg'];

  for (const theme of THEME_NAMES) {
    it(`${theme}: is below the ${AA_GRAPHICS}:1 a meaningful boundary owes`, () => {
      // Measured 1.33:1–1.49:1 light and 1.38:1–2.06:1 dark. This asserts the
      // token CANNOT serve as a keyline, which is precisely why it has no row in
      // CORE_PAIRS. If a future palette lifts it past 3:1, this test fails — and
      // the fix is not to widen it here but to decide, deliberately, whether the
      // token has been promoted to keyline duty and give it a real floor.
      const brand = parseHex(token(theme, '--brand-border'));
      for (const backdrop of BACKDROPS) {
        expect(
          contrast(brand, parseHex(token(theme, backdrop))),
          `--brand-border on ${backdrop}`,
        ).toBeLessThan(AA_GRAPHICS);
      }
    });
  }

  it('is never the boundary of an interactive control', () => {
    // The rule the "decorative" label actually imposes (tokens.css: "may tint an
    // edge but must never be the only thing defining an interactive control's
    // boundary"). Today the token has no consumer at all — /404's panel reaches
    // for `--border` and says why — so this passes on an empty set, and the
    // first consumer to break the rule is the one that fails it.
    const offenders: string[] = [];
    const mentions: string[] = [];
    const files = sourceFiles('../../src');
    // Non-vacuous, twice over: the walk really reached the source tree, and the
    // token really is findable through it. Without these two lines a broken
    // path, or a `<style>` extraction that quietly returned nothing, would read
    // as "no offenders" forever.
    expect(files.length).toBeGreaterThan(20);

    for (const file of files) {
      const source = stripComments(read(file));
      // `.astro` files carry CSS only inside <style>; a component that merely
      // named the token in prose must not register as a use.
      const css = file.endsWith('.astro')
        ? [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
            .map((match) => match[1])
            .join('\n')
        : source;
      if (!css.includes('--brand-border')) continue;
      mentions.push(file);
      for (const rule of cssRules(css)) {
        // Read against the raw body rather than `declarations()`, which is
        // written for known blocks and throws on one holding only nested rules.
        const draws = /(?:border|outline)[a-z-]*\s*:[^;{}]*--brand-border/.test(
          rule.body,
        );
        if (draws && INTERACTIVE.test(rule.prelude)) {
          offenders.push(`${file}: ${rule.prelude}`);
        }
      }
    }
    expect(mentions.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

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
    const overridden = new Set(DARK_OVERRIDES.map(([name]) => name));
    expect(LIGHT_HEX_TOKENS.filter((name) => !overridden.has(name))).toEqual(
      [],
    );
  });
});

// --------------------------------------------------------------------------
// M7.3 PRN-1 — the print palette is a fourth copy of the light one
// --------------------------------------------------------------------------

/**
 * Case- and number-form-insensitive value, for comparing across files.
 *
 * tokens.css is in `.prettierignore` and keeps uppercase hex and `0.10`;
 * global.css is Prettier-formatted and is rewritten to lowercase and `0.1`. The
 * two are meant to be identical in VALUE, not in bytes — global.css says so in
 * the comment above the print block and explicitly asks that the casing not be
 * "fixed", because Prettier only brings it back.
 */
function normalizeValue(value: string): string {
  return value.toLowerCase().replace(/\d*\.\d+/g, (n) => String(Number(n)));
}

describe('global.css — @media print forces the light palette', () => {
  /**
   * A dark-theme print is near-white text on white paper: browsers drop
   * background COLOURS by default but never text colours, so without this block
   * the sheet arrives almost blank. The e2e half (tests/e2e/m7-print-hcm.spec.ts)
   * proves the cascade actually wins in a browser; this half proves the VALUES
   * being forced are the real light palette and not a stale hand-copy.
   */
  it('matches tokens.css :root, value for value', () => {
    const light = new Map(ROOT);
    const wrong = PRINT_PALETTE.filter(
      ([name, value]) =>
        normalizeValue(light.get(name) ?? '') !== normalizeValue(value),
    ).map(
      ([name, value]) =>
        `${name}: print "${value}" vs :root "${light.get(name) ?? '<undeclared>'}"`,
    );
    expect(wrong).toEqual([]);
  });

  it('covers every colour token :root declares as a hex value', () => {
    const forced = new Set(PRINT_PALETTE.map(([name]) => name));
    expect(LIGHT_HEX_TOKENS.filter((name) => !forced.has(name))).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// M7.3 VD-6 — the difficulty chip, which stayed neutral
// --------------------------------------------------------------------------

const CHIP_SOURCE = read('../../src/components/DifficultyChip.astro');
const CHIP_STYLE = /<style>([\s\S]*?)<\/style>/.exec(CHIP_SOURCE)?.[1];
if (CHIP_STYLE === undefined) {
  throw new Error('DifficultyChip.astro: no <style> block found');
}
const CHIP_RULES = cssRules(stripComments(CHIP_STYLE));

/** The one rule the component ships. */
const CHIP = new Map(
  block(
    CHIP_RULES,
    'DifficultyChip.astro .difficulty-chip',
    (rule) =>
      rule.ancestors.length === 0 && rule.prelude === '.difficulty-chip',
  ),
);

/**
 * VD-6 proposed soft semantic fills for the chip, built them, and did NOT ship
 * them: design review withheld the sign-off spec §8 requires, so the M1 neutral
 * pill stands (the reasoning is recorded in the component's own header and in
 * docs/m7-ux-overhaul.md — a re-colour is a spec amendment, not a bug fix).
 *
 * These assertions guard the treatment that actually shipped, and they are the
 * cheap half of that guard: a neutral chip drawn ONLY from tokens inherits every
 * other guarantee this file already proves — both themes, the OS-dark mirror,
 * and the print palette — so the chip needs no palette of its own in any of the
 * four contexts the reverted version had to declare one for.
 *
 * The label's floor is the strict one: `--text-xs` is a fixed 12px, so it is
 * body text owing 1.4.3's 4.5:1, never a 3:1 graphic.
 */
describe('DifficultyChip — the neutral pill', () => {
  it('paints itself entirely from tokens', () => {
    // The property that makes the three assertions below redundant work for
    // free — and that keeps the chip off the print sheet's problem list, since
    // global.css forces the light TOKENS and a component-local hex would sail
    // straight past that.
    expect(stripComments(CHIP_STYLE)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(CHIP.get('color')).toBe('var(--text-muted)');
    expect(CHIP.get('background-color')).toBe('var(--surface)');
    expect(CHIP.get('border')).toBe('1px solid var(--border)');
  });

  it('carries no theme-, difficulty- or media-scoped variant', () => {
    // What "neutral" means structurally: one rule, no `[data-difficulty]` fork,
    // no dark block, no print block. This is the assertion that fails if the
    // withheld semantic fills are reintroduced without the sign-off — which is
    // the point, since the failure is the conversation.
    const scoped = CHIP_RULES.filter(
      (rule) =>
        /data-difficulty|data-theme|prefers-color-scheme/.test(rule.prelude) ||
        rule.ancestors.some((ancestor) =>
          /prefers-color-scheme|print/.test(ancestor),
        ),
    ).map((rule) => [...rule.ancestors, rule.prelude].join(' '));
    expect(scoped).toEqual([]);
  });

  for (const theme of THEME_NAMES) {
    // Two backdrops, because the chip renders in two places: on a lesson CARD
    // (`--surface`) in the /learn grid, and on the page CANVAS (`--bg`) in the
    // lesson meta row. Measured 7.58:1 / 7.24:1 light and 5.71:1 / 7.30:1 dark.
    for (const backdrop of ['--surface', '--bg'] as const) {
      it(`${theme} label is at least ${AA_TEXT}:1 on ${backdrop}`, () => {
        expect(
          contrast(
            parseHex(token(theme, '--text-muted')),
            parseHex(token(theme, backdrop)),
          ),
        ).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  /**
   * design-tokens-m1.md Decision 3 reserves the six `--hl-*` roles for the
   * visualization, and the chip is where that reservation is most likely to
   * erode — "Beginner" reads as green, and so is `--hl-found`. Assert the
   * component reaches for neither the tokens nor the Tailwind aliases mapped
   * from them.
   */
  it('never reads a visualization highlight token', () => {
    expect(stripComments(CHIP_STYLE)).not.toMatch(/var\(--hl-|--color-hl-/);
  });
});

// --------------------------------------------------------------------------
// The glossary letter strip (M7.3 CMP-8 hover idiom)
// --------------------------------------------------------------------------

/**
 * 26 targets in one row. The chip hovers on the same idiom `.btn-secondary` and
 * `.viz-btn` use — a `--brand-soft` fill under a `--brand` edge — which it did
 * NOT until the achromatic repaint: it used to move the fill and the LABEL
 * instead, having no border at all, and that second half stopped signalling
 * anything the moment `--brand` became byte-identical to `--text`. Both halves
 * of the hover are gated in CORE_PAIRS; what is checked here is the third state,
 * the empty letters, which is not a token pairing at all.
 */
describe('glossary letter strip — the dimmed letters', () => {
  for (const theme of THEME_NAMES) {
    it(`${theme}: an empty letter reads as unmistakably weaker than a live one`, () => {
      // `color-mix(in srgb, var(--text-muted) 55%, transparent)` over the bar,
      // which is the page canvas. A translucent colour has no contrast of its
      // own, so it is composited first — the same arithmetic the cell fills use
      // above, with `--bg` as the bottom layer.
      const dimmed = mixSrgb(
        parseHex(token(theme, '--text-muted')),
        parseHex(token(theme, '--bg')),
        0.55,
      );
      const bar = parseHex(token(theme, '--bg'));
      const live = contrast(parseHex(token(theme, '--text')), bar);
      const dim = contrast(dimmed, bar);

      // No AA floor applies and none is asserted: the empty letters are
      // `aria-disabled` <span>s that Tab skips, i.e. inactive user interface
      // components, which 1.4.3 exempts by name (measured 2.55:1 light /
      // 3.02:1 dark against the bar). What IS required is that the dimming is a
      // real second signal beside `aria-disabled` rather than a token gesture,
      // so the gap to a live letter is what gets a floor.
      expect(dim).toBeLessThan(live / 2);
    });
  }
});
