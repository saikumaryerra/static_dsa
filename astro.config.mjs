// @ts-check
import process from 'node:process';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

/**
 * The deployment URL — origin AND any sub-path — that every DECLARED URL is
 * built from: `<link rel=canonical>`, `og:url`, `og:image`, `twitter:image`,
 * the sitemap's `<loc>`s, robots' `Sitemap:` line and the JSON-LD `url` fields
 * (spec §14). Navigational URLs take no part in this: `scripts/portablize.mjs`
 * makes every one of them document-relative, so they need no origin at all.
 *
 * ONE EXPLICIT INPUT, and a sentinel — no heuristics (Plan D stage D3, §4.2).
 * The retired middle tier read `CF_PAGES_URL` on the production branch, and
 * Cloudflare documents that variable as the url of the current DEPLOYMENT: on
 * Pages it is hash-prefixed, so tier 2 was liable to bake a DIFFERENT origin
 * into every production build's canonicals. Rather than resolve that question
 * the tier is deleted, and with it the guessing.
 *
 * `https://learndsa.invalid` is the unstamped value. `.invalid` is reserved by
 * RFC 2606 and can never resolve, so a sentinel that leaks to production is
 * unmistakable in a grep and inert in the wild — unlike a stale real domain,
 * which is a working link to someone else's site. `npm run rehost <url>` swaps
 * it for a real deployment URL in a built `dist/`, which is how a host with no
 * build step (nginx, S3, GitHub Pages) gets correct metadata.
 */
const SENTINEL = 'https://learndsa.invalid';
const site = process.env.SITE_URL || SENTINEL;

// THE SAFETY RULE: a real deployment must never silently ship the sentinel.
// `CF_PAGES` is set on (and only on) a genuine Cloudflare Pages build, so an
// unstamped one fails here instead of publishing 20 canonicals, 19 sitemap
// <loc>s and an OG card that all name a domain that cannot exist. Local `npm
// run build` and GitHub-Actions CI set neither variable and get the sentinel
// with no failure — neither of them needs a real origin, and the e2e suite
// tests the same artifact either way because it asserts on paths, not hosts.
//
// It fires on PREVIEW deployments too, because `CF_PAGES` is set for those as
// well. That is deliberate and it preserves the previous behaviour: set
// `SITE_URL` project-wide (both environments) in the Pages dashboard and a
// preview canonicalizes to production, so it never competes with it in search.
if (site === SENTINEL && process.env.CF_PAGES) {
  throw new Error(
    'SITE_URL is not set on a Cloudflare Pages build. Every canonical, og:url, sitemap <loc> and JSON-LD url would ship the unstamped sentinel https://learndsa.invalid. Set SITE_URL to the full deployment URL, sub-path included (e.g. https://learndsa.dev), as a build variable for BOTH environments — see docs/deployment.md §2.1.',
  );
}

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
    // D2 (plan §4.2, requirement R3). MEASURED, and it corrects the plan: §3
    // recorded "0 root-absolute refs inside built JS chunks" because none of them
    // CONTAINS one — Vite's preload helper BUILDS one at runtime. It emitted
    // `function(dep){return "/"+dep}` and every lazily imported chunk's
    // modulepreload was therefore requested from the origin root: under
    // `sample.com/learndsa` that is six 404s per lesson page (the dynamic
    // `import()` itself is relative and still resolved, so the island hydrated
    // while its preloads failed — a defect no page-level pass can see and no
    // reader would report).
    //
    // `renderBuiltUrl` is the only lever for it: any function here switches Vite
    // to `new URL(dep, importerUrl).href` in the helper AND emits each dep
    // relative to the importing chunk (node_modules/vite `getPreloadCode`).
    // `vite.base: './'` does NOT work — Astro owns `base` and overwrites it,
    // verified against a real build.
    experimental: { renderBuiltUrl: () => ({ relative: true }) },
    // Tailwind v4 integrates with Astro via this Vite plugin (no @astrojs/tailwind).
    plugins: [tailwindcss()],
  },
});
