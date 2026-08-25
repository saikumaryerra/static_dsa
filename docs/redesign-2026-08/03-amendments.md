# Redesign 2026-08 — spec amendments

Every Tier-2 constraint this redesign reopened (see `00-interpretation.md`), with what changed, why,
and which test had to be updated **deliberately** rather than deleted. Nothing in Tier 1 moved: no
backend, no new storage key, no behavioral tracking, no fabricated evidence, no killed mechanic
resurrected, no new npm dependency, and every surface still works with JavaScript off.

The sign-off is the brief's own sentence — *"You can deviate from limits and change spec limits or
constraints"* — plus, for the two decisions a person had to make, the answers given at the
2026-08-20 checkpoint: **the sticky instrument pane** and **self-hosting one typeface**.

---

## T-1 · The typeface

**Was** the system stack (`system-ui, -apple-system, "Segoe UI", Roboto, …`), chosen in M1 for a
0-byte cost, with §19 leaving "final font" open and §14 asking for "self-host fonts; preload" —
which M1 satisfied vacuously.

**Now** IBM Plex Sans and IBM Plex Mono, self-hosted, subset, preloaded.

**Why.** The system stack was never a choice about character; it rendered the product as a
different-looking thing on every operating system, and it is the single reason a well-built site read
as an unstyled one. Plex was chosen over Inter, Source Sans 3 and Public Sans on a **rendered**
comparison of the real hero, a real lesson heading, body prose, the ledger's numerals and a code
block — not on reputation. It won on two grounds specific to this product: its register is
engineering documentation, which is the subject's own world; and sans and mono are one family, which
makes the split this product depends on deliberate rather than accidental — the sans is the human's
voice and the mono is **the machine's** (step counters, ledger values, `lo`/`mid`/`hi`, metrics,
code). Before this, the machine spoke in whatever mono the reader's OS happened to ship.

**Measured, not estimated** (`src/styles/font-charset.ts` holds the numbers and a test asserts them
against the files on disk):

| file | bytes |
|---|---|
| `public/fonts/plex-sans.woff2` | 60,020 |
| `public/fonts/plex-mono.woff2` | 17,684 |
| **total** | **77,704 (75.9 KB)** |

Fonts are assets, not scripts, so the §4 "≤ 60 KB gzipped **per lesson page**" budget — which
`tests/e2e/js-budget.spec.ts` measures by gzipping the *script* closure — is unaffected. Reporting
this as a budget change would be misreporting it.

**The glyph blocker, and how it was solved.** Google Fonts' stock `latin` subset of *every* candidate
face lacks `→`, which this site's chrome sets sixty-odd times, along with `✓ ≥ ≤ ≈ ⁿ ₂`. That was
measured with CDP `CSS.getPlatformFontsForNode`, which reports the physical font the engine actually
resolved each glyph to — a `unicode-range` in the returned CSS says what was *requested*, not what
the file contains. The full upstream variable file covers them and is 352 KB. So `npm run fonts`
(`scripts/build-fonts.mjs`) requests a subset cut to exactly the characters this repo can render,
**derived by scanning `src/`** rather than hand-listed, in the same spirit as the OG card being
generated from the real renderer. Eleven geometric markers (`▲ ▶ ▼ ✕ ⌀ ∅ ⋯ ⁿ` and three
comment-only arrows) are still drawn by the reader's system font — exactly as they always were,
since they have only ever been set in the system stack.

**No italic file.** The italic subset measured 66,980 bytes to serve a few dozen short `<em>` spans;
browsers synthesise an oblique from the variable upright. Revisit if emphasis becomes load-bearing.

**CLS.** `size-adjust` / `ascent-override` / `descent-override` for the fallback faces are measured
in a shaping engine against Arial's metrics and written into `tokens.css` by the same script, so the
line box does not change height when the swap lands. A side benefit worth naming: the CI visual
baselines stop depending on whatever fontconfig resolves in the container, which is the flakiness
`README.md` warns about.

