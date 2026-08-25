# Plan D — the portable artifact

**Status:** **D1 shipped** (2026-08-21, committed as `94eb611`). **D2 shipped** (2026-08-25) —
`scripts/portablize.mjs`, its build-time assertions and the sub-path Playwright project; §4.6 records
the one design decision it added. **D3 shipped** (2026-08-25) — `src/lib/deployment-url.ts` (the
join every declared URL goes through), `SITE_URL` → sentinel with no heuristic tier and a build that
fails rather than ship the sentinel from Cloudflare, and `npm run rehost <url>`. **D3 review found
two defects and both are repaired** (2026-08-25): the 404's base path is now applied by whichever
path knows the deployment — see §4.4 — and the stamp refuses a half-written artifact instead of
prefixing it twice (§4.3). **D4 shipped** (2026-08-25): `docs/deployment.md` is reorganized around
"the artifact is portable; the origin is a deploy-time input" — §2.1 rewritten with real command
output, §2.2 corrected for the repaired 404, §2.4 added for §6's three limitations, §4.4 corrected
(a GitHub Pages *project* site is now supported), §4.5 added for plain static servers, §5.3's
Direct-Upload workflow given the `SITE_URL` the `CF_PAGES` guard cannot supply there, and §7/§9
extended. §6's limitations also land in spec §6/§14, and D2+D3 are recorded as amendment **U-2** in
`docs/redesign-2026-08/03-amendments.md`. **This plan is complete.**
**§5's spec amendment is spent.** Both build-contract constants (`build.format: 'directory'`,
`trailingSlash: 'always'`) are live, every published URL now carries a trailing slash, and the
change is recorded in `docs/redesign-2026-08/03-amendments.md` U-1. What remains — the origin stamp
(D3) and the deployment-doc rewrite (D4) — needs no further amendment.

---

## 1. What was asked

> "Can we make the site DNS agnostic?"

Clarified to three requirements, all three confirmed by the requester:

| # | Requirement | Chosen mechanism |
|---|---|---|
| R1 | **One artifact, any origin** — `learndsa.dev`, `sample.com`, a staging host — with no rebuild | fully relative internal URLs; metadata stamped |
| R2 | **Any host** — Cloudflare Pages, Netlify, Vercel, GitHub Pages, **and plain static servers** (nginx, S3, Apache, `python -m http.server`) | `build.format: 'directory'` |
| R3 | **Any sub-path** — `sample.com/learndsa`, not just `sample.com` | fully relative internal URLs |

Explicitly **out** of scope: `file://` (offered, declined). Canonical policy: **self-canonicalize** —
each deployment is its own site, each names itself.

---

## 2. Where the site stands today

Better than expected, and this is why the plan is small rather than a rewrite.

**Already portable.** Nothing about the running site is origin-bound. There is not one absolute
internal link in `src/` (`grep 'href="http'` over `*.astro`/`*.mdx` returns nothing), no test asserts
an origin, and exactly one client script touches the URL at all — `ExplainBack.astro:358`, which
reads `location.search`, never `pathname`. Serve today's `dist/` from any hostname at the **root**
and it works completely.

**Everything origin-bearing is metadata, from one value.** `astro.config.mjs:22` → 135 hostname
occurrences in the build:

| Surface | Source |
|---|---|
| `<link rel=canonical>`, `og:url`, `og:image`, `twitter:image` | `src/layouts/BaseLayout.astro:63-64` |
| sitemap `<loc>` | `src/pages/sitemap.xml.ts:22` |
| robots `Sitemap:` | `src/pages/robots.txt.ts:13` |
| `Course` / `WebSite` JSON-LD `url` | `src/lib/structured-data.ts` |

**What is *not* portable is the sub-path (R3).** Every internal link is written root-absolute —
13 literal `href="/…"` attributes, ~20 template-literal path constructions, 2 CSS `url("/fonts/…")`,
and Astro's own `<script src="/_astro/…">`. Under `sample.com/learndsa` every one of them points at
the wrong place.

---

## 3. The finding that shapes the design

**Astro cannot emit relative URLs, so this cannot be solved in config.**

- `base` is root-absolute by contract — "the base path to deploy to", validated as a plain string
  (`node_modules/astro/dist/core/config/schemas/base.js:107`, default `"/"`). There is no `'./'` mode.
- `assetsPrefix` is a fixed string applied to every page, so it cannot vary with page depth —
  and this site has pages at three depths.
