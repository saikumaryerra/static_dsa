/**
 * Computed-colour helpers shared by the e2e specs (M7.3).
 *
 * Lives OUTSIDE the `*.spec.ts` pattern for the same reason `scroll.ts` does:
 * importing one spec from another makes Playwright register the imported file's
 * tests twice.
 *
 * Why compute contrast in the browser-facing half of the suite at all, when
 * `tests/unit/tokens-contrast.test.ts` already computes the whole matrix from
 * the stylesheets? Because that test proves the DECLARED values are AA; it
 * cannot prove the right block WON the cascade. The print sheet is exactly that
 * kind of claim — a fourth copy of the light palette that has to out-specify
 * `[data-theme="dark"]` AND the `prefers-color-scheme` mirror — so the only
 * honest check is to read back what the engine actually resolved.
 */
import type { Locator, Page } from '@playwright/test';

/** An sRGB colour, 0–255 per channel. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parses a computed colour string (`rgb(15, 23, 42)` / `rgb(15 23 42)` /
 * `rgba(…)`) into channels.
 *
 * Only the opaque forms a computed `color` / `background-color` can take are
 * supported; anything else — `transparent`, a gradient, a colour space this
 * helper has never seen — throws rather than silently scoring as black, which
 * would turn a contrast assertion into a coin flip.
 *
 * @param value - A computed CSS colour string.
 * @returns The parsed channels.
 */
export function parseRgb(value: string): Rgb {
  const channels = value.match(/[\d.]+/g);
  if (!channels || channels.length < 3) {
    throw new Error(`not a parseable rgb() colour: ${value}`);
  }
  const alpha = channels[3] === undefined ? 1 : Number(channels[3]);
  if (alpha !== 1) {
    throw new Error(`translucent colours have no single contrast: ${value}`);
  }
  return {
    r: Number(channels[0]),
    g: Number(channels[1]),
    b: Number(channels[2]),
  };
}

/**
 * Parses `#RRGGBB` — the form every token, every `theme-color` meta and every
 * Shiki inline colour is authored in — into channels.
 *
 * Needed because the two halves of a claim are written in different notations:
 * a meta's `content` is hex, while `getComputedStyle` always answers in `rgb()`.
 * Comparing them without converting one is how a mismatch hides.
 *
 * @param value - A 6-digit hex colour, with or without surrounding whitespace.
 * @returns The parsed channels.
 */
export function parseHex(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!hex) throw new Error(`not a 6-digit hex colour: ${value}`);
  const n = parseInt(hex[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Plain white — the paper a printer leaves where it drops a background. */
export const PAPER: Rgb = { r: 255, g: 255, b: 255 };

/** sRGB → linear-light for one 0–1 channel (WCAG 2.1 relative luminance). */
function toLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * WCAG 2.1 relative luminance of a colour.
 *
 * @param colour - Parsed sRGB channels.
 * @returns Luminance in 0–1.
 */
export function luminance({ r, g, b }: Rgb): number {
  return (
    0.2126 * toLinear(r / 255) +
    0.7152 * toLinear(g / 255) +
    0.0722 * toLinear(b / 255)
  );
}

/**
 * WCAG 2.1 contrast ratio between two colours, order-independent.
 *
 * @param a - One colour.
 * @param b - The other colour.
 * @returns The ratio, 1–21.
 */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * One resolved computed style property of an element.
 *
 * @param locator - The element to measure (must resolve to exactly one node).
 * @param property - A camelCased CSSStyleDeclaration property name.
 * @returns The computed value as the engine reports it.
 */
export function computed(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (el, name) =>
      getComputedStyle(el)[name as keyof CSSStyleDeclaration] as string,
    property,
  );
}

/**
 * What a design token resolves to RIGHT NOW, in the page's current theme and
 * media state, serialized the way the engine serializes `property`.
 *
 * Reading the custom property directly would return the authored literal
 * (`#4F46E5`, or a whole shadow list with the source file's line breaks in it),
 * which never compares equal to the `rgb(79, 70, 229)` a computed `color`
 * reports. Painting it onto a throwaway element makes the engine do the
 * conversion, so the comparison is like-for-like — and it keeps working if a
 * token is ever expressed as something other than hex.
 *
 * @param page - The page to resolve against.
 * @param property - A KEBAB-case CSS property to resolve the token through,
 *   e.g. `color` or `box-shadow` (`computed()` above takes camelCase — this one
 *   goes through `setProperty`/`getPropertyValue`, which only speak kebab).
 * @param name - Custom property name, e.g. `--shadow-1`.
 * @returns The computed value as the engine reports it.
 */
export function tokenStyle(
  page: Page,
  property: string,
  name: string,
): Promise<string> {
  return page.evaluate(
    ([prop, token]) => {
      const probe = document.createElement('span');
      probe.style.setProperty(prop!, `var(${token})`);
      document.body.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(prop!);
      probe.remove();
      return value;
    },
    [property, name],
  );
}

/**
 * What a colour token resolves to right now, as a computed colour string.
 *
 * @param page - The page to resolve against.
 * @param name - Custom property name, e.g. `--accent-warn`.
 * @returns The computed colour string.
 */
export function tokenColour(page: Page, name: string): Promise<string> {
  return tokenStyle(page, 'color', name);
}
