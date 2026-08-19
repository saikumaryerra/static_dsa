/**
 * State-vs-state assertions the contrast matrix structurally cannot make.
 *
 * `tokens-contrast.test.ts` pairs every colour against the GROUND behind it, so
 * it passes loudly (18.24:1) on `--brand` even now that `--brand` is
 * byte-identical to `--text`. What it never checks is whether two INTERACTION
 * STATES of the same control remain distinguishable from each other — which is
 * exactly what the achromatic repaint put at risk: with the hue gone, a hover
 * fill and a pressed fill that happen to share a value are pixel-identical, and
 * every existing assertion still passes.
 *
 * The helpers below are COPIED from `tokens-contrast.test.ts` rather than
 * imported, for two reasons that leave no third option: that file exports
 * nothing, and importing a `*.test.ts` module would register its 88 `describe`
 * blocks into this run; adding `export` there would edit a file the palette work
 * is required to leave untouched, since "unedited and green" is what makes it a
 * gate rather than a knob. Kept to the minimum this file reads.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

// --------------------------------------------------------------------------
// CSS parsing (copied — see the header)
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

/** Every rule in `source`, at every nesting depth. */
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

/** Parses `prop: value;` pairs in source order. */
function declarations(block: string): [string, string][] {
  const pairs: [string, string][] = [];
  const decl = /([a-zA-Z-][\w-]*)\s*:\s*([^;{}]+);/g;
  let match: RegExpExecArray | null;
  while ((match = decl.exec(block)) !== null) {
    pairs.push([match[1]!, match[2]!.trim().replace(/\s+/g, ' ')]);
  }
  if (pairs.length === 0) throw new Error('empty declaration block');
  return pairs;
}

/**
 * The declarations of the ONE rule matching `match`. Two hits mean the selector
 * is ambiguous, which fails loudly here rather than quietly asserting against
 * whichever came first.
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

const ROOT = block(TOKENS, 'tokens.css :root', topLevel(':root'));
const DARK_OVERRIDES = block(
  TOKENS,
  'tokens.css [data-theme="dark"]',
  topLevel('[data-theme="dark"]'),
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
// Color math (copied — see the header)
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

/** WCAG contrast ratio between two hex colours, order-independent. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(parseHex(a)), luminance(parseHex(b))].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const THEME_NAMES = ['light', 'dark'] as const;

/**
 * The floor for "this fill moved". The glossary bar's own comment sets it: it
 * rejects the 1.05:1 a `--surface` fill managed as "no perceptible feedback at
 * all" and calls 1.28:1 barely better. 1.1 is deliberately BELOW both — it is
 * the point past which a fill move exists at all, not the point at which it
 * suffices alone, and light has no room above it (`--surface-sunken` is 1.10:1
 * on `--bg`, which is why the hover fill sits one step below the pressed one
 * there). Anything at or under this floor must carry a second signal.
 */
const PERCEPTIBLE_FILL = 1.1;

describe('interaction states stay distinguishable without a hue', () => {
  it('hover fill and active fill are different colours, both themes', () => {
    // `.btn-secondary` (global.css) and `.viz-btn` (Visualizer.astro) fill with
    // --brand-soft on hover and --surface-sunken on active, under the SAME
    // border on both. Identical values make the two states pixel-identical,
    // because Visualizer.astro already establishes that a 1px border move alone
    // "reads as a rendering artefact" — so the fill is the whole signal, and one
    // token move away from the four-state recipe is a no-op nobody would see.
    for (const theme of THEME_NAMES) {
      expect(token(theme, '--brand-soft'), theme).not.toBe(
        token(theme, '--surface-sunken'),
      );
    }
  });

  it('hover fill is a perceptible luminance move from the resting surface', () => {
    // Measured 1.20:1 light / 1.26:1 dark against --bg, and 1.09:1 / 1.24:1
    // against --surface-sunken. With the hue gone the fill carries the move on
    // luminance alone, so a future palette that quietly closes this gap must
    // fail here rather than in a screenshot nobody diffs.
    for (const theme of THEME_NAMES) {
      expect(
        contrast(token(theme, '--brand-soft'), token(theme, '--bg')),
        theme,
      ).toBeGreaterThanOrEqual(PERCEPTIBLE_FILL);
    }
  });

  it('--brand is byte-identical to --text — the premise these tests defend', () => {
    // Not an aspiration: it is the design (the chrome gives up its only hue so
    // the six --hl-* roles keep all of them). Pinned so that if someone
    // reintroduces a brand hue, they are sent here to reconsider the second
    // signals the collapse made necessary.
    for (const theme of THEME_NAMES) {
      expect(token(theme, '--brand'), theme).toBe(token(theme, '--text'));
    }
  });
});

// --------------------------------------------------------------------------
// The glossary A–Z strip — the one control the collapse left with no signal
// --------------------------------------------------------------------------

const GLOSSARY_SOURCE = read('../../src/pages/glossary.astro');
const GLOSSARY_STYLE = /<style>([\s\S]*?)<\/style>/.exec(GLOSSARY_SOURCE)?.[1];
if (GLOSSARY_STYLE === undefined) {
  throw new Error('glossary.astro: no <style> block found');
}
const GLOSSARY_RULES = cssRules(stripComments(GLOSSARY_STYLE));

const chipRule = (selector: string): Map<string, string> =>
  new Map(
    block(GLOSSARY_RULES, `glossary.astro ${selector}`, topLevel(selector)),
  );

/**
 * 26 hover targets in one row, and until the repaint their hover was a fill swap
 * plus a LABEL swap (`--brand` over `--brand-soft`). `--brand` is now `--text`,
 * so the label half evaporated silently and left a 1.20:1 fill change as the
 * entire feedback — under the 1.28:1 the component's own comment already rejects.
 * The border it gained is therefore not decoration, and these two assertions are
 * what stop it being "simplified" back out.
 */
describe('glossary A–Z chip — hover moves more than one property', () => {
  it('hover changes the fill AND the border', () => {
    const hover = chipRule('a.glossary__chip:hover');
    expect(hover.get('background-color')).toBe('var(--brand-soft)');
    // --brand, not --border-strong: the latter is 2.96:1 on the dark hover fill,
    // below the 3:1 a keyline owes, and --brand is the border every other
    // filled-control hover already uses (14.86:1 light / 12.90:1 dark on the
    // fill, 17.77:1 / 16.20:1 on the bar behind it).
    expect(hover.get('border-color')).toBe('var(--brand)');
  });

  it('the resting chip already reserves the border box', () => {
    // A border that only exists while hovered would reflow 26 chips under the
    // pointer. The resting rule declares it transparent, so the hover paints
    // into space the box already occupies.
    expect(chipRule('.glossary__chip').get('border')).toBe(
      '1px solid transparent',
    );
  });
});
