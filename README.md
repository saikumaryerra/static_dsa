# LearnDSA

A static, no-backend site that teaches data structures and algorithms to beginners. Every lesson
pairs plain-language prose and three-language code with an **interactive visualization** you can
play, pause, step through one operation at a time, drive with your own input, and read as a table —
the whole run written out under the drawing, one row per step, which the prose can link straight
into. On a wide screen that instrument stays **pinned beside the prose** as you read, so a sentence
and the thing it describes are never on different screens.

Around it runs a quiet mastery loop — self-graded practice, three progress pips, spaced review,
input-crafting trials, your own one-sentence "why does this work?" note, and a count of days you
learned something — that never leaves your device.

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

| Command                                 | What it does                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                           | dev server on :4321                                                                                                                                        |
| `npm run build`                         | `astro check` (type gate) then a static build into `dist/`                                                                                                 |
| `npm run preview`                       | serves the built `dist/` on :4321                                                                                                                          |
| `npm run lint` / `npm run format:check` | ESLint / Prettier, both must be clean                                                                                                                      |
| `npm run format`                        | rewrite files with Prettier                                                                                                                                |
| `npm test`                              | Vitest unit suite (`environment: 'node'`, no DOM, no `localStorage`)                                                                                       |
| `npm run test:e2e`                      | Playwright + axe; locally it builds and previews first, so it needs :4321 free                                                                             |
| `npm run og`                            | regenerates the Open Graph card from the real renderer — run by hand, never in the build                                                                   |
| `npm run icons`                         | re-rasterizes `public/favicon-32.png` and `public/apple-touch-icon.png` from `public/favicon.svg` — run by hand after any edit to the mark                 |
| `npm run fonts`                         | re-cuts `public/fonts/*.woff2` to the characters `src/` actually contains, verifies every one renders, and rewrites `src/styles/font-charset.ts`           |
| `npm run audit:frames`                  | per instrument: how the drawing's viewBox varies across a full trace, and whether step 0 fits its own box — run by hand after any renderer geometry change |

**Definition of Done for any change** (spec §18): `npm run build`, `npm run lint`,
`npm run format:check`, `npm test` and `npm run test:e2e` all clean. CI (`.github/workflows/ci.yml`)
runs exactly those five as the `DoD gate`.

Note for the two regression baselines. `tests/e2e/baseline-aria.spec.ts` runs everywhere.
`tests/e2e/baseline-visual.spec.ts` is **seeded and armed on CI** — 14 PNGs are committed and the
DoD gate sets `VISUAL_BASELINE=1` inside the pinned `mcr.microsoft.com/playwright:v1.61.1-noble`
container. It stays CI-only for hinting and sub-pixel reasons, but the biggest source of drift is
gone: the site now self-hosts its two typefaces, so glyph shapes no longer follow whatever fontconfig
resolves on the machine. **Locally the flag is unset, so those 14 captures skip and a green local
e2e run still says nothing about pixels**; re-seed through the workflow job, in the same container.

The same seeding run works locally if Docker is available, which is worth knowing when a change
repaints the site and you would rather not round-trip through CI:

```bash
docker run --rm -v "$PWD:/w" -w /w -e CI=1 -e VISUAL_BASELINE=1 --ipc=host \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  bash -c 'npm run build && npx playwright test tests/e2e/baseline-visual.spec.ts --update-snapshots=all'
```

`--update-snapshots=all`, never the bare flag — the bare flag means `changed`, which rewrites only
the captures that FAIL and leaves any whose diff lands under `maxDiffPixelRatio` stale-but-passing.
**Afterwards, hand the container's leftovers back**: it runs as root, so `dist/`, `node_modules/.vite`,
`test-results/` and `playwright-report/` come back root-owned and the next local run cannot write
them —

```bash
docker run --rm -v "$PWD:/w" -w /w mcr.microsoft.com/playwright:v1.61.1-noble \
  bash -c 'rm -rf /w/dist /w/node_modules/.vite /w/test-results /w/playwright-report'
```