- Setting `base` alone would *also* not fix R3: Astro rewrites only what it generates. All 33
  hand-written links stay root-absolute and silently break. This is the trap in `deployment.md` §2.2,
  which currently advertises `base` as sufficient for sub-path hosting. **It is not.**

So the relative pass must happen **after** Astro, over `dist/`. That turns out to be the better
place anyway: one pass catches Astro-generated asset URLs, hand-written links, CSS `url()` and the
font preloads *uniformly*, and it can be verified by a single assertion — "no root-absolute internal
URL survives in `dist/`" — instead of by reviewer vigilance across 33 call sites.

**The rewrite surface is small, and measured, not estimated:**

| Surface | Count | Note |
|---|---|---|
| HTML files | 21 | the whole site |
| root-absolute refs inside built JS chunks | **0** | Vite already emits relative inter-chunk imports — verified against `dist/_astro/*.js` |
| built CSS files with `url(/fonts/…)` | 3 | all at `/_astro/`, so the fix is the *constant* `../fonts/` — no depth logic |
| `<script src="/_astro/…">` in HTML | every page | handled by the same HTML pass |

---

## 4. Design

### 4.1 Two classes of URL, handled differently

The whole design follows from one distinction:

- **Navigational URLs** (links, scripts, styles, fonts, icons) — *must* be relative, because they
  must work at an unknown path. Handled by the post-build pass. **No origin needed, ever.**
- **Declared URLs** (canonical, `og:url`, `og:image`, sitemap `<loc>`, robots `Sitemap:`, JSON-LD
  `url`) — *must* be absolute; the sitemap protocol and the OG scrapers both require it. Handled by
  a stamp. **Origin required.**

Trying to make the second class relative is what breaks the sitemap, and it is why "zero hostnames
in the artifact" is not a reachable goal. The artifact carries exactly one hostname, in metadata
only, and knows it is a placeholder until stamped.

### 4.2 `npm run build` gains a post-build step — the pass always runs

The advisor caught the thing that reshapes this: **Cloudflare Pages' git integration runs
`npm run build` and deploys the output itself.** There is no separate deploy step to hook, so
"stamp at deploy" cannot be the only mode.

```
npm run build  =  astro check && astro build && node scripts/portablize.mjs
```

`scripts/portablize.mjs` does two things:

1. **Relativize (always).** For each of the 21 HTML files, compute the page's depth from its
   `dist`-relative path and rewrite every root-absolute internal URL to a document-relative one.
   Then the constant `url(/fonts/…)` → `url(../fonts/…)` in `dist/_astro/*.css`.

   | page URL | file | prefix |
   |---|---|---|
   | `/` | `dist/index.html` | `./` |
   | `/about/` | `dist/about/index.html` | `../` |
   | `/learn/binary-search/` | `dist/learn/binary-search/index.html` | `../../` |

   Attributes rewritten: `href`, `src`, `srcset`, `action`. Skipped: `//…`, `http(s)://`, `mailto:`,
   `data:`, and bare `#fragment` — the last one matters, because this site's ToC, scroll-spy and
   `<StepLink>` are all fragment links.

   **Query and fragment are split off before the rewrite and reattached after.** The site ships
   links that carry both — `/learn#track-${track.id}` (`index.astro`:278), `/glossary#{term}`
   (`glossary.astro`:14), `/learn/{slug}?review=1#practice` (`learn/index.astro`:124) — and the
   path is the only part that may be touched. The trailing slash goes on the path, *before* the
   delimiter: `/learn/#track-arrays`, not `/learn#track-arrays/`. Getting this wrong breaks
   scroll-spy and the review deep-link in a way that is cheap to specify here and miserable to
   diagnose later. Named test cases for the pass: `href="/"` (the wordmark) → `./` from the home
   page and `../../` from a lesson; each of the three links above from a page at each depth.

2. **Stamp or sentinel (metadata only).** If `SITE_URL` is set, Astro has already produced correct
   absolute metadata and there is nothing to do. If it is not set, the build carries the sentinel
   origin **`https://learndsa.invalid`** (`.invalid` is RFC 2606-reserved — it can never resolve, so
   a leaked sentinel is unmistakable in a grep and harmless in the wild, unlike a stale real domain).

CI, Cloudflare, Netlify and Vercel all set `SITE_URL` and get a stamped artifact straight out of the
build — which also means **the e2e suite tests the real shipped artifact**, not a pre-rewrite one.

