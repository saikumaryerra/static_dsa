# Course expansion — PROGRESS

Single source of truth for state (SPEC §4). Update after every completed unit, then commit.

**Branch:** `feat/kubernetes-and-system-design-courses` (local only — do not push, do not open a PR)
**Started:** 2026-08-26 · **Baseline commit:** `9b44d75`

---

## Status per phase

| Phase | State |
|---|---|
| 0 — Recon and baseline | **done** (`b1c347c`) |
| 1 — Vertical slice | **done** (`ae15428`) |
| 2 — Curriculum, style guide, exemplars | **done** (`ae15428`) |
| 3 — Content production | **done** — 112 of 112 written, reviewed and corrected |
| 4 — Diagrams | **done** — 11 of 11 (`e134327`) |
| 5 — Integration polish | **done** |
| 6 — Verification gate | **done** — the §8 checklist below is fully ticked |
| 7 — Final report | **done** — `docs/courses/REPORT.md` |

## Catalogue as built

| | Courses | Modules | Lessons | Pages in `dist/` |
|---|---|---|---|---|
| Before | 1 | 6 | 15 | 26 |
| Now | 3 | 29 | 127 | 136 |

The 112 new lessons are 67 Kubernetes (14 modules) and 45 System Design
(9 modules). Full plan in `CURRICULUM.md`; every Appendix A/B topic maps to a
lesson in `coverage.json`, which `validate:content --strict` enforces on CI.

## How Phase 6 was run

In this order, because each step fed the next, and the order mattered:

1. **Pre-flight greps**, before anything expensive. They found the `home` aria
   baseline still asserting a home-page string this branch had changed — two
   guaranteed reds caught for the cost of a grep.
2. **`tests/e2e/courses.spec.ts` written first**, so one run validated it: three
   widths with a horizontal-overflow check, console and `pageerror` capture,
   catalogue → course → module → lesson by following real links, all eleven
   figures, and axe with every `<details>` forced open.
3. **The manual half**, while agents were still running: 36 screenshots across
   three widths and both themes, a keyboard-only walk, and a rendered read of all
   112 lessons by twelve agents.
4. **The findings repaired** — 9 major by hand, 51 minor by eight agents under a
   verify-or-refuse contract.
5. **Both baselines re-seeded and read**, not regenerated. Four aria files and
   twelve of the fourteen PNGs moved.
6. **The e2e suite**, four times, ending in the pinned container. See the ledger.

**Standing rule, and the reason for step 3's ordering:** never run the e2e suite
while subagents are running.

## Verification

### Manual gate (SPEC §8), verified by execution

Headless Chromium against `astro preview` on the built `dist/`, machine quiet.

| Check | Method | Result |
|---|---|---|
| Screenshot walk | 8 pages × 375/768/1280 light, 4 pages dark — 36 captures | ✅ no horizontal document overflow, no console or pageerror anywhere |
| Screenshots read | catalogue, k8s course page, an sd lesson at 375 dark, the upload-pipeline figure at ×3 | ✅ one defect found and fixed (`f04504f`) |
| Figure frames | `sd-youtube-upload-pipeline` at 375 / 1280 | ✅ 672 vs 341 → scrolls inside its own frame; 1150 vs 1150 at desktop; the page never scrolls |
| Keyboard-only walk | Tab/Enter only, catalogue → card → course → lesson → breadcrumb → module anchor | ✅ every stop had a visible focus ring and non-zero size; skip link is the first stop; the figure frame takes focus |
| External links | every external URL in `dist/`, fetched | ✅ 18 distinct, **0 broken**, and **0 of them navigable** — the artifact ships no outbound hyperlinks, which is what CONTENT_STYLE's "author and year, no URL" rule produces |
| Rendered read | 12 agents, all 112 lessons as built HTML, in module order | ✅ 112/112 read, 0 incomplete; 60 findings — 0 blockers, 9 major, 51 minor |

The rendered read is the one that paid. All nine majors were re-verified against
source before being acted on and all nine were real, including a wrong claim
about a security control (`k8s-network-policies` said a bare `podSelector`
matches Pods "anywhere"; it is namespace-local, as the same page says twice
elsewhere), a key takeaway re-teaching the misconception its own body had just
killed, and a worked example whose step 4 read the exact bug the Callout above
it had just named as healthy.

It also exposed a hole in the validator: `## Interview notes` is optional per
lesson, so nothing could see that System Design had adopted it in 39 of 45
lessons while one whole module sat at 1 of 6. `conventionGaps()` now reports
that cohort, and is the source of the remaining warnings.

