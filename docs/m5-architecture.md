# M5 Design Doc — Glossary, Head/Meta, SEO Infrastructure

**Author:** Systems-Architect · **For:** Frontend-Engineer (implementer), Lead-Developer (review), QA-Engineer (Lighthouse/axe)
**Scope:** M5 architecture only. Visual/copy design of Home/About is owned by UI_UX-Designer (docs/m5-design.md) except where the engineering seam is delineated.

---

## 0. Executive Summary

Glossary terms live in a single typed, build-validated data file (`src/lib/glossary.ts`) whose `lessonSlug`s are cross-checked against the lessons collection so a dead link fails the build; SEO is delivered by promoting `BaseLayout` to a typed head hub (title/description/canonical/OG/Twitter + a `head` slot for JSON-LD), one static 1200×630 OG image, a hand-rolled `sitemap.xml.ts` endpoint plus `robots.txt.ts`, and per-lesson `Course` JSON-LD — all build-time, zero client JS. **Net new dependencies for M5: zero.**

---

## 1. Glossary Content Model

### 1.1 Decision: a dedicated typed data file — `src/lib/glossary.ts`

Rejected "derive from lesson frontmatter": it requires a schema change to `content.config.ts` and re-touching all 14 `.mdx` files, and frontmatter is the wrong home for cross-cutting A–Z vocabulary. Option (a) keeps lesson frontmatter frozen (spec §7 has no glossary field) and colocates all glossary concerns in one reviewable file.

**Trade-offs disclosed:** (1) drift risk — the term→lesson mapping is hand-maintained; build-time `lessonSlug` validation catches deleted/renamed lessons but not semantic drift (content-review concern). (2) no auto term extraction — new jargon won't auto-appear; the glossary is a curated list.

### 1.2 Data shape

```ts
// src/lib/glossary.ts
export interface GlossaryTerm {
  term: string;          // display term, canonical casing, e.g. "Big-O notation"
  definition: string;    // 1–2 sentence definition (spec §8), plain text
  lessonSlug: string;    // slug of the lesson that INTRODUCES the term (spec §6)
  aliases?: string[];    // rendered as "Also called: …" since M7.2 (was unrendered in v1)
}

export const glossary: GlossaryTerm[] = [ /* seed §1.5 */ ];
```

### 1.3 How `/glossary.astro` consumes it — static, zero island JS

1. **Validate** every `lessonSlug` against published lessons; throw (fail build) on any miss — same pattern as the duplicate-slug guard in `learn/[slug].astro`:
   ```ts
   const published = await getCollection('lessons', ({ data }) => data.published);
   const slugs = new Set(published.map((l) => l.data.slug));
   for (const t of glossary) if (!slugs.has(t.lessonSlug))
     throw new Error(`Glossary term "${t.term}" → unknown/unpublished lesson "${t.lessonSlug}".`);
   ```
