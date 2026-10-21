# Deployment Guide — LearnDSA

How to build and deploy LearnDSA to production. The site is a **fully static site, prerendered with React at build time** (an in-repo static-site generator on Vite — `scripts/vite-plugin-ssg.ts`) with **no backend, no server runtime, no database, and no runtime environment variables or secrets** — every page is HTML/CSS/JS emitted at build time into `dist/`, deployable to any static host.

> **Re-audited against the repo after M7 (UX overhaul) and M8 (mastery loop) shipped.** Every command, path and claim below was re-checked against the working tree and a built `dist/` rather than carried forward — §2.3 (the OG card), §3 (the gate and the shape of `dist/`), §5 (the workflow that is actually committed), §6 (`public/_headers`) and §7 (what M7/M8 added to the post-deploy list) all changed as a result. The one check that stays a manual judgement is Lighthouse (§7): there is no Lighthouse tooling in this repo.

> **Corrected again after Plan D stage D1 — the URL shape.** Every page is now published at a trailing-slash URL (`/about/`, `/learn/binary-search/`); the amendment and its reasoning are in `docs/redesign-2026-08/03-amendments.md` (U-1). §0, §2.2, §3.2, §3.3, §4.4, §7, §9 and the appendix were corrected against a real directory-format build.

> **Rewritten after Plan D stages D2 and D3 — the artifact is portable and the origin is a deploy-time input.** The model this document used to be organized around — *"the production origin is a build-time constant somebody has to remember to change"* — is gone, and with it the `CF_PAGES_URL` heuristic and the `PRODUCTION_URL` fallback that §2.1 described. Every internal URL in `dist/` is now document-relative, so one build runs at any origin **and any sub-path**; the only hostname left in the artifact is metadata, and it comes from one variable or from one command. §2.1 is new, §2.2 is corrected (the 404 now carries the deployment's base path), §2.4 is new, and §1, §3, §4, §5.3, §7, §9 and the appendix were re-checked against real command output rather than edited by hand. Every figure and every quoted message below was produced by running the thing.

> **Corrected after the 2026-08-24 production build — this project deploys through Cloudflare _Workers Builds_, not Cloudflare Pages.** The build log is unambiguous (`Executing user deploy command: npx wrangler deploy`, `Detected Project Settings: Worker Name: static-dsa, Framework: Astro`, and no `CF_PAGES` in the environment), and this document said "Pages git integration" throughout. Two failures followed and both are fixed in the repo: the unstamped-deploy guard keyed on `CF_PAGES` alone, so it did not fire and the build emitted the sentinel (`astro.config.mjs` now checks a list of four publishing platforms — §2.1); and `wrangler deploy`, finding no Wrangler config, **auto-configured the project** — installing the forbidden `@astrojs/cloudflare` adapter and relocating the build to `dist/client/`, which `scripts/portablize.mjs` threw on. **`wrangler.jsonc` is now committed** and its first job is to stop that from happening again (§4.3). The callout below, §0, §1, §2.1, §4.1–4.4, §5, §6, §7, §8, §9 and the appendix were corrected against the config, the build log and `npx wrangler@4 deploy --dry-run`.

> **Rewritten after the React migration (2026-10) — one origin, root-absolute URLs.** The site was rebuilt on React + Vite with the same product, and the portable artifact was retired on purpose (react-migration decision D-01): every internal URL is root-absolute again, there is no post-build relative pass, no `npm run rehost`, no `[data-site-root]` anchor and no sub-path hosting. `SITE_URL` is now the deployment's **origin alone** and a value with a path fails the build. The callout below, §0, §1, §2, §3, §4, §5, §6, §7, §9 and the appendix were rewritten against the React build; §2.2 and §2.4 (sub-path hosting and its three limitations) are retired and say so. The reasoning lives in `docs/migrations/react-migration-decisions.md`; the spec clauses it changed are listed in `docs/migrations/react-amendments.md`. The earlier history callouts above are kept as history — where they name `astro.config.mjs`, `portablize.mjs` or `rehost`, read them as the record of what came before.

> ### The one thing you must not skip — on a host that builds **and** publishes it is **mandatory**, not advisory
>
> **Add `SITE_URL` as a build variable on the Worker — dashboard → your Worker → _Settings_ → _Build_ → _Build variables and secrets_ — set to the deployment's origin** (e.g. `https://learndsa.dev` — no path). It is not optional and it is not a nicety:
>
> - **Without it the Workers Builds build FAILS.** `src/render/site-url.ts` throws when any of `CF_PAGES`, `WORKERS_CI`, `NETLIFY` or `VERCEL` is set and `SITE_URL` is not — by design, because the alternative is publishing 136 canonicals, 134 sitemap `<loc>`s and an OG card that all name a domain that cannot exist (§2.1). Workers Builds injects `WORKERS_CI`.
> - **Build variables and runtime variables are different lists on Workers.** *Settings → Variables and Secrets* is the **runtime** list, and this site reads no variable at runtime — putting `SITE_URL` there leaves the build failing exactly as before. Unlike Pages, Workers does not share one set between build and runtime.
> - **One value covers previews too.** `WORKERS_CI` is injected on non-production branch builds as well (they are off unless enabled in *Settings → Build → Branch control*), so the same build variable makes a preview canonicalize to production instead of competing with it in search.
> - **Moving to a custom domain is now this one dashboard edit plus a redeploy** — there is no origin in the repo to update, and nothing to rebuild by hand.
>
> **The caveat that used to say "an omission ships the sentinel silently" now applies only to hosts _outside_ that list of four** — GitHub Actions above all (§4.4, §5.3). There is no longer a way to stamp a built artifact afterwards: a host with no build step takes a `dist/` built with `SITE_URL` set (§4.5).

---

## 0. Recommended mechanism (DevOps recommendation)

**Primary: Cloudflare Workers with static assets, built and deployed by Workers Builds from the git integration, with GitHub Actions running the full DoD gate on every push and PR. Runner-up: Netlify** (near-identical fit — pick it if you're already in that ecosystem). §4 documents every host generically; this is the recommended pick for *this* repo, and two facts in the repo drive it:

1. **`public/_headers` already exists** — that format is honored by **Cloudflare (Workers static assets and Pages alike) and Netlify**; Vercel and GitHub Pages silently ignore it, so the security headers this project ships would not take effect there.
2. **The directory layout** (`<route>/index.html`, every page path ending in `/`) publishes every page at a slash URL (`/about/`, `/learn/binary-search/`) — the one shape *every* static host serves natively, plain ones included. This used to be the second reason to prefer Cloudflare/Netlify (`format: 'file'` needed a host that resolves `/about` → `about.html`); it is **no longer a differentiator at all**, so the tiebreak now rests on point 1 and on bandwidth. See amendment U-1 in `docs/redesign-2026-08/03-amendments.md`.

**None of this is a lock-in.** The artifact names its origin only in metadata (§2.1), so changing host is a rebuild with a different `SITE_URL`, not a migration. It must be served at the **root** of that origin. Pick on headers and bandwidth, not on switching cost.

Cloudflare wins the tiebreak over Netlify on **unlimited free bandwidth** — ideal for an educational site that may get bursty traffic — at **$0**. **Within Cloudflare, Workers rather than Pages is also Cloudflare's own recommendation:** its Workers best-practices guidance says Workers Static Assets is the recommended way to deploy static sites, that new projects should use Workers instead of Pages, and that Pages continues to work but new features and optimizations are focused on Workers. For a purely static site that means pointing `assets.directory` at the build output and shipping no Worker script — exactly what `wrangler.jsonc` does (§4.3). Explicitly **not** recommended for this workload: Kubernetes/containers, Terraform/Bicep/IaC, an SSR adapter, or S3+CloudFront — there is no server, state, or runtime secret, so heavier infra adds cost and attack surface with zero benefit.

> ### ✅ Current setup: Cloudflare **Workers Builds** (git integration)
>
> The **Worker `static-dsa`** is connected directly to the GitHub repo, so **Cloudflare builds and deploys itself on every push to the production branch**. Workers Builds runs the build command and then the deploy command, which is `npx wrangler deploy` — that is what the 2026-08-24 build log shows, and it is why this section no longer says "Pages". Consequences:
>
> - **`wrangler.jsonc` is committed and must stay committed** (§4.3). Without it `wrangler deploy` auto-configures the project around a server the site does not have (on 2026-08-24 it installed an Astro adapter and broke the build); with it, the deploy is a plain static-asset upload of `dist/`.
> - **The committed workflow is the gate in §5.1** (`.github/workflows/ci.yml`) — it runs lint/format/unit/e2e, which Cloudflare's build does *not*, and it deliberately deploys nothing.
> - **Do NOT add a second deploying workflow** — §5.3's Actions+Wrangler pipeline is an alternative topology, and running it alongside the git integration would publish the site twice per push.
> - **Make `DoD gate` a required status check on `main`.** Without branch protection, Cloudflare will happily deploy a commit whose gate is red: the two systems are independent (§5.1).
> - Domain is the Worker's free `*.workers.dev` subdomain (`static-dsa.<your-subdomain>.workers.dev`) until a custom one is added — `wrangler.jsonc` sets neither `workers_dev` nor `routes`, and that default is enabled. No registration, TLS included.
> - Dashboard build settings (*your Worker → Settings → Build*): build command `npm run build`, deploy command `npx wrangler deploy`, production branch `main`, Node from `.nvmrc` (or `NODE_VERSION=24`), and **`SITE_URL` under _Build variables and secrets_** — the build fails without it (§2.1), which is the one dashboard setting this project cannot ship without.

---

## 1. Prerequisites

| Requirement | Value | Notes |
|---|---|---|
| Node.js | **24** (floor: **≥ 22.12.0**) | Pinned in `.nvmrc` — the single source of truth read by the Workers Builds build image *and* `actions/setup-node`. `package.json` `engines` states the floor (Vite 8 requires a current Node 22 or 24); do not lower it. |
| Package manager | **npm** | Commit-tracked `package-lock.json`; use `npm ci` in CI for reproducible installs. |
| Build output | `dist/` | Static files; gitignored. This is the "publish directory" every host asks for. |
| Server/adapter | **none** | Pure static. Do **not** add an SSR adapter or a Worker script — React renders every page at build time and nothing runs on the server. `wrangler.jsonc` is committed partly to stop `wrangler deploy` from auto-configuring one on your behalf (§4.3). |
| Runtime env vars / secrets | **none** | Nothing to configure in a secrets manager; the shipped site reads no variable at all. |
| Build-time variables | **`SITE_URL`** (one) | The deployment's origin, no path. **Required on Cloudflare Workers Builds** — and on Cloudflare Pages, Netlify and Vercel, which the same guard covers; the build throws without it, and throws on a value with a path anywhere (§2.1). Optional for a local or CI build that publishes nothing: an unset build carries the sentinel `https://learndsa.invalid`. (`LDSA_OUT` relocates `dist/` and `.build/` for parallel local builds; it is a developer convenience, never set on a host.) |
| Browsers (tests + OG card only) | Playwright Chromium | Needed by `npm run test:e2e` and by `npm run og`, which rasterizes the OG card with it (§2.3): `npx playwright install --with-deps chromium`. **Not** needed to build or serve the site. |

---

## 2. Pre-deploy configuration (required)

### 2.1 The deployment URL — one input, supplied at build time

There is **no production origin in this repository**. `src/render/site-url.ts` reads one variable and has no fallback chain, no branch heuristic and nothing to keep up to date:

```ts
const SENTINEL = 'https://learndsa.invalid';
const site = env.SITE_URL || SENTINEL;   // an origin; a path, query or fragment throws
```

**Why that is enough — two classes of URL, and only one of them needs an origin at all:**

| Class | What it is | Where it comes from |
|---|---|---|
| **Navigational** — links, scripts, styles, fonts, icons | `/glossary/#array`, `/assets/site-HASH.css` | **no origin, ever.** Every one is root-absolute, written that way in the source and emitted unchanged; `scripts/verify-dist.mjs` fails the build if one does not resolve to a file in `dist/` |
| **Declared** — what a page says about *itself* | `<link rel="canonical">`, `og:url`, `og:image`, `twitter:image`, sitemap `<loc>`, robots' `Sitemap:` line, `Course`/`WebSite` JSON-LD `url` | `SITE_URL`, joined by the single builder `src/lib/deployment-url.ts` |

Declared URLs cannot be relative — the sitemap protocol and every OG scraper require absolute ones — so the artifact carries exactly **one hostname, in metadata only**, and knows it is a placeholder until it is told otherwise.

> **Why the origin alone.** Navigation is root-absolute, so the site works only at the root of its origin. A `SITE_URL` such as `https://sample.com/learndsa` would publish canonicals under `/learndsa/` that the page's own links contradict, so the build refuses it:
>
> ```
> SITE_URL "https://sample.com/learndsa" carries a path, query or fragment. The site deploys at the root of one
> origin (React migration D-01): set SITE_URL to the origin alone, e.g. https://sample.com.
> ```
>
> Every declared URL still goes through `deploymentUrl(site, path)` (`src/lib/deployment-url.ts`), which strips a stray `(/index)?.html` and puts the trailing slash on directory paths while leaving `/og-default.png` and `/sitemap.xml` alone. `tests/unit/deployment-url.test.ts` and `tests/unit/site-url.test.ts` are where both are tested.

**Supplying it:** set `SITE_URL` on the host's build and build. The bytes the host publishes are the bytes the build produced; there is nothing to stamp afterwards.

```bash
SITE_URL=https://learndsa.dev npm run build
```

#### The sentinel, and what a leak looks like

An unstamped build carries **`https://learndsa.invalid`**. `.invalid` is reserved by RFC 2606 and can never resolve, so a placeholder that escapes is unmistakable in a grep and inert in the wild — unlike a stale real domain, which is a working link to somebody else's site. A local `npm run build` and the GitHub-Actions gate both build the sentinel artifact deliberately: neither publishes, and the e2e suite asserts paths, not hosts.

You have leaked it if any of these show `learndsa.invalid` **on a deployed site**: a page's `<link rel="canonical">` or `og:url`, `og:image`/`twitter:image`, a sitemap `<loc>`, robots' `Sitemap:` line, or a JSON-LD `url`. Nothing breaks for a reader — every link on the page is root-absolute and works — but every crawler and every link preview is told the site lives at a domain that does not exist. See §9 for the fix per host.

#### The hard-fail rule: a publishing build without `SITE_URL`

`src/render/site-url.ts` keeps a `PUBLISHING_BUILDERS` list — platforms that **build and publish**, each identified by a variable it sets on its own builders and nowhere else:

| Variable | Platform |
|---|---|
| `CF_PAGES` | Cloudflare Pages |
| `WORKERS_CI` | Cloudflare Workers Builds |
| `NETLIFY` | Netlify |
| `VERCEL` | Vercel |

If one of those is present and `SITE_URL` is not, the build **fails** rather than publishing the sentinel, naming the platform it detected:

```
SITE_URL is not set on a Cloudflare Workers Builds build. Every canonical, og:url, sitemap <loc> and JSON-LD url
would ship the unstamped sentinel https://learndsa.invalid. Set SITE_URL to the deployment's origin
(e.g. https://learndsa.dev), as a build variable for BOTH the production and preview environments —
see docs/deployment.md §2.1.
```

It fires when the prerenderer resolves the site URL, before any page is written. It fires on **preview / non-production branch** builds too, because these variables are set for those as well — which is why one project-wide `SITE_URL` is the right answer, and why a preview then canonicalizes to production instead of competing with it.

> **This list is the fix for a real incident (2026-08-24).** It read `CF_PAGES` alone — Cloudflare *Pages* — while this project deploys through Cloudflare *Workers Builds*, which injects `WORKERS_CI` (alongside `CI`, `WORKERS_CI_BUILD_UUID`, `WORKERS_CI_COMMIT_SHA` and `WORKERS_CI_BRANCH`). The guard written to stop exactly this did not fire: the build succeeded and emitted `https://learndsa.invalid`, and only an unrelated downstream failure kept it off the internet. `tests/unit/site-url.test.ts` pins all four rows, so adding a host is one line and deleting one fails the unit suite.

**The gap that remains is hosts outside that list.** GitHub Actions sets none of the four, so nothing stops it building a sentinel artifact and deploying it successfully — §4.4 and §5.3 each carry the `SITE_URL` line that closes that gap for its topology.

#### Verify

```bash
SITE_URL=https://your-domain npm run build

# 1. Distinct origins in the built HTML/CSS/JS. Expect: your deployment origin
#    (or https://learndsa.invalid on an unstamped local build), https://schema.org
#    (JSON-LD @context), http://www.w3.org (SVG namespaces) and possibly
#    https://tailwindcss.com (a CSS source comment). Anything else — a localhost,
#    a preview URL, a stale domain — is a bug.
grep -rhoE 'https?://[a-zA-Z0-9.-]+' --include=*.html --include=*.js --include=*.css dist/ \
  | sort | uniq -c | sort -rn

# 2. Nothing may name the sentinel on a build you will publish.
grep -rl 'learndsa\.invalid' dist/ || echo 'clean'

# 3. Spot-check the two places a wrong deployment URL hurts most.
grep -o '<link rel="canonical"[^>]*>' dist/index.html dist/learn/binary-search/index.html
grep -o '<meta property="og:image"[^>]*>' dist/index.html
```

### 2.2 Sub-path hosting — retired

The site deploys at the **root of one origin**. The post-build relative pass (`scripts/portablize.mjs`), `npm run rehost`, the `[data-site-root]` anchor and the sub-path e2e project were retired with the React migration (decision D-01, amendment R-6 in `docs/migrations/react-amendments.md`). A sub-path deployment (`https://user.github.io/repo/`, `https://example.com/learndsa`) is no longer supported: every internal link is root-absolute and would point at the origin root, and the build rejects a `SITE_URL` with a path. To host under someone else's domain, give the site its own subdomain instead.

### 2.3 The OG card — generated, not a placeholder (nothing to do before launch)

**This is done.** M7.3 replaced the old solid-indigo placeholder with a branded 1200×630 card **generated from the real renderer**, so no step here blocks a deploy. Two files ship, both committed:

| File | What it is |
|---|---|
| `public/og-source.svg` | the **reviewable source of the PNG** — a 1200×630 card whose visualization frame is `ArrayRenderer.renderStatic()`'s own output, so the card cannot drift from the product. This is the file to read in a diff |
| `public/og-default.png` | the raster every page's `<head>` (`src/render/Document.tsx`) links as `og:image`/`twitter:image` (scrapers do not render SVG), screenshotted from that SVG |

Both are **outputs** of `scripts/build-og.mjs` — the script is the actual source of truth.

**Never hand-edit either file.** Both are outputs of `scripts/build-og.mjs`; a hand-tweak is overwritten by the next regeneration and, worse, re-opens the failure that motivated the script — a hand-drawn card advertising a visualization the site does not actually render (CLAUDE.md's standing "never hand-mock the product" rule).

To change the card, edit `scripts/build-og.mjs` and regenerate:

```bash
npm run og      # = node --experimental-transform-types scripts/build-og.mjs
```

- **Not wired into `npm run build`** — on purpose. The build stays fast and browser-free; the card changes about as often as the logo.
- **Needs Playwright's Chromium** (already a devDependency) to rasterize the SVG: `npx playwright install chromium` if the binary is missing. No new package.
- The script asserts the PNG's own IHDR reads 1200×630 before reporting success, so a silently mis-sized card cannot ship.
- **One reproducibility caveat:** the card is rasterized by the generating machine's Chromium, so its lettering follows that machine's font rendering. Regenerating on a different OS can re-letter it — review the SVG diff, not just the PNG.

Verify the result renders in a real link preview after deploy (§7), not just locally: scrapers fetch the absolute `og:image` URL, which is a declared URL and therefore depends on §2.1's deployment URL — an unstamped artifact advertises a card at `https://learndsa.invalid/og-default.png`, and no scraper can fetch that.

### 2.4 The portable artifact's three limitations — retired with it

The three accepted limitations this section used to list (a sub-path `robots.txt` that is never read, two deployments on one origin sharing `localStorage`, public mirrors competing in search) were consequences of sub-path hosting and left with it. Two general facts remain true of any deployment and are covered where they belong: `localStorage` is origin-scoped (§7's support callout), and two public copies of the same content on different origins still compete in search, because each canonicalizes to itself.

---

## 3. Build and verify locally

### 3.1 The Definition-of-Done gate

All six checks must be clean before every deploy — this is spec §18, and it is exactly what CI runs (§5):

```bash
npm ci                              # clean, lockfile-exact install
npm run build                       # tsc --noEmit + vite build (client, SSR, prerender) + verify-dist → dist/
npm run lint                        # ESLint
npm run format:check                # Prettier
npm run test                        # Vitest unit suite (node env — no DOM, no localStorage)
npm run validate:content -- --strict  # the lesson content gate
npm run test:e2e                    # Playwright + axe (needs: npx playwright install chromium)
```

`npm run build` is `tsc --noEmit -p tsconfig.json && vite build && node scripts/verify-dist.mjs` — **type errors fail the build**, which is intended (it's a real gate, not just an editor nicety). `vite build` builds the client assets, then the SSR bundle, then prerenders every route into `dist/`; `verify-dist.mjs` then fails the build if any internal `href`/`src` does not resolve to a file in `dist/`, if a page lacks exactly one `<h1>`, one `<main id="main">` and one canonical, if an Astro remnant (`data-astro`, `astro-island`, `/_astro/`) survives, or if the sentinel ships on a publishing builder. It prints a one-line summary on every build; read that rather than trusting a figure copied into a document.

Three things about the suites a deployer should know before reading a run:

- **`npm run test:e2e` builds and previews first, locally**, so it needs **port 4321 free** and takes a few minutes. `npm run preview` is `scripts/serve-dist.mjs`, a deliberately dumb `node:http` host (no extension guessing, no redirects, `404.html` with a 404 status for anything unmatched). On CI it skips the rebuild (the gate has already built) and the server refuses to start if `dist/` is missing — see `playwright.config.ts`. `PW_PORT` and `PW_DIST` point the suite at another port and build.
- **The JS budget is enforced, not remembered.** `tests/e2e/js-budget.spec.ts` gates every page at **120 KB gz** on two figures — EAGER (the scripts the HTML loads plus their static imports) and FULL (EAGER plus every chunk the page's React islands load on activation, React included, from `.build/page-manifest.json`) — and prints the per-page table on every run, so read *that* for the current number rather than trusting a figure copied into a document (this one included).
- **The pixel baselines skip until seeded.** `tests/e2e/baseline-visual.spec.ts` holds 14 captures that are inert unless `VISUAL_BASELINE` is set and PNGs are committed (§5.2). A green e2e run therefore says nothing about pixels; the aria/DOM baselines (`baseline-aria.spec.ts`) run unconditionally.

Preview the production build exactly as it will ship:

```bash
npm run preview        # serves dist/ locally, defaults to http://localhost:4321
```

### 3.2 What a correct `dist/` looks like

The prerenderer emits routes as **directories, not files** — `about/index.html` served at `/about/` — and that slash URL is the only form the site publishes (amendment U-1; the route table is `src/routes.tsx`). Expect exactly:

```
dist/
├─ index.html                   the home page, served at /
├─ 404.html                     stays at the ROOT, because a 404 is not a page with an
│                               address; Workers serves it for every unknown URL
├─ about/index.html  glossary/index.html  learn/index.html
├─ learn/<course>/index.html    × 3 courses
├─ learn/<slug>/index.html      × 127 lessons
├─ dev/renderers/index.html     dev-only gallery — prod-gated, noindex, no renderer JS
├─ sitemap.xml  robots.txt      134 <loc>: 4 static + 3 courses + 127 lessons, every one slashed
├─ favicon.svg  favicon-32.png  apple-touch-icon.png
├─ og-default.png  og-source.svg
├─ fonts/                       the two committed IBM Plex subsets, preloaded by every page
├─ _headers                     consumed by the host, never served (§6)
└─ assets/                      content-hashed CSS + JS chunks (Vite)

.build/                         beside dist/, never deployed: the SSR bundle, Vite's manifest
                                and page-manifest.json (per-page chunk lists for the JS budget)
```

### 3.3 Pre-deploy audit of the built output

Cheap greps that catch the mistakes that are expensive to catch in production. Run them on a fresh `dist/`:

```bash
# No unexpected origin in the build (see §2.1 for the expected list). On an
# unstamped build the site's own entry is https://learndsa.invalid — that is the
# sentinel, and it must NOT be there on anything you deployed.
grep -rhoE 'https?://[a-zA-Z0-9.-]+' --include=*.html --include=*.js --include=*.css dist/ | sort -u

# Every internal link is root-absolute — no ./ or ../ anywhere. Expect no output.
grep -rhoE '(href|src)="\.\.?/[^"]*"' --include=*.html dist/ | head

# The 404 must not be indexable, and the dev gallery must not be either.
grep -o '<meta name="robots"[^>]*>' dist/404.html dist/dev/renderers/index.html

# No runtime network calls anywhere in the shipped JS (spec §4). Expect no output.
grep -rlE '\bfetch\(|XMLHttpRequest|navigator\.sendBeacon' dist/assets/

# Sitemap: 134 URLs, all on your origin, and NO /dev/renderers entry.
grep -c '<loc>' dist/sitemap.xml && grep -c 'dev/renderers' dist/sitemap.xml   # → 134, then 0
```

> **The URL shape needs no grep here** — `tests/e2e/url-shape.spec.ts` (part of `npm run test:e2e`, §3.1) asserts it against the running preview: every page's canonical and `og:url` match the URL it is served at, every `<loc>` returns 200 with no redirect hop, no built page links to a slashless page URL, and every internal `href`/`src` in every page, `404.html` included, is root-absolute and resolves to a file in `dist/`. A missing trailing slash is a red suite, not a manual check.

> **Static hosting needs no grep either** — `tests/e2e/static-hosting.spec.ts` serves the build the way Workers does and proves a deep link loads and reloads, back/forward walk lessons as documents, an unknown URL gets the 404 page with a 404 status, a slashless page URL is not served, and every stylesheet, script, font and icon a lesson requests (islands activated) returns 200. To check a build by hand before a deploy: `npm run build && npm run preview`, then `npx playwright test tests/e2e/url-shape.spec.ts tests/e2e/static-hosting.spec.ts`.

> **`/dev/renderers`:** the developer-only renderer gallery is **prod-gated** (`import.meta.env.DEV`) — in a production build none of its islands render, so no renderer chunk is referenced, and it is excluded from the sitemap. It carries `<meta name="robots" content="noindex">`, which is the right control: a `robots.txt` `Disallow` would *stop* crawlers reading that tag and can leave a URL-only entry in the index. Leave `robots.txt` alone.

---

## 4. Host-specific deployment

Every host that builds uses the same three settings: **build command `npm run build`**, **publish/output directory `dist`**, **Node 24** — plus **`SITE_URL`**, the deployment's origin (§2.1). Hosts that do not build (§4.5) take a `dist/` built elsewhere with `SITE_URL` set. Pick one.

**Every host serves the site at the root of an origin** — a custom domain, a platform subdomain, or a GitHub Pages user/org site. Sub-path deployments are not supported (§2.2).

### 4.1 Netlify

**Dashboard:** New site → connect the repo →
- Build command: `npm run build`
- Publish directory: `dist`
- Environment: `NODE_VERSION = 24`, `SITE_URL = https://your-domain` (the origin)

Or commit **`netlify.toml`** at the repo root:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "24"
  SITE_URL = "https://your-domain"   # the deployment's origin, no path (§2.1)
```

> **Netlify sets `NETLIFY`, which §2.1's guard now covers.** Omit `SITE_URL` and the build **fails** with `SITE_URL is not set on a Netlify build` — it does not quietly deploy an artifact whose every canonical, `og:url` and `<loc>` names `https://learndsa.invalid`. (Before 2026-08-24 the guard listed `CF_PAGES` alone and this note said the opposite.) The post-deploy check is still one line in §7.

**No `[[headers]]` block is needed** — Netlify reads the committed `public/_headers` (§6), which already carries the security headers, the immutable `/assets/*` rule and the short-cache rules for the unhashed icons/OG card. Duplicating them in the TOML gives you two sources of truth for the same headers.

Netlify auto-serves `404.html` for unknown routes. No redirects needed for this static site.

### 4.2 Vercel

**Dashboard:** Import the repo:
- Framework preset: **Other** (the build is `npm run build`; do not let a Vite or framework preset change the output directory)
- Build command: `npm run build` (override if the preset differs)
- Output directory: `dist`
- Node version: **24** in Project Settings → General (§1).
- Environment variable: `SITE_URL` = the deployment's origin (§2.1). Vercel sets `VERCEL`, which the guard covers, so an omission **fails the build** (`SITE_URL is not set on a Vercel build`) rather than shipping the sentinel silently.

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
>       "source": "/assets/(.*)",
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
- Build variable: **`SITE_URL` = the deployment's origin. This one is mandatory — the build throws without it (§2.1), and that is deliberate.** It is also the only thing to change when a custom domain is added: edit the variable, redeploy, done.

There is **no build output directory setting** — the assets directory is `wrangler.jsonc`'s, and `wrangler deploy` reads it. Note that on Workers, *Settings → Build → Build variables and secrets* and *Settings → Variables and Secrets* are two different lists: the second is runtime-only, and this site reads nothing at runtime.

#### `wrangler.jsonc` — committed, and its first job is to exist

Deleting this file reintroduces both 2026-08-24 failures, so read its header comment before touching it.

**Why it exists at all.** With no Wrangler config in the repo, `wrangler deploy` (4.68+, now GA) runs **automatic configuration**: it detects the framework, installs an adapter, rewrites the build config, adds package scripts, edits `.gitignore` and rebuilds. On 2026-08-24, against the Astro build, that meant the `@astrojs/cloudflare` adapter and a static output relocated to `dist/client/`, which broke the production build. This site has no server — the React build writes static files to `dist/` and nothing else — and a committed config suppresses all of it.

**What each key is for:**

| Key | Value | Why |
|---|---|---|
| `name` | `static-dsa` | the Worker's name, and therefore its `*.workers.dev` hostname |
| `compatibility_date` | `2026-08-25` | one of the two mandatory fields in a Worker config (with `name`). An assets-only Worker runs no code that depends on it, but it must be a pinned date rather than an implicit "today" |
| `assets.directory` | `./dist` | the build output, uploaded as static assets. **No `main` and no `binding`** — there is no Worker script, and the `binding` key is only valid alongside `main` |
| `assets.html_handling` | `force-trailing-slash` | pairs with the build's directory layout (`about/index.html`), so `/about` 301s to `/about/` and the URL every canonical and every sitemap `<loc>` names is the URL that is served |
| `assets.not_found_handling` | `404-page` | **Workers does not infer this the way Pages did.** The default is `none`, which answers a bare 404 and never reaches `dist/404.html` — the site's own 404 page is dead without this line |

Verified on the Astro build with `npx wrangler@4 deploy --dry-run` (the config is accepted and no automatic configuration is triggered). The React build keeps the same layout — directory pages, a root `404.html`, `dist/` as the assets directory — so the two handling keys behave identically; re-run the dry run after any change to the output layout.

**`public/_headers` needs no change.** `_headers` and `_redirects` are supported natively by Workers static assets, exactly as they were on Pages; the file is copied verbatim into `dist/`, consumed by the host and never served as a public URL — see §6 for what it sets and why.

#### Cloudflare Pages

Pages still works and is still a valid target for this artifact — Cloudflare's guidance is that it continues to be supported while new work goes to Workers (§0). If you deploy there instead: Framework preset **None**, build command `npm run build`, build output directory `dist`, `NODE_VERSION = 24`, and **`SITE_URL` on BOTH the Production and Preview environments** (`CF_PAGES` is set on both, and the §2.1 guard covers it). Pages serves `404.html` for not-found routes automatically, so it needs no equivalent of `not_found_handling`. `wrangler.jsonc` carries no `pages_build_output_dir`, which is the key that makes a Wrangler file drive a Pages project's configuration, so it does not govern a Pages deployment — configure that one from the dashboard.

### 4.4 GitHub Pages (via GitHub Actions)

GitHub Pages needs a build step (it won't run `npm run build` for you). Use the official Pages Actions.

> **Only a user/org site or a custom domain works** — `https://user.github.io/` or `https://your-domain`. A *project* site (`https://user.github.io/repo/`) serves under `/repo/`, which is a sub-path, and sub-path hosting is retired (§2.2): every root-absolute link would leave the deployment. Give a project site a custom domain instead.

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
          # The deployment's origin (§2.1). GitHub Actions sets none of the
          # four variables §2.1's guard watches, so omitting this does NOT fail
          # the build; it ships https://learndsa.invalid to a live URL.
          SITE_URL: https://user.github.io
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

> **GitHub Pages ignores `public/_headers` and offers no way to set response headers**, so every security header and both cache rules in §6 are silently lost. That is why §0 does not recommend it for this repo.

### 4.5 A plain static server (nginx, S3, Apache, `python -m http.server`, an offline copy)

No build step on the host, no configuration, no extension guessing. Build once with the origin it will be served at, then copy the folder to the **root** of that origin.

```bash
SITE_URL=https://your-domain npm run build
rsync -a dist/ user@host:/srv/www/learndsa/    # the web root for https://your-domain/
```

- **Nothing needs rewriting server-side.** Every page is `<route>/index.html` and every internal URL is root-absolute, so a default nginx `root`, an S3 website endpoint and `python -m http.server` all serve it correctly with no rules, no redirects and no `try_files` gymnastics. `npm run preview` is exactly this kind of host, and `tests/e2e/static-hosting.spec.ts` exercises it on every run (§3.3).
- **The one thing worth configuring is the 404 page.** These hosts do not serve `dist/404.html` automatically: nginx wants `error_page 404 /404.html;`, and an S3 website endpoint takes an "Error document" of `404.html`. Without it a mistyped URL gets the server's own bare 404 — a cosmetic loss, not a broken site.
- **Headers (§6) are yours to set**, since `public/_headers` is a Cloudflare/Netlify format. The security headers and the `immutable` rule on `/assets/*` are worth reproducing in the server config; nothing breaks without them.
- **A slashless URL 404s on most of these hosts** rather than redirecting (Workers' `html_handling` redirects it). No internal link is slashless — `url-shape.spec.ts` guarantees that — so this only affects a reader who types one.

---

## 5. Continuous integration — what is actually committed

### 5.1 `.github/workflows/ci.yml` — the DoD gate (committed, in use)

Workers Builds builds and deploys every push to `main` from the git integration (§0), but its build only type-checks, builds and verifies the output. This workflow runs the checks Cloudflare does not — **lint, format, unit tests, the strict content validator and the Playwright/axe e2e suite** — and it deliberately **does not deploy**: a Wrangler step here would publish the site twice. Read the file itself for the full reasoning; its shape is:

| Piece | Value | Why |
|---|---|---|
| Triggers | `push` to `main`, every `pull_request`, and `workflow_dispatch` | the manual trigger exists for the seeding job in §5.2. The gate carries no event filter, so a manual dispatch runs it too — which is what proves the commit you are seeding from is green |
| Node | `node-version-file: .nvmrc` | one source of truth, shared with Cloudflare. Never a hardcoded `node-version:` that can drift from the file |
| Concurrency | `ci-${{ github.ref }}-${{ github.event_name }}` | a newer push supersedes an in-flight run of the same ref; the event is in the key so a seeding run and a push to the same branch never cancel each other |
| Permissions | `contents: read` (workflow-level) | least privilege — this workflow only reads the repo. Artifact upload/download is unaffected: those actions authenticate with the runtime token, not `GITHUB_TOKEN` |
| Timeouts | 30 min (gate) / 20 min (seed) | a hung browser or wedged preview server fails in minutes instead of burning the 6-hour default |
| Container | `mcr.microsoft.com/playwright:v1.61.1-noble` | pins the rendering environment the pixel baselines were seeded in, and ships the browsers, so there is no `playwright install` step |
| Steps | `npm ci` → `npm run build` → `npm run lint` → `npm run format:check` → `npm run test` → `npm run validate:content -- --strict` → `npm run test:e2e` (`VISUAL_BASELINE=1`) | spec §18's six checks, in order |
| On failure | uploads `playwright-report/` + `test-results/`, 7-day retention | the HTML report embeds the `on-first-retry` traces, screenshots and video, so a red run is diagnosable without a local repro |

**The gate sets no `SITE_URL` and that is deliberate.** It builds the sentinel artifact (§2.1) because it deploys nothing and because the suite asserts *paths*, not hosts. Nothing in CI needs a real origin.

**Make `DoD gate` a required status check on `main`** (Settings → Branches → branch protection) and require a PR review. That is the only thing standing between a red commit and the branch Cloudflare deploys — the workflow cannot block a deploy it does not perform.

### 5.2 Turning the pixel baselines on (two steps, in this order)

`tests/e2e/baseline-visual.spec.ts` holds 14 screenshot comparisons that **skip unless `VISUAL_BASELINE` is set**. The PNGs are committed and the gate sets the flag, so this is the procedure for **re-seeding** after an intended visual change. The `Seed visual baselines` job (manual dispatch only) does it:

1. **Seed.** Actions → CI → *Run workflow*, from a commit whose `DoD gate` is green. Download the `visual-baselines` artifact, review the PNGs like any other reviewed artifact, and commit them to `tests/e2e/baseline-visual.spec.ts-snapshots/`.
2. **The gate already compares them** (`VISUAL_BASELINE: '1'` on its `npm run test:e2e` step).

`playwright.config.ts` sets `updateSnapshots: 'none'` on CI, so a missing baseline is a failure rather than a silent regeneration. The job must run **in the pinned container**, not on a laptop's own browser: even with the self-hosted IBM Plex subsets, glyph rasterization and fallback fonts are machine-specific, and the snapshot filename pins `{platform}`.

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
      - run: npm run build       # tsc + vite build (client, SSR, prerender) + verify-dist → dist/
        env:
          SITE_URL: ${{ vars.SITE_URL }}   # the deployment's origin — nothing else supplies it here
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
| `/assets/*` | `Cache-Control: public, max-age=31536000, immutable` | Vite fingerprints every file here (`ArrayRenderer-zPEiTlER.js`), so a given name's bytes never change. Safe to cache forever, and it is where nearly all the page weight lives |
| `/favicon.svg`, `/favicon-32.png`, `/apple-touch-icon.png`, `/og-default.png` | `Cache-Control: public, max-age=3600, must-revalidate` | **unhashed and path-stable** — the `<head>` and every link-preview scraper reference these by fixed name, so they *survive* a rebrand. Immutably caching them would keep serving a replaced icon or a stale OG card out of every visitor's cache indefinitely. An hour of freshness, then an ETag revalidation (a 304, so effectively free) |
| HTML | *(nothing — host default)* | pages reference the current asset hashes and change on every content edit, so they must revalidate |

Two deliberate omissions, both documented in the file itself so nobody "fixes" them:

- **No `Cache-Control` on the `/*` rule.** A catch-all would also match `/assets/*`, and hosts differ in how they resolve two matching rules that set the same header. The failure mode — a merged `max-age=0` winning over the immutable rule — silently defeats asset caching, which is the one caching decision on this site that matters. Per-path rules keep the question from arising.
- **No Content-Security-Policy.** Every page ships a pre-paint inline theme script (`src/render/Document.tsx`) (it must run before first paint or the page flashes the wrong theme) and an inline `<style>` inside `<noscript>`. A static host cannot mint a nonce, a hash list would need regenerating on every build with no hook to do it, and `'unsafe-inline'` is a CSP that permits exactly what a CSP exists to stop. Revisit only if the inline script can be removed without reintroducing the flash.

`sitemap.xml` and `robots.txt` are plain static files at the root and are left on the host default — they are fetched by crawlers, not by every page load.

---

## 7. Post-deploy verification

The e2e suite already proves the behavior against a local build; this list is for the things only a **real origin, a real CDN and a real browser** can prove. Run it after the first deploy, and after any domain change.

**Origin, SEO and social**

- [ ] **No sentinel survived.** `curl -s https://your-domain/ | grep -c learndsa.invalid` → **0**, and the same for `/sitemap.xml`. One `curl` is the whole check, and it is the first thing to run: a page full of `https://learndsa.invalid` looks perfect to a reader and tells every crawler the site lives at a domain that cannot exist (§2.1).
- [ ] **Canonical/OG name the deployment:** view-source on the home + a lesson → `<link rel="canonical">`, `og:url` and `og:image` all carry your domain. (The *path* half — canonical == the URL it was served at — is already covered by `url-shape.spec.ts`; only the origin is deploy-specific.)
- [ ] **Sitemap:** `https://your-domain/sitemap.xml` lists **134 URLs** — 4 static routes, 3 course pages and 127 lessons — every `<loc>` under your deployment URL, **trailing-slashed** (`/learn/binary-search/`), and **no `/dev/renderers`**. Click one: it must return 200 directly, not a redirect.
- [ ] **Robots:** `https://your-domain/robots.txt` → `Allow: /` plus a `Sitemap:` line on your domain.
- [ ] **404:** a bad URL (try one two levels deep, e.g. `/learn/no-such-lesson/`) serves the friendly, styled page with a **404 status**, and it carries `<meta name="robots" content="noindex">`. `/dev/renderers` does too.
- [ ] **The site actually navigates on the real CDN.** Load the home page, click through to `/learn/`, open a lesson, use the visualizer. Then check DevTools → Network for 404s: a stylesheet, font or lazily imported chunk that fails to load does not throw — it fails quietly and the page merely looks wrong. (`tests/e2e/static-hosting.spec.ts` checks this against the preview server; this is the same check against the real host.)
- [ ] **The OG card renders in a real link preview.** Paste the home URL into whatever your audience uses (Slack, X, LinkedIn, Discord) and confirm the branded 1200×630 card appears — not a blank frame or a cropped logo. This is the one §2.3 check a local build cannot make: scrapers fetch the **absolute** `og:image` URL over the public internet. If a scraper shows a stale card after regenerating, that is its own cache, not yours (§6 keeps the asset revalidating hourly).
- [ ] **Headers actually arrived:** `curl -sI https://your-domain/ | grep -i 'x-content-type\|referrer\|x-frame\|permissions'` and `curl -sI https://your-domain/assets/<any-hashed-file> | grep -i cache-control` → `immutable`. If both come back empty, the host is ignoring `public/_headers` (§6) — expected on Vercel/GitHub Pages, a misconfiguration anywhere else.
- [ ] **Submit the sitemap** to Google Search Console / Bing Webmaster (optional, for indexing).

**The product itself**

- [ ] **A visualization works end-to-end:** open a lesson, press Play / Step ± / Scrub / Reset, then type custom input. With DevTools → Network filtered to Fetch/XHR, interacting must produce **zero requests** — everything is precomputed client-side (spec §4).
- [ ] **Lighthouse (mobile) meets §14 targets** on home + a lesson + glossary — Perf ≥ 95, A11y 100, Best-Practices ≥ 95, SEO ≥ 95. There is no Lighthouse tooling in the repo, so this stays a manual run:
  ```bash
  npx lighthouse https://your-domain/ --view
  npx lighthouse https://your-domain/learn/binary-search/ --view
  npx lighthouse https://your-domain/glossary/ --view
  ```
  (At M5 the Astro build scored 97/100/100/100 and 100/100/100/100 locally. The React build has not been scored; run it on the real origin — CDN headers and the resolved canonical both move these numbers.)
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
> - **The storage keys survived the framework rewrite unchanged** (spec §6), so readers of the Astro build keep their progress after the React build deploys to the same origin.
>
> A progress export/import code is the only no-backend answer to this and is deliberately deferred (spec §19) — revisit only if readers actually ask.

---

## 8. Rollback

Every deploy is an immutable static bundle, so rollback is instant and total — there is no database to un-migrate and no server state to reconcile. **Prefer the host-native rollback:** it is one click, needs no rebuild, and cannot fail on a test that has since gone red.

- **Host-native (recommended):** the Worker's *Deployments* list → the three-dot menu on the version you want → **Rollback**, which immediately creates a new deployment carrying that version. `npx wrangler rollback` does the same from a terminal. Only the **100 most recent versions** are available, which is ample here; the binding caveats in Cloudflare's rollback docs do not apply, because this Worker has no bindings and no script — it is assets only. Netlify, Vercel and Cloudflare Pages have equivalent controls under their deploy lists. Effect is immediate; the git history is untouched, so fix forward at your own pace.
- **Git-native:** `git revert <bad-commit>` (never a force-push to `main` — Cloudflare deploys what `main` points at, and a rewritten history makes "what is live?" unanswerable) and push. The gate runs, Cloudflare rebuilds, the site returns. Slower than the dashboard, but it is the one that also fixes the next deploy.
- **The React migration** is one merge into `main`; reverting that merge commit restores the Astro build, and Workers Builds rebuilds it from the restored `package.json`/lockfile. The storage keys are identical on both sides, so readers' progress is unaffected either way.
- **Milestone checkpoints** — clean commits to land on if you need a known-good tree:
  - `5bc64ee` M8 hardening · `4f34cff` M8.2+M8.3 · `2b6b821` M8.1 · `12d2486` M7.3 · `80373a4` M7.2 · `7367685` M7.1
  - `5b07bc9` M6 · `3453878` M5 · `3515b81` M4 · `425b4e1` M3 · `b4e0dfe` M2 · `39deceb` M1
- **What a rollback does *not* touch:** readers' `localStorage`. Progress keys are versioned (`progress:v1:…`) and unknown versions are ignored on read, so rolling back to a build that predates a key simply leaves that key unread on the device — never a crash, never a wipe. Nothing here needs a data migration or a rollback script.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A build **fails** with `SITE_URL is not set on a … build` (the platform is named: Cloudflare Workers Builds, Cloudflare Pages, Netlify or Vercel) | Working as designed (§2.1). The alternative is publishing 136 canonicals and 134 `<loc>`s naming a domain that cannot exist | Add `SITE_URL` = the deployment's origin as a **build** variable and retry. On Workers Builds that is *your Worker → Settings → Build → Build variables and secrets* — **not** *Settings → Variables and Secrets*, which is the runtime list and does not reach the build. On Pages, both the Production and Preview environments. This is the mandatory dashboard setting in the callout at the top of this document. |
| A build **fails** with `SITE_URL "…" carries a path, query or fragment` | `SITE_URL` was given a sub-path (`https://sample.com/learndsa`). The site deploys at the root of one origin (§2.2) | Set `SITE_URL` to the origin alone. If the site really must live under someone else's domain, give it its own subdomain. |
| A Cloudflare build installs an adapter, rewrites the build config or moves the output to `dist/client/` | `wrangler deploy` **auto-configured the project**: with no Wrangler config in the repo it detects a framework and reconfigures the project around a server the site does not have | Restore `wrangler.jsonc` (§4.3) — its presence is what suppresses auto-configuration — and revert whatever the run added (the adapter dependency, config edits, generated package scripts and `.gitignore` lines). This site has no server. |
| A deployed Cloudflare Worker answers a bad URL with a bare 404 instead of the site's 404 page | `assets.not_found_handling` is missing from `wrangler.jsonc`. Workers does **not** infer it the way Pages did — the default is `none` | Restore `"not_found_handling": "404-page"` (§4.3). `dist/404.html` is built on every run; without that line nothing ever serves it. |
| Canonical/OG/sitemap show `https://learndsa.invalid` in production | The sentinel shipped: `SITE_URL` was unset on a host **outside** the guard's list of four — GitHub Actions above all, or a plain host fed a local build (§2.1) | Set `SITE_URL` for that host (§4.4/§5.3) and redeploy; for a plain host, rebuild with `SITE_URL` set and copy again (§4.5). |
| Canonical/OG show a **preview** URL | Someone set `SITE_URL` to the per-deployment preview URL | §2.1 — previews deliberately canonicalize to production, which is what one project-wide `SITE_URL` achieves (on Pages, the same value on both environments). |
| `npm run build` fails in `verify-dist` with an unresolved internal URL | A link or asset path in the source points at nothing the build emits — a typo, a missing trailing slash, a deleted lesson | The message names the page and the URL; fix the link. `npm run validate:content` catches the lesson-prose cases earlier. |
| Every link and asset 404s, page unstyled | The build was deployed under a sub-path (a GitHub Pages project site, a folder of another domain). Links are root-absolute and point at the origin root | Not supported (§2.2): deploy at the root of an origin. |
| Build fails in CI but works locally | Type error caught by `tsc --noEmit`, or Node below the 22.12.0 floor | Fix the type error; ensure the runner reads `.nvmrc` (Node 24). |
| `npm run test:e2e` fails in CI with "browser not found" | Not in the pinned Playwright container, and browsers not installed | Run the job in `mcr.microsoft.com/playwright:v1.61.1-noble` (as `ci.yml` does), or add `npx playwright install --with-deps chromium` before the e2e step. |
| `npm run test:e2e` fails locally with a port/server error | It builds and previews on **4321**; something else holds it | Free the port (or stop another preview), or run with `PW_PORT=<other>`. On CI it previews the already-built `dist/`. |
| Every visual test suddenly red after committing baselines | The PNGs were seeded on a laptop rather than in the pinned container | Re-seed with the `Seed visual baselines` job (§5.2); the snapshot filename pins `{platform}`, so a locally seeded PNG is not even the file CI looks for. |
| "My progress disappeared" / "it's empty on my other laptop" | `localStorage` is per-browser-profile, per-device, and never syncs | Not a bug — §7's support callout. Cleared site data, incognito and a **new domain** all present as a fresh device. |
| A reader sees no pips, no review cards, no trials | JavaScript is disabled (or blocked) in that browser | By design: every gamification component ships a `<noscript>` kill-switch, so no dead controls appear. Prose, code and navigation still work. |
| A visualizer says it could not load | A chunk it needs failed to download (a flaky connection, a blocked `/assets/` path) | The terminal "unavailable" state is by design; check DevTools → Network for the failed `/assets/*.js` request, and that `public/_headers` or a proxy is not blocking it. |
| Security headers missing in production | The host does not read `public/_headers` | Expected on Vercel and GitHub Pages (§4.2/§6). On Cloudflare/Netlify, confirm the file reached `dist/` — it is copied verbatim from `public/`. |
| A replaced favicon or OG card keeps serving the old image | A CDN/browser/scraper cache, not the build | §6 keeps those unhashed assets on a 1-hour revalidating cache; purge the host cache if you cannot wait, and remember social scrapers keep their own copy. |
| A link, canonical or `<loc>` names `/about` and gets a 301 in production — or a hard **404** under `npm run preview` | An internal URL authored without the trailing slash. `/about/` is the only published form, and the preview server **refuses** the slashless one rather than redirecting it | Add the slash — on the **path**, before any `?query` or `#fragment`: `/glossary/#array`, never `/glossary#array/`. `tests/e2e/url-shape.spec.ts` fails on a slashless internal link, on a `<loc>` that is not served, and on a canonical that disagrees with the URL it was served at, so this shows up in the gate rather than in production. |
| Code-block comments look low-contrast | An old single-theme Shiki config | Already fixed — dual-theme (`github-light`/`github-dark-default`) in `src/mdx/` and `src/lib/highlight.ts`; don't revert it (WCAG AA). |

---

## Appendix — deployment facts at a glance

- **Framework/output:** React 19 + Vite, prerendered at build time by an in-repo static-site generator (`scripts/vite-plugin-ssg.ts`) → `dist/` (static HTML/CSS/JS). Every page is `<route>/index.html` published at `/about/`, `/learn/binary-search/`; `dist/404.html` is the one file that stays at the root. Routes come from `src/routes.tsx`. Only the three instruments (Visualizer, Trace Trials, Final Run) hydrate as React islands.
- **Build:** `npm run build` = `tsc --noEmit -p tsconfig.json && vite build && node scripts/verify-dist.mjs`. **Install:** `npm ci`. **Node:** 24 via `.nvmrc` (floor ≥ 22.12.0).
- **Publish dir:** `dist` — on Workers it is `assets.directory` in `wrangler.jsonc`, not a dashboard field. `.build/` beside it is build metadata, never deployed. **Server/adapter:** none. **Runtime secrets/env:** none. **Deploy-time secrets:** none in the committed topology (Workers Builds git integration); two Cloudflare secrets only in §5.3's Actions alternative.
- **Deploy config:** `wrangler.jsonc` (committed, §4.3) — `assets.directory: ./dist`, no `main`/`binding`, `html_handling: force-trailing-slash`, `not_found_handling: 404-page`. Its first job is to suppress `wrangler deploy`'s automatic configuration.
- **Single build-time input:** **`SITE_URL`** — the deployment's **origin**, no path — read in `src/render/site-url.ts` with no fallback chain. Unset, the build carries the sentinel `https://learndsa.invalid` (RFC 2606, can never resolve); unset on a **publishing builder** (`CF_PAGES`, `WORKERS_CI`, `NETLIFY` or `VERCEL` present) the build **throws**, naming the platform; a value with a path throws everywhere. Every declared URL is joined by `src/lib/deployment-url.ts`.
- **One origin, root-absolute URLs.** Every internal link is root-absolute; sub-path hosting, the relative post-build pass and `npm run rehost` were retired with the React migration (§2.2, D-01).
- **Pages built:** 136 — home, `/learn/`, three course pages, `/glossary/`, `/about/`, 404, 127 lessons, and the prod-gated `/dev/renderers/`. **Sitemap:** 134 `<loc>` entries, all slashed (the 404 and the dev gallery are excluded and both carry `noindex`).
- **SEO artifacts (auto-generated):** `dist/sitemap.xml`, `dist/robots.txt`, per-page canonical/OG/Twitter, `Course`/`WebSite` JSON-LD. **OG card:** `public/og-source.svg` + `public/og-default.png`, both regenerated by `npm run og` from `scripts/build-og.mjs` — never hand-edited (§2.3).
- **Headers/caching:** `public/_headers` — security headers on `/*`, `immutable` on `/assets/*`, 1-hour revalidating cache on the four unhashed root assets, host default on HTML. No CSP, for the reason in §6.
- **JS budget:** ≤ 120 KB gz per page, EAGER and FULL (islands activated, React included), **enforced** by `tests/e2e/js-budget.spec.ts`, which prints the per-page figures on every e2e run. React and the renderer/algorithm chunks load only when an instrument activates. **No runtime network calls.**
- **Client state:** `localStorage` only, keys enumerated in spec §6 (unchanged by the rewrite), **per-device with no sync** (§7). No cookies, no accounts, no analytics, no tracking.
