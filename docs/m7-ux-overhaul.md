# M7 — UX Overhaul (shipped; this doc is the plan plus what actually landed)

Status: **shipped** — M7.1 in `7367685`, M7.2 in `80373a4`, M7.3 in `12d2486`. M8 (gamification,
`docs/m8-gamification.md`) then built on M7.2's progress system and reset control, and has shipped
too. Spec §17 lists both milestones.

Everything below the phase headings is the *plan as written before implementation* and is kept
verbatim as the design record — read it for the reasoning and the file pointers, not as a to-do
list. **What shipped, and every place the result deliberately differs from this plan, is recorded
in "As shipped" at the end of this document.** Where the two disagree, the shipped behaviour and
the code comments that explain it win; changing one of those decisions is a spec amendment with
sign-off, not a bug fix.

## Provenance — how this design was produced

A full UX audit of the shipped site ran on 2026-08-02: 12 live screenshots across home / learn /
lesson / glossary / about / 404 — desktop+mobile light for the five main routes, plus spot dark
captures of home and the lesson visualizer — with a Playwright accessibility-tree snapshot, and a
full source review across seven dimensions
(IA & flows, visual design, components & states, visualizer, accessibility, responsive, content).
Every finding was adversarially fact-checked against the code (line-exact) and this spec before
acceptance: **81 findings survived** (1 critical, 35 major, 45 minor); 2 first-pass claims were
rejected as factually wrong and are recorded in "Considered & rejected" below so they are not
re-litigated. The durable record is this document — issue IDs (IA-1, VD-3, …) refer to the audit
register summarized per phase below.

**Result: five design moves.** (1) Show the product — hero/OG/404 never display the visualizer.
(2) Close the progress loop — no resume, no aggregate progress, dead-end completion, broken
track-boundary sequence. (3) Make the player the hero — consolidated controls, legend, replay,
focus-loss fix, SR parity. (4) Wayfinding that survives long pages — sticky rail fix, scroll-spy v2,
mobile mini-ToC, glossary A–Z. (5) Depth & brand — elevation inversion, brand tints, display type
tier, state matrix.

## Design-system deltas (tokens.css)

All values AA-verified. **The six `--hl-*` roles keep their viz-only semantics** — the documented
reservation in `design-tokens-m1.md` Decision 3 and `DifficultyChip.astro` stands, so no chrome
surface reads an `--hl-*` variable.

