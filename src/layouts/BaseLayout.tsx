/**
 * BaseLayout — the body shell of every page (spec §8, §14; M5 architecture
 * §2), ported from `BaseLayout.astro` (React migration P2).
 *
 * Props: the page's head metadata (`PageMeta`: `title`, `description`,
 * `canonicalPath`, `ogType`, `ogImage`, `jsonLd`, `noindex`) plus `wide`.
 *
 * The legacy layout owned the whole document. Here the head is `Document`'s
 * (`src/render/Document.tsx`): this layout RECORDS the metadata once
 * (`usePageMeta`) and `Document` emits every head tag from it after the body
 * has rendered, so pages still never write their own `<title>`/`<meta>` — the
 * single-source rule of arch §2.3 holds, with the named `head` slot (JSON-LD,
 * `noindex`) replaced by the `jsonLd`/`noindex` fields.
 *
 * Provides: the skip-to-content link, SiteHeader, the `main` landmark wrapping
 * the page, and SiteFooter.
 */
import type { JSX, ReactNode } from 'react';
import SiteFooter from '../components/SiteFooter';
import SiteHeader from '../components/SiteHeader';
import { usePageMeta, type PageMeta } from '../render/context';

/** Props: the page's head metadata plus the shell width. */
export interface BaseLayoutProps extends PageMeta {
  /**
   * Widen the shell from `--container-max` to `--shell` (redesign 2026-08,
   * amendment L-1). Only pages with a genuine third column ask for it: a lesson,
   * whose instrument pane lives to the right of the reading column, and the
   * curriculum. A measure-led page (`/about`, `/404`) must NOT — widening a
   * shell that only ever holds one column of prose just moves the empty space.
   */
  wide?: boolean;
  children?: ReactNode;
}

/**
 * The document body's shell.
 *
 * @param props - See `BaseLayoutProps`.
 * @returns Skip link, header, `<main>` and footer.
 */
export default function BaseLayout({
  wide = false,
  children,
  ...meta
}: BaseLayoutProps): JSX.Element {
  usePageMeta(meta);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      {/* tabIndex=-1: skip-link focus lands IN main, not just scrolls (WCAG 2.4.1). */}
      <main
        id="main"
        tabIndex={-1}
        className={`mx-auto w-full px-4 md:px-6 ${wide ? 'max-w-shell' : 'max-w-container'}`}
      >
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
