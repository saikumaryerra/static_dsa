# Plan C — The Ledger and the Instrument — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transcribe each visualization's trace into a ruled table under the drawing — one row per step, value columns from `step.state`, "what happened" from the authored sentence — and restructure the instrument around it without leaking Predict mode's answers or breaking the JS-off page.

**Architecture:** A pure `core/ledger.ts` derives a `Ledger` from a `Trace`; `Ledger.astro` renders it server-side; the island rebuilds it on every `loadTrace` through the `applyTrace` seam Plan A created. The collapse is a native `<details>` (zero JS, correct with JS off). Instrument ids become stable so rows can be anchored. The scrub slider is retained and revealed on focus.

**Tech Stack:** Astro 7 static output, TypeScript strict, Vitest (`environment: 'node'` — no DOM), Playwright, Node ≥ 22.12.

**Spec:** `docs/superpowers/specs/2026-08-19-plan-c-ledger-design.md` (part 3 of 3).

## Global Constraints

- **Trace-then-render is not forked.** The ledger consumes the same precomputed `Step[]` the Player indexes into. It never re-runs an algorithm and never reads `highlights`.
- **Two provenance rules, enforced by tests, not review:** (1) a value cell reads `step.state` and nothing else; (2) the "what happened" cell is authored text via `firstSentence(step.explanation)`. **There is deliberately no code path from `highlights` into a cell** — a view layer that reconstructs meaning from highlight ids is a second narration channel able to disagree with the sentence the author wrote, on the one product whose promise is that nothing is faked.
- **No new dependencies. No new `localStorage` key.** JS ≤ 60 KB gz/page (measured headroom: 41.2 KB — budget is not a constraint here; design for correctness).
- **WCAG 2.1 AA.** Real buttons, fully keyboard-operable, never a colour-only signal, `prefers-reduced-motion` respected.
- **JS-off must work.** The ledger is M7-class server-rendered content: with JS off it *is* the lesson and must appear. Seek buttons ship `disabled` and are enabled by the island.
- **No silent caps** — a bounded output says so, in words, with both numbers.
- **DoD:** `npm run build`, `npm run lint`, `npm run format:check`, `npm run test`, `npm run test:e2e` all clean.
- **Stage paths explicitly; never `git add -A`.** **Conventional Commits. NEVER add a `Co-Authored-By` line.**
- The abandoned worktree at `3bf4d70` is a **reference, not a source**. It is pre-Plan-A and pre-Plan-B, and it ships two killed decisions. Read it; do not cherry-pick from it blind.

---

## File Structure

| file | responsibility |
|---|---|
| `src/viz/core/types.ts` | `LedgerColumn`, `LedgerSpec`; `Algorithm.ledger?` |
| `src/viz/core/ledger.ts` | **new, pure** — `firstSentence`, `buildLedger`, the row cap |
| `src/viz/Ledger.astro` | **new** — the `<details>` + `<table>` markup and its styles |
| `src/viz/Visualizer.astro` | stable `uid`; `showLedger` prop; the stacked frame; the slider's reveal-on-focus; island wiring (rebuild, seek, roving tabindex, `aria-current`); the predict gate |
| `src/components/StepLink.astro` | **new** — a prose link to a step |
| `src/viz/algorithms/binary-search.ts` | declares its `ledger` columns |
| `src/pages/about.astro`, `src/pages/dev/renderers.astro` | `showLedger={false}` + the falsified slider prose |
| `tests/unit/ledger.test.ts` | **new** — the pure half, including both provenance rules |
| `tests/e2e/plan-c-ledger.spec.ts` | **new** — DOM/storage half, JS-off, predict gate, anchors |

---

## Task 1: Stable instrument ids

**Files:** `src/viz/Visualizer.astro`, `tests/e2e/plan-c-ledger.spec.ts` (new)

`Visualizer.astro:136` is the **last `Math.random()` in `src/`**. Row anchors need a stable target.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/plan-c-ledger.spec.ts` with one case: build twice and assert the instrument ids are identical. Simplest reliable form — assert the id **shape** is derived, not random, by checking it contains the algorithm name:

```typescript
test('instrument ids are stable and name their algorithm', async ({ page }) => {
  await page.goto('/learn/binary-search');
  const ids = await page.locator('[data-viz]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('id') ?? ''),
  );
  expect(ids).toHaveLength(2);
  expect(ids[0]).toMatch(/^viz-binary-search-[a-z0-9]+$/);
  expect(ids[1]).toMatch(/^viz-linear-search-[a-z0-9]+$/);
  expect(new Set(ids).size).toBe(2); // collision-free on a two-instrument page
});
```

Read the file's existing helpers first if it already exists from a prior task.

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx playwright test tests/e2e/plan-c-ledger.spec.ts`
Expected: FAIL — ids are `viz-` + 6 random chars.