Expect the pixel gate to be coarse for text-level changes: `maxDiffPixelRatio: 0.002` on an
~8,600 px full-page screenshot tolerates ~30,000 px, so removing two 12px labels (569 px changed)
passed all 14 captures unchanged — the **aria** baseline is what catches that class of change.

## How it fits together

```
src/content/lessons/*.mdx   one file per lesson: frontmatter + prose + components
src/viz/                    the visualization pipeline (see below) + the id → module registry
src/components/, layouts/   Astro components; a few carry small client scripts ("islands")
src/lib/                    shared logic: progress/mastery store, challenges data, theme, glossary…
src/styles/tokens.css       the design tokens — the single source of truth for colour/type/space
public/fonts/               the two self-hosted IBM Plex subsets, generated by `npm run fonts`
tests/unit/, tests/e2e/     Vitest (pure functions) and Playwright (DOM, storage, a11y)
```

The visualization architecture is **trace-then-render** and is not negotiable: an instrumented
algorithm emits an ordered `Step[]` trace, a generic Player indexes into it, and a dumb per-structure
renderer draws SVG for whatever step it is handed. Stepping backwards is just decrementing an index.
Nothing hand-animates an algorithm with its own timers, and the gamification layer (predict mode,
trials, Final Run) _consumes_ the same precomputed trace rather than forking the pipeline. The
ledger under each drawing is a second _view_ of that same trace — one row per `Step`, value columns
read from `step.state` and the "what happened" cell taken verbatim from the authored explanation, so
the table and the drawing can never tell different stories. It is server-rendered, so with
JavaScript off it _is_ the lesson.

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
- **JS budget: ≤ 60 KB gzipped per lesson page, and no runtime network calls.** This is measured,
  not remembered: `tests/e2e/js-budget.spec.ts` gzips every script in each built page's static
  import closure, fails the run if a page is over, and prints the per-page table on every e2e run —
  read that for the current number rather than a figure copied into a doc. Renderer and algorithm
  chunks load lazily per lesson; everything is bundled at build time.
- **`localStorage` is the only persistence**, and only the keys enumerated in spec §6 are permitted
  (adding one is a spec change). Every access is `try/catch`-guarded, storage is never enumerated by
  prefix, and there is **no behavioral tracking** — only explicit clicks and self-reports are stored.
  Never infer progress from scroll depth or time on page. It is also **per-device with no sync**: a
  reader's progress lives in one browser profile and nothing ever leaves it.
- **WCAG 2.1 AA.** Real buttons and inputs, full keyboard operability, `aria-live="polite"` step
  explanations, never colour as the only signal, and `prefers-reduced-motion` respected. Motion
  durations come only from the `--duration-*` tokens (reduced motion collapses them in one place);
  sticky offsets come only from `--header-h`; the six `--hl-*` roles are reserved for the
  visualization, so chrome uses `--accent-warn`.
- **The chrome is achromatic on purpose.** `--brand` is byte-identical to `--text`, so the only
  colours on a lesson page are the `--hl-*` roles explaining the algorithm and `--accent-warn` on a
  warning callout. Distinctions that used to ride on the brand hue carry a second signal instead
  (underlines on prose links, fill **and** border on control hovers); `tests/unit/palette-states.test.ts`
  pins the ones the contrast matrix cannot see. Re-introducing a brand hue is a spec amendment.
- **The design decisions in the docs are decisions.** The left-aligned reading measure, the neutral
  difficulty chips and the achromatic chrome look like bugs and are not; changing one is a spec
  amendment with designer sign-off. Check the docs before "fixing" something that looks off.

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
axe) and is meant to be a required status check. The workflow deliberately does not deploy — the two
systems are independent, so without branch protection a red gate cannot stop a deploy. Response
headers (security + caching) ship as `public/_headers`, which Cloudflare and Netlify honour and
Vercel/GitHub Pages ignore. Details — the Node pin, how the production origin resolves, how to
regenerate the OG card, and a post-deploy checklist — are in `docs/deployment.md`.

## License

The site footer says "Free and open source", but **no `LICENSE` file has been committed yet** — so
the terms are formally unstated. Adding one is an owner decision, not a code change.
