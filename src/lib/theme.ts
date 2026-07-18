/**
 * Theme-resolution logic shared by the ThemeToggle island (and unit-tested in
 * isolation). Mirrors the inline pre-paint script in BaseLayout — keep the two
 * in sync if the resolution rules ever change.
 */

/** The two resolvable themes. "System" is represented by the absence of a stored value. */
export type Theme = 'light' | 'dark';

/** `localStorage` key holding the user's explicit theme choice (designer spec: `theme`). */
export const THEME_STORAGE_KEY = 'theme';

/**
 * Resolves the effective theme from the user's stored choice and the OS preference.
 *
 * Rules (per the M1 designer handoff):
 * - A stored `"light"` or `"dark"` always wins (explicit user override).
 * - Any other value — `null` (no key), or a corrupt/legacy string — falls back
 *   to the OS `prefers-color-scheme` preference.
 *
 * @param stored - Raw value read from `localStorage` (may be `null` or garbage).
 * @param systemPrefersDark - Result of `matchMedia('(prefers-color-scheme: dark)').matches`.
 * @returns The theme to apply to `<html data-theme>`.
 */
export function resolveTheme(
  stored: string | null,
  systemPrefersDark: boolean,
): Theme {
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return systemPrefersDark ? 'dark' : 'light';
}
