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
    prerequisites: z.array(z.string()).default([]),
    estimatedMinutes: z.number().int().positive(),
    complexity: z.object({
      time: z.object({ best: bigO, average: bigO, worst: bigO }),
      space: z.object({ worst: bigO }),
    }),
    tags: z.array(z.string()).default([]),
    // §15: placeholder lessons ship `published: false` and build no page.
    published: z.boolean().default(false),
  }),
});

export const collections = { lessons };
