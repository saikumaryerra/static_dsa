import { describe, expect, it } from 'vitest';
import type { CollectionEntry } from 'astro:content';
import { courseJsonLd, webSiteJsonLd } from '../../src/lib/structured-data';

const SITE = 'https://learndsa.example.com';

/** Minimal lesson entry — only the fields the serializers read (arch §3.1). */
function makeEntry(
  overrides: Partial<CollectionEntry<'lessons'>['data']> = {},
): CollectionEntry<'lessons'> {
  return {
    id: 'binary-search',
    collection: 'lessons',
    data: {
      title: 'Linear & Binary Search',
      slug: 'binary-search',
      summary: 'Find an item in a sorted array in logarithmic time.',
      difficulty: 'beginner',
      tags: ['search', 'arrays'],
      // Fields present on the schema but unused by the serializer.
      track: 'algorithms',
      order: 11,
      prerequisites: [],
      estimatedMinutes: 12,
      complexity: {
        time: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
        space: { worst: 'O(1)' },
      },
      published: true,
      ...overrides,
    },
  } as unknown as CollectionEntry<'lessons'>;
}

describe('courseJsonLd', () => {
  it('produces the Course shape from architecture §3.1', () => {
    const parsed = JSON.parse(courseJsonLd(makeEntry(), SITE));

    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('Course');
    expect(parsed.name).toBe('Linear & Binary Search');
    expect(parsed.description).toBe(
      'Find an item in a sorted array in logarithmic time.',
    );
    expect(parsed.url).toBe('https://learndsa.example.com/learn/binary-search');
    expect(parsed.inLanguage).toBe('en');
    expect(parsed.isAccessibleForFree).toBe(true);
    expect(parsed.educationalLevel).toBe('beginner');
    expect(parsed.keywords).toBe('search, arrays');
    expect(parsed.provider).toEqual({
      '@type': 'Organization',
      name: 'LearnDSA',
      url: 'https://learndsa.example.com',
    });
    // SPEC-GAP (arch §3.1): hasCourseInstance is intentionally omitted.
    expect(parsed.hasCourseInstance).toBeUndefined();
  });

  it('accepts a URL instance for siteUrl', () => {
    const parsed = JSON.parse(courseJsonLd(makeEntry(), new URL(SITE)));
    expect(parsed.url).toBe('https://learndsa.example.com/learn/binary-search');
  });

  it('escapes "<" so the JSON-LD is safe to inline in a <script>', () => {
    // A malicious/edge title containing a closing-script sequence must not appear
    // literally in the serialized output (XSS-safe embedding, arch §3.1).
    const out = courseJsonLd(
      makeEntry({ title: 'Arrays </script><script>alert(1)' }),
      SITE,
    );

    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c');
    // Still valid JSON that round-trips to the original title.
    expect(JSON.parse(out).name).toBe('Arrays </script><script>alert(1)');
  });

  it('serializes to a single line of valid JSON', () => {
    const out = courseJsonLd(makeEntry(), SITE);
    expect(out).not.toContain('\n');
    expect(() => JSON.parse(out)).not.toThrow();
  });
});

describe('webSiteJsonLd', () => {
  it('produces the WebSite shape (arch §3.3)', () => {
    const parsed = JSON.parse(webSiteJsonLd(SITE));
    expect(parsed['@type']).toBe('WebSite');
    expect(parsed.name).toBe('LearnDSA');
    expect(parsed.url).toBe('https://learndsa.example.com');
    expect(parsed.inLanguage).toBe('en');
  });

  it('escapes "<" in its output', () => {
    expect(webSiteJsonLd(SITE)).not.toContain('<');
  });
});
