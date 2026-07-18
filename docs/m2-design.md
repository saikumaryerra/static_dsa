# M2 Design Handoff — LessonLayout & Visualizer Control Surface

**Status:** Ready for Frontend Engineer implementation
**Consumer:** `frontend-engineer` (coordinated by `lead-developer`); validated by `qa-engineer`
**Scope:** M2 vertical slice — `LessonLayout` + the Binary Search `<Visualizer>` control surface + supporting components. Renderer internals (SVG element geometry) are M2/M3 engineering; this spec fixes the **frame, controls, states, and a11y** around them.
**Reuses:** every token in `docs/design-tokens-m1.md` / `src/styles/tokens.css`. **No new tokens** except the two flagged additions in §7 (both justified). Saturated color stays reserved for `--hl-*`; all chrome is neutral/brand so the visualization is the only place color pops.

---

## UX Rationale

A beginner scans a lesson in a Z-pattern looking for "the thing I press," so the Visualizer is framed as a bordered, elevated hero directly after the prose that sets it up ("show, then tell") and its controls use only universally-recognized media glyphs (Jakob's Law) — nothing to learn before you can learn. Every dynamic surface (step explanation, metrics, input errors) reserves its vertical space up front and announces politely to screen readers, so neither sighted nor assistive-tech users are surprised by shifting layout or silent state changes.

---

## 1. LessonLayout (spec §6, §8)

### 1.1 User Flow

1. User arrives at `/learn/binary-search`. Breadcrumb tells them where they are (Learn / Algorithms / Binary Search); one `<h1>` names the lesson.
2. Meta row confirms fit: difficulty, lesson time, reading time.
3. They read **Intuition** → **How it works**, which references the visualization.
4. They reach the **Visualizer** (the hero) and drive it.
5. They scan **Complexity**, expand **Code** tabs, optionally open **Pitfalls** and **Practice** collapsibles.
6. They hit **Mark complete**, then use **Prev/Next** to continue. On desktop the sticky ToC let them jump between any section at any time.

### 1.2 Wireframe

Composes **inside** `BaseLayout`'s `<main>` (already `max-w-container`, `px-4 md:px-6`, `flex-1`). Mobile-first (360px baseline); `≥768px` = `md:`, `≥1024px` = `lg:` deltas noted inline.

```
<main> (from BaseLayout: max-w-container, mx-auto, px-4 md:px-6)
  [LessonLayout root]  padding-block-start --space-6 (md: --space-10)

    <lg grid>  ≥1024px ONLY: grid-template-columns: minmax(0,1fr) 15rem;
               column-gap --space-10; align-items: start
               (<1024px: single column, ToC becomes an inline <details>, see 1.3)

    ├─ [Article column]  (grid col 1)  min-width 0 (so wide viz can't overflow)
    │
    │   [Breadcrumb]  see §6.1 — margin-bottom --space-4
    │
    │   [Lesson header]
    │     ├─ H1  --text-3xl; weight 700; --tracking-tight; max-width --measure; text-wrap balance
    │     ├─ Summary (frontmatter.summary)  --text-lg; --text-muted; --leading-relaxed;
    │     │         max-width --measure; margin-top --space-3
    │     └─ Meta row  flex; flex-wrap; gap --space-3; align items center; margin-top --space-4;
    │               --text-sm; --text-muted
    │         ├─ <DifficultyChip> (§6.5)
    │         ├─ dot separator "·" (aria-hidden)
    │         ├─ [clock icon 16px] "8 min lesson"   ← frontmatter.estimatedMinutes
    │         ├─ dot "·"
    │         └─ [book icon 16px] "4 min read"       ← computed reading-time (prose only, §1.4)
    │
    │   [ToC — mobile/tablet inline form]  <1024px only (see 1.3); margin-block --space-6
    │
    │   <hr>  1px --border; margin-block --space-6  (visual close of the header block)
    │
    │   [Lesson body]  ← MDX slot. All PROSE children capped at max-width --measure.
    │                    Full-column breakout allowed for: <Visualizer>, <CodeTabs>,
    │                    <ComplexityTable> (media/tables read better wider than 70ch).
    │     ├─ §1 h2 "Intuition"            prose
    │     ├─ §2 h2 "How it works"         prose
    │     ├─ §3 h2 "Visualizer"    ─────▶  <Visualizer> HERO (full column width) — see §2
    │     ├─ §4 h2 "Complexity"          <ComplexityTable> + one explanatory sentence
    │     ├─ §5 h2 "Code"                <CodeTabs Python/JavaScript/Java>
    │     ├─ §6 h2 "Common pitfalls"     <Collapsible> (native <details>)
    │     └─ §7 h2 "Practice"            2–3 Q + per-question <details> answers
    │
    │     section vertical rhythm: h2 margin-top --space-12, margin-bottom --space-4;
    │       paragraphs margin-block --space-4; each h2 gets `scroll-margin-top`
    │       = header height + --space-4 (see 1.3) so anchor jumps clear the sticky header.
    │
    │   <hr>  1px --border; margin-block --space-8
    │
    │   [MarkComplete]  §6.9 — left-aligned; margin-block --space-6
    │
    │   [PrevNext]  §6.3 — margin-top --space-8; margin-bottom --space-16
    │
    └─ [ToC rail]  (grid col 2) ≥1024px ONLY — see 1.3
```

### 1.3 Table of Contents — two responsive forms (one component, spec §6, §9)

The ToC is generated from the rendered `<h2>` headings (Intuition … Practice). Depth: **h2 only** for M2 (the 7 sections are all h2; nesting h3 adds noise for a beginner). Links are plain in-page anchors — **fully functional with JS off**.

- **`<1024px` (mobile + tablet):** an inline `<details class="toc">` placed after the meta row, collapsed by default, `<summary>` = "On this page" with a chevron (reuse the Collapsible chevron, §6.7). Rationale: at 768–1023px there isn't room for a 15rem rail beside 70ch prose (630 + 240 + gap > 768) — a sticky sidebar would crush the measure. An inline disclosure keeps the prose full-width.
- **`≥1024px`:** the grid's second column. `position: sticky; top: calc(var header-height + --space-6)` where header-height is `56px`/`64px md`; use `top: 5.5rem`. `max-height: calc(100svh - 7rem); overflow-y: auto`. Structure:

```
<nav aria-label="On this page">
  ├─ label  --text-xs; uppercase; letter-spacing 0.06em; --text-muted; margin-bottom --space-2
  └─ <ol> (no numbers)  --text-sm
      └─ <li> per h2:
          <a href="#slug">  block; padding-block --space-1-5; --text-muted;
             border-left 2px transparent; padding-left --space-3;
             hover → --text; aria-current="location" state (active section):
             color --text + border-left-color --brand
```

**Active-section highlight** (`aria-current="location"` + brand border) is a **progressive enhancement** via a tiny `IntersectionObserver` in the layout's `<script>` island — cheap, and the ToC is fully usable (anchor navigation) without it. If it pushes the JS budget, ship the static list; do not block on it. `scroll-margin-top` on every h2 keeps jump targets below the sticky header.

### 1.4 Reading-time vs lesson-minutes

Two distinct figures (put both, per requirement):
- **"N min lesson"** = `frontmatter.estimatedMinutes` (author's estimate, includes playing with the viz).
- **"M min read"** = computed in `src/lib/reading-time.ts` from the rendered prose word count at **200 wpm**, `Math.max(1, round(words/200))`. Excludes code blocks. Small util, no dependency.

### 1.5 Layout a11y checklist

1. **One `<h1>`** (lesson title); section titles are `<h2>` in document order — matches the ToC and gives screen-reader users a clean rotor. `<main>` landmark comes from BaseLayout; the sticky ToC is a labelled `<nav>` (`aria-label="On this page"`), distinct from Breadcrumb (`aria-label="Breadcrumb"`).
2. **Sticky-header offset:** `scroll-margin-top` on all h2 so keyboard/anchor focus never lands under the fixed header (WCAG 2.4.7 — focus must be visible).
3. **Measure & zoom (1.4.4/1.4.8):** prose capped at `--measure` (70ch), never a fixed px width; layout reflows to one column ≤ the lg breakpoint and survives 200% zoom because the grid collapses and the viz frame is `viewBox`-fluid.

---

## 2. Visualizer control surface (spec §10, §11 — the hero)

Binary Search on `ArrayRenderer`. The island hydrates `client:visible`; server-renders step 0 statically (see §5). Highlights this lesson uses: **`range`** (the live lo..hi window), **`compare`** (mid vs target), **`active`** (the mid cell being read), **`found`** (target hit). No `swap`.

### 2.1 Wireframe (mobile-first)

```
[Visualizer region]  <figure> or <section aria-label="Binary search visualization">
                     full article-column width; margin-block --space-8

  [Hero frame]  bg --surface; border 1px --border; border-radius --radius-card;
                box-shadow --shadow-1; padding --space-4 (md: --space-6); overflow hidden
    │
    ├─ [SVG canvas]  role="img"; <title> + <desc> (§3);
    │     width 100%; viewBox responsive (e.g. "0 0 640 220"); aspect-ratio fixed via
    │     the viewBox → zero CLS; NO fixed px width. Cells/markers get stable ids
    │     (i0..iN, marker-lo/mid/hi) per §11.5. Background transparent (frame supplies surface).
    │     Vertical breathing room: margin-block-end --space-4.
    │
    ├─ [Metrics readout]  (showMetrics) — flex; flex-wrap; gap --space-2; margin-bottom --space-3
    │     small neutral pills: bg --bg; border 1px --border; radius --radius-full;
    │     padding --space-1 --space-3; --text-sm; --text-muted; mono for the number.
    │     e.g.  ⟨ Comparisons 3 ⟩ ⟨ Range size 2 ⟩ . Updates on every step (no aria-live —
    │     it's a summary of the explanation, which IS announced; keeps SR output uncluttered).
    │
    └─ [Explanation line]  <p id="viz-explain-{id}" aria-live="polite" aria-atomic="true">
          band inside the frame; border-top 1px --border; padding-top --space-3;
          --text-base; color --text; min-height 3rem (reserve ~2 lines — DE/FR run 30% longer,
          no jump); font-variant-numeric tabular. Step 0 text: "Ready. Searching for 7 in a
          sorted array of 6 items. Press Play or Step."

  [Control bar]  margin-top --space-4; display grid; row-gap --space-3
                 (visually separate from the frame — controls are chrome, canvas is content)

    ├─ [Scrub row]  flex; align items center; gap --space-3
    │     ├─ label  "Step" --text-sm --text-muted (visually hidden dup as <label for>)
    │     ├─ <input type="range" min=0 max=lastStep step=1 value=cur>  flex:1; min-height 44px
    │     │        (track thin, THUMB ≥24px with a 44px transparent hit slug); accent-color --brand
    │     └─ counter  "3 / 12"  --text-sm; --text-muted; mono; tabular-nums; min-width 4ch
    │
    ├─ [Transport row]  flex; justify center; align center; gap --space-2; flex-wrap
    │     ├─ (⟲) Reset        44×44 icon btn
    │     ├─ (◀|) Step back   44×44 icon btn
    │     ├─ (▶ / ⏸) Play/Pause  PRIMARY 56×56 icon btn (filled --brand, --brand-contrast glyph)
    │     ├─ (|▶) Step fwd    44×44 icon btn
    │     └─ (on <480px the row wraps: Reset+Back | Play | Fwd+Speed stay grouped, never orphan Play)
    │
    └─ [Speed row]  flex; align center; gap --space-2
          ├─ <label for="speed-{id}">  "Speed" --text-sm --text-muted
          └─ <select id="speed-{id}">  0.5× / 1× / 1.5× / 2× / 3× (default 1×); min-height 44px;
                 bg --bg; border 1px --border-strong; radius --radius-control; padding-inline --space-3
                 (native select = free keyboard + i18n + a11y; no custom dropdown)

  [Custom input]  (allowCustomInput) <form>; margin-top --space-4;
                  padding-top --space-4; border-top 1px --border
    ├─ legend/label  "Try your own input"  --text-sm; weight 600; --text; margin-bottom --space-2
    ├─ fields row  flex; flex-wrap; gap --space-3; align items end
    │    ├─ field: <label>Array</label> <input placeholder="[1,3,5,7,9,11]">  flex:1; min-w 12rem;
    │    │         min-height 44px; bg --bg; border 1px --border-strong; radius --radius-control;
    │    │         font-mono; aria-describedby="viz-err-{id}"
    │    ├─ field: <label>Target</label> <input inputmode=numeric placeholder="7"> width ~6rem
    │    └─ <button type=submit class="btn-secondary">Run</button>  min-height 44px
    └─ [Error]  <p id="viz-err-{id}" role="alert">  --text-sm; use a neutral-danger
                pattern: (!) triangle icon 16px + text in --text; border-left 2px --border-strong;
                padding-left --space-3; margin-top --space-2; hidden when empty.
                Friendly copy, e.g. "That array isn't sorted — binary search needs ascending order.
                Try [1,3,5,7,9,11]." / "Use whole numbers separated by commas, like [4,8,15,16]."
                Keep ≤ 30 items (parseInput cap, §11.4) → "Keep it to 30 numbers or fewer."
```

### 2.2 Desktop deltas (`≥768px`)

- Frame padding → `--space-6`.
- Transport + Speed share one row: `justify-content: space-between` — transport group centered-left, Speed group right.
- Custom-input fields sit on one row (they already `flex-wrap`).
- Canvas gets more height headroom via a wider viewBox aspect if the renderer wants it; still fluid.

### 2.3 Which controls are icon vs text, and the inline SVG icons

All transport controls are **icon-only buttons with `aria-label`** (media glyphs are universal; text would bloat and break i18n wrapping). Reset, Speed's `<label>`, "Try your own input", and "Run" are **text** (or text+icon) because they're less universal. Match the ThemeToggle icon conventions: inline `<svg viewBox="0 0 24 24">`, `aria-hidden="true"`, no icon library (spec §4). Transport glyphs are **filled** (`fill="currentColor"`, no stroke) for instant recognizability; Reset and status icons are **stroked** (`fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`) to match house style.

| Control | Style | Path(s) (24×24) |
|---|---|---|
| **Play** | filled | `M8 5v14l11-7z` |
| **Pause** | filled | `M6 5h4v14H6z` + `M14 5h4v14h-4z` |
| **Step forward** | filled | `M7 5l8 7-8 7z` + `M17 5v14` (as a 2px rect/line) |
| **Step back** | filled | `M17 5l-8 7 8 7z` + `M7 5v14` |
| **Reset** (restart) | stroked | arc `M4 12a8 8 0 1 0 2.3-5.6` + arrowhead `M4 4v4h4` |
| **Clock** (meta) | stroked, 16px | `circle cx12 cy12 r9` + `M12 7v5l3 2` |
| **Book** (meta) | stroked, 16px | reuse the home "open book" pair from `index.astro` |
| **Error (!)** | stroked, 16px | `M12 3 2 20h20z` + `M12 10v4` + `M12 17h.01` |

### 2.4 Hit areas & sizes

- Every button ≥ **44×44px** (WCAG 2.5.5 target size); Play/Pause **56×56** to establish primary emphasis. Icon buttons: `display:inline-flex; place-items:center; border:none; background:transparent; color:--text-muted; radius:--radius-control; hover→--text`. The primary Play/Pause overrides: `background:--brand; color:--brand-contrast; hover→color-mix(--brand 88% --text)` (reuse `.btn-primary` treatment).
- Slider thumb visually ~24px but wrapped in a 44px-tall interactive track row.
- `.btn-secondary` (for "Run"): `bg:--bg; border:1px --border-strong; color:--text; radius:--radius-control; padding --space-2 --space-4; min-height 44px; hover→border --brand`. (New shared class — see §7 note; parallels `.btn-primary`.)

---

## 3. Accessibility for the Visualizer (spec §10, §12)

1. **Every control is a real element.** Transport = `<button type="button">` each with a specific `aria-label` ("Play", "Pause", "Step forward", "Step back", "Reset to start"). Play/Pause is a **single toggle button**: swap glyph + `aria-label` + `aria-pressed` (`true`=playing) on state change. Speed = native `<select>` with `<label>`. Scrub = native `<input type="range">` with an associated `<label>` ("Step") and `aria-valuetext="Step 3 of 12"` updated on input so SR announces position, not a bare number.
2. **Step explanation is the live region.** Exactly `#viz-explain-{id}`, `aria-live="polite"`, `aria-atomic="true"`. It updates on every step (play tick, step±, scrub, reset). Politeness = **polite** so rapid play-scrubbing doesn't flood assertive queues; the metrics pills are silent (their info is inside the explanation). **Input validation error** is separate: `#viz-err-{id}` with `role="alert"` (assertive) so a mistake interrupts — and the input is `aria-describedby` that node.
3. **Keyboard operability — all controls, including the slider.** Buttons: native (Enter/Space). `<select>`: native. Slider: native range gives Arrow = ±1 step, Home/End = first/last, PageUp/Down = ±larger — no custom handlers needed; do **not** hijack these. Optional convenience keys **only when focus is inside the Visualizer** and not in the text input: `Space` = Play/Pause, `←/→` = step (but if focus is on the slider, let the slider own arrows — don't double-handle). Focus ring is the global `:focus-visible` token; never removed.
4. **Color is never the only signal — pair every `--hl-*` with a non-color cue.** The renderer must render these dual encodings (Von Restorff highlight *plus* a shape/label/icon):

   | State | Color token | Non-color pairing (required) |
   |---|---|---|
   | **range** (lo..hi window) | `--hl-active` @ 15% fill (`color-mix`) | a bracket/underbar drawn under the range **plus** text markers **"lo"** and **"hi"** below the boundary cells |
   | **compare** (mid vs target) | `--hl-compare` 2px ring | a **"mid"** label above the cell + the explanation naming both values ("mid = index 2 (5) vs target 7") |
   | **active** (cell being read) | `--hl-active` 2px stroke | slight scale/lift of that cell + it's the only cell with the "mid" caret |
   | **found** | `--hl-found` fill 15% + 2px ring | a **checkmark ✓ glyph** inside/above the cell + explanation "Found 7 at index 4" |
   | **eliminated** (outside range) | reduced opacity 0.45 (not a hue) | visibly dimmed + optional diagonal hatch `<pattern>` — never distinguished by color alone |

   Never let frontier/found or any two highlights differ by hue only (design-tokens §Decision 3). Labels/markers use `--text` on the surface, never small text on a solid highlight fill.
5. **SVG state description.** Canvas has `role="img"` + `<title>` ("Binary search on a sorted array") and a `<desc>` the renderer **rewrites each step** to mirror the explanation ("Range is indices 3 to 5; mid is index 4 (value 9); comparing with target 7"). This gives SR users the diagram's meaning, redundant with the live region but available on demand via the image.
6. **Focus management.** Stepping/playing must **not** steal focus — the user keeps focus on whatever control they pressed (announcement flows via the live region). On custom-input **error**, move focus to the array `<input>` (it's `aria-describedby` the alert). On valid **submit**, keep focus on "Run"; announce the reset via the live region ("Loaded your array of 6 items. Ready.").
7. **`prefers-reduced-motion`.** The renderer **snaps** (no positional/color tween) — set target state, skip CSS transitions — while still emitting every step + explanation, so the pedagogy survives. Autoplay still advances step-by-step (it's information, not decoration) but at the chosen speed with instant redraws. The global tokens already collapse durations to 0.01ms; the renderer must additionally *not* stage multi-phase animations (e.g. no "slide then fade") under reduced motion — one atomic redraw per step.

---

## 4. All control & viz states

Disabled = real `disabled` attribute (implies `aria-disabled`); disabled buttons drop to `--text-muted` @ 45% + `cursor:not-allowed`, no focus ring. Per the M1 rule, only disable controls that are genuinely no-ops in the current state — never paint dead gray for unreachable states.

| State | Canvas | Explanation | Play/Pause | Step back | Reset | Step fwd | Scrub | Notes |
|---|---|---|---|---|---|---|---|---|
| **Idle / step 0** | full array, range = whole array, no mid yet | "Ready. Searching for 7…" | **Play** enabled | **disabled** (at start) | **disabled** (already at start) | enabled | at min | Reset+Back off is correct — both are no-ops here, not dead. |
| **Playing** | advancing each tick | updates per step | **Pause** (`aria-pressed=true`) | enabled | enabled | enabled | tracks position (updates live) | User can scrub/step while playing → treat as pause+seek. |
| **Paused (mid-trace)** | frozen at current step | current step | **Play** | enabled | enabled | enabled | at current | Default after any manual step. |
| **At end (target found or exhausted)** | final state (✓ found, or empty range "not found") | "Found 7 at index 4." / "Range empty — 7 is not in the array." | **disabled** (nothing to play) | enabled | enabled | **disabled** | at max | Reaching end during play auto-pauses. To replay, press Reset (which re-enables Play). |
| **Custom input — focused** | unchanged | unchanged | unchanged | — | — | — | — | Convenience keys (Space/arrows) suspended while text input has focus. |
| **Custom input — invalid** | unchanged (keeps last valid trace) | unchanged | unchanged | — | — | — | — | `#viz-err` `role=alert` shows friendly msg; focus → array input; input border → `--border-strong` stays (no red-only). |
| **Custom input — valid submit** | redraws step 0 of new trace | "Loaded your array… Ready." | Play enabled | disabled | disabled | enabled | reset to min | Player resets to step 0; announce via live region. |
| **Reduced motion** | snaps between steps | same | same | same | same | same | same | No tweens; every step still emitted. |

---

## 5. JS-off / pre-hydration fallback (M2 acceptance)

The Visualizer must never look broken without JS. `Visualizer.astro` **server-renders a complete, intentional still**:

```
[Hero frame]  (identical framing: --surface, --border, --radius-card, --shadow-1)
  ├─ [Static SVG]  the INITIAL array (default or `input` prop) drawn at build time —
  │      real cells with index labels + "lo"/"hi" markers spanning the whole array.
  │      role="img"; <title>/<desc> = "Sorted array [1,3,5,7,9,11], searching for 7."
  │      Drawn from the parsed input array alone (no algorithm run needed), so it's crisp
  │      and on-brand and decoupled from concrete algorithm modules.
  ├─ [Explanation line]  step-0 text, statically rendered (not a live region here).
  └─ [.viz-nojs-note]  shown ONLY under <noscript>: an unobtrusive inline row —
        (info icon 16px) "Enable JavaScript to step through this interactively."
        --text-sm; --text-muted; margin-top --space-3; border-top 1px --border; padding-top --space-3.

[Control bar] + [Custom input]  ← wrapped in `.viz-controls`.
```

**Kill-switch mirrors the ThemeToggle `<noscript>` pattern** (BaseLayout precedent): in the Visualizer's head-injected/scoped `<noscript><style>`, `.viz-controls{display:none!important}` and `.viz-nojs-note{display:flex!important}` (default state hides the note, shows nothing else). Result with JS off: a real array diagram + a calm one-line notice — reads as "static preview," not "dead box." With JS, the note is hidden and controls hydrate. The static SVG also doubles as the **pre-hydration** state (the island upgrades it in place on `client:visible`), so there's no flash/CLS.

---

## 6. Supporting components — visual specs (brief; reuse tokens)

Only the non-obvious states/spacing/aria are listed; everything else inherits the M1 base (global focus ring, `.nav-link`, type scale).

### 6.1 Breadcrumb (static)
`<nav aria-label="Breadcrumb"><ol>` inline, `--text-sm --text-muted`, gap `--space-2`. Items: Learn → Track → **Lesson**. Separators: `<span aria-hidden="true">/</span>` (or a 16px chevron). Last item = current: plain text (not a link), `aria-current="page"`, color `--text`. Links hover → `--text`. Wraps (never truncates) for long/i18n titles.

### 6.2 TableOfContents — see §1.3 (both responsive forms fully specified there).

### 6.3 PrevNext (static)
`<nav aria-label="Lesson navigation">`; on mobile stack, `≥768px` two cells `justify-between`. Each side = whole-card `<a>` (reuse `.track-card` treatment: `--surface`, `--border`, `--radius-card`, hover→`--border-strong`+`--shadow-1`), padding `--space-4`. Content: overline `--text-xs uppercase --text-muted` "Previous"/"Next" (Next right-aligned) + title `--text-base weight 600 --text` + directional arrow in its own `aria-hidden` span (i18n). **At a boundary, omit the missing side entirely** (Next-only keeps its right cell) — no disabled placeholder.

### 6.4 ComplexityTable (static, renders `frontmatter.complexity`)
`<table>` with `<caption class="sr-only">"Time and space complexity"`. Header row scoped (`<th scope="col">`). Rows: Time (best/average/worst), Space (worst). Big-O values in `--font-mono`, `--text-sm`. `bg --surface`, border `1px --border`, `--radius-card`, cell padding `--space-3`, row separators `1px --border`. Muted `--text-muted` labels, `--text` values. Full column width (breakout, not measure-capped). If a complexity key is absent, render "—" (don't crash). One explanatory sentence sits **below** the table in prose (measure-capped).

### 6.5 DifficultyChip (static)
Pill: `--radius-full`, `bg --surface`, `border 1px --border`, `--text-xs uppercase`, letter-spacing 0.06em, `--text-muted`, padding `--space-1 --space-3`. The **word** ("Beginner"/"Intermediate") is the signal — not color-only, so we keep it neutral and **do not spend an `--hl-*` hue** (those stay reserved for the viz). Optional 6px leading dot for scannability, but the text carries meaning.

### 6.6 CodeTabs (island, minimal — WAI-ARIA Tabs)
`role="tablist"` (aria-label "Code language") + `role="tab"` buttons (Python/JavaScript/Java) controlling `role="tabpanel"`s. **Roving tabindex**: active tab `tabindex=0` others `-1`; `←/→` move + activate, `Home/End` jump. Active tab: `--text` + 2px bottom border `--brand`; inactive `--text-muted`, hover `--text`. Panels are Shiki-highlighted `<pre>` (`--font-mono`, `--text-sm`), `bg --surface`, `--radius-card`, overflow-x auto. **Copy button** top-right of the active panel: icon (clipboard `M9 4h6v2H9z` + `rect 6 6 12 14`) + `aria-label="Copy code"`; on click, swap to check glyph + a `role="status"` "Copied" for ~1.5s. All tabs' code ships in HTML (works JS-off: first panel visible, others via `[hidden]` that JS toggles; without JS, spec-gap fallback = show all panels stacked with visible language headings). Copy button hidden under `<noscript>`.

### 6.7 Callout (static)
`role="note"` (or `<aside>`); `bg --surface`, `--radius-card`, padding `--space-4`, **left border 4px** accent, plus a **16px icon and a bold visible label** ("Note"/"Tip"/"Warning") so meaning is never color-only. To preserve the calm palette (saturated color reserved for the viz), accents stay in-system: Note/Tip → `--brand`; Warning → `--border-strong` + a warning triangle icon (the icon + "Warning" word carry the semantics; we intentionally do **not** introduce a red token). Body prose measure-capped.

### 6.8 Collapsible (static, native `<details>`)
Styled `<details><summary>`. Summary: `cursor:pointer`, `--text` weight 600, padding `--space-3 0`, a chevron (`M9 6l6 6-6 6` rotated) that rotates 90° on `[open]` via `transition: transform var(--duration-base)` — **gated by `prefers-reduced-motion`** (snap). Remove default marker (`summary::-webkit-details-marker{display:none}` + `list-style:none`). Content padding-block `--space-3`. Native = keyboard + JS-off both free. Used for Pitfalls (§6) and each Practice answer (§7).

### 6.9 MarkComplete (island — mirrors ThemeToggle persistence)
`<button type="button" aria-pressed="{done}">`. Persistence: `localStorage` key **`lesson:{slug}:complete` = "1"** (parallels the ThemeToggle `try/catch` read/write and the `apply()` label-sync pattern; `client:visible` island is fine — it's below the fold). States:
- **Incomplete:** `.btn-secondary` treatment, empty-circle icon (`circle r9`) + label "Mark as complete".
- **Complete:** filled check-circle icon (`circle r9` + `M8 12l3 3 5-6`) in `--brand` (`--hl-found` is reserved for the viz). Label "Completed ✓", `aria-pressed=true`. Subtle `bg color-mix(--brand 12% transparent)`.

Click toggles state + storage + `aria-pressed` + label (announce via the button's own name change; optional `role="status"` "Lesson marked complete"). Hidden under `<noscript>` (can't persist without JS — same rationale/kill-switch as ThemeToggle). The `/learn` index reads the same key to show its checkmark (M4).

---

## 7. Token notes for the Frontend Engineer

- **Everything above resolves to existing M1 tokens** — no color/space/type/radius/motion invention. Prose measure = `--measure` (70ch); frame radius = `--radius-card`; control radius = `--radius-control`; all motion via `--duration-*`/`--ease-standard` (already reduced-motion-gated).
- **Two additions (flag as `// SPEC-GAP` in `global.css @layer components`, both are compositions, not new design values):**
  1. `.btn-secondary` — outline button (`--bg` fill, `1px --border-strong`, `--radius-control`, ≥44px, hover→`--brand` border). Parallels the existing `.btn-primary`; used by "Run" and MarkComplete. *Justification:* the app needs a secondary action treatment; reuses only existing tokens.
  2. `.sr-only` utility (if Tailwind's `sr-only` isn't already available in the v4 setup) for the ComplexityTable caption and visually-hidden `<label>`s. *Justification:* standard a11y helper; no visual token.
- **Renderer highlight fills:** use `color-mix(in srgb, var(--hl-*) 15%, transparent)` for fills + the raw token as a 2px stroke/ring, `--text` for labels on top (per design-tokens §Decision 3 FE note). Every `--hl-*` MUST ship its §3.4 non-color pairing.
- **No new dependencies** (spec §4): native `<details>`, `<select>`, `<input type=range>`, `IntersectionObserver`, hand-drawn inline SVG icons only.

---

**Handoff to `frontend-engineer` (via `lead-developer`):** implement §1 layout and §6 components first (they're static and unblock content authoring), then the §2–§5 Visualizer once the `ArrayRenderer`/`Player` land. **Do not self-approve** — `qa-engineer` must run the keyboard-only + axe pass on `/learn/binary-search` and verify the JS-off static fallback (§5) and reduced-motion snap (§3.7) before M2 closes.
