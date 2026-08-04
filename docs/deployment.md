# Deployment Guide — LearnDSA

How to build and deploy LearnDSA to production. The site is a **fully static, prerendered Astro site** (`output: 'static'`) with **no backend, no server runtime, no database, and no runtime environment variables or secrets** — every page is HTML/CSS/JS emitted at build time into `dist/`, deployable to any static host.

> **Re-audited against the repo after M7 (UX overhaul) and M8 (mastery loop) shipped.** Every command, path and claim below was re-checked against the working tree and a built `dist/` rather than carried forward — §2.3 (the OG card), §3 (the gate and the shape of `dist/`), §5 (the workflow that is actually committed), §6 (`public/_headers`) and §7 (what M7/M8 added to the post-deploy list) all changed as a result. The one check that stays a manual judgement is Lighthouse (§7): there is no Lighthouse tooling in this repo.

> **The one thing you must not skip:** the production origin. It already resolves correctly for the `*.pages.dev` deployment with no action from you (§2.1) — but canonicals, Open Graph/Twitter tags, `sitemap.xml`, `robots.txt` and JSON-LD all derive from it, and **pointing a custom domain at the site does not update it**. Add a domain ⇒ do §2.1's one-line change and rebuild, or every page keeps advertising the `pages.dev` origin.

---

## 0. Recommended mechanism (DevOps recommendation)

