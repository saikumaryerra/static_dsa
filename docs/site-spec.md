# Design & Build Spec — "LearnDSA" Static Teaching Site

**Version:** 1.0
**Status:** Ready to build
**Audience of this document:** An LLM coding agent (and the humans reviewing its output)

---

## 0. How to use this document (read first)

You are an LLM agent building this project. Follow these rules:

1. **Build in the order given in §17 (Build Order).** Do not jump ahead. Each milestone has explicit acceptance criteria — satisfy them before moving on.
2. **Prefer the vertical slice.** Get one lesson working end-to-end (content → layout → one live visualization) before scaling to all lessons.
3. **When a detail is unspecified, choose the simplest option that satisfies the stated goals, and leave a `// SPEC-GAP:` comment** explaining the choice so a human can review it. Do not invent scope.
4. **Do not add dependencies** beyond those listed in §4 without leaving a `// SPEC-GAP:` note and a one-line justification.
5. **Every algorithm visualization must follow the trace-then-render architecture in §11.** Do not hand-animate individual algorithms with bespoke timers.
6. **All output must pass the checks in §18 (Definition of Done).**

---

## 1. Overview

LearnDSA is a **static, no-backend website** that teaches **basic data structures and algorithms** to beginners (students, self-taught developers, interview-preppers). Each topic is a lesson combining prose explanation, complexity analysis, code samples in multiple languages, and an **interactive animated visualization** the learner can play, pause, step through, and drive with their own input.

The whole site is prerendered to static HTML/CSS/JS and deployable to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages). There is no server, no database, no auth, no analytics backend of our own.

---

## 2. Goals and Non-Goals

### Goals
- Teach ~15 core DSA topics clearly, each with an interactive visualization.
- Make abstract operations (a swap, a pointer reassignment, a recursive call) *visible* and *steppable*.
- Load fast (static, minimal JS), work offline-friendly, be fully keyboard- and screen-reader-accessible.
- Be easy for a non-engineer to author/extend a lesson by editing one Markdown/MDX file.
- Look clean, modern, and trustworthy — not a wall of default-styled text.

