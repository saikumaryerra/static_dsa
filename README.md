# LearnDSA

A static, no-backend site that teaches data structures and algorithms to beginners. Every lesson
pairs plain-language prose and three-language code with an **interactive visualization** you can
play, pause, step through one operation at a time, and drive with your own input — and a quiet
mastery loop (self-graded practice, three progress pips, spaced review, input-crafting trials) that
never leaves your device.

Built with Astro + TypeScript, prerendered to plain HTML/CSS with small islands of JS. No server, no
database, no accounts, no analytics, no tracking. 15 lessons across two tracks; **all planned
milestones (M1–M8) have shipped.**

## Quick start

Requires **Node ≥ 22.12** (`.nvmrc` pins 24, which is what CI uses) and npm.

```bash
npm ci          # lockfile-exact install
npm run dev     # http://localhost:4321
```

`npm run dev` is enough for prose, layout and visualization work. Nothing needs an API key, a
database or network access at runtime.

## Commands

| Command                                 | What it does                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run dev`                           | dev server on :4321                                                                      |
| `npm run build`                         | `astro check` (type gate) then a static build into `dist/`                               |
| `npm run preview`                       | serves the built `dist/` on :4321                                                        |
| `npm run lint` / `npm run format:check` | ESLint / Prettier, both must be clean                                                    |
| `npm run format`                        | rewrite files with Prettier                                                              |
| `npm test`                              | Vitest unit suite (`environment: 'node'`, no DOM, no `localStorage`)                     |
| `npm run test:e2e`                      | Playwright + axe; locally it builds and previews first, so it needs :4321 free           |
| `npm run og`                            | regenerates the Open Graph card from the real renderer — run by hand, never in the build |

**Definition of Done for any change** (spec §18): `npm run build`, `npm run lint`,
`npm run format:check`, `npm test` and `npm run test:e2e` all clean. CI (`.github/workflows/ci.yml`)
runs exactly those five as the `DoD gate`.

Note for the visual baselines: `tests/e2e/baseline-aria.spec.ts` runs everywhere, but
`tests/e2e/baseline-visual.spec.ts` is **unseeded and skips by default** — a green e2e run says
nothing about pixels until the baselines are seeded in CI. That file's header explains the two steps
to turn it on.

## How it fits together

```
src/content/lessons/*.mdx   one file per lesson: frontmatter + prose + components
src/viz/                    the visualization pipeline (see below) + the id → module registry
src/components/, layouts/   Astro components; a few carry small client scripts ("islands")
src/lib/                    shared logic: progress/mastery store, challenges data, theme, glossary…
src/styles/tokens.css       the design tokens — the single source of truth for colour/type/space
tests/unit/, tests/e2e/     Vitest (pure functions) and Playwright (DOM, storage, a11y)
```

The visualization architecture is **trace-then-render** and is not negotiable: an instrumented
algorithm emits an ordered `Step[]` trace, a generic Player indexes into it, and a dumb per-structure
renderer draws SVG for whatever step it is handed. Stepping backwards is just decrementing an index.
Nothing hand-animates an algorithm with its own timers, and the gamification layer (predict mode,
trials, Final Run) _consumes_ the same precomputed trace rather than forking the pipeline.

Adding an algorithm is one file in `src/viz/algorithms/` plus one line in `src/viz/registry.ts`.

## Constraints that are easy to break by accident

These are enforced by review and, in most cases, by tests — a change that violates one is a bug even
if it looks like an improvement.

- **It must work with JavaScript disabled.** All prose, code and navigation stay usable; the
  visualization degrades to its static still. Every gamification component ships its own
  `<noscript>` kill-switch, so with JS off no pip, ring, review card, trial or Final Run appears at
  all — a dead control is worse than no control.
- **No new dependencies.** No D3 or charting library, no component UI kit, no test-DOM shim. If one
  is genuinely unavoidable, it needs a `// SPEC-GAP:` justification and sign-off.
- **JS budget: ≤ 60 KB gzipped per lesson page, and no runtime network calls.** A lesson page today
  is roughly 15 KB gz eagerly plus ~5 KB of algorithm/renderer chunks it lazy-loads. Everything is
  bundled at build time.
- **`localStorage` is the only persistence**, and only the keys enumerated in spec §6 are permitted
  (adding one is a spec change). Every access is `try/catch`-guarded, storage is never enumerated by
  prefix, and there is **no behavioral tracking** — only explicit clicks and self-reports are stored.
  Never infer progress from scroll depth or time on page.
- **WCAG 2.1 AA.** Real buttons and inputs, full keyboard operability, `aria-live="polite"` step
  explanations, never colour as the only signal, and `prefers-reduced-motion` respected. Motion
  durations come only from the `--duration-*` tokens (reduced motion collapses them in one place);
  sticky offsets come only from `--header-h`; the six `--hl-*` roles are reserved for the
  visualization, so chrome uses `--accent-warn`.
- **The design decisions in the docs are decisions.** The left-aligned reading measure and the
  neutral difficulty chips look like bugs and are not; changing one is a spec amendment with
  designer sign-off. Check the docs before "fixing" something that looks off.

## Where the documentation lives

| Document                                                   | What it is                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `docs/site-spec.md`                                        | **the authoritative spec** — architecture, content model, keys, milestones, Definition of Done                    |
| `docs/m7-ux-overhaul.md`, `docs/m8-gamification.md`        | the UX overhaul and the mastery loop: design, what shipped, and the deviations/deferrals                          |
| `docs/design-tokens-m1.md`                                 | the token system and its rationales (its code blocks are a retired M1 snapshot — `src/styles/tokens.css` is live) |
| `docs/m2-*`, `docs/m3-*`, `docs/m5-*`, `docs/m6-design.md` | earlier milestones: lesson layout, viz framework, glossary/SEO, the DP lesson                                     |
| `docs/deployment.md`                                       | production deploy: Cloudflare Pages + GitHub Actions, Node pin, the DoD gate                                      |
| `CLAUDE.md`, `Agents.md`                                   | how AI coding agents are expected to work in this repo — read these before running one                            |

If a request conflicts with the spec, flag the conflict instead of guessing. If the spec is silent,
choose the simplest option that satisfies the goals and leave a `// SPEC-GAP:` comment explaining it.

## Contributing

- **Conventional Commits** for messages.
- **JSDoc on public functions**, and inline comments that explain _why_ a non-obvious piece of code
  exists. Comments must be true: a measurement in a comment is a claim, so measure it.
- No `console.log` and no dead code in shipped source.
- Tests are where design intent is preserved — the calm-behaviour rules, the token contrast matrix
  and the review-strip caps are all assertions, not conventions. Add to them rather than around them.

## Deployment

Cloudflare Pages is connected to the repository and runs its own `npm run build` on every push to
`main`; the GitHub Actions workflow runs the checks Cloudflare does not (lint, format, unit, e2e +
axe) and is meant to be a required status check. The workflow deliberately does not deploy. Details,
including the Node pin and the production origin, are in `docs/deployment.md`.

## License

The site footer says "Free and open source", but **no `LICENSE` file has been committed yet** — so
the terms are formally unstated. Adding one is an owner decision, not a code change.
