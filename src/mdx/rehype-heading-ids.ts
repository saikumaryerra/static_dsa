/**
 * Heading ids and the `headings` export (React migration, D-07).
 *
 * VENDORED from `@astrojs/markdown-remark@7.2.1` (`dist/rehype-collect-headings.js`,
 * `rehypeHeadingIds`) and `@astrojs/mdx@7.0.3`
 * (`dist/rehype-collect-headings.js`, `rehypeInjectHeadingsExport`), Copyright
 * (c) 2021 Fred K. Schott, MIT License. The ids are part of the URL contract —
 * every `#practice` deep link, every ToC entry and every glossary-to-lesson
 * anchor depends on `github-slugger@2.0.0` producing exactly what it produced
 * under Astro, duplicate suffixes (`-1`) included — so the logic is copied, not
 * re-derived.
 *
 * Differences from the original, none visible in output: the walk is the local
 * `walk` (`unist-util-visit` is not a dependency); the file is always MDX here,
 * so the `isMDXFile` branch is constant-folded; the frontmatter comes from
 * `file.data.astro.frontmatter`, which `remark-lesson-body.ts` fills (Astro's
 * content layer filled it before); and instead of `export function
 * getHeadings()` the compiled lesson gets `export const headings`.
 */
import GithubSlugger from 'github-slugger';
import {
  exportConst,
  isElement,
  walk,
  type EstreeNode,
  type LessonVFile,
  type MarkdownHeading,
  type UnistNode,
} from './hast';

const rawNodeTypes = new Set(['text', 'raw', 'mdxTextExpression']);

/** Path segments that must never be followed into an object. */
const FORBIDDEN_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Assign ids to every `h1`–`h6` and export the list as `headings`.
 *
 * @returns A rehype transformer.
 */
export function rehypeHeadingIds(): (
  tree: UnistNode,
  file: LessonVFile,
) => void {
  return (tree, file) => {
    const headings: MarkdownHeading[] = [];
    const frontmatter = file.data.astro?.frontmatter;
    const slugger = new GithubSlugger();
    walk(tree, (node) => {
      if (!isElement(node)) return;
      const { tagName } = node;
      if (tagName[0] !== 'h') return;
      const [, level] = /h([0-6])/.exec(tagName) ?? [];
      if (!level) return;
      const depth = Number.parseInt(level);

      let text = '';
      walk(node, (child, _index, parent) => {
        if (child.type === 'element' || parent == null) {
          return;
        }
        if (child.type === 'raw') {
          if (/^\n?<.*>\n?$/.test(child.value ?? '')) {
            return;
          }
        }
        if (rawNodeTypes.has(child.type)) {
          let value = child.value ?? '';
          if (child.type === 'mdxTextExpression' && frontmatter) {
            const frontmatterPath = getMdxFrontmatterVariablePath(child);
            if (frontmatterPath.length > 0) {
              const frontmatterValue = getMdxFrontmatterVariableValue(
                frontmatter,
                frontmatterPath,
              );
              if (typeof frontmatterValue === 'string') {
                value = frontmatterValue;
              }
            }
          }
          text += value;
        }
      });

      node.properties = node.properties || {};
      if (typeof node.properties.id !== 'string') {
        node.properties.id = slugger.slug(text);
      }
      headings.push({ depth, slug: node.properties.id as string, text });
    });
    file.data.astro ??= {};
    file.data.astro.headings = headings;
    (tree.children ??= []).unshift(exportConst('headings', headings));
  };
}

/**
 * The member path of a `{frontmatter.a.b}` expression, or `[]` when the
 * expression is anything else.
 *
 * @param node - An `mdxTextExpression` node.
 * @returns The path below `frontmatter`.
 */
function getMdxFrontmatterVariablePath(node: UnistNode): string[] {
  const body = node.data?.estree?.body;
  if (!body || body.length !== 1) return [];
  const statement = body[0] as EstreeNode;
  const first = statement.expression as EstreeNode | undefined;
  if (
    statement.type !== 'ExpressionStatement' ||
    first?.type !== 'MemberExpression'
  ) {
    return [];
  }
  let expression: EstreeNode = first;
  const expressionPath: string[] = [];
  while (expression.type === 'MemberExpression') {
    const property = expression.property as EstreeNode;
    if (property.type !== (expression.computed ? 'Literal' : 'Identifier')) {
      break;
    }
    expressionPath.push(
      property.type === 'Literal'
        ? String(property.value)
        : String(property.name),
    );
    expression = expression.object as EstreeNode;
  }
  if (expression.type !== 'Identifier' || expression.name !== 'frontmatter') {
    return [];
  }
  return expressionPath.reverse();
}

/**
 * Reads a path out of the frontmatter, refusing prototype keys.
 *
 * @param frontmatter - The lesson's parsed frontmatter.
 * @param path - Member path.
 * @returns The value, or `undefined`.
 */
function getMdxFrontmatterVariableValue(
  frontmatter: Record<string, unknown>,
  path: string[],
): unknown {
  let value: unknown = frontmatter;
  for (const key of path) {
    if (
      FORBIDDEN_PATH_KEYS.has(key) ||
      !value ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, key)
    ) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
