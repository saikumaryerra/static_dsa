# Plan B — The Achromatic Palette — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repaint LearnDSA's chrome achromatic so the six `--hl-*` visualization roles are the only colour on a lesson page, and repair the five distinctions that removing the hue collapses.

**Architecture:** No new tokens, no new components, no JS. Thirteen existing chrome tokens change value across four CSS blocks that a unit test already enforces as byte-mirrors of each other; the shadow hue and two `theme-color` meta literals follow; and five places that signalled state with the retired hue are given a second signal. The `--hl-*` roles and `--accent-warn` are untouched.

**Tech Stack:** Astro 7 static output, plain CSS custom properties, Vitest (`environment: 'node'`), Playwright, Node ≥ 22.12.

**Spec:** `docs/superpowers/specs/2026-08-19-plan-b-achromatic-palette-design.md` (part 2 of 3 — see `docs/superpowers/specs/2026-08-18-show-your-work-decomposition.md`).

## Global Constraints

- **No new dependencies**, no new `localStorage` key, no backend, no JS added. This plan ships **zero** new bytes of JavaScript.
- **WCAG 2.1 AA.** Never a colour-only signal. `tests/unit/tokens-contrast.test.ts` (88 tests) is the gate and must stay green **without being edited** — it reads every value from disk.
- **A number in a comment is a claim about the build.** Every measured figure in a comment this plan invalidates must be re-measured, not guessed.
- **The six `--hl-*` roles and `--accent-warn` do not change** — 24 declarations deliberately untouched.
- **`tokens.css` and `BaseLayout.astro` are in `.prettierignore`** (designer handoff, verbatim blocks). Hand-keep them in Prettier style; `format:check` will not police them.
- **DoD, all five clean:** `npm run build`, `npm run lint`, `npm run format:check`, `npm run test`, `npm run test:e2e`.
- **Stage paths explicitly; never `git add -A`** — `.impeccable/`, `DESIGN.md`, `PRODUCT.md` and two PNGs are untracked and must stay out.
- **Conventional Commits. NEVER add a `Co-Authored-By` line.**
- Branch `feat/show-your-work-slice`. Do not merge to `main`.

---

## File Structure

| file | responsibility |
|---|---|
| `src/styles/tokens.css` | 36 of the 46 declarations (light `:root`, `[data-theme="dark"]`, the `prefers-color-scheme` mirror), the two shadow tokens, and the inline contrast matrices in its comments |
| `src/styles/global.css` | the remaining 10 declarations (`@media print` mirror), the print shadow mirror, `.btn-secondary` hover/active |
| `src/layouts/BaseLayout.astro`, `src/components/ThemeToggle.astro` | the `theme-color` literals |
| `src/pages/glossary.astro` | the A–Z chip's hover (§4.1) |
| `src/viz/Visualizer.astro` | `.viz-btn` hover/active (§4.2) + stale measured comments |
| `src/components/LessonCard.astro` | the now-no-op title hover rule + its stale 2.64:1 comment |
| `public/favicon.svg` + 2 PNGs + `og-source.svg` + `og-default.png` | the brand mark |
| `tests/unit/palette-states.test.ts` | **new** — the state-vs-state assertions the contrast matrix structurally lacks |
| `tests/e2e/m1-gaps.spec.ts`, `tests/e2e/m7-brand.spec.ts` | the two CI failures |
| `tests/e2e/baseline-visual.spec.ts` + 14 PNGs | stale header, re-seeded baselines |

---

## Task 1: The palette

**Files:** `src/styles/tokens.css`, `src/styles/global.css`, `src/layouts/BaseLayout.astro`, `src/components/ThemeToggle.astro`, `tests/e2e/m1-gaps.spec.ts`

**Interfaces:** Consumes nothing. Produces the token values every later task depends on.

**This must be one commit.** `tokens-contrast.test.ts` enforces a three-way mirror (byte-identity between `[data-theme="dark"]` and the `prefers-color-scheme` block, value-parity between the print mirror and light `:root`, and dark-coverage). Changing one block without the others fails immediately — which is the test doing its job, not an obstacle to route around.

- [ ] **Step 1: Apply the 13 tokens across all four blocks**

Light `:root` (10 changes — `--surface`, `--surface-raised` and `--brand-contrast` are already the new value):