Side effect worth stating: this **retires the `CF_PAGES_URL` heuristic** in `astro.config.mjs`. The
chain becomes `SITE_URL` → sentinel, one explicit input with no guessing. That also disposes of a
latent bug I could not fully confirm — Cloudflare documents `CF_PAGES_URL` as "url of the current
deployment", which for Pages is the per-deployment hash URL, meaning tier 2 may have been baking a
*different* origin into every production build's canonicals. Rather than resolve that question, the
design deletes the tier that raises it.

### 4.3 `npm run rehost <deployment-url>` — for hosts with no build step

For manual deploys (nginx, S3, an offline copy, a GitHub Pages push), one command re-points a
sentinel artifact:

```bash
npm run build                                   # sentinel artifact, portable, ready
npm run rehost https://sample.com/learndsa      # stamps metadata + the 404 base
npm run rehost https://learndsa.dev             # same dist/, root deployment
```

It takes **the full deployment URL including any sub-path**, because self-canonicalizing under a
sub-path needs both halves. It rewrites only `dist/**/*.html` metadata, `sitemap.xml`, `robots.txt`
and the 404's links — never a navigational URL, which is already relative and already correct.

Two assertions before it reports success, both of them `deployment.md` §2.1's manual grep made
executable: **zero sentinels remain**, and **exactly one distinct origin** is present in the output.

**It refuses a half-stamped artifact, not just a stamped one** (repaired 2026-08-25). The 404
prefixing is incremental, so the command must run at most once over a `dist/`; the original guard
was "no sentinel anywhere means already stamped", and that misses the state that actually costs
something. A run that dies between two writes — an unwritable file, a full disk, a Ctrl-C — leaves
`404.html` written and `sitemap.xml` not, the total is still non-zero, and the operator's natural
fix-and-re-run therefore passed the guard, prefixed the 404 a **second** time
(`/learndsa/learndsa/about/`) and **exited 0**. The post-conditions could not see it either: they
read declared URLs, and those are correct in both halves. So the precondition is now per file —
every stampable file carries a sentinel (`unstamped`), none does (`stamped`), or the artifact is
`partial` and the answer is a rebuild — every write is atomic (temp file + rename in the same
directory, so no file is ever caught torn), and a write that fails says which state `dist/` was left
in rather than throwing a stack trace.

### 4.4 The 404 carve-out

A 404 page is served *at the URL the reader typed*, not at its own path. Relative links on it
resolve against that arbitrary URL and land wherever — `../glossary/` from `/learn/typo/deep/thing`
is nonsense. There is no JS-off fix (a `<base>` tag would break every fragment link on the site, and
a script violates §13).

So **`404.html` alone keeps root-absolute links**, stamped with the deployment's base path by the
same step, defaulting to `/` when unstamped. That degraded state — a sub-path deployment whose 404
links point at the origin root — is acceptable and documented. On GitHub Pages, where `404.html` is
served for every unmatched path under the repo, the stamped base is exactly what makes those links
work.

**Both stamping paths apply it, through one function** (repaired 2026-08-25). As first built, only
`rehost` did — so a sub-path deployment built by a host WITH a build step got no base path at all,
and because `rehost` refuses a stamped artifact there was then no way to supply one. That is
precisely GitHub Pages via Actions, the host this section cites: it shipped a 404 that was unstyled
(its stylesheet, fonts and icons were requested from the origin root) and whose every escape link
left the deployment, with nothing printed anywhere to say so. `prefixRootAbsolute` now lives in
`scripts/portablize.mjs` beside the carve-out, and the build calls it with the base path read out of
the artifact's OWN canonical — `dist/index.html`'s, written by `deploymentUrl`, so it cannot
disagree with the URLs the same build published, and the pass still knows the deployment when it is
run by hand. Reading it fails loudly rather than defaulting to `''`, because a silent root default
is the defect itself. Verified by diff: `SITE_URL=https://sample.com/learndsa npm run build` and
`npm run build && npm run rehost https://sample.com/learndsa` produce a byte-identical `404.html`,
`index.html` and `sitemap.xml`. The pass also refuses to run twice over one `dist/` (a second run
would prefix the 404 again), using the one signal that cannot be faked: a fresh build has hundreds
of root-absolute URLs to rewrite, an already-portablized one has none.

### 4.5 Canonical under a sub-path — a pure function

`new URL('/learn/x', 'https://sample.com/learndsa')` returns `https://sample.com/learn/x`: a
root-absolute path *replaces* the base. So canonical cannot be built with `new URL` any more.

