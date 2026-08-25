# Course expansion — PROGRESS

Single source of truth for state (SPEC §4). Update after every completed unit, then commit.

**Branch:** `feat/kubernetes-and-system-design-courses` (local only — do not push, do not open a PR)
**Started:** 2026-08-26 · **Baseline commit:** `9b44d75`

---

## Status per phase

| Phase | State |
|---|---|
| 0 — Recon and baseline | **done** (`b1c347c`) |
| 1 — Vertical slice | **done** |
| 2 — Curriculum, style guide, exemplars | **done** |
| 3 — Content production | **next** — 2 of 112 lessons written |
| 4 — Diagrams | not started |
| 5 — Integration polish | not started |
| 6 — Verification gate | not started |
| 7 — Final report | not started |

## Modules

Full plan in `CURRICULUM.md` (23 modules, 112 lessons). `ok` = written, validated,
reviewed and committed.

| Course | Module | Lessons | Written | State |
|---|---|---|---|---|
| Kubernetes | 01 `k8s-foundations` | 5 | 1 | `k8s-what-kubernetes-is` is `ok` (exemplar) |
| Kubernetes | 02–14 | 62 | 0 | — |
| System Design | 01 `sd-foundations` | 4 | 1 | `sd-design-workflow` is `ok` (exemplar) |
| System Design | 02–09 | 41 | 0 | — |

## In progress

Nothing half-written. Every file on the branch is finished and committed or is
listed under "Next actions" as not started.

## Next actions

1. **Phase 3 pilot.** Author `k8s-foundations` lessons 2–5 with one `lesson-author`
   worker, review with `content-reviewer`, validate, commit. This is the one-module
   pilot SPEC §10 rule 5 requires before any fan-out.
2. **Phase 3 batch 1.** Fan out to at most 8 modules per batch (one worker per
   module), drawing from both courses. Validate → review → update CURRICULUM.md,
   coverage stays as-is (it already names every planned lesson) → commit per batch.
3. **Phase 4.** The remaining 10 Appendix C diagrams, one subagent per diagram,
   once their lessons exist. `K8sArchitecture` is the exemplar.

## Verification

At commit `6a50deb`, on a quiet machine:

| Check | Command | Result |
|---|---|---|
| Build | `npm run build` | ✅ 26 pages, portablize clean |
| Lint | `npm run lint` | ✅ |
| Format | `npm run format:check` | ✅ |
| Unit | `npm run test` | ✅ 65 files / 1117 tests |
| Validator | `npm run validate:content` | ✅ 17 lessons clean, 3 warnings, 187 coverage topics pending |
| Fonts | `npm run fonts` | ✅ regenerates identically — 352 chars, 77,704 bytes, no new glyph from the two exemplars |
| Visual baselines | re-seeded in `playwright:v1.61.1-noble`, then compared | ✅ 15 passed, 0 flaky |
| E2E | `npm run test:e2e` | ⏳ run 3 pending; run 2 was 449 passed / 9 failed, all nine since fixed or classified |

### The e2e failure ledger (runs 1 and 2)

Run 1 found 17 failures, run 2 found 9. Every one is now fixed or classified:

**Fixed — mine.** Five aria baselines (re-seeded, diffs read); the home tab-path's
hardcoded lesson count; `/learn` assertions that had to follow the cards to the
course page across eight specs; the sitemap route set; the last-lesson card and
the track-crossing walk, now per course; the predict suite's "every lesson ships a
visualization", now scoped to the course where that is true; a reset assertion
that navigated and so re-ran `seedStorage`'s init script; the portable walk, which
grew a hop and needed to settle before judging what failed to load.

**Fixed — structural, would have got worse.** Three specs walk every lesson with a
browser navigation each. At 17 lessons they began timing out on the 30 s default;
at 127 they would always. The one whose claim genuinely covers every lesson got
the budget it needs; the two about Trace Trials and `<StepLink>` are scoped to the
`dsa` course, which is safe *because* the validator now rejects a viz-coupled
component in a prose lesson. The axe scans on the heaviest lesson pages take
4–13 s quiet and had no headroom either; their budget is raised.

**Classified — load flakes, not regressions.** `m4-lessons` axe on
`sorting-basics` and `m8-explain-note`'s delete test, both timeouts, both green on
a quiet machine, and `m7-print-hcm`'s Practice-answer reveal, which the test's own
comment already documents as a race. **Never run the e2e suite while subagents or
other heavy processes are running** — `retries: 0` locally with full parallelism
on 4 cores turns any of these into a false red.

## Deferred to Phase 5 (integration polish)

- Home's "See all N lessons →" now lands on a catalogue of courses — reword it,
  and update the two test regexes that match the string.
- Glossary terms for the new courses, pointing *at* lessons (decision D-12).
- Watch CI's 30-minute ceiling as the per-lesson walks iterate 127 lessons.
- `docs/site-spec.md` needs the amendments this expansion made to §5, §6, §7 and §8.

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