### Automated gate

| Check | Command | Result |
|---|---|---|
| Build | `npm run build` | ✅ 136 pages, 0 errors, portablize clean |
| Lint | `npm run lint` | ✅ |
| Format | `npm run format:check` | ✅ |
| Unit | `npm run test` | ✅ 65 files / 1119 tests (pre-cohort-rule count) |
| Validator | `npm run validate:content` | ⏳ driving the cohort warnings to the accepted set |
| Fonts | `npm run fonts` | ✅ regenerates identically |
| Visual baselines | re-seed pending — **expect 10 of 14 to move**: home ×4 (CTA), glossary ×2 (35 terms), lesson-binary-search ×4 (the meta row lost "7 min read"). `learn-index` ×2 and `not-found` ×2 should not move; read either if it does. |
| Aria baselines | re-seed pending — `home` and `lesson-binary-search` now FAIL (both pin strings this branch changed); `glossary` is stale-but-**passing**, because `toMatchAriaSnapshot` matches a subset and 35 new terms are invisible to it |
| E2E | pinned container, `CI=1 VISUAL_BASELINE=1` | ✅ **503 passed, 0 failed, 6.3 min** |

### The e2e failure ledger

**Runs 1 and 2** found 17 then 9 failures; every one was fixed or classified, and
the detail is in this file's history. What follows is run 3, the first against all
127 lessons.

**Run 3 — `npm run test:e2e`, quiet machine, 4 workers: 472 passed, 17 failed,
13.2 minutes.** The wall-clock is the datum for the deferred CI-ceiling question:
13.2 of 30 minutes, so the per-lesson walks have headroom.

Re-running the ten affected spec files **single-worker** separates the two kinds
of failure, and it is the only evidence that can: 148 passed, 3 failed.

**Fixed — a real defect the suite could not have caught before.** Five assertions
across three specs matched a lesson path against `/^\/learn\/[a-z-]+\/$/` —
letters and hyphens, no digits. Every `k8s-` slug carries an `8`, so the
glossary's "Introduced in …" cross-reference check failed on the SHAPE of a
perfectly valid URL before it ever fetched it. The other four sample a link
rather than walk them all, which is why only one had fired. Widened to
`[a-z0-9-]+`, which `url-shape.spec.ts` already used.

**Load flakes — 14 of the 17.** All three axe scans (`binary-search` ×2,
`m1-gaps` ×2, and the new `courses.spec.ts` Kubernetes course index ×2),
`m8-predict`'s toggle walk, `nojs-orphan-sections`, `m7-print-hcm`'s
Practice-answer reveal, the `portable` sub-path walk, and two `m8-explain-note`
storage tests. Every one passed single-worker. Two details worth keeping:
`m8-predict`'s walk is already scoped to `dsa` (15 lessons), so a 30-second
timeout there can only be load; and the Kubernetes course index takes axe ~50 s
under load against the System Design index's 3.5 s, because 67 lessons in 14
modules is simply a bigger DOM.

**Structural — 2, and they are arithmetic rather than regression.** Both walk the
whole curriculum with one browser navigation per lesson, which was 17 navigations
when they were written and is now 123 and 127:

| Spec | Claim | Budget | Outcome |
|---|---|---|---|
| `m8-explain-note.spec.ts:289` | every authored prompt reaches its own lesson | `test.slow()` → 90 s | timed out at 123 lessons |
| `m8-practice-check.spec.ts:510` | every Practice section is self-gradable | `test.setTimeout(180_000)` | timed out at 127 lessons |

Both budgets were constants somebody has to remember to raise. **Measured** with
a 900-second ceiling on a quiet machine: the two walks take about 105 seconds
each, roughly 0.85 s per lesson. Both now derive their budget from the length of
the list they walk — `30_000 + lessons.length * 2_000`, about 2.5x the measured
cost, which is the headroom a loaded CI box needs and does not need raising the
next time a module lands.

One more failure appeared **only** in the single-worker run and passed under
parallelism: `m8-explain-note.spec.ts:330`, where `[data-mark-complete]`
resolves and then the click times out. It did not reproduce — 38 passed on the
re-run, and it passed again in the run below. One occurrence with `retries: 0`
is not a characterisation.

### Run 4 — the one that counts

