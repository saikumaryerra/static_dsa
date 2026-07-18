/**
 * Primary site navigation, shared by SiteHeader and SiteFooter so the two never
 * drift as routes are added. Routes /learn, /glossary, /about are authored in
 * later milestones (M2/M5); links may 404 until then.
 */

/** A top-level navigation destination. */
export interface NavItem {
  href: string;
  label: string;
}

/** The primary nav, in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/learn', label: 'Learn' },
  { href: '/glossary', label: 'Glossary' },
  { href: '/about', label: 'About' },
] as const;
