# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LearnDSA — a static, no-backend Astro + TypeScript site teaching data structures & algorithms with interactive step-through visualizations. **Every milestone in spec §17 has shipped (M1–M8)**: 15 lessons, 11 renderer modules / 12 registered renderer ids, glossary and SEO (M1–M6); the UX overhaul (M7.1 repair → M7.2 progress/player v2/wayfinding → M7.3 brand/print/forced-colors); and the M8 mastery loop (self-graded practice + pips + track rings, predict mode + spaced review, Trace Trials + Final Run). The two M8.3 items trimmed under budget pressure — Explain-it-back and the Learning Days line — **shipped afterwards** in `dab6108`, unchanged from their design; `docs/m8-gamification.md` records both as shipped, spec §7 carries the optional `explainPrompt` frontmatter field (11 of 15 lessons set it) and §6's `ld:days:v1` has a real writer in `src/lib/learning-days.ts`. Treat them as product, not as scope.

**`docs/site-spec.md` is the authoritative spec.** Read the relevant sections before implementing anything. If a request conflicts with the spec, flag the conflict instead of guessing; if the spec is silent, choose the simplest option that satisfies the goals and leave a `// SPEC-GAP:` comment explaining the choice. Never invent scope.

Milestone docs carry the detail the spec summarizes — read the one you're working in before
touching its area:

| Doc | Covers |
|---|---|
| `docs/m2-*`, `docs/m3-*`, `docs/m5-*`, `docs/m6-design.md` | shipped milestones: lesson layout, viz framework, glossary/about/SEO, DP lesson |
| `docs/design-tokens-m1.md` | the token system and its documented rationales (e.g. left-aligned measure, neutral chips) |
| `docs/deployment.md` | production deploy: Cloudflare Pages + GitHub Actions, Node pin, DoD gate |
| `docs/m7-ux-overhaul.md` | UX audit findings + the three-phase redesign **as shipped**, with per-fix file pointers and the deviations from plan |
| `docs/m8-gamification.md` | the mastery-loop design **as shipped**, its binding stance, data model, killed mechanics, and what was deferred |

## Workflow: sub-agent orchestration

Delegate work through the role agents defined in `Agents.md` — act as orchestrator, don't implement everything inline. Role → Claude Code agent mapping:

| Role (Agents.md) | Claude Code agent |
|---|---|
| Systems-Architect | `systems-architect` |
| UI_UX-Designer | `ui-ux-designer` |
| Lead-Developer | `lead-developer` |
| Frontend-Engineer | `frontend-engineer` |
| QA-engineer | `qa-engineer` |

Flow for non-trivial tasks: clarify scope → plan → design (architect/designer) → implement (frontend-engineer, coordinated by lead-developer) → validate (qa-engineer tests, lead-developer reviews). The implementer never self-approves; QA and review are never skipped.

### UI/UX and gamification work: design before code, verify before trusting

Both `docs/m7-ux-overhaul.md` and `docs/m8-gamification.md` were produced this way, and changes to
either area follow the same process:

1. **Audit against the running site, not the source alone.** Start the dev server and capture real
   screenshots (every key page × light/dark × desktop/mobile) plus a Playwright accessibility-tree
   snapshot. Half the highest-severity findings — a rail that silently can't stick, a blank OG
   card — are invisible in code review.
2. **Explore in parallel from different lenses**, then judge. For UX that meant seven dimensions
   (IA/flows, visual, components, visualizer, a11y, responsive, content); for gamification, three
   competing concepts (learning-science, game-design, minimalist) rather than one. Divergence
   first, selection second.
3. **Adversarially verify every finding against the code before acting on it.** In the audit this
   rejected 2 claims outright and corrected 24 — wrong line numbers, fixes that would break WCAG
   2.5.3, a prediction-grading rule that leaked the answer. An unverified finding is a hypothesis.
