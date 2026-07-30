# M3 Renderer Suite — UI/UX Visual & a11y Handoff

**Author:** UI_UX-Designer · **For:** Frontend-Engineer (implements alongside `docs/m3-architecture.md`), Lead-Developer (review), QA-Engineer · **Milestone:** M3 · **Status:** Ready to implement

**Reuses verbatim:** every token in `src/styles/tokens.css` / `docs/design-tokens-m1.md`; the m2 Visualizer chrome (frame, metrics pills, explanation live-region, controls) in `src/viz/Visualizer.astro`; the established cell/marker visual language in `src/viz/renderers/ArrayRenderer.ts`. **Introduces nothing new** except the token decision resolved in §1 (which is: *add no tokens*). This document governs only what is drawn **inside the SVG canvas**; all chrome around it is owned by m2-design and unchanged.

---

## 1. RESOLVED — the open token decision (architecture §4 SPEC-GAP #1)

### Decision: BLESS THE REUSE. Do **not** add `--hl-insert` / `--hl-delete`. The six `--hl-*` tokens stand.

**Why — three converging reasons:**

1. **The palette's CVD budget is already spent.** design-tokens §Decision 3 chose exactly six hues for luminance separation under deutan/protan simulation, and already flags frontier/found (teal vs green) as the weakest surviving pair. A new `--hl-insert` would be green-adjacent (insert reads as "add/success") and `--hl-delete` pink/red-adjacent — near-copies of found and swap, **indistinguishable from them for a CVD user anyway**. The color would encode a semantic difference (insert≠found, delete≠swap) a colorblind user cannot perceive — the "color-alone" failure §12 forbids. Honest reuse + a mandatory distinct marker is *more* accessible than a fake-distinct hue.

2. **Calm-palette principle (Von Restorff).** The system reserves saturated color so state pops against neutral chrome. Eight saturated roles dilutes that reservoir. Six is the ceiling the rest of the design was tuned around.

3. **The reuse never needs color to disambiguate.** `insert`/`found` and `delete`/`swap` are different *operations*, not two things a learner tells apart at one instant; where blue is shared (`active`/`pointer`/`range`) treatment already differs (stroke+lift vs named caret vs low-alpha band) — a sharing M2 already ships and QA blessed (binary search draws a blue `range` band *and* a blue `active` stroke in one frame; they read cleanly because fill≠stroke≠lift).

**Hardening conditions (non-negotiable, encoded in `core/highlight.ts`):**
- The non-color marker is **mandatory**, never optional, for every reused kind. A renderer emitting `insert`/`delete`/`pointer`/`range` without its marker is a bug QA must fail.
- The explanation line + SVG `<desc>` must always *name* the operation ("Inserting 6…", "Removing root 9…") so audio users never depend on the reused hue.
- Because the mapping lives in one file, promoting to real tokens later is a documented one-line change. M3 does not need it.

### Canonical `kind → {token, css-class, marker}` table — encode in `core/highlight.ts`

