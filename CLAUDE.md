# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LearnDSA — a static, no-backend Astro + TypeScript site teaching data structures & algorithms with interactive step-through visualizations. Currently pre-implementation: no source code exists yet.

**`docs/site-spec.md` is the authoritative spec.** Read the relevant sections before implementing anything. If a request conflicts with the spec, flag the conflict instead of guessing; if the spec is silent, choose the simplest option that satisfies the goals and leave a `// SPEC-GAP:` comment explaining the choice. Never invent scope.

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

## Build order

Follow the spec's §17 milestones (M1 scaffold → M6) strictly in order; each has acceptance criteria that must pass before starting the next. Prefer the vertical slice: one lesson (Binary Search) end-to-end before scaling to all lessons.

## Hard constraints (details in the spec)

- **Trace-then-render (§11) for every visualization** — an instrumented algorithm emits a `Step[]` trace; a generic Player indexes into it; dumb per-structure renderers draw SVG. Never hand-code timers/mutations per algorithm. Snapshots must be deep-copied; input caps enforced in `parseInput` (arrays ≤ 30, graph nodes ≤ 15).
- **No dependencies beyond §4** — no D3 or viz libraries, no component UI kits. Adding any dependency requires a `// SPEC-GAP:` justification.
- **JS budget ≤ 60 KB gzipped per lesson page**; no runtime network calls; all prose/code must work with JS disabled (the viz degrades gracefully).
- **WCAG 2.1 AA**: real buttons/inputs, fully keyboard-operable, `aria-live="polite"` step explanations, never color-only signals, respect `prefers-reduced-motion`.
- `localStorage` is the only client persistence (theme, mark-complete). No backend, ever.

## Stack & commands

TypeScript (`strict: true`), Astro (static output), Tailwind, MDX lessons, Vitest + Playwright, ESLint + Prettier, npm, Node ≥ 20.

Definition of Done for any change (spec §18), once M1 scaffolds the scripts: `npm run build`, `npm run lint`, `npm run format:check`, and `npm run test` all clean.

## Conventions

- Conventional Commits.
- JSDoc on public functions; inline "why" comments; no `console.log` or dead code in production.
- Renderer elements get stable ids (e.g. `i0`, `n5`) so highlights and CSS transitions can target them.
- `opencode.json` contains an API key and is gitignored — never commit it.


## git

STRICT INSTRUCTION: Do not add `co-athored by claude` in commit message 
