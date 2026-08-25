# Plan B — The achromatic palette

**Status:** design, audited against the code, ready for review
**Branch:** `feat/show-your-work-slice`
**Date:** 2026-08-19
**Part of:** `2026-08-18-show-your-work-decomposition.md` (plan 2 of 3)

---

## 1. What this is

The chrome gives up its only hue so the drawing keeps all of them.

LearnDSA has six `--hl-*` roles that carry real meaning inside a visualization — compare,
swap, active, visited, frontier, found. Today they compete with an indigo header, indigo
buttons, indigo focus rings, indigo links and an indigo favicon. After this change the only
colour on a lesson page is the colour that is explaining the algorithm.

This is the site spec's own instruction, not a new idea: §13 asks to _"keep the palette calm;
reserve saturated color for highlights so the algorithm state pops."_

**In scope:** 13 chrome tokens across four blocks, the shadow colour, the favicon and its two
raster derivatives, the OG card, and the five places where removing the hue collapses a
distinction the design relies on.

**Out of scope, deliberately:** the six `--hl-*` roles and `--accent-warn` (24 declarations,
untouched); the ledger and the instrument (Plan C); **and the typeface** — see §8.

**Dependencies:** none. Plan B shares no file with Plan A or Plan C and can merge on its own.

---

## 2. The palette

`--surface` and `--surface-raised` are unchanged in light (`#FFFFFF`), which is why the light
column has 10 changes and dark has 13.

| token | light now → new | dark now → new |
|---|---|---|
| `--bg` | `#F8FAFC` → `#FCFCFB` | `#0B1220` → `#0E0F12` |
| `--surface` | `#FFFFFF` (no-op) | `#1E293B` → `#17181C` |
| `--surface-sunken` | `#EEF2F6` → `#F1F1EF` | `#0F182B` → `#101114` |
| `--surface-raised` | `#FFFFFF` (no-op) | `#273449` → `#1F2026` |
| `--text` | `#0F172A` → `#141519` | `#E2E8F0` → `#ECECEA` |
| `--text-muted` | `#475569` → `#5A5C64` | `#94A3B8` → `#A3A5AD` |
| `--border` | `#E2E8F0` → `#DCDDE0` | `#334155` → `#2A2B31` |
| `--border-strong` | `#64748B` → `#7C7E86` | `#64748B` → `#6B6D75` |
| `--brand` | `#4F46E5` → `#141519` | `#818CF8` → `#ECECEA` |
| `--brand-contrast` | `#FFFFFF` (no-op) | `#0B1220` → `#0E0F12` |
| `--brand-soft` | `#EEF2FF` → **§4.2** | `#1E2749` → **§4.2** |
| `--brand-border` | `#C7D2FE` → `#DCDDE0` | `#37418F` → `#2A2B31` |
| `--brand-hover` | `#4338CA` → `#2B2D33` | `#A5B4FC` → `#FFFFFF` |

**46 declarations**, verified: 10 in `tokens.css`'s light `:root`, 13 in `[data-theme="dark"]`,
13 in the `prefers-color-scheme` mirror, 10 in the `@media print` mirror in `global.css`. The
two other `:root` blocks in `tokens.css` (`prefers-reduced-motion`, `min-width: 768px`) carry
no colour and are not touched.

### 2.1 Verification — done, and the plan's own number was wrong

The contrast maths was re-derived from `tests/unit/tokens-contrast.test.ts` and validated by
reproducing ~20 figures documented across eight source files to two decimal places.

- **The suite is 88 tests, not the 74 the decomposition claimed.** That figure omitted four
  DifficultyChip checks, two glossary checks and eight structural tests. Wrong arithmetic,
  right conclusion.
- **0 failures.** Tightest margins: `--border-strong` on `--surface-sunken` **3.58** (floor 3.0,
  light); `--border-strong` on `--surface` **3.44** (dark); `--hl-found` stroke on its own 18%
  tint **3.92**; `--accent-warn` on `--bg` **4.89** (floor 4.5).
- **Light `--hl-*` checks are bit-identical to today**, because the matrix only ever pairs them
  against `--surface`, which does not move in light. Every dark `--hl-*` check improves.
