/**
 * The lesson collection, without Astro's content layer (React migration, D-09).
 *
 * Every `src/content/lessons/*.mdx` is compiled by the MDX pipeline
 * (`src/mdx/pipeline.ts`) into a module exporting the rendered body
 * (`default`), `frontmatter`, `body` and `headings`. `loadLessons()` imports
 * them all once, validates each frontmatter against `src/content/schema.ts`,
 * runs the cross-collection guards in `checkCollection()`, and caches the
 * result; `getLessons()` reads the cache synchronously, which is what lets
 * pages render with `renderToStaticMarkup` (no async components).
 *
 * The guards are the ones that lived in Astro pages, because a Zod schema sees
 * one entry at a time and these need the whole collection: duplicate slugs and
 * unknown prerequisites (`[slug].astro`), a lesson slug that collides with a
 * course page (`[slug].astro`), the `## Practice` heading the review strip
 * deep-links to (`learn/index.astro`), and glossary `lessonSlug` integrity
 * (`glossary.astro`). Each failure names the file and the field.
 *
 * Build-time only: imported by the SSR entry, never by client code.
 */
import type { ComponentType } from 'react';
import { COURSE_ORDER } from '../lib/courses';
import { glossary, type GlossaryTerm } from '../lib/glossary';
import { parseLessonData, type LessonData } from './schema';

/** One heading of a lesson, as Astro's `render(entry).headings` gave it. */
export interface LessonHeading {
  depth: number;
  slug: string;
  text: string;
}

/**
 * One lesson. The shape of the fields the site reads from Astro's
 * `CollectionEntry<'lessons'>` plus what `render(entry)` returned.
 */
export interface LessonEntry {
  /** The file name without `.mdx` (Astro's entry `id`; equal to the slug). */
  id: string;
  /** Validated frontmatter. */
  data: LessonData;
  /** Raw body: the source minus frontmatter, trimmed (Astro's `entry.body`). */
  body: string;
  /** Every heading, with its id. */
  headings: LessonHeading[];
  /** The rendered body. */
  Content: ComponentType;
}

/** What a compiled lesson module exports (`src/mdx.d.ts`). */
interface LessonModule {
  default: ComponentType;
  frontmatter: unknown;
  body: string;
  headings: LessonHeading[];
}

/**
 * Every lesson file Vite saw, lazily. The glob is the file listing: a file that
 * fails to compile fails the import, and a module without the pipeline's
 * exports fails the count check in `loadLessons()`.
 */
const lessonFiles = import.meta.glob<LessonModule>('./lessons/*.mdx');

let cache: LessonEntry[] | null = null;

/**
 * The source path of a glob key, for messages: `./lessons/a.mdx` →
 * `src/content/lessons/a.mdx`.
 *
 * @param key - Glob key.
 * @returns Repository-relative path.
 */
const sourcePath = (key: string): string =>
  `src/content/${key.replace(/^\.\//, '')}`;

/**
 * Build one entry from a compiled module.
 *
 * @param file - Repository-relative source path.
 * @param module - The compiled lesson.
 * @returns The entry.
 * @throws When the module lacks the pipeline's exports or its frontmatter is invalid.
 */
