/**
 * BaseLayout — P1 STUB (React migration, plan §5 P1 step 6). Records the page's
 * REAL head metadata, so titles, canonicals, descriptions, robots and JSON-LD
 * are at parity from P1 on, and renders only the `<main>` landmark around the
 * page. The skip link, `SiteHeader` and `SiteFooter` arrive with the port of
 * `BaseLayout.astro` (WS-C, P2), which replaces this file.
 */
import type { JSX, ReactNode } from 'react';
import { usePageMeta, type PageMeta } from '../render/context';

/** Props: the page's head metadata plus the shell width. */
export interface BaseLayoutProps extends PageMeta {
  /**
   * Widen the shell from `--container-max` to `--shell` (redesign 2026-08,
   * amendment L-1): pages with a genuine third column only.
   */
  wide?: boolean;
  children?: ReactNode;
}

/**
 * The document body's shell (stub).
 *
 * @param props - See `BaseLayoutProps`.
 * @returns The `<main>` landmark.
 */
export default function BaseLayout({
  wide = false,
  children,
  ...meta
}: BaseLayoutProps): JSX.Element {
  usePageMeta(meta);
  return (
    <main
      id="main"
      tabIndex={-1}
      className={`mx-auto w-full px-4 md:px-6 ${wide ? 'max-w-shell' : 'max-w-container'}`}
    >
      {children}
    </main>
  );
}
