# M5 Design Handoff — Glossary, About, Home Polish

**Status:** Ready for Frontend Engineer implementation
**Consumer:** `frontend-engineer` (coordinated by `lead-developer`); validated by `qa-engineer`
**Scope:** M5 — new `/glossary` and `/about` pages + polish of `/` (Home). Chrome, tokens, and component conventions inherited from M1 (`docs/design-tokens-m1.md`) and M2 (`docs/m2-design.md`).
**Reuses:** every existing token. **No new tokens, no new colors.** Saturated color stays reserved for `--hl-*` (viz only). Reuse `.btn-primary`, `.btn-secondary`, `.track-card`, `.nav-link`, `.difficulty-chip`, `.sr-only`, and the global `:focus-visible` ring.
**Coordination:** the glossary data model is owned by `docs/m5-architecture.md`. This doc owns presentation; §1.7 lists the fields the presentation consumes (`term / definition / lessonSlug / lessonTitle`) — the architect's field names win, the FE adapts the template.

---

## UX Rationale

Glossary and About are low-frequency, high-trust reference surfaces: instantly scannable, fully usable without JavaScript (a learner landing cold from search still gets the definition and a route into the lesson). Home polish is confidence and rhythm — nothing that ships bytes or shifts layout; the win is typographic hierarchy, whitespace cadence, and replacing M1's hardcoded track numbers with real data-driven counts.

---

## 1. Glossary page (`/glossary`)

### 1.2 Wireframe (inside BaseLayout `<main>`; mobile-first, `md:` deltas)

```
[Glossary root]  padding-block-start --space-12 (md: --space-16); pb --space-16; max-width --measure
  [Page header]  (id="top")
    ├─ H1 "Glossary"  --text-3xl; weight 700; --tracking-tight
    └─ Intro  --text-lg --text-muted --leading-relaxed; mt --space-4
          "Every term the lessons introduce, defined in one or two sentences and linked back to where you first meet it."
  [Jump-to-letter bar]  <nav aria-label="Jump to letter">  mt --space-8 (md: sticky, §1.3)
      <ul> flex flex-wrap gap --space-1
        ├─ present letter → <a href="#letter-a">A</a>  (chip)
        └─ empty letter   → <span aria-disabled="true">Q</span>  (dimmed, non-link, skipped in Tab order)
  [Sections]  mt --space-10 — one <section id="letter-a"> per PRESENT letter (empty → NO section):
      <section id="letter-a" aria-labelledby="letter-a-h">   (scroll-margin-top §1.4)
        ├─ H2 id="letter-a-h"  --text-2xl weight 700; border-bottom 1px --border; pb --space-2
        └─ <dl>  mt --space-4:  per term (pairs separated by margin-block --space-6)
             ├─ <dt> term  --text-lg weight 600 --text
             └─ <dd> max-width --measure:
                  ├─ <p> definition  --text-base --leading-relaxed
                  └─ <p> mt --space-1: <a href="/learn/{slug}" class="glossary-xref">
                         "Introduced in {lessonTitle}" <span aria-hidden>→</span>  --text-sm --brand weight 500 hover:underline
```
Letter sections separated by `margin-top --space-12`; entries within by `--space-6`.

### 1.3 Jump-to-letter bar
- Real `<nav aria-label="Jump to letter">` + `<ul>` of 26 items. **Present = `<a href="#letter-x">`; empty = `<span aria-disabled="true">`** (not a link → auto-skipped in Tab order; never omitted so the alphabet reads A→Z). Chip: `inline-flex; min 2rem×2rem; place-items center; radius --radius-control; weight 600 --text-sm`; present hover → `bg --surface`; empty → `color: color-mix(--text-muted 55%, transparent); cursor default`. Empty is dimmed AND aria-disabled AND not a link (not color-only).
- **Sticky ≥768px** (`position:sticky; top:4rem; z-30; bg --bg; py --space-2; border-bottom 1px --border`), **static <768px** (wraps ~3 lines; a mobile "Top" `<a href="#top">` appended as the last jump item).

### 1.4 Anchoring (scroll-margin-top so the letter heading clears the sticky region)
- `<768px` (56px header): `scroll-margin-top: 4.5rem`. `≥768px` (64px header + sticky jump bar ~2.75rem): `scroll-margin-top: 7.75rem`. Set on `.glossary section` + the `#top` sentinel. QA verifies in both themes + breakpoints.