Light: `--bg: #F8FAFC` (page canvas — inverted from white), `--surface: #FFFFFF` (cards, resting
`--shadow-1`), new `--surface-sunken: #EEF2F6`; brand tints `--brand-soft: #EEF2FF`,
`--brand-border: #C7D2FE`, `--brand-hover: #4338CA`; contrast repairs `--hl-found: #15803D`
(was #16A34A @ 3.07:1 on surface), `--hl-swap: #BE185D` (was #DB2777 @ 4.29:1). Dark: keep
`--bg`/`--surface`; add `--surface-sunken: #0F182B`, `--surface-raised: #273449`,
`--brand-soft: #1E2749`, `--brand-border: #37418F`, `--brand-hover: #A5B4FC`. Light needs no
`--surface-raised` (level 2 there is white + `--shadow-2` + `--border-strong`) — declare it anyway.
**Every new token goes in all three blocks**: `:root`, `[data-theme="dark"]`, and the byte-identical
`prefers-color-scheme: dark` mirror — miss the mirror and OS-dark users with no explicit theme key
read an undefined variable.

New non-color tokens: display tier `--text-5xl: clamp(2.75rem, 2.2rem + 2.4vw, 4.25rem)` +
`--weight-heavy: 800` + `--tracking-tighter: -0.025em` (home hero h1 only; Win10 Segoe/static
Roboto snap to nearest weight — acceptable); **standalone** `--accent-warn` (light `#B45309`,
dark `#F59E0B` — the same values `--hl-compare` carries today, but declared independently so the
two can diverge) for warning callouts, viz errors and `[aria-invalid]` borders; structural
`--header-h` (3.5rem / 4rem ≥768px) deriving every sticky offset and `scroll-margin-top`
(currently hardcoded across four files).

Elevation model: level 0 canvas · level 1 resting card (surface + shadow-1 + border) · level 2
hover (shadow-2 + border-strong). A commented five-state recipe
(default/hover/focus-visible/active/disabled) per control family goes into `global.css` and every
control adopts it.

## Phase M7.1 — Repair (no spec changes; ships as one PR-sized batch)

**Task 0 — capture the M6 baseline before touching anything.** No visual/aria baseline exists
(`grep` for `toHaveScreenshot|toMatchAriaSnapshot` in `tests/` returns nothing), so "no regression"
is unverifiable after the first edit. Commit Playwright's built-in `toHaveScreenshot()` +
`toMatchAriaSnapshot()` for home / `/learn` / `/learn/binary-search` / `/glossary` / `/404` in both
themes and with JS off (no new dependency). Four things make this real rather than decorative, and
all four ship in the same PR:

- **Make a missing baseline fail CI.** Playwright's `updateSnapshots` defaults to `'missing'`, and
  `playwright.config.ts` sets `retries: 2` — so a missing or platform-mismatched snapshot is
  *written* on attempt 1, passes on attempt 2 against the file it just wrote, and the run exits 0.
  Add `updateSnapshots: process.env['CI'] ? 'none' : 'missing'` (or `--fail-on-flaky-tests`).
- **Pin where baselines are generated.** The site uses a pure system font stack with no self-hosted
  fonts, so glyph rasterization differs per machine and Playwright suffixes snapshots by platform.
  Generate them in the CI environment (a `workflow_dispatch` job running `--update-snapshots`, or
  the official `mcr.microsoft.com/playwright` image) and set a small `maxDiffPixelRatio`.
- **Theme + JS-off don't compose the usual way.** Every existing spec forces the theme with
  `page.addInitScript(… localStorage.setItem('theme', …))`, and init scripts never run under
  `javaScriptEnabled: false` — a "dark + JS-off" capture would silently record the *light* theme as
  the dark reference. Force those with context-level `colorScheme` emulation instead, which is
  exactly equivalent here because `tokens.css` carries a byte-identical `prefers-color-scheme: dark`
  mirror of the `[data-theme="dark"]` block.
- **Await hydration before capturing** lesson pages (`[data-viz-ready="true"]`, via the existing
  `hydrateViz` helper in `tests/e2e/binary-search.spec.ts`), or the still-vs-live viz races the shot.

Every later "no visual regression" criterion then means `npm run test:e2e` green against that
baseline, with intentional diffs re-approved in the same PR.

| ID | Fix | Files |
|---|---|---|
| RSP-1 | Remove `align-items: start` from `.lesson__grid` (or `align-self: stretch` on the rail) so the rail's `position: sticky` can travel; existing `top`/`max-height` rules already handle pinning | `src/layouts/LessonLayout.astro` |
| RSP-4 | **Keep** the `<div id="viz-binary-search">` wrapper — it is load-bearing, scoping every locator in `tests/e2e/binary-search.spec.ts` (`VIZ` const, line 11) and `binary-search-gaps.spec.ts` (line 28) because that lesson hosts two array visualizers. Fix the breakout instead: the existing `> .viz` rule can't reach a wrapped viz, and `> div > .viz` won't help either (the wrapper is itself capped by `> *`), so lift the wrapper — `.lesson-body :global(> div:has(> .viz)) { max-width: 100%; }`. (If the id ever moves onto the Visualizer's own `<section class="viz">` via a new prop, update both spec files' `VIZ` constant in the same PR.) | `src/layouts/LessonLayout.astro` |
| A11Y-2 | Remove `aria-hidden="true"` from `.viz-metrics` (safe: sibling of the live region); fold counts into final-step explanations ("…after 3 comparisons") per algorithm | `src/viz/Visualizer.astro`, `src/viz/algorithms/*` |
| A11Y-4 | Light-token contrast repairs (`--hl-found`/`--hl-swap`, values above). Axe skips SVG text — add the tokens contrast unit test (below) as the guard | `src/styles/tokens.css` |
| VIZ-4 | Replay: fix inside `Player.play()` (at last step → seek 0, then play) so button, Space, and all callers replay consistently; play button relabels "Replay from start" at end | `src/viz/core/player.ts`, `Visualizer.astro` |
| IA-5 | Global-order prev/next (drop per-track filter); at a boundary PrevNext gets an overline prop ("Next track: Algorithms") | `src/pages/learn/[slug].astro`, `src/components/PrevNext.astro` |
| CMP-3 | `:disabled` styles for `.btn-secondary`, `.viz-select`, `.viz-field input` (all ship disabled in SSR); guard `.btn-secondary:hover` with `:not(:disabled)`; unify the two ad-hoc disabled opacities (`.viz-slider:disabled` 0.6 at `Visualizer.astro:799`, `.viz-btn:disabled` 0.45 at `:838`) into one token-backed disabled recipe and apply it to the newly-styled controls | `src/styles/global.css`, `Visualizer.astro` |
| CMP-6 | Reserve two explanation lines **including** box padding+border: `min-height: calc(2 * var(--leading-relaxed) * 1em + var(--space-3) + var(--space-px))` (bare 3.4em under-reserves ~13px) | `Visualizer.astro` |
| VIZ-9 / A11Y-7 / CMP-12 | ARIA toggle hygiene: Play/Pause drops `aria-pressed`, keeps the label swap; MarkComplete keeps `aria-pressed` with a **constant visible label** (sr-only rename fails WCAG 2.5.3 Label in Name) | `Visualizer.astro`, `src/components/MarkComplete.astro` |
| CMP-4 / A11Y-8 | Attribute input errors to the offending field via message heuristic (field-discriminator contract change would touch all 22 algorithm files); `role="status"` instead of `role="alert"` + focus (double announcement); fallback-to-Array when unattributable | `Visualizer.astro` |
| IA-6 | Link the track breadcrumb crumb to `/learn#track-{track}` | `src/components/Breadcrumb.astro` |
| IA-8 | 404: swap emphasis — "Browse the lessons" becomes `.btn-primary` | `src/pages/404.astro` |
| IA-9 + VD-9 | Ancestor nav state: prefix match → `aria-current="true"`; broaden selector to `.nav-link[aria-current]` **and** add the inset 2px brand underline (header nav only; footer links never carry aria-current) | `src/components/SiteHeader.astro`, `global.css` |
| CNT-8 | Unique Practice summaries ("Show answer to question 1") — content-only | lesson MDX files |
| INP-1 | `spellcheck="false" autocapitalize="none" autocorrect="off"` on viz inputs | `Visualizer.astro` |
| THM-1 | Two `theme-color` metas (light `#FFFFFF`, dark `#0B1220`) + 3-line ThemeToggle sync on manual override. **M7.3 must update the light value to `#F8FAFC`** when `--bg` inverts, or browser chrome silently diverges from the canvas | `src/layouts/BaseLayout.astro`, `src/components/ThemeToggle.astro` |
| ICO-1 | Export the bars mark → `/public/apple-touch-icon.png` (180×180, with background) + 32px PNG/ICO fallback + link tags | `public/`, `BaseLayout.astro` |
| MOT-1 | `@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }`; verify scroll-spy still resolves after the animated scroll settles | `global.css` |
| VD-4 | Slider track restyle with tokens: `appearance: none` removes the native thumb too, so restyle **both** track and thumb; brand elapsed-fill via one CSS-var write in the existing `onStep` | `Visualizer.astro` |

*Accept:* full DoD (§18) green; new tests pass — the **tokens contrast unit test** asserts the AA
matrix in both themes *against the backdrops that actually render*: a pure
`mixSrgb(hl, surface, 0.15 | 0.18)` helper reproducing the `color-mix()` cell fills
(`Visualizer.astro:403-489`, `:520-575`) so `--hl-*` stroke vs its own tinted fill (≥3:1) and
`--text` on that fill (≥4.5:1) are both checked, parsing the `[data-theme="dark"]` block *and* its
byte-identical `prefers-color-scheme` mirror (fs + pure math, no dependency); the **focus-retention
e2e journey** (step to trace end via keyboard, assert focus never lands on `<body>`) lands here as
`test.fixme` — it cannot pass until M7.2's A11Y-1 — and is flipped live in M7.2. One existing
assertion changes: `tests/e2e/binary-search.spec.ts:87` (`[data-viz-play]` disabled at trace end)
becomes an assertion of the "Replay from start" state; the two `[data-viz-back]` assertions
(`binary-search.spec.ts:74`, `binary-search-gaps.spec.ts:248`) are unaffected. Keyboard walkthrough
of binary-search unchanged or better; Task 0 baseline green (intentional diffs re-approved in-PR).

## Phase M7.2 — Close the loops

**Progress system** (foundation M8 builds on): a shared ~0.5 KB module at `src/lib/progress.ts`
reading the existing `lesson:{slug}:complete` keys — M8.1 extends this same file rather than adding
a second store. Continue CTA on `/learn` (server-rendered "Start with 01 ·
Complexity & Big-O" fallback, rewritten to "Continue: NN · Title →" — cards already carry
`data-slug` in global order); per-track "N of M done on this device" text beside each track h2
(M8.1 upgrades this same counter to rings + mastery counts — build the util once, render plainly
here); **reset-progress control** with inline confirm (the delete path ships with the read path;
M8 keys are added to its clear list when they exist); end-of-lesson **"What's next" section**
merging MarkComplete + PrevNext (next-lesson data is already a server-side prop) with the
"Saved only in this browser — no account needed" helper (noscript-wrapped together with the button)
and a revealed "Saved — N of 15 complete" line (inject slug list via data attributes at build;
never enumerate localStorage by prefix — stale keys from renamed lessons would inflate the count).

**Player v2:** consolidated single control bar ≥640px (transport group | scrubber flex-1 + counter |
speed; play 56→44px, still AA), bordered `.btn-secondary`-style transport with obvious disabled
delta and single-chevron step glyphs (echoing ←/→; **not** mirrored-bar glyphs — rejected as
unestablished); build-time auto-legend scanning the default trace's `step.highlights` (own
kind→glyph map — `HIGHLIGHTS.marker` holds prose, not glyphs; 'active'/'frontier' pills are
swatch+word only); lifecycle states — loading (dimmed bar, "…" counter, `aria-busy` set via JS
only, never SSR) vs failed (`data-viz-failed` hides controls + recovery copy); **A11Y-1** focus
fix: runtime `aria-disabled` + styled state instead of `disabled` (Player already clamps every
method; keep real `disabled` only pre-hydration), flip the `test.fixme`; A11Y-6 live-region mute
during >1× autoplay (also hook the speed-change listener — `setSpeed` fires no callback), announce
final step once; kbd hint row + `tabindex="-1"` + `focus({preventScroll: true})` on canvas
pointerdown; "Restore example" from the stored `rawInput` + placeholders derived from the raw
`input` string split on `target=` (the parsed object is per-algorithm `unknown` — CMP-14);
helper text disclosing format + caps with space-separated `aria-describedby="help err"`;
`[aria-invalid]` + error styling through `--accent-warn`; persist `pref:viz-speed`
(SPEC-GAP comment; §6 amended).

