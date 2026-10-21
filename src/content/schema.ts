/**
 * The lesson frontmatter schema (site spec §7) — a field-for-field copy of the
 * retired `src/content.config.ts` (React migration, D-09), on `zod@4` directly
 * where that file used `astro:schema`'s re-export of the same zod 4.
 *
 * The schema matches the §7 frontmatter EXACTLY — no extra fields. The two
 * `.regex()` guards and the `bigO` validator only tighten the contract (they
 * surface bad frontmatter at build time); they never widen it.
 */
import { z } from 'zod';
import { TRACK_IDS } from '../lib/tracks';

/** Big-O string guard, e.g. `"O(log n)"` — catches malformed complexity claims. */
const bigO = z
  .string()
  .regex(/^O\(.+\)$/, 'Complexity must be Big-O, e.g. "O(log n)"');

/** One lesson's frontmatter. */
export const lessonSchema = z.object({
  title: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be kebab-case'),
  // A track is the MODULE-sized grouping inside a course (course expansion,
  // decision D-04). The two original ids are the two modules of the `dsa`
  // course, so no existing lesson's frontmatter changed. The enum is built
  // from `TRACK_IDS` rather than restated here, so a track exists in exactly
  // one place and a typo in frontmatter fails the build.
  track: z.enum(TRACK_IDS),
  // The course this lesson belongs to. Defaults to `dsa` so the 15 lessons
  // that predate the course expansion need no edit.
  course: z.enum(['dsa', 'kubernetes', 'system-design']).default('dsa'),
  // Order WITHIN THE COURSE, 1..N. It was global while there was one course;
  // it is per-course now, which is what keeps prev/next inside a course and
  // leaves the `dsa` numbering (1..15) exactly as it was.
  order: z.number().int().positive(),
  summary: z.string(),
  difficulty: z.enum(['beginner', 'intermediate']),
  // Shape only. REFERENTIAL validation ("does this slug name a published
  // lesson?") cannot live here — a Zod schema sees one entry at a time — so it
  // runs over the whole collection in `checkCollection()`
  // (`src/content/lessons.ts`) and fails the build there (M7.2).
  prerequisites: z.array(z.string()).default([]),
  estimatedMinutes: z.number().int().positive(),
  // OPTIONAL since the course expansion (decision D-07): there is no honest
  // Big-O for "ConfigMaps and Secrets" or "CAP and PACELC". `ComplexityTable`
  // and the `## Complexity` section render only where a lesson declares it,
  // which today means every algorithmic lesson and nothing else. Inventing
  // `O(1)` placeholders to satisfy a required field was explicitly rejected.
  complexity: z
    .object({
      time: z.object({ best: bigO, average: bigO, worst: bigO }),
      space: z.object({ worst: bigO }),
    })
    .optional(),
  tags: z.array(z.string()).default([]),
  // §7's Explain-it-back prompt (M8.3): the ONE "why does this work?" question
  // this lesson asks the reader to answer in their own words after they mark
  // it complete. Optional per lesson — `ExplainBack` is rendered only where a
  // lesson authors one, so a lesson without the field has no note box at all.
  // `.min(1)` because an empty string would render a labelled field with no
  // question in it; the component throws on the same condition, so a
  // whitespace-only value cannot slip past either.
  explainPrompt: z.string().min(1).optional(),
  // §15: placeholder lessons ship `published: false` and build no page.
  published: z.boolean().default(false),
});

/** Validated lesson frontmatter (defaults applied). */
export type LessonData = z.output<typeof lessonSchema>;

/**
 * Validate one lesson's frontmatter.
 *
 * @param file - The lesson's path, for the error message
 *   (e.g. `src/content/lessons/arrays.mdx`).
 * @param frontmatter - The raw parsed frontmatter.
 * @returns The validated data, defaults applied.
 * @throws Naming the file and every failing field:
 *   `src/content/lessons/x.mdx: order: Invalid input: expected number`.
 */
export function parseLessonData(
  file: string,
  frontmatter: unknown,
): LessonData {
  const result = lessonSchema.safeParse(frontmatter);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    (issue) =>
      `${file}: ${issue.path.length > 0 ? issue.path.join('.') : '(frontmatter)'}: ${issue.message}`,
  );
  throw new Error(problems.join('\n'));
}
