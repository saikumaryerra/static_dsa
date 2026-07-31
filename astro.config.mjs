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
  // C1: emit `about.html` (served at /about, no redirect) instead of
  // `about/index.html` (served at /about/), so the no-slash canonicals + sitemap
  // are literally correct and consistent across every route.
  build: { format: 'file' },
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