**Tests.** `tests/unit/font-charset.test.ts` is **new**: it re-derives the character set from `src/`
and fails if a character appears that the committed subsets do not cover, asserts the byte sizes
against the files, and pins the list of glyphs left to the system fallback. Adding a lesson with a
new symbol is now a failing test that says "run `npm run fonts`", not a silent fallback mid-word.

---

## L-1 · Two shells instead of one

**Was** `--container-max: 72rem` as the site's only width.

**Now** `--shell: 90rem` for pages with a genuine third column (the lesson), `--container-max` for
measure-led pages (`/about`, `/404`, `/glossary`, `/learn`). `BaseLayout` takes a `wide` prop.

**Why.** On a 1440px screen a lesson gave the visualization — the entire differentiator — 824px
inside the reading column, spent 240px on a table of contents, and left ~170px permanently empty.
Widening a shell that only ever holds one column of prose just moves the empty space, which is why
this is a prop and not a global change.

`--measure` went `70ch → 68ch` at the same time: Plex sets wider than the system stack it replaced,
so 70ch was a longer line than the one M2 measured and approved.

---

## L-2 · `<Bench>` — the instrument beside the prose

**Was** a lesson body as a single stream: prose, then a figure, then the sentence describing the
figure you had just scrolled past, then the run's table folded shut under both.

**Now** `src/components/Bench.astro`. A bench pairs **one** artifact with the prose that narrates it.
At ≥1200px and ≥640px tall the prose scrolls in the reading column while the artifact stays pinned
beside it; below that it is exactly the stack it always was. `<Bench solo>` opts a bench out of the
split where its prose is too short to give the pin any travel.

**DOM order is the mobile order and is unchanged** — heading, prose, instrument. The two columns are
a grid *placement*, never a reordering, so a narrow screen, a printed page and a screen reader all
get the sequence the prose was written for. Nothing is hoisted.

**The content moved with it.** For the pin to be worth anything the prose beside it has to be the
prose that explains it, so `## Intuition` and `## How it works` now live *inside* the first bench,
and the per-algorithm bullets in multi-instrument lessons moved into their own benches. This is the
part of the redesign that touched all fifteen lesson files.

`src/components/Band.astro` is its opposite number: a run of peer cards (Trace Trials) laid out
two-up at the same breakpoint, so a pair of small equal things stops reading as a list of
one-and-then-another.

**Also benched:** the complexity table (artifact right, its explanation left) and the Final Run card
(artifact right, the practice questions left).

---

## L-3 · The 15rem ToC rail is retired

**Was** a sticky rail at ≥1024px plus a sticky "On this page" bar below it — two implementations of
one idea, and the rail owned the column the instrument now needs.

**Now** the bar runs at every width. `.toc--rail` is retained in `TableOfContents.astro` for any
future surface that wants a static list; nothing renders it.

**Why the bar is the better of the two, independent of the space:** it names the section you are
**in** (`data-toc-current`, filled by the same scroll-spy that used to only tint a rail entry). The
rail could show a highlight but never a label, so on a 9,000px lesson it answered "where am I" only
if you looked away from what you were reading.

**Tests.** `tests/e2e/m7-wayfinding.spec.ts` asserted the rail's presence at ≥1024px; those
assertions move to the bar. The heading `scroll-margin-top` is one rule again (`--header-h +
--toc-bar-h + space`) instead of a pair that differed by breakpoint.

---

## S-1 · Five or six body sections, not seven

**Was** spec §7's seven-section body, including `## Visualizer`.

**Now** the visualization lives inside `## How it works`, and the `## Visualizer` heading is gone
from the lessons that had one. The six that remain — Intuition, How it works, Complexity, Code,
Common pitfalls, Practice — are unchanged and still required.