4. **Check for dark patterns and pedagogy, not just usability.** Motivation mechanics get an
   explicit ethics pass: it killed the XP system, the first-try bonus, and streaks here.
5. **Record what was rejected and why.** Both docs end with a "considered and rejected" list so
   settled questions stay settled.
6. **Encode calm/quality rules as tests.** Design intentions erode under maintenance, so the review
   strip's ≤2-card cap, the vocabulary ban, and the token contrast matrix are tests — pure halves in
   Vitest, DOM/storage halves in Playwright.

Two standing rules for this area: **never hand-mock the product** — hero art, legends, and demo
frames come from the real renderer's build-time `renderStatic()` output so they cannot drift; and
**check the design docs before "fixing" something that looks off** — the left-aligned measure and
the neutral difficulty chips are deliberate, documented decisions, so changing them is a spec
amendment with designer sign-off, not a bug fix.

## Where the build stands

Spec §17's milestone ladder is finished — it is history, not a plan. M7 and M8 shipped in five
commits after their design PR (`632f4b4` plans + spec amendments; `7367685` M7.1, `80373a4` M7.2,
`12d2486` M7.3, `2b6b821` M8.1, `4f34cff` M8.2+M8.3). New work is repair, extension or a spec
amendment; it still runs through the same design → implement → QA → review flow and the same DoD
(§18). Prefer the smallest shippable batch, and still prefer the vertical slice (one lesson
end-to-end) before scaling a change across all 15.

**Know what an area already guarantees before touching it:**