- [ ] **Step 3: Implement**

Replace the random uid with a deterministic hash of `` `${Astro.url.pathname}:${algorithm}:${renderer}` ``, formatted `` `viz-${algorithm}-${hash}` ``.

**The worktree's version claims a counter tiebreak that does not exist — implement a real one.** `sorting-basics` mounts three instruments and the dev gallery mounts twelve from one `samples.map()`; two instruments of the same algorithm and renderer on one page would otherwise collide. Use a module-scoped counter that only appends a suffix on an actual repeat, so the common case stays clean.

`src/components/uid.ts` exists to avoid `Math.random()` — read it and follow its shape rather than inventing a second convention.

- [ ] **Step 4: Verify nothing depended on randomness**

The audit established: the aria baselines contain no `viz-` string (already deterministic); pixel baselines are unaffected (ids are not painted); no e2e spec hardcodes a uid, and the two that touch ids read them back and assert only suffixes. **Confirm this yourself** by running the full e2e suite — if a baseline changes, something in the audit was wrong and I want to know before you re-seed it.

- [ ] **Step 5: DoD and commit**

```bash
git add src/viz/Visualizer.astro tests/e2e/plan-c-ledger.spec.ts
git commit -m "feat(viz): give every instrument a stable id

The last Math.random() in src/. Row anchors and <StepLink> need a target
that survives a rebuild, and three siblings (hero-demo, nf-demo, og-still)
already went stable for exactly this reason. Derived from pathname,
algorithm and renderer, with a real collision tiebreak — sorting-basics
mounts three instruments and the dev gallery twelve from one call site.

The built HTML becomes deterministic for the first time; the aria baselines
already were, because they record role/name/structure and no id."
```

---

## Task 2: `core/ledger.ts` — the pure half

**Files:** `src/viz/core/types.ts`, `src/viz/core/ledger.ts` (new), `tests/unit/ledger.test.ts` (new)

**Interfaces produced:**

```typescript
export interface LedgerColumn<TState> {
  label: string;
  from(step: Step<TState>): string | number | null;
  numeric?: boolean;
}
export interface LedgerSpec<TState> {
  columns: LedgerColumn<TState>[];
  costKey?: string;
}
export interface LedgerCell { text: string; numeric: boolean }
export interface LedgerRow { n: number; index: number; cells: LedgerCell[]; what: string }
export interface Ledger {
  headers: string[];
  rows: LedgerRow[];
  costIndex: number | null;
  /** Total steps in the trace, which may exceed `rows.length` when the cap binds. */
  total: number;
}
export function firstSentence(text: string): string;
export function buildLedger<TState>(trace: Trace<TState>, spec?: LedgerSpec<TState>): Ledger;
```

`LedgerColumn`/`LedgerSpec` go in `core/types.ts` (the root of the dependency graph, imports nothing) because `Algorithm.ledger?` needs the shape; the **behaviour** lives in `core/ledger.ts`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ledger.test.ts`. These four are the ones that matter — write the rest around them:

```typescript
describe('firstSentence', () => {
  it('does NOT split on a semicolon, and keeps the terminator', () => {
    // The flagship lesson's own sentence. An earlier draft used /[.;]/ and
    // truncated to "Search window is indices 0–5", losing the probe — the
    // single most-read cell on the site.
    expect(
      firstSentence(
        'Search window is indices 0–5; middle index 2 holds 5, which is less than 7. Discard the left half.',
      ),
    ).toBe('Search window is indices 0–5; middle index 2 holds 5, which is less than 7.');
  });

  it('splits on ? and ! as well as .', () => {
    expect(firstSentence('Is 5 the target? No, keep going.')).toBe('Is 5 the target?');
  });
});