**This was already within the shipped contract.** `tests/e2e/m4-lessons.spec.ts` has said since M4
that *"multi-algorithm lessons legitimately fold the interactive viz into 'How it works', so the
literal 'Visualizer' heading is optional"*. The redesign makes every lesson that shape.

**The `#visualizer` anchor survives** as an id on the first bench, because the home hero links to
`/learn/binary-search#visualizer` and an external link may too.

**Tests.** `tests/e2e/binary-search.spec.ts` hard-coded all seven headings; it asserts six.

---

## F-1 · "Watch it happen" points at the instrument

**Was** `FinalRun` resolving its anchor to the *heading* a `<Visualizer>` sat under, falling back to
`#visualizer`.

**Now** it derives the instrument's own id through `instrumentIdFor` — the same read-only half of the
function `<StepLink>` uses and `Visualizer.astro` claims with — reading the renderer id out of the
very tag it already located.

**Why.** The heading was the best available answer while the drawing sat a screenful below its own
`##`. It is no longer where the drawing is, and on binary search there is no `## Visualizer` heading
left to fall back to. The build now fails if no matching `<Visualizer>` tag exists, which is a
truthful check where the old one had become a proxy. An *authored* `anchor` prop is still validated
against the real heading ids.

---

## C-1 · The ledger is open by default

**Was** `<details>`, closed.

**Why it changed.** The single best explanatory artifact this product has — the run written out, one
row per step, provably the same trace the drawing is showing — was a line of grey text a reader had
to guess was worth clicking. "Show your work" cannot be the thesis and also be folded shut.

The well is bounded (18rem, 12rem on a phone, `min(18rem, 26vh)` in a pinned pane) and every row
stays in the DOM, so a 200-row run costs a fixed height and scrolls inside itself. It is still a real
disclosure. Two side effects, both good: it now **prints** open (no stylesheet can open a closed
`<details>`), and **axe scans it on every run** rather than skipping it as `display: none` — the
blind spot spec §18 records.

---

## C-2 · Custom input is behind a disclosure

**Was** the "Try your own input" form, always open.

**Now** a `<details>` labelled **"Run it on your own input"**, directly under the transport.

**Measured reason.** On a 390px phone the controls region was 550px tall, of which this form was 300
— a reader who stepped the algorithm and wanted the next sentence scrolled past a form they had not
asked for. In a pinned stage column the whole instrument has to fit one viewport, which it does not
with the form permanently open. The summary is a real control that promises the thing the product is
proud of; the `<p>` legend it replaces said the same words with no way to act on them.

§10's "run each algorithm on your own input" is unchanged — it is one click, from a labelled control
in the same place the old legend was.

**Tests.** `tests/e2e/m7-player-v2.spec.ts` and any spec that types into the custom-input fields must
open the disclosure first.

---

## C-3 · The instrument measures itself, not the window

**Was** `@media (min-width: 640px)` deciding the control bar's layout.

**Now** `@container viz (min-width: 32rem)`, with `.viz` declaring `container: viz / inline-size`.

**Why.** The same instrument now appears at three very different widths on one viewport — full-bleed
on a phone, ~1150px in a solo bench, ~545px pinned in a stage column. The viewport query put
transport, scrubber and speed on one row inside a box that could not hold them, and the speed label
landed on top of the slider.

**32rem is measured twice.** A container query resolves against the **content** box, and `.viz`
carries a 1px border from 768px up — so a 545px pane queries as 543px and a 34rem (544px) threshold
missed it by one pixel on each side. 512px is also the honest floor for the row.

---

## D-1 · Difficulty chips badge the exception

**Was** a neutral chip on all fifteen curriculum cards. §19 listed this as needing designer sign-off.

**Now** the chip appears on a `/learn` card only when the difficulty is **not** `beginner` — two
cards out of fifteen.