- **Progress & mastery** — `src/lib/progress.ts` is the one reader and the one deleter of every progress key; exactly one writer exists per key (`MarkComplete` → completion, `progress.ts` → `progress:v1:{slug}`, `Challenge`/`FinalRun` → the two `ld:*` keys through `src/lib/enrichment-store.ts`). Lesson lists are injected from the build; storage is never enumerated by prefix.
- **Visualization** — trace-then-render survived M8 intact: predict mode and trials consume the same precomputed `Step[]`. `predictStep` is optional per algorithm and ships for binary-search, bubble, insertion, BFS and DFS; quick-sort and selection-sort deliberately have none (they defer swaps — see `docs/m8-gamification.md`). Plan A added two **required** members to the contract (spec §11.2): every renderer module ships `measure(step): Extent` — geometry only, extracted from the viewBox its own `draw` already computes, because reading the box back out of `renderStatic` costs 247 ms at n = 30 against 0.44 ms — and its agreement with `draw` is a test, not a convention (`tests/unit/renderers/measure.test.ts`). The extent is **frozen per trace** and reaches the client through `setExtent`, never `mount` alone: `mount` runs once per island while `loadTrace` re-traces on every custom run and on "Restore example". `fitToExtent` clamps rather than shrinks, and each renderer declares one `ANCHOR` (bottom for `stack`/`callStack`, centre-x for `heap`). `npm run audit:frames` re-derives which renderers vary. The RSP-2 legibility floor was **measured and deliberately left alone** — a vertical twin is a rejected proposal, not a gap (spec §19.1, and the comment block at the CSS itself).
- **Tokens & chrome** — light elevation is *inverted* (`--bg` tinted `#F8FAFC`, `--surface` white, plus sunken/raised levels); the six `--hl-*` roles stay viz-only and chrome attention uses `--accent-warn`; every sticky offset and `scroll-margin-top` derives from `--header-h`; durations come only from `--duration-*` tokens. `src/styles/tokens.css` is the source of truth — `docs/design-tokens-m1.md`'s code block is the retired M1 snapshot, not something to paste.
- **JS-off** — every M8 component carries its own `<noscript>` kill-switch: with JS disabled no pip, ring, milestone, review card, trial or Final Run appears (`/learn`'s pip legend is hidden for the same reason). Newly server-rendered M7 content (prerequisites, "What's next", glossary aliases) *is* expected to appear.
- **The calm invariants are tests**, not conventions: review strip ≤2 cards and zero DOM when empty, the banned vocabulary, the Predict toggle's absence from storage, the token contrast matrix. Breaking one fails CI rather than review.

**Deliberately not built** (decisions, not gaps): semantic difficulty chips (design sign-off
withheld), per-track OG cards, the glossary search island, Astro prefetch, and — deleted by
measurement rather than taste — cost withholding and a vertical twin for the RSP-2 legibility floor.
Spec §19 (with §19.1 for the two measured deletions) and the milestone docs carry the reasoning;
re-proposing one is a spec amendment, not a fix.

**Budget note:** a size claim in a comment is a claim about the *build* — measure it (gzip every
chunk in a page's static import closure) or don't write it. A wrong one here hid a 1.3 KB gz chunk
riding onto `/` and `/learn` for two key strings; the fix and its measurement now live in
`src/lib/enrichment-store.ts` and at the top of `src/lib/progress.ts`.

## Hard constraints (details in the spec)

- **Trace-then-render (§11) for every visualization** — an instrumented algorithm emits a `Step[]` trace; a generic Player indexes into it; dumb per-structure renderers draw SVG. Never hand-code timers/mutations per algorithm. Snapshots must be deep-copied; input caps enforced in `parseInput` (arrays ≤ 30, graph nodes ≤ 15).
- **No dependencies beyond §4** — no D3 or viz libraries, no component UI kits. Adding any dependency requires a `// SPEC-GAP:` justification.
- **JS budget ≤ 60 KB gzipped per lesson page**; no runtime network calls; all prose/code must work with JS disabled (the viz degrades gracefully).
- **WCAG 2.1 AA**: real buttons/inputs, fully keyboard-operable, `aria-live="polite"` step explanations, never color-only signals, respect `prefers-reduced-motion`.
- `localStorage` is the only client persistence (no `sessionStorage`, no cookies), and the permitted keys are **enumerated in §6**, split into progress keys (cleared by the reset-progress control) and preference keys (deliberately not cleared). Adding a key is a spec change. Every access is `try/catch`-guarded. No backend, ever. **No behavioral tracking** — store only explicit user acts and self-reports; inferring completion from scroll depth or time-on-page is surveillance-shaped even when local, and it breaks the site's own "no tracking" promise.
- **Gamification (M8) never forks the viz pipeline** — predict mode and challenges consume the same precomputed trace. Mastery states are the only progress currency: no XP, points, levels, badges, or streaks (see the killed list in `docs/m8-gamification.md` before proposing one).

## Stack & commands

TypeScript (`strict: true`), Astro (static output), Tailwind, MDX lessons, Vitest + Playwright, ESLint + Prettier, npm, Node ≥ 22.12 (Astro 7's floor; `.nvmrc` and CI pin 24).

Test harness shape: Vitest runs `environment: 'node'` with no DOM library and no `localStorage`, so unit tests must be pure functions with injected inputs (see `resolveTheme` in `src/lib/theme.ts`); anything DOM- or storage-shaped belongs in Playwright. Adding jsdom/happy-dom is a new dependency and needs a `// SPEC-GAP:`.

Definition of Done for any change (spec §18): `npm run build`, `npm run lint`, `npm run format:check`, `npm run test`, and `npm run test:e2e` all clean. CI runs all five; M7/M8 acceptance leans on the e2e suite heavily (visual/aria baselines, focus-retention, axe scans, the DOM/storage halves of the calm invariants).

## Conventions

- Conventional Commits.
- JSDoc on public functions; inline "why" comments; no `console.log` or dead code in production.
- Renderer elements get stable ids (e.g. `i0`, `n5`) so highlights and CSS transitions can target them.
- `opencode.json` contains an API key and is gitignored — never commit it.
- `README.md` is the human entry point (this file is the agent one). If a change alters how the project is run, tested or constrained, update it in the same PR; docs that describe the plan instead of the product are a review failure.


## git

STRICT INSTRUCTION: Do not add `co-athored by claude` in commit message 
