# Course expansion — final report

Two production-quality courses added to the LearnDSA catalogue: **Kubernetes**
(67 lessons, 14 modules) and **System Design** (45 lessons, 9 modules). The
branch is `feat/kubernetes-and-system-design-courses`, 38 commits, local only —
nothing pushed, no PR opened, per SPEC §3.

---

## 1. What was built

| | Courses | Modules | Lessons | Pages in `dist/` |
|---|---|---|---|---|
| Before | 1 | 6 | 15 | 26 |
| Now | 3 | 29 | 127 | 136 |

**Kubernetes — 14 modules, 67 lessons.** Foundations (5) · Core workloads (6) ·
Configuration and secrets (4) · Storage (5) · Networking (5) · Scheduling and
resources (5) · Reliability (4) · Delivery (5) · Scaling (4) · Security (5) ·
Observability (4) · Troubleshooting (5) · Production (6) · Projects (4). Written
against Kubernetes 1.36 using only current APIs, with a working manifest or
command in every lesson.

**System Design — 9 modules, 45 lessons.** The design workflow (4) · Scale,
latency and consistency (4) · Building blocks: the edge (5), data (5),
asynchrony and operations (5) · then the three case studies — a Netflix-like
streaming platform (6), a Spotify-like music platform (6), a YouTube-like video
platform (7) — and a comparative section (3) that puts them side by side and
argues why the same "press play" requirement produces three architectures.

**Catalogue integration.** `/learn/` became a catalogue of three course cards;
each course has its own page at `/learn/{course}/` with its module arcs, its own
resume CTA and its own progress ring. **No lesson URL moved** — the fifteen
published algorithm lessons keep their canonicals, their sitemap entries and
their `localStorage` keys.

**Diagrams.** Eleven inline-SVG figures across eleven lessons: cluster
architecture, request flow and the rollout lifecycle; then the case-study
pipelines — Netflix architecture and video delivery, Spotify architecture and
recommendations, YouTube upload, playback and search, and a media-delivery
comparison. Zero JavaScript, drawn on the design tokens so they repaint for
light, dark and forced-colors, and printable.

**Glossary.** 46 → 81 terms (+18 Kubernetes, +17 System Design). The existing 46
were not touched.

---

## 2. Technical changes

**Data model.** The hierarchy is now **course → track → lesson**. `track` keeps
its name and becomes the *module*; the two original tracks are the two modules of
the `dsa` course, so **no existing lesson's frontmatter was edited**. `course` is
a new enum field defaulting to `'dsa'`; `order` is per course and prev/next
chains inside a course; `complexity` became optional (prose lessons have none).

**Routes.** `/learn/` (catalogue), `/learn/dsa/`, `/learn/kubernetes/`,
`/learn/system-design/`. One static file per course rather than a second dynamic
segment, because `[slug].astro` already owns `/learn/{slug}/` and renaming it
would have moved fifteen published URLs. `[slug].astro` fails the build if a
lesson ever takes a course's slug, so the two cannot collide silently.

**New components and modules.** `src/lib/courses.ts` (course ids, copy, paths),
`src/lib/progress-paint.ts` (the DOM painters the catalogue and course pages
share), `CourseCard.astro`, `CourseIndex.astro`, `Figure.astro` (owns the
`<svg>`, its accessible name and description, the scroll frame and the drawing
kit), `src/components/diagrams/*.astro` (11).

**Shared abstractions touched.** `content.config.ts`, `tracks.ts`,
`progress.ts` (`LessonRef` gained `course`; `byCourseThenOrder`),
`learn/[slug].astro`, `Breadcrumb`, `PrevNext`, `WhatsNext`, `LessonLayout`,
`learn/index.astro`, `index.astro`, `sitemap.xml.ts`, `structured-data.ts`,
`SiteFooter`, `glossary.ts`, `global.css`, `reading-time.ts`, and a zero-dependency
rehype pass in `astro.config.mjs` that wraps markdown tables in a
keyboard-reachable scroll container and marks fences for styling.