**Why this is the original decision carried forward, not reversed.** `design-tokens-m1.md` made the
chips neutral because *"colouring thirteen beginner lessons as loudly as two intermediate ones would
invert the exception they exist to signal"*. Saying the default word thirteen times does the same
damage more quietly. **The lesson page keeps its chip unconditionally**: a reader arriving from a
search result has no comparison set in front of them, so the word is metadata rather than noise. The
rule is about the grid, not the chip.

---

## G-1 · The glossary has a filter

**Was** deferred in §19 as an owner decision — *"Glossary search island (~1 KB)"*.

**Now** shipped. It filters markup that is already on the page: no index, no fetch, no store, no
debounce. It matches the term, its aliases **and** its definition, because a reader who half
remembers "the one about wrapping around" should find `Circular buffer`. It ships `hidden` and the
island reveals it — a text field that cannot filter is worse than no field. The A–Z nav is hidden
while a filter is active, because its chips would jump to letters that are now empty.

Result counts are stated in words (`4 terms matching "hash"`), never as a ratio, so the calm
vocabulary rules hold. The no-match state says what to do next rather than apologising.

## G-2 · The glossary is two columns

Forty-six definitions in one column made a 10,881px page whose right half was empty at every scroll
position. Multi-column (not grid — a dictionary flows, and grid rows would align every letter group
to the tallest in its row) from 900px, with `break-inside: avoid` so no letter heading is orphaned.
**Measured: 10,881px → 7,745px at 1280px.**

---

## H-1 · The home hero mounts the real instrument

**Was** a still: a frozen frame of binary search, produced by the real renderer so it could not
drift, with "Play it in the lesson →" underneath.

**Now** the same `<Visualizer>` island a lesson uses, on the same trace, with its ledger open.

**Why.** A product whose entire claim is *you can step through this* opened by showing a photograph
of stepping through it and asked the visitor to navigate twice before the claim could be checked. It
is not "kept in sync" with the lesson any more — it **is** the lesson's instrument.

**What it deleted:** ~130 lines from `src/pages/index.astro` — the `renderStatic` call, the
frame-picking derivation, the build-time assertion that the renderer still emits nine class names,
and ~110 lines of `.hero-demo__canvas :global(…)` CSS that restated the renderer's own stylesheet
because the still was drawn outside the island that owns it. All of it existed to keep a hand-placed
copy of the product in step with the product.

**Cost:** `/` now ships the player, the array renderer and the binary-search algorithm chunks where
it previously shipped 1.7 KB gz of resume-line logic. `tests/e2e/js-budget.spec.ts` prints the real
per-page table on every run; read that number rather than one copied into a doc.

`allowCustomInput={false}` on the hero only: the custom-input form is the one control that needs its
own explanation (formats, caps, a target field), and the hero's job is to get a stranger to press
Play. The lesson two clicks away does the rest, and the third promise on the page says so in words.

## H-2 · The continue line is for returning readers only

It used to ship visible and server-rendered pointing at lesson 01, so a JS-off reader had a true
link. The primary CTA now says exactly that — "Start with lesson 01" — so on a first visit the two
said the same thing twice, one under the other. It ships `hidden` and the island reveals it only
once it can see at least one completed lesson on this device. Nothing is lost with JavaScript off:
the CTA above is the same destination.

---

## U-1 · Every published URL carries a trailing slash

**Not from this redesign.** This entry records **Plan D, stage D1**
(`docs/superpowers/plans/2026-08-21-plan-d-portable-artifact.md` §5.1/§5.2, shipped 2026-08-21). It
lands in this file because this is where the repo keeps *what moved, why, and which test moved with
it* — the ledger outgrew the redesign that started it.

