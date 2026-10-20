/**
 * The slice of the hast / mdast / estree node shapes the lesson MDX plugins
 * touch (React migration, D-07).
 *
 * Declared locally rather than imported from `@types/hast` and friends: those
 * packages are only transitive dependencies here, and the plugins read a
 * handful of fields. A field this file does not name is one the plugins do not
 * depend on.
 */

/** Any unist node: hast elements and text, mdast nodes, MDX expression nodes. */
export interface UnistNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: UnistNode[];
  value?: string;
  data?: {
    meta?: string | null;
    estree?: EstreeProgram | null;
    [key: string]: unknown;
  };
  position?: unknown;
}

/** A hast element. */
export interface HastElement extends UnistNode {
  type: 'element';
  tagName: string;
  properties: Record<string, unknown>;
  children: UnistNode[];
}

/** Minimal estree program, enough to read `{frontmatter.x}` and emit exports. */
export interface EstreeProgram {
  type: 'Program';
  sourceType: 'module';
  body: EstreeNode[];
}

/** An estree node, loosely typed: the plugins build a few and read fewer. */
export interface EstreeNode {
  type: string;
  [key: string]: unknown;
}

/** The vfile fields the plugins read and write. */
export interface LessonVFile {
  value: unknown;
  history: string[];
  path?: string;
  data: {
    astro?: {
      frontmatter?: Record<string, unknown>;
      headings?: MarkdownHeading[];
    };
    [key: string]: unknown;
  };
}

/** One heading, as Astro's `getHeadings()` returned it. */
export interface MarkdownHeading {
  depth: number;
  slug: string;
  text: string;
}

/**
 * Whether a node is a hast element.
 *
 * @param node - Any unist node.
 * @returns `true` for an element.
 */
export function isElement(node: UnistNode | undefined): node is HastElement {
  return node !== undefined && node.type === 'element';
}

/**
 * Pre-order walk with the parent, the shape of `unist-util-visit`'s callback
 * (which is not a declared dependency). Returning `'skip'` does not descend.
 *
 * @param node - Root of the walk.
 * @param visit - Called for every node, root included (parent `null`).
 * @returns Nothing.
 */
export function walk(
  node: UnistNode,
  visit: (
    node: UnistNode,
    index: number | null,
    parent: UnistNode | null,
  ) => void | 'skip',
): void {
  const step = (
    current: UnistNode,
    index: number | null,
    parent: UnistNode | null,
  ): void => {
    if (visit(current, index, parent) === 'skip') return;
    const children = current.children;
    if (!Array.isArray(children)) return;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child) step(child, i, current);
    }
  };
  step(node, null, null);
}

/**
 * An MDX ESM node `export const <name> = <value>;` for a JSON-shaped value.
 *
 * MDX turns `mdxjsEsm` nodes into module-level statements, so this is how a
 * plugin adds a named export (`body`, `headings`) to the compiled lesson. The
 * estree is built directly from the value, which is why the value must be
 * JSON-shaped (strings, finite numbers, booleans, null, arrays, plain objects).
 *
 * @param name - The export's identifier.
 * @param value - Its value.
 * @returns An `mdxjsEsm` node for mdast or hast.
 */
export function exportConst(name: string, value: unknown): UnistNode {
  const program: EstreeProgram = {
    type: 'Program',
    sourceType: 'module',
    body: [
      {
        type: 'ExportNamedDeclaration',
        specifiers: [],
        source: null,
        attributes: [],
        declaration: {
          type: 'VariableDeclaration',
          kind: 'const',
          declarations: [
            {
              type: 'VariableDeclarator',
              id: { type: 'Identifier', name },
              init: toEstree(value),
            },
          ],
        },
      },
    ],
  };
  return { type: 'mdxjsEsm', value: '', data: { estree: program } };
}

/**
 * Converts a JSON-shaped value to an estree expression.
 *
 * @param value - The value.
 * @returns The expression.
 * @throws On a value JSON cannot represent.
 */
function toEstree(value: unknown): EstreeNode {
  if (value === null) return { type: 'Literal', value: null, raw: 'null' };
  if (typeof value === 'string' || typeof value === 'boolean') {
    return { type: 'Literal', value, raw: JSON.stringify(value) };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { type: 'Literal', value, raw: String(value) };
  }
  if (Array.isArray(value)) {
    return { type: 'ArrayExpression', elements: value.map(toEstree) };
  }
  if (typeof value === 'object') {
    return {
      type: 'ObjectExpression',
      properties: Object.entries(value as Record<string, unknown>).map(
        ([key, entry]) => ({
          type: 'Property',
          kind: 'init',
          method: false,
          shorthand: false,
          computed: false,
          key: { type: 'Literal', value: key, raw: JSON.stringify(key) },
          value: toEstree(entry),
        }),
      ),
    };
  }
  throw new Error(`exportConst: cannot export a ${typeof value} value.`);
}