describe('buildLedger — provenance', () => {
  it('reads step.state for value cells and NEVER highlights', () => {
    // A step whose highlights say one thing and whose state says another. The
    // cell must follow the state. This is provenance rule 1, and it is a test
    // because two drafts of this design broke it.
    const trace: Trace<{ lo: number }> = [
      { state: { lo: 7 }, explanation: 'x.', highlights: [{ kind: 'range', ids: ['i0', 'i9'] }] },
    ];
    const spec = { columns: [{ label: 'lo', from: (s) => s.state.lo, numeric: true }] };
    expect(buildLedger(trace, spec).rows[0]!.cells[0]!.text).toBe('7');
  });

  it('takes "what happened" verbatim from the authored explanation', () => {
    // Provenance rule 2. No paraphrase, no derivation from highlight kinds —
    // both were tried and rejected in review.
    const trace: Trace<unknown> = [
      { state: {}, explanation: 'Swap 5 and 2. They were out of order.', highlights: [{ kind: 'swap', ids: ['i0', 'i1'] }] },
    ];
    expect(buildLedger(trace).rows[0]!.what).toBe('Swap 5 and 2.');
  });
});

describe('buildLedger — the row cap', () => {
  it('caps at 200 rows and reports the true total', () => {
    const trace = Array.from({ length: 901 }, (_, i) => ({ state: {}, explanation: `Step ${i}.` }));
    const ledger = buildLedger(trace);
    expect(ledger.rows).toHaveLength(200);
    expect(ledger.total).toBe(901);
  });

  it('never binds on any run a lesson actually ships', () => {
    // Largest authored run is selection-sort at 33 rows — measured, not assumed.
    const trace = Array.from({ length: 33 }, (_, i) => ({ state: {}, explanation: `Step ${i}.` }));
    expect(buildLedger(trace).rows).toHaveLength(33);
  });
});
```

Also pin: the generic fallback surfaces every metric key in first-seen order; header order is declared → `what happened` → cost; a null/empty state value renders `·`; and **that `buildLedger` has no options parameter at all** (so cost withholding cannot creep back).

- [ ] **Step 2: Run, confirm failure. Step 3: Implement. Step 4: Run, confirm pass.**

`firstSentence`, corrected:

```typescript
/**
 * The authored sentence, truncated deterministically to its first sentence.
 *
 * Terminators are `.` `?` `!` — NOT `;`. An earlier draft included the
 * semicolon and gutted the flagship lesson: "Search window is indices 0–5;
 * middle index 2 holds 5…" truncated before the probe, which is the whole
 * point of the row. The terminator is RETAINED, because a cell ending in a
 * bare word reads as a truncation bug rather than a sentence.
 *
 * Deterministic because the alternative — a designer writing terser copy for
 * the table — is hand-mocking the product.
 */
