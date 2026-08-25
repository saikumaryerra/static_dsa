/**
 * portablize.mjs — the post-build pass that makes `dist/` deployable at any
 * origin AND any sub-path (Plan D stage D2, requirement R3).
 *
 * Run automatically: `npm run build` is `astro check && astro build && node
 * scripts/portablize.mjs`. It is NOT a hand-run generator like `npm run fonts`
 * or `npm run og` — the artifact is only portable once this has run, so a build
 * that skipped it would ship a subtly wrong site. That is why it lives inside
 * the build chain rather than beside it: Cloudflare Pages' git integration runs
 * `npm run build` and deploys the output itself, so there is no deploy step to
 * hook (plan §4.2).
 *
 * ── WHY A POST-BUILD PASS AND NOT CONFIG ─────────────────────────────────────
 * Astro cannot emit relative URLs. `base` is root-absolute by contract, and
 * `assetsPrefix` is one fixed string for every page while this site has pages at
 * three depths. Setting `base` would also only move what Astro itself generates:
 * the ~33 hand-authored links (nav, breadcrumbs, lesson cards, 40 glossary links
 * in lesson prose) would stay root-absolute and break silently. One pass over
 * `dist/` catches Astro's asset URLs, the hand-written links, the font preloads
 * and the CSS `url()`s uniformly — and it can be proved by a single assertion,
 * "no root-absolute internal URL survives", instead of by reviewer vigilance
 * across every call site (plan §3).
 *
 * ── THE REWRITE, IN ONE LINE ─────────────────────────────────────────────────
 * A page's own depth is the whole of the arithmetic: `/` needs `./`, `/about/`
 * needs `../`, `/learn/binary-search/` needs `../../`. A relative URL resolves
 * against the DOCUMENT url, which is why `trailingSlash: 'always'` (D1) is a
 * precondition rather than a nicety — `../glossary/` is correct from
 * `/learn/binary-search/` and lands one level wrong from `/learn/binary-search`.
 *
 * ── WHAT IS DELIBERATELY LEFT ROOT-ABSOLUTE ──────────────────────────────────
 * `dist/404.html`, and nothing else (plan §4.4). A 404 document is served AT THE
 * URL THE READER TYPED, not at its own path, so a relative link on it resolves
 * against an arbitrary URL — `../glossary/` from `/learn/typo/deep/thing` is
 * nonsense. There is no JS-off fix (a `<base>` tag would break every fragment
 * link on the site, and a script violates §13), so the 404 keeps root-absolute
 * links. Root-absolute is not the same as origin-root, though: when THIS build
 * already knows it is deploying under a sub-path (`SITE_URL` carried one), the
 * pass reads that base path out of the artifact's own canonical and puts it in
 * front of those links, exactly as `npm run rehost` does for an artifact stamped
 * later. Both paths call one function, because when only the second had it a
 * host with a build step and a sub-path — GitHub Pages Actions, the host §4.4
 * cites — shipped a 404 that was unstyled and whose every escape link left the
 * deployment, with nothing anywhere to say so.
 *
 * ── THE LINKS THIS PASS CANNOT REACH, AND HOW THEY ARE FIXED ANYWAY ──────────
 * Three hrefs are built at RUNTIME in client JS — the resume CTA on `/` and
 * `/learn/`, and the review cards — where no HTML pass can rewrite a template
 * literal. They were briefly pinned here as an accepted gap, which was wrong:
 * they are the first links a RETURNING reader reaches for, so a sub-path
 * deployment shipped four visible, clickable 404s on its two busiest pages. They resolve against
 * `[data-site-root]` instead — `SiteHeader`'s wordmark, whose href THIS pass
 * rewrites per depth (`siteRoot` in `src/lib/progress.ts`). Both ends are
 * asserted below: every page carries that anchor pointing at its own root, and
 * no chunk may contain a root-absolute URL literal at all.
 *
 * Declared URLs — `<link rel=canonical>`, `og:url`, sitemap `<loc>`, JSON-LD —
 * are absolute `https://…` and must stay that way (the sitemap protocol and the
 * OG scrapers both require it). They fall outside the skip rule below by being
 * absolute, and they are stage D3's surface, not this one's.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* global URL -- Node has had a global WHATWG URL since 10; ESLint's `js.configs
   .recommended` env has no opinion about Node globals, and the sibling scripts
   declare theirs the same way. */

/**
 * The one document that keeps root-absolute links (plan §4.4).
 *
 * Under `build.format: 'directory'` it stays at `dist/404.html` rather than
 * becoming `404/index.html`, measured — which is what makes "the file called
 * exactly this" a safe way to name it.
 */
export const NOT_A_PAGE = '404.html';