**Validation.** `scripts/lib/content-validator.mjs` plus its CLI and Vitest
suite — a sixth Definition-of-Done command, `npm run validate:content`, which CI
runs as `-- --strict`. Its rules, in the order it applies them: required
metadata; unique slugs **and unique titles**; contiguous per-course ordering;
placeholder strings; section presence, order and emptiness; word bounds with a
reviewed-exception table; font charset; stale figures; the CONTENT_STYLE §1 ban
list; `estimatedMinutes` computed rather than guessed; viz-coupled components in
a prose course; `PracticeCheck` bookkeeping; internal links resolve; diagrams
exist and carry accessible text; fenced code declares a language, parses as YAML
where it claims to, and uses only allowlisted Kubernetes API versions; link text
that quotes a lesson title points at that lesson; optional sections a course has
adopted; and Appendix coverage.

**Dependencies.** One: `yaml`, as a **devDependency**, so the validator can parse
the YAML inside lesson code fences and reject a manifest that would not apply.
`// SPEC-GAP:` justification at `content-validator.mjs:22`. **Zero bytes reach
the browser** — nothing in `src/` imports it.

**Migrations and seeds.** None. No data migration, no `localStorage` key added or
renamed (verified by grep across `src/`), no lesson frontmatter rewritten. The
only regenerated artifacts are the two regression baselines, re-seeded and read.

**Scale.** 38 commits, 211 files, +39,393 / −865.

---

## 3. Validation

### Verified by execution

| Check | Command or method | Result |
|---|---|---|
| Production build | `npm run build` | ✅ 136 pages, 0 errors, portablize clean |
| Typecheck | `astro check` (inside `build`) | ✅ 0 errors |
| Lint | `npm run lint` | ✅ |
| Formatting | `npm run format:check` | ✅ |
| Unit + component | `npm run test` | ✅ 1,126 tests |
| Content validator | `npm run validate:content -- --strict` | ✅ 127 lessons clean, 5 accepted notes |
| Fonts | `npm run fonts` | ✅ regenerates identically |
| Aria baselines | re-seeded, generalisations restored, re-run | ✅ 8 passed |
| Pixel baselines | re-seeded in `playwright:v1.61.1-noble`, compared single-worker | ✅ 15 passed |
| End-to-end | whole suite in `playwright:v1.61.1-noble`, `CI=1 VISUAL_BASELINE=1` | ✅ **503 passed, 0 failed, 6.3 min** |
| External links | every external URL in `dist/`, fetched | ✅ 18 distinct, **0 broken** |
| Responsive + console | 8 pages × 375/768/1280, both themes, 36 captures | ✅ no horizontal overflow, no console or page errors |
| Keyboard walk | catalogue → card → course → lesson → breadcrumb → module anchor, Tab/Enter only | ✅ focus ring at every stop, skip link first, figure frames focusable |
| Rendered read | 12 agents, all 112 lessons as built HTML, in module order | ✅ 112/112 read, 60 findings |

**The rendered read is the check that paid.** Reading the *built HTML* rather
than the source found 60 defects: 9 major and 51 minor, 0 blockers. Every major
was re-verified against source before being acted on and every one was real —
including a wrong claim about a security control (`k8s-network-policies` said a
bare `podSelector` matches Pods "anywhere"; it is namespace-local, which the same
page states correctly twice elsewhere), a key takeaway re-teaching the
misconception its own body had just killed, and a worked example whose step 4
read the exact bug the Callout above it had named as the healthy case.

The 51 minor findings went back out to eight agents under a verify-or-refuse
contract. Of 48 triaged: **37 confirmed, 6 partly right, 5 refused with
evidence** — one agent counted the corpus and found an "add-on → addon" finding
had it backwards; another declined to delete the single Kubernetes "Interview
notes" section, citing the validator's own optional-section list. Two proposed
fixes were rejected in favour of better ones.