export function firstSentence(text: string): string {
  const clean = String(text ?? '').trim();
  const match = clean.match(/^(.{0,160}?[.?!])(\s|$)/);
  return match ? match[1]! : clean;
}
```

- [ ] **Step 5: DoD and commit** (`feat(viz): derive a ledger from a trace`).

---

## Task 3: `Ledger.astro`, the stacked frame, and `showLedger`

**Files:** `src/viz/Ledger.astro` (new), `src/viz/Visualizer.astro`, `src/pages/about.astro`, `src/pages/dev/renderers.astro`

- [ ] **Step 1: Build the markup**

Requirements, each with its reason:

- **A native `<details>` for the collapse.** Zero JS, correct with JS off, and the disclosure is real rather than a dead button. `hidden="until-found"` does not work on `<tr>` and is not used.
- **`<th scope="row">` containing a `<button>`** — never `<tr role="button">`, which destroys the column-header association.
- **The button ships `disabled`**; the island enables it. A JS-off reader is never offered a control that cannot act.
- **A visually-hidden `<caption>`** naming the instrument and its step count. **No `aria-describedby`** — it would point at the same string that already supplies the accessible name.
- **Row ids** derived from the instrument's stable uid (Task 1): `${uid}-row-${n}`.
- **The ledger sits OUTSIDE `.viz-controls`**, so the existing `<noscript>` kill-switch does not hide it. Verify this against the current `<noscript>` block.
- **The cap notice**, rendered whenever `rows.length < total`: *"Showing the first 200 of {total} steps. Narrow the input to see the whole run."*

- [ ] **Step 2: `showLedger`**

`<Visualizer>` gains `showLedger` (default `true`). `/about` and `/dev/renderers` pass `false` — both are chrome demonstrations, not lessons. Independently, **the cost column inherits `showMetrics`**, so the two props cannot contradict each other: `/about` sets `showMetrics={false}` today and the worktree's table printed a `comparisons` column on it anyway.

- [ ] **Step 3: The stacked frame and the slider**

Restructure into one stacked frame (the worktree has a working layout — read it, and confirm it is still compatible with RSP-2's full-bleed negative margin and Plan A's frozen extent).

**The slider is retained and revealed on focus.** It cannot be deleted: `Visualizer.astro:2232`'s `if (!canvas || !explain || !slider) return;` sits before the abort controller, `mount()` and `data-viz-ready`, so removing it means the island never hydrates at all. **Eight specs depend on it.**

Use reveal-on-focus, **not** permanent visual hiding: a permanently invisible focusable range input fails WCAG 2.4.7, because a sighted keyboard user tabs into a control with no visible focus indicator. This site already ships that pattern on its skip link — reuse it.

- [ ] **Step 4: Fix `/about`'s prose**, which says *"the slider jumps anywhere"* and *"**Scrub** — drag the slider to jump to any point."* Both become false. Rewrite to describe what a reader now does: click a row, or focus the slider.

- [ ] **Step 5: DoD and commit.** Baselines will move — re-seed in the pinned container with `--update-snapshots=all` (bare means `changed`, which silently preserves sub-tolerance staleness), and look at them.

---

## Task 4: The island — rebuild, seek, and the row cap

**Files:** `src/viz/Visualizer.astro`, `tests/e2e/plan-c-ledger.spec.ts`

**This task fixes the worktree's worst defect: the ledger goes stale on every custom run.**

- [ ] **Step 1: Write the failing test**

```typescript
test('the ledger tracks a custom run', async ({ page }) => {
  await page.goto('/learn/sorting-basics');
  const viz = await hydrateViz(page); // reuse the existing helper
  const before = await viz.locator('[data-ledger-row]').count();
  await viz.locator('[data-viz-array]').fill('9,8,7,6,5,4,3,2,1');
  await viz.locator('[data-viz-run]').click();
  await expect
    .poll(() => viz.locator('[data-ledger-row]').count())
    .not.toBe(before);
  // and the "you are here" mark still resolves
  await viz.locator('[data-viz-forward]').click();
  await expect(viz.locator('[data-ledger-row][aria-current="true"]')).toHaveCount(1);
});
```

- [ ] **Step 2: Implement**

Rebuild the table inside `applyTrace` — the seam Plan A already created, which both `loadTrace` call sites (custom run and "Restore example") route through. Order: `setExtent` → `loadTrace` → **rebuild ledger** → `syncTraceBounds`.

Wire: row seek (`player.seek(index)`), roving tabindex (one tab stop for the whole table), arrow-key navigation, and `aria-current` sync. The worktree's `markLedgerRow` adjusts the well's `scrollTop` manually rather than calling `scrollIntoView` — that is the right pattern (it avoids scrolling ancestor containers) and should be carried.

Apply the **200-row cap** on the client path too, with the same notice. One rule, both paths.

- [ ] **Step 3: DoD and commit.**

---

## Task 5: The predict gate (P0)

**Files:** `src/viz/Visualizer.astro`, `tests/e2e/plan-c-ledger.spec.ts`

**Read spec §4 in full before starting.** The ledger renders `trace[i+1]` — the step every predictor grades against. For bubble and insertion sort the `swaps` column *is* the grading expression (`correctIndex = nextSwaps > swaps ? 0 : 1`). Nothing else on screen shows `i+1`. Three answers read off a four-row table would earn a **Practiced** mastery state, and `?review=1` opens predict automatically.

- [ ] **Step 1: Write the failing test**

```typescript
test('the ledger is hidden while Predict is on', async ({ page }) => {
  await page.goto('/learn/binary-search');
  const viz = await hydrateViz(page);
  await expect(viz.locator('[data-ledger]')).toBeVisible();
  await viz.locator('[data-viz-predict]').click();
  await expect(viz.locator('[data-ledger]')).toBeHidden();
  await viz.locator('[data-viz-predict]').click();
  await expect(viz.locator('[data-ledger]')).toBeVisible();
});

test('the review deep link cannot land on the answer key', async ({ page }) => {
  // ?review=1 auto-opens predict — the spaced-review path must not expose it.
  await page.goto('/learn/binary-search?review=1');
  const viz = await hydrateViz(page);
  await expect(viz.locator('[data-ledger]')).toBeHidden();
});