The host cannot reproduce CI: CI runs in `playwright:v1.61.1-noble`, and the
pixel gate can only be compared in the image its baselines were rasterised in.
So run 4 was the whole suite **inside that container**, with `CI=1` (retries 2,
`updateSnapshots: 'none'`) and `VISUAL_BASELINE=1` (the 14 pixel comparisons
armed rather than skipped):

```
docker run --rm -u 1000:1000 -v "$PWD":/w -w /w \
  -e CI=1 -e VISUAL_BASELINE=1 \
  mcr.microsoft.com/playwright:v1.61.1-noble npx playwright test
```

**503 passed, 0 failed, 6.3 minutes.** 503 rather than 489 because
`VISUAL_BASELINE` arms the fourteen captures that skip on a bare local run — the
pixel gate is *included* in that green.

It is also faster than the 13.2-minute host run, which is the clearest statement
of what the fourteen load flakes were: a four-core host running four workers
while the rest of this session's work was still settling, not anything about the
code.

**Standing rule, learnt from run 1 and confirmed again here:** never run the e2e
suite while subagents or other heavy processes are running. `retries: 0` locally
with full parallelism on 4 cores turns any of the fourteen above into a false
red, and a red run under load is not evidence of anything.

## Phase 5 (integration polish) — closed

- [x] Home's "See all N lessons" now reads "Browse all 3 courses" (`faa6b1b`);
      both test regexes and the `home` aria baseline follow it.
- [x] Glossary terms for the new courses, pointing *at* lessons (decision D-12) —
      35 added in `3ec3702`, the existing 46 untouched.
- [x] `docs/site-spec.md` amended (`9f8c5f8`) across §1, §2, §4, §5, §6, §7, §8,
      §9, §16, §18 and §19. Two claims from AMENDMENTS.md were deliberately left
      out because they could not be verified from the repo.
- [x] CI's 30-minute ceiling — **answered**: 6.3 minutes in the pinned container,
      13.2 on a busy four-core host. Headroom, and recorded in REPORT.md §5 as
      the term that grows.
- [x] The three validator warnings — settled. Two lessons trimmed, one rewritten,
      and the remaining over-ceiling lessons moved into `OVER_CEILING_ACCEPTED`
      with a written reason each, printed as notes rather than warnings.

---

## §8 verification gate checklist

- [x] The existing algorithm catalogue still works — `/learn/dsa/` reachable from
      the catalogue, its fifteen lesson URLs unmoved, its visualizers, trials and
      Final Run untouched and still covered by their own specs
- [x] The Kubernetes course exists and is fully navigable — 67 lessons, 14 modules
- [x] Every Appendix A topic is taught — `validate:content --strict` passes
- [x] The System Design course exists with foundations, building blocks, three case
      studies and the comparison — 45 lessons, 9 modules
- [x] Every Appendix B topic is taught — same gate
- [x] Both courses are visible in the catalogue with correct metadata — read in a
      browser at three widths, and pinned by the re-seeded pixel and aria baselines
- [x] Navigation and deep links work — `courses.spec.ts` walks catalogue → course →
      module → lesson by following links, and asserts the breadcrumb's `#track-`
      fragment resolves to a heading that exists
- [x] Progress and completion work — course-scoped rings, pips and resume CTAs, all
      painted by the shared `progress-paint.ts`; no storage key added
- [x] Responsive layout verified at 375 / 768 / 1280 — 36 captures, zero horizontal
      document overflow, plus the same three widths asserted in `courses.spec.ts`
- [x] Accessibility checked — axe at serious-and-above on the two new page shapes in
      both themes with every `<details>` forced open, plus a keyboard-only walk
- [x] Diagrams render — all eleven asserted labelled, described, actually drawn and
      keyboard-reachable; read by eye at ×3 and geometrically verified
- [x] No placeholders, feature TODOs, broken links, or new console/runtime errors —
      validator placeholder rule, 0 broken external links, console clean on 36 loads
- [x] Content validator passes — 127 lessons clean, 5 reviewed notes
- [x] `npm run test` passes — 1,126 tests
- [x] `astro check` / typecheck passes
- [x] `npm run lint` passes
- [x] `npm run format:check` passes
- [x] `npm run build` passes — 136 pages, portablize clean
- [x] One-off external link check done — 18 distinct external URLs, 0 broken, and
      none of them navigable: the artifact ships no outbound hyperlinks, which is
      what CONTENT_STYLE's "author and year, no URL" rule produces
- [x] Final content reviewed for quality and consistency — all 112 lessons read in
      rendered form, 60 findings, all triaged
- [x] `npm run test:e2e` passes — 503/503 in the pinned container with the pixel gate armed
