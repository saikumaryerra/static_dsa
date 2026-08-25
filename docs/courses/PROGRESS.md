# Course expansion — PROGRESS

Single source of truth for state (SPEC §4). Update after every completed unit, then commit.

**Branch:** `feat/kubernetes-and-system-design-courses` (local only — do not push, do not open a PR)
**Started:** 2026-08-26 · **Baseline commit:** `9b44d75`

---

## Status per phase

| Phase | State |
|---|---|
| 0 — Recon and baseline | **in progress** |
| 1 — Vertical slice | not started |
| 2 — Curriculum, style guide, exemplars | not started |
| 3 — Content production | not started |
| 4 — Diagrams | not started |
| 5 — Integration polish | not started |
| 6 — Verification gate | not started |
| 7 — Final report | not started |

## Modules

None yet. Table appears when CURRICULUM.md exists; columns are
*lessons written / validated / reviewed / committed*.

## In progress

Phase 0. Written so far: `docs/courses/SPEC.md`, `RECON.md`, `DECISIONS.md` (D-01…D-10),
this file, and the three Appendix E worker definitions in `.claude/agents/`.
Nothing in `src/` has been touched.

## Next actions

1. Finish Phase 0: read the tests/tooling recon, re-run the 14 failing e2e specs on a quiet
   machine to separate load flakes from real baseline failures, commit Phase 0.
2. Phase 1 — schema (`course`, per-course `order`, optional `complexity`), `src/lib/courses.ts`,
   widened `tracks.ts`; then the rehype table/code pass with an **empirical** check of plugin
   ordering against Astro's Shiki pass; then `CourseIndex` + the three course pages; then the
   `/learn/` catalogue conversion.
3. Phase 1 — two exemplar lessons (one Kubernetes, one System Design), all five checks, commit.

## Verification

| Check | Command | Commit | Result |
|---|---|---|---|
| Build | `npm run build` | `9b44d75` | ✅ 21 pages, portablize clean |
| Lint | `npm run lint` | `9b44d75` | ✅ |
| Format | `npm run format:check` | `9b44d75` | ✅ |
| Unit | `npm run test` | `9b44d75` | ✅ 63 files / 1103 tests |
| E2E | `npm run test:e2e` | `9b44d75` | ⚠️ 444 passed, 14 failed under load — **all 14 re-run green single-worker** |
| Validator | not built yet | — | — |

## Known issues

**There are none in the baseline.** The first e2e run reported 14 failures, but it was executed
while four reconnaissance subagents were saturating a 4-core box, and `playwright.config.ts:28`
sets `retries: 0` locally with `fullyParallel: true`. Re-running exactly those eight spec files
with `--workers=1` on a quiet machine gave **117 passed, 0 failed** (2.4 min).

So the true baseline at `9b44d75` is **all five DoD commands green**, and any e2e failure from here
is mine until proven otherwise.

**Operating rule learned:** never run `npm run test:e2e` while subagents are running. The suite is
timing-sensitive; concurrent agents turn axe scans and chunk loads into false failures.

---

## §8 verification gate checklist

- [ ] The existing algorithm catalogue still works
- [ ] The Kubernetes course exists and is fully navigable
- [ ] Every Appendix A topic is taught (coverage.json ↔ validator)
- [ ] The System Design course exists with foundations, building blocks, three case studies and the comparison
- [ ] Every Appendix B topic is taught
- [ ] Both courses are visible in the catalogue with correct metadata
- [ ] Navigation and deep links work
- [ ] Progress and completion work
- [ ] Responsive layout verified at 375 / 768 / 1280
- [ ] Accessibility checked (axe + keyboard walk)
- [ ] Diagrams render (verified in a browser)
- [ ] No placeholders, feature TODOs, broken links, or new console/runtime errors
- [ ] Content validator passes
- [ ] `npm run test` passes
- [ ] `npm run test:e2e` passes (modulo the pre-existing list above)
- [ ] `astro check` / typecheck passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm run build` passes
- [ ] One-off external link check done
- [ ] Final content reviewed for quality and consistency
