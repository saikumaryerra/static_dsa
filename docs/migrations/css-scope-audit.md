# CSS scope audit — what un-scoping Astro's component styles changes

Astro scoped every non-`is:global` `<style>` block by adding a `data-astro-cid-*` attribute to the
component's own elements and to every compound of its selectors. The React build has no such
attribute, so each block becomes plain CSS. This audit measured, **on the legacy build, before any
port**, exactly which rules change what they match once that attribute is gone — so each converted
file carries a known fix list instead of a guess (plan §5 P1 WS-T step 3, risk R2).

## Method

`scripts/migration/scope-audit.mjs` (run 2026-10-20, 3,614 s): the frozen legacy artifact
`.migration/baseline-dist` versus a copy with every `data-astro-cid-*` attribute and every
`[data-astro-cid-…]` selector part removed (`.migration/stripped-dist`). 38 pages (the 9 non-lesson
pages, all 15 DSA lessons, the 11 diagram lessons and 5 table-heavy prose lessons) × 390×844 and
1280×800 × light and dark, JavaScript off; `getComputedStyle` of every element plus `::before` /
`::after`, each difference traced to the rule that now wins it. Raw output (gitignored):
`.migration/scope-audit/report.{md,json}`.

**Result: 468 leak · 8 specificity · 0 other · 6,204 derived.** The derived rows are layout
consequences (heights, transform origins) of the three rules below and need no fix of their own.
Of the 30 scoped blocks, **27 are unaffected** by un-scoping. Limits: the audit sees the JS-off
initial state only — no `:hover`/`:focus`, closed disclosures, no island-rendered DOM — so
`style-parity.mjs` (P3) and the e2e/pixel suites cover the rest.

## The fix list

| # | Source | Scoped rule | Kind | What changes without the scope | Fix in the React build |
|---|---|---|---|---|---|
| 1 | `src/layouts/LessonLayout.astro` → `src/styles/layouts/lesson.css` | `.lesson__grid > .lesson__article > :not(.lesson-body)` | leak | The scoped rule matched only the layout's **own** children of the article — `header.lesson__header` and the two `hr.lesson__rule` (measured over all 127 baseline lessons). Unscoped it also caps `max-width: 1152px` (`--measure`-derived) on the children other components render there: `nav.breadcrumb`, `details.toc`, `section.whats-next`, and the kill-switch `<noscript>` (448 differences, 112 elements, 29 pages) | `.lesson__grid > .lesson__article > :is(.lesson__header, .lesson__rule)` — names the layout's own children instead of excluding one foreign one, so a component later added to the article cannot inherit the cap by accident |
| 2 | `src/pages/about.astro` → `src/styles/pages/about.css` | `.about__section p` | leak | Reaches the paragraphs the embedded `<Visualizer>` renders inside the about section: `.viz-explain`, `.viz-nojs-note` (`margin-top` 0 → 16px), `.viz-predict-note`, `.viz-keys` (`margin-top` 12 → 16px, `line-height` 18 → 20.4px) | `.about__section p:not(.viz p)` — the instrument's own typography wins inside the instrument, as it did when scoped |
| 3 | `src/pages/about.astro` → `about.css` | `.about__section p` (on `p.about__callout-title`) | specificity | Scoped (0,3,1) beat Callout's scoped `.callout__body :first-child` (0,2,0 + attribute = 0,3,0); unscoped (0,1,1) loses to (0,2,0), so the callout title's `margin-top` drops 16px → 0 | Raise the about rule above (0,2,0) for this element, e.g. a separate `.about__section .about__callout-title { margin-top: var(--space-4); }` (0,2,0, later in `site.css` order — pages import after components) or qualify with the page root. Verify by computed style, not by reading |
| 4 | `src/pages/about.astro` → `about.css` | `.about__controls li` | specificity | Same competitor: the first `li` of the controls list inside the callout loses its `margin-top` 4px → 0 | Same treatment as #3: `.about__section .about__controls li` (0,2,1) beats (0,2,0) |

Everything else converts verbatim. P3's `style-parity.mjs` run compares the React build against the
baseline and must show 0 non-derived differences, or each remaining one listed here with a reason.

## P3 result — style parity of the React build

`scripts/migration/style-parity.mjs dist` (run 2026-10-21 against the P3 build `c165d9f`, the same
38-page × 2 viewports × 2 themes sample, JavaScript off; 31,074 s on a host shared with unrelated
workloads): **496 rule-changed · 378,606 derived · structural drift on 0 pages.** None of it is a
visible property. Raw output: `.migration/style-parity/report.{md,json}` (gitignored).

| Difference | Where | Why | Verdict |
|---|---|---|---|
| derived: `--jump-bar-h`, `--viz-progress` `(unset)` → empty | every element, 38 pages | the build ships one stylesheet (D-10), so custom properties the legacy build registered only on lesson or instrument pages are now declared everywhere; no rule reads them outside those pages | accepted — custom properties with no consumer on the page |
| derived + rule-changed: `--lightningcss-light`, `--lightningcss-dark` on `:root` (`tokens.css`) | `html`, 38 pages | Vite's CSS pipeline lowers `light-dark()` with two helper variables at `:root`; every colour they feed computes to the legacy value (no colour property appears in the diff) | accepted — no computed colour differs |
| rule-changed: `.viz-cell`, `.viz-cell__rect` `transition-*` (`visualizer.css`) | `/404.html`, the build-time still | one stylesheet: the instrument's transition rules now reach the 404's static drawing, which the legacy page never loaded. A still never changes state, so nothing animates; WS-C already neutralised the one visible effect (`.notfound__canvas .viz-cell.is-eliminated { opacity: 1 }`) | accepted — no visible change |

The four scoped-rule fixes above hold: none of their selectors appears in the parity diff.