```css
  --bg: #FCFCFB;
  --surface-sunken: #F1F1EF;
  --text: #141519;
  --text-muted: #5A5C64;
  --border: #DCDDE0;
  --border-strong: #7C7E86;
  --brand: #141519;
  --brand-soft: #E8E8E5;
  --brand-border: #DCDDE0;
  --brand-hover: #2B2D33;
```

`[data-theme="dark"]` **and** the `prefers-color-scheme` mirror (13 each, byte-identical to each other):

```css
  --bg: #0E0F12;
  --surface: #17181C;
  --surface-sunken: #101114;
  --surface-raised: #1F2026;
  --text: #ECECEA;
  --text-muted: #A3A5AD;
  --border: #2A2B31;
  --border-strong: #6B6D75;
  --brand: #ECECEA;
  --brand-contrast: #0E0F12;
  --brand-soft: #242530;
  --brand-border: #2A2B31;
  --brand-hover: #FFFFFF;
```

`@media print` in `global.css` (the same 10 as light `:root`).

**`--brand-soft` is the one value the spec deliberately left open (§4.2).** `#E8E8E5` / `#242530` are starting points, chosen so hover fill, active fill (`--surface-sunken`) and the resting surface are three distinguishable steps. **Verify them, do not assume them** — Step 3 is where they earn their place. If the matrix or Task 2's new test rejects them, pick another step and say which.

- [ ] **Step 2: The shadow hue**

`tokens.css:189-190` builds every shadow from `rgb(15 23 42 / …)` — slate-900, the *retired* `--text`. Change the hue only; **preserve every alpha exactly**, so the elevation model's tuning survives:

```css
  --shadow-1: 0 1px 2px 0 rgb(20 21 25 / 0.05), 0 1px 3px 0 rgb(20 21 25 / 0.06);
  --shadow-2: 0 2px 4px -1px rgb(20 21 25 / 0.06), 0 6px 16px -2px rgb(20 21 25 / 0.10);
```

Apply the same substitution to the dark block and to the print mirror in `global.css` (`:571,573`). The dark shadows use `rgb(0 0 0 / …)` — leave those alone; black is already achromatic.

- [ ] **Step 3: Run the contrast gate — it is the whole verification**

Run: `npx vitest run tests/unit/tokens-contrast.test.ts`
Expected: **88 passed**, no edit to that file.

If anything fails, the palette is wrong, not the test. Report the failing pair with its computed ratio and the threshold it missed before changing anything else.

- [ ] **Step 4: The `theme-color` literals**

`BaseLayout.astro:72-73`: `#F8FAFC` → `#FCFCFB`, `#0B1220` → `#0E0F12`.
`ThemeToggle.astro:147`: `'#0B1220' : '#F8FAFC'` → `'#0E0F12' : '#FCFCFB'`.

- [ ] **Step 5: Fix the hardcoded e2e assertion**

`tests/e2e/m1-gaps.spec.ts:21,25` — these are asserted at `:64`/`:72` against the computed root background and **fail CI** otherwise:

```typescript
const DARK_BG = 'rgb(14, 15, 18)';
const LIGHT_BG = 'rgb(252, 252, 251)';
```

- [ ] **Step 6: Re-measure every comment this invalidates**

`tokens.css`'s inline contrast matrices (around `:109-190`, `:196-236`) state ratios that are now wrong. Recompute them with the same maths `tokens-contrast.test.ts` uses and rewrite each. Known figures that change, to check your working against: `--text` on `--surface` 17.85 → **18.24** (light), 12.63 → **15.00** (dark); dark `--border-strong` on `--surface-raised` 2.64 → **3.15**.

**Do not skip this.** A stale ratio in a comment is a false claim about the build, and this file's comments are the reason the next person trusts the palette.

- [ ] **Step 7: Full check and commit**

Run: `npm run build && npm run lint && npm run format:check && npm run test`

`npm run test:e2e` will now fail on the 14 visual baselines — that is expected and Task 4's job. Run it anyway and confirm **only** baseline failures appear; any other failure belongs to this task.

```bash
git add src/styles src/layouts/BaseLayout.astro src/components/ThemeToggle.astro tests/e2e/m1-gaps.spec.ts
git commit -m "feat(design): repaint the chrome achromatic

The six --hl-* roles carry real meaning inside a visualization and were
competing with an indigo header, buttons, focus rings and links. The chrome
gives up its only hue so the drawing keeps all of them — site spec §13's own
instruction to reserve saturated colour for algorithm state.

13 tokens across 46 declarations in four blocks the mirror tests bind
together, plus the shadow hue (built from the retired slate --text) and the
two theme-color literals. tokens-contrast.test.ts passes unedited at 88/88.

Dissolves a documented WCAG 1.4.11 defect on the way: dark --border-strong
on --surface-raised was 2.64:1 with a --text-muted workaround built around
it, and is now 3.15:1."
```

