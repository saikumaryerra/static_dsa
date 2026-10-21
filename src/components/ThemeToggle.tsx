/**
 * ThemeToggle — light/dark theme switcher (designer M1 spec, site spec §9).
 * Ported from `ThemeToggle.astro` (React migration P2); the behaviour is the
 * client module `src/client/modules/theme-toggle.ts`, the CSS
 * `src/styles/components/theme-toggle.css`.
 *
 * Props: none.
 *
 * Behavior:
 * - Two visible states; "system" is the implicit default while no `localStorage`
 *   key exists. Clicking sets `data-theme` on <html> to the opposite of the
 *   currently *resolved* theme and persists it under the key `theme`.
 * - While no key exists the script follows OS `prefers-color-scheme` changes
 *   live; once the user chooses, it unsubscribes.
 * - Both icons ship in the static HTML; CSS `[data-theme]` selectors show the
 *   right one pre-hydration (no flash, no layout shift). The icon shows the
 *   *action*: moon in light mode ("switch to dark"), sun in dark mode.
 * - Hidden entirely under <noscript> (the rule lives in `Document`'s head)
 *   because the CSS media-query fallback already themes the page without JS.
 */
import type { JSX } from 'react';
import { useClientModule } from '../render/context';

/**
 * The header's theme toggle.
 *
 * @returns The toggle button.
 */
export default function ThemeToggle(): JSX.Element {
  useClientModule('theme-toggle');
  return (
    <button
      type="button"
      className="theme-toggle"
      data-theme-toggle=""
      aria-label="Toggle theme"
    >
      {/* Moon: shown in light mode; the action is "switch to dark". Inline SVG,
          no icon library. */}
      <svg
        className="theme-toggle__icon theme-toggle__icon--moon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
      </svg>
      {/* Sun: shown in dark mode; the action is "switch to light". */}
      <svg
        className="theme-toggle__icon theme-toggle__icon--sun"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
      </svg>
    </button>
  );
}