2. **Sort A–Z** case-insensitively (`localeCompare`, `sensitivity:'base'`).
3. **Group by first letter** (uppercased; non-alpha → `#` bucket — SPEC-GAP: §8 silent on numerics, `#` is the simplest correct). `letters` = only non-empty buckets → drives the jump bar; empty letters render disabled/greyed, non-focusable.
4. **Render:** `<section id="letter-A">` per bucket + heading; each entry `<dt>`/`<dd>` = term + definition + "introduced in →" link to `/learn/{lessonSlug}`. Resolve the link's visible lesson title from the collection (don't hardcode titles in glossary.ts). Jump bar = `<nav aria-label="Jump to letter">` of in-page anchors; `scroll-margin-top` (mirror LessonLayout's `5.5rem`) on letter sections.

A11y: one `<h1>`, `<h2>` per letter, labelled `<nav>`, definition-list semantics, no color-only signals, fully keyboard-operable. One of the four axe-tested pages (§17) — must be zero-critical.

### 1.4 Head/meta for `/glossary`
`title="Glossary · LearnDSA"`, `description="A–Z reference of the data-structure and algorithm terms used across LearnDSA, each linked to the lesson that introduces it."`, `canonicalPath="/glossary"`, `ogType="website"`.

### 1.5 Seed term list (MODEL + mapping; real definitions authored at implement, not lorem §15)

> **SPEC-GAP — slug reconciliation:** slugs below are inferred; the FE MUST reconcile each against actual `.mdx` frontmatter. The §1.3 validator fails the build on mismatch, so this is self-correcting. NOTE the actual authored slugs: `complexity-big-o, arrays, linked-lists, stacks, queues, hash-tables, trees-bst, heaps, graphs, recursion, binary-search, sorting-basics, sorting-efficient, graph-traversal`. There is NO DP lesson yet (M6) — omit memoization until then.

~42 terms across the lessons: Big-O notation / Time complexity / Space complexity / Logarithmic time → complexity-big-o; Array / Index / In-place → arrays; Linked list / Node / Pointer → linked-lists; Stack / LIFO → stacks; Queue / FIFO / Circular buffer → queues; Hash function / Bucket / Collision / Chaining → hash-tables; Tree / Binary search tree / Leaf → trees-bst; Heap / Heapify → heaps; Graph / Adjacency list / Adjacency matrix → graphs; Recursion / Base case / Call stack → recursion; Binary search / Linear search → binary-search; Bubble sort / Selection sort / Insertion sort → sorting-basics; Merge sort / Quick sort / Partition / Divide and conquer → sorting-efficient; Breadth-first search / Depth-first search → graph-traversal. (Memoization → DP lesson: OMIT until M6.)

---

## 2. Head/Meta Architecture

### 2.1 Problem (M1 review flag)
`BaseLayout` hardcodes `<head>`, exposes only `title` + `description`. M5 needs per-page canonical override, `og:type=article`, `og:image`, and per-page JSON-LD. Fix: make BaseLayout the single head hub with richer typed Props + one named slot for head injection.

### 2.2 New BaseLayout Props
```ts
interface Props {
  title: string;
  description: string;
  canonicalPath?: string;   // default Astro.url.pathname (current behavior)
  ogType?: 'website' | 'article';  // default 'website'
  ogImage?: string;         // default site default (§5); resolved absolute via new URL(_, Astro.site)
}
```
Canonical/OG URL stays `new URL(path, Astro.site)` → absolute, driven by `Astro.site`, so the placeholder-domain swap propagates via one edit. Head additions from props (no duplication): `og:type` ← ogType (was hardcoded); `og:image` ← absolute ogImage; `twitter:card` `summary` → `summary_large_image`; add explicit `twitter:title/description/image`.

### 2.3 The head slot (resolves M1 flag)
Add one named slot in `<head>` after the meta block: `<slot name="head" />`. Pages inject JSON-LD (+ future head tags) through it:
```astro
<script type="application/ld+json" slot="head" set:html={jsonLd} is:inline />
```
One source of truth: every meta/OG/Twitter/canonical tag emitted once in BaseLayout from props. Pages never write their own `<title>`/`<meta>`. LessonLayout passes `ogType="article"` + `canonicalPath` and forwards JSON-LD into the slot.

### 2.4 Exact per-page passing

| Page | title | description | canonicalPath | ogType | head slot |
|---|---|---|---|---|---|
| Home `/` | (existing) | (existing) | `/` | website | optional `WebSite` JSON-LD (§3.3) |
| `/learn` | "Learn · LearnDSA" | (existing) | `/learn` | website | ItemList DEFERRED (§3.3) |
| Lesson | `${title} · LearnDSA` | `frontmatter.summary` | `/learn/${slug}` | **article** | `Course` JSON-LD (§3.1) |
| `/glossary` | "Glossary · LearnDSA" | §1.4 | `/glossary` | website | — |
| `/about` | "About · LearnDSA" | "What LearnDSA is, who it's for, and how the interactive visualizations work." | `/about` | website | — |
| `/404` | "Page not found · LearnDSA" | "This page doesn't exist…" | `/` | website | `<meta name="robots" content="noindex">` via head slot |

404 is axe-tested (§12) but NOT a Lighthouse target page (§17 = home/lesson/glossary) — keep correct, don't over-invest.

---

## 3. JSON-LD Structured Data

### 3.1 Lesson pages — `Course` (build-time, via head slot from LessonLayout)
```jsonc
{ "@context":"https://schema.org", "@type":"Course",
  "name":"<title>", "description":"<summary>", "url":"<abs canonical>",
  "inLanguage":"en", "isAccessibleForFree":true,
  "educationalLevel":"<difficulty>", "keywords":"<tags joined>",
  "provider":{"@type":"Organization","name":"LearnDSA","url":"<site origin>"} }
```
> SPEC-GAP: omit `hasCourseInstance` (no schedule/instructor for a static free lesson) — valid schema.org, satisfies §14 "nice-to-have", won't earn a Course rich snippet (accepted).

Helper `src/lib/structured-data.ts` → `courseJsonLd(entry, siteUrl): string`. Inject via `<script type="application/ld+json" slot="head" set:html is:inline>`. `is:inline` keeps it static (zero client JS). **Escaping:** replace `<` with `<` in the serialized string (XSS-safe JSON-LD embedding).

### 3.3 Optional site-level: `WebSite` on Home — INCLUDE (2 lines). `ItemList` on /learn — DEFER (`// SPEC-GAP:` note).

---

## 4. sitemap.xml + robots.txt

### 4.1 Decision: hand-roll both. Reject `@astrojs/sitemap`.
Both are build-time/zero-client-JS. Hand-rolled chosen for: zero new dependency (no SPEC-GAP needed), total control of inclusion (exclude `published:false` + `/404`, testable). Trade-offs: we own correctness for new route types (mitigated: static routes in one commented place, lessons enumerated dynamically); no free `lastmod`/`priority` (advisory, absence doesn't hurt SEO).
> Fallback if Lead prefers first-party: `@astrojs/sitemap` with SPEC-GAP (first-party, build-time, zero client JS). Recommendation stands: hand-rolled.

### 4.2 `src/pages/sitemap.xml.ts` — Astro static endpoint (`GET`), prerendered to `dist/sitemap.xml`.
Enumerates static `/`, `/learn`, `/glossary`, `/about` (exclude `/404`) + every published lesson `/learn/${slug}`. Each `<loc>` absolute via `new URL(path, site).href`. `Content-Type: application/xml`.

### 4.3 `src/pages/robots.txt.ts` — endpoint (recommended over static public/ file so origin stays single-source):
```
User-agent: *
Allow: /

Sitemap: <abs>/sitemap.xml
```
> SPEC-GAP: a `public/robots.txt` can't template `Astro.site`; the endpoint reads it so the domain lives only in `astro.config.mjs`. Trade-off: slightly less obvious than a plain file (worth it for single-source origin).

---

## 5. OG Images

### 5.1 Decision: one static branded `public/og-default.png` 1200×630, site-wide. Defer per-page generation.
Reject satori/`@vercel/og`/sharp/canvas — heavy build dep for cosmetic per-lesson cards. `// SPEC-GAP:` in BaseLayout noting §14 "OG images" satisfied dependency-free by a static default; per-page generation deferred. Trade-offs: no per-lesson differentiation (accepted v1); artwork is a UI_UX-Designer handoff (placeholder PNG until final). `og:image` absolute via `new URL(ogImage, Astro.site)`.

---

## 6. Home Polish — Engineering vs Visual

The M1 home hardcodes track counts (`"9 lessons · ~70 min"`, `"6 lessons · ~50 min"`) + "fifteen lessons" — stale-data risk.
**Engineering (FE scope):** derive track cards from `getCollection` (like `/learn`): group by track, compute `length` + summed `estimatedMinutes`; replace hardcoded meta + the count. Wire head/meta per §2 (+ optional WebSite JSON-LD). Optionally deep-link track cards to `/learn#track-foundations`/`#track-algorithms` anchors.
**Visual/copy (Designer scope):** hero layout/typography, feature-blurb wording/icons, spacing. Engineering guarantees the data feeding those blocks is live; do NOT re-hardcode counts.

---

## 7. Performance / Lighthouse Architecture

To hit Perf ≥95 / A11y 100 / Best-Practices ≥95 / SEO ≥95 (§14, §17) on home + lesson + glossary:
- **Zero-runtime-JS:** /glossary + /about ship NO island JS (jump bar = anchors). Home ships only ThemeToggle. JSON-LD is `is:inline` static text. sitemap/robots/meta are build-time. No M5 code enters any client bundle.
- **No CLS:** viewBox + explicit width/height on any media; system font stack = no font-swap. **Do NOT add a font preload** — nothing to preload under the system stack (§14's "preload primary font" is N/A; leave a note so no one adds a spurious preload).
- **SEO completeness:** unique title + meta description per page, absolute canonical, OG + Twitter, valid sitemap reachable from robots, crawlable `<a href>`; `noindex` only on 404.
- **A11y 100:** `<html lang="en">` (already), one h1/page, logical heading order, inherited landmarks + skip link, labelled jump-bar nav, no color-only, disabled empty-letter buttons non-focusable.
- **Best-Practices:** summary_large_image + complete OG, no console errors, JSON-LD `<` escaping.

> **FLAG to QA/Lead:** Lighthouse is NOT in the toolchain (§4 = Vitest/Playwright/ESLint/Prettier). §17 M5 requires Lighthouse numbers. QA must stand up a mechanism — `@lhci/cli` against built `dist/` via preview server, or manual `npx lighthouse` on the three pages. LHCI is a DEV dependency (doesn't touch client bundle/§4 runtime constraints) but needs a `// SPEC-GAP:` note + Lead sign-off. axe already available via Playwright.

---

## 8. Files — Create / Modify

**Create:** `src/lib/glossary.ts` (type + seed); `src/pages/glossary.astro` (validate/sort/group/jump-bar/links); `src/pages/about.astro` (what/who/how-viz; structure engineered, prose/visual per designer); `src/pages/404.astro` (if absent — verify M1; noindex via head slot); `src/pages/sitemap.xml.ts`; `src/pages/robots.txt.ts`; `src/lib/structured-data.ts` (`courseJsonLd` + optional `webSiteJsonLd`, escaped, unit-testable); `public/og-default.png` (1200×630, placeholder until designer art).

**Modify:** `src/layouts/BaseLayout.astro` (extend Props, add head slot, emit og:type/og:image/full Twitter, summary_large_image, default ogImage); `src/layouts/LessonLayout.astro` (pass ogType=article + canonicalPath, inject Course JSON-LD); `src/pages/index.astro` (derive track counts from collection, optional WebSite JSON-LD, optional anchor deep-links); `src/pages/learn/index.astro` (ItemList DEFER — `// SPEC-GAP:` note); `astro.config.mjs` (NO change — placeholder `site` is the single origin source; real-domain swap is the one-line edit propagating everywhere).

**New dependencies:** none (runtime or build). `@astrojs/sitemap` rejected. Only possible addition = QA-owned dev-only Lighthouse tool (§7), flagged not decided.

---

## 9. Handoffs
- **FE:** build §8; reconcile §1.5 slugs against real `.mdx` (validator fails build on mismatch); author real glossary definitions (§15); do NOT re-hardcode home counts; keep glossary/about island-JS-free.
- **Designer:** Home hero/feature/track visuals, glossary/about visual treatment, final 1200×630 og-default.png. Data/structure engineered; don't re-hardcode counts.
- **QA:** axe on home/lesson/glossary/404 (zero critical); stand up the Lighthouse mechanism (§7) — new devDependency needs SPEC-GAP + Lead sign-off; unit test structured-data.ts (shape + `<` escaping); if cheap, assert sitemap contains published lessons + excludes unpublished.
- **Lead/deploy:** all M5 output prerendered (output:'static'); no server, no secrets. The ONE env coupling is `site` in `astro.config.mjs` — set the real origin BEFORE the M5 Lighthouse/SEO acceptance run or canonical/OG/sitemap point at the placeholder.

**Open SPEC-GAPs:** `#`/numeric glossary bucket; robots endpoint vs static; `Course` omits `hasCourseInstance`; `ItemList` deferred; per-page OG deferred; no font preload; slug reconciliation; Lighthouse tooling not in toolchain.