---

## Task 2: The five state collapses

**Files:** `src/pages/glossary.astro`, `src/styles/global.css`, `src/viz/Visualizer.astro`, `src/components/LessonCard.astro`, `tests/e2e/m7-brand.spec.ts`, `tests/unit/palette-states.test.ts` (new)

**Interfaces:** Consumes Task 1's token values. Produces `tests/unit/palette-states.test.ts`.

`--brand` is now byte-identical to `--text`, so five distinctions that rode on the hue are gone. Every one of them still passes the contrast matrix, because that matrix tests colour against *grounds* and never state against *state*.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/palette-states.test.ts`. It parses `tokens.css` the same way `tokens-contrast.test.ts` does — **import or copy that file's `cssRules`/`declarations`/`block` and luminance helpers rather than writing a third implementation**; read it first and follow its shape.

```typescript
/**
 * State-vs-state assertions the contrast matrix structurally cannot make.
 *
 * `tokens-contrast.test.ts` pairs every colour against the GROUND behind it, so
 * it passes loudly (18.24:1) on `--brand` even now that `--brand` is
 * byte-identical to `--text`. What it never checks is whether two INTERACTION
 * STATES of the same control remain distinguishable from each other — which is
 * exactly what the achromatic repaint put at risk.
 */
import { describe, expect, it } from 'vitest';

describe('interaction states stay distinguishable without a hue', () => {
  it('hover fill and active fill are different colours, both themes', () => {
    // `.btn-secondary` and `.viz-btn` fill with --brand-soft on hover and
    // --surface-sunken on active. Identical values make the two states
    // pixel-identical, because Visualizer.astro:1556 already establishes that a
    // 1px border move alone "reads as a rendering artefact".
    for (const theme of ['light', 'dark'] as const) {
      expect(token(theme, '--brand-soft')).not.toBe(token(theme, '--surface-sunken'));
    }
  });

  it('hover fill is a perceptible luminance move from the resting surface', () => {
    // The glossary bar's own comment sets the floor: it rejects 1.05:1 as "no
    // perceptible feedback at all" and calls 1.28:1 barely better. With the hue
    // gone the fill must carry the move on luminance alone.
    for (const theme of ['light', 'dark'] as const) {
      expect(contrast(token(theme, '--brand-soft'), token(theme, '--bg')))
        .toBeGreaterThanOrEqual(1.1);
    }
  });

  it('--brand is byte-identical to --text — the premise these tests defend', () => {
    // Not an aspiration: it is the design. Pinned so that if someone reintroduces
    // a brand hue, they are sent here to reconsider the second signals below.
    for (const theme of ['light', 'dark'] as const) {
      expect(token(theme, '--brand')).toBe(token(theme, '--text'));
    }
  });
});
```

Implement `token(theme, name)` and `contrast(a, b)` from the sibling file's helpers.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/palette-states.test.ts`
Expected: FAIL on the first case if you used `#F1F1EF` for `--brand-soft`; PASS if Task 1's `#E8E8E5` landed. Either way the test must exist before the fix, and the first case must be *provably* able to fail — if it passes immediately, temporarily set `--brand-soft` equal to `--surface-sunken`, watch it go red, and restore.

- [ ] **Step 3: The glossary A–Z chip — give it a border**

`glossary.astro:366`. The rule's own comment (`:353-365`) diagnoses this exactly: the fill is a hue shift doing the work, and _"the chip has no border to carry the other half of the idiom the way those two controls do."_ Give it one, so hover reads as fill + border like `.btn-secondary` and `.viz-btn`:

```css
  a.glossary__chip:hover {
    background-color: var(--brand-soft);
    border-color: var(--border-strong);
  }
```

The chip needs a resting `border: 1px solid transparent` (or a resting `--border`) so the hover border does not shift layout — check the existing rule and add whichever keeps the box stable. **Then rewrite the comment**: its measured figures (1.07:1 light / 1.29:1 dark, `--brand` on `--brand-soft` 5.62/4.88) are all stale, and its central claim — that a hue shift does the work — is no longer true of this codebase.

- [ ] **Step 4: `.btn-secondary` and `.viz-btn` — confirm, don't rewrite**

