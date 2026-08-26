# Deployment Guide — LearnDSA

How to build and deploy LearnDSA to production. The site is a **fully static, prerendered Astro site** (`output: 'static'`) with **no backend, no server runtime, no database, and no runtime environment variables or secrets** — every page is HTML/CSS/JS emitted at build time into `dist/`, deployable to any static host.

> **Re-audited against the repo after M7 (UX overhaul) and M8 (mastery loop) shipped.** Every command, path and claim below was re-checked against the working tree and a built `dist/` rather than carried forward — §2.3 (the OG card), §3 (the gate and the shape of `dist/`), §5 (the workflow that is actually committed), §6 (`public/_headers`) and §7 (what M7/M8 added to the post-deploy list) all changed as a result. The one check that stays a manual judgement is Lighthouse (§7): there is no Lighthouse tooling in this repo.

> **Corrected again after Plan D stage D1 — the URL shape.** Every page is now published at a trailing-slash URL (`/about/`, `/learn/binary-search/`); the amendment and its reasoning are in `docs/redesign-2026-08/03-amendments.md` (U-1). §0, §2.2, §3.2, §3.3, §4.4, §7, §9 and the appendix were corrected against a real directory-format build.

> **Rewritten after Plan D stages D2 and D3 — the artifact is portable and the origin is a deploy-time input.** The model this document used to be organized around — *"the production origin is a build-time constant somebody has to remember to change"* — is gone, and with it the `CF_PAGES_URL` heuristic and the `PRODUCTION_URL` fallback that §2.1 described. Every internal URL in `dist/` is now document-relative, so one build runs at any origin **and any sub-path**; the only hostname left in the artifact is metadata, and it comes from one variable or from one command. §2.1 is new, §2.2 is corrected (the 404 now carries the deployment's base path), §2.4 is new, and §1, §3, §4, §5.3, §7, §9 and the appendix were re-checked against real command output rather than edited by hand. Every figure and every quoted message below was produced by running the thing.

> **Corrected after the 2026-08-24 production build — this project deploys through Cloudflare _Workers Builds_, not Cloudflare Pages.** The build log is unambiguous (`Executing user deploy command: npx wrangler deploy`, `Detected Project Settings: Worker Name: static-dsa, Framework: Astro`, and no `CF_PAGES` in the environment), and this document said "Pages git integration" throughout. Two failures followed and both are fixed in the repo: the unstamped-deploy guard keyed on `CF_PAGES` alone, so it did not fire and the build emitted the sentinel (`astro.config.mjs` now checks a list of four publishing platforms — §2.1); and `wrangler deploy`, finding no Wrangler config, **auto-configured the project** — installing the forbidden `@astrojs/cloudflare` adapter and relocating the build to `dist/client/`, which `scripts/portablize.mjs` threw on. **`wrangler.jsonc` is now committed** and its first job is to stop that from happening again (§4.3). The callout below, §0, §1, §2.1, §4.1–4.4, §5, §6, §7, §8, §9 and the appendix were corrected against the config, the build log and `npx wrangler@4 deploy --dry-run`.

> ### The one thing you must not skip — on a host that builds **and** publishes it is **mandatory**, not advisory
>
> **Add `SITE_URL` as a build variable on the Worker — dashboard → your Worker → _Settings_ → _Build_ → _Build variables and secrets_ — set to the full deployment URL including any sub-path** (e.g. `https://learndsa.dev`). It is not optional and it is not a nicety:
>
> - **Without it the Workers Builds build FAILS.** `astro.config.mjs` throws when any of `CF_PAGES`, `WORKERS_CI`, `NETLIFY` or `VERCEL` is set and `SITE_URL` is not — by design, because the alternative is publishing 135 canonicals, 134 sitemap `<loc>`s and an OG card that all name a domain that cannot exist (§2.1). Workers Builds injects `WORKERS_CI`.
> - **Build variables and runtime variables are different lists on Workers.** *Settings → Variables and Secrets* is the **runtime** list, and this site reads no variable at runtime — putting `SITE_URL` there leaves the build failing exactly as before. Unlike Pages, Workers does not share one set between build and runtime.
> - **One value covers previews too.** `WORKERS_CI` is injected on non-production branch builds as well (they are off unless enabled in *Settings → Build → Branch control*), so the same build variable makes a preview canonicalize to production instead of competing with it in search.
> - **Moving to a custom domain is now this one dashboard edit plus a redeploy** — there is no origin in the repo to update, and nothing to rebuild by hand.
>
> **The caveat that used to say "an omission ships the sentinel silently" now applies only to hosts _outside_ that list of four** — GitHub Actions above all (§4.4, §5.3). Hosts with no build step never see the variable at all; they stamp the built artifact instead with `npm run rehost <deployment-url>` (§2.1 B).

---

## 0. Recommended mechanism (DevOps recommendation)

**Primary: Cloudflare Workers with static assets, built and deployed by Workers Builds from the git integration, with GitHub Actions running the full DoD gate on every push and PR. Runner-up: Netlify** (near-identical fit — pick it if you're already in that ecosystem). §4 documents every host generically; this is the recommended pick for *this* repo, and two facts in the repo drive it:

1. **`public/_headers` already exists** — that format is honored by **Cloudflare (Workers static assets and Pages alike) and Netlify**; Vercel and GitHub Pages silently ignore it, so the security headers this project ships would not take effect there.
2. **`build.format: 'directory'` + `trailingSlash: 'always'`** publish every page at a slash URL (`/about/`, `/learn/binary-search/`) — the one shape *every* static host serves natively, plain ones included. This used to be the second reason to prefer Cloudflare/Netlify (`format: 'file'` needed a host that resolves `/about` → `about.html`); it is **no longer a differentiator at all**, so the tiebreak now rests on point 1 and on bandwidth. See amendment U-1 in `docs/redesign-2026-08/03-amendments.md`.

**None of this is a lock-in.** Since Plan D the artifact is origin- and path-agnostic (§2.1), so changing host is a rebuild with a different `SITE_URL` — or one `npm run rehost` on the `dist/` you already have — not a migration. Pick on headers and bandwidth, not on switching cost.

Cloudflare wins the tiebreak over Netlify on **unlimited free bandwidth** — ideal for an educational site that may get bursty traffic — at **$0**. **Within Cloudflare, Workers rather than Pages is also Cloudflare's own recommendation:** its Workers best-practices guidance says Workers Static Assets is the recommended way to deploy static sites, that new projects should use Workers instead of Pages, and that Pages continues to work but new features and optimizations are focused on Workers. For a purely static site that means pointing `assets.directory` at the build output and shipping no Worker script — exactly what `wrangler.jsonc` does (§4.3). Explicitly **not** recommended for this workload: Kubernetes/containers, Terraform/Bicep/IaC, an SSR adapter, or S3+CloudFront — there is no server, state, or runtime secret, so heavier infra adds cost and attack surface with zero benefit.

> ### ✅ Current setup: Cloudflare **Workers Builds** (git integration)
>
> The **Worker `static-dsa`** is connected directly to the GitHub repo, so **Cloudflare builds and deploys itself on every push to the production branch**. Workers Builds runs the build command and then the deploy command, which is `npx wrangler deploy` — that is what the 2026-08-24 build log shows, and it is why this section no longer says "Pages". Consequences:
>
> - **`wrangler.jsonc` is committed and must stay committed** (§4.3). Without it `wrangler deploy` auto-configures the project — Astro adapter and all — and the build breaks; with it, the deploy is a plain static-asset upload of `dist/`.
> - **The committed workflow is the gate in §5.1** (`.github/workflows/ci.yml`) — it runs lint/format/unit/e2e, which Cloudflare's build does *not*, and it deliberately deploys nothing.
> - **Do NOT add a second deploying workflow** — §5.3's Actions+Wrangler pipeline is an alternative topology, and running it alongside the git integration would publish the site twice per push.
> - **Make `DoD gate` a required status check on `main`.** Without branch protection, Cloudflare will happily deploy a commit whose gate is red: the two systems are independent (§5.1).
> - Domain is the Worker's free `*.workers.dev` subdomain (`static-dsa.<your-subdomain>.workers.dev`) until a custom one is added — `wrangler.jsonc` sets neither `workers_dev` nor `routes`, and that default is enabled. No registration, TLS included.
> - Dashboard build settings (*your Worker → Settings → Build*): build command `npm run build`, deploy command `npx wrangler deploy`, production branch `main`, Node from `.nvmrc` (or `NODE_VERSION=24`), and **`SITE_URL` under _Build variables and secrets_** — the build fails without it (§2.1), which is the one dashboard setting this project cannot ship without.

---

## 1. Prerequisites

| Requirement | Value | Notes |
|---|---|---|
| Node.js | **24** (floor: **≥ 22.12.0**) | Pinned in `.nvmrc` — the single source of truth read by the Workers Builds build image *and* `actions/setup-node`. **Astro 7 hard-requires `>=22.12.0` and refuses to build on Node 20**, so do not lower this (the ESLint Astro plugins additionally want `^22.22.3 \|\| ^24.16.0`). `package.json` `engines` states the floor. |
| Package manager | **npm** | Commit-tracked `package-lock.json`; use `npm ci` in CI for reproducible installs. |
| Build output | `dist/` | Static files; gitignored. This is the "publish directory" every host asks for. |
| Server/adapter | **none** | Pure static. Do **not** add an SSR adapter (`@astrojs/node`, `@astrojs/vercel` serverless, etc.) — it's unnecessary and would change the output contract. `wrangler.jsonc` is committed partly to stop `wrangler deploy` from installing `@astrojs/cloudflare` on your behalf (§4.3). |
| Runtime env vars / secrets | **none** | Nothing to configure in a secrets manager; the shipped site reads no variable at all. |
| Build-time variables | **`SITE_URL`** (one) | The full deployment URL, sub-path included. **Required on Cloudflare Workers Builds** — and on Cloudflare Pages, Netlify and Vercel, which the same guard covers; the build throws without it (§2.1). Optional everywhere else: an unset build carries the sentinel `https://learndsa.invalid`, and `npm run rehost <url>` stamps it afterwards. No other variable exists. |
| Browsers (tests + OG card only) | Playwright Chromium | Needed by `npm run test:e2e` and by `npm run og`, which rasterizes the OG card with it (§2.3): `npx playwright install --with-deps chromium`. **Not** needed to build or serve the site. |

---

## 2. Pre-deploy configuration (required)

### 2.1 The deployment URL — one input, supplied at deploy time

There is **no production origin in this repository**. `astro.config.mjs` reads one variable and has no fallback chain, no branch heuristic and nothing to keep up to date:

```js
const SENTINEL = 'https://learndsa.invalid';
const site = process.env.SITE_URL || SENTINEL;
```

**Why that is enough — two classes of URL, and only one of them needs an origin at all** (Plan D §4.1):

| Class | What it is | Where it comes from |
|---|---|---|
| **Navigational** — links, scripts, styles, fonts, icons | `../glossary/`, `../../_astro/BaseLayout.*.css` | **no origin, ever.** `scripts/portablize.mjs` rewrites every one of them to a document-relative URL at the end of `npm run build` (§2.2), so they are already correct at any origin and any sub-path |
| **Declared** — what a page says about *itself* | `<link rel="canonical">`, `og:url`, `og:image`, `twitter:image`, sitemap `<loc>`, robots' `Sitemap:` line, `Course`/`WebSite` JSON-LD `url` | `SITE_URL`, joined by the single builder `src/lib/deployment-url.ts` |

Declared URLs cannot be relative — the sitemap protocol and every OG scraper require absolute ones — so the artifact carries exactly **one hostname, in metadata only**, and knows it is a placeholder until it is told otherwise. That is the whole of the origin story; everything below is how you tell it.

> **Why a joiner and not `new URL()`.** `new URL('/learn/x/', 'https://sample.com/learndsa')` returns `https://sample.com/learn/x/` — a root-absolute path *replaces* a base path rather than joining to it, and `new URL(site).origin` throws the sub-path away by definition. Every declared URL therefore goes through `deploymentUrl(site, path)` (`src/lib/deployment-url.ts`), which also strips a stray `(/index)?.html` and puts the trailing slash on directory paths while leaving `/og-default.png` and `/sitemap.xml` alone. One place to be right, and `tests/unit/deployment-url.test.ts` is where it is tested.

**Two ways to supply the deployment URL. Pick by whether the host builds.**

#### A — the host has a build step (Cloudflare Workers Builds, Cloudflare Pages, Netlify, Vercel, GitHub Actions)

Set **`SITE_URL`** to the full deployment URL, sub-path included, and build. Astro emits correct metadata directly: there is nothing to stamp afterwards and no second step to forget, and the bytes the host publishes are the bytes the build produced.

```bash
SITE_URL=https://learndsa.dev npm run build              # root deployment
SITE_URL=https://sample.com/learndsa npm run build       # sub-path deployment
```

A sub-path build also hands `dist/404.html` its base path, because the build already knows the deployment — read out of the artifact's own canonical, so it cannot disagree with the URLs the same build published (§2.2). Real output:

```
portablize — dist/ is path-relative (Plan D §4.2, R3)
  20 pages rewritten, 1 skipped (404.html keeps root-absolute links — §4.4)
  404.html: 15 links prefixed with /learndsa/ — this build declares https://sample.com/learndsa/, so `npm run rehost` has nothing left to supply
  href 519 · src 102 · srcset 0 · action 0
  1/7 stylesheets rewritten (2 url(/…) → url(../…))
  clean: 0 root-absolute URLs in pages or stylesheets; 0 /_astro/ refs, 0 runtime bases and 0 link literals across 56 chunks
  site-root anchor: 20/20 pages carry one, each pointing at its own depth's root
```

#### B — the host has no build step (nginx, S3, a GitHub Pages push of prebuilt files, an offline copy)

Build once, then stamp the built `dist/` in place with the URL it will actually be served at. No rebuild, no toolchain on the target, one command:

```bash
npm run build                                  # sentinel artifact, portable, ready to stamp
npm run rehost https://sample.com/learndsa     # metadata + the 404's base path
```

```
rehost — dist/ now names https://sample.com/learndsa (Plan D §4.3)
  135 metadata values stamped across 23 files (pages, sitemap.xml, robots.txt)
  404.html: 15 root-absolute links prefixed with /learndsa/ (§4.4)
  clean: 0 https://learndsa.invalid left anywhere in dist/; declared URLs across 135 pages + sitemap + robots, all under https://sample.com/learndsa/, 1 origin
```

Four things to know about it:

- **It takes the FULL deployment URL, sub-path included** — `https://sample.com/learndsa`, not just the origin. Self-canonicalizing under a sub-path needs both halves, and the sub-path is also what `dist/404.html`'s links get prefixed with.
- **It touches metadata and the 404, nothing else.** Navigational URLs are relative and already correct; the only edit is "replace the sentinel origin", and the sentinel can enter the build by exactly one route (`Astro.site`), which feeds declared URLs alone.
- **It proves its own work before reporting success.** Zero sentinels left in *any* text file in `dist/` — the 56 JS chunks included, so a future `Astro.site` leak into a chunk fails loudly — and every declared URL `startsWith` the full deployment URL, sub-path and all. "One origin" alone cannot see "origin right, sub-path missing", which is the defect this stage exists to close.
- **It refuses to run twice, and refuses a half-run.** The 404 prefixing is incremental (`/about/` → `/learndsa/about/` → `/learndsa/learndsa/about/`), so the artifact must be in its unstamped state, and that is checked file by file before the first byte is written. Every write is atomic (temp file + rename), so the only two states an interrupted run can leave are the two the precondition recognizes. Re-running against an already-stamped `dist/` exits 1 with:

  ```
  rehost: dist/ carries no https://learndsa.invalid — it already names https://sample.com/learndsa/, having been
  built with SITE_URL set or rehosted before. […] If that URL is the deployment, this artifact is ready to ship;
  otherwise rebuild — it is deterministic — and stamp the fresh one:

      npm run build && npm run rehost https://sample.com/learndsa
  ```

#### The sentinel, and what a leak looks like

An unstamped build carries **`https://learndsa.invalid`**. `.invalid` is reserved by RFC 2606 and can never resolve, so a placeholder that escapes is unmistakable in a grep and inert in the wild — unlike a stale real domain, which is a working link to somebody else's site. A local `npm run build` and the GitHub-Actions gate both build the sentinel artifact deliberately: neither needs a real origin, and the e2e suite asserts paths, not hosts.

You have leaked it if any of these show `learndsa.invalid` **on a deployed site**: a page's `<link rel="canonical">` or `og:url`, `og:image`/`twitter:image`, a sitemap `<loc>`, robots' `Sitemap:` line, or a JSON-LD `url`. Nothing breaks for a reader — every link on the page is relative and works — but every crawler and every link preview is told the site lives at a domain that does not exist. See §9 for the fix per host.

#### The hard-fail rule: a publishing build without `SITE_URL`

`astro.config.mjs` keeps a `PUBLISHING_BUILDERS` list — platforms that **build and publish**, each identified by a variable it sets on its own builders and nowhere else:

| Variable | Platform |
|---|---|
| `CF_PAGES` | Cloudflare Pages |
| `WORKERS_CI` | Cloudflare Workers Builds |
| `NETLIFY` | Netlify |
| `VERCEL` | Vercel |

If one of those is present and `SITE_URL` is not, the build **fails** rather than publishing the sentinel, naming the platform it detected:

```
[astro] Unable to load your Astro config

SITE_URL is not set on a Cloudflare Workers Builds build. Every canonical, og:url, sitemap <loc> and JSON-LD url
would ship the unstamped sentinel https://learndsa.invalid. Set SITE_URL to the full deployment URL, sub-path
included (e.g. https://learndsa.dev), as a build variable for BOTH the production and preview environments —
see docs/deployment.md §2.1.
```

It fires the moment Astro loads its config — the first thing `astro check` does — so the deployment fails with nothing built and nothing written. It fires on **preview / non-production branch** builds too, because these variables are set for those as well — which is why one project-wide `SITE_URL` is the right answer, and why a preview then canonicalizes to production instead of competing with it.

> **This list is the fix for a real incident (2026-08-24).** It read `CF_PAGES` alone — Cloudflare *Pages* — while this project deploys through Cloudflare *Workers Builds*, which injects `WORKERS_CI` (alongside `CI`, `WORKERS_CI_BUILD_UUID`, `WORKERS_CI_COMMIT_SHA` and `WORKERS_CI_BRANCH`). The guard written to stop exactly this did not fire: the build succeeded and emitted `https://learndsa.invalid`, and only an unrelated downstream failure kept it off the internet. `tests/unit/rehost.test.ts` now pins all four rows and the shape of the lookup, so adding a host is one line and deleting one fails the unit suite.

**The gap that remains is hosts outside that list.** GitHub Actions sets none of the four, so nothing stops it building a sentinel artifact and deploying it successfully — §4.4 and §5.3 each carry the `SITE_URL` line that closes that gap for its topology. Hosts with no build step (§4.5) are covered by `npm run rehost`, which refuses to leave a sentinel behind.

#### Verify

```bash
npm run build

# 1. Distinct origins in the built HTML/CSS/JS. Expect: your deployment origin
#    (or https://learndsa.invalid on an unstamped local build), https://schema.org
#    (JSON-LD @context), http://www.w3.org (SVG namespaces) and
#    https://tailwindcss.com (a CSS source comment). Anything else — a localhost,
#    a preview URL, a stale domain — is a bug.
grep -rhoE 'https?://[a-zA-Z0-9.-]+' --include=*.html --include=*.js --include=*.css dist/ \
  | sort | uniq -c | sort -rn

# 2. Nothing may name the sentinel after a stamp. `npm run rehost` asserts this
#    itself over every text file in dist/; this is the same check by hand.
grep -rl 'learndsa\.invalid' dist/ || echo 'clean'

# 3. Spot-check the two places a wrong deployment URL hurts most — and on a
#    sub-path deployment, confirm the sub-path is IN them.
grep -o '<link rel="canonical"[^>]*>' dist/index.html dist/learn/binary-search/index.html
grep -o '<meta property="og:image"[^>]*>' dist/index.html
```

### 2.2 Sub-path hosting — delivered by the post-build pass, **not** by `base`

Deploying under a base path — a GitHub Pages *project* site `https://user.github.io/repo/`, or `https://example.com/learndsa` — **works** as of Plan D stage D2, and **setting Astro's `base` is still not how.** This section once said `base` was sufficient; that was wrong, and the mistake was expensive because it fails *silently*.

**Why `base` is not enough.** Astro rewrites only the URLs **it** generates — its own `/_astro/…` script and style tags. Every hand-written internal URL in the source stays root-absolute and is untouched: the nav and footer hrefs, the breadcrumb, prev/next, lesson-card links, the 40 `](/glossary/#…)` links written in lesson prose, and the two `url("/fonts/…")` references in `src/styles/tokens.css`. Under `example.com/learndsa` the assets would resolve and every one of those links would point at `example.com/…` — so the page renders correctly and the navigation is dead. That is the worst shape a failure can take.

**So: never set `base`.** Not one supported deployment needs it —

- a custom domain (`https://your-domain.com`)
- Cloudflare Workers / Cloudflare Pages / Netlify / Vercel (they serve at root)
- a GitHub Pages **user/org** site (`https://user.github.io/`) — and, since D2, a **project** site (`https://user.github.io/repo/`) too
- any sub-path at all (`https://example.com/learndsa`), which the pass below delivers *without* it

— and a stray `base` on a root deployment breaks asset paths for nothing in return.

**What delivers it instead: `scripts/portablize.mjs`, inside `npm run build`.** It cannot be done in config at all — `base` is root-absolute by contract and `assetsPrefix` is one fixed string for pages at three different depths — so the pass runs over `dist/` after `astro build` and rewrites every internal URL, Astro's and hand-written alike, to a **document-relative** one. Stage **D1** is its precondition: a relative URL resolves against the document URL, so `../glossary/` is only correct from `/learn/binary-search/`, which is why the trailing slash came first. The links client JS builds — the resume CTA on `/` and `/learn/`, and the review cards — resolve at runtime against the header wordmark's `data-site-root` href, which the same pass rewrites — the build fails if a chunk regains a root-absolute link or a page loses that anchor. Both halves are served and walked under a real sub-path by `tests/e2e/portable.spec.ts`.

**The one document that stays root-absolute: `dist/404.html`.** A 404 is served *at the URL the reader typed*, not at its own path, so a relative link on it resolves against an arbitrary URL — `../glossary/` from `/learn/typo/deep/thing` is nonsense. There is no JS-off fix (a `<base>` tag would break every fragment link on the site, and a script violates spec §13), so its links stay root-absolute and get **the deployment's base path put in front of them** instead: `/learndsa/glossary/`, not `/glossary/`. Both stamping paths do it, through one function in `portablize.mjs` — the build when it already knows its sub-path (§2.1 A), `npm run rehost` when a sentinel artifact is stamped afterwards (§2.1 B) — because when only the second had it, a host with a build step *and* a sub-path (GitHub Pages via Actions, §4.4) shipped a 404 that was unstyled and whose every escape link left the deployment, with nothing printed to say so. A **root** deployment needs no prefix and gets none.

**Declared URLs are not this pass's business** — canonical, `og:url` and `<loc>` are absolute by requirement, and a sub-path deployment needs the sub-path *in* them. That is §2.1's `SITE_URL` (or `npm run rehost`), and either one is a single input away.

### 2.3 The OG card — generated, not a placeholder (nothing to do before launch)

**This is done.** M7.3 replaced the old solid-indigo placeholder with a branded 1200×630 card **generated from the real renderer**, so no step here blocks a deploy. Two files ship, both committed:

| File | What it is |
|---|---|
| `public/og-source.svg` | the **reviewable source of the PNG** — a 1200×630 card whose visualization frame is `ArrayRenderer.renderStatic()`'s own output, so the card cannot drift from the product. This is the file to read in a diff |
| `public/og-default.png` | the raster `BaseLayout` links as `og:image`/`twitter:image` (scrapers do not render SVG), screenshotted from that SVG |

Both are **outputs** of `scripts/build-og.mjs` — the script is the actual source of truth.

**Never hand-edit either file.** Both are outputs of `scripts/build-og.mjs`; a hand-tweak is overwritten by the next regeneration and, worse, re-opens the failure that motivated the script — a hand-drawn card advertising a visualization the site does not actually render (CLAUDE.md's standing "never hand-mock the product" rule).

To change the card, edit `scripts/build-og.mjs` and regenerate:

```bash
npm run og      # = node --experimental-transform-types scripts/build-og.mjs
```

- **Not wired into `npm run build`** — on purpose. The build stays fast and browser-free; the card changes about as often as the logo.
- **Needs Playwright's Chromium** (already a devDependency) to rasterize the SVG: `npx playwright install chromium` if the binary is missing. No new package.
- The script asserts the PNG's own IHDR reads 1200×630 before reporting success, so a silently mis-sized card cannot ship.
- **One reproducibility caveat:** the card uses the site's system font stack, so it is lettered by whatever the *generating* machine resolves `system-ui` to. Regenerating on a different OS re-letters it — review the SVG diff, not just the PNG.

Verify the result renders in a real link preview after deploy (§7), not just locally: scrapers fetch the absolute `og:image` URL, which is a declared URL and therefore depends on §2.1's deployment URL — an unstamped artifact advertises a card at `https://learndsa.invalid/og-default.png`, and no scraper can fetch that.

### 2.4 Three limitations that come with a portable artifact

Decisions, not gaps (Plan D §6). Each one is a consequence of "one artifact, any origin, any sub-path" that no amount of build work can remove, so the answer is to know about it before you deploy rather than to discover it afterwards.

**1. `robots.txt` is origin-root-only, by the standard — a sub-path deployment ships no effective crawler directives.** Crawlers fetch `sample.com/robots.txt` and nothing else; `sample.com/learndsa/robots.txt` is just a file nobody asks for, and the one that *is* read belongs to whoever owns the origin. So under a sub-path the built `robots.txt` — `Allow: /` plus the `Sitemap:` line — has no effect, and **the sitemap is not discovered**: submit it by hand to Search Console / Bing Webmaster (§7). Nothing in the build can change this, and nothing else is lost, because the two things this site actually needs kept out of the index are `<meta name="robots" content="noindex">` tags on `dist/404.html` and `/dev/renderers/` — page-level, path-independent, and unaffected.

**2. `localStorage` is scoped to the ORIGIN, not the path — two deployments on one origin share every progress key.** `sample.com/learndsa` and `sample.com/learndsa-v2` are one storage namespace: they read and write each other's `lesson:{slug}:complete`, `progress:v1:{slug}` and `ld:*` records, and a reset on either clears both. That is a browser rule, not a choice this repo made, and there is no path-scoped alternative that is still `localStorage`. Practical consequences: do not run a staging copy of this site at a second sub-path of a domain readers use, and expect a reader who visits both to see one merged progress state. (The mirror-image case — a move to a *different* origin leaving progress behind — is in §7's support callout.)

**3. Self-canonicalizing means public mirrors compete in search.** Every deployment names itself: canonical, `og:url` and the sitemap all say "this URL", because that is what makes one artifact deployable anywhere. Two publicly indexed copies of identical content therefore dilute each other's ranking rather than one pointing at the other. Chosen with the trade stated, and it is only a problem when a mirror is *public* — a staging host nobody links to costs nothing. If a mirror is ever meant to stay out of the index, a `rehost --noindex` flag is a ten-line addition and not a redesign; it does not exist today.

---

## 3. Build and verify locally

### 3.1 The Definition-of-Done gate

All five checks must be clean before every deploy — this is spec §18, and it is exactly what CI runs (§5):

```bash
npm ci                 # clean, lockfile-exact install
npm run build          # astro check (type-check) + astro build + portablize → dist/
npm run lint           # ESLint
npm run format:check   # Prettier
npm run test           # Vitest unit suite  (63 spec files, node env — no DOM, no localStorage)
npm run test:e2e       # Playwright + axe   (36 spec files; needs: npx playwright install chromium)
```

`npm run build` is `astro check && astro build && node scripts/portablize.mjs` — **type errors fail the build**, which is intended (it's a real gate, not just an editor nicety), and so does any portability regression the third command finds (§2.2). The pass prints what it rewrote on every build; read that summary rather than trusting a figure copied into a document.

Three things about the suites a deployer should know before reading a run:

- **`npm run test:e2e` builds and previews first, locally**, so it needs **ports 4321 and 4322 free** and takes a few minutes. 4322 is the second `webServer`: a ~90-line `node:http` fixture that mounts the same `dist/` under `/deployments/learndsa` for the `portable` project, which walks the site from a sub-path on a deliberately dumb host (no extension guessing, no redirects). On CI it skips the rebuild (the gate has already built) and `astro preview` fails loudly if `dist/` is missing — see `playwright.config.ts`.
- **The JS budget is enforced, not remembered.** `tests/e2e/js-budget.spec.ts` gzips every script in each built page's static import closure and fails the run if any page exceeds spec §4's **60 KB gz**; it prints the per-page table on every run, so read *that* for the current number rather than trusting a figure copied into a document (this one included). Lazily-imported renderer/algorithm chunks are reported separately and gated at nothing — no page downloads them all.
- **The pixel baselines skip until seeded.** `tests/e2e/baseline-visual.spec.ts` holds 14 captures that are inert unless `VISUAL_BASELINE` is set and PNGs are committed (§5.2). A green e2e run therefore says nothing about pixels; the aria/DOM baselines (`baseline-aria.spec.ts`) run unconditionally.

Preview the production build exactly as it will ship:

```bash
npm run preview        # serves dist/ locally, defaults to http://localhost:4321
```

### 3.2 What a correct `dist/` looks like

`build.format: 'directory'` means routes are emitted as **directories, not files** — `about/index.html` served at `/about/`, and with `trailingSlash: 'always'` that slash URL is the only form the site publishes (§2.2, amendment U-1). Expect exactly:

```
dist/
├─ index.html                   the home page, served at /
├─ 404.html                     stays at the ROOT — directory format does not move it,
│                               because a 404 is not a page with an address. The one
│                               document whose links stay root-absolute (§2.2)
├─ about/index.html  glossary/index.html  learn/index.html
├─ learn/<course>/index.html    × 3 courses
├─ learn/<slug>/index.html      × 127 lessons
├─ dev/renderers/index.html     dev-only gallery — prod-gated, noindex, no renderer JS
├─ sitemap.xml  robots.txt      134 <loc>: 4 static + 3 courses + 127 lessons, every one slashed
├─ favicon.svg  favicon-32.png  apple-touch-icon.png
├─ og-default.png  og-source.svg
├─ fonts/                       the two committed IBM Plex subsets, preloaded by BaseLayout
├─ _headers                     consumed by the host, never served (§6)
└─ _astro/                      content-hashed CSS + JS chunks
```

### 3.3 Pre-deploy audit of the built output

Cheap greps that catch the mistakes that are expensive to catch in production. Run them on a fresh `dist/`:

```bash
# No unexpected origin in the build (see §2.1 for the expected list). On an
# unstamped build the site's own entry is https://learndsa.invalid — that is the
# sentinel, and it must NOT be there on anything you deployed.
grep -rhoE 'https?://[a-zA-Z0-9.-]+' --include=*.html --include=*.js --include=*.css dist/ | sort -u

# The 404 is the only document that may carry a root-absolute link, and under a
# sub-path deployment every one of them must start with the base path (§2.2).
grep -o 'href="/[^"]*"' dist/404.html | head

# The 404 must not be indexable, and the dev gallery must not be either.
grep -o '<meta name="robots"[^>]*>' dist/404.html dist/dev/renderers/index.html

# No runtime network calls anywhere in the shipped JS (spec §4). Expect no output.
grep -rlE '\bfetch\(|XMLHttpRequest|navigator\.sendBeacon' dist/_astro/

# Sitemap: 134 URLs, all on your origin, and NO /dev/renderers entry.
grep -c '<loc>' dist/sitemap.xml && grep -c 'dev/renderers' dist/sitemap.xml   # → 134, then 0
```

> **The URL shape needs no grep here** — `tests/e2e/url-shape.spec.ts` (part of `npm run test:e2e`, §3.1) asserts it against the running preview: every page's canonical and `og:url` match the URL it is served at, every `<loc>` returns 200 with no redirect hop, and no built page links to a slashless page URL. A missing trailing slash is a red suite, not a manual check.

> **Portability needs no grep either** — `scripts/portablize.mjs` fails the build if a root-absolute URL survives in any page or stylesheet, if a JS chunk carries a `/_astro/` literal, a root-absolute link literal or a root-absolute base assembled at runtime, or if any page ships without exactly one `[data-site-root]` anchor pointing at its own depth's root (that anchor is what the resume CTA and the review cards resolve their links against, since no HTML pass can reach a template literal inside a chunk). `tests/e2e/portable.spec.ts` then walks the built site under a real two-segment sub-path — including as a *returning* reader with progress seeded, which is the only state in which those runtime-built links exist.

> **`/dev/renderers`:** the developer-only renderer gallery is **prod-gated** (`import.meta.env.DEV`) — in a production build none of its islands render, so no renderer chunk is referenced, and it is excluded from the sitemap. It carries `<meta name="robots" content="noindex">`, which is the right control: a `robots.txt` `Disallow` would *stop* crawlers reading that tag and can leave a URL-only entry in the index. Leave `robots.txt` alone.

---

## 4. Host-specific deployment

Every host that builds uses the same three settings: **build command `npm run build`**, **publish/output directory `dist`**, **Node 24** — plus **`SITE_URL`**, the full deployment URL including any sub-path (§2.1). Hosts that do not build (§4.5) take a stamped artifact instead. Pick one.

**Sub-path deployments are supported everywhere in this list** — `https://user.github.io/repo/`, `https://example.com/learndsa`, a folder inside somebody else's domain. Two things make that work and neither is Astro's `base`, which must stay unset (§2.2): every internal link is document-relative, and `SITE_URL`/`npm run rehost` carries the sub-path into the declared URLs. Read §2.4 before choosing one: a sub-path deployment ships no effective `robots.txt` and shares `localStorage` with anything else on its origin.

### 4.1 Netlify

**Dashboard:** New site → connect the repo →
- Build command: `npm run build`
- Publish directory: `dist`
- Environment: `NODE_VERSION = 24`, `SITE_URL = https://your-domain` (the full deployment URL)

Or commit **`netlify.toml`** at the repo root:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "24"
  SITE_URL = "https://your-domain"   # full deployment URL, sub-path included (§2.1)
```

> **Netlify sets `NETLIFY`, which §2.1's guard now covers.** Omit `SITE_URL` and the build **fails** with `SITE_URL is not set on a Netlify build` — it does not quietly deploy an artifact whose every canonical, `og:url` and `<loc>` names `https://learndsa.invalid`. (Before 2026-08-24 the guard listed `CF_PAGES` alone and this note said the opposite.) The post-deploy check is still one line in §7.

**No `[[headers]]` block is needed** — Netlify reads the committed `public/_headers` (§6), which already carries the security headers, the immutable `/_astro/*` rule and the short-cache rules for the unhashed icons/OG card. Duplicating them in the TOML gives you two sources of truth for the same headers.

Netlify auto-serves `404.html` for unknown routes. No redirects needed for this static site.

### 4.2 Vercel

**Dashboard:** Import the repo. Vercel detects Astro automatically:
- Framework preset: **Astro**
- Build command: `npm run build` (override if the preset differs)
- Output directory: `dist`
- Node version: **24** in Project Settings → General. **Not 20** — Astro 7 hard-requires `>=22.12.0` and refuses to build below it (§1).
- Environment variable: `SITE_URL` = the full deployment URL (§2.1). Vercel sets `VERCEL`, which the guard covers, so an omission **fails the build** (`SITE_URL is not set on a Vercel build`) rather than shipping the sentinel silently.

> **Vercel does not read `public/_headers`.** Deploying here silently drops every security and cache header the repo ships (§6). Restate them in `vercel.json` or accept the loss knowingly:
>
> ```json
> {
>   "buildCommand": "npm run build",
>   "outputDirectory": "dist",
>   "headers": [
>     {
>       "source": "/(.*)",
>       "headers": [
>         { "key": "X-Content-Type-Options", "value": "nosniff" },
>         { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
>         { "key": "X-Frame-Options", "value": "DENY" }
>       ]
>     },
>     {
>       "source": "/_astro/(.*)",
>       "headers": [
>         { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
>       ]
>     }
>   ]
> }
> ```
>
> Keep it to headers — do **not** add serverless/SSR config; this is a static site.

### 4.3 Cloudflare — Workers Builds (the current setup), and Pages

**Dashboard:** Workers & Pages → create a Worker → connect the repo. Then, under *your Worker → Settings → Build*:
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy` (the default)
- Branch control: production branch `main`; enable *Builds for non-production branches* if you want preview URLs on PRs
- Build variable: `NODE_VERSION = 24` (or let the build image read `.nvmrc`)
- Build variable: **`SITE_URL` = the full deployment URL. This one is mandatory — the build throws without it (§2.1), and that is deliberate.** It is also the only thing to change when a custom domain is added: edit the variable, redeploy, done.

There is **no build output directory setting** — the assets directory is `wrangler.jsonc`'s, and `wrangler deploy` reads it. Note that on Workers, *Settings → Build → Build variables and secrets* and *Settings → Variables and Secrets* are two different lists: the second is runtime-only, and this site reads nothing at runtime.

#### `wrangler.jsonc` — committed, and its first job is to exist

Deleting this file reintroduces both 2026-08-24 failures, so read its header comment before touching it.

**Why it exists at all.** With no Wrangler config in the repo, `wrangler deploy` (4.68+, now GA) runs **automatic configuration**: it detects Astro, installs the `@astrojs/cloudflare` adapter, rewrites `astro.config.mjs`, adds package scripts, edits `.gitignore` and rebuilds. That adapter is forbidden by spec §4 — this site has no server — and it relocates the static output to `dist/client/`, which is what made `scripts/portablize.mjs` throw `client/404.html is not a directory-format page` on the production build. A committed config suppresses all of it.

**What each key is for:**

| Key | Value | Why |
|---|---|---|
| `name` | `static-dsa` | the Worker's name, and therefore its `*.workers.dev` hostname |
| `compatibility_date` | `2026-08-25` | one of the two mandatory fields in a Worker config (with `name`). An assets-only Worker runs no code that depends on it, but it must be a pinned date rather than an implicit "today" |
| `assets.directory` | `./dist` | the build output, uploaded as static assets. **No `main` and no `binding`** — there is no Worker script, and the `binding` key is only valid alongside `main` |
| `assets.html_handling` | `force-trailing-slash` | pairs with `trailingSlash: 'always'` + `build.format: 'directory'`, so `/about` 301s to `/about/` and the URL every canonical and every sitemap `<loc>` names is the URL that is served |
| `assets.not_found_handling` | `404-page` | **Workers does not infer this the way Pages did.** The default is `none`, which answers a bare 404 and never reaches `dist/404.html` — the site's own 404 page is dead without this line |

Verified with `npx wrangler@4 deploy --dry-run`: the config is accepted, 116 files are read from `./dist`, and no automatic configuration is triggered.

**`public/_headers` needs no change.** `_headers` and `_redirects` are supported natively by Workers static assets, exactly as they were on Pages; the file is copied verbatim into `dist/`, consumed by the host and never served as a public URL — see §6 for what it sets and why.

#### Cloudflare Pages

Pages still works and is still a valid target for this artifact — Cloudflare's guidance is that it continues to be supported while new work goes to Workers (§0). If you deploy there instead: Framework preset **Astro**, build command `npm run build`, build output directory `dist`, `NODE_VERSION = 24`, and **`SITE_URL` on BOTH the Production and Preview environments** (`CF_PAGES` is set on both, and the §2.1 guard covers it). Pages serves `404.html` for not-found routes automatically, so it needs no equivalent of `not_found_handling`. `wrangler.jsonc` carries no `pages_build_output_dir`, which is the key that makes a Wrangler file drive a Pages project's configuration, so it does not govern a Pages deployment — configure that one from the dashboard.

### 4.4 GitHub Pages (via GitHub Actions)

GitHub Pages needs a build step (it won't run `npm run build` for you). Use the official Pages Actions.

> **A *project* site is now supported** — `https://user.github.io/repo/`, which serves under `/repo/`, is exactly the sub-path case Plan D D2/D3 deliver. This section used to say it was impossible; it is not, and `base` is still not how (§2.2). What makes it work is the `SITE_URL` line in the workflow below: set it to the full URL **including `/repo`**, and the build both stamps the declared URLs and gives `dist/404.html` its base path — which matters more here than anywhere else, because GitHub Pages serves that 404 for every unmatched path under the repo. A user/org site (`https://user.github.io/`) or a custom domain just sets `SITE_URL` to the origin.

Create **`.github/workflows/deploy.yml`**:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc     # never a literal that can drift from the pin
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          # The full deployment URL, sub-path included. A project site is
          # https://user.github.io/repo — the /repo half is what keeps canonicals,
          # the sitemap and 404.html's links inside the deployment (§2.1).
          # GitHub Actions sets none of the four variables §2.1's guard watches,
          # so omitting this does NOT fail the build; it ships
          # https://learndsa.invalid to a live URL.
          SITE_URL: https://user.github.io/repo
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then in the repo: **Settings → Pages → Source = "GitHub Actions."** For a custom domain, add it there and drop a `CNAME` file in `public/`.

> **GitHub Pages ignores `public/_headers` and offers no way to set response headers**, so every security header and both cache rules in §6 are silently lost. That is why §0 does not recommend it for this repo — the sub-path objection that used to sit beside it is retired.

> **Two §2.4 limitations bite hardest on a project site.** `user.github.io/robots.txt` belongs to the account, not the repo, so the built `robots.txt` has no effect and the sitemap must be submitted by hand. And **every project site under `user.github.io` is one origin**, so this site's progress keys are shared with every other project site you host there — including a second copy of this one.

### 4.5 A plain static server (nginx, S3, Apache, `python -m http.server`, an offline copy)

The host class `build.format: 'directory'` exists to support: no build step, no configuration, no extension guessing. Build once, stamp, copy the folder.

```bash
npm run build                                  # portable, sentinel metadata
npm run rehost https://sample.com/learndsa     # the URL it will really be served at (§2.1 B)
rsync -a dist/ user@host:/srv/www/learndsa/    # or `aws s3 sync`, or a USB stick
```

- **Nothing needs rewriting server-side.** Every page is `<route>/index.html` and every internal URL is relative, so a default nginx `root`, an S3 website endpoint and `python -m http.server` all serve it correctly with no rules, no redirects and no `try_files` gymnastics. This is what the `portable` Playwright project proves on every run (§3.1).
- **The one thing worth configuring is the 404 page.** These hosts do not serve `dist/404.html` automatically: nginx wants `error_page 404 /404.html;`, and an S3 website endpoint takes an "Error document" of `404.html`. Without it a mistyped URL gets the server's own bare 404 — a cosmetic loss, not a broken site.
- **Headers (§6) are yours to set**, since `public/_headers` is a Cloudflare/Netlify format. The security headers and the `immutable` rule on `/_astro/*` are worth reproducing in the server config; nothing breaks without them.
- **Stamp before you copy, once.** `npm run rehost` refuses a second run over the same `dist/` (§2.1 B), so re-point a deployment by rebuilding and stamping the fresh artifact rather than by stamping the stamped one.

---

## 5. Continuous integration — what is actually committed

### 5.1 `.github/workflows/ci.yml` — the DoD gate (committed, in use)

Workers Builds builds and deploys every push to `main` from the git integration (§0), but its build only type-checks and builds. This workflow runs the four checks Cloudflare does not — **lint, format, unit tests, and the Playwright/axe e2e suite** — and it deliberately **does not deploy**: a Wrangler step here would publish the site twice. Read the file itself for the full reasoning; its shape is:

| Piece | Value | Why |
|---|---|---|
| Triggers | `push` to `main`, every `pull_request`, and `workflow_dispatch` | the manual trigger exists for the seeding job in §5.2. The gate carries no event filter, so a manual dispatch runs it too — which is what proves the commit you are seeding from is green |
| Node | `node-version-file: .nvmrc` | one source of truth, shared with Cloudflare. Never a hardcoded `node-version:` that can drift from the file |
| Concurrency | `ci-${{ github.ref }}-${{ github.event_name }}` | a newer push supersedes an in-flight run of the same ref; the event is in the key so a seeding run and a push to the same branch never cancel each other |
| Permissions | `contents: read` (workflow-level) | least privilege — this workflow only reads the repo. Artifact upload/download is unaffected: those actions authenticate with the runtime token, not `GITHUB_TOKEN` |
| Timeouts | 30 min (gate) / 20 min (seed) | a hung browser or wedged preview server fails in minutes instead of burning the 6-hour default |
| Steps | `npm ci` → `npm run build` → `npm run lint` → `npm run format:check` → `npm run test` → `npx playwright install --with-deps chromium` → `npm run test:e2e` | spec §18's five checks, in order; only e2e needs a browser |
| On failure | uploads `playwright-report/` + `test-results/`, 7-day retention | the HTML report embeds the `on-first-retry` traces, screenshots and video, so a red run is diagnosable without a local repro |

**The gate sets no `SITE_URL` and that is deliberate.** It builds the sentinel artifact (§2.1) because it deploys nothing and because the suite asserts *paths*, not hosts — the same `dist/` is exercised at `/` by every spec and under a sub-path by the `portable` project. Nothing in CI needs a real origin.

**Make `DoD gate` a required status check on `main`** (Settings → Branches → branch protection) and require a PR review. That is the only thing standing between a red commit and the branch Cloudflare deploys — the workflow cannot block a deploy it does not perform.

### 5.2 Turning the pixel baselines on (two steps, in this order)

`tests/e2e/baseline-visual.spec.ts` holds 14 screenshot comparisons that **skip unless `VISUAL_BASELINE` is set**, and until PNGs are committed there is nothing to compare against. The `Seed visual baselines` job (manual dispatch only) closes that gap:

1. **Seed.** Actions → CI → *Run workflow*, from a commit whose `DoD gate` is green. Download the `visual-baselines` artifact, review the PNGs like any other reviewed artifact, and commit them to `tests/e2e/baseline-visual.spec.ts-snapshots/`.
2. **Then arm it.** Add `VISUAL_BASELINE: '1'` to the gate's `npm run test:e2e` step.

Doing those in the other order turns CI red: `playwright.config.ts` sets `updateSnapshots: 'none'` on CI, so a missing baseline is a failure rather than a silent regeneration — deliberately, but only once a baseline exists. The job must run **on the CI runner image**, not a laptop: the site ships a pure system font stack, so glyph rasterization is image-specific and the snapshot filename pins `{platform}`.

### 5.3 Alternative topology: build **and** deploy from Actions

Only relevant if you **disconnect Cloudflare's git integration** so that Actions, not Cloudflare, builds and publishes. Do not commit this alongside §5.1's workflow while the git integration is on — the site would be published twice per push, from two different builds.

> **The example below is written for a Cloudflare _Pages_ project in Direct Upload mode, which is not what this repo deploys to today** (§0). For the committed Workers topology the deploy step is `wrangler deploy` reading `wrangler.jsonc` (§4.3) rather than `pages deploy`, and the API token needs the matching Workers permission instead of the Pages one — set that up from Cloudflare's own Workers CI/CD documentation rather than from this snippet, which is kept as the worked example of the *shape*: gate first, upload the exact verified bytes second.

> **This topology is the one place the sentinel can reach production unchallenged, so the `SITE_URL` line below is load-bearing.** §2.1's hard-fail keys on variables the *platform's own builders* set; a GitHub Actions runner sets none of them, so an unset `SITE_URL` here builds cleanly, passes the gate, and wrangler publishes an artifact that names `https://learndsa.invalid` at a real URL. Set it as an Actions **variable** (`vars.SITE_URL`, Settings → Secrets and variables → Actions) — it is not a secret, and a variable is visible in the workflow log, which is where you want it.

```yaml
# .github/workflows/deploy.yml  — Direct Upload topology ONLY
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  deployments: write            # lets Cloudflare post a deployment status

concurrency:                    # a newer push cancels an in-flight run of the same ref
  group: cicd-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:                       # the same DoD gate as §5.1 — nothing deploys unless green
    name: DoD gate
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run build       # astro check (type gate) + astro build + portablize → dist/
        env:
          SITE_URL: ${{ vars.SITE_URL }}   # full deployment URL — nothing else supplies it here
      - run: npm run lint
      - run: npm run format:check
      - run: npm run test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist, retention-days: 3 }  # deploy the exact verified bytes

  deploy:
    name: Cloudflare Pages
    needs: verify                # hard gate on the full DoD
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event.pull_request.head.repo.fork != true    # secrets unavailable to fork PRs
    steps:
      - uses: actions/download-artifact@v4
        with: { name: dist, path: dist }
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=learndsa --branch=${{ github.head_ref || github.ref_name }}
```

Prerequisites for that example: the GitHub remote (`origin`, already configured), a Cloudflare Pages project in **Direct Upload** mode, two Actions **secrets** — `CLOUDFLARE_API_TOKEN` (scope: Account → Cloudflare Pages → Edit) and `CLOUDFLARE_ACCOUNT_ID` — and the `SITE_URL` **variable** above. Both are deploy-time only and are never shipped to a browser; the site itself has no runtime secrets at all. The trade this topology buys: the deployed bytes are the exact bytes the full test suite passed against, instead of a second build the tests never saw.

---

## 6. Caching & headers — `public/_headers` (committed)

One committed file drives all of this on Cloudflare — Workers static assets and Pages alike — and on Netlify. It is copied verbatim into `dist/`, consumed by the host, and never served as a URL. **Vercel and GitHub Pages ignore it** (§4.2 shows the Vercel equivalent). Four rule groups, each earning its place:

| Path | Header | Why |
|---|---|---|
| `/*` | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` denying geolocation/camera/microphone/payment/usb | the site uses none of those APIs and is never meant to be framed. Cheap, no runtime cost, no behavior change |
| `/_astro/*` | `Cache-Control: public, max-age=31536000, immutable` | Astro fingerprints every file here (`ArrayRenderer.zPEiTlER.js`), so a given name's bytes never change. Safe to cache forever, and it is where nearly all the page weight lives |
| `/favicon.svg`, `/favicon-32.png`, `/apple-touch-icon.png`, `/og-default.png` | `Cache-Control: public, max-age=3600, must-revalidate` | **unhashed and path-stable** — the `<head>` and every link-preview scraper reference these by fixed name, so they *survive* a rebrand. Immutably caching them would keep serving a replaced icon or a stale OG card out of every visitor's cache indefinitely. An hour of freshness, then an ETag revalidation (a 304, so effectively free) |
| HTML | *(nothing — host default)* | pages reference the current asset hashes and change on every content edit, so they must revalidate |

Two deliberate omissions, both documented in the file itself so nobody "fixes" them:

- **No `Cache-Control` on the `/*` rule.** A catch-all would also match `/_astro/*`, and hosts differ in how they resolve two matching rules that set the same header. The failure mode — a merged `max-age=0` winning over the immutable rule — silently defeats asset caching, which is the one caching decision on this site that matters. Per-path rules keep the question from arising.
- **No Content-Security-Policy.** `BaseLayout` ships a pre-paint inline theme script (it must run before first paint or the page flashes the wrong theme) and an inline `<style>` inside `<noscript>`. A static host cannot mint a nonce, a hash list would need regenerating on every build with no hook to do it, and `'unsafe-inline'` is a CSP that permits exactly what a CSP exists to stop. Revisit only if the inline script can be removed without reintroducing the flash.

`sitemap.xml` and `robots.txt` are plain static files at the root and are left on the host default — they are fetched by crawlers, not by every page load.

---

## 7. Post-deploy verification

The e2e suite already proves the behavior against a local build; this list is for the things only a **real origin, a real CDN and a real browser** can prove. Run it after the first deploy, and after any domain change.

**Origin, SEO and social**

- [ ] **No sentinel survived.** `curl -s https://your-domain/ | grep -c learndsa.invalid` → **0**, and the same for `/sitemap.xml`. One `curl` is the whole check, and it is the first thing to run: a page full of `https://learndsa.invalid` looks perfect to a reader and tells every crawler the site lives at a domain that cannot exist (§2.1).
- [ ] **Canonical/OG name the deployment — sub-path included:** view-source on the home + a lesson → `<link rel="canonical">`, `og:url` and `og:image` all carry your domain **and, if you deployed under a sub-path, the sub-path**. "Right origin, missing sub-path" is the failure worth looking for; it is the one an origin-only glance cannot see. (The *path* half — canonical == the URL it was served at — is already covered by `url-shape.spec.ts`; only the deployment URL is deploy-specific.)
- [ ] **Sitemap:** `https://your-domain/sitemap.xml` lists **134 URLs** — 4 static routes, 3 course pages and 127 lessons — every `<loc>` under your deployment URL, **trailing-slashed** (`/learn/binary-search/`), and **no `/dev/renderers`**. Click one: it must return 200 directly, not a redirect.
- [ ] **Robots:** `https://your-domain/robots.txt` → `Allow: /` plus a `Sitemap:` line on your domain. **On a sub-path deployment, skip this and submit the sitemap by hand** — the file is only read at the origin root, so yours is never fetched (§2.4).
- [ ] **404:** a bad URL serves the friendly page and it carries `<meta name="robots" content="noindex">`. `/dev/renderers` does too. **On a sub-path deployment, click the 404's links** — its stylesheet, its fonts and its way back into the site are root-absolute by design and must all carry the base path (§2.2). An unstyled 404 whose links leave the deployment means the artifact was never stamped with the sub-path.
- [ ] **A sub-path deployment actually navigates.** Load the home page, click through to `/learn/`, open a lesson, use the visualizer. Then check DevTools → Network for 404s: a stylesheet, font or lazily imported chunk requested at the wrong path does not throw — it fails quietly and the page merely looks wrong. (This is the one class of defect the build cannot see, which is why `tests/e2e/portable.spec.ts` watches the network rather than the DOM.)
- [ ] **The OG card renders in a real link preview.** Paste the home URL into whatever your audience uses (Slack, X, LinkedIn, Discord) and confirm the branded 1200×630 card appears — not a blank frame or a cropped logo. This is the one §2.3 check a local build cannot make: scrapers fetch the **absolute** `og:image` URL over the public internet. If a scraper shows a stale card after regenerating, that is its own cache, not yours (§6 keeps the asset revalidating hourly).
- [ ] **Headers actually arrived:** `curl -sI https://your-domain/ | grep -i 'x-content-type\|referrer\|x-frame\|permissions'` and `curl -sI https://your-domain/_astro/<any-hashed-file> | grep -i cache-control` → `immutable`. If both come back empty, the host is ignoring `public/_headers` (§6) — expected on Vercel/GitHub Pages, a misconfiguration anywhere else.
- [ ] **Submit the sitemap** to Google Search Console / Bing Webmaster (optional, for indexing).

**The product itself**

- [ ] **A visualization works end-to-end:** open a lesson, press Play / Step ± / Scrub / Reset, then type custom input. With DevTools → Network filtered to Fetch/XHR, interacting must produce **zero requests** — everything is precomputed client-side (spec §4).
- [ ] **Lighthouse (mobile) meets §14 targets** on home + a lesson + glossary — Perf ≥ 95, A11y 100, Best-Practices ≥ 95, SEO ≥ 95. There is no Lighthouse tooling in the repo, so this stays a manual run:
  ```bash
  npx lighthouse https://your-domain/ --view
  npx lighthouse https://your-domain/learn/binary-search/ --view
  npx lighthouse https://your-domain/glossary/ --view
  ```
  (At M5 a local build scored 97/100/100/100 and 100/100/100/100. Re-confirm on the real origin — CDN headers and the resolved canonical both move these numbers.)
- [ ] **Both themes:** toggle light/dark on a lesson; code blocks and diagrams stay legible, and the browser chrome colour follows (`theme-color`).
- [ ] **Keyboard only:** tab through one lesson end to end — skip link, player controls, code tabs, practice buttons. Focus stays visible and never gets trapped or lost when a control disables itself.

**What M7/M8 added — verify these specifically**

- [ ] **Progress persists, per device.** Mark a lesson complete, reload, navigate away and back: the check and the resume CTA survive. Then self-grade a practice question and confirm the pips advance on `/learn`.
- [ ] **Gamification vanishes with JS off.** Disable JavaScript and reload a lesson and `/learn`: prose, three-language code and navigation stay fully usable, each visualizer shows its static still plus the "enable JS" note, and **no gamification affordance appears at all** — no pips, no track ring, no review card, no trial, no Final Run, no self-grade buttons, no note field, no learning-days line, no reset control, no pip legend. Every one of those components ships its own `<noscript>` kill-switch; a dead control is worse than no control. (Server-rendered M7 content *is* expected to remain: the prerequisites row, "What's next", and glossary aliases.)
- [ ] **The review strip stays calm.** On a fresh device nothing is due, and `/learn` must therefore render **no review strip at all** — no empty state, no "0 due" counter, no placeholder. (The ≤2-card cap and the banned "overdue"/countdown vocabulary are covered by the calm-invariant tests; only the zero-DOM empty state is worth eyeballing live, because it is the state every first-time visitor sees.)
- [ ] **Reset really resets.** Use the reset-progress control on `/learn`, then reload: completions, mastery records **including any Explain-it-back notes**, cleared trials, Final Runs and the learning-days count are all gone — while your theme, code-language and visualizer-speed preferences survive. Those are preference keys and are deliberately not cleared.
- [ ] **Print.** `Ctrl/Cmd-P` a lesson: prose and code print readably, chrome and interactive controls drop out. Then check a high-contrast/forced-colors mode if your OS has one — both were added in M7.3 and neither is exercised by a normal visit.

> ### Support expectation: `localStorage` is per-device and **nothing syncs**
>
> Every trace of a reader's progress — completion, mastery stage, spaced-review schedule, cleared trials, Final Runs, their own written notes, the learning-days count — lives in `localStorage` in **one browser profile on one device**. There is no account, no backend and no sync, by design (spec §6; that is what makes the site's "no tracking" claim true rather than aspirational).
>
> Consequences to expect, none of which are bugs:
>
> - The same person sees **different progress** on their phone and their laptop, and in a second browser on the same machine.
> - **Clearing site data, "clear cookies", private/incognito windows, and aggressive privacy modes wipe or refuse it.** In a blocked-storage context the site degrades quietly — surfaces render as if nothing was recorded, never as an error.
> - A **new domain is a new origin**: moving from `*.workers.dev` to a custom domain leaves existing readers' progress behind on the old origin. If you plan a domain change, do it before you have an audience to disappoint.
> - **The same origin is the same storage, whatever the path.** Two deployments of this artifact at `sample.com/learndsa` and `sample.com/learndsa-v2` share every progress key and each other's resets — `localStorage` is origin-scoped, not path-scoped (§2.4).
>
> A progress export/import code is the only no-backend answer to this and is deliberately deferred (spec §19) — revisit only if readers actually ask.

---

## 8. Rollback

Every deploy is an immutable static bundle, so rollback is instant and total — there is no database to un-migrate and no server state to reconcile. **Prefer the host-native rollback:** it is one click, needs no rebuild, and cannot fail on a test that has since gone red.

- **Host-native (recommended):** the Worker's *Deployments* list → the three-dot menu on the version you want → **Rollback**, which immediately creates a new deployment carrying that version. `npx wrangler rollback` does the same from a terminal. Only the **100 most recent versions** are available, which is ample here; the binding caveats in Cloudflare's rollback docs do not apply, because this Worker has no bindings and no script — it is assets only. Netlify, Vercel and Cloudflare Pages have equivalent controls under their deploy lists. Effect is immediate; the git history is untouched, so fix forward at your own pace.
- **Git-native:** `git revert <bad-commit>` (never a force-push to `main` — Cloudflare deploys what `main` points at, and a rewritten history makes "what is live?" unanswerable) and push. The gate runs, Cloudflare rebuilds, the site returns. Slower than the dashboard, but it is the one that also fixes the next deploy.
- **Milestone checkpoints** — clean commits to land on if you need a known-good tree:
  - `5bc64ee` M8 hardening · `4f34cff` M8.2+M8.3 · `2b6b821` M8.1 · `12d2486` M7.3 · `80373a4` M7.2 · `7367685` M7.1
  - `5b07bc9` M6 · `3453878` M5 · `3515b81` M4 · `425b4e1` M3 · `b4e0dfe` M2 · `39deceb` M1
- **What a rollback does *not* touch:** readers' `localStorage`. Progress keys are versioned (`progress:v1:…`) and unknown versions are ignored on read, so rolling back to a build that predates a key simply leaves that key unread on the device — never a crash, never a wipe. Nothing here needs a data migration or a rollback script.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A build **fails** with `SITE_URL is not set on a … build` (the platform is named: Cloudflare Workers Builds, Cloudflare Pages, Netlify or Vercel) | Working as designed (§2.1). The alternative is publishing 135 canonicals and 134 `<loc>`s naming a domain that cannot exist | Add `SITE_URL` = the full deployment URL as a **build** variable and retry. On Workers Builds that is *your Worker → Settings → Build → Build variables and secrets* — **not** *Settings → Variables and Secrets*, which is the runtime list and does not reach the build. On Pages, both the Production and Preview environments. This is the mandatory dashboard setting in the callout at the top of this document. |
| A Cloudflare build fails with `client/404.html is not a directory-format page` | `wrangler deploy` **auto-configured the project**: with no Wrangler config in the repo it detects Astro, installs the `@astrojs/cloudflare` adapter and rewrites `astro.config.mjs`, and the adapter moves the static output to `dist/client/`. The thrown message says so — it appends "The `client/` prefix means an Astro adapter has moved the build into `dist/client/` — see wrangler.jsonc, and do not add an adapter (spec §4)." | Restore `wrangler.jsonc` (§4.3) — its presence is what suppresses auto-configuration — and revert whatever the run added: the `@astrojs/cloudflare` dependency, the `adapter`/`output` edits to `astro.config.mjs`, the generated package scripts and `.gitignore` lines. This site has no server; the adapter is forbidden by spec §4. |
| A deployed Cloudflare Worker answers a bad URL with a bare 404 instead of the site's 404 page | `assets.not_found_handling` is missing from `wrangler.jsonc`. Workers does **not** infer it the way Pages did — the default is `none` | Restore `"not_found_handling": "404-page"` (§4.3). `dist/404.html` is built on every run; without that line nothing ever serves it. |
| Canonical/OG/sitemap show `https://learndsa.invalid` in production | The sentinel shipped: `SITE_URL` was unset on a host **outside** the guard's list of four — GitHub Actions above all, or a plain host that was never stamped (§2.1) | Set `SITE_URL` for that host (§4.4/§5.3) and redeploy. For an artifact you cannot rebuild, `npm run rehost <url>` stamps it in place (§2.1 B). |
| Canonical/OG name the right **origin** but drop the sub-path (`sample.com/learn/x/`, not `sample.com/learndsa/learn/x/`) | `SITE_URL` or the `rehost` argument was the bare origin. Both take the **full deployment URL**, sub-path included | §2.1 — rebuild with the sub-path in the value. `rehost`'s own post-conditions catch this, so it is nearly always an origin-only `SITE_URL` on a host that builds. |
| Canonical/OG show a **preview** URL | Someone set `SITE_URL` to the per-deployment preview URL | §2.1 — previews deliberately canonicalize to production, which is what one project-wide `SITE_URL` achieves (on Pages, the same value on both environments). |
| `npm run rehost` exits 1 with "dist/ carries no `https://learndsa.invalid`" | The artifact is already stamped — built with `SITE_URL` set, or rehosted before. Running again would give `404.html` a **second** base path | §2.1 B — if the URL it names is the deployment, ship it as is. Otherwise `npm run build && npm run rehost <url>`; the build is deterministic. |
| `npm run rehost` exits 1 with "dist/ is HALF STAMPED" | A previous `rehost` died between two writes (unwritable file, full disk, Ctrl-C) | Not repairable in place, by design: `npm run build && npm run rehost <url>`. The message lists which files were already written. |
| `npm run build` exits 1 with "not one root-absolute URL was found across 20 pages" | `scripts/portablize.mjs` was run a second time over one `dist/` (`node scripts/portablize.mjs` by hand after a build) | Rebuild. The pass is incremental for `404.html`, so it refuses to run twice rather than silently doubling a base path. |
| `npm run build` exits 1 with "a script builds a root-absolute URL at runtime" | New client code wrote a link as `` `/learn/${slug}/` `` — a literal inside a chunk, which no post-build pass can rewrite | Resolve it against the site-root anchor instead: `siteRoot()` in `src/lib/progress.ts` returns the deployment root and `new URL('learn/<slug>/', root)` is the whole fix (§2.2). |
| CSS/JS 404s, unstyled page on a GitHub Pages **project** site | `dist/` was published without `scripts/portablize.mjs` having run (an `astro build` on its own, or a stale artifact) | §2.2 — deploy the output of `npm run build`; the pass is the third command in it and prints what it rewrote. |
| Every link goes to the origin root on a sub-path deploy — page renders fine, navigation is dead | Someone set `base` expecting it to relocate the whole site | §2.2 — remove `base`; this repo never sets it, and the post-build pass is what makes sub-paths work. |
| On a sub-path deploy the 404 page is unstyled and its links leave the deployment | The artifact was never told its sub-path, so `404.html`'s root-absolute links (the one carve-out, §2.2) still point at the origin root | Rebuild with `SITE_URL` carrying the sub-path, or stamp with `npm run rehost https://host/sub-path`. Both apply the same prefix through the same function. |
| A sub-path deploy ignores `robots.txt`, or the sitemap is never crawled | Not a bug: `robots.txt` is read only at the **origin root**, which a sub-path deployment does not own (§2.4) | Submit `https://host/sub-path/sitemap.xml` by hand to Search Console / Bing Webmaster. Nothing in the build can change this. |
| Two deployments on one domain show each other's progress | `localStorage` is scoped to the **origin**, not the path (§2.4) | Not a bug and not fixable in this architecture. Put a staging copy on a different origin, not a second sub-path. |
| Build fails in CI but works locally | Type error caught by `astro check`, or Node below the 22.12.0 floor | Fix the type error; ensure the runner reads `.nvmrc` (Node 24). Astro 7 refuses to build on Node 20 with "Node.js vX is not supported by Astro!". |
| `npm run test:e2e` fails in CI with "browser not found" | Playwright browsers not installed | Add `npx playwright install --with-deps chromium` before the e2e step. |
| `npm run test:e2e` fails locally with a port/server error | It builds and previews on **4321** and serves the sub-path fixture on **4322**; something else holds one of them | Free both ports (or stop the dev server) and re-run. On CI it previews the already-built `dist/`. |
| Every visual test suddenly red after committing baselines | Step 2 of §5.2 was done before step 1, or the PNGs were seeded on a laptop | Re-seed with the `Seed visual baselines` job on the CI runner; the snapshot filename pins `{platform}`, so a locally seeded PNG is not even the file CI looks for. |
| "My progress disappeared" / "it's empty on my other laptop" | `localStorage` is per-browser-profile, per-device, and never syncs | Not a bug — §7's support callout. Cleared site data, incognito and a **new domain** all present as a fresh device. |
| A reader sees no pips, no review cards, no trials | JavaScript is disabled (or blocked) in that browser | By design: every gamification component ships a `<noscript>` kill-switch, so no dead controls appear. Prose, code and navigation still work. |
| Security headers missing in production | The host does not read `public/_headers` | Expected on Vercel and GitHub Pages (§4.2/§6). On Cloudflare/Netlify, confirm the file reached `dist/` — it is copied verbatim from `public/`. |
| A replaced favicon or OG card keeps serving the old image | A CDN/browser/scraper cache, not the build | §6 keeps those unhashed assets on a 1-hour revalidating cache; purge the host cache if you cannot wait, and remember social scrapers keep their own copy. |
| A link, canonical or `<loc>` names `/about` and gets a 301 in production — or a hard **404** under `astro preview` | An internal URL authored without the trailing slash. `astro.config.mjs` sets `trailingSlash: 'always'`, so `/about/` is the only published form, and Astro's preview **refuses** the slashless one rather than redirecting it (measured: `/about` → 404) | Add the slash — on the **path**, before any `?query` or `#fragment`: `/glossary/#array`, never `/glossary#array/`. `tests/e2e/url-shape.spec.ts` fails on a slashless internal link, on a `<loc>` that is not served, and on a canonical that disagrees with the URL it was served at, so this shows up in the gate rather than in production. |
| Every URL 404s on `python -m http.server`, an S3 website endpoint or a default nginx | An old `format: 'file'` build (`about.html`), which needs a host that guesses `/about` → `about.html` | Rebuild: `build.format: 'directory'` emits `about/index.html`, which every one of those serves natively at `/about/`. That is what amendment U-1 changed. |
| Code-block comments look low-contrast | An old single-theme Shiki config | Already fixed — dual-theme (`github-light`/`github-dark-default`) in `astro.config.mjs`; don't revert it (WCAG AA). |

---

## Appendix — deployment facts at a glance

- **Framework/output:** Astro `output: 'static'` → `dist/` (prerendered HTML/CSS/JS), `build.format: 'directory'` + `trailingSlash: 'always'` — every page is `<route>/index.html` published at `/about/`, `/learn/binary-search/`. `dist/404.html` is the one file that stays at the root.
- **Build:** `npm run build` = `astro check && astro build && node scripts/portablize.mjs` (the pass that makes every internal URL document-relative — §2.2). **Install:** `npm ci`. **Node:** 24 via `.nvmrc` (floor ≥ 22.12.0 — Astro 7 will not build on Node 20).
- **Publish dir:** `dist` — on Workers it is `assets.directory` in `wrangler.jsonc`, not a dashboard field. **Server/adapter:** none. **Runtime secrets/env:** none. **Deploy-time secrets:** none in the committed topology (Workers Builds git integration); two Cloudflare secrets only in §5.3's Actions alternative.
- **Deploy config:** `wrangler.jsonc` (committed, §4.3) — `assets.directory: ./dist`, no `main`/`binding`, `html_handling: force-trailing-slash`, `not_found_handling: 404-page`. Its first job is to suppress `wrangler deploy`'s automatic configuration, which would install the forbidden `@astrojs/cloudflare` adapter.
- **Single build-time input:** **`SITE_URL`** — the full deployment URL, sub-path included — read in `astro.config.mjs` with no fallback chain. Unset, the build carries the sentinel `https://learndsa.invalid` (RFC 2606, can never resolve); unset on a **publishing builder** (`CF_PAGES`, `WORKERS_CI`, `NETLIFY` or `VERCEL` present) the build **throws**, naming the platform. `npm run rehost <url>` stamps a built `dist/` for hosts with no build step. Every declared URL is joined by `src/lib/deployment-url.ts` — never `new URL()`, which discards a sub-path (§2.1).
- **`base` is never set** — sub-path hosting comes from the post-build relative pass, and `base` would not deliver it (§2.2). `dist/404.html` is the one document that keeps root-absolute links, prefixed with the deployment's base path by whichever stamping path knows it.
- **Three limitations that ship with portability** (§2.4): a sub-path deployment's `robots.txt` is never read; `localStorage` is origin-scoped, so two deployments on one origin share progress; every deployment self-canonicalizes, so public mirrors compete in search.
- **Pages built:** 135 — home, `/learn/`, three course pages, `/glossary/`, `/about/`, 404, 127 lessons, and the prod-gated `/dev/renderers/`. **Sitemap:** 134 `<loc>` entries, all slashed (the 404 and the dev gallery are excluded and both carry `noindex`).
- **SEO artifacts (auto-generated):** `dist/sitemap.xml`, `dist/robots.txt`, per-page canonical/OG/Twitter, `Course`/`WebSite` JSON-LD. **OG card:** `public/og-source.svg` + `public/og-default.png`, both regenerated by `npm run og` from `scripts/build-og.mjs` — never hand-edited (§2.3).
- **Headers/caching:** `public/_headers` — security headers on `/*`, `immutable` on `/_astro/*`, 1-hour revalidating cache on the four unhashed root assets, host default on HTML. No CSP, for the reason in §6.
- **JS budget:** ≤ 60 KB gz per page, **enforced** by `tests/e2e/js-budget.spec.ts`, which prints the per-page figure on every e2e run. Renderer/algorithm chunks are lazy-loaded per lesson. **No runtime network calls.**
- **Client state:** `localStorage` only, keys enumerated in spec §6, **per-device with no sync** (§7). No cookies, no accounts, no analytics, no tracking.
