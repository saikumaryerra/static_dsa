import { expect } from 'vitest';

/**
 * Asserts the common `renderStatic` shell every renderer must produce: a
 * `role="img"` SVG, a numeric viewBox, a `<title>` = the algorithm label, and a
 * `<desc>` that MIRRORS `step.explanation` (design §3.1). Not a `.test.ts` file,
 * so Vitest imports it but never runs it as a suite.
 */
export function expectShell(
  svg: string,
  opts: { title: string; desc: string; idBase: string },
): void {
  expect(svg).toContain('role="img"');
  expect(svg).toMatch(/viewBox="0 0 \d/);
  expect(svg).toContain(`<title id="${opts.idBase}-t">${opts.title}</title>`);
  expect(svg).toContain(`<desc id="${opts.idBase}-d">${opts.desc}</desc>`);
}
