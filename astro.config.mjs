// @ts-check
import process from 'node:process';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

/**
 * Production origin — every canonical, OG/Twitter tag, sitemap <loc>, robots
 * Sitemap: line, and JSON-LD url derives from it (spec §14).
 *
 * Resolution order:
 *  1. `SITE_URL` — explicit override. SET THIS (or edit PRODUCTION_URL below) when a
 *     custom domain is added: a custom domain does NOT change CF_PAGES_URL, so
 *     without it canonicals would keep pointing at the pages.dev origin.
 *  2. `CF_PAGES_URL` on the production branch — Cloudflare Pages injects this at
 *     build time, and on the production branch it IS https://<project>.pages.dev.
 *     Deriving it means the deployed canonicals are correct even if PRODUCTION_URL
 *     below is stale/misspelled.
 *  3. PRODUCTION_URL — used for local builds and preview branches. Previews
 *     deliberately canonicalize to production so they never compete with it in search.
 */
const PRODUCTION_URL = 'https://static-dsa.pages.dev';
const site =
  process.env.SITE_URL ||
  (process.env.CF_PAGES_BRANCH === 'main' ? process.env.CF_PAGES_URL : '') ||
  PRODUCTION_URL;

// https://astro.build/config
export default defineConfig({
  site,
  output: 'static',
  // D1 (docs/superpowers/plans/2026-08-21-plan-d-portable-artifact.md §5.1/§5.2).
  // These two constants are ONE decision and are kept adjacent for that reason.
  //
  // REVERSES C1, which emitted `about.html` and relied on the host resolving
  // `/about` to it. Cloudflare, Netlify, Vercel and GitHub Pages all do that —
  // plain static servers do NOT: `python -m http.server` and an S3 website
  // endpoint both 404 on `/about`. `about/index.html` served at `/about/` is the
  // shape EVERY one of those hosts serves natively, which is why R2 ("any host,
  // including a plain static server") forces directory format. It is also the
  // precondition for D2's relative-URL pass: a relative link resolves against the
  // DOCUMENT url, so `../glossary/` is only correct from `/learn/binary-search/`.
  //
  // `trailingSlash: 'always'` makes the slash the single PUBLISHED shape.
  // Astro's own preview 404s the slashless form rather than redirecting it
  // (measured: `/about` → 404, `/about/` → 200), so every authored internal link,
  // every canonical/og:url and every sitemap <loc> carries the slash — which is
  // what stops a page self-canonicalizing at a URL the host would 301.
  build: { format: 'directory' },
  trailingSlash: 'always',
  integrations: [mdx()],
  markdown: {
    // Dual-theme Shiki (spec §12/§13 AA): emit CSS-variable tokens so code blocks
    // follow the site light/dark theme instead of a single fixed dark palette.
    // Both comment colors clear WCAG 1.4.3 (≥4.5:1): github-light comment #6a737d
    // on #fff = 4.82:1; github-dark-default comment #8b949e on #0d1117 = 6.15:1.
    // (The old single `github-dark` comment was 3.05:1 — the a11y failure fixed here.)
    // Keep these two names in sync with the `<Code themes>` in CodeTabs.astro and the
    // `.astro-code` dark wiring in global.css. Highlighting stays build-time (no JS).
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark-default' },
    },
  },
  vite: {
    // Tailwind v4 integrates with Astro via this Vite plugin (no @astrojs/tailwind).
    plugins: [tailwindcss()],
  },
});