CSS-class naming continues the M2 convention (`is-range`, `is-active`, `is-found` exist; the rest are new, same `is-<kind>` pattern). All fills use `color-mix(in srgb, var(--hl-*) 15%, var(--surface))` (18% for green states, matching M2's found). Raw token is the stroke.

| kind | token | css class | fill | stroke weight | **required non-color marker** |
|---|---|---|---|---|---|
| `compare` | `--hl-compare` | `is-compare` | 15% mix | 2px | **dashed tie-line** joining the two ids + amber ring on both |
| `swap` | `--hl-swap` | `is-swap` | 15% mix | 2px | **`↔`** arrow glyph in the band between the two ids |
| `active` | `--hl-active` | `is-active` | 15% mix | **3px** + `translateY(-3px)` lift | **named caret** (`mid`, `curr`, `i`, …) |
| `visited` | `--hl-visited` | `is-visited` | 15% mix | 2px | **`✓` badge** (small filled dot with check) top-right of node |
| `frontier` | `--hl-frontier` | `is-frontier` | 15% mix | **2px dashed** | **dashed ring** (the stroke *is* the cue) + "queued" affordance |
| `found` | `--hl-found` | `is-found` | **18% mix** | **3px** | **`✓` glyph** above the cell/node |
| `insert` *(reuse)* | `--hl-found` | `is-insert` | 18% mix | 2px | **`+` caret** above + fade-in (opacity 0→1) |
| `delete` *(reuse)* | `--hl-swap` | `is-delete` | 15% mix | 2px | **`✕` glyph** + strikethrough through value + fade-out (opacity 1→0.42) |
| `pointer` *(reuse)* | `--hl-active` | `is-pointer` | *(none — caret only)* | *(none)* | **named label caret/arrow** from `highlight.meta.label` (`head`,`top`,`front`,`rear`,`root`,`p`) |
| `range` *(reuse)* | `--hl-active` | `is-range` | 15% band | *(none / 0)* | **underbar bracket** under the span + **dim out-of-range cells to opacity 0.42** |

> **Precedence when one element carries several kinds** (encode in `applyHighlights`): `found` > `active` > `compare`/`swap` > `insert`/`delete` > `visited` > `frontier` > `range` for the *rect treatment*; markers **stack** (a cell can be `active` with a `pointer` caret inside a `range` band — all three cues render, per M2 precedent). Only fill/stroke obeys precedence; carets, tie-lines, `↔`, `✓`, `+`, `✕` are additive overlays.

---

## 2. Shared visual language (one system across all 9 renderers)

All values in **viewBox units** (`width="100%" height="auto"`, `preserveAspectRatio="xMidYMid meet"`, transparent background so the `--surface` frame shows through). These extend ArrayRenderer's constants so the 9 diagrams are one family.

### 2.1 Base cell / node primitive

```
CELL / SLOT / FRAME-CARD (rectangular)
  rect  rx = 6 (--radius-control)   default 54 × 54 (linear structures)
        fill var(--surface); stroke var(--border-strong) 1.5
  value text  fill var(--text); --font-mono; 20px; weight 600; anchor middle; baseline central
  index/label fill var(--text-muted); --font-mono; 12px; weight 400; BELOW the cell or in caption band

NODE (circular — tree / heap / graph)
  circle  r = 20  fill var(--surface); stroke var(--border-strong) 1.5
  value text  16px central; id/label 12px --text-muted just outside where needed
```
Rectangular primitive = index-addressed/sequential (array, stack, queue, call-stack, linked-list, heap-backing-array); circular = graph-shaped (tree, heap-tree, graph). "Boxes are cells, circles are nodes."

### 2.2 Highlight ring/fill recipe (single source, design-tokens §Decision 3)

```
fill   = color-mix(in srgb, var(--hl-KIND) 15%, var(--surface))   /* 18% for found/insert */
stroke = var(--hl-KIND)                                            /* raw token */
  stroke-width 2px normal | 3px emphasis (active, found)
label on top = var(--text)   /* NEVER small text on a solid highlight fill */
transition = fill/stroke var(--duration-base) var(--ease-standard)   /* auto-snaps under reduced-motion */
```
Reuse M2's `.viz-cell__rect` transition + `.is-*` hooks; add new `is-compare/is-swap/is-visited/is-frontier/is-insert/is-delete/is-pointer` blocks using this exact recipe.

### 2.3 Node / edge / arrow stroke weights

```
edge / link (default)             stroke var(--border-strong) 1.5px
edge on search/traversal path     stroke var(--hl-active|visited) 2.5px + dasharray "5 4"
next/prev/pointer arrow           stroke var(--border-strong) 1.5px + arrowhead marker
arrowhead <marker>                auto-orient triangle, fill = line stroke, 8×8 units
range underbar / bracket          stroke var(--hl-active) 3px linecap round (reuse .viz-range-bar)
compare tie-line                  stroke var(--hl-compare) 1.5px dasharray "4 3"
frontier ring                     node's own stroke set 2px dashed "4 3"
```

### 2.4 Marker glyph style (the non-color layer)

Markers live in a **rebuilt-each-step overlay group** (`class="viz-markers"`) above the persistent cell/node layer. Text glyphs are `<text>` in `--font-mono`, bold, `text-anchor="middle"`, in the reserved TOP band (26 units above the primitive) or caption band below.

```
✓  found/visited   18px  fill var(--hl-found)/var(--hl-visited)   (reuse .viz-found-mark)
+  insert          16px  fill var(--hl-found)  bold
✕  delete          16px  fill var(--hl-swap)   bold  + strikethrough <line> across value
↔  swap            16px  fill var(--hl-swap)   centered between the two ids
named caret        12px  fill var(--text)  bold  + small ▲/▼ (6 units) same color, pointing at primitive
range bracket      3px line underbar (reuse .viz-range-bar geometry)
```
**a11y:** marker layer is decorative-redundant with `<desc>`; meaning comes from the single `role="img"` SVG's `<title>`+`<desc>`. Glyph color always clears 3:1 on `--surface` both themes (§3).

### 2.5 Spacing rhythm inside the viewBox

```
PAD      = 10   (outer margin, reuse ArrayRenderer PAD_X)
GAP      = 8    (between adjacent linear cells/slots)
TOP band = 26   (marker strip above primitives)
XSTEP    = 64   (horizontal center-to-center for tree/heap/linked-list)
YSTEP    = 68   (vertical level-to-level for tree/heap/call-stack)
caption  = 18   (baseline offset for lo/hi/front/rear/top/index text below a primitive)
```

### 2.6 Eliminated / inactive dimming

```
opacity: 0.42   (reuse ArrayRenderer's .is-eliminated — do not invent a second dim level)
```
Applies to out-of-range cells, popped slots kept for context, non-current call-stack frames (optional), fading-out delete targets. Always paired with a structural cue (outside the bracket, below the top line, strikethrough) — never the sole signal.

---

## 2b. Per-renderer canvas specs

Layout math is the architect's (§4); below is the **visual treatment**. All `viewBox`-fluid, computed from item count so they never overflow at the caps.

### 2b.1 LinkedListRenderer (§4.2)
```
[TOP band 26]        + / ✕ / named pointer carets
[node row]  ┌────┐ next→ ┌────┐ next→ ┌────┐ next→ ⌀ (null)
            │ 12 │───────│ 34 │───────│ 56 │─────────▶
            └────┘       └────┘       └────┘
              n0           n1           n2
[caption]   pointer labels (head ▲, p ▲) under their node in --text
  doubly: second ◀──prev arrow on a parallel track 6 units below
```
- Node 54×40 rounded rect; pitch 88 (XSTEP 64 + 24 arrow gap). `next` arrow horizontal line + arrowhead `--border-strong` 1.5px; on reassignment upgrades to `--hl-active` 2.5px dashed + `pointer` caret above source. Null terminal `⌀` `--text-muted` 18px.
- **SPEC-GAP:** >12 nodes → wrap to a second row with a down-then-left elbow rather than shrink illegibly. Flag; build only if a lesson needs it.

### 2b.2 StackRenderer (§4.3)
```
  top ▶ ┌──────────┐   ← "top" pointer caret
        │    56    │   ← is-insert fades in / is-delete fades out
        ├──────────┤
        │    34    │
        ├──────────┤
        │    12    │   index 0 = bottom
        └──────────┘
           base line (--border-strong 1.5px)
```
- Vertical 54-tall slots, GAP 4 (read as a physical stack), item 0 bottom, width 96. Push = fade-in top + `+`; pop = fade to 0.42 + remove + `✕`. `top` = `is-pointer` caret + ▶ at top slot's left. viewBox height grows with size.

### 2b.3 QueueRenderer (§4.4)
```
[caption]  front ▲                         rear ▲
[slots]  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐  capacity fixed
         │· ││34││56││78││· ││· ││· ││· │
         └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘
           0   1   2   3   4   5   6   7
  circular: ↩ wrap arc from slot[cap-1] to slot[0] when rear<front; wrapped live run gets is-range band
```
- Fixed `capacity` slots always drawn (empty = centered `·` `--text-muted` dimmed 0.42) so the ring buffer's fixed size is visible. `front`/`rear` = named `is-pointer` carets. Enqueue `+` at rear; dequeue `✕`+fade at front. Circular: `↩` `<path>` arc `--border-strong` 1.5px dashed from last to first slot; logically-occupied (physically wrapped) run gets `is-range` blue band; bracket splits into two segments when wrapped.

### 2b.4 TreeRenderer (§4.5, BST)
```
[TOP band]              ✓ / caret markers above active node
                  ┌──(50)──┐
                 /          \        edges: straight <line> --border-strong 1.5px
             ┌─(30)─┐     ┌─(70)     search-path edge → --hl-active 2.5px dashed
            (20)   (40)  (60)
                                    node = circle r20, value 16px central (value = identity, no id label)
```
- `cx = PAD + inorderRank·XSTEP`, `cy = PAD + TOP + depth·YSTEP`. Edges drawn **first** (behind nodes) parent→child center. Active search path (root→current) → `--hl-active` 2.5px dashed edges + current node `is-active` (3px + lift). compare/found/insert standard rings + markers; insert fades new leaf in with `+`.
- **Legibility:** keep node `r` fixed, let width grow (frame scales SVG down uniformly); do NOT shrink nodes. Balanced trees at ≤15 nodes sit in ~960×340.

### 2b.5 HeapRenderer (§4.6)
```
[tree band]          ┌──(9)──┐
                    (7)      (6)       nodes circle r18 (two views share height)
                   /   \
                (4)    (5)
   ────────────────────────────────
[array band]  ┌──┐┌──┐┌──┐┌──┐┌──┐    cells 46×46
              │ 9││ 7││ 6││ 4││ 5│
              └──┘└──┘└──┘└──┘└──┘
                0   1   2   3   4      index caption
```
- **The shared-index link is the lesson.** Highlight on index `k` → BOTH `nodeId(k)` (tree) and `cellId(k)` (array) get the **same `is-*` class**; for the ≤2 actively compared/swapped indices, a **thin dashed tether** (`<line>` `--hl-KIND` 1px dashed opacity 0.6) connects tree-node center to array-cell center. `swap` draws `↔` in BOTH bands. 1px `--border` divider between bands; wider of the two bands sets viewBox width.

### 2b.6 GraphRenderer (§4.7)
```
              (0)
        (5)         (1)      nodes on a circle: cx=CENTER+R·cosθ, cy=CENTER+R·sinθ
     (4)               (2)   R scales with n so nodes never collide
              (3)           node circle r20, value/label 16px central
  edges: straight <line> behind nodes, --border-strong 1.5px
  directed: arrowhead at "to" end;  weighted: midpoint label in a --surface pill (1px --border)
```
- **CVD-critical trio:** `visited` = violet + `✓` badge; `frontier` = teal **dashed ring** (dash is the differentiator); `active` = blue 3px + lift. Shapes (dashed-ring vs ✓-badge vs solid-ring) carry the load, never color. Traversed edge → `--hl-active` 2.5px. Weight labels get a `--surface` background pill.

### 2b.7 CallStackRenderer (§4.8)
```
  current ▶ ┌────────────────────────┐   ← is-active (top), "curr" caret
            │ fib(3)   args: n=3      │      label --text 14px semibold
            │ ↩ returns: —            │      args/return --text-muted 12px mono
            ├────────────────────────┤
            │ fib(4)   args: n=4      │   dimmed 0.42 (waiting, optional)
            └────────────────────────┘
```
- Vertical frame cards (wider, text-rich), top = current. call = fade-in top + `+`; return = show `returns:` value then fade-out + `✕`. Return value flips to `--text` when set. Card width ~260, text left-aligned (long args never shift the label).

### 2b.8 ChartRenderer (§4.9, Big-O — CVD-critical)
```
 operations ▲
            │                          ╱ n²   (dash-dot, steepest, end-label)
            │                    ╱────  n log n
            │              ╱──────────  n
            │  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  log n  (fine dash)
            │  ────────────────────────  1      (solid, flattest)
            └────────────────────────────▶ n
```
- **Color-free meaning** (5 curves): each a `<polyline>` in `--text-muted` **2.5px** with a distinct `stroke-dasharray` AND a direct end-of-line text label:

  | fn | dasharray | end label |
  |---|---|---|
  | `1` | none (solid) | `O(1)` |
  | `logn` | `2 5` | `O(log n)` |
  | `n` | `8 5` | `O(n)` |
  | `nlogn` | `12 4 2 4` | `O(n log n)` |
  | `n2` | `2 3 10 3` | `O(n²)` |

- Emphasis: `active` curve → `--hl-active` 3px (keeps its dash); `compare` → `--hl-active` + `--hl-compare` on the two. Base neutral so only the *comparison* highlights. Axes `--border-strong` 1px + arrowheads; gridlines `--border` 1px (optional); tick/axis labels `--text-muted` --text-xs. End-labels `--text` --text-xs bold, ~90 right-margin reserved; de-collide by ±10 units if two finish close. `maxN ≈ 20–40`, y auto-scaled to max curve at maxN.

---

## 3. a11y per renderer (builds on m2-design §3)

### 3.1 `<title>` / `<desc>` pattern (every SVG is one `role="img"`)

`<title>` = algorithm label (static, from `mount({title})`). `<desc>` **rewritten every step to mirror `step.explanation`** (works in ArrayRenderer — replicate). Templates:

| Renderer | `<desc>` template |
|---|---|
| LinkedList | `"List: 12 → 34 → 56 → null. Pointer p at node 1 (34); inserting 40 after it."` |
| Stack | `"Stack of 3, top is 56. Pushing 78."` / `"Popping 56; top is now 34."` |
| Queue | `"Queue capacity 8, 3 items, front at index 1, rear at index 3. Enqueuing 90 at index 4."` |
| Tree | `"Visiting node 50; target 40 is smaller, so go left to node 30."` |
| Heap | `"Comparing index 1 (7) with index 3 (4); 7 is larger, swapping to restore the max-heap."` |
| Graph | `"At node 2 (visited). Neighbors 3 and 5 added to the frontier."` |
| CallStack | `"Calling fib(3), args n=3. Stack depth 3."` / `"fib(2) returns 1; unwinding."` |
| Chart | `"At n=20: O(n²) reaches 400 operations, O(n log n) 86, O(n) 20, O(log n) 4, O(1) 1."` |

### 3.2 Non-color pairing — confirmed present for every kind
Every kind ships its marker: LinkedList (pointer carets, +, ✕), Stack (top caret, +, ✕), Queue (front/rear carets, +, ✕, wrap arc), Tree (dashed path + ✓ + caret + `+`), Heap (↔, ✓, dashed tether, caret), Graph (✓ badge, dashed frontier ring, lift), CallStack (curr caret, +, ✕), Chart (dasharray + end-label). **QA gate:** no renderer may render a `--hl-*` fill/stroke without its paired marker — assert in `renderStatic` unit tests (marker element must be in the string).

### 3.3 Contrast — new elements, both themes (all existing tokens)
- Value text (`--text`/`--surface`): 16.6:1 light / 11.9:1 dark ✓
- Index/caption/weight labels (`--text-muted`/`--surface`): 7.0:1 / 5.7:1 ✓
- Chart curves (`--text-muted` 2.5px graphic ≥3:1): 7.0/5.7:1 ✓; end-labels `--text` ✓
- Edges/node strokes (`--border-strong`/`--surface`): 4.8:1 / 3.9:1 (≥3:1 graphics) ✓
- Marker glyphs use `--hl-*` or `--text`, all ≥3:1 graphic / ≥4.5:1 text ✓
- Never place small text on a solid `--hl-*` fill (labels always `--text` on the 15–18% mix).

### 3.4 Reduced motion — inherited, nothing per-renderer
Token layer collapses `--duration-*` to 0.01ms under `prefers-reduced-motion`; renderers only set target classes/attrs. No `matchMedia`, no per-renderer branch. One rule: no *multi-phase* motion — every step is a single atomic redraw (the insert/delete opacity fade is single-phase, snaps correctly). ✓

---

## 4. Dev demo route — `src/pages/dev/renderers.astro`

Stacked visual-regression surface; reuses lesson chrome + the real `<Visualizer>`; dev-gated (`import.meta.env.PROD → rewrite('/404')`). Value: each sample renders through the *production* Visualizer path.

```
<BaseLayout title="Renderer gallery (dev)">
  <main>
    [Page header]  H1 --text-3xl "Renderer gallery" + muted "Dev-only. Not shipped."
    [Gallery]  vertical stack, row-gap --space-12
      └─ per renderer <section>:
          ├─ H2 --text-xl "{RendererName} ({rendererId})" + mono line: algorithm id + renderer id
          └─ <Visualizer algorithm="…" renderer="…" input="…" allowCustomInput={false} showMetrics={true} />
```
- One framed sample per renderer in build order (array, bars, linkedList, stack, queue, tree, heap, graph, callStack, chart); each `input` exercises ≥1 highlight. Stacked single column at every breakpoint (easier diffs); already responsive. No new components/tokens/CSS.
- A frontend engineer scanning top-to-bottom (light+dark, 360px+1280px) is the manual sign-off before QA's Playwright pass.

---

## Handoff notes to the Frontend Engineer
- **Blocking item resolved:** encode the §1 table in `core/highlight.ts` as-is — **no `tokens.css` change**. Add `is-compare/is-swap/is-visited/is-frontier/is-insert/is-delete/is-pointer` blocks to the Visualizer global sheet using the §2.2 recipe (existing `is-range/is-active/is-found` are the template).
- Pull all dimensions from §2.5 so the 9 renderers share one spacing rhythm; reuse ArrayRenderer's `PAD/GAP/TOP/CELL` names.
- Every `renderStatic` unit test must assert its renderer's **marker element is present** whenever a highlight is present (the §1 hardening condition made testable).
- **Do not self-approve:** QA runs the keyboard + axe pass on the dev gallery in both themes and confirms each renderer's `<desc>` mirrors `step.explanation` (m2 §3.5).
