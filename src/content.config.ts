/**
 * Lessons content collection — typed schema + loader (site spec §7, architecture §1).
 *
 * Astro 5+ removed the legacy `type: 'content'` collection API, so lessons use
 * the Content Layer `glob()` loader from `astro/loaders`. DEVIATION from
 * architecture §1.1 / spec §16: the installed Astro rejects the spec's
 * `src/content/config.ts` path as a legacy config and requires
 * `src/content.config.ts`, so the file lives here instead.
 *
 * The schema matches the §7 frontmatter EXACTLY — no extra fields. The two
 * `.regex()` guards and the `bigO` validator only tighten the contract (they
 * surface bad frontmatter at build time); they never widen it.
 */
import { defineCollection } from 'astro:content';
import { z } from 'astro:schema';
import { glob } from 'astro/loaders';

/** Big-O string guard, e.g. `"O(log n)"` — catches malformed complexity claims. */
const bigO = z
  .string()
  .regex(/^O\(.+\)$/, 'Complexity must be Big-O, e.g. "O(log n)"');

const lessons = defineCollection({
  // `base` resolves from the PROJECT ROOT, not this file. Content Layer, not
  // legacy folders — entry `id` comes from the filename; we route off `slug`.
  loader: glob({ pattern: '**/*.mdx', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be kebab-case'),
    track: z.enum(['foundations', 'algorithms']),
    order: z.number().int().positive(),
    summary: z.string(),
    difficulty: z.enum(['beginner', 'intermediate']),
    // Shape only. REFERENTIAL validation ("does this slug name a published
    // lesson?") cannot live here — a Zod schema sees one entry at a time — so it
    // runs over the whole collection in `pages/learn/[slug].astro`'s
    // getStaticPaths and fails the build there (M7.2).
    prerequisites: z.array(z.string()).default([]),
    estimatedMinutes: z.number().int().positive(),
    complexity: z.object({
      time: z.object({ best: bigO, average: bigO, worst: bigO }),
      space: z.object({ worst: bigO }),
    }),
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
  }),
});

export const collections = { lessons };