**The end-to-end run took four passes to become evidence.** The first, on the
host at four workers, was 472 passed / 17 failed in 13.2 minutes. Re-running the
ten affected spec files **single-worker** — the only thing that separates a load
flake from a real failure — gave 148 passed / 3 failed. That split the seventeen
into three kinds:

- **One real defect**, and one the suite could not have caught before: five
  assertions across three specs matched a lesson path against
  `/^\/learn\/[a-z-]+\/$/` — letters and hyphens, **no digits**. Every `k8s-`
  slug carries an `8`, so the glossary's cross-reference check failed on the
  *shape* of a valid URL before it ever fetched it.
- **Two arithmetic failures, not regressions.** Two tests walk the whole
  curriculum with one navigation per lesson, and both carried a constant written
  when that meant 17 pages. Measured with a 900-second ceiling: each walk takes
  ~105 s, about 0.85 s per lesson. Both budgets are now derived from the length
  of the list they walk, so they do not need raising when the next module lands.
- **Fourteen load flakes**, every one green single-worker. The axe scans are the
  bulk of them: the Kubernetes course index takes axe ~50 s under load against
  the System Design index's 3.5 s, because 67 lessons in 14 modules is simply a
  bigger DOM.

The fourth pass is the one in the table, and it is the only faithful one: the
host cannot reproduce CI, because CI runs in the pinned container and the pixel
gate can only be compared in the image its baselines were rasterised in. Run
inside that image with `CI=1` and `VISUAL_BASELINE=1`, the suite is **503 passed,
0 failed in 6.3 minutes** — 503 rather than 489 because the flag arms the
fourteen pixel comparisons that skip on a bare local run, so the pixel gate is
inside that green.

**Two defects only a rendered read could find.** A tools table opened with a
*closing* curly quote on both sides of a phrase — the source has straight quotes
and the smart-quote pass mis-oriented them, so the source looks correct. And five
pages shipped **two document titles between them**, because all three case-study
modules opened with "Requirements and Scale" and two with "High-Level
Architecture"; the same string is what a "Builds on:" chip renders, which is how
it surfaced as two identical chips on one page.

### Reviewed by inspection, not executed

- **Kubernetes behaviour on a live cluster.** Lessons in the networking, config
  and storage modules were verified against a live 1.36.3 cluster during
  authoring, and that pass corrected four factual claims that had come from
  documentation summaries (see `DECISIONS.md` D-03). Lessons in the other eleven
  modules were reviewed by inspection against the upstream API reference; their
  manifests are parsed and API-version-checked by the validator on every run, but
  they were **not applied to a cluster**.
- **The PodDisruptionBudget rounding correction** is quoted from the upstream
  docs, not executed.
- **Production canonicals.** `dist/` was built locally without `SITE_URL`, so it
  carries the `https://learndsa.invalid` sentinel. That is the designed
  behaviour; real canonicals come from the deploy-time environment and are
  covered by `tests/unit/rehost.test.ts`, not by this gate.

### Baseline issues that predate this work

- `docs/site-spec.md` §16 was labelled "(target)" and had already drifted: it
  listed a `tailwind.config.ts` that Tailwind v4 does not use and a
  `src/content/config.ts` that has always been `src/content.config.ts`. Both
  corrected while the section was being updated.
- The `learn-index` aria and pixel baselines were seeded during this expansion's
  own vertical slice and still asserted "1 lesson · 1 module" for both new
  courses. Re-seeded and read.
- The e2e suite's three curriculum-wide walks navigate once per lesson. At 17
  lessons they were already close to the 30-second default; at 127 they would
  always time out. One was given the budget its claim needs; two were scoped to
  `dsa`, which is safe *because* the validator now rejects a viz-coupled
  component in a prose lesson.

---

## 4. Decisions worth knowing

