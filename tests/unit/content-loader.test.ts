/**
 * The framework-free lesson loader (React migration, D-09): frontmatter
 * validation and the cross-collection guards that lived in Astro pages. Every
 * guard must fail the build naming the FILE and the FIELD, so a broken lesson
 * points at itself. Pure functions with fixtures — no MDX is compiled here.
 */
import { describe, expect, it } from 'vitest';
import {
  checkCollection,
  toLessonEntry,
  type LessonEntry,
} from '../../src/content/lessons';
import { parseLessonData } from '../../src/content/schema';

const VALID = {
  title: 'Arrays',
  slug: 'arrays',
  track: 'foundations',
  order: 2,
  summary: 'Contiguous storage.',
  difficulty: 'beginner',
  estimatedMinutes: 10,
  published: true,
};

const BODY = 'Intro.\n\n## Practice\n\n1. A question.';

/**
 * A lesson entry built through the real loader path.
 *
 * @param data - Frontmatter overrides.
 * @param body - Raw body.
 * @returns The entry.
 */
function entry(data: Record<string, unknown> = {}, body = BODY): LessonEntry {
  const slug = String(data.slug ?? VALID.slug);
  return toLessonEntry(`src/content/lessons/${slug}.mdx`, {
    default: () => null,
    frontmatter: { ...VALID, ...data },
    body,
    headings: [],
  });
}

const CONTEXT = {
  courseSlugs: ['dsa', 'kubernetes', 'system-design'],
  glossary: [{ term: 'Array', lessonSlug: 'arrays' }],
};

describe('frontmatter validation', () => {
  it('applies the schema defaults', () => {
    const data = parseLessonData('x.mdx', VALID);
    expect(data.course).toBe('dsa');
    expect(data.prerequisites).toEqual([]);
    expect(data.tags).toEqual([]);
  });

  it('names the file and the field on a bad value', () => {
    expect(() =>
      parseLessonData('src/content/lessons/arrays.mdx', {
        ...VALID,
        order: 'two',
      }),
    ).toThrow(/^src\/content\/lessons\/arrays\.mdx: order: /);
  });

  it('names a missing required field', () => {
    const { summary: _omit, ...rest } = VALID;
    void _omit;
    expect(() => parseLessonData('a.mdx', rest)).toThrow(/^a\.mdx: summary: /);
  });

  it('rejects an unknown track and a malformed Big-O claim', () => {
    expect(() => parseLessonData('a.mdx', { ...VALID, track: 'nope' })).toThrow(
      /a\.mdx: track: /,
    );
    expect(() =>
      parseLessonData('a.mdx', {
        ...VALID,
        complexity: {
          time: { best: 'O(1)', average: 'fast', worst: 'O(n)' },
          space: { worst: 'O(1)' },
        },
      }),
    ).toThrow(/a\.mdx: complexity\.time\.average: Complexity must be Big-O/);
  });

  it('refuses a module compiled without the pipeline exports', () => {
    expect(() =>
      toLessonEntry('src/content/lessons/x.mdx', {
        default: () => null,
        frontmatter: VALID,
        body: undefined as unknown as string,
        headings: [],
      }),
    ).toThrow(/^src\/content\/lessons\/x\.mdx: compiled without/);
  });
});

describe('checkCollection', () => {
  it('passes a consistent collection', () => {
    expect(() => checkCollection([entry()], CONTEXT)).not.toThrow();
  });

  it('fails on a duplicate slug, naming the file and `slug`', () => {
    expect(() => checkCollection([entry(), entry()], CONTEXT)).toThrow(
      /^src\/content\/lessons\/arrays\.mdx: slug: Duplicate lesson slug "arrays"/,
    );
  });

  it('fails on an unknown or unpublished prerequisite', () => {
    const draft = entry({ slug: 'draft', published: false });
    const lesson = entry({ prerequisites: ['draft'] });
    expect(() => checkCollection([lesson, draft], CONTEXT)).toThrow(
      /arrays\.mdx: prerequisites: .*"draft"/,
    );
  });

  it('fails when a lesson takes a course page’s slug', () => {
    expect(() =>
      checkCollection([entry(), entry({ slug: 'kubernetes' })], CONTEXT),
    ).toThrow(/kubernetes\.mdx: slug: .*collides with the course page/);
  });

  it('fails when a lesson has no `## Practice` heading', () => {
    expect(() =>
      checkCollection(
        [entry({}, 'Intro.\n\n## Practice questions\n')],
        CONTEXT,
      ),
    ).toThrow(/arrays\.mdx: body: no "## Practice" heading/);
  });

  it('fails on a glossary term that names an unknown lesson', () => {
    expect(() =>
      checkCollection([entry()], {
        ...CONTEXT,
        glossary: [{ term: 'Heap', lessonSlug: 'heaps' }],
      }),
    ).toThrow(/^src\/lib\/glossary\.ts: lessonSlug: .*"Heap".*"heaps"/);
  });
});