**Was** `build.format: 'file'` with no `trailingSlash` setting. Routes were emitted as
`about.html` and `learn/binary-search.html` and served at `/about` and `/learn/binary-search` by
hosts that resolve the extension for you. The config comment labelled the decision **C1** and gave
its reason — *"emit `about.html` (served at /about, no redirect) instead of `about/index.html`
(served at /about/), so the no-slash canonicals + sitemap are literally correct"* — and
`deployment.md` §0 carried it forward as a reason to prefer Cloudflare or Netlify. **This amendment
reverses a decision that was documented as deliberate**, which is why it is written down rather than
flipped quietly.

**Now** `build.format: 'directory'` and `trailingSlash: 'always'`. Every route is a directory with an
`index.html`, published at a slash URL — `/about/`, `/learn/binary-search/` — with the home page
`dist/index.html` served at `/`. Of the 21 pages built, `dist/404.html` is the one that does not move
(measured): directory format leaves it at the root, correctly, because a 404 is not a page with an
address — it is the document a host serves *instead of* whatever was asked for.

**Why — requirement R2, "any host, including a plain static server."** `format: 'file'` does not
serve `/about`; it *asks the host to guess* that `/about` means `about.html`. Cloudflare, Netlify,
Vercel and GitHub Pages all guess right. `python -m http.server`, a default nginx and an S3 website
endpoint all 404. `about/index.html` served at `/about/` is the shape **every** one of those hosts
serves natively with no configuration, so directory format is simply what "runs anywhere" costs. The
slash is load-bearing for what comes after it, too: a relative URL resolves against the **document**
URL, so `../glossary/` is correct from `/learn/binary-search/` and lands one level wrong from
`/learn/binary-search`.

**The defect the stage exists to close.** Flipping the two constants alone leaves the site serving
`/learn/binary-search/` while every URL it *declares* — `<link rel="canonical">`, `og:url`, all 19
sitemap `<loc>`s — still names `/learn/binary-search`. A page self-canonicalizing at a URL its own
host redirects away from is invisible in a green test run: nothing 404s for a reader, the site just
tells every crawler its real address is somewhere else. Closing that is the substance of D1; the
config flip is two lines of it.

**Measured, and it is why this is not tidiness:** `astro preview` answers the slashless form with a
**404, not a 301** (`/about` → 404, `/about/` → 200). So every authored internal link had to gain
the slash — a hard requirement, enforced by the suite rather than by review.

**What moved with it.** `NAV_ITEMS` hrefs (`/learn/`, `/glossary/`, `/about/`), the breadcrumb,
prev/next and lesson cards, the three page-level `canonicalPath` props that have a path
(`/about/`, `/glossary/`, `/learn/`) plus `LessonLayout`'s `` `/learn/${slug}/` ``,
`sitemap.xml.ts`'s `STATIC_PATHS` and lesson paths, the `Course` JSON-LD `url`, and **41
hand-authored internal links in lesson prose** across 32 lines in 15 MDX files — 40 into the
glossary (`](/glossary/#array)`) plus one lesson-to-lesson (`](/learn/recursion/)`), with the slash
on the path *before* the fragment, never after it.

**One thing churned that the artifact does not show.** `instrumentIdFor`
(`src/viz/core/instrument-id.ts`) hashes `Astro.url.pathname`, and the build-time pathname moved
from `/learn/binary-search.html` to `/learn/binary-search/` — so every generated instrument id
(`viz-<algorithm>-<hash>`) changed once. Nothing is broken: every anchor and `<StepLink>` target was
re-verified to resolve, because the ids are derived on both sides from the same pathname. It is
recorded because Plan C's guarantee is that ids are *stable*, and this is the one event that moved
them. D2 and D3 will not move them again — the relative-URL pass rewrites emitted links, and the
origin stamp touches metadata; neither changes `Astro.url.pathname` at build time.

**What deliberately did not move — in D1.** Internal links stayed **root-absolute**, and the origin
stayed a build-time constant resolved in `astro.config.mjs` (`SITE_URL` → `CF_PAGES_URL` on `main` →
`PRODUCTION_URL`). **Both of those moved afterwards, in stages D2 and D3 — see U-2**, which is where
the relative-URL pass and the deploy-time origin are recorded. `/` and `/404`'s canonicals are
unchanged by either stage: both are already `/`, and the 404 pointing at the home page is the
design, not an oversight.