### 1.5 Empty states + width
- Empty letter → dimmed chip + NO section. Whole-glossary empty (defensive) → header + intro + a single `.glossary-empty` `<p>` (muted italic, mirror `.learn__empty`), no jump bar. Definitions capped at `--measure`; root column `max-width: var(--measure)`.

### 1.6 JS-off: fully functional (native anchors/links, CSS-only sticky + scroll-margin; no island).

### 1.7 Data contract (presentation binds these; architect owns source + exact names)
`GlossaryEntry { term; definition; lessonSlug; lessonTitle }`. Template expects an ordered list of `{ letter: 'A'..'Z', entries: GlossaryEntry[] }` for PRESENT letters only + a set of present letters (dim vs link in the bar). Sort letters A→Z; entries case-insensitively by `term`.

### 1.8 A11y: one `<h1>`; letter `<h2>`s in A→Z order; labelled jump `<nav>`; `<dl>/<dt>/<dd>` semantics; descriptive xref text ("Introduced in {title}", never "click here"); dim empty letters carry `aria-disabled` (structural, not color-only).

---

## 2. About page (`/about`)

### 2.2 Wireframe (single readable column, `max-width --measure`)
```
[About root]  pt --space-12 (md: --space-16); pb --space-16; max-width --measure
  [Header] H1 "About LearnDSA" --text-3xl weight 700 --tracking-tight
           Lede --text-lg --text-muted --leading-relaxed mt --space-4
             "LearnDSA makes data structures and algorithms visible: every lesson is built around an animation you control and can run on your own input."
  <hr> 1px --border; margin-block --space-8
  [§ What this is]  H2 --text-2xl weight 700; scroll-margin-top 4.5rem; 2-3 short paras (free/static/no-backend, ~15 topics, offline-once-loaded, no accounts/tracking)
  [§ Who it's for]  H2; compact <ul> (NOT cards): 3 items, <strong> lead-in + muted continuation, optional 16px --brand stroke icon: Beginners · Self-taught developers · Interview-preppers
  [§ How the visualizations work]  H2
     ├─ prose (§2.3 plain-language trace-then-render)
     ├─ [Callout "How to read a visualization"] role=note; bg --surface; --radius-card; left border 4px --brand; info icon + bold "Tip"; 4-item list: Play/Pause, Step ±, Scrub, Custom input
     └─ [Live demo] <figure>: <Visualizer algorithm="binary-search" renderer="array" input="[1,3,5,7,9,11] target=7" allowCustomInput={false} showMetrics={false} client:visible />
          <figcaption> --text-sm --text-muted: "A live example — the same Binary Search visualization used in the lessons. Press Play, or step through one comparison at a time."
  <hr> margin-block --space-8
  [Closing CTA]  <p> "Ready to start?" + <a href="/learn" class="btn-primary">Browse the lessons</a>
```

### 2.3 Plain-language copy for "How the visualizations work" (user-facing, not §11 jargon)
"Each lesson runs the real algorithm once and records every meaningful moment — each comparison, swap, or pointer move — as a list of steps." / "You're not watching a video. You're scrubbing through that list: Play advances it, Step moves one operation forward or back, the slider jumps anywhere, and Custom input re-runs it on numbers you type." / "Because every step is recorded up front, stepping backward is instant and nothing is faked." ~2 short paras; Callout lists the four controls.

### 2.4 Embed the live Visualizer — YES. Reuse binary-search + ArrayRenderer, trimmed (`allowCustomInput={false}`, `showMetrics={false}`), placed AFTER the prose + Callout (tell-then-show on a meta page). Inherits all M2 Visualizer a11y + JS-off static still. `viewBox`-fluid → zero CLS. Only page JS besides the toggle.

### 2.5 A11y: one h1; three h2s in reading order; prose capped at `--measure`; demo carries M2 guarantees.

---

## 3. Home polish (`/`)

**Keep structure** (hero → 3 feature blurbs → 2 track cards). Only shipped JS stays ThemeToggle. Zero CLS.

