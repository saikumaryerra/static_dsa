/**
 * Primary site navigation, shared by SiteHeader and SiteFooter so the two never
 * drift as routes are added — and, since D1, the matching rule that decides
 * which item is current, for the same anti-drift reason.
 */

/** A top-level navigation destination. */
export interface NavItem {
  href: string;
  label: string;
}

/**
 * The primary nav, in display order.
 *
 * The hrefs carry the trailing slash because that IS the shipped URL
 * (`trailingSlash: 'always'`, astro.config.mjs): the slashless form is a 404 in
 * `astro preview` and a 301 on a real host. SiteFooter renders these verbatim,
 * so authoring the shipped shape here is what keeps the footer correct without
 * a second copy of the rule.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/learn/', label: 'Learn' },
  { href: '/glossary/', label: 'Glossary' },
  { href: '/about/', label: 'About' },
] as const;

/**
 * Normalize a URL path for nav matching: drop a trailing `/index.html` or
 * `.html`, then any trailing slashes. `/learn/`, `/learn/index.html`,
 * `/learn.html` and `/learn` all compare equal. Never returns empty — the site
 * root normalizes to `/`.
 */
function normalizePath(path: string): string {
  return path.replace(/(\/index)?\.html$/, '').replace(/\/+$/, '') || '/';
}

/**
 * The `aria-current` value for a nav destination, or `undefined` when the item
 * is unrelated to the current URL.
 *
 * M7.1 IA-9: lesson pages (`/learn/binary-search/`) previously left every nav
 * item unmarked, so the header could not say where you were. A descendant is
 * marked "true" ("this is the current item in its set") rather than "page",
 * which stays reserved for the exact URL.
 *
 * BOTH SIDES ARE NORMALIZED, and that is what D1 changed. `NAV_ITEMS` now
 * carries the shipped trailing slash, so normalizing only the pathname (which is
 * what SiteHeader used to do) would break both comparisons at once: `/learn`
 * never equals `/learn/`, and the descendant probe would ask for `/learn//`,
 * which no path can start with. That second failure is silent — no 404, just a
 * header that stops saying where you are — so the rule lives here, beside the
 * hrefs it normalizes, where it cannot drift from them.
 *
 * Normalizing the pathname still earns its keep after the flip, though not for
 * the reason the old comment gave. MEASURED under this config: `astro dev`,
 * `astro preview` and the build all hand this function the SLASHED form
 * (`/learn/`) — but `/learn/index.html` is still directly reachable and returns
 * 200, and without the `(/index)?\.html` strip a reader who lands on that URL
 * gets a header that marks nothing. The strip also keeps the function correct
 * for the retired `format: 'file'` shape (`/learn.html`).
 *
 * Pure and exported rather than local to `.astro` frontmatter, because
 * frontmatter is not importable and the Vitest harness has no DOM — this is the
 * only shape in which the rule can be a test instead of a convention.
 *
 * @param currentPath - The current page's path, e.g. `Astro.url.pathname`.
 * @param href - A `NAV_ITEMS` destination.
 * @returns `'page'` for the exact page, `'true'` for a descendant, else `undefined`.
 */
export function navCurrent(
  currentPath: string,
  href: string,
): 'page' | 'true' | undefined {
  const here = normalizePath(currentPath);
  const target = normalizePath(href);
  if (here === target) return 'page';
  return here.startsWith(`${target}/`) ? 'true' : undefined;
}
