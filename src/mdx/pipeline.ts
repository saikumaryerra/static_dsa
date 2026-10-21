/**
 * The lesson MDX pipeline: Astro 7's remark/rehype chain, in Astro's order, at
 * the versions Astro used (React migration, D-07).
 *
 * | Stage       | Plugin                                                          |
 * |-------------|-----------------------------------------------------------------|
 * | frontmatter | `remark-frontmatter` + `remark-mdx-frontmatter` → `export const frontmatter`, so `{frontmatter.slug}` in 381 places keeps working |
 * | raw body    | `remarkLessonBody` → `export const body` (Astro's `entry.body`) |
 * | remark      | `remark-gfm@4.0.1`, `remark-smartypants@3.0.2` (default options) |
 * | rehype 1    | `rehypeMetaString`, `rehype-raw@7` with MDX node passthrough    |
 * | rehype 2    | `rehypeShikiAstro` (dual theme, Shiki's own classes, D-12)     |
 * | rehype 3    | `rehypeLessonProse` (table wrapper, `md-code` on fences)        |
 * | rehype 4    | `rehypeHeadingIds` → heading ids + `export const headings`      |
 *
 * The order is load-bearing and is the one `@astrojs/mdx@7.0.3` builds in
 * `dist/plugins.js`: smartypants after GFM; Shiki before the prose pass (which
 * appends `md-code` to Shiki's `<pre>`); heading ids last (so they see the
 * final heading text). Astro's image plugins are omitted: no lesson has an
 * image, and `validate:content` would be the place to change that.
 *
 * Every plugin here runs at BUILD time; none of them, and none of their
 * dependencies, reaches the browser.
 */
import type { CompileOptions } from '@mdx-js/mdx';
import { nodeTypes } from '@mdx-js/mdx';
import rehypeRaw from 'rehype-raw';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import remarkSmartypants from 'remark-smartypants';
import { rehypeHeadingIds } from './rehype-heading-ids';
import { rehypeLessonProse } from './rehype-lesson-prose';
import { rehypeMetaString, rehypeShikiAstro } from './rehype-shiki-astro';
import { remarkLessonBody } from './remark-lesson-body';

type PluginList = NonNullable<CompileOptions['remarkPlugins']>;

/**
 * The local plugins are typed against the narrow node shapes in `./hast`
 * rather than unified's (not a declared dependency); this is the one place the
 * two meet. The runtime contract is unified's plugin signature, which they
 * follow.
 *
 * @param plugin - A local plugin.
 * @returns The same function, typed for the plugin list.
 */
const local = (plugin: () => unknown): PluginList[number] =>
  plugin as PluginList[number];

/** Remark plugins, in Astro's order (frontmatter first: it is syntax). */
export const remarkPlugins: PluginList = [
  remarkFrontmatter,
  [remarkMdxFrontmatter, { name: 'frontmatter' }],
  local(remarkLessonBody),
  remarkGfm,
  [remarkSmartypants, {}],
];

/** Rehype plugins, in Astro's order. */
export const rehypePlugins: PluginList = [
  local(rehypeMetaString),
  [rehypeRaw, { passThrough: nodeTypes }],
  local(rehypeShikiAstro),
  local(rehypeLessonProse),
  local(rehypeHeadingIds),
];

/**
 * Options for `@mdx-js/rollup` (and for `@mdx-js/mdx`'s `compile` in unit
 * tests). React's automatic runtime; the default `elementAttributeNameCase`
 * (`react`) turns hast's `class`/`tabindex` into `className`/`tabIndex`, which
 * React serializes back to the same HTML Astro emitted.
 */
export const mdxOptions = {
  format: 'mdx',
  mdExtensions: [],
  jsxImportSource: 'react',
  remarkPlugins,
  rehypePlugins,
} satisfies CompileOptions;
