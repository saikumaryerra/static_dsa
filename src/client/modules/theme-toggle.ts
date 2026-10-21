// Client module for the header's theme toggle
// (`src/components/ThemeToggle.tsx`): the legacy `ThemeToggle.astro`
// `<script>`, moved verbatim (React migration plan §5 P2 WS-C step 4). Loaded
// as a `<script type="module">` on every page that renders the component.
import { resolveTheme, THEME_STORAGE_KEY, type Theme } from '../../lib/theme';

// Single toggle per page (header only in M1). If a second instance is ever
// added (e.g. a mobile menu), switch to querySelectorAll + a loop.
const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const media = window.matchMedia('(prefers-color-scheme: dark)');

/** Reads the stored choice; storage can throw (blocked/private mode), which means "no choice". */
function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Applies the theme to <html> and keeps the button's accessible name in sync. */
function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  // The label describes the *action* (matches the visible icon).
  button?.setAttribute(
    'aria-label',
    theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
  );
}

/**
 * THM-1: keeps browser chrome on the manually chosen theme. BaseLayout's
 * theme-color metas are media-scoped (so they work with JS off) and the first
 * one whose media matches wins — an explicit choice therefore needs an
 * un-scoped meta inserted *ahead* of them, which is why this literal OUTRANKS
 * the ones in BaseLayout for every user who ever clicked the toggle.
 *
 * The two values below are the `--bg` of each theme. They have moved twice —
 * M7.3's elevation inversion took light from #FFFFFF to #F8FAFC, and the
 * achromatic repaint took the pair to #FCFCFB / #0E0F12 — and this is the
 * third copy of them (tokens.css `:root` and `[data-theme="dark"]`,
 * BaseLayout's two media-scoped metas, here) — change one, change all three,
 * or the chrome silently diverges from the canvas exactly where it is hardest
 * to notice: only after an explicit theme choice.
 */
function syncThemeColor(theme: Theme): void {
  const existing = document.head.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]:not([media])',
  );
  const meta = existing ?? document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = theme === 'dark' ? '#0E0F12' : '#FCFCFB';
  if (!existing) {
    document.head.insertBefore(
      meta,
      document.head.querySelector('meta[name="theme-color"]'),
    );
  }
}

/** Follows OS preference changes live — only active while the user has no stored choice. */
function onSystemChange(event: MediaQueryListEvent): void {
  apply(resolveTheme(null, event.matches));
}

const stored = readStored();

if (stored === null) {
  media.addEventListener('change', onSystemChange);
}

button?.addEventListener('click', () => {
  const next: Theme =
    resolveTheme(readStored(), media.matches) === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage blocked: the toggle still works for this page view, it just won't persist.
  }
  // A stored key now exists (or the user clearly overrode the OS): stop following it.
  media.removeEventListener('change', onSystemChange);
  apply(next);
  syncThemeColor(next);
});

// Sync the aria-label with the theme the inline head script already applied.
const initial = resolveTheme(stored, media.matches);
apply(initial);
// A stored choice can disagree with the OS, and the head's metas only know the
// OS — without this the browser chrome would show the theme the page isn't in.
if (stored !== null) {
  syncThemeColor(initial);
}