### Non-Goals (out of scope for v1)
- User accounts, progress saving to a server, quizzes with grading, comments.
- A code execution sandbox / online IDE. (Code samples are read-only, syntax-highlighted.)
- Advanced topics (segment trees, red-black trees, advanced DP, network flow, string algorithms beyond basics).
- Mobile app, i18n/multi-language content (design so it *could* be added later, don't build it).
- Any tracking that requires cookies/consent banners.

---

## 3. Target audience & UX principles

- **Primary user:** a beginner who knows one programming language a little and is meeting these concepts for the first time.
- **Reading level:** plain, concrete, example-first. Define jargon on first use.
- **UX principles:**
  - *Show, then tell.* The visualization is the centerpiece of each lesson, not an afterthought at the bottom.
  - *Let them drive.* Users can input their own array / value and watch the algorithm run on it.
  - *No dead ends.* Every lesson links to prerequisites and next steps.
  - *Progressive disclosure.* Complexity tables, proofs, and edge cases are collapsible.

---

## 4. Tech stack & constraints

> This section is intentionally the one place stack decisions live. If a human wants a different stack, they change only this section and §16.

- **Framework:** [Astro](https://astro.build) (latest stable). Static output (`output: 'static'`). Chosen because it prerenders content pages to zero-JS HTML by default and lets us ship interactivity only where needed via "islands."
- **Language:** TypeScript everywhere. `strict: true`.
- **Content format:** MDX (Markdown + components) for lessons.
- **Styling:** Tailwind CSS + a small set of design tokens (§13). No component UI kit (no MUI/Chakra) — keep the bundle tiny and the look bespoke.
- **Interactive islands:** Plain TypeScript + the DOM, drawing with **SVG** (preferred for structure diagrams: arrays, lists, trees, graphs) and/or **Canvas** (only if an animation has >~300 elements). **No D3, no viz libraries.** We roll our own tiny renderers per §11.
- **Syntax highlighting:** Shiki (build-time, ships no runtime JS).
- **Math (if needed for Big-O):** KaTeX, prerendered.
- **Testing:** Vitest (unit, esp. algorithm traces) + Playwright (a few smoke/e2e + a11y checks).
- **Lint/format:** ESLint + Prettier.
- **Package manager:** npm.
- **Node:** LTS (>= 20).

**Hard constraints:**
- Total JS shipped to any single lesson page ≤ **60 KB gzipped** (excluding the one visualization island's logic, which should still be small).
- No runtime network calls. Everything is bundled at build time.
- Site must fully function with **JavaScript disabled** for all prose/code content; only the interactive visualization degrades to a static image or a "enable JS to interact" message.

---

## 5. Curriculum / content scope

Ship these lessons in v1, grouped into two tracks. Each lesson gets its own page and at least one visualization unless noted.

**Track A — Foundations & Data Structures**
1. **Complexity & Big-O** — growth-rate intuition; O(1)/O(log n)/O(n)/O(n log n)/O(n²). *Viz: interactive growth-rate chart comparing functions as n grows.*
2. **Arrays** — indexing, insert/delete cost, in-place ops. *Viz: array cells with index labels; animate insert/delete/access.*
3. **Linked Lists** — singly & doubly; pointer reassignment. *Viz: nodes + arrows; animate insert/delete/traverse showing pointer changes.*
4. **Stacks** — LIFO, push/pop, uses. *Viz: vertical stack; push/pop.*
5. **Queues** — FIFO + circular buffer. *Viz: queue; enqueue/dequeue, wrap-around for circular.*
6. **Hash Tables** — hashing, buckets, collisions (chaining). *Viz: buckets; insert keys, show collision → chain.*
7. **Trees & BSTs** — terminology; BST insert/search/delete. *Viz: tree layout; animate insert/search path.*
8. **Heaps** — binary heap, sift-up/down, as array. *Viz: tree + backing array side by side; heapify.*
9. **Graphs** — representations (adjacency list/matrix), directed/weighted. *Viz: node-link graph; toggle representation.*

**Track B — Algorithms**
10. **Recursion** — base/recursive case, the call stack. *Viz: call-stack frames growing/unwinding (use factorial & Fibonacci).*
11. **Linear & Binary Search** — sorted precondition, halving. *Viz: array with lo/mid/hi markers.*
12. **Sorting I** — Bubble, Selection, Insertion. *Viz: bar heights; compare/swap highlights.*
13. **Sorting II** — Merge sort, Quick sort. *Viz: recursion/partition regions highlighted.*
14. **Graph Traversal** — BFS & DFS. *Viz: graph with frontier/visited coloring + queue/stack side panel.*
15. **(Stretch) Intro to Dynamic Programming** — memoization vs tabulation via Fibonacci/climbing stairs. *Viz: DP table filling in.*

> Lessons 1–14 are required for v1. Lesson 15 is stretch; scaffold it but it may ship "coming soon" if time-boxed.

---

## 6. Information architecture (site map)

```
/                       Home / landing (value prop + track overview + CTA)
/learn                  Curriculum index (all lessons grouped by track, with progress-ish checkmarks stored locally)
/learn/[slug]           A single lesson (e.g. /learn/binary-search)
/glossary               A-Z terms, each linking to the lesson that introduces it
/about                  What this is, who it's for, how visualizations work
/404                    Friendly not-found
```

- **Global nav:** logo → Home; "Learn"; "Glossary"; "About"; a light/dark theme toggle.
- **In-lesson nav:** breadcrumb (Learn / Track / Lesson), prev/next lesson, and an on-page table of contents (sticky on desktop).
- **Local "completed" state:** a lesson can be marked done; store in `localStorage` only (no server). Show a subtle checkmark in the index. This is the *only* client persistence.

---

## 7. Content authoring model

A lesson is **one `.mdx` file** in `src/content/lessons/`. Authors write prose; structured metadata lives in frontmatter; visualizations are dropped in as MDX components.

Use Astro **Content Collections** with a typed schema. Frontmatter contract:

```yaml
---
title: "Binary Search"
slug: "binary-search"            # URL segment; unique
track: "algorithms"              # "foundations" | "algorithms"
order: 11                        # sort order within the site
summary: "Find an element in a sorted array by repeatedly halving the search range."
difficulty: "beginner"           # beginner | intermediate
prerequisites: ["arrays", "complexity-big-o"]   # slugs
estimatedMinutes: 8
complexity:                       # rendered into a standard table
  time: { best: "O(1)", average: "O(log n)", worst: "O(log n)" }
  space: { worst: "O(1)" }
tags: ["searching", "divide-and-conquer"]
published: true
---
```

Lesson body sections (authors follow this order; enforce with a lint/checklist, not hard code):
1. **Intuition** — plain-language "what & why," a real-world analogy.
2. **How it works** — step-by-step, referencing the visualization.
3. **`<Visualizer />`** — the interactive island (see §11 for the component API).
4. **Complexity** — auto-rendered from frontmatter + a sentence of explanation.
5. **Code** — `<CodeTabs>` with the same algorithm in **Python, JavaScript, and Java** (pick these three; each tab is a fenced code block).
6. **Common pitfalls / edge cases** — collapsible.
7. **Practice / check yourself** — 2–3 conceptual questions (no grading; answers in `<details>`).

---

## 8. Page layouts & templates

Implement these as Astro layouts/pages. Keep them composable.

- **`BaseLayout`** — `<head>` (meta, OG tags, theme init inline script to avoid FOUC), skip-to-content link, global header, footer, theme toggle.
- **`LessonLayout`** — wraps MDX content; adds breadcrumb, sticky ToC (generated from headings), prev/next, complexity table slot, "mark complete" control, reading-time.
- **Home page** — hero (one-line value prop + subhead), 2–3 feature blurbs (interactive / beginner-friendly / free), track cards linking to `/learn`, footer.
- **Curriculum index** — two columns/sections (Foundations, Algorithms); each lesson as a card: number, title, one-line summary, difficulty chip, estimated minutes, done-checkmark.
- **Glossary** — alphabetical; jump-to-letter bar; each entry: term, 1–2 sentence definition, "introduced in →" link.

---

## 9. Component inventory

Build these reusable components (Astro components unless they need interactivity, in which case a TS island). Each should be small and documented with a top-of-file comment describing props.

| Component | Type | Purpose |
|---|---|---|
| `SiteHeader` / `SiteFooter` | static | global chrome |
| `ThemeToggle` | island | light/dark, respects `prefers-color-scheme`, persists to `localStorage` |
| `TableOfContents` | static (from headings) | in-lesson nav |
| `Breadcrumb` | static | context nav |
| `PrevNext` | static | lesson pagination |
| `LessonCard` | static | curriculum index item |
| `DifficultyChip` | static | label |
| `ComplexityTable` | static | renders frontmatter `complexity` |
| `CodeTabs` | island (minimal) | tabbed multi-language code, Shiki-highlighted, copy button |
| `Callout` | static | note / warning / tip boxes |
| `Collapsible` | static | wraps native `<details>` with styling |
| `MarkComplete` | island | localStorage checkmark |
| `Visualizer` | island | **the interactive DSA visualization — see §11** |

---

## 10. What "an interactive visualization" must let the user do

Every `<Visualizer />` on every lesson must support this common control set (see the shared player in §11):

- **Play / Pause** the animation.
- **Step forward** and **step backward** one operation at a time.
- **Reset** to the initial state.
- **Speed** control (e.g. 0.5×–3×).
- **Scrub** via a progress slider (jump to any step).
- **Custom input** where it makes sense: e.g. type an array `[5,2,9,1]`, a target value, a tree insertion sequence, a graph edge list. Validate input and show friendly errors.
- **A synced explanation line** that describes the current step in words (e.g. "Comparing index 2 (9) with index 3 (1) → swap").

Accessibility for the visualization:
- All controls are real buttons/inputs, keyboard-operable, with `aria-label`s.
- The current-step explanation is exposed to screen readers via an `aria-live="polite"` region.
- Color is never the *only* signal (pair color highlights with labels/patterns/icons).

---

## 11. Visualization architecture (the core engineering spec) — **trace-then-render**

**Do not hand-code timers and mutations per algorithm.** Use this three-layer pattern for *all* visualizations. It makes stepping backward trivial, keeps algorithm logic pure and unit-testable, and separates "what happened" from "how to draw it."

### 11.1 Layers

1. **Instrumented algorithm → produces a Trace.**
   A pure function that runs the algorithm and, instead of (or in addition to) returning a result, **emits an ordered list of `Step`s** describing every meaningful state change. No DOM, no timers, no drawing. Fully unit-testable.

2. **Player → consumes the Trace.**
   A generic, algorithm-agnostic controller holding `currentStepIndex`. Play/pause/step/scrub just move the index. It asks the Renderer to draw the state at the current index. Because the full trace is precomputed, backward stepping = decrement index and redraw.

3. **Renderer → draws a state.**
   One renderer per data-structure family (`ArrayRenderer`, `LinkedListRenderer`, `TreeRenderer`, `GraphRenderer`, `StackRenderer`, `CallStackRenderer`, `ChartRenderer`). Given a **state snapshot + the current step's highlights**, it renders SVG. Renderers are dumb: they draw what they're told, they don't run algorithms.

```
Instrumented Algorithm ──emits──▶ Trace (Step[]) ──▶ Player ──drives──▶ Renderer ──▶ SVG
                                                        ▲
                                              user controls (play/step/scrub/speed)
```

### 11.2 Types (implement in `src/viz/core/`)

```ts
// A single animation step. `state` is a snapshot; `highlights`/`annotations`
// tell the renderer what to emphasize AT this step. Keep snapshots small.
export interface Step<TState = unknown> {
  state: TState;                 // full snapshot of the structure at this point
  highlights?: Highlight[];      // e.g. {kind:'compare', ids:['i2','i3']}
  explanation: string;           // human-readable, one line (also used for aria-live)
  metrics?: Record<string, number>; // e.g. { comparisons: 4, swaps: 1 }
}

export interface Highlight {
  kind: 'compare' | 'swap' | 'active' | 'visited' | 'frontier'
      | 'found' | 'insert' | 'delete' | 'pointer' | 'range';
  ids: string[];                 // element ids the renderer knows how to locate
  meta?: Record<string, unknown>;
}

export type Trace<TState = unknown> = Step<TState>[];

// Every instrumented algorithm implements this shape.
export interface Algorithm<TInput, TState> {
  id: string;                    // e.g. 'binary-search'
  run(input: TInput): Trace<TState>;
  defaultInput(): TInput;        // sensible starting input for the lesson
  parseInput(raw: string): TInput | { error: string }; // for the custom-input box
}

// Renderer contract (one per structure family).
export interface Renderer<TState> {
  mount(container: HTMLElement): void;
  render(step: Step<TState>): void;   // idempotent: draw exactly this step
  destroy(): void;
}
```

### 11.3 The `Visualizer` island (public API used in MDX)

```mdx
<Visualizer
  algorithm="binary-search"      // maps to a registered Algorithm
  renderer="array"               // maps to a registered Renderer
  input="[1,3,5,7,9,11] target=7" // optional initial input; else algorithm.defaultInput()
  allowCustomInput={true}
  showMetrics={true}
/>
```

- The island looks up the `Algorithm` and `Renderer` from a **registry** (`src/viz/registry.ts`) by string id.
- On mount: run the algorithm → get the trace → hand to the `Player` → render step 0.
- On custom input: `parseInput` → if valid, recompute trace and reset player; if invalid, show inline error, keep previous trace.

### 11.4 Rules for instrumented algorithms
- Keep the *real* algorithm logic recognizable — a reader comparing the code sample to the instrumented version should see the same structure. Emit a `Step` at each compare/swap/visit/pointer-move.
- Snapshots must be **deep-copied** (or built immutably) so later mutations don't corrupt earlier steps.
- Cap input sizes for sanity (e.g. array length ≤ 30, graph nodes ≤ 15) and enforce in `parseInput`.
- Unit test each algorithm's trace: assert the final state is correct AND that key steps appear (e.g. binary search on a present target ends with a `found` highlight; on an absent target ends with an empty range and a "not found" explanation).

### 11.5 Renderer guidance
- SVG, `viewBox`-based, responsive; no fixed pixel widths.
- Give every element a stable `id` (e.g. array index `i0`, node `n5`) so highlights can target it and CSS transitions animate position/color changes smoothly.
- Use CSS transitions for movement/color; the renderer just sets the target state and lets CSS tween. Respect `prefers-reduced-motion` (snap instead of animate).
- Renderers must be pure w.r.t. input: same `Step` in → same SVG out.

---

## 12. Accessibility (WCAG 2.1 AA — required, not optional)

- Semantic landmarks (`header`, `nav`, `main`, `footer`), one `<h1>` per page, logical heading order.
- Skip-to-content link; visible focus styles; full keyboard operability (including all Visualizer controls).
- Color contrast ≥ 4.5:1 for text, ≥ 3:1 for UI/graphics; never rely on color alone (§10).
- `aria-live="polite"` for the step-explanation region; `aria-label`s on icon buttons; `alt` text / `<title>`/`<desc>` on SVG diagrams describing the current state.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Playwright + axe check on home, one lesson, glossary, and 404 — zero critical violations.

---

## 13. Design system (tokens)

Define as CSS custom properties + Tailwind theme extension. Support light & dark.

- **Type:** system UI stack or one self-hosted variable font (e.g. Inter) for UI; a monospace (e.g. JetBrains Mono) for code. Fluid type scale.
- **Color roles (not raw values — define both light/dark):** `--bg`, `--surface`, `--text`, `--text-muted`, `--border`, `--brand`, `--brand-contrast`, plus **highlight semantics** used by renderers: `--hl-compare`, `--hl-swap`, `--hl-active`, `--hl-visited`, `--hl-frontier`, `--hl-found`. Keep the palette calm; reserve saturated color for highlights so the *algorithm state* pops.
- **Spacing:** 4px base scale. **Radius:** consistent (e.g. 8px cards, 6px controls). **Shadow:** subtle, one or two levels.
- **Motion:** 150–300ms ease for UI; algorithm animations tied to the speed control. All motion gated on `prefers-reduced-motion`.
- **Look & feel goal:** clean, editorial, confident — think a well-designed docs site, not a dashboard. Generous whitespace, strong typographic hierarchy, the visualization visually framed as the hero of each lesson.

> If a `frontend-design` guideline file is available in the repo, follow it for token values; otherwise choose tasteful defaults and record them in `src/styles/tokens.css`.

---

## 14. Performance & SEO

- Prerender everything; ship JS only for islands. Meet the JS budget in §4.
- Lighthouse targets (mobile): Performance ≥ 95, Accessibility ≥ 100, Best-Practices ≥ 95, SEO ≥ 95.
- Per-page `<title>` + meta description (from frontmatter `summary`); Open Graph + Twitter card tags; canonical URLs.
- Generate `sitemap.xml` and `robots.txt`. JSON-LD `Course`/`LearningResource` structured data on lesson pages (nice-to-have).
- Self-host fonts; preload the primary font; no layout shift (set dimensions on SVG/media).

---

## 15. Content & code quality bar
- Prose: short paragraphs, concrete examples, define terms on first use, no unexplained jargon.
- Every code sample must be **correct and runnable in isolation** and match the algorithm the visualization shows.
- Complexity claims in frontmatter must match the code and the prose.
- No lorem ipsum in shipped lessons. Placeholder lessons must be clearly marked `published: false`.

---

## 16. Directory structure (target)

```
learndsa/
├─ astro.config.mjs
├─ tailwind.config.ts
├─ tsconfig.json
├─ package.json
├─ src/
│  ├─ content/
│  │  ├─ config.ts                # content-collection schema (§7)
│  │  └─ lessons/*.mdx
│  ├─ layouts/
│  │  ├─ BaseLayout.astro
│  │  └─ LessonLayout.astro
│  ├─ pages/
│  │  ├─ index.astro
│  │  ├─ learn/index.astro
│  │  ├─ learn/[slug].astro       # renders a lesson from the collection
│  │  ├─ glossary.astro
│  │  ├─ about.astro
│  │  └─ 404.astro
│  ├─ components/                 # §9 inventory
│  ├─ viz/
│  │  ├─ core/                    # Step/Trace/Player/registry types (§11.2)
│  │  ├─ algorithms/              # one instrumented algorithm per file
│  │  ├─ renderers/               # ArrayRenderer, TreeRenderer, ... (§11.5)
│  │  ├─ Visualizer.astro         # the island wrapper
│  │  └─ registry.ts              # id → {algorithm, renderer}
│  ├─ styles/
│  │  ├─ tokens.css               # design tokens (§13)
│  │  └─ global.css
│  └─ lib/                        # small utils (localStorage, toc, reading-time)
├─ public/                        # static assets, fonts, og images
└─ tests/
   ├─ unit/                       # vitest: algorithm traces, utils
   └─ e2e/                        # playwright: smoke + axe a11y
```

---

## 17. Build order (milestones with acceptance criteria)

Work top to bottom. Do not start a milestone until the previous one's criteria pass.

**M1 — Scaffold & tokens.**
Astro + TS + Tailwind + MDX configured. `BaseLayout`, header/footer, theme toggle, tokens, global styles.
*Accept:* `npm run build` succeeds; home page renders with working light/dark toggle and no console errors; Lighthouse a11y ≥ 100 on home.

**M2 — Content model & one lesson end-to-end (vertical slice).**
Content collection + schema; `LessonLayout` (ToC, breadcrumb, prev/next, complexity table, code tabs, mark-complete). Author **one full lesson: Binary Search**, including a working `<Visualizer>` via the §11 pipeline with `ArrayRenderer`.
*Accept:* `/learn/binary-search` renders all seven lesson sections; the visualizer supports play/pause/step±/reset/speed/scrub/custom input; custom input `[1,3,5,7]` target `5` produces a correct trace ending in `found`; unit test for the binary-search trace passes; page works with JS off (viz shows a static fallback).

**M3 — Visualization framework hardening + remaining renderers.**
Generalize `Player` and the registry. Implement `Array`, `LinkedList`, `Stack`, `Queue`, `Tree`, `Heap`, `Graph`, `CallStack`, `Chart` renderers as needed by §5.
*Accept:* each renderer has a minimal demo/test; `prefers-reduced-motion` respected; adding a new algorithm requires only (a) one instrumented algorithm file and (b) a registry entry.

**M4 — Author all required lessons (1–14).**
Fill in every lesson per §7 with correct prose, 3-language code, complexity, and a working visualization.
*Accept:* curriculum index lists all lessons; every lesson page passes §18 DoD; no `published:false` among 1–14.

**M5 — Glossary, About, Home polish, SEO.**
Glossary auto-linked to lessons; About explains the project; home hero polished; sitemap/robots/OG images/meta done.
*Accept:* Lighthouse targets in §14 met on home + a lesson + glossary; axe zero critical violations on the four tested pages.

**M6 — (Stretch) Lesson 15 (Intro DP)** if time remains; otherwise ship as `published:false` with a "coming soon" card.

---

## 18. Definition of Done (every PR / final delivery)

- [ ] `npm run build` passes with no errors or warnings.
- [ ] `npm run lint` and `npm run format:check` clean.
- [ ] `npm run test` (Vitest) green, incl. a trace test for each shipped algorithm.
- [ ] Playwright smoke + axe checks pass (no critical a11y violations).
- [ ] Each shipped lesson has: all 7 sections, a working stepper visualization with custom input, correct 3-language code, correct complexity table.
- [ ] Keyboard-only walkthrough of one lesson works, including all viz controls.
- [ ] JS-disabled: all prose/code readable; viz degrades gracefully.
- [ ] Meets JS budget (§4) and Lighthouse targets (§14).
- [ ] No `console.log`, no dead code, no unexplained `SPEC-GAP` left unreviewed.

---

## 19. Open questions (flag with `SPEC-GAP`, don't block on them)
- Final font + exact brand color: pick tasteful defaults; easy to swap in tokens.
- Do we want a lightweight "was this helpful?" thumbs (no backend, localStorage only)? Default: skip for v1.
- Exact three code languages: spec says Python / JavaScript / Java — confirm before M4 if there's a preference.

---

*End of spec. Build M1 → M6 in order. When unsure, ship the simplest correct thing and leave a `SPEC-GAP` note.*