`global.css:446-455` and `Visualizer.astro:1562-1569` are already correct **provided** `--brand-soft ≠ --surface-sunken`, which Task 1 Step 1 and Step 1's test now guarantee. Leave the rules alone. Update the stale measured comment at `global.css:444` (`--text` is 15.97:1 light / 11.82:1 dark on the hover fill — recompute for the new `--brand-soft`) and the equivalent at `Visualizer.astro:1556`.

- [ ] **Step 5: `LessonCard` — delete the no-op hover**

`LessonCard.astro:170` hovers `.lesson-card__title` from `var(--text)` to `var(--brand)`. Those are now the same value, so the rule paints nothing. Delete it **and its `transition`** at `:157-171`, leaving the card's border and shadow hover (`global.css:478-499`) to carry the state — those tokens stay distinct (light `#DCDDE0` vs `#5A5C64`; dark `#2A2B31` vs `#A3A5AD`).

Also fix the stale comment at `LessonCard.astro:119`, which asserts the dark 2.64:1 `--border-strong` trap that Task 1 dissolved to 3.15:1.

- [ ] **Step 6: Rewrite the assertion that now fails**

`tests/e2e/m7-brand.spec.ts:279-280` polls the hovered title colour and asserts it differs from resting. `:279` now passes trivially and `:280` fails. Replace both with an assertion that the title **stays** `--text` and that the card still signals hover — `:270` (boxShadow) and `:271` (borderTopColor) already do the latter and survive unchanged, so pin the title's stability beside them rather than deleting the coverage.

- [ ] **Step 7: Full check and commit**

Run: `npm run build && npm run lint && npm run format:check && npm run test && npm run test:e2e`
Expected: everything green **except** the 14 visual baselines (Task 4).

```bash
git add src tests/unit/palette-states.test.ts tests/e2e/m7-brand.spec.ts
git commit -m "fix(design): give the collapsed hover states a second signal

--brand is now byte-identical to --text, so five distinctions that rode on
the hue disappeared while every contrast assertion kept passing — the matrix
tests colour against grounds and never state against state.

The glossary A-Z bar lost hover on 26 targets (fill move 1.10:1, label
unchanged), below the 1.28:1 its own comment already rejects as no
perceptible feedback; it gains the border its comment says it lacks.
LessonCard's title hover became a no-op and is deleted, leaving the card's
border and shadow to carry it. .btn-secondary and .viz-btn are correct once
--brand-soft is a distinct step from --surface-sunken, which is now a test.

palette-states.test.ts makes the state-vs-state assertions the contrast
matrix structurally cannot."
```

---

## Task 3: The brand mark

**Files:** `public/favicon.svg`, `public/favicon-32.png`, `public/apple-touch-icon.png`, `public/og-source.svg`, `public/og-default.png`

**Interfaces:** none.

`public/favicon.svg:4` is `fill="#4F46E5"` and is **not generated from anything**. `build-og.mjs:321` inlines it **verbatim** into the OG card, so `npm run og` alone leaves an indigo mark on an achromatic page.

- [ ] **Step 1: Repaint the SVG**

`public/favicon.svg:4`: `#4F46E5` → `#141519`.

Check the whole file for other brand literals before assuming line 4 is the only one.

- [ ] **Step 2: Re-rasterise the two PNGs**

`BaseLayout.astro:96` says: *"Both PNGs are rasterized from public/favicon.svg — regenerate them from it, never redraw the mark by hand."* **No script exists to do this** — that is a real gap this task closes one of two ways:

1. Add a small script beside `scripts/build-og.mjs` (it already rasterises SVG → PNG, so reuse its renderer; read it first), wire it as an npm script, and run it; or
2. If that renderer cannot be reused cheaply, rasterise them by whatever means and **document the exact command in `BaseLayout.astro:96`'s comment**, so the next person is not left with an instruction and no tool.

Prefer (1). Say which you did and why. Dimensions must match the current files: `favicon-32.png` 32×32, `apple-touch-icon.png` 180×180 (verify before regenerating).

- [ ] **Step 3: Regenerate the OG card**

Run: `npm run og`

Then **look at `public/og-default.png`** and confirm the mark is achromatic and the card's colours match the new light `:root`. This is a visual check; do not skip it because the script exited 0.

- [ ] **Step 4: Full check and commit**

Run: `npm run build && npm run lint && npm run format:check && npm run test`

