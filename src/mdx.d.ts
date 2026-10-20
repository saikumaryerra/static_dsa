/**
 * Types for compiled lesson modules (React migration, D-15) — declared here
 * rather than with `@types/mdx`, because a lesson module exports more than
 * that package knows about: the three named exports the pipeline adds
 * (`src/mdx/pipeline.ts`). The frontmatter is `unknown` on purpose: it is
 * validated by `src/content/schema.ts` before anything reads it.
 */
declare module '*.mdx' {
  import type { ComponentType, ReactNode } from 'react';

  /** Components an MDX document may receive (unused by lessons: they import). */
  type MDXComponents = Record<string, ComponentType<Record<string, unknown>>>;

  /** `export const frontmatter` (remark-mdx-frontmatter). */
  export const frontmatter: unknown;
  /** `export const body`: the raw source minus frontmatter, trimmed. */
  export const body: string;
  /** `export const headings`: every heading with its id. */
  export const headings: { depth: number; slug: string; text: string }[];

  /** The rendered lesson body. */
  const MDXContent: (props: { components?: MDXComponents }) => ReactNode;
  export default MDXContent;
}