### 3.1 What changes vs M1
| Area | M1 | M5 polish | Why |
|---|---|---|---|
| Hero rhythm | py-16 md:pt-24 pb-20 | tighten H1→subhead→CTA cadence (§3.2) | confident cadence |
| Hero H1 | text-4xl | keep + `text-wrap:balance` + max-width 20ch | avoid ragged breaks |
| Secondary CTA | text link → /about | align to primary's baseline (min-height 44px inline-flex) | reads as deliberate pair |
| Feature blurbs | 3 inline-SVG | keep exactly | already on-brand |
| Track cards | hardcoded "9 lessons · ~70 min" | data-driven count + total min + difficulty spread (§3.5) | truth, never drifts |
| Track heading | "…fifteen lessons" | "Two tracks, {n} lessons" (data-driven) | anti-drift |

Net: no new sections/components/tokens; elevation = typographic rhythm + honest live data.

### 3.2 Hero: H1 --text-4xl weight 700 --leading-tight --tracking-tight max-width 20ch text-wrap:balance; subhead --text-lg --text-muted max-width 55ch mt --space-5; CTA row mt --space-8 flex gap --space-4 (primary `.btn-primary` "Start learning" → /learn; secondary text link "How it works →" → /about). Left-aligned.

### 3.3 CTAs: primary unchanged `.btn-primary`. Secondary stays a TEXT link (one clear primary = confident); add `min-height:44px; display:inline-flex; align-items:center` so it matches the button on the shared row; arrow aria-hidden.

### 3.4 Feature blurbs: keep the three as-built (play-in-circle / open-book / heart inline SVGs, 24px, `text-brand`, aria-hidden). Grid `grid-cols-1 gap-10 md:grid-cols-3 md:gap-8`. h2 headings. No churn.

### 3.5 Track cards — data-driven, echo LessonCard. Per track from the published collection: `count`, `totalMinutes` (sum estimatedMinutes, round to 5) → `~{n} min`, `spread` = difficulty counts as TEXT ("8 beginner · 1 intermediate" / "All beginner"). Meta row `--text-sm --text-muted tabular-nums`: "{count} lessons · ~{totalMinutes} min · {spread} →". Overline "Track A/B", title h3 --text-xl weight 600, summary --text-base --text-muted. Whole card one `<a href="/learn">`. Difficulty as words not chips. Anti-drift: counts + the H2 number derive from the collection.

### 3.6 Cadence: Hero → mt-16 md:mt-24 → Features → mt-16 md:mt-24 → Tracks → footer mt-24. (M1 cadence; ensure all intervals match.)

### 3.7 Perf/CLS: no media/images/webfont; only ThemeToggle island; inline fixed-size SVG → zero CLS.

### 3.8 A11y: one h1 (hero); h2 per feature blurb + Tracks heading; track titles h3 (match LessonCard); CTA keyboard order primary→secondary; difficulty spread is text (1.4.1); meta `--text-muted` AA-clear both themes.

---

## 4. Cross-page a11y & consistency
One `<h1>` per page (unique/descriptive); section h2, sub h3, no skipped levels. Landmarks from BaseLayout; page-local navs get unique aria-labels (glossary "Jump to letter"). Focus-visible rings never removed. Contrast: only `--text`/`--text-muted`/`--brand` (M1 table authoritative — no new colors → biggest lever for Lighthouse A11y 100). Reduced-motion: only hover transitions (globally gated) + the About demo (M2 snaps). JS-off: glossary fully functional, about degrades to static still + noscript note, home functional (toggle hidden via noscript). axe on home/lesson/glossary/404 (glossary newly in scope; spot-check about — it hosts an island) → zero critical.

## 5. SEO-adjacent visual bits
Single descriptive h1 + logical heading order per page (a11y rotor + SEO outline). Glossary xref text descriptive ("Introduced in {title}", arrow aria-hidden). title + meta description via BaseLayout props (FE supplies per-page). No layout shift (system fonts, inline fixed SVG, viewBox-fluid demo).

## 6. Sequencing
1. `/glossary` first (static, island-free; needs architect's grouped data §1.7 — stub with a fixture if needed then swap).
2. Home polish (smallest diff; track-card meta data-driven from `getCollection`; hero rhythm).
3. `/about` last (prose + two-prop drop-in of the existing Visualizer; no new viz work).
Do not self-approve — QA runs keyboard + axe on home/glossary/lesson (+404), verifies jump-anchor offset both themes/breakpoints, empty-letter skip, JS-off on all three, reduced-motion on the About demo.