test('row seeks are declined while predicting, like the slider', async ({ page }) => {
  // Scrubbing past a question is the one thing predict mode exists to prevent.
});
```

- [ ] **Step 2: Implement in `setPredict`**

`setPredict` is already the single writer of every piece of predict state *"so the toggle, the review deep link and teardown cannot disagree."* Hide the ledger there — **hidden, not blanked**. Blanking cells past the current row still leaks through the row count, and this codebase already wrote the rule down: styling a leak is not hiding it, because opacity and colour are defeated by forced-colors, by a screen reader reading the accessible name, by select-all and by print.

Decline row seeks on the same condition the slider's handler uses.

- [ ] **Step 3: Fix the on-screen note — it is asserted verbatim by `m8-predict.spec.ts`**

It currently reads *"Auto-play and the step slider are off while Predict is on."* That is now wrong twice: the slider is no longer a visible control, and the table is also gated. Rewrite it, and update the assertion.

- [ ] **Step 4: DoD and commit** (`fix(viz): hide the ledger while Predict is on`, with the leak evidence in the body).

---

## Task 6: `<StepLink>` and the sticky chrome

**Files:** `src/components/StepLink.astro` (new), `src/viz/Ledger.astro` or `Visualizer.astro` (the CSS), `src/content/lessons/binary-search.mdx`

- [ ] **Step 1:** A `<tr id>` inside the visualizer's scoped stylesheet inherits **no** `scroll-margin-top` — the only rule covering lesson-body content is scoped to `h2`/`h3`. A fragment jump parks the row up to ~6.75rem under the sticky header and ToC bar. Add a `scroll-margin-top` on the row that derives from `--header-h` and `--toc-bar-h`, exactly as the heading rule does.

- [ ] **Step 2:** Two further occluders: the well's sticky `<thead>` sits over the top of the scroll region, and the instrument's `overflow: hidden` wrapper is a scrollable ancestor that fragment navigation will also scroll. **Probe both** — the audit flagged the second as unverified. A `<StepLink>` in prose is a *document* jump, so it needs the CSS offset **and** the manual well correction `markLedgerRow` already uses.

- [ ] **Step 3:** Use it in `binary-search.mdx` at least once, so the feature ships proven rather than merely available.

- [ ] **Step 4: DoD and commit.**

---

## Task 7: Columns, the fallback, and the record

**Files:** `src/viz/algorithms/binary-search.ts`, `docs/site-spec.md`, `docs/superpowers/specs/2026-08-18-show-your-work-decomposition.md`, `CLAUDE.md`, `README.md`

- [ ] **Step 1:** binary-search declares `ledger: { columns: [lo, mid, hi], costKey: 'comparisons' }`. trees-bst declares nothing and proves the generic fallback produces a useful table (`# · what happened · comparisons`).

- [ ] **Step 2:** Amend spec §11.2 with `LedgerColumn`/`LedgerSpec`/`Algorithm.ledger`, the two provenance rules, the 200-row cap, and the predict gate. Record in §19 that cost withholding stays killed and **why the predict gate is not the same thing** — a future reader will otherwise see a suppression mechanism and assume the deletion was reversed.

- [ ] **Step 3:** Update `CLAUDE.md`'s Visualization bullet and mark the decomposition's three plans complete.

- [ ] **Step 4:** Final DoD, all five green, baselines re-seeded with `--update-snapshots=all`.

---

## Self-Review

**Spec coverage.** §2 carry/delete/rewrite → Tasks 2–4. §3 staleness → Task 4. §4 predict P0 → Task 5. §5 ids → Task 1. §6 instrument + slider → Task 3. §7 StepLink → Task 6. §8 JS-off/budget → Task 3 (`<details>`, disabled buttons). §9 `showLedger` → Task 3. §11 row cap → Tasks 2 and 4. Every section is claimed.

**Placeholders.** Task 5 Step 1's third test is a title with an empty body — deliberate, because the assertion depends on how the slider's decline is implemented, which Task 5 Step 2 decides. The implementer writes it there. Everything else carries real code or a named file and rule.

**Type consistency.** `buildLedger(trace, spec?)` has **no options parameter** anywhere — that is load-bearing, so cost withholding cannot return by the back door. `Ledger.total` is the true step count and `rows.length` the capped count; the notice compares them. `firstSentence` returns the sentence **with** its terminator in every use.

**Risk worth naming.** Task 3 moves every visualizer on the site, so its baseline re-seed is the largest of the three plans. Re-seed with `--update-snapshots=all` and inspect: a bare `--update-snapshots` rewrites only captures that fail, which on a site-wide change leaves sub-tolerance staleness in place — measured on Plan B, where 6 of 14 changed visibly yet diffed under tolerance.