Fifteen are recorded in `DECISIONS.md` and eight spec amendments in
`AMENDMENTS.md`. The five that shaped the result:

**D-03 · Prefer a claim you have executed over a claim you have read.** Four
version-sensitive Kubernetes facts written from documentation summaries were
wrong, had already been copied into lessons, and were caught by a reviewer
running against a live cluster: init-container `restartPolicy`, what
local-path-provisioner refuses, whether `externalIPs` is removed, and whether
EndpointSlices list unready Pods. The entry now ends with where the errors came
from, because that is the reusable part.

**D-05 · Course pages are static files; lesson URLs never move.** Four lines of
page each, and one shared component. Renaming `[slug].astro` would have been
tidier and would have moved fifteen published URLs, their canonicals, their
sitemap entries and their storage keys for no reader's benefit.

**D-06 · Difficulty stayed `beginner | intermediate`.** Adding `advanced` would
have rippled through `DifficultyChip`, `LessonCard`, amendment D-1 and
`difficultySpread()`. The two-value scale still separates the lessons that need
separating.

**D-11 · Lesson files stay flat, with `k8s-`/`sd-` slug prefixes.** Three
existing test readers use a non-recursive `readdirSync`; a subdirectory would
have silently emptied them.

**C-8 · One time estimate when the second says nothing.** The lesson header
showed "N min lesson · M min read", a pair meaning the whole lesson takes N of
which M is reading. Prose lessons mount no visualizer, so the two converged: 46
of 127 pages rendered the same number twice and **19 rendered a reading time
longer than the lesson time containing it**. Fixed by making the estimator stop
counting MDX scaffolding and by suppressing the second figure when it is not
smaller. The alternative — redefining `estimatedMinutes` from the formula — was
measured and rejected: it would have restated 93 of 112 lessons 2–3 minutes
longer to satisfy a formula rather than a judgement.

---

## 5. Known limitations

1. **Five lessons run past the 1,500-word ceiling**, at 1,509–1,570. SPEC §5
   makes the ceiling a warning for exactly this reason. Each is recorded in
   `OVER_CEILING_ACCEPTED` with its reason and prints as a note on every run;
   a lesson trimmed back inside the ceiling without deleting its entry is an
   error, so the table cannot rot into a blanket exemption.
2. **Eleven of the fourteen Kubernetes modules were not applied to a cluster.**
   Their manifests parse and pass the API allowlist; their *behavioural* claims
   were reviewed, not executed. Given D-03, that distinction is worth keeping in
   view.
3. **`/learn/`'s primary CTA is course-blind.** It is the global resume button,
   so with no progress recorded it reads "Start with 01 · Complexity & Big-O" —
   a three-course catalogue whose one primary action silently means DSA, and
   "01" is now ambiguous because `order` is per course. D-05 records the resume
   CTA as global and unchanged, so changing it is a spec amendment with designer
   sign-off rather than a fix. The destination is never ambiguous, since the
   lesson title is in the label.
4. **The courses ship no outbound hyperlinks.** That is what CONTENT_STYLE's
   citation rule produces ("author and year, no URL"), and it is consistent with
   the site's no-network-calls constraint — but it means a reader who wants the
   upstream page has to search for it.
5. **CI's 30-minute ceiling has headroom, but less of it.** The e2e suite walks
   127 lessons where it once walked 17: 6.3 minutes in the pinned container,
   13.2 on a busy host. That is comfortable now and will not stay comfortable
   forever — the three per-lesson walks are the term that grows, and at some
   catalogue size they should sample rather than enumerate.
6. **A four-core host cannot run this suite at four workers.** Fourteen tests,
   mostly axe scans, exceed a 30-second budget under that load and pass on a
   quiet machine. CI's `retries: 2` absorbs it and the container run is green,
   but a local `npm run test:e2e` on a busy machine will produce reds that mean
   nothing. The standing rule is in `PROGRESS.md`.
