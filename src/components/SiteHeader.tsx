/**
 * SiteHeader — global sticky header (site spec §9, designer M1 wireframe).
 * Ported from `SiteHeader.astro` (React migration P2); its CSS lives in
 * `src/styles/components/site-header.css`.
 *
 * Props: none. Marks the link matching the current URL with `aria-current="page"`
 * and the section a descendant page sits under with `aria-current="true"`.
 *
 * Layout per wireframe: sticky top, z-40, `--header-h` tall (56px, 64px ≥768px),
 * bg --bg with a 1px --border bottom rule; wordmark left, nav (Learn / Glossary /
 * About) + theme toggle right. Labels flex-wrap instead of truncating (i18n
 * headroom). The height comes from the token and is stated nowhere else here —
 * see the stylesheet.
 *
 * The wordmark no longer carries the site-root hook the portable artifact
 * resolved client-built links against (decision D-01): the site deploys at one
 * origin, and `src/lib/progress.ts` builds those links root-absolute.
 */
import type { JSX } from 'react';
import { NAV_ITEMS, navCurrent } from '../lib/nav';
import { useRenderContext } from '../render/context';
import ThemeToggle from './ThemeToggle';

/**
 * The site header.
 *
 * @returns The `<header>` landmark.
 */
export default function SiteHeader(): JSX.Element {
  // The matching rule lives in `nav.ts` (D1): `NAV_ITEMS` carries the shipped
  // trailing-slash href, so BOTH sides of the comparison have to be normalized
  // — and normalization that lives beside the hrefs it normalizes cannot drift
  // from them. It is also the only shape the rule can be a Vitest test in. What
  // its `.html` strip still buys is `/learn/index.html` — a URL a directory
  // build genuinely serves.
  const { pathname } = useRenderContext();
  return (
    <header className="site-header sticky top-0 z-40 border-b border-border bg-bg">
      <div className="flex h-full items-center justify-between gap-4 px-4 md:px-6">
        <a href="/" className="text-lg font-bold text-text">
          LearnDSA
        </a>
        <nav aria-label="Main" className="site-nav">
          <ul className="flex flex-wrap items-center gap-5">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="nav-link"
                  aria-current={navCurrent(pathname, item.href)}
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <ThemeToggle />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