**The landmine, and why it became a unit test.** `SiteHeader` decided "which nav item is current" by
normalizing the *pathname* and comparing it to a raw `NAV_ITEMS` href. Slash the hrefs and **both**
comparisons break at once: `'/learn' === '/learn/'` is false, and the descendant probe asks for
`startsWith('/learn//')`, which no path satisfies. The second failure is silent — no 404, no console
error, just a header that stops saying where you are, which is the M7.1 IA-9 defect returning by the
back door. So the rule moved out of `.astro` frontmatter into `src/lib/nav.ts` as an exported pure
function that normalizes **both** sides, beside the hrefs it normalizes, where it cannot drift from
them — and where the Vitest harness (`environment: 'node'`, no DOM) can actually test it.

**Now is the only cheap moment.** No custom domain is live, so there is no URL to redirect, no index
to migrate and no inbound link to break. The same change after launch costs a redirect map and a
re-crawl.

**Tests.**

- `tests/e2e/url-shape.spec.ts` is **new** and is the invariant this amendment moved: for every page
  walked out of `dist/`, the URL the document declares is the URL it was fetched from (canonical and
  `og:url`, compared on pathname, fetched with `maxRedirects: 0` so a redirect hop cannot hide);
  every sitemap `<loc>` is slashed and returns 200 directly; **no built page links to a slashless
  page URL** — a class check over the built HTML, which is what catches the 40 prose links that no
  survey of `.astro` files would have seen; and the slashless form is confirmed *not* served. The
  page list is walked, not typed, so a page added tomorrow is covered tomorrow.
- `tests/unit/nav.test.ts` is **new**: pins `NAV_ITEMS` to slashed hrefs and `navCurrent` across the
  shapes a static host really serves (`/learn/`, `/learn`, `/learn/index.html`, `/learn.html`),
  including the property no single case can state — at most one nav item is ever marked.
- **Five aria baselines re-seeded and the diff read**, per §18's own blind spot: `toMatchAriaSnapshot`
  matches a subset, so a green run would not have shown the nav's hrefs moving. Every changed line
  in those five files is a `/url:` line — nothing else in the accessibility tree moved, which is the
  evidence that this stage changed addresses and not structure.

---

## U-2 · The artifact is portable; the origin is a deploy-time input

**Not from this redesign either.** This entry records **Plan D, stages D2 and D3**
(`docs/superpowers/plans/2026-08-21-plan-d-portable-artifact.md` §4.2–§4.6, both shipped
2026-08-25), the two stages U-1's trailing slash was the precondition for. It sits beside U-1 for
the same reason U-1 sits here: this file is where the repo keeps what moved, why, and which test
moved with it.

**Was** every internal URL root-absolute (`/glossary/`, `/_astro/…`, `url("/fonts/…")`), and the
production origin a build-time constant resolved by a three-tier heuristic — `SITE_URL` →
`CF_PAGES_URL` on `main` → a `PRODUCTION_URL` literal in `astro.config.mjs`. One `dist/` therefore
worked at exactly one place: the root of whatever origin that literal named. `deployment.md` §2.2
advertised Astro's `base` as the way to deploy under a sub-path.

**Now** one artifact runs at **any origin and any sub-path**, and the deployment URL is supplied
when you deploy rather than when you build:

- `npm run build` ends in **`scripts/portablize.mjs`**, which rewrites every root-absolute
  navigational URL in `dist/` to a document-relative one — `href`, `src`, `srcset`, `action`, plus
  `url(/fonts/…)` in the built CSS — using the page's own depth (`./` at `/`, `../../` on a lesson).
  Measured on the shipped build: 519 `href` + 102 `src` values across 20 pages, 2 CSS `url()`s.