**Scope recorded during implementation** (flagged by review as beyond the literal plan text, kept
deliberately): the resume rewrite also lands as a secondary line in the **home hero** (the design
proposal's surface (b) — the primary "Start learning" CTA is untouched for new visitors), and the
**PrevNext redesign** that "What's next" implies — next promoted to a card with a "Start lesson →"
CTA, prev demoted to a text link, and a synthetic last-lesson card ("That's the whole curriculum")
so lesson 15 is not a dead end, which §3's "no dead ends" principle requires. Both are additive and
JS-off safe; neither changes a spec'd behaviour.

**Wayfinding:** scroll-spy v2 ("last heading whose top passed the band", cached offsets, exactly
one `aria-current` always); sticky mini-ToC below 1024px from the existing inline `<details>`
(top `var(--header-h)`; open list absolutely positioned so expansion doesn't shift layout);
glossary — sticky single-row scrollable A–Z on mobile (bump `<768px` `scroll-margin-top` to clear
it), per-term `id`s with the responsive scroll-margin pair, aliases rendered as "Also called: …"
(makes find-in-page work; the search island stays a G3-adjacent option needing sign-off);
"Builds on:" prerequisites row in the lesson header (frontmatter data exists and is
schema-validated only — add referential slug validation mirroring the glossary guard);
lesson terms link first bold use to `/glossary#term`; RSP-2 mobile viz floor — scrollable
`.viz-canvas` with legible min-width when n exceeds ~10. Reconcile the two tabindex needs on that
one element: `.viz-canvas` carries `tabindex="-1"` by default (the click-then-Space focus target
above) and is switched to `tabindex="0"` + `role="group"` + accessible name **only while the scroll
container actually overflows**, toggled by the same measurement that enables scrolling — otherwise
the overflow fix trades a 1.4.10-exempt reflow for a 2.1.1 keyboard failure. Full-bleed frame
<768px; code-language persistence `pref:code-lang` + CustomEvent sync
across the 21 CodeTabs groups (SPEC-GAP; §6 amended); CMP-9 copy failure needs a **visible** label
(today it writes only the sr-only status, `CodeTabs.astro:263-268`) plus a self-clearing timeout on
the failure branch mirroring the success path; CMP-10/VIZ-12 covered above.

*Accept:* DoD green; focus-retention test flipped from `fixme` and passing; `/learn` axe scan (the
one key route the existing six-file matrix misses) + a pre-hydration lesson scan added; keyboard
journey covers the new mini-ToC and restore-example. **JS-off:** every touched surface stays fully
usable and no JS-only control is exposed (noscript kill-switches); newly server-rendered content —
prerequisites row, "What's next", glossary aliases — is *expected* to appear and must be readable
without JS. The viz input helper text is server-rendered but sits inside `.viz-custom`, which the
existing `.viz-controls` kill-switch hides (`Visualizer.astro:337-348`); JS-off readers correctly
get the `.viz-nojs-note` line instead.

## Phase M7.3 — Raise the brand (designer/spec sign-off where flagged)

Hero demo panel: two-column ≥1024px, right column a build-time `renderStatic()` frame of the
binary-search trace mid-run on a `--brand-soft` panel linking to `/learn/binary-search#visualizer`
(SPEC-GAP: §8 amended; the demo is the renderer's own output — never hand-mock it); OG card
system: hand-exported 1200×630 PNGs (site + per-track — OG scrapers don't render SVG; no build
rasterizer, that would be a dependency), routed via the existing `ogImage` prop; elevation
inversion + tint family rollout — audit every `--surface` **and** `--bg` consumer: viz SVG cell
fills use `--surface` and would go white-on-white, while `.btn-secondary` / `.viz-select` /
`.viz-field input` / `.viz-pill` fill with `--bg` and must move to `--surface` (VD-8). **M7.2 added
two more `--bg` consumers inside the visualizer — the restyled `.viz-btn` transport surface and the
`.viz-keys kbd` hint — plus the `/learn` progress meter track; include them or the inversion
regresses them silently.** Re-grep for `var(--bg)` at implementation time rather than trusting this
list. **Also update the light `theme-color` meta from `#FFFFFF` to `#F8FAFC`** (THM-1); display tier on
the home hero; difficulty chips — **needs spec §8 amendment + designer sign-off** (reverses a
documented decision): soft-filled semantic chips (Beginner `#047857`/`#ECFDF5` = 5.21:1, dark
`#6EE7B7`/`#132D24`; Intermediate `#92400E`/`#FFF7ED` = 6.68:1, dark `#FBBF24`/`#2D2310` — word
always retained) or badge-the-exception; lesson-card affordance ("Start lesson →" matching home
cards, shadow-2 + brand title hover, `:active`); five-state recipe rollout (CMP-8); warning
callout `--accent-warn` keyline (CMP-11); collapsible expand via `interpolate-size` +
`::details-content` with explicit endpoints (`block-size: 0` → `auto`; safe fallback = today's
snap); print stylesheet (force light tokens under `@media print` byte-mirroring the dark-fallback
pattern, hide chrome/controls/rail, keep the static SVG + step-0 text, reveal Practice answers,
print-only URL footer — market as "Print this lesson"); RSP-5/6 nav-link padding + `min-h-14`
header + mobile-first hero spacing; forced-colors block re-encoding viz state on stroke-width/
dasharray/glyph channels (HCM-1); 404 "target not found" SVG brand moment; VD-7 centering stays
**rejected** (documented left-edge intent) — the 404 SVG is the only change there.

*Accept:* DoD green; §14 Lighthouse targets verified **manually** (Chrome DevTools → Lighthouse,
mobile preset, against `npm run preview`) on home + a lesson + glossary with the scores pasted into
the PR — the repo has no Lighthouse tooling and adding `@lhci/cli` would need a SPEC-GAP; OG preview
verified with a debugger before deploy; print preview of binary-search readable in both source
themes; chip change carries the spec amendment in the same PR.

## Test plan additions (cumulative)

Unit: tokens contrast matrix (both themes, every pairing, viz pairings computed against the real
`color-mix()` backdrop — see M7.1 *Accept*); legend kind→glyph map; placeholder derivation; global
prev/next boundary cases. E2E: the Task-0 visual/aria baseline; focus-retention journey; `/learn`
axe; pre-hydration lesson axe scan; mini-ToC + glossary sticky-bar keyboard paths; reduced-motion
smoke (smooth-scroll off). Existing suites stay green throughout.

Harness note: `vitest.config.ts` runs `environment: 'node'` with no DOM library and no
`localStorage`, and there is no Astro component-render harness. Anything DOM- or storage-shaped is
therefore an **e2e** test, and anything unit-tested must be a pure function with injected inputs —
the pattern `src/lib/theme.ts`'s `resolveTheme(stored, prefersDark)` already establishes. Adding
jsdom/happy-dom would be a new dependency and needs a SPEC-GAP.

## As shipped — what landed, and where it deviates from the plan above

All three phases shipped (`7367685`, `80373a4`, `12d2486`), each with its own e2e suite:
`tests/e2e/m7-repair.spec.ts`, `m7-progress.spec.ts`, `m7-player-v2.spec.ts`, `m7-wayfinding.spec.ts`,
`m7-glossary.spec.ts`, `m7-codetabs.spec.ts`, `m7-brand.spec.ts`, `m7-print-hcm.spec.ts`, plus the
`viz-focus-retention` journey (flipped live in M7.2 as planned) and the unit-side
`tokens-contrast.test.ts` / `viz-player-v2.test.ts`. The token deltas landed as specified — inverted
light elevation, sunken/raised levels, the brand tint family, `--accent-warn`, `--header-h`,
`--text-5xl`/`--weight-heavy`/`--tracking-tighter`, `--disabled-opacity` — in all three blocks
including the `prefers-color-scheme` mirror, and THM-1's follow-through landed too (the light
`theme-color` meta was set to `#F8FAFC`; Plan B's achromatic repaint later moved it again, to
`#FCFCFB`, along with the dark literal). `src/styles/tokens.css` is the source of truth for all of
it — read the file, not this paragraph, for current values.

**Deviations — decisions, not drift:**

1. **Difficulty chips stayed NEUTRAL.** M7.3's soft-fill treatment (VD-6/CMP-2) was built and then
   **rejected at design review, which withheld the sign-off spec §8 requires**. Three reasons, all
   measured or structural: the fills are 1.00–1.06:1 against the card they sit on, so they do almost
   no perceptual work; the separation that remained was carried by label hue alone — the colour-only
   channel the chip exists to avoid; and painting all thirteen "Beginner" chips as loudly as the two
   "Intermediate" ones inverts the Von Restorff argument the change was made from. The full record is
   `design-tokens-m1.md` Decision 3 and the header comment in `src/components/DifficultyChip.astro`.
   **Badge-the-exception is still open, not rejected** — it needs a §8 amendment *and* sign-off
   (spec §19). Do not "fix" the neutral chip.
2. **One OG card, generated, not hand-exported; no per-track cards.** The plan called for
   hand-exported 1200×630 PNGs, site + per-track. What shipped is a single site card produced by
   `scripts/build-og.mjs` (`npm run og`) from the real renderer's `renderStatic()` output, rasterised
   by the Chromium `@playwright/test` already installs (so still no new dependency), committed as
   `public/og-source.svg` + `public/og-default.png` and served to every page through `BaseLayout`'s
   `ogImage` default. Hand-export was abandoned because the first hand-made card drew a binary-search
   frame the renderer does not produce (no index row for lo/mid/hi to point at) — the site advertising
   a product that does not exist, which is exactly what "never hand-mock the product" forbids. The
   script is deliberately **not** wired into `npm run build`.
3. **The visual half of Task 0 was a gate, not coverage — until `dab6108`, when it was armed.**
   `tests/e2e/baseline-aria.spec.ts` ships with five committed aria snapshots and runs on every push.
   `tests/e2e/baseline-visual.spec.ts` shipped with M7 **unseeded and skipping by default**, so M7.3
   repainted the whole site with this half inert — the recorded gap this entry originally described.
   Both steps have since been done: 14 PNGs are committed under
   `tests/e2e/baseline-visual.spec.ts-snapshots/`, and `.github/workflows/ci.yml` sets
   `VISUAL_BASELINE: '1'` on the DoD gate's e2e step, in the pinned
   `mcr.microsoft.com/playwright:v1.61.1-noble` container. A green `npm run test:e2e` on CI now does
   say something about pixels; a green one on a workstation still does not, and says so out loud.
   Plan B re-seeded all 14 — every route changes when the chrome is repainted.
4. **Scope added during implementation** — already recorded inline under M7.2: the home hero's
   secondary resume line and the PrevNext redesign (next promoted to a card, prev demoted to a text
   link, synthetic last-lesson card so lesson 15 is not a dead end).
5. **Still deferred, exactly as §19 says:** the glossary search island (the zero-JS "Also called:"
   aliases shipped regardless) and Astro prefetch.
6. **CMP-11's premise inverted, and the trade is accepted (amended 2026-08-19, Plan B).** The warning
   callout was given an `--accent-warn` keyline because warning was the *weakest* of the three
   callout accents — note and tip carried the brand indigo, and a severity that shouts less than a
   note is backwards. The achromatic repaint removed the brand hue, so the ordering flipped: note and
   tip now draw their keyline in `--brand`, which is `--text`, at 18.24:1 light / 15.00:1 dark on
   `--surface`, while warning's `--accent-warn` measures 5.02:1 / 8.26:1. In **dark** the warning
   keyline is now 1.82× *quieter* than a note's (in light, 3.63× quieter). **No code changes.** The
   accepted reading: a hue among achromatic neighbours is more urgent than a louder neutral — amber
   is now the only chrome colour on the page, so it is the only keyline that reads as a *category*
   rather than as an edge, and CMP-11's real goal (warning must not be the least distinguishable of
   the three) is met by distinctness rather than by luminance. The non-colour layer CMP-11 always
   depended on is untouched: the triangle glyph and the bold word "Warning" still name the severity,
   and §12's never-colour-alone rule is what makes this trade legitimate rather than a regression.
   If a future audit disagrees, the fix is a heavier keyline on warning, not a hue for note.
7. **The header nav's pressed state now matches its hover, and that is accepted (Plan B).**
   `global.css`'s `.nav-link:hover` is `--text` and `:active` is `--brand`; those are one value now,
   so the press paints nothing new. The rule is deliberately KEPT — CMP-8's five-state selector scan
   requires the family to declare one — and no treatment was invented for it, because each candidate
   collides with something documented: an underline collides with the `aria-current` cue, an opacity
   move collides with `--disabled-opacity`, and a fill move needs the padding and radius RSP-5
   deliberately withholds from a text nav link. A text link whose press state matches its hover is
   conventional, not a defect. Recorded here so it stays settled.

## Considered & rejected (do not re-litigate)

- Centering the reading column / two-column glossary — contradicts documented design intent
  (`m5-design.md` §1.5, `design-tokens-m1.md`); lessons can't center (rail owns the right column).
- "CI has no meaningful a11y gate" — factually wrong; six e2e spec files axe-scan `/`, `/glossary`,
  `/about`, `/404` and one lesson per renderer family, each in both themes. The one uncovered key
  route is `/learn`, which M7.2 adds.
- Hamburger menu; mirrored-bar step glyphs; confetti-style celebration; any new dependency.
- Centering aside: **Astro prefetch is deferred, not rejected** — it sits in spec §19 pending an
  architect ruling on whether §4's "no runtime network calls" bars same-origin prefetch.
