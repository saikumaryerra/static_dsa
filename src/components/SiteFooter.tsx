/**
 * SiteFooter — global footer (site spec §9, designer M1 wireframe). Ported from
 * `SiteFooter.astro` (React migration P2); it has no CSS of its own.
 *
 * Props: none.
 *
 * Layout per wireframe: 96px top margin, 1px --border top rule, stacked with
 * --space-4 gaps on mobile, a space-between row ≥768px. Contents: wordmark +
 * tagline, nav repeat, and the free/open-source line with copyright.
 */
import type { JSX } from 'react';
import { NAV_ITEMS } from '../lib/nav';

/**
 * The site footer.
 *
 * @returns The `<footer>` landmark.
 */
export default function SiteFooter(): JSX.Element {
  // Frozen at build time — fine for a fully static site rebuilt on every deploy.
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 border-t border-border">
      <div className="flex flex-col gap-4 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
        <p className="text-sm text-muted">
          <span className="font-semibold text-text">LearnDSA</span> — free
          engineering courses you work through at your own pace.
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-5">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="nav-link">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-xs text-muted">{`Free and open source. © ${year} LearnDSA`}</p>
      </div>
    </footer>
  );
}