- **`src/lib/deployment-url.ts`** is the one builder for every *declared* URL (canonical, `og:url`,
  `og:image`, `twitter:image`, sitemap `<loc>`, robots' `Sitemap:`, JSON-LD `url`).
- **`astro.config.mjs` reads `SITE_URL` and nothing else**, falling back to the sentinel
  `https://learndsa.invalid`; a Cloudflare build (`CF_PAGES` set) without it **throws**.
- **`npm run rehost <deployment-url>`** stamps a built `dist/` for hosts with no build step.

**Why — requirements R1 and R3** ("one artifact, any origin, no rebuild"; "any sub-path"). U-1's R2
made the artifact serveable by any host; these two make it serveable at any *address*.

**The finding that shaped it: Astro cannot emit relative URLs, so this could not be done in
config.** `base` is root-absolute by contract and has no `'./'` mode; `assetsPrefix` is one fixed
string while this site has pages at three depths. Worse, `base` would have moved only what Astro
itself generates — every hand-authored link (nav, breadcrumbs, lesson cards, the 40 glossary links
in lesson prose) would have stayed root-absolute and broken **silently**, rendering a correct-looking
page with dead navigation. A post-build pass over `dist/` catches Astro's URLs and the hand-written
ones uniformly, and it can be proved by one assertion instead of by reviewer vigilance across every
call site.

**Three defects this stage found by building it, each invisible from a green run.**

1. **Vite's preload helper assembled a root-absolute base at runtime.** The plan measured "0
   root-absolute refs inside built JS chunks" — true of *literals*, and wrong about behaviour: the
   helper emitted `function(dep){return"/"+dep}`, so every lazily imported chunk's `modulepreload`
   was fetched from the origin root — six 404s per lesson page under a sub-path, while the dynamic
   `import()` beside it resolved relatively and the island hydrated fine. `vite.experimental
   .renderBuiltUrl` is the only lever for it; the build now pins it.
2. **Three links are built at runtime inside client chunks**, where no HTML pass can rewrite a
   template literal: the resume CTA on `/` and `/learn/`, and the review cards. Written as
   `/learn/${slug}/` they leave a sub-path deployment — and every one of them is conditional on
   stored progress, so the reader who meets them is a **returning** one, i.e. exactly the person a
   fresh-profile portability test never simulates. They now resolve against `SiteHeader`'s wordmark
   (`[data-site-root]`), whose href the pass rewrites per depth; `siteRoot()`, `lessonHref()` and
   `reviewHref()` in `src/lib/progress.ts` are the whole of it, and no island does depth arithmetic.
3. **`new URL('/learn/x/', 'https://sample.com/learndsa')` is `https://sample.com/learn/x/`** — a
   root-absolute path *replaces* a base path — and `new URL(site).origin` throws the sub-path away by
   definition. Both shapes were live in the code. That is why `deploymentUrl` exists and why it also
   normalizes: it strips a stray `(/index)?.html` (`BaseLayout`'s `canonicalPath ?? Astro.url
   .pathname` default is a live path on `/dev/renderers/`) and enforces U-1's trailing slash, while
   leaving `/og-default.png` and `/sitemap.xml` slashless.

**The one carve-out: `dist/404.html` keeps root-absolute links.** A 404 is served at the URL the
reader typed, so a relative link on it would resolve against an arbitrary path; there is no JS-off
fix (a `<base>` tag breaks every fragment link on the site, and a script violates spec §13). Instead
its links get the deployment's **base path** prefixed — by the build when `SITE_URL` carries one, by
`rehost` when a sentinel artifact is stamped later, through **one** function. When only `rehost` had
it, a host with a build step *and* a sub-path (GitHub Pages via Actions) shipped a 404 that was
unstyled and whose every escape link left the deployment, with nothing printed to say so.

**What deliberately did not move.** `base` is still never set. The 404 stays root-absolute. Declared
URLs stay absolute — "zero hostnames in the artifact" is not reachable, because the sitemap protocol
and OG scrapers both require an absolute URL — so the artifact carries exactly one hostname, in
metadata, and knows it is a placeholder until stamped. And `rehost` has no `--noindex` flag; making
a mirror non-public is a ten-line addition if it is ever wanted.

**Three limitations accepted with it**, documented in `docs/deployment.md` §2.4: a sub-path
deployment's `robots.txt` is never read (the standard makes it origin-root-only), `localStorage` is
origin-scoped so two deployments on one origin share every progress key, and self-canonicalizing
means two *public* mirrors compete in search.

**Tests.**

- **The build asserts its own output** — this is the half that cannot rot. `portablize.mjs` exits 1
  if a root-absolute URL survives in any page or stylesheet, if a JS chunk carries a `/_astro/`
  literal, a root-absolute link literal or a runtime-assembled root base, or if any page ships
  without exactly one `[data-site-root]` anchor pointing at its own depth's root. It also refuses to
  run twice over one `dist/` (the 404 prefix is incremental), using the signal that cannot be faked:
  a fresh build has hundreds of URLs to rewrite, a portablized one has none.
- `tests/e2e/portable.spec.ts` is **new** and is the claim itself: a ~90-line `node:http` fixture
  (no new dependency) serves the same `dist/` under a two-segment prefix on port 4322 as a
  deliberately dumb host — no extension guessing, no redirects — and the spec walks home → `/learn/`
  → a lesson watching the **network**, because a stylesheet or chunk requested at the wrong path
  does not throw, it 404s quietly. It seeds progress so the two runtime-built links are clicked, and
  it never spells the prefix out, so a hardcoded path cannot pass it.
- `tests/unit/portablize.test.ts`, `tests/unit/deployment-url.test.ts` and `tests/unit/rehost.test.ts`
  are **new** (the pure halves: depth arithmetic, skip rules, query/fragment reattachment, the join
  and its normalization, the stamp's precondition states). One of them reads `astro.config.mjs` and
  asserts its `SENTINEL` literal equals `rehost`'s — a silent disagreement there would mean the
  stamp finds nothing to replace on a perfectly normal build.
- `tests/e2e/url-shape.spec.ts` was **strengthened, not relaxed.** Its old form read `href="/…"` and
  would have gone vacuous the moment links became relative; it now *resolves* every internal link
  against the page that carries it and requires the target to exist in the build — which also
  catches a prefix one level off, a failure the old rule could not see. A second test pins the
  pipeline: zero root-absolute URLs in any page, and `404.html` proven to still carry them.
- **Four aria baselines re-seeded and the diff read**, per §18's blind spot: 236 changed lines, 118
  insertions against 118 deletions, and **every one of them a `/url:` line** — the evidence that
  this stage changed addresses and not structure. `not-found.aria.yml` did not change at all, which
  is the 404 carve-out confirming itself.

---

## Not reopened, and why

- **The achromatic chrome.** Not deference — it is the best idea in the system. "Colour belongs to
  the machine; the chrome spends none" is why a running algorithm is the brightest object on screen,
  and the brief's own §25 asks for exactly that register. Not one colour token changed.
- **Every mechanic killed on ethics or pedagogy** in `docs/m8-gamification.md` — XP, levels, badges,
  streaks, leaderboards, certificates, timed challenges, personal bests, decay. The brief agrees
  (§32).
- **The two deletions settled by measurement** in spec §19.1 — cost withholding and a vertical
  legibility floor for RSP-2. Neither was re-proposed; nothing here adds a `max-height` or an
  `overflow` to any SVG canvas.
- **Social proof of any kind.** There are no testimonials, ratings, user counts, logos or benchmarks,
  because the product has never been publicly measured. The home page says what it costs you
  instead, which is the true thing it has to say.