New `src/lib/deployment-url.ts` — one exported pure function that joins a deployment URL and a page
path, with a Vitest unit test. Pure and injected, so it fits the harness (`environment: 'node'`, no
DOM) rather than needing Playwright. Callers: `BaseLayout.astro`, `LessonLayout.astro`,
`sitemap.xml.ts`, `robots.txt.ts`, `structured-data.ts`.

**The same function normalizes the path, and that is what makes §5.2 code instead of a convention.**
Declared URLs are authored at their own call sites, separate from the 33 navigational ones, and each
is a chance to publish a canonical that points at a 301:

- `sitemap.xml.ts`:16 — `STATIC_PATHS = ['/', '/learn', '/glossary', '/about']`
- `LessonLayout.astro`:114 — `canonicalPath={`/learn/${slug}`}`, plus each page's explicit
  `canonicalPath` (`about`, `glossary`, `learn/index`, `404`)
- `BaseLayout.astro`:63 — the default `canonicalPath ?? Astro.url.pathname`. This is the sharp one:
  under directory format the **build-time** pathname is `/learn/index.html`-shaped — `SiteHeader`'s
  own normalization comment is the evidence — so any page that omits `canonicalPath` would leak
  `index.html` straight into its canonical and `og:url`.

So the join function strips a trailing `(/index)?\.html` and enforces the trailing slash, and its
unit test carries a case for each bullet above. One place to be right, one place to test.

### 4.6 The links no HTML pass can reach — the site-root anchor

**Added during D2, and it is the difference between "R3 is delivered" and "R3 is delivered for a
first-time visitor".** Three hrefs are built at runtime inside client chunks, where a post-build pass
over `dist/` cannot rewrite a template literal: the resume CTA on `/` and on `/learn/`, and the
review cards (`src/lib/progress.ts`, rendered by `ReviewStrip.astro`). Written as `/learn/${slug}/`
they leave a sub-path deployment and 404 at the origin — and because every one of them is
conditional on stored progress, the reader who meets them first is a **returning** one, i.e. exactly
the person a portability test with a fresh profile never simulates.

They were briefly pinned as an accepted gap (`KNOWN_RUNTIME_ABSOLUTE`, with the build failing if a
fourth appeared). That was the wrong call twice over: it left four visible, clickable links broken on
the site's two highest-traffic pages, and it recorded the deferral in code comments only while §9
claimed D2 "delivers R3". The pin is deleted.

**The fix is one reference point.** `SiteHeader`'s wordmark is already `<a href="/">` on every page,
so the pass rewrites it to that page's own way back to the site root — `./` at the home page,
`../../` on a lesson. It carries `data-site-root`, and `siteRoot()` reads its resolved href;
`lessonHref(slug, root)` and `reviewHref(slug, root)` are pure joins over it, unit-testable in the
node harness. No depth arithmetic exists in any island, and the pass stays the single source of truth
for what "the root" means at each depth.

Guarded at both ends, because an intention is not a test: the build fails if **any** chunk contains a
root-absolute URL literal (the rule has no exceptions now) and if any page ships without exactly one
`[data-site-root]` anchor whose href is its own depth's prefix; `tests/e2e/portable.spec.ts` sweeps
the live DOM after hydration with **no carve-out**, and seeds progress so the returning reader's two
links are clicked under a real sub-path rather than merely inspected.

---

## 5. Spec amendments this requires — the part to approve

### 5.1 `build.format: 'file'` → `'directory'`

Required by **R2**. `format: 'file'` emits `about.html` and relies on the host resolving `/about` to
it. Cloudflare, Netlify, Vercel and GitHub Pages all do. **Plain static servers do not** —
`python -m http.server` and an S3 website endpoint both 404 on `/about`. Directory format
(`about/index.html`, served at `/about/`) is the shape every one of those hosts serves natively.

This reverses a decision `deployment.md` documents as deliberate (it was chosen to make the
no-trailing-slash canonicals literally correct). The requester accepted the trade knowingly — the
option preview stated the consequence — but it belongs in `docs/redesign-2026-08/03-amendments.md`
as an amendment, not as a quiet config flip.

### 5.2 `trailingSlash: 'always'`

Load-bearing, not cosmetic. A relative link resolves against the **document URL**, so `../glossary/`
is correct from `/learn/binary-search/` and lands one level wrong from `/learn/binary-search`.
Servers 301 the slashless form, so pages only ever *render* at slash URLs — but authoring internal
links with the slash avoids a redirect hop on every click, and canonicals and `<loc>`s must carry it
to match what is served.