/** The attributes that carry a navigational URL. */
export const URL_ATTRIBUTES = ['href', 'src', 'srcset', 'action'];

/**
 * The site-root anchor's opening tag — `<a … data-site-root …>`.
 *
 * The lookahead keeps a future `data-site-root-something` out. Anchors only:
 * the contract is "an href this pass rewrites", and only an element with an
 * href has one.
 */
const SITE_ROOT_ANCHOR = /<a\b[^>]*\sdata-site-root(?=[\s=>/])[^>]*>/gi;

/**
 * A `<script>`/`<style>` element, opening tag and body captured separately.
 *
 * The body is raw text, not markup: minified JS containing `link.href="/learn/"`
 * would match the attribute regex and be corrupted by a naive pass. The opening
 * tag still carries `src="/_astro/…"` and must be rewritten, hence the split.
 */
const RAW_TEXT_ELEMENT = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi;

/**
 * One URL-bearing attribute: `href="…"` or `href='…'`.
 *
 * The lookbehind is load-bearing: without it `data-href="/x"` and `xlink:href`
 * match too, and a `data-*` value belongs to whatever script reads it, not to
 * this pass. The built site has exactly two attribute names (`href`, `src`) and
 * no prefixed variant of either — measured, and the assertion below walks this
 * same regex, so the two can never disagree about what was in scope.
 */
const URL_ATTRIBUTE =
  /(?<![\w:-])(href|src|srcset|action)\s*=\s*("([^"]*)"|'([^']*)')/gi;

/**
 * A `<link rel=canonical>` tag.
 *
 * The artifact's own statement of where it is deployed — written by `astro
 * build` through `deploymentUrl`, so it is the one value in `dist/` that cannot
 * disagree with the URLs the build published. {@link declaredBasePath} reads the
 * 404's base path out of it.
 */
