# Deployment Guide — LearnDSA

How to build and deploy LearnDSA to production. The site is a **fully static, prerendered Astro site** (`output: 'static'`) with **no backend, no server runtime, no database, and no runtime environment variables or secrets** — every page is HTML/CSS/JS emitted at build time into `dist/`, deployable to any static host.

> **The one thing you must not skip:** set the real production domain in `astro.config.mjs` (§2) **before** you build for production. Canonical URLs, Open Graph/Twitter tags, `sitemap.xml`, `robots.txt`, and JSON-LD all derive from it. Deploying with the placeholder ships wrong canonical/social/SEO metadata.

---

## 0. Recommended mechanism (DevOps recommendation)

**Primary: Cloudflare Pages, with GitHub Actions running the full gate and deploying `dist/` on green. Runner-up: Netlify** (near-identical fit — pick it if you're already in that ecosystem). §4 documents every host generically; this is the recommended pick for *this* repo, and two facts in the repo drive it:

1. **`public/_headers` already exists** — that format is honored by **Cloudflare Pages and Netlify only**; GitHub Pages silently ignores it, so the security headers this project ships would not take effect there.
2. **`build.format: 'file'`** produces clean, no-trailing-slash URLs (`/about`, `/learn/binary-search`) that match the canonicals + sitemap exactly; Cloudflare/Netlify serve them natively.

Cloudflare wins the tiebreak over Netlify on **unlimited free bandwidth** — ideal for an educational site that may get bursty traffic — at **$0**. Explicitly **not** recommended for this workload: Kubernetes/containers, Terraform/Bicep/IaC, an SSR adapter, or S3+CloudFront — there is no server, state, or runtime secret, so heavier infra adds cost and attack surface with zero benefit. Use the **combined gate-and-deploy workflow in §5.1** (preferred over the split gate-only/deploy-only snippets, which remain as generic references).

---

## 1. Prerequisites

| Requirement | Value | Notes |
|---|---|---|
| Node.js | **≥ 20** | Enforced by `package.json` `engines`. Use the same major in CI and on the build host. |
| Package manager | **npm** | Commit-tracked `package-lock.json`; use `npm ci` in CI for reproducible installs. |
| Build output | `dist/` | Static files; gitignored. This is the "publish directory" every host asks for. |
| Server/adapter | **none** | Pure static. Do **not** add an SSR adapter (`@astrojs/node`, `@astrojs/vercel` serverless, etc.) — it's unnecessary and would change the output contract. |
| Runtime env vars / secrets | **none** | Nothing to configure in a secrets manager. The only build-time config is the `site` origin in `astro.config.mjs`. |
| Browsers (CI e2e only) | Playwright Chromium | Only needed if you run `npm run test:e2e` in CI (`npx playwright install --with-deps chromium`). Not needed to build or serve. |

---

## 2. Pre-deploy configuration (required)

### 2.1 Set the production domain — the critical step

Edit **`astro.config.mjs`** and replace the placeholder `site` with your real origin (scheme + host, no trailing path):

```js
// astro.config.mjs
export default defineConfig({
  site: 'https://your-real-domain.com',   // ← was 'https://learndsa.example.com'
  output: 'static',
  // ...
});
```

This single value propagates to **every** absolute URL the site emits:
- `<link rel="canonical">` on every page
- `og:url` / `og:image` / `twitter:*` tags
- `dist/sitemap.xml` `<loc>` entries
- `dist/robots.txt` `Sitemap:` line
- `Course` / `WebSite` JSON-LD `url` fields

Rebuild after changing it. Verify with:

```bash
npm run build
grep -r 'learndsa.example.com' dist/    # must return NOTHING
grep -o '<link rel="canonical"[^>]*>' dist/index.html
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

### 2.3 Replace the placeholder OG image

`public/og-default.png` is a valid 1200×630 PNG but a **solid-indigo placeholder**. Replace it with branded artwork (same path, same 1200×630 dimensions) so social/link previews look intentional. Optional but recommended before a public launch.

---

## 3. Build and verify locally

Run the full Definition-of-Done gate before every deploy (this is what CI should also run):

```bash
npm ci                 # clean, lockfile-exact install
npm run build          # astro check (type-check) + astro build → dist/
npm run lint           # ESLint
npm run format:check   # Prettier
npm run test           # Vitest unit tests
npm run test:e2e       # Playwright (needs: npx playwright install chromium)
```

`npm run build` is `astro check && astro build` — **type errors fail the build**, which is intended (it's a real gate, not just an editor nicety).

Preview the production build exactly as it will ship:

```bash
npm run preview        # serves dist/ locally, defaults to http://localhost:4321
```

**`dist/` should contain:** `index.html`, `404.html`, `about/`, `glossary/`, `learn/` (+ `learn/<slug>/` per lesson), `sitemap.xml`, `robots.txt`, `favicon.svg`, `og-default.png`, and `_astro/` (hashed CSS + lazily-loaded renderer/algorithm JS chunks).

> **Note on `/dev/renderers`:** a developer-only renderer gallery route exists but is **prod-gated** — it ships no renderer JS in the production build and is excluded from `sitemap.xml`. It's harmless; you may optionally block it in `robots.txt` if you prefer it never be crawled.

---

## 4. Host-specific deployment

All hosts use the same two settings: **build command `npm run build`**, **publish/output directory `dist`**, **Node 20**. Pick one.

### 4.1 Netlify

**Dashboard:** New site → connect the repo →
- Build command: `npm run build`
- Publish directory: `dist`
- Environment: `NODE_VERSION = 20`

Or commit **`netlify.toml`** at the repo root:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

# Long-cache the content-hashed assets; keep HTML revalidated.
[[headers]]
  for = "/_astro/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

Netlify auto-serves `404.html` for unknown routes. No redirects needed for this static site.

### 4.2 Vercel

**Dashboard:** Import the repo. Vercel detects Astro automatically:
- Framework preset: **Astro**
- Build command: `npm run build` (override if the preset differs)
- Output directory: `dist`
- Node version: set to **20** in Project Settings → General

No `vercel.json` is required. If you add one, keep it minimal (do **not** add serverless/SSR config — this is static):

```json
{ "buildCommand": "npm run build", "outputDirectory": "dist" }
```

### 4.3 Cloudflare Pages

**Dashboard:** Create a project → connect the repo →
- Framework preset: **Astro**
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION = 20`

Cloudflare Pages serves `404.html` for not-found routes automatically. For long-lived asset caching, add a **`public/_headers`** file (copied verbatim into `dist/`):

```
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
```

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
          node-version: 20
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

---

## 5. Continuous integration (recommended)

### 5.1 Recommended: combined gate-and-deploy (Cloudflare Pages)

The one workflow that both **gates on the full DoD** and **deploys the verified artifact on green** (main → production, any PR branch → a preview URL). This is the recommended pipeline (§0); the split gate-only (§5.2) and per-host deploy-only (§4.4) snippets remain as generic references. Keep it uncommitted until the GitHub remote + Cloudflare project + secrets exist (§4.3, prerequisites below).

```yaml
# .github/workflows/deploy.yml
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
  verify:                       # the Definition-of-Done gate (spec §18) — nothing deploys unless green
    name: DoD gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
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

Prerequisites: a **GitHub remote** (currently none — `git remote -v` is empty), a free **Cloudflare account** + a Pages project named `learndsa` (Direct Upload — Actions does the build), and two GitHub Actions **secrets** `CLOUDFLARE_API_TOKEN` (scope: Account → Cloudflare Pages → Edit) + `CLOUDFLARE_ACCOUNT_ID` (deploy-time only, never shipped). Build-in-CI is chosen over Cloudflare's host-native build so the Playwright/axe suite runs as a deploy gate. **Branch protection:** require the `DoD gate` check + PR review before merge to `main`, so only a green `main` deploys.

### 5.2 Alternative: gate-only

Gate every push/PR on the full DoD without deploying (use with a host that builds natively). **`.github/workflows/ci.yml`**:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run lint
      - run: npm run format:check
      - run: npm run test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

Notes:
- `npm run build` already runs `astro check`, so type-checking is covered.
- The Playwright step is the only one needing browser binaries; drop it if you don't want e2e in CI (unit tests + build still gate correctness).
- Pair this with the deploy workflow (§4.4) — or, on Netlify/Vercel/Cloudflare, enable the host's "wait for CI to pass" / branch-protection so deploys only follow a green `verify` job.

---

## 6. Caching & headers

Astro fingerprints everything in **`dist/_astro/`** (e.g. `ArrayRenderer.zPEiTlER.js`) — the filename changes when content changes, so these are safe to cache **forever**:

```
Cache-Control: public, max-age=31536000, immutable
```

**HTML** files (`index.html`, `learn/*/index.html`, etc.) must **not** be immutably cached — they reference the current asset hashes and change on every content edit. Let the host's default (short cache + revalidation) apply, or set `Cache-Control: public, max-age=0, must-revalidate` for `*.html`. Netlify/Vercel/Cloudflare defaults are already sensible; the only value-add is the long-cache rule for `/_astro/*` shown per-host above.

`sitemap.xml` and `robots.txt` are plain static files served from the root — no special handling.

---

## 7. Post-deploy verification

After the first deploy to a new domain, confirm:

- [ ] **Canonical/OG use the real domain:** `view-source` on the home + a lesson → `<link rel="canonical">` and `og:url`/`og:image` point at your domain, not `learndsa.example.com`.
- [ ] **Sitemap reachable & correct:** `https://your-domain.com/sitemap.xml` lists the 4 static routes + all 15 lessons with your domain in every `<loc>`.
- [ ] **Robots reachable:** `https://your-domain.com/robots.txt` → `Allow: /` + `Sitemap: https://your-domain.com/sitemap.xml`.
- [ ] **404 works:** a bad URL serves the friendly `404.html` (and it carries `noindex`).
- [ ] **Lighthouse (mobile) meets §14 targets** on home + a lesson + glossary — Perf ≥95, A11y 100, Best-Practices ≥95, SEO ≥95. Run against the live URL:
  ```bash
  npx lighthouse https://your-domain.com/ --preset=desktop --view
  npx lighthouse https://your-domain.com/learn/binary-search --view
  npx lighthouse https://your-domain.com/glossary --view
  ```
  (At M5 these scored 97/100/100/100 and 100/100/100/100 against a local build; re-confirm on the real origin since SEO/canonical now resolve correctly.)
- [ ] **A visualization works end-to-end:** open a lesson, press Play/Step/Scrub, type custom input — it runs client-side, no network calls.
- [ ] **JS-disabled degradation:** with JS off, prose + 3-language code are readable and each visualizer shows its static still + "enable JS" note.
- [ ] **Both themes:** toggle light/dark; code blocks and diagrams stay legible (AA contrast).
- [ ] **Submit the sitemap** to Google Search Console / Bing Webmaster (optional, for indexing).

---

## 8. Rollback

Because deploys are immutable static bundles:
- **Host-native:** Netlify/Vercel/Cloudflare each keep prior deploys — use their dashboard "rollback / promote previous deployment" for an instant revert.
- **Git-native (GitHub Pages or any host):** `git revert <bad-commit>` (or reset to the last-good commit) and push; CI rebuilds and redeploys. The milestone commits are clean checkpoints:
  - `5b07bc9` M6 · `3453878` M5 · `3515b81` M4 · `425b4e1` M3 · `b4e0dfe` M2 · `39deceb` M1

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Canonical/OG show `learndsa.example.com` | `site` not swapped | §2.1 — set the real origin, rebuild. |
| CSS/JS 404s, unstyled page on GitHub Pages project site | Missing `base` for the sub-path | §2.2 — set `base: '/repo/'`, rebuild. |
| Assets 404 on a root domain after adding `base` | Stray `base` on a root deploy | Remove `base`; it's only for sub-path hosts. |
| Build fails in CI but works locally | Type error caught by `astro check`, or Node < 20 | Fix the type error; pin `node-version: 20`. |
| `npm run test:e2e` fails in CI with "browser not found" | Playwright browsers not installed | Add `npx playwright install --with-deps chromium` before the e2e step. |
| Duplicate/trailing-slash URL mismatch between canonical and sitemap | Host forces trailing slashes | `astro.config.mjs` sets `build.format: 'file'` — pages emit as `about.html` served at `/about` (no trailing slash), matching the no-slash canonicals + sitemap. Deploy to a host that serves `about.html` at `/about` without a 301 (Cloudflare Pages / Netlify do). If a host forces trailing slashes, either switch to `build.format: 'directory'` and add trailing slashes to the canonicals + sitemap, or pick a host that respects the file format. |
| Code-block comments look low-contrast | An old single-theme Shiki config | Already fixed — dual-theme (`github-light`/`github-dark-default`) in `astro.config.mjs`; don't revert it (WCAG AA). |

---

## Appendix — deployment facts at a glance

- **Framework/output:** Astro `output: 'static'` → `dist/` (prerendered HTML/CSS/JS).
- **Build:** `npm run build` = `astro check && astro build`. **Install:** `npm ci`. **Node:** ≥ 20.
- **Publish dir:** `dist`. **Server/adapter:** none. **Runtime secrets/env:** none.
- **Single build-time config:** `site` in `astro.config.mjs` (+ `base` only for sub-path hosts).
- **SEO artifacts (auto-generated):** `dist/sitemap.xml`, `dist/robots.txt`, per-page canonical/OG/Twitter, `Course`/`WebSite` JSON-LD.
- **Immutable-cache path:** `/_astro/*`. **Don't immutable-cache:** `*.html`.
- **JS budget:** each page ships only its needed island(s); renderers/algorithms are lazy-loaded per lesson (well under the 60 KB/page budget). No runtime network calls.
