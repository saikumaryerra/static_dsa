# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LearnDSA — a static, no-backend Astro + TypeScript site teaching data structures & algorithms with interactive step-through visualizations. M1–M6 are built and shipped (15 lessons, 11 renderer modules / 12 registered renderer ids, glossary, SEO). M7 (UX overhaul) and M8 (gamification) are designed and planned but **not implemented**.

**`docs/site-spec.md` is the authoritative spec.** Read the relevant sections before implementing anything. If a request conflicts with the spec, flag the conflict instead of guessing; if the spec is silent, choose the simplest option that satisfies the goals and leave a `// SPEC-GAP:` comment explaining the choice. Never invent scope.

Milestone docs carry the detail the spec summarizes — read the one you're working in before
touching its area:

| Doc | Covers |
|---|---|
| `docs/m2-*`, `docs/m3-*`, `docs/m5-*`, `docs/m6-design.md` | shipped milestones: lesson layout, viz framework, glossary/about/SEO, DP lesson |
| `docs/design-tokens-m1.md` | the token system and its documented rationales (e.g. left-aligned measure, neutral chips) |
| `docs/deployment.md` | production deploy: Cloudflare Pages + GitHub Actions, Node pin, DoD gate |
| `docs/m7-ux-overhaul.md` | UX audit findings + the three-phase redesign plan, with per-fix file pointers |
| `docs/m8-gamification.md` | the mastery-loop design, its binding stance, data model, and killed mechanics |

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

## Build order

Follow the spec's §17 milestones strictly in order; each has acceptance criteria that must pass before starting the next. Prefer the vertical slice: one lesson (Binary Search) end-to-end before scaling to all lessons.

M1–M6 are done. Next: **M7.1 → M7.2 → M7.3** (UX overhaul), then **M8.1 → M8.2 → M8.3**
(gamification). M8 depends on M7.2's progress system and reset control — don't start it earlier.
Within a phase, prefer the smallest shippable batch that passes the DoD. M7.1 is pure repair with
no spec changes and is the right first PR; the sticky-rail fix (RSP-1) is a one-line change with
outsized impact.

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


## git

STRICT INSTRUCTION: Do not add `co-athored by claude` in commit message 