### 5.3 Consequence: every published URL moves

`/about` → `/about/`, `/learn/binary-search` → `/learn/binary-search/`, and so on for all 21 pages.

**Now is the cheap moment and it will not come again.** The site is not launched (no custom domain
is set), so there is no live URL to redirect, no index to migrate, no inbound link to break. After
launch this same change costs a redirect map and a re-crawl.

### 5.4 Spec §14 wording

§14 requires "canonical URLs" and a sitemap; both survive. The concrete change is the URL shape, and
that the origin is a deploy-time input rather than a build-time constant. §14 needs a sentence
saying so.

---

## 6. Documented limitations — decisions, not gaps

Three things this plan deliberately does not fix, all of which should land in `deployment.md`:

1. **`robots.txt` is origin-root-only, by the standard.** A sub-path deployment's
   `/learndsa/robots.txt` is invisible to crawlers — only `sample.com/robots.txt` is read, and that
   file belongs to whoever owns the origin. Sub-path deployments therefore ship no effective robots
   directives and no `Sitemap:` line; submit the sitemap manually. Nothing in the build can change
   this.
2. **`localStorage` is origin-scoped, not path-scoped.** Two deployments on the same origin at
   different paths **share** every progress key. `sample.com/learndsa` and `sample.com/learndsa-v2`
   are one storage namespace and will read each other's records. (And, as `deployment.md`:478
   already says, a move to a *different* origin leaves readers' progress behind.)
3. **Self-canonicalizing means public mirrors compete.** Two indexed copies of identical content
   dilute each other's ranking. This was chosen with the trade stated; if a mirror is ever meant to
   be non-public, `rehost --noindex` is a ten-line addition, not a redesign.

---

## 7. Verification

Per this repo's standing rule — a portability intention that is not a test will rot the first time
someone types `href="/learn/x"`.

**Build-time, inside `portablize.mjs`** (fail the build, not the review):
- zero root-absolute internal URLs remain in `dist/**/*.html` and `dist/_astro/*.css` — with
  `404.html` as the one declared exception;
- zero root-absolute `/_astro/` refs inside JS chunks (0 today; this pins it);
- after stamping: exactly one distinct origin in the output.

**Playwright — the test that actually proves R3.** A new project that serves `dist/` from a
**random sub-path prefix** with a ~30-line Node static server (no new dependency — §4 forbids one)
and walks a lesson end to end: navigation, fonts, CSS, a hydrated island, a fragment link. This is
the single test that keeps portability from silently regressing.

**Existing suite, mechanical churn:** 73 `goto()` calls across the e2e suite gain trailing slashes.
The aria baselines need re-seeding **and the diff read** — per §18's own blind spot, a green
`toMatchAriaSnapshot` only means "nothing recorded changed". Pixel baselines should be unaffected
(URLs do not paint), which is itself worth confirming rather than assuming.

**Manual, once:** serve the stamped `dist/` under `python -m http.server` at a sub-path and click
through. That is the requirement in its rawest form, and it takes two minutes.

---

## 8. Files

**New:** `scripts/portablize.mjs`, `scripts/rehost.mjs`, `src/lib/deployment-url.ts`,
`tests/unit/deployment-url.test.ts`, `tests/e2e/portable.spec.ts` (+ its static-server fixture).

**Changed:** `astro.config.mjs` (format, trailingSlash, `site` resolution, and D2's
`renderBuiltUrl`), `package.json` (build chain + `rehost`), `playwright.config.ts` (new project),
`SiteHeader.astro` + `src/lib/progress.ts` + the three islands that build a link (§4.6),
`BaseLayout.astro`, `sitemap.xml.ts`,
`robots.txt.ts`, `structured-data.ts`, `LessonLayout.astro`, the 33 internal-link sites *only where a trailing slash is
now wanted* (the relative rewrite itself is post-build and needs no source edit), `public/_headers`,
73 `goto()` calls, aria baselines.

**Docs:** `deployment.md` (§2.1 origin resolution, §2.2 — currently *wrong* about `base` being
sufficient, §6 headers, §9 troubleshooting), `docs/redesign-2026-08/03-amendments.md` (§5's two
amendments), spec §14 + §18, `CLAUDE.md`, `README.md`.

---

## 9. Rollout

Repo culture is smallest-shippable-batch and vertical-slice-first, and this splits cleanly:

