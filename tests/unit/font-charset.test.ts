/**
 * The standing guard on the self-hosted webfont subsets (redesign 2026-08).
 *
 * `public/fonts/*.woff2` are cut to exactly the characters this repo can render,
 * and that set is DERIVED from `src/` by `npm run fonts` rather than hand-listed
 * — because a hand-listed set drifts the moment a lesson gains a character, and
 * the failure mode is silent: one glyph rendered from an unrelated fallback in
 * the middle of a word, on a page nobody re-screenshots.
 *
 * This test re-derives the set the same way the script does and fails when the
 * two disagree. The fix is always `npm run fonts`, then commit the two woff2
 * files and the regenerated manifest.
 *
 * It also pins the two things about the subsets that are claims about the build:
 * the byte sizes (measured, never estimated — CLAUDE.md's budget rule) and the
 * list of glyphs neither face draws.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FONT_BYTES,
  FONT_CHARSET,
  FONT_FALLBACK_GLYPHS,
} from '../../src/styles/font-charset';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const SRC = path.join(ROOT, 'src');

/** Mirrors `scripts/build-fonts.mjs` — keep the two extension lists in step. */
const SCANNED = new Set(['.astro', '.mdx', '.ts', '.tsx', '.css', '.json']);

/**
 * Every character present in the site's source, with the ones that have no glyph
 * to subset (control characters and the space) removed.
 *
 * @param dir - Directory to walk.
 * @param into - Accumulating map of character → the file it was first seen in,
 *               so a failure names somewhere to look rather than just a codepoint.
 * @returns The map.
 */
function collect(
  dir: string,
  into = new Map<string, string>(),
): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) collect(full, into);
    else if (SCANNED.has(path.extname(name))) {
      for (const ch of readFileSync(full, 'utf8')) {
        const code = ch.codePointAt(0)!;
        if (code < 0x21 || code > 0xffff) continue;
        if (!into.has(ch)) into.set(ch, path.relative(ROOT, full));
      }
    }
  }
  return into;
}

describe('webfont subsets', () => {
  it('cover every character the source can render', () => {
    const covered = new Set([...FONT_CHARSET]);
    const missing = [...collect(SRC)]
      .filter(([ch]) => !covered.has(ch))
      .map(
        ([ch, file]) =>
          `${ch} (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}) first seen in ${file}`,
      );
    expect(
      missing,
      `These characters are outside the committed font subsets, so they would render from an unrelated fallback font. Run \`npm run fonts\` and commit public/fonts/*.woff2 with the regenerated src/styles/font-charset.ts.\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('state their real byte sizes', () => {
    // A size in a comment is a claim about the build (CLAUDE.md); this is where
    // the claim is checked against the file on disk.
    for (const [file, bytes] of Object.entries(FONT_BYTES)) {
      expect(
        statSync(path.join(ROOT, 'public', 'fonts', file)).size,
        file,
      ).toBe(bytes);
    }
  });

  it('leave only the known geometric markers to the system font', () => {
    // Every one of these is a marker the site has ALWAYS set in the system stack
    // (visualizer carets, the delete mark, null/empty symbols, the legend's
    // comparing and range swatches, the superscript in O(2ⁿ)), so self-hosting
    // did not move them. A new entry is a decision — redraw it as SVG, swap it
    // for a covered character, or accept the fallback deliberately.
    expect(FONT_FALLBACK_GLYPHS).toBe('ⁿ⇒⇔∅⋯⌀▲▶▼✕✗');
  });
});