**Primary: Cloudflare Pages building from the git integration, with GitHub Actions running the full DoD gate on every push and PR. Runner-up: Netlify** (near-identical fit — pick it if you're already in that ecosystem). §4 documents every host generically; this is the recommended pick for *this* repo, and two facts in the repo drive it:

1. **`public/_headers` already exists** — that format is honored by **Cloudflare Pages and Netlify only**; GitHub Pages silently ignores it, so the security headers this project ships would not take effect there.
2. **`build.format: 'file'`** produces clean, no-trailing-slash URLs (`/about`, `/learn/binary-search`) that match the canonicals + sitemap exactly; Cloudflare/Netlify serve them natively.

Cloudflare wins the tiebreak over Netlify on **unlimited free bandwidth** — ideal for an educational site that may get bursty traffic — at **$0**. Explicitly **not** recommended for this workload: Kubernetes/containers, Terraform/Bicep/IaC, an SSR adapter, or S3+CloudFront — there is no server, state, or runtime secret, so heavier infra adds cost and attack surface with zero benefit.

> ### ✅ Current setup: Cloudflare Pages **git integration**
>
> The Pages project is connected directly to the GitHub repo, so **Cloudflare builds and deploys itself on every push to `main`** (and gives every PR a preview URL). Consequences:
>
> - **The committed workflow is the gate in §5.1** (`.github/workflows/ci.yml`) — it runs lint/format/unit/e2e, which Cloudflare's build does *not*, and it deliberately deploys nothing.
> - **Do NOT add the §5.3 Actions+Wrangler workflow** — that is for the *Direct Upload* topology and would publish the site twice per push.
> - **Make `DoD gate` a required status check on `main`.** Without branch protection, Cloudflare will happily deploy a commit whose gate is red: the two systems are independent (§5.1).
> - Domain is the free `*.pages.dev` subdomain, resolved automatically (§2.1). No registration, TLS included.
> - Dashboard build settings: build command `npm run build`, output directory `dist`, production branch `main`, Node from `.nvmrc` (or `NODE_VERSION=24`).

---

## 1. Prerequisites

| Requirement | Value | Notes |
|---|---|---|
| Node.js | **24** (floor: **≥ 22.12.0**) | Pinned in `.nvmrc` — the single source of truth read by Cloudflare Pages *and* `actions/setup-node`. **Astro 7 hard-requires `>=22.12.0` and refuses to build on Node 20**, so do not lower this (the ESLint Astro plugins additionally want `^22.22.3 \|\| ^24.16.0`). `package.json` `engines` states the floor. |
| Package manager | **npm** | Commit-tracked `package-lock.json`; use `npm ci` in CI for reproducible installs. |
| Build output | `dist/` | Static files; gitignored. This is the "publish directory" every host asks for. |
| Server/adapter | **none** | Pure static. Do **not** add an SSR adapter (`@astrojs/node`, `@astrojs/vercel` serverless, etc.) — it's unnecessary and would change the output contract. |
| Runtime env vars / secrets | **none** | Nothing to configure in a secrets manager. The only build-time config is the `site` origin in `astro.config.mjs`. |
| Browsers (tests + OG card only) | Playwright Chromium | Needed by `npm run test:e2e` and by `npm run og`, which rasterizes the OG card with it (§2.3): `npx playwright install --with-deps chromium`. **Not** needed to build or serve the site. |

---

## 2. Pre-deploy configuration (required)

### 2.1 The production origin — resolved automatically

**This is already configured** — `astro.config.mjs` resolves the origin at build time instead of hardcoding it:

```js
const PRODUCTION_URL = 'https://static-dsa.pages.dev';   // free Cloudflare Pages subdomain
const site =
  process.env.SITE_URL ||                                                  // 1. explicit override
  (process.env.CF_PAGES_BRANCH === 'main' ? process.env.CF_PAGES_URL : '') // 2. Cloudflare production
  || PRODUCTION_URL;                                                       // 3. local + previews
```

1. **`SITE_URL`** — explicit override, wins over everything.
2. **`CF_PAGES_URL` on the production branch** — Cloudflare injects this at build time; on `main` it *is* `https://<project>.pages.dev`. This makes the deployed canonicals correct **even if `PRODUCTION_URL` is stale or misspelled**.
3. **`PRODUCTION_URL`** — used for local builds and preview branches. Previews deliberately canonicalize to production so they never compete with it in search.

> **Adding a custom domain later:** a custom domain does **not** change `CF_PAGES_URL`, so update `PRODUCTION_URL` (or set a `SITE_URL` build variable in the Cloudflare dashboard) — otherwise canonicals keep pointing at the `pages.dev` origin.

The resolved value propagates to **every** absolute URL the site emits:
- `<link rel="canonical">` on every page
- `og:url` / `og:image` / `twitter:*` tags
- `dist/sitemap.xml` `<loc>` entries
- `dist/robots.txt` `Sitemap:` line
- `Course` / `WebSite` JSON-LD `url` fields

Rebuild after changing it. Verify with:

```bash
npm run build

# 1. Every absolute URL the site emits should carry ONE origin — yours. This
#    prints the distinct origins found in the built HTML/CSS/JS; expect your
#    origin, https://schema.org (JSON-LD @context), http://www.w3.org (SVG
#    namespaces) and https://tailwindcss.com (a CSS source comment). Anything
#    else — a localhost, a preview URL, a stale domain — is a bug.
grep -rhoE 'https?://[a-zA-Z0-9.-]+' --include=*.html --include=*.js --include=*.css dist/ \
  | sort | uniq -c | sort -rn

# 2. Spot-check the two places a wrong origin hurts most.
grep -o '<link rel="canonical"[^>]*>' dist/index.html
grep -o '<meta property="og:image"[^>]*>' dist/index.html
```

### 2.2 Sub-path vs. root domain (affects GitHub Pages "project" sites)

The site is currently configured for a **root deployment** (served at `/`). If — and only if — you deploy to a URL with a **base path** (e.g. GitHub Pages *project* site `https://user.github.io/repo/`), you must **also** set `base`:

```js
export default defineConfig({
  site: 'https://user.github.io',
  base: '/repo/',            // required ONLY for sub-path hosting
  output: 'static',
});
```

Astro then prefixes internal asset/link URLs with `base`. **You do not need `base`** for:
- a custom domain (`https://your-domain.com`)
- a GitHub Pages **user/org** site (`https://user.github.io/`)
- Netlify / Vercel / Cloudflare Pages (they serve at root)

Leaving a stray `base` set on a root deployment breaks all asset paths, so only add it when the host truly serves under a sub-path.

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

Verify the result renders in a real link preview after deploy (§7), not just locally: scrapers fetch the absolute `og:image` URL, which depends on §2.1's origin.

---

## 3. Build and verify locally

### 3.1 The Definition-of-Done gate

All five checks must be clean before every deploy — this is spec §18, and it is exactly what CI runs (§5):

```bash
npm ci                 # clean, lockfile-exact install
npm run build          # astro check (type-check) + astro build → dist/
npm run lint           # ESLint
npm run format:check   # Prettier
npm run test           # Vitest unit suite  (48 spec files, node env — no DOM, no localStorage)
npm run test:e2e       # Playwright + axe   (32 spec files; needs: npx playwright install chromium)
```

`npm run build` is `astro check && astro build` — **type errors fail the build**, which is intended (it's a real gate, not just an editor nicety).

Three things about the suites a deployer should know before reading a run:

- **`npm run test:e2e` builds and previews first, locally**, so it needs **port 4321 free** and takes a few minutes. On CI it skips the rebuild (the gate has already built) and `astro preview` fails loudly if `dist/` is missing — see `playwright.config.ts`.
- **The JS budget is enforced, not remembered.** `tests/e2e/js-budget.spec.ts` gzips every script in each built page's static import closure and fails the run if any page exceeds spec §4's **60 KB gz**; it prints the per-page table on every run, so read *that* for the current number rather than trusting a figure copied into a document (this one included). Lazily-imported renderer/algorithm chunks are reported separately and gated at nothing — no page downloads them all.
- **The pixel baselines skip until seeded.** `tests/e2e/baseline-visual.spec.ts` holds 14 captures that are inert unless `VISUAL_BASELINE` is set and PNGs are committed (§5.2). A green e2e run therefore says nothing about pixels; the aria/DOM baselines (`baseline-aria.spec.ts`) run unconditionally.

Preview the production build exactly as it will ship:

```bash
npm run preview        # serves dist/ locally, defaults to http://localhost:4321
```

### 3.2 What a correct `dist/` looks like

`build.format: 'file'` means routes are emitted as **files, not directories** — `about.html` served at `/about`. Expect exactly:

```
dist/
├─ index.html  404.html  about.html  glossary.html  learn.html
├─ learn/<slug>.html            × 15 lessons
├─ dev/renderers.html           dev-only gallery — prod-gated, noindex, no renderer JS
├─ sitemap.xml  robots.txt      19 <loc> entries: 4 static routes + 15 lessons
├─ favicon.svg  favicon-32.png  apple-touch-icon.png
├─ og-default.png  og-source.svg
├─ _headers                     consumed by the host, never served (§6)
└─ _astro/                      content-hashed CSS + JS chunks
```

### 3.3 Pre-deploy audit of the built output

Cheap greps that catch the mistakes that are expensive to catch in production. Run them on a fresh `dist/`:

```bash
# No non-production origin leaked into the build (see §2.1 for the expected list).
grep -rhoE 'https?://[a-zA-Z0-9.-]+' --include=*.html --include=*.js --include=*.css dist/ | sort -u

# The 404 must not be indexable, and the dev gallery must not be either.
grep -o '<meta name="robots"[^>]*>' dist/404.html dist/dev/renderers.html

# No runtime network calls anywhere in the shipped JS (spec §4). Expect no output.
grep -rlE '\bfetch\(|XMLHttpRequest|navigator\.sendBeacon' dist/_astro/

# Sitemap: 19 URLs, all on your origin, and NO /dev/renderers entry.
grep -c '<loc>' dist/sitemap.xml && grep -c 'dev/renderers' dist/sitemap.xml   # → 19, then 0
```

> **`/dev/renderers`:** the developer-only renderer gallery is **prod-gated** (`import.meta.env.DEV`) — in a production build none of its islands render, so no renderer chunk is referenced, and it is excluded from the sitemap. It carries `<meta name="robots" content="noindex">`, which is the right control: a `robots.txt` `Disallow` would *stop* crawlers reading that tag and can leave a URL-only entry in the index. Leave `robots.txt` alone.

---

## 4. Host-specific deployment

All hosts use the same two settings: **build command `npm run build`**, **publish/output directory `dist`**, **Node 24**. Pick one.

### 4.1 Netlify

**Dashboard:** New site → connect the repo →
- Build command: `npm run build`
- Publish directory: `dist`
- Environment: `NODE_VERSION = 24`

Or commit **`netlify.toml`** at the repo root:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "24"
```

**No `[[headers]]` block is needed** — Netlify reads the committed `public/_headers` (§6), which already carries the security headers, the immutable `/_astro/*` rule and the short-cache rules for the unhashed icons/OG card. Duplicating them in the TOML gives you two sources of truth for the same headers.

Netlify auto-serves `404.html` for unknown routes. No redirects needed for this static site.

### 4.2 Vercel

**Dashboard:** Import the repo. Vercel detects Astro automatically:
- Framework preset: **Astro**
- Build command: `npm run build` (override if the preset differs)
- Output directory: `dist`
- Node version: **24** in Project Settings → General. **Not 20** — Astro 7 hard-requires `>=22.12.0` and refuses to build below it (§1).

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

### 4.3 Cloudflare Pages

**Dashboard:** Create a project → connect the repo →
- Framework preset: **Astro**
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION = 24` (or let it read `.nvmrc`)

Cloudflare Pages serves `404.html` for not-found routes automatically. **`public/_headers` is already committed** and is copied verbatim into `dist/`, so security headers and caching need no dashboard configuration — see §6 for what it sets and why. Cloudflare consumes that file rather than serving it, so it never appears as a public URL.

### 4.4 GitHub Pages (via GitHub Actions)

GitHub Pages needs a build step (it won't run `npm run build` for you). Use the official Pages Actions. **If this is a project site** (`user.github.io/repo`), set `base: '/repo/'` per §2.2 first.

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

> **GitHub Pages ignores `public/_headers` and offers no way to set response headers**, so every security header and both cache rules in §6 are silently lost — that, plus the `base` sub-path complication above, is why §0 does not recommend it for this repo.

---

## 5. Continuous integration — what is actually committed

### 5.1 `.github/workflows/ci.yml` — the DoD gate (committed, in use)

Cloudflare's git integration builds and deploys every push to `main` (§0), but its build only type-checks and builds. This workflow runs the four checks Cloudflare does not — **lint, format, unit tests, and the Playwright/axe e2e suite** — and it deliberately **does not deploy**: a Wrangler step here would publish the site twice. Read the file itself for the full reasoning; its shape is:

| Piece | Value | Why |
|---|---|---|
| Triggers | `push` to `main`, every `pull_request`, and `workflow_dispatch` | the manual trigger exists for the seeding job in §5.2. The gate carries no event filter, so a manual dispatch runs it too — which is what proves the commit you are seeding from is green |
| Node | `node-version-file: .nvmrc` | one source of truth, shared with Cloudflare. Never a hardcoded `node-version:` that can drift from the file |
| Concurrency | `ci-${{ github.ref }}-${{ github.event_name }}` | a newer push supersedes an in-flight run of the same ref; the event is in the key so a seeding run and a push to the same branch never cancel each other |
| Permissions | `contents: read` (workflow-level) | least privilege — this workflow only reads the repo. Artifact upload/download is unaffected: those actions authenticate with the runtime token, not `GITHUB_TOKEN` |
| Timeouts | 30 min (gate) / 20 min (seed) | a hung browser or wedged preview server fails in minutes instead of burning the 6-hour default |
| Steps | `npm ci` → `npm run build` → `npm run lint` → `npm run format:check` → `npm run test` → `npx playwright install --with-deps chromium` → `npm run test:e2e` | spec §18's five checks, in order; only e2e needs a browser |
| On failure | uploads `playwright-report/` + `test-results/`, 7-day retention | the HTML report embeds the `on-first-retry` traces, screenshots and video, so a red run is diagnosable without a local repro |

**Make `DoD gate` a required status check on `main`** (Settings → Branches → branch protection) and require a PR review. That is the only thing standing between a red commit and the branch Cloudflare deploys — the workflow cannot block a deploy it does not perform.

### 5.2 Turning the pixel baselines on (two steps, in this order)

`tests/e2e/baseline-visual.spec.ts` holds 14 screenshot comparisons that **skip unless `VISUAL_BASELINE` is set**, and until PNGs are committed there is nothing to compare against. The `Seed visual baselines` job (manual dispatch only) closes that gap:

1. **Seed.** Actions → CI → *Run workflow*, from a commit whose `DoD gate` is green. Download the `visual-baselines` artifact, review the PNGs like any other reviewed artifact, and commit them to `tests/e2e/baseline-visual.spec.ts-snapshots/`.
2. **Then arm it.** Add `VISUAL_BASELINE: '1'` to the gate's `npm run test:e2e` step.

Doing those in the other order turns CI red: `playwright.config.ts` sets `updateSnapshots: 'none'` on CI, so a missing baseline is a failure rather than a silent regeneration — deliberately, but only once a baseline exists. The job must run **on the CI runner image**, not a laptop: the site ships a pure system font stack, so glyph rasterization is image-specific and the snapshot filename pins `{platform}`.

### 5.3 Alternative topology: build **and** deploy from Actions

Only relevant if you **disconnect Cloudflare's git integration** and switch the Pages project to **Direct Upload**. Do not commit this alongside §5.1's workflow while git integration is on — the site would be published twice per push, from two different builds.

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
      - run: npm run build       # astro check (type gate) + astro build → dist/
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

Prerequisites: the GitHub remote (`origin`, already configured), a Cloudflare Pages project in **Direct Upload** mode, and two Actions **secrets** — `CLOUDFLARE_API_TOKEN` (scope: Account → Cloudflare Pages → Edit) and `CLOUDFLARE_ACCOUNT_ID`. Both are deploy-time only and are never shipped to a browser; the site itself has no runtime secrets at all. The trade this topology buys: the deployed bytes are the exact bytes the full test suite passed against, instead of a second build the tests never saw.

---

## 6. Caching & headers — `public/_headers` (committed)

One committed file drives all of this on Cloudflare Pages and Netlify. It is copied verbatim into `dist/`, consumed by the host, and never served as a URL. **Vercel and GitHub Pages ignore it** (§4.2 shows the Vercel equivalent). Four rule groups, each earning its place:

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

- [ ] **Canonical/OG use the deployed origin:** view-source on the home + a lesson → `<link rel="canonical">`, `og:url` and `og:image` all carry your domain. A wrong origin here is the §2.1 mistake and is worth catching before anything gets indexed.
- [ ] **Sitemap:** `https://your-domain/sitemap.xml` lists **19 URLs** — 4 static routes + 15 lessons — every `<loc>` on your domain, and **no `/dev/renderers`**.
- [ ] **Robots:** `https://your-domain/robots.txt` → `Allow: /` plus a `Sitemap:` line on your domain.
- [ ] **404:** a bad URL serves the friendly page and it carries `<meta name="robots" content="noindex">`. `/dev/renderers` does too.
- [ ] **The OG card renders in a real link preview.** Paste the home URL into whatever your audience uses (Slack, X, LinkedIn, Discord) and confirm the branded 1200×630 card appears — not a blank frame or a cropped logo. This is the one §2.3 check a local build cannot make: scrapers fetch the **absolute** `og:image` URL over the public internet. If a scraper shows a stale card after regenerating, that is its own cache, not yours (§6 keeps the asset revalidating hourly).
- [ ] **Headers actually arrived:** `curl -sI https://your-domain/ | grep -i 'x-content-type\|referrer\|x-frame\|permissions'` and `curl -sI https://your-domain/_astro/<any-hashed-file> | grep -i cache-control` → `immutable`. If both come back empty, the host is ignoring `public/_headers` (§6) — expected on Vercel/GitHub Pages, a misconfiguration anywhere else.
- [ ] **Submit the sitemap** to Google Search Console / Bing Webmaster (optional, for indexing).

**The product itself**

- [ ] **A visualization works end-to-end:** open a lesson, press Play / Step ± / Scrub / Reset, then type custom input. With DevTools → Network filtered to Fetch/XHR, interacting must produce **zero requests** — everything is precomputed client-side (spec §4).
- [ ] **Lighthouse (mobile) meets §14 targets** on home + a lesson + glossary — Perf ≥ 95, A11y 100, Best-Practices ≥ 95, SEO ≥ 95. There is no Lighthouse tooling in the repo, so this stays a manual run:
  ```bash
  npx lighthouse https://your-domain/ --view
  npx lighthouse https://your-domain/learn/binary-search --view
  npx lighthouse https://your-domain/glossary --view
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
> - A **new domain is a new origin**: moving from `*.pages.dev` to a custom domain leaves existing readers' progress behind on the old origin. If you plan a domain change, do it before you have an audience to disappoint.
>
> A progress export/import code is the only no-backend answer to this and is deliberately deferred (spec §19) — revisit only if readers actually ask.

---

## 8. Rollback

Every deploy is an immutable static bundle, so rollback is instant and total — there is no database to un-migrate and no server state to reconcile. **Prefer the host-native rollback:** it is one click, needs no rebuild, and cannot fail on a test that has since gone red.

- **Host-native (recommended):** Cloudflare Pages → the project's *Deployments* list → **Rollback / "Retry deployment"** on the last good build. Netlify and Vercel have the same control under their deploy lists. Effect is immediate; the git history is untouched, so fix forward at your own pace.
- **Git-native:** `git revert <bad-commit>` (never a force-push to `main` — Cloudflare deploys what `main` points at, and a rewritten history makes "what is live?" unanswerable) and push. The gate runs, Cloudflare rebuilds, the site returns. Slower than the dashboard, but it is the one that also fixes the next deploy.
- **Milestone checkpoints** — clean commits to land on if you need a known-good tree:
  - `5bc64ee` M8 hardening · `4f34cff` M8.2+M8.3 · `2b6b821` M8.1 · `12d2486` M7.3 · `80373a4` M7.2 · `7367685` M7.1
  - `5b07bc9` M6 · `3453878` M5 · `3515b81` M4 · `425b4e1` M3 · `b4e0dfe` M2 · `39deceb` M1
- **What a rollback does *not* touch:** readers' `localStorage`. Progress keys are versioned (`progress:v1:…`) and unknown versions are ignored on read, so rolling back to a build that predates a key simply leaves that key unread on the device — never a crash, never a wipe. Nothing here needs a data migration or a rollback script.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Canonical/OG/sitemap show `static-dsa.pages.dev` after moving to a custom domain | `CF_PAGES_URL` does not change for custom domains, so the fallback `PRODUCTION_URL` is what shipped | §2.1 — set a `SITE_URL` build variable in the Cloudflare dashboard (or edit `PRODUCTION_URL`), then redeploy. |
| Canonical/OG show a **preview** URL | Someone set `SITE_URL` on a preview build, or `CF_PAGES_BRANCH` is not `main` on the production branch | §2.1 — previews deliberately canonicalize to production. Unset the override; check the Pages project's production branch really is `main`. |
| CSS/JS 404s, unstyled page on GitHub Pages project site | Missing `base` for the sub-path | §2.2 — set `base: '/repo/'`, rebuild. |
| Assets 404 on a root domain after adding `base` | Stray `base` on a root deploy | Remove `base`; it's only for sub-path hosts. |
| Build fails in CI but works locally | Type error caught by `astro check`, or Node below the 22.12.0 floor | Fix the type error; ensure the runner reads `.nvmrc` (Node 24). Astro 7 refuses to build on Node 20 with "Node.js vX is not supported by Astro!". |
| `npm run test:e2e` fails in CI with "browser not found" | Playwright browsers not installed | Add `npx playwright install --with-deps chromium` before the e2e step. |
| `npm run test:e2e` fails locally with a port/server error | It builds and previews on **4321**; something else holds the port | Free port 4321 (or stop the dev server) and re-run. On CI it previews the already-built `dist/`. |
| Every visual test suddenly red after committing baselines | Step 2 of §5.2 was done before step 1, or the PNGs were seeded on a laptop | Re-seed with the `Seed visual baselines` job on the CI runner; the snapshot filename pins `{platform}`, so a locally seeded PNG is not even the file CI looks for. |
| "My progress disappeared" / "it's empty on my other laptop" | `localStorage` is per-browser-profile, per-device, and never syncs | Not a bug — §7's support callout. Cleared site data, incognito and a **new domain** all present as a fresh device. |
| A reader sees no pips, no review cards, no trials | JavaScript is disabled (or blocked) in that browser | By design: every gamification component ships a `<noscript>` kill-switch, so no dead controls appear. Prose, code and navigation still work. |
| Security headers missing in production | The host does not read `public/_headers` | Expected on Vercel and GitHub Pages (§4.2/§6). On Cloudflare/Netlify, confirm the file reached `dist/` — it is copied verbatim from `public/`. |
| A replaced favicon or OG card keeps serving the old image | A CDN/browser/scraper cache, not the build | §6 keeps those unhashed assets on a 1-hour revalidating cache; purge the host cache if you cannot wait, and remember social scrapers keep their own copy. |
| Duplicate/trailing-slash URL mismatch between canonical and sitemap | Host forces trailing slashes | `astro.config.mjs` sets `build.format: 'file'` — pages emit as `about.html` served at `/about` (no trailing slash), matching the no-slash canonicals + sitemap. Deploy to a host that serves `about.html` at `/about` without a 301 (Cloudflare Pages / Netlify do). If a host forces trailing slashes, either switch to `build.format: 'directory'` and add trailing slashes to the canonicals + sitemap, or pick a host that respects the file format. |
| Code-block comments look low-contrast | An old single-theme Shiki config | Already fixed — dual-theme (`github-light`/`github-dark-default`) in `astro.config.mjs`; don't revert it (WCAG AA). |

---

## Appendix — deployment facts at a glance

- **Framework/output:** Astro `output: 'static'` → `dist/` (prerendered HTML/CSS/JS), `build.format: 'file'` (`/about`, no trailing slash).
- **Build:** `npm run build` = `astro check && astro build`. **Install:** `npm ci`. **Node:** 24 via `.nvmrc` (floor ≥ 22.12.0 — Astro 7 will not build on Node 20).
- **Publish dir:** `dist`. **Server/adapter:** none. **Runtime secrets/env:** none. **Deploy-time secrets:** none in the committed topology (git integration); two Cloudflare secrets only in §5.3's Direct Upload alternative.
- **Single build-time config:** `site` in `astro.config.mjs`, resolved `SITE_URL` → `CF_PAGES_URL` (on `main`) → `PRODUCTION_URL` (+ `base` only for sub-path hosts).
- **Pages built:** 21 — home, `/learn`, glossary, about, 404, 15 lessons, and the prod-gated `/dev/renderers`. **Sitemap:** 19 `<loc>` entries (the 404 and the dev gallery are excluded and both carry `noindex`).
- **SEO artifacts (auto-generated):** `dist/sitemap.xml`, `dist/robots.txt`, per-page canonical/OG/Twitter, `Course`/`WebSite` JSON-LD. **OG card:** `public/og-source.svg` + `public/og-default.png`, both regenerated by `npm run og` from `scripts/build-og.mjs` — never hand-edited (§2.3).
- **Headers/caching:** `public/_headers` — security headers on `/*`, `immutable` on `/_astro/*`, 1-hour revalidating cache on the four unhashed root assets, host default on HTML. No CSP, for the reason in §6.
- **JS budget:** ≤ 60 KB gz per page, **enforced** by `tests/e2e/js-budget.spec.ts`, which prints the per-page figure on every e2e run. Renderer/algorithm chunks are lazy-loaded per lesson. **No runtime network calls.**
- **Client state:** `localStorage` only, keys enumerated in spec §6, **per-device with no sync** (§7). No cookies, no accounts, no analytics, no tracking.
