/**
 * The deployment URL that every DECLARED URL is built from (moved verbatim from
 * the retired `astro.config.mjs`, React migration step P1.2).
 *
 * Those declared URLs are `<link rel=canonical>`, `og:url`, `og:image`,
 * `twitter:image`, the sitemap's `<loc>`s, robots' `Sitemap:` line and the
 * JSON-LD `url` fields (spec §14). Navigational URLs take no part in this: they
 * are authored root-absolute and need no origin at all.
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
 * which is a working link to someone else's site.
 *
 * Read at RENDER time (prerender and dev middleware, both plain Node), never in
 * client code: nothing here reaches the browser bundle.
 */

/** The unstamped deployment URL. */
export const SENTINEL = 'https://learndsa.invalid';

/**
 * Hosting platforms that BUILD AND PUBLISH — the ones where an unstamped build
 * becomes a live site. Each entry is an environment variable that platform sets
 * on its own builders and nowhere else.
 *
 * THIS LIST IS THE FIX FOR A REAL INCIDENT (2026-08-24). It read `CF_PAGES`
 * alone, which is set on Cloudflare *Pages* — and this project deploys through
 * Cloudflare *Workers Builds*, which sets `WORKERS_CI` instead. So the guard
 * written to stop exactly this silently did not fire, the build succeeded, and
 * it printed `https://learndsa.invalid/`. Only an unrelated failure downstream
 * stopped 21 canonicals naming an unresolvable domain from going live.
 *
 * The lesson generalized: naming ONE platform made the guard a statement about
 * Cloudflare Pages when it needed to be a statement about deploying at all. Add
 * a row when a host is adopted — the cost of a missing one is a silent bad
 * deploy, and the cost of a spurious one is a build that says exactly what to set.
 */
export const PUBLISHING_BUILDERS: readonly (readonly [string, string])[] = [
  ['CF_PAGES', 'Cloudflare Pages'],
  ['WORKERS_CI', 'Cloudflare Workers Builds'],
  ['NETLIFY', 'Netlify'],
  ['VERCEL', 'Vercel'],
];

/** The slice of `process.env` this module reads; injected so it is testable. */
export type SiteEnv = Readonly<Record<string, string | undefined>>;

/**
 * Resolve the deployment URL for this build.
 *
 * THE SAFETY RULE: a real deployment must never silently ship the sentinel. An
 * unstamped build fails here instead of publishing canonicals, sitemap `<loc>`s
 * and an OG card that all name a domain that cannot exist. A local `npm run
 * build` and the GitHub-Actions gate set none of the builder variables and get
 * the sentinel with no failure — neither needs a real origin, and the e2e suite
 * tests the same artifact either way because it asserts on paths, not hosts.
 *
 * It fires on PREVIEW deployments too, because these variables are set there as
 * well. That is deliberate: set `SITE_URL` project-wide and a preview
 * canonicalizes to production, so it never competes with it in search.
 *
 * @param env - The environment, normally `process.env`.
 * @returns `SITE_URL`, or the sentinel when it is unset.
 * @throws On a publishing builder with no `SITE_URL`.
 */
export function resolveSiteUrl(env: SiteEnv): string {
  const site = env.SITE_URL || SENTINEL;
  const publisher = PUBLISHING_BUILDERS.find(([key]) => env[key]);
  if (site === SENTINEL && publisher) {
    throw new Error(
      `SITE_URL is not set on a ${publisher[1]} build. Every canonical, og:url, sitemap <loc> and JSON-LD url would ship the unstamped sentinel ${SENTINEL}. Set SITE_URL to the full deployment URL (e.g. https://learndsa.dev), as a build variable for BOTH the production and preview environments — see docs/deployment.md §2.1.`,
    );
  }
  return site;
}