- **One documented WCAG defect dissolves.** `tokens.css` records dark `--border-strong` on
  `--surface-raised` at **2.64:1 — below 1.4.11**, and a `--text-muted` keyline workaround was
  built around it. The new value is **3.15:1**. The comment, the workaround rationale, and its
  duplicate at `LessonCard.astro:119` must all be rewritten or the constraint quietly becomes a
  lie.

**Do not adopt the palette in `.claude/worktrees/show-your-work` (`3bf4d70`).** An abandoned
implementation of this change exists there, but it is the *uncorrected* draft: its
`--border-strong: #8B8D95` measures 2.93:1 against `--surface-sunken`, below the 3.0 gate, and
its dark surface ramp differs. It is a useful reference for the repairs in §4 — it already made
two of them — and not for the values.

---

## 3. What the contrast matrix cannot see

Every check passes, and that is exactly the risk. `--brand` becomes **byte-identical to
`--text`** in both themes, so `CORE_PAIRS`' `--brand on --surface` row passes *louder than ever*
(18.24:1) while distinguishability goes to 1.00:1. The matrix tests colour against grounds; it
never tests **state against state**.

Five distinctions collapse. Four are repairs (§4); one is a hard CI failure (§5).

**What does *not* regress, verified rather than assumed:** WCAG 1.4.1 ("not by colour alone")
holds everywhere. Prose links keep a permanent underline (`LessonLayout.astro:449`); every other
brand-coloured link is either a standalone action in a button row (`404.astro:93`,
`index.astro:271`) or a label inside a card-sized `<a>`. `index.astro:292` actually *gains*
distinction, being `--text` inside `--text-muted` prose with a weight bump and an arrow.

---

## 4. The five repairs

Four are design calls rather than defects. Each is recorded here as an amendment, with the
reasoning, so it can be vetoed rather than discovered.

### 4.1 The glossary A–Z jump bar — give the chip a border

`glossary.astro:366` hovers via `background-color: var(--brand-soft); color: var(--brand)`. After
the repaint the fill move is **1.10:1** light / 1.18:1 dark and the label does not change at all,
because `--brand` is now `--text`. Hover feedback on **26 targets** becomes a 1.10:1 background
shift and nothing else — below the **1.28:1** that the component's own comment already rejects as
_"no perceptible feedback at all."_

That comment also names the fix: it says the chip _"has no border to carry the other half of the
idiom the way those two controls do."_ **Give it one.** Hover then reads as fill + border, the
same idiom `.btn-secondary` and `.viz-btn` use, and stops depending on a hue that no longer exists.

### 4.2 `.btn-secondary` and `.viz-btn` — hover and active must differ

`global.css:446-455` and `Visualizer.astro:1562-1569` both set hover to `--brand` border +
`--brand-soft` fill, and active to `--brand` border + `--surface-sunken` fill. The proposed
palette gives `--brand-soft` and `--surface-sunken` the *same* value, so in light **hover and
active become pixel-identical**. `.viz-btn` is on every lesson page.

`Visualizer.astro:1556` states the constraint the fix must respect: _"on a near-white canvas a 1px
border colour change on its own reads as a rendering artefact."_ So the border cannot carry this
alone.

**`--brand-soft` therefore takes a distinct luminance step from `--surface-sunken` in both themes**
— it is the only token in §2 whose value this spec does not fix, because it must be chosen and
then verified against the full 88-test matrix rather than asserted. Starting points to verify:
light `#E8E8E5`, dark `#242530`. Constraint: hover fill, active fill and the resting surface must
be three distinguishable steps, and every existing assertion must still pass.

### 4.3 Callout severity in dark — accept the flip

`Callout.astro:91` keylines note/tip with `--brand`, `:98` warns with `--accent-warn`. Measured on
`--surface`:

| | light now → new | dark now → new |
|---|---|---|
| note/tip | 6.29 → **18.24** | 4.90 → **15.00** |
| warning | 5.02 → **5.02** | 6.81 → **8.26** |

Light does not flip — note is already 1.25× louder and becomes 3.63×. **Dark does:** warning is
1.39× louder today and becomes 1.82× quieter. That silently reverses M7.3's CMP-11 decision,
which existed *because* the warning had the weakest accent.