- **D1 — URL shape.** `format: 'directory'` + `trailingSlash: 'always'` + the trailing-slash churn
  across links, tests and baselines. Ships alone, verifiable alone, no new machinery. This is the
  spec-amendment commit.
- **D2 — the relative pass.** `portablize.mjs` + build-time assertions + the sub-path Playwright
  project, **plus §4.6's site-root anchor** for the three links client JS builds — without that half
  it would deliver R3 for a first-time visitor and not for a returning one. This is the commit that
  delivers R3.
- **D3 — the stamp.** `deployment-url.ts` + the four callers + `rehost.mjs` + retiring the
  `CF_PAGES_URL` tier. Delivers R1 for hosts with no build step.
- **D4 — docs.** Rewrite `deployment.md` §2 around "the artifact is portable; the origin is a
  deploy-time input", and record the amendments.

Each stage passes the full §18 DoD on its own.

---

## 10. Probe: D1 was run for real before being planned

`build.format: 'directory'` + `trailingSlash: 'always'` were applied to a scratch config and built
(21 pages, 7.2s, clean). Five findings, two of which move the plan:

1. **No `index.html` leak in the output — but the "never exercised" half of this was wrong.**
   ~~Every shipped page passes an explicit `canonicalPath`.~~ **Corrected during D1 review:**
   `src/pages/dev/renderers.astro`:56 renders `<BaseLayout>` with **no** `canonicalPath`, so
   `BaseLayout.astro`:63's `canonicalPath ?? Astro.url.pathname` default is live on a shipped page.
   Its emitted canonical is correct today, so D1 needed no change — but this promotes the §4.5
   normalization guard from hypothetical hardening to **protection of a real code path**, and D3
   must treat it that way.
2. **The real D1 defect: every declared URL is slashless while the server serves the slash.**
   Canonical, `og:url` and all 21 sitemap `<loc>`s emitted `/learn/binary-search` against a page
   served at `/learn/binary-search/`. A self-canonical pointing at a 301 is exactly what §5.2 exists
   to prevent, and it is the substance of D1.
3. **`trailingSlash: 'always'` 404s the slashless form — it does not redirect it.**
   Measured against `astro preview`: `/about` → **404**, `/about/` → 200. Real hosts 301, but Astro's
   own preview is strict, and the e2e suite runs against preview. So the 73 `goto()` calls and every
   authored `href="/about"` **must** change; this is a hard requirement, not tidiness. Read as a
   feature: the strictness turns the e2e suite into the instrument that catches a slashless link.
4. **`SiteHeader`'s nav normalization survives, verified not assumed.** From a lesson page, Learn
   correctly carries `aria-current="true"`; from `/learn/`, `aria-current="page"`. §10.2's prediction
   held under a real build.
5. **`404.html` stays at `dist/404.html`**, not `404/index.html` — the §4.4 carve-out addresses the
   right file.

Also confirmed: `src/lib/nav.ts`'s `NAV_ITEMS` is a third declared-path call site (`/learn`,
`/glossary`, `/about`) feeding both `SiteHeader` and `SiteFooter`, and it must be updated in step
with `navCurrent()`'s matching logic.

## 11. Two checks that came back clean

Both were raised as risks and both are already handled — recorded so they are not re-investigated:

1. **`dist/dev/renderers.html` ships, and that is correct.** The route is not removed; it is
   *conditionally rendered* (`src/pages/dev/renderers.astro`:9-16), a documented deviation from the
   architect's `Astro.rewrite('/404')` because rewrite on a prerendered page reads
   `Astro.request.headers` and emits a build warning — a §18 violation. The HTML exists and is inert;
   no renderer chunk is referenced by any shipped page. Not a bug, not this plan's business.
2. **`SiteHeader.astro`'s nav matching already anticipates directory format.** The `/learn.html`
   sighting is a *normalization regex*, not a link:
   `Astro.url.pathname.replace(/(\/index)?\.html$/, '').replace(/\/+$/, '')`. Its own comment says
   the optional `/index` is there to cover "a future `format: 'directory'`", and the trailing-slash
   strip keeps `/learn/` matching "Learn". So the one piece of URL-shape-sensitive logic in the
   site survives §5.1 untouched. Verify with the D1 e2e run rather than assuming, but the risk is
   lower than it looked.

## 12. Process — resolved

Resolved 2026-08-21: the requester authorised agents and workflows, so `CLAUDE.md`'s role-agent flow
governs — frontend-engineer implements, qa-engineer validates, lead-developer reviews, and the
implementer never self-approves.
