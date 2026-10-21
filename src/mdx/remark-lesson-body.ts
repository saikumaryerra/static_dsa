/**
 * `export const body` for every lesson, and the frontmatter for the heading-id
 * pass (React migration, D-07 / D-09).
 *
 * `body` is what Astro's content layer called `entry.body`: the raw MDX source
 * with its frontmatter block removed, trimmed. Two consumers read it — the
 * reading-time estimate (`src/lib/reading-time.ts`) and the `## Practice`
 * heading guard in `checkCollection()` — and both were written against Astro's
 * exact string, so the extraction below is Astro's, not a re-derivation:
 * `frontmatterRE` and the `remove` branch of `parseFrontmatter` from
 * `@astrojs/internal-helpers@0.10.1` (`dist/frontmatter.js`), Copyright (c)
 * 2021 Fred K. Schott, MIT License, and the `.trim()` from `@astrojs/mdx@7.0.3`'s
 * `getEntryInfo`. (TOML frontmatter is not supported: no lesson uses it, and
 * CONTENT_STYLE.md specifies YAML.)
 *
 * The parsed frontmatter is also stored on `file.data.lesson.frontmatter`, where
 * `rehype-heading-ids.ts` reads it to resolve `{frontmatter.x}` inside a heading
 * the way Astro did. The exported `frontmatter` VALUE comes from
 * `remark-mdx-frontmatter`, not from here.
 */
import { parse } from 'yaml';
import { exportConst, type LessonVFile, type UnistNode } from './hast';

const frontmatterRE =
  /(?:^\uFEFF?|^\s*\n)(?:---|\+\+\+)([\s\S]*?\n)(?:---|\+\+\+)/;

/**
 * Astro's `entry.body` for one MDX source.
 *
 * @param source - The whole `.mdx` file.
 * @returns The body: frontmatter block removed, trimmed.
 */
export function lessonBody(source: string): string {
  const rawFrontmatter = frontmatterRE.exec(source)?.[1];
  if (rawFrontmatter == null) return source.trim();
  return source.replace(`---${rawFrontmatter}---`, '').trim();
}

/**
 * Remark plugin: adds `export const body` and records the frontmatter.
 *
 * @returns A remark transformer.
 */
export function remarkLessonBody(): (
  tree: UnistNode,
  file: LessonVFile,
) => void {
  return (tree, file) => {
    const source = String(file.value);
    const rawFrontmatter = frontmatterRE.exec(source)?.[1];
    const parsed: unknown = rawFrontmatter == null ? {} : parse(rawFrontmatter);
    file.data.lesson ??= {};
    file.data.lesson.frontmatter =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    (tree.children ??= []).push(exportConst('body', lessonBody(source)));
  };
}
