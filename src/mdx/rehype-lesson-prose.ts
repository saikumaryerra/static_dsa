/**
 * The lesson prose pass (moved verbatim from the retired `astro.config.mjs`,
 * React migration step P1.2; course expansion decision D-09).
 *
 * Runs after Shiki in the MDX chain (`src/mdx/pipeline.ts`), so it sees
 * Shiki's highlighted `<pre>` as well as an unhighlighted one; it appends
 * `md-code` either way rather than depending on which.
 *
 * KNOWN, KEPT DEFECT (plan §1, orchestrator decision 6): Shiki writes its
 * classes to the hast property `class`, and this pass writes `className`. When
 * MDX turns the tree into JSX the latter wins, so every markdown fence ships as
 * `class="md-code"` WITHOUT `astro-code` and never receives the dark-theme
 * rules in `global.css`. The migration reproduces the legacy output exactly;
 * the fix is a separate post-migration change with its own visual review. Do
 * not "tidy" the class/className interplay here.
 */
import type { UnistNode } from './hast';

/**
 * Two things markdown emits that this site had no styling for, fixed at the tree
 * rather than with CSS (course expansion, decision D-09).
 *
 * `<table>` — markdown emits a bare `<table>` with no wrapper, and Tailwind's
 * preflight zeroes its padding and borders. Styling it needs a wrapper it can
 * overflow inside, and the CSS-only shortcut (`display: block; overflow-x: auto`
 * on the table itself) strips the table's semantics from the accessibility tree
 * in Chrome and Firefox — a real regression traded for a scrollbar. So the table
 * is wrapped here instead. `tabindex="0"` makes the scroll region reachable from
 * the keyboard, which WCAG 2.1.1 requires of anything that scrolls and which is
 * also what axe's `scrollable-region-focusable` rule checks.
 *
 * `<pre>` — a fenced code block had no padding, border, radius or `overflow-x`;
 * only `<CodeTabs>`' own `<pre>` was ever styled, because the DSA lessons put
 * every sample through it. A Kubernetes lesson is mostly single-language YAML,
 * where the tab strip would be a control with one tab. The `md-code` class is
 * what lets the stylesheet tell the two apart: component output never passes
 * through rehype, so only a real markdown fence can carry it.
 *
 * Written as a local walker rather than with `unist-util-visit` because that
 * would be a dependency for fifteen lines.
 *
 * @returns A rehype transformer.
 */
export function rehypeLessonProse(): (tree: UnistNode) => void {
  /**
   * @param node - Any hast node.
   */
  function walk(node: UnistNode): void {
    const children = node.children;
    if (!Array.isArray(children)) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child || child.type !== 'element') {
        walk(child ?? { type: 'none' });
        continue;
      }
      if (child.tagName === 'table') {
        children[i] = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['table-scroll'], tabIndex: 0 },
          children: [child],
        };
        walk(child);
        continue;
      }
      if (child.tagName === 'pre') {
        const properties = child.properties ?? (child.properties = {});
        const existing = properties.className;
        const className: unknown[] = Array.isArray(existing)
          ? existing
          : existing
            ? [existing]
            : [];
        if (!className.includes('md-code')) className.push('md-code');
        properties.className = className;
        properties.tabIndex = 0;
        // Do not descend: everything below is Shiki's highlight spans.
        continue;
      }
      walk(child);
    }
  }
  return (tree) => walk(tree);
}