**Accepted, deliberately.** Amber becomes the only chrome hue on the entire page, and a hue among
achromatic neighbours reads as more urgent than a louder neutral. The ratio understates the
warning's new salience. Recorded as an amendment to CMP-11 rather than a regression.

### 4.4 The favicon and its derivatives — the loudest miss

`public/favicon.svg:4` is `fill="#4F46E5"`. It is **not generated from anything**, and it fans out:

| artifact | regenerated by | how it carries the indigo |
|---|---|---|
| `public/og-source.svg:109` | `npm run og` | `build-og.mjs:321` inlines `favicon.svg` **verbatim** |
| `public/og-default.png` | `npm run og` | rasterised from the above |
| `public/favicon-32.png` | **no script exists** | `BaseLayout.astro:96` says to rasterise from the SVG, never redraw |
| `public/apple-touch-icon.png` | **no script exists** | same |

So `npm run og` alone leaves an **indigo mark on an achromatic card**. The favicon goes to
`#141519`, and the two PNGs must be re-rasterised — which means this plan either adds that script
or documents the manual step. It cannot leave them stale.

### 4.5 Shadows — the alpha is right, the hue is retired

`tokens.css:189-190` and `global.css:571,573` build every shadow from `rgb(15 23 42 / …)` — slate-900,
i.e. the **retired** `--text`. The proposal supplies no replacement. **Use `rgb(20 21 25 / …)`, the
new `--text`, preserving every existing alpha**, so the elevation model's tuning survives and only
the hue moves.

---

## 5. What breaks on CI

Both are hard failures the decomposition never mentioned.

1. **`m1-gaps.spec.ts:21,25`** hardcodes `DARK_BG = 'rgb(11, 18, 32)'` and
   `LIGHT_BG = 'rgb(248, 250, 252)'`, asserted at `:64`/`:72` against the computed root
   background. New values: `rgb(14, 15, 18)` / `rgb(252, 252, 251)`.
2. **`m7-brand.spec.ts:280`** asserts a hovered `.lesson-card__title` differs from its resting
   colour. It rests at `--text` (`LessonCard.astro:161`) and hovers to `--brand` (`:170`) — now the
   same value, so `:279` passes trivially and `:280` **fails**. The hover rule has become a no-op:
   delete it and its `transition`, and rewrite the assertion to pin that the title *stays* `--text`.
   The card still signals hover through its border and shadow (`global.css:478-499`), whose tokens
   stay distinct — verified, not inferred.

**All 14 visual baselines re-seed**, in the same PR, via the pinned container. The gate is armed:
`ci.yml:90` sets `VISUAL_BASELINE: '1'` on the DoD step and `playwright.config.ts:15` sets
`updateSnapshots: 'none'` under CI. `baseline-visual.spec.ts:5-14`'s header still claims the
baselines are unseeded and the gate unarmed — all three claims are false and must be corrected.

`tokens-contrast.test.ts` needs **no edit**: it has zero hardcoded hex, reads every value from
disk, and enforces the three-way mirror. It passes only if the diff touches all four blocks.

---

## 6. Files

| area | files |
|---|---|
| tokens | `src/styles/tokens.css` — 36 declarations across three blocks, plus the shadow hue and the inline contrast matrices in its comments |
| print | `src/styles/global.css` — 10 declarations in the print mirror, the shadow hue, and `.btn-secondary`'s hover/active (§4.2) |
| meta | `src/layouts/BaseLayout.astro:72-73`, `src/components/ThemeToggle.astro:147` — the `theme-color` literals |
| repairs | `src/pages/glossary.astro` (§4.1), `src/viz/Visualizer.astro:1556-1569` (§4.2), `src/components/LessonCard.astro` (§5.2, and the stale 2.64:1 comment at `:119`) |
| brand marks | `public/favicon.svg`, `public/favicon-32.png`, `public/apple-touch-icon.png`, `public/og-source.svg`, `public/og-default.png` |
| tests | `tests/e2e/m1-gaps.spec.ts`, `tests/e2e/m7-brand.spec.ts`, `tests/e2e/baseline-visual.spec.ts` (stale header), the 14 baseline PNGs |
| docs | `docs/design-tokens-m1.md` Decision 3, `docs/m7-ux-overhaul.md` CMP-11 |