```bash
git add public scripts package.json src/layouts/BaseLayout.astro
git commit -m "feat(design): repaint the brand mark achromatic

favicon.svg is not generated from anything and build-og.mjs inlines it
verbatim, so `npm run og` alone would have left an indigo mark on an
achromatic card. The two PNG derivatives had no regeneration script at all,
only a comment instructing that they be rasterised from the SVG."
```

---

## Task 4: Baselines and the record

**Files:** the 14 baseline PNGs, `tests/e2e/baseline-visual.spec.ts`, `docs/design-tokens-m1.md`, `docs/m7-ux-overhaul.md`, `README.md`

- [ ] **Step 1: Re-seed all 14 baselines in the pinned container**

Every route changes — this repaints the whole site. Use `mcr.microsoft.com/playwright:v1.61.1-noble` with `VISUAL_BASELINE=1 CI=1`. Local rasterization differs from CI's; a locally-seeded PNG will fail the gate.

Routes × themes: `home` (light, dark, light-nojs, dark-nojs), `learn-index` (light, dark), `lesson-binary-search` (light, dark, light-nojs, dark-nojs), `glossary` (light, dark), `not-found` (light, dark).

**Then look at them.** A repaint is exactly the change where a real regression hides inside expected churn. Confirm: no text lost contrast, no control lost its affordance, the glossary A–Z bar still reads as interactive, and the visualization's `--hl-*` colours are untouched.

- [ ] **Step 2: Correct the stale spec header**

`baseline-visual.spec.ts:5-14` claims the baselines are *"UNSEEDED"*, that *"the directory does not exist"*, and that `VISUAL_BASELINE` is *"never [set] on the DoD gate"*. All three are false: 14 PNGs are tracked, and `ci.yml:90` sets it on the DoD step. Also retire the skip rationale at `:30-35` if it references the same falsehoods.

- [ ] **Step 3: Amend the two binding design decisions**

- `docs/design-tokens-m1.md` **Decision 3** — *"Neutrals are cool slate… Brand is indigo — confident, link-recognizable."* Both properties are now deliberately deleted. That doc states its rationales *"are still binding"*, so record this as a sign-off with the reason (the colour budget goes to the `--hl-*` roles), not as a correction.
- `docs/m7-ux-overhaul.md` **CMP-11** — the warning callout's keyline was chosen because warning had the weakest accent. In dark it is now 1.82× *quieter* than note. Record the accepted trade: amber becomes the page's only chrome hue, and a hue among achromatic neighbours reads as more urgent than a louder neutral.

- [ ] **Step 4: Full check and commit**

Run: `npm run build && npm run lint && npm run format:check && npm run test && npm run test:e2e` — all five green, including the re-seeded baselines in the container.

```bash
git add tests/e2e docs README.md
git commit -m "test(design): re-seed the visual baselines for the achromatic chrome

All 14 captures change — this repaints every route. Re-seeded in the pinned
CI container, since local rasterization differs from the gate's.

Also corrects baseline-visual.spec.ts's header, which still claimed the
baselines were unseeded and the gate unarmed; both stopped being true at
dab6108. design-tokens-m1 Decision 3 and m7-ux-overhaul CMP-11 are amended
rather than quietly contradicted."
```

---

## Self-Review

**Spec coverage.** §2 palette → Task 1. §4.1 glossary → Task 2 Step 3. §4.2 `--brand-soft` → Task 1 Step 1 + Task 2 Steps 1/4. §4.3 Callout → Task 4 Step 3 (doc-only, by design — the code is correct, the decision is what changed). §4.4 brand mark → Task 3. §4.5 shadows → Task 1 Step 2. §5 CI failures → Task 1 Step 5 and Task 2 Step 6. §5 baselines → Task 4. §9 amendments → Task 1 Step 6 and Task 4 Step 3. §8 fonts are out of scope and appear in no task, which is correct.

**Placeholders.** One value is deliberately unfixed — `--brand-soft` (§4.2) — and it is marked as such in three places with starting points and the constraint it must satisfy. That is a decision the spec chose to leave to measurement, not a gap.

**Type consistency.** No TypeScript surface changes. `token(theme, name)` and `contrast(a, b)` in Task 2's test are named identically to their use, and the plan directs the implementer to the sibling file's existing helpers rather than a third implementation.

**Risk worth naming.** Task 1 leaves `npm run test:e2e` red on 14 baselines until Task 4. That is deliberate — re-seeding before the repairs in Task 2 would bake the collapsed hover states into the baselines as truth. Tasks 1–3 verify with the four fast gates; Task 4 closes the fifth.