export function toLessonEntry(file: string, module: LessonModule): LessonEntry {
  if (
    typeof module.default !== 'function' ||
    typeof module.body !== 'string' ||
    !Array.isArray(module.headings)
  ) {
    throw new Error(
      `${file}: compiled without the lesson pipeline's exports (default, body, headings) — is it outside src/mdx/pipeline.ts's reach?`,
    );
  }
  const id = file.replace(/^.*\//, '').replace(/\.mdx$/, '');
  return {
    id,
    data: parseLessonData(file, module.frontmatter),
    body: module.body,
    headings: module.headings,
    Content: module.default,
  };
}

/** Inputs of the cross-collection guards beyond the lessons themselves. */
export interface CollectionContext {
  /** Slugs reserved by course pages at `/learn/{course}/`. */
  courseSlugs: readonly string[];
  /** Glossary terms whose `lessonSlug` must name a published lesson. */
  glossary: readonly Pick<GlossaryTerm, 'term' | 'lessonSlug'>[];
}

/**
 * The cross-collection guards. Pure: every input is injected, so each guard is
 * unit-testable with fixtures (`tests/unit/content-loader.test.ts`).
 *
 * @param entries - Every lesson, published or not.
 * @param context - Course slugs and glossary terms.
 * @throws On the first failing guard, naming the file and the field.
 */
export function checkCollection(
  entries: readonly LessonEntry[],
  context: CollectionContext,
): void {
  const published = entries.filter((entry) => entry.data.published);
  const file = (entry: LessonEntry) => `src/content/lessons/${entry.id}.mdx`;

  // SPEC-GAP (architecture §1.1): enforce slug uniqueness here — Zod validates
  // per-entry and cannot see collisions across files.
  const seen = new Set<string>();
  for (const lesson of published) {
    if (seen.has(lesson.data.slug)) {
      throw new Error(
        `${file(lesson)}: slug: Duplicate lesson slug "${lesson.data.slug}" — slugs must be unique.`,
      );
    }
    seen.add(lesson.data.slug);
  }

  // M7.2: referential integrity for `prerequisites`, mirroring the glossary's
  // dead-link guard below. The schema only checks the SHAPE of the array, so
  // before M7.2 rendered it a typo'd or unpublished slug shipped silently; now
  // it FAILS THE BUILD. This loop covers every published lesson, not just the
  // one being rendered, so it cannot be dodged.
  for (const lesson of published) {
    for (const prerequisite of lesson.data.prerequisites) {
      if (!seen.has(prerequisite)) {
        throw new Error(
          `${file(lesson)}: prerequisites: Lesson "${lesson.data.slug}" lists unknown/unpublished prerequisite "${prerequisite}".`,
        );
      }
    }
  }

  // Course expansion (decision D-05): course pages are served at
  // `/learn/{course}/`, in the same path namespace lessons own. Both would
  // write the same output file, so a lesson may never take a course's slug.
  // Cheap guard, silent bug prevented.
  for (const lesson of published) {
    if (context.courseSlugs.includes(lesson.data.slug)) {
      throw new Error(
        `${file(lesson)}: slug: Lesson slug "${lesson.data.slug}" collides with the course page served at /learn/${lesson.data.slug}/ — rename the lesson.`,
      );
    }
  }

  // Build guard for the review strip's deep link (M8.2). Every review card
  // points at `/learn/{slug}/?review=1#practice`, and that fragment is the id
  // derived from the lesson's `## Practice` heading. A heading renamed to
  // anything else — "## Practice questions", or spec §7's own long form
  // "Practice / check yourself" — keeps the page valid and silently turns the
  // link into a no-op that dumps the reader at the top of the lesson. That is
  // invisible in review and invisible in the rendered page, so it fails the
  // build instead. Entries whose raw body is empty are skipped: a guard can
  // only assert about text it actually has.
  const missingPractice = published.filter(
    (entry) => entry.body && !/^##[ \t]+Practice[ \t]*$/m.test(entry.body),
  );
  if (missingPractice.length > 0) {
    throw new Error(
      `${missingPractice.map(file).join(', ')}: body: no "## Practice" heading, so the review strip's #practice deep link would land nowhere. Restore the heading (spec §7 body-section 7) or change ReviewStrip's target.`,
    );
  }

  // Fail the build on any dead glossary cross-link (arch §1.3).
  // Self-correcting: bad slugs never reach production.
  for (const term of context.glossary) {
    if (!seen.has(term.lessonSlug)) {
      throw new Error(
        `src/lib/glossary.ts: lessonSlug: Glossary term "${term.term}" → unknown/unpublished lesson "${term.lessonSlug}".`,
      );
    }
  }
}

/**
 * Import, validate and check every lesson, once. Called by the SSR entry's
 * `init()` before the first render.
 *
 * @returns Every PUBLISHED lesson, sorted by file name — the order Astro's
 *   glob loader produced, which the sitemap's `<loc>` order still follows.
 */
export async function loadLessons(): Promise<LessonEntry[]> {
  if (cache) return cache;
  const keys = Object.keys(lessonFiles).sort();
  // A few at a time, not all 127 at once: in dev each import is an MDX compile
  // behind Vite's module-runner transport, whose per-request timeout (60 s)
  // all 127 queued compiles blew through on this 4-core machine. In the build
  // the modules are already bundled and the limit costs nothing.
  const entries: LessonEntry[] = new Array(keys.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < keys.length) {
      const index = next;
      next += 1;
      const key = keys[index] ?? '';
      const load = lessonFiles[key];
      if (!load) throw new Error(`${sourcePath(key)}: no loader`);
      entries[index] = toLessonEntry(sourcePath(key), await load());
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  // Every listed file was imported or the `await` above threw (naming it), so
  // the module count equals the file count by construction; the one silent
  // failure left is a glob that matched nothing (a moved directory).
  if (entries.length === 0) {
    throw new Error(
      'lessons: src/content/lessons/*.mdx matched no file — the collection is empty.',
    );
  }
  checkCollection(entries, { courseSlugs: COURSE_ORDER, glossary });
  cache = entries.filter((entry) => entry.data.published);
  return cache;
}

/**
 * The published lessons, after `loadLessons()` has resolved.
 *
 * @returns Every published lesson, sorted by file name.
 * @throws When called before `loadLessons()`.
 */
export function getLessons(): LessonEntry[] {
  if (!cache) {
    throw new Error(
      'getLessons() was called before loadLessons() resolved — await the SSR entry init() first.',
    );
  }
  return cache;
}