---

## 7. Testing

- **`tokens-contrast.test.ts` unchanged and green** — 88 tests. It is the gate; it needs no help.
- **A new assertion the matrix structurally lacks: state-vs-state.** `--brand-soft` must differ
  from `--surface-sunken` by a stated minimum in both themes (§4.2), and the glossary chip's hover
  must change more than one property (§4.1). Pure, so both belong in Vitest.
- **`m7-brand.spec.ts`** rewritten per §5.2 and green.
- **`m7-print-hcm.spec.ts`** green unchanged — the six `forced-colors` blocks use only system
  keywords (`Canvas`, `CanvasText`, `GrayText`, `Highlight`, `ButtonBorder`) and reference no token.
- **14 baselines re-seeded** in the pinned container, diffed by eye before acceptance.
- **`npm run og` re-run in the same commit, after the favicon changes**, or the card ships an
  indigo mark.
- **Site spec §14's Lighthouse ≥ 95 gate is a manual obligation** outside the five-command DoD.
  This plan changes no JS and adds no bytes, so it is not at risk here — but it is named because
  the deferred font work *would* be.

---

## 8. Why the typeface is not in this plan

The decomposition bundled "self-host Atkinson Hyperlegible Next + Mono, 51,748 B" with the palette.
The audit found a blocker, so it is split out and deferred.

**The shipped subset covers 219 codepoints and the site renders 16 it does not have** — measured
across all 21 built pages:

```
→ 150 occurrences on 19/21 pages    ✓ 39    ← 36    ▁ 9    ✕ 9
⋯ 7    ⌀ 7    ↔ 5    ≈ 4    ▲ 4    ₂ 2    ⁿ 2    ≥ 2    ⁰ 1    ▶ 1    ≤ 1
```

`✓` and `✕` are the **renderer's own semantic marker glyphs** (`viz-found-mark`,
`viz-delete-mark`, `viz-badge` in `renderers/shared.ts`) — the exact marks this project's
colour-pairing rule depends on. Today the system stack renders all 16 correctly. Self-hosting makes
every one fall back to a different family than the text beside it, landing precisely on the
visualization's semantics.

**And it is unknown whether upstream Atkinson contains `▁ ⋯ ⌀ ▲ ▶` at all.** If it does not,
re-subsetting cannot fix this and the mixed rendering is permanent. That question must be answered
before the work can even be costed.

Two further obligations it would carry: `design-tokens-m1.md` Decision 1 chose the system stack
for _"0 bytes vs ~45 KB woff2"_ and _"zero layout shift by construction"_ — Plan B's fonts ship
**more** than the 45 KB that decision rejected, with `font-display: swap` and no `size-adjust`,
inverting all three rationales; and `public/_headers` has no `Cache-Control` entry for
`/fonts/*.woff2`, the one asset class that most wants `immutable`.

None of this makes the typeface wrong. Atkinson is a legibility face designed for low-vision
readers and there is a real accessibility argument for it. It is a **separate decision with its own
evidence**, and bundling it here would hold the palette hostage to a glyph-coverage question.

---

## 9. Amendments this plan requires

- **`design-tokens-m1.md` Decision 3** — _"Neutrals are cool slate… Brand is indigo — confident,
  link-recognizable."_ Both properties are deliberately deleted. That doc says its rationales
  _"are still binding"_, so this is a sign-off, not a fix.
- **`m7-ux-overhaul.md` CMP-11** — the dark severity ordering (§4.3).
- **`tokens.css`'s inline contrast matrices and every measured comment they feed** — a number in a
  comment is a claim about the build. Known stale after this change: `Challenge.astro:291`
  (16.33/10.85 → 16.15/12.99), `Visualizer.astro:1259` (≥4.46/6.51 → 4.43/6.94),
  `Visualizer.astro:1581` (≥7.90 → 13.76/19.17), `LessonCard.astro:119` and `tokens.css:196` (the
  2.64:1 trap, now 3.15:1).

---

## 10. Open questions

None blocking. The typeface's glyph coverage is a real open question and is the reason §8 defers
it rather than the reason this plan waits.
