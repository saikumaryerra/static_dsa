/**
 * TableOfContents — in-lesson section nav from rendered headings (design §1.3, §9).
 * Ported from `TableOfContents.astro` (React migration P2); CSS in
 * `src/styles/components/table-of-contents.css`, behaviour in the client module
 * `src/client/modules/toc.ts` (which `LessonLayout` loads, as it owned the
 * legacy script).
 *
 * Props:
 * - `headings` the lesson's `LessonHeading[]` (`{ depth, slug, text }`, the
 *   shape Astro's `MarkdownHeading[]` had); only h2
 *   (depth 2) is shown — the 7 lesson sections.
 * - `variant`  "inline" (a sticky mini-ToC below 1024px) or "rail" (≥1024 sticky nav).
 *
 * Links are plain in-page anchors — fully functional with JS off. Active-section
 * highlighting and the collapsed bar's section name are progressive enhancements
 * wired by the `toc` module (`data-toc-link`, `data-toc-current`); the list
 * is fully usable without either.
 *
 * M7.2: the inline variant is promoted from a plain in-flow `<details>` to a bar
 * that sticks under the site header, so wayfinding survives a 7,000px lesson on
 * a phone. It stays a NATIVE `<details>` (zero JS to open/close), and its open
 * list is absolutely positioned so expanding it never pushes the article down.
 *
 * M7.3: the current entry gains a `--brand-soft` tint on top of its brand bar,
 * and the inline panel fades in and out instead of popping. Both are decoration
 * layered over cues that already carry the meaning — see the stylesheet notes.
 */
import type { JSX } from 'react';
import type { LessonHeading } from '../content/lessons';

/** Props of `TableOfContents`. */
export interface TableOfContentsProps {
  headings: LessonHeading[];
  variant: 'inline' | 'rail';
}

/**
 * The section list, shared by both variants.
 *
 * @param props - The h2 headings.
 * @returns The `<ol>`.
 */
function Items({ items }: { items: LessonHeading[] }): JSX.Element {
  return (
    <ol>
      {items.map((h) => (
        <li key={h.slug}>
          <a href={`#${h.slug}`} data-toc-link={`#${h.slug}`}>
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * The lesson's table of contents.
 *
 * @param props - See `TableOfContentsProps`.
 * @returns The inline bar or the rail.
 */
export default function TableOfContents({
  headings,
  variant,
}: TableOfContentsProps): JSX.Element {
  const items = headings.filter((h) => h.depth === 2);
  if (variant === 'rail') {
    return (
      <nav className="toc toc--rail" aria-label="On this page">
        <p className="toc__label">On this page</p>
        <Items items={items} />
      </nav>
    );
  }
  return (
    <details className="toc toc--inline" data-toc-inline="">
      <summary>
        <svg
          className="toc__chevron"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span>On this page</span>
        {/* Filled by the scroll-spy. NOT aria-hidden: it is visible text inside
            the summary's label, and hiding it from the accessible name while
            showing it on screen is exactly what WCAG 2.5.3 forbids. */}
        <span className="toc__current" data-toc-current="" />
      </summary>
      <nav className="toc__panel" aria-label="On this page">
        <Items items={items} />
      </nav>
    </details>
  );
}
