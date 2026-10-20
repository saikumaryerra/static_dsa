/**
 * Markdown fence highlighting, exactly as Astro 7's MDX integration did it
 * (React migration, D-07).
 *
 * VENDORED from `@astrojs/markdown-remark@7.2.1` (`dist/highlight.js`,
 * `highlightCodeBlocks`; `dist/rehype-shiki.js`) and `@astrojs/mdx@7.0.3`
 * (`dist/rehype-meta-string.js`), Copyright (c) 2021 Fred K. Schott, MIT
 * License. The highlighter itself and Astro's `<pre>` transform live in
 * `src/lib/highlight.ts`, shared with `<CodeTabs>`.
 *
 * Differences from the original, none visible in output: the hast walk is the
 * local `walk` instead of `unist-util-visit-parents`; the code text is read by a
 * local `textOf` instead of `hast-util-to-text` (a fenced `<code>` holds only
 * text, where `toText(node, { whitespace: 'pre' })` is the same
 * concatenation); and Shiki returns hast directly, so the `fromHtml` branch for
 * string results is gone.
 */
import { highlightToHast } from '../lib/highlight';
import { isElement, walk, type HastElement, type UnistNode } from './hast';

/** Astro's default excluded fence languages (`defaultExcludeLanguages`). */
const EXCLUDED_LANGUAGES = ['math'];

const languagePattern = /\blanguage-(\S+)\b/;

/**
 * Ensure `data.meta` is preserved in `properties.metastring` for rehype syntax
 * highlighters (Astro's `rehypeMetaString`, verbatim).
 *
 * @returns A rehype transformer.
 */
export function rehypeMetaString(): (tree: UnistNode) => void {
  return (tree) =>
    walk(tree, (node) => {
      if (isElement(node) && node.tagName === 'code' && node.data?.meta) {
        node.properties ??= {};
        node.properties.metastring = node.data.meta;
      }
    });
}

/**
 * Concatenated text of a hast subtree.
 *
 * @param node - Any hast node.
 * @returns Its text.
 */
function textOf(node: UnistNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

/**
 * Highlight every `<pre><code class="language-x">` with Shiki's dual theme.
 *
 * @returns An async rehype transformer.
 */
export function rehypeShikiAstro(): (tree: UnistNode) => Promise<void> {
  return async (tree) => {
    const nodes: {
      node: HastElement;
      language: string;
      parent: HastElement;
      grandParent: UnistNode;
    }[] = [];
    const ancestors: UnistNode[] = [];
    const visit = (current: UnistNode): void => {
      if (isElement(current) && current.tagName === 'code') {
        const parent = ancestors.at(-1);
        const grandParent = ancestors.at(-2);
        if (
          isElement(parent) &&
          parent.tagName === 'pre' &&
          parent.children.length === 1 &&
          grandParent
        ) {
          let languageMatch: RegExpExecArray | null = null;
          const { className } = current.properties;
          if (typeof className === 'string') {
            languageMatch = languagePattern.exec(className);
          } else if (Array.isArray(className)) {
            for (const cls of className) {
              if (typeof cls !== 'string') continue;
              languageMatch = languagePattern.exec(cls);
              if (languageMatch) break;
            }
          }
          const language = languageMatch?.[1] || 'plaintext';
          if (!EXCLUDED_LANGUAGES.includes(language)) {
            nodes.push({ node: current, language, parent, grandParent });
          }
        }
      }
      ancestors.push(current);
      for (const child of current.children ?? []) visit(child);
      ancestors.pop();
    };
    visit(tree);

    for (const { node, language, grandParent, parent } of nodes) {
      const meta =
        node.data?.meta ??
        (typeof node.properties.metastring === 'string'
          ? node.properties.metastring
          : undefined) ??
        undefined;
      const code = textOf(node);
      // Astro's MDX path: dual themes, `defaultColor` and `wrap` unset.
      const result = await highlightToHast(code, language, {
        meta: meta ?? undefined,
      });
      const replacement = result.children[0] as UnistNode;
      const siblings = grandParent.children ?? [];
      const index = siblings.indexOf(parent);
      siblings[index] = replacement;
    }
  };
}
