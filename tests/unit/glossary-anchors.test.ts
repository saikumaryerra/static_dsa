/**
 * Glossary anchors — the cross-linking spine's standing guard (M7.2, workstream E).
 *
 * Two invariants, both of which rot silently in production rather than failing
 * loudly:
 *
 * 1. `termAnchor()` must be collision-free across the whole glossary. Two terms
 *    slugifying alike would emit a duplicate `id` (invalid HTML), make one entry
 *    permanently unreachable, and send every deep link to the wrong definition.
 *    `glossary.astro` also throws on this at build time; this test is the fast
 *    feedback loop and pins the exact slugs the lessons hardcode.
 * 2. Every `/glossary#…` link written in lesson prose must resolve to a real
 *    term. Those 40 anchors are hand-authored strings — renaming a term (say
 *    "Quick sort" → "Quicksort") is a one-word edit that quietly breaks them,
 *    exactly the dead-cross-link class the glossary's own build guard exists to
 *    prevent in the other direction.
 *
 * Pure fs + string work, so it runs correctly under the harness's
 * `environment: 'node'` (no DOM, no Astro renderer) — the same shape as
 * `tokens-contrast.test.ts`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { glossary, termAnchor } from '../../src/lib/glossary';

const LESSONS_DIR = fileURLToPath(
  new URL('../../src/content/lessons', import.meta.url),
);

/** Every lesson body as raw MDX text, keyed by filename. */
function readLessons(): Array<{ file: string; source: string }> {
  return readdirSync(LESSONS_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .sort()
    .map((file) => ({
      file,
      source: readFileSync(`${LESSONS_DIR}/${file}`, 'utf8'),
    }));
}

/** The anchor of every markdown link into the glossary, in document order. */
function glossaryLinksIn(source: string): string[] {
  return [...source.matchAll(/\]\(\/glossary#([^)\s]+)\)/g)].map((m) => m[1]!);
}

describe('termAnchor', () => {
  it('produces URL-safe lowercase slugs', () => {
    expect(termAnchor('Big-O notation')).toBe('big-o-notation');
    expect(termAnchor('Breadth-first search')).toBe('breadth-first-search');
    expect(termAnchor('LIFO')).toBe('lifo');
    // Punctuation collapses to single hyphens and never leaves a trailing one.
    expect(termAnchor('  Optimal substructure! ')).toBe('optimal-substructure');
  });

  it('is collision-free across every glossary term', () => {
    const owners = new Map<string, string[]>();
    for (const { term } of glossary) {
      const anchor = termAnchor(term);
      owners.set(anchor, [...(owners.get(anchor) ?? []), term]);
    }
    const collisions = [...owners].filter(([, terms]) => terms.length > 1);
    expect(collisions).toEqual([]);
    expect(owners.size).toBe(glossary.length);
  });

  it('never yields an empty anchor', () => {
    for (const { term } of glossary) {
      expect(termAnchor(term), `term "${term}"`).not.toBe('');
    }
  });
});

describe('lesson → glossary cross-links', () => {
  const anchors = new Set(glossary.map((t) => termAnchor(t.term)));

  it('every /glossary# link in a lesson resolves to a real term', () => {
    const dead: string[] = [];
    for (const { file, source } of readLessons()) {
      for (const anchor of glossaryLinksIn(source)) {
        if (!anchors.has(anchor)) dead.push(`${file} → #${anchor}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('links each term at most once per lesson (first bold use only)', () => {
    const repeated: string[] = [];
    for (const { file, source } of readLessons()) {
      const seen = new Set<string>();
      for (const anchor of glossaryLinksIn(source)) {
        if (seen.has(anchor)) repeated.push(`${file} → #${anchor}`);
        seen.add(anchor);
      }
    }
    expect(repeated).toEqual([]);
  });
});