const CANONICAL_LINK = /<link\b[^>]*\brel=(["'])canonical\1[^>]*>/gi;

/** The `href` of ONE tag already matched — not a document sweep. */
const HREF_IN_TAG = /(?<![\w:-])href\s*=\s*("([^"]*)"|'([^']*)')/i;

/** A root-absolute `url(/…)` in CSS, quoted or bare. */
const CSS_ROOT_URL = /url\(\s*(['"]?)(\/(?!\/)[^'")\s]*)\1\s*\)/g;

/** A string or template literal whose value starts with a single `/`. */
const JS_ROOT_LITERAL = /(["'`])(\/(?!\/)[^"'`\n]*)\1/g;

/**
 * `return "/" + dep` — a root-absolute URL ASSEMBLED at runtime.
 *
 * The one defect class a literal scan cannot see, and the plan's §3 measurement
 * ("0 root-absolute refs inside built JS chunks") missed it for exactly that
 * reason. Vite's preload helper used to emit `function(dep){return"/"+dep}`, so
 * every lazily imported chunk's `modulepreload` was requested from the origin
 * root — six 404s per lesson under a sub-path, while the dynamic `import()`
 * beside it resolved relatively and hydrated fine. `astro.config.mjs`'s
 * `vite.experimental.renderBuiltUrl` replaced it with `new URL(dep,
 * importerUrl)`; this is the pin that keeps it replaced.
 */
const JS_RUNTIME_ROOT_BASE = /return\s*(["'`])\/\1\s*\+/g;

/**
 * The page URL a built document is served at.
 *
 * Pure arithmetic on the path under `build.format: 'directory'`:
 * `learn/binary-search/index.html` is reachable at `/learn/binary-search/` and
 * nowhere else.
 *
 * @param {string} distRelative - Path relative to `dist/`, POSIX-separated.
 * @returns {string} The served URL, always slash-terminated.
 */
export function pageUrlOf(distRelative) {
  if (distRelative === 'index.html') return '/';
  if (distRelative.endsWith('/index.html')) {
    return `/${distRelative.slice(0, -'index.html'.length)}`;
  }
  // A loose `.html` that is not the 404 means the build shape moved back to
  // `format: 'file'` (or something new appeared). Relativizing it would need a
  // different depth rule, so it fails loudly instead of being guessed at.
  //
  // The observed cause, named because it cost a deployment (2026-08-24): a
  // `client/` prefix means an ASTRO ADAPTER is installed and has moved the
  // static output to `dist/client/`. On that deploy `wrangler deploy` had
  // auto-configured the project and added `@astrojs/cloudflare` — which spec §4
  // forbids, this site having no server. `wrangler.jsonc` now exists to stop
  // that, and its own comment explains why.
  const adapter = distRelative.startsWith('client/')
    ? ' The `client/` prefix means an Astro adapter has moved the build into `dist/client/` — see wrangler.jsonc, and do not add an adapter (spec §4).'
    : '';
  throw new Error(
    `${distRelative} is not a directory-format page. \`build.format: 'directory'\` (D1) emits <path>/index.html; only ${NOT_A_PAGE} is exempt, and it is skipped before this point.${adapter}`,
  );
}

/**
 * The document-relative prefix that reaches the site root from a page URL.
 *
 * @param {string} pageUrl - A slash-terminated page URL, e.g. `/about/`.
 * @returns {string} `./` at the root, otherwise `../` per path segment.
 */
export function prefixFor(pageUrl) {
  const depth = pageUrl.split('/').filter(Boolean).length;
  return depth === 0 ? './' : '../'.repeat(depth);
}

/**
 * Rewrites one attribute value, or reports that it must not be touched.
 *
 * Skipped, all by the same test — the value does not start with exactly one
 * `/`: protocol-relative `//cdn…`, `http(s)://…`, `mailto:`, `data:`, a bare
 * `#fragment` (this site's ToC, scroll-spy and `<StepLink>` are all fragment
 * links) and anything already relative.
 *
 * QUERY AND FRAGMENT ARE SPLIT OFF AND REATTACHED UNTOUCHED. Only the path may
 * move: `/learn/#track-arrays` becomes `../learn/#track-arrays`, never
 * `../learn#track-arrays/`. Getting that wrong breaks scroll-spy and the review
 * deep-link in a way that is cheap to specify and miserable to diagnose.
 *
 * @param {string} value - The raw attribute value.
 * @param {string} prefix - The page's prefix from {@link prefixFor}.
 * @returns {string | null} The rewritten value, or `null` if it must not change.
 */
export function relativizeUrlValue(value, prefix) {
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  const cut = value.search(/[?#]/);
  const path = cut === -1 ? value : value.slice(0, cut);
  const suffix = cut === -1 ? '' : value.slice(cut);
  // `href="/"` (the wordmark) becomes exactly the prefix: `./` from the home
  // page, `../../` from a lesson.
  return `${prefix}${path.slice(1)}${suffix}`;
}

/**
 * Rewrites every candidate in a `srcset`.
 *
 * Comma-separated URL + descriptor pairs, rewritten per candidate. The site
 * ships none today (the pass reports 0), and it is implemented anyway because
 * the day one appears is not the day to discover the pass ignores it.
 *
 * @param {string} value - The raw `srcset` value.
 * @param {string} prefix - The page's prefix from {@link prefixFor}.
 * @returns {string | null} The rewritten value, or `null` if nothing moved.
 */
export function relativizeSrcset(value, prefix) {
  let changed = false;
  const out = value.split(',').map((candidate) => {
    const [, lead, url, tail] = /^(\s*)(\S*)([\s\S]*)$/.exec(candidate) ?? [];
    const next = relativizeUrlValue(url ?? '', prefix);
    if (next === null) return candidate;
    changed = true;
    return `${lead ?? ''}${next}${tail ?? ''}`;
  });
  return changed ? out.join(',') : null;
}

/**
 * Walks every URL-bearing attribute in a document, outside raw-text bodies.
 *
 * The single surface both the rewrite and its assertion run over, so the check
 * cannot inspect a different set of URLs than the rewrite touched.
 *
 * @param {string} html - The document.
 * @param {(value: string, attribute: string) => string | null} mapper -
 *   Returns a replacement value, or `null` to leave the attribute alone.
 * @returns {{ html: string, changed: number }}
 */
export function mapAttributeUrls(html, mapper) {
  let changed = 0;
  const rewriteAttributes = (chunk) =>
    chunk.replace(URL_ATTRIBUTE, (whole, attribute, _quoted, dq, sq) => {
      const value = dq ?? sq ?? '';
      const next = mapper(value, String(attribute).toLowerCase());
      if (next === null || next === value) return whole;
      changed += 1;
      const quote = dq === undefined ? "'" : '"';
      return `${attribute}=${quote}${next}${quote}`;
    });

  let out = '';
  let cursor = 0;
  RAW_TEXT_ELEMENT.lastIndex = 0;
  for (const block of html.matchAll(RAW_TEXT_ELEMENT)) {
    const start = block.index ?? 0;
    out += rewriteAttributes(html.slice(cursor, start));
    // Only the opening tag: the body is JS or CSS text and is left verbatim.
    out +=
      rewriteAttributes(block[1] ?? '') + (block[3] ?? '') + (block[4] ?? '');
    cursor = start + block[0].length;
  }
  out += rewriteAttributes(html.slice(cursor));
  return { html: out, changed };
}

/**
 * Relativizes one built page.
 *
 * @param {string} html - The document.
 * @param {string} pageUrl - The URL it is served at, from {@link pageUrlOf}.
 * @returns {{ html: string, prefix: string, counts: Record<string, number> }}
 */
export function relativizeHtml(html, pageUrl) {
  const prefix = prefixFor(pageUrl);
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(URL_ATTRIBUTES.map((name) => [name, 0]));
  const { html: out } = mapAttributeUrls(html, (value, attribute) => {
    const next =
      attribute === 'srcset'
        ? relativizeSrcset(value, prefix)
        : relativizeUrlValue(value, prefix);
    if (next !== null) counts[attribute] = (counts[attribute] ?? 0) + 1;
    return next;
  });
  return { html: out, prefix, counts };
}

/**
 * Every root-absolute URL left in a document's attributes — the assertion.
 *
 * @param {string} html - The document.
 * @returns {string[]} The offending values, in document order.
 */
export function rootAbsoluteAttributeUrls(html) {
  /** @type {string[]} */
  const found = [];
  mapAttributeUrls(html, (value, attribute) => {
    const candidates =
      attribute === 'srcset'
        ? value.split(',').map((part) => part.trim().split(/\s+/)[0] ?? '')
        : [value];
    for (const candidate of candidates) {
      if (candidate.startsWith('/') && !candidate.startsWith('//')) {
        found.push(candidate);
      }
    }
    return null;
  });
  return found;
}

/**
 * Every `[data-site-root]` anchor's href in a document.
 *
 * The other end of the runtime-link rule: client JS resolves the links it builds
 * against this anchor, so a page that lost it — or whose anchor stopped pointing
 * at the site root — would strand the resume CTA and the review cards. Reported
 * as a LIST so {@link main} can insist on exactly one: two anchors disagreeing
 * about where the root is would be resolved by document order, silently.
 *
 * @param {string} html - The document.
 * @returns {string[]} One href per anchor, `''` when an anchor carries none.
 */
export function siteRootHrefs(html) {
  /** @type {string[]} */
  const found = [];
  for (const tag of html.matchAll(SITE_ROOT_ANCHOR)) {
    const href = HREF_IN_TAG.exec(tag[0]);
    found.push(href?.[2] ?? href?.[3] ?? '');
  }
  return found;
}

/**
 * Every `<link rel=canonical>` href in a document.
 *
 * A LIST, for the same reason {@link siteRootHrefs} is one: two canonicals
 * disagreeing about where a page lives would otherwise be resolved by document
 * order, silently. {@link declaredBasePath} insists on exactly one, and
 * `scripts/rehost.mjs` reads its post-conditions through this same function so
 * the build and the stamp cannot disagree about what a canonical is.
 *
 * @param {string} html - The document.
 * @returns {string[]} One href per canonical tag, in document order; a tag with
 *   no href is skipped, because it declares nothing.
 */
export function canonicalHrefs(html) {
  /** @type {string[]} */
  const found = [];
  for (const tag of html.matchAll(CANONICAL_LINK)) {
    const href = HREF_IN_TAG.exec(tag[0]);
    const value = href?.[2] ?? href?.[3];
    if (value !== undefined) found.push(value);
  }
  return found;
}

/**
 * The base path a deployment URL carries.
 *
 * @param {string | URL} deployment - A full deployment URL, sub-path included,
 *   e.g. `https://sample.com/learndsa`.
 * @returns {string} The path with NO trailing slash: `''` at a root deployment,
 *   `/learndsa` under a sub-path. `''` rather than `/` is what makes
 *   {@link prefixRootAbsolute} a no-op at the root instead of rewriting
 *   `/about/` to `//about/` — a request to another host entirely.
 * @throws If the value is not an absolute URL.
 */
export function basePathOf(deployment) {
  return new URL(deployment).pathname.replace(/\/+$/, '');
}

/**
 * The base path THIS BUILD declared, read out of the home page's own canonical.
 *
 * WHY THE ARTIFACT AND NOT `process.env.SITE_URL`: the canonical is what `astro
 * build` actually emitted through `deploymentUrl` (src/lib/deployment-url.ts),
 * so the 404's base path cannot disagree with the URLs the same build published
 * — and the pass still knows the deployment when it is run by hand, in a shell
 * that never had the variable.
 *
 * It THROWS rather than falling back to `''`, because a silent root default on a
 * sub-path build is the exact defect this exists to close: a 404 that is
 * unstyled and whose every escape link leaves the deployment, with nothing said
 * about it anywhere.
 *
 * @param {string} homePage - `dist/index.html`, whose `canonicalPath` is `/`.
 * @returns {string} `''` at a root deployment — including the unstamped
 *   sentinel, which lives at one — `/learndsa` under a sub-path.
 * @throws If the page does not carry exactly one canonical, or it is not an
 *   absolute URL.
 */
export function declaredBasePath(homePage) {
  const hrefs = canonicalHrefs(homePage);
  if (hrefs.length !== 1) {
    throw new Error(
      `dist/index.html declares ${hrefs.length} canonical URLs${hrefs.length === 0 ? '' : ` (${hrefs.join(', ')})`}; exactly one names the deployment this artifact was built for, and it is the only place the ${NOT_A_PAGE} base path can be read from.`,
    );
  }
  try {
    return basePathOf(hrefs[0] ?? '');
  } catch {
    throw new Error(
      `dist/index.html's canonical "${hrefs[0]}" is not an absolute URL, so the deployment's base path cannot be read from it.`,
    );
  }
}

/**
 * Prefix a document's root-absolute URLs with the deployment's base path.
 *
 * The §4.4 carve-out's second half, and the ONE implementation of it. `404.html`
 * keeps root-absolute links, so under a sub-path deployment every one of them
 * points at the ORIGIN root until the base path goes in front of it. Both
 * stamping paths call this — {@link main} when the build already knows its
 * deployment (`SITE_URL` carried a sub-path), `scripts/rehost.mjs` when a
 * sentinel artifact is re-pointed afterwards — because two implementations were
 * two artifacts: the build-time path used to skip the prefix entirely, and since
 * `rehost` refuses a stamped artifact there was then no way to supply it. A host
 * with a build step and a sub-path (GitHub Pages Actions, the host §4.4 cites)
 * shipped an unstyled 404 whose every escape link left the deployment.
 *
 * Uses the SAME attribute walker as the relative pass, deliberately: the 404
 * ships the inline pre-paint theme script, and a bare regex over the document
 * would walk into its body. Values that are not root-absolute — the absolute
 * canonical and `og:image`, a bare `#fragment` — are left alone by the same one
 * test {@link relativizeUrlValue} uses.
 *
 * It is INCREMENTAL, so it must run at most once over a document; the guard on
 * each caller is what makes that true.
 *
 * @param {string} html - `404.html`.
 * @param {string} basePath - Base path with no trailing slash; `''` is a no-op.
 * @returns {{ html: string, changed: number }}
 */
export function prefixRootAbsolute(html, basePath) {
  if (basePath === '') return { html, changed: 0 };
  const { html: out, changed } = mapAttributeUrls(html, (value) =>
    value.startsWith('/') && !value.startsWith('//')
      ? `${basePath}${value}`
      : null,
  );
  return { html: out, changed };
}

/**
 * Rewrites `url(/fonts/…)` to `url(../fonts/…)` in a built stylesheet.
 *
 * A CONSTANT rewrite with no depth logic, because every built stylesheet sits
 * directly under `dist/_astro/`. That assumption is not trusted — {@link main}
 * asserts it against the files on disk before this is applied.
 *
 * @param {string} css - The stylesheet.
 * @returns {{ css: string, changed: number }}
 */
export function relativizeCss(css) {
  let changed = 0;
  const out = css.replace(CSS_ROOT_URL, (_whole, quote, url) => {
    changed += 1;
    return `url(${quote}../${String(url).slice(1)}${quote})`;
  });
  return { css: out, changed };
}

/**
 * Every root-absolute `url()` left in a stylesheet — the assertion.
 *
 * @param {string} css - The stylesheet.
 * @returns {string[]} The offending URLs.
 */
export function rootAbsoluteCssUrls(css) {
  return [...css.matchAll(CSS_ROOT_URL)].map((match) => match[2] ?? '');
}

/**
 * Root-absolute URL literals inside built JavaScript, normalized.
 *
 * `${…}` collapses to `${}` so the reported shape survives a bundler renaming
 * minified variables — the failure message names the link, not `e` and `o`. A
 * bare `'/'` is excluded: it is a separator argument (`parts.join('/')`), not a
 * URL.
 *
 * The filter is `/^\/[^/]/` — one slash then ANY character — rather than a
 * letters-and-underscore class. A narrower class silently exempts real links:
 * `"/404.html"`, `"/2026/post"` and `"/-foo"` are all root-absolute URLs that
 * would break under a sub-path, and a guard §4.6 describes as having "no
 * exceptions" must not carve out three by accident. The two things it still
 * rejects are the ones that are not links: a bare `'/'` (nothing follows it) and
 * `'//…'` (protocol-relative, an external origin the pass deliberately leaves
 * alone).
 *
 * @param {string} js - Chunk source, or an inline `<script>` body.
 * @returns {string[]} Normalized literals, duplicates included.
 */
export function runtimeAbsoluteLiterals(js) {
  return [...js.matchAll(JS_ROOT_LITERAL)]
    .map((match) => (match[2] ?? '').replace(/\$\{[^}]*\}/g, '${}'))
    .filter((literal) => /^\/[^/]/.test(literal));
}

/**
 * Occurrences of a runtime-assembled root-absolute base in built JavaScript.
 *
 * @param {string} js - Chunk source, or an inline `<script>` body.
 * @returns {string[]} The matched fragments, for the failure message.
 */
export function runtimeRootBases(js) {
  return [...js.matchAll(JS_RUNTIME_ROOT_BASE)].map((match) => match[0]);
}

/**
 * Every inline `<script>` body in a document, JSON-LD excluded (structured data
 * is not code).
 *
 * @param {string} html - The document.
 * @returns {string[]} Script bodies.
 */
export function inlineScriptBodies(html) {
  /** @type {string[]} */
  const bodies = [];
  for (const block of html.matchAll(RAW_TEXT_ELEMENT)) {
    if (String(block[2]).toLowerCase() !== 'script') continue;
    if (/ld\+json/i.test(block[1] ?? '')) continue;
    if ((block[3] ?? '').trim().length > 0) bodies.push(block[3] ?? '');
  }
  return bodies;
}

/** Every file under `dir`, recursively, as absolute paths. */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    out.push(...(statSync(path).isDirectory() ? walk(path) : [path]));
  }
  return out;
}

/** Writes one line to stdout — `no-console` is an absolute ban in this repo. */
const say = (line) => process.stdout.write(`${line}\n`);

/**
 * Fails the build.
 *
 * A portability guard that warns is a guard nobody reads: every violation below
 * ships a site that is silently wrong under a sub-path, so each one exits 1.
 *
 * @param {string} headline - What broke.
 * @param {string[]} detail - The offending values.
 * @returns {never}
 */
function fail(headline, detail = []) {
  process.stderr.write(`\nportablize: ${headline}\n`);
  for (const line of detail.slice(0, 20)) {
    process.stderr.write(`  ${line}\n`);
  }
  if (detail.length > 20) {
    process.stderr.write(`  …and ${detail.length - 20} more\n`);
  }
  process.exit(1);
}

/** Runs the pass over `dist/`, then asserts it left nothing behind. */
function main() {
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  if (!existsSync(dist)) {
    fail(
      `no dist/ at ${dist}. This pass runs after \`astro build\`; run \`npm run build\`.`,
    );
  }
  const files = walk(dist);
  const distRelative = (file) => relative(dist, file).split(sep).join('/');

  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  const cssFiles = files.filter((file) => file.endsWith('.css'));
  const jsFiles = files.filter((file) => file.endsWith('.js'));

  // ── 1. Pages ───────────────────────────────────────────────────────────────
  /** @type {Record<string, number>} */
  const attributeCounts = Object.fromEntries(
    URL_ATTRIBUTES.map((name) => [name, 0]),
  );
  let pagesRewritten = 0;
  /** The home page AFTER the pass — the artifact's own statement of its URL. */
  let homePage = '';
  for (const file of htmlFiles) {
    const name = distRelative(file);
    if (name === NOT_A_PAGE) continue; // the §4.4 carve-out
    const source = readFileSync(file, 'utf8');
    const { html, counts } = relativizeHtml(source, pageUrlOf(name));
    for (const attribute of URL_ATTRIBUTES) {
      attributeCounts[attribute] =
        (attributeCounts[attribute] ?? 0) + (counts[attribute] ?? 0);
    }
    if (html !== source) writeFileSync(file, html);
    if (name === 'index.html') homePage = html;
    pagesRewritten += 1;
  }

  // ── 2. The 404's base path (§4.4) ──────────────────────────────────────────
  // RUNNING THIS PASS TWICE OVER ONE dist/ IS A CORRUPTION, not a no-op: the
  // prefixing below is incremental (`/about/` → `/learndsa/about/` →
  // `/learndsa/learndsa/about/`), and on a build that already knows its sub-path
  // there is no sentinel anywhere to notice with. The rewrite count is the
  // signal that cannot be faked — a fresh build has hundreds (measured: 519
  // href + 102 src, and the wordmark alone gives one per page), an already
  // portablized one has exactly none. Nothing has been WRITTEN when the count is
  // zero (`html !== source` is false on every page), so this leaves `dist/` as
  // it found it, and `astro build` empties `dist/` so `npm run build` can always
  // be re-run.
  const rewritten = URL_ATTRIBUTES.reduce(
    (total, attribute) => total + (attributeCounts[attribute] ?? 0),
    0,
  );
  if (rewritten === 0) {
    fail(
      `not one root-absolute URL was found across ${pagesRewritten} pages, so this \`dist/\` has already been portablized — or the site stopped emitting them, in which case this guard is what needs editing. Re-running the pass would give ${NOT_A_PAGE} a SECOND base path (/learndsa/learndsa/about/) under a sub-path build, so it stops here instead. Rebuild — it is deterministic:\n\n    npm run build`,
    );
  }
  if (homePage === '') {
    fail(
      `no dist/index.html. It is the page whose canonical names the deployment, so without it the ${NOT_A_PAGE} base path cannot be read at all.`,
    );
  }
  /** `''` at a root deployment (and for the sentinel), `/learndsa` otherwise. */
  let basePath = '';
  try {
    basePath = declaredBasePath(homePage);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const declaredRoot = canonicalHrefs(homePage)[0] ?? '';
  let prefixedLinks = 0;
  if (basePath !== '') {
    const file = join(dist, NOT_A_PAGE);
    if (!existsSync(file)) {
      fail(
        `no dist/${NOT_A_PAGE}, and this build deploys under ${basePath}/ — the one document that keeps root-absolute links is the one document missing.`,
      );
    }
    const source = readFileSync(file, 'utf8');
    const { html, changed } = prefixRootAbsolute(source, basePath);
    if (changed === 0) {
      fail(
        `dist/${NOT_A_PAGE} carries no root-absolute URL to prefix with ${basePath}/. Either its links were relativized (they must not be — it is served at the URL the reader typed) or the page lost them; either way a reader who mistypes a URL under this deployment gets an unstyled page with no way back into it.`,
      );
    }
    writeFileSync(file, html);
    prefixedLinks = changed;
    // Post-condition, over the same walker the rewrite used: nothing on this
    // page may address the origin root any more.
    const escaping = rootAbsoluteAttributeUrls(html).filter(
      (url) => !url.startsWith(`${basePath}/`),
    );
    if (escaping.length > 0) {
      fail(
        `a URL on ${NOT_A_PAGE} still addresses the origin root rather than ${basePath}/ — under this deployment it leaves the site`,
        escaping,
      );
    }
  }

  // ── 3. Stylesheets ─────────────────────────────────────────────────────────
  // The constant `../` is only correct for a stylesheet that sits directly under
  // `dist/_astro/`. Verified against the build rather than assumed.
  const misplaced = cssFiles.filter(
    (file) =>
      rootAbsoluteCssUrls(readFileSync(file, 'utf8')).length > 0 &&
      distRelative(file).split('/').length !== 2,
  );
  if (misplaced.length > 0) {
    fail(
      'a stylesheet outside `dist/_astro/` carries a root-absolute url(). The constant `../` rewrite below assumes every one of them is exactly one directory deep; this build breaks that assumption, so the pass would emit a wrong path instead of failing.',
      misplaced.map(distRelative),
    );
  }
  let cssRewritten = 0;
  let cssUrls = 0;
  for (const file of cssFiles) {
    const source = readFileSync(file, 'utf8');
    const { css, changed } = relativizeCss(source);
    if (changed === 0) continue;
    writeFileSync(file, css);
    cssRewritten += 1;
    cssUrls += changed;
  }

  // ── 4. Assertions ──────────────────────────────────────────────────────────
  /** @type {string[]} */
  const leftInHtml = [];
  /** @type {string[]} */
  const strandedAnchors = [];
  for (const file of htmlFiles) {
    const name = distRelative(file);
    if (name === NOT_A_PAGE) continue;
    const html = readFileSync(file, 'utf8');
    for (const url of rootAbsoluteAttributeUrls(html)) {
      leftInHtml.push(`${url}  (in ${name})`);
    }
    // The anchor client JS resolves its own links against, checked to the
    // character: one per page, and its href is exactly this page's way back to
    // the site root. `<a href="/">` is what makes those two the same thing after
    // the rewrite above, so a wordmark repointed at `/learn/` fails here rather
    // than sending every resume CTA on the site one directory too deep.
    const anchors = siteRootHrefs(html);
    const want = prefixFor(pageUrlOf(name));
    if (anchors.length !== 1 || anchors[0] !== want) {
      strandedAnchors.push(
        `${name}: expected one [data-site-root] href="${want}", found ${
          anchors.length === 0
            ? 'none'
            : anchors.map((href) => `href="${href}"`).join(', ')
        }`,
      );
    }
  }
  if (leftInHtml.length > 0) {
    fail(
      'root-absolute URLs survived the page pass — each one points at the origin root under a sub-path deployment',
      leftInHtml,
    );
  }
  if (strandedAnchors.length > 0) {
    fail(
      "the site-root anchor is missing or misplaced. `SiteHeader`'s wordmark carries `data-site-root` and is the only thing client JS can resolve a link against under a sub-path (`siteRoot` in src/lib/progress.ts); without it the resume CTA and the review cards stand down.",
      strandedAnchors,
    );
  }

  /** @type {string[]} */
  const leftInCss = [];
  for (const file of cssFiles) {
    for (const url of rootAbsoluteCssUrls(readFileSync(file, 'utf8'))) {
      leftInCss.push(`${url}  (in ${distRelative(file)})`);
    }
  }
  if (leftInCss.length > 0) {
    fail('root-absolute url() survived the stylesheet pass', leftInCss);
  }

  // Built JS, checked three ways, because a chunk is not reachable by an HTML
  // pass and every regression here is invisible until a sub-path deploy: no
  // `/_astro/` literal, no root-absolute base assembled at runtime (the defect
  // the plan's literal-only measurement missed), and no root-absolute link
  // literal at all — the rule has no exceptions, which is why the three the site
  // used to build now resolve against the site-root anchor instead.
  /** @type {string[]} */
  const assetRefs = [];
  /** @type {string[]} */
  const runtimeLinks = [];
  /** @type {string[]} */
  const runtimeBases = [];
  const sources = [
    ...jsFiles.map((file) => [distRelative(file), readFileSync(file, 'utf8')]),
    ...htmlFiles.flatMap((file) =>
      inlineScriptBodies(readFileSync(file, 'utf8')).map((body) => [
        `${distRelative(file)} (inline script)`,
        body,
      ]),
    ),
  ];
  for (const [name, source] of sources) {
    for (const literal of runtimeAbsoluteLiterals(String(source))) {
      if (literal.startsWith('/_astro/'))
        assetRefs.push(`${literal}  (${name})`);
      else runtimeLinks.push(`${literal}  (${name})`);
    }
    for (const base of runtimeRootBases(String(source))) {
      runtimeBases.push(`${base}…  (${name})`);
    }
  }
  if (runtimeBases.length > 0) {
    fail(
      "a built script assembles URLs from a root-absolute base at runtime (`return '/' + dep`). That is Vite's preload helper with a non-relative base: the modulepreload of every lazily imported chunk would be requested from the origin root, 404ing under a sub-path while the `import()` beside it still resolved. Restore `vite.experimental.renderBuiltUrl` in astro.config.mjs.",
      runtimeBases,
    );
  }
  if (assetRefs.length > 0) {
    fail(
      'a built script references /_astro/ root-absolutely. Inter-chunk imports must stay relative — an HTML pass cannot reach inside a chunk, so this breaks every sub-path deployment.',
      assetRefs,
    );
  }
  if (runtimeLinks.length > 0) {
    fail(
      "a script builds a root-absolute URL at runtime. This pass cannot rewrite a literal inside a chunk, so under a sub-path it would point at the origin root — a 404 from a link that looks right. Resolve it against the site-root anchor instead: siteRoot() in src/lib/progress.ts returns the deployment root, and new URL('learn/<slug>/', root) is the whole fix.",
      runtimeLinks,
    );
  }

  // ── 5. Summary ─────────────────────────────────────────────────────────────
  say('portablize — dist/ is path-relative (Plan D §4.2, R3)');
  say(
    `  ${pagesRewritten} pages rewritten, 1 skipped (${NOT_A_PAGE} keeps root-absolute links — §4.4)`,
  );
  say(
    basePath === ''
      ? `  ${NOT_A_PAGE}: ${declaredRoot} is a ROOT deployment, so its links already start at the site root; \`npm run rehost <url>\` adds a base path if this artifact ships under a sub-path`
      : `  ${NOT_A_PAGE}: ${prefixedLinks} links prefixed with ${basePath}/ — this build declares ${declaredRoot}, so \`npm run rehost\` has nothing left to supply`,
  );
  say(
    `  ${URL_ATTRIBUTES.map((name) => `${name} ${attributeCounts[name]}`).join(' · ')}`,
  );
  say(
    `  ${cssRewritten}/${cssFiles.length} stylesheets rewritten (${cssUrls} url(/…) → url(../…))`,
  );
  say(
    `  clean: 0 root-absolute URLs in pages or stylesheets; 0 /_astro/ refs, 0 runtime bases and 0 link literals across ${jsFiles.length} chunks`,
  );
  say(
    `  site-root anchor: ${pagesRewritten}/${pagesRewritten} pages carry one, each pointing at its own depth's root`,
  );
}

// Importable for unit tests, executable as a build step.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
