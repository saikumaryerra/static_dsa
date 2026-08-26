# Course expansion — spec amendments

Every constraint in `docs/site-spec.md` that this expansion reopened, what changed,
why, and which test moved **deliberately** rather than being deleted. Same shape as
`docs/redesign-2026-08/03-amendments.md`.

Nothing in the project's Tier-1 constraints moved: no backend, no new `localStorage`
key, no behavioral tracking, no fabricated evidence, no killed mechanic resurrected,
and every surface still works with JavaScript off. One dependency was added — a
**devDependency**, shipping zero bytes to the browser (C-3 below).

The sign-off is `docs/courses/SPEC.md` §1, which asks for two complete production-quality
tracks and says the product must afterwards "read as a broader engineering learning
catalogue, not an algorithms site with two extra cards".

---

## C-1 · The hierarchy is course → track → lesson

**Was** spec §5/§7: one implicit course, two tracks (`foundations`, `algorithms`),
`order` a single global sequence 1–15.

**Now** a `course` field above `track`. `track` keeps its name and becomes the
*module*; the two original tracks are the two modules of the `dsa` course. `order`
is per course.

**Why.** It is the smallest change that yields three levels: one new field with a
default, one widened enum, no renames, and **no edit to any of the fifteen existing
lessons**. Modelling modules as a fourth level under `track` would have given
course → track → module → lesson, one level more than the material needs.

**Tests moved.** `tests/e2e/m7-progress.spec.ts`'s "the curriculum must cross tracks
exactly once" is now scoped to one course — with three courses that is a fact about a
course, not about the site. The last-lesson card asserts the course page rather than
`/learn/`.

---

## C-2 · `/learn/` is the catalogue; each course has its own page

**Was** spec §6/§8: `/learn/` lists every lesson, grouped by track.

**Now** `/learn/` lists three course cards; `/learn/{course}/` holds that course's
modules, arcs and lesson cards. **Lesson URLs did not move.**

**Why.** ~110 lesson cards on one page is a directory, not a catalogue. Lesson URLs
carry external links, canonicals, sitemap entries and `localStorage` keys, so nesting
lessons under their course was never an option. The reset control, the ready-to-review
strip and the learning-days line stayed on the catalogue because they describe the
*device*, not a course — three reset buttons deleting the same five keys would be
three ways to describe one act.

**Tests moved.** Eight e2e specs that asserted on cards or arcs at `/learn/` now look
where they live. Both baselines were re-seeded deliberately and the diffs read: the
aria diff is the footer tagline, the breadcrumb's new course crumb, and `/learn/`
becoming a catalogue.

---

## C-3 · `complexity` is optional, and a devDependency was added

**Was** spec §7: `complexity` required on every lesson, four Big-O strings.

**Now** optional. There is no honest Big-O for "ConfigMaps and Secrets" or
"CAP and PACELC", and inventing `O(1)` placeholders was rejected outright. The
alternative — a second collection — would have forked the loader, the route, the
layout, progress, prev/next and every test to avoid one optional field.

**And** `yaml` is now a devDependency, used only by the content validator to parse
the YAML inside lesson fences (SPEC Appendix D item 8). Justification and the
rejected alternatives are at the top of `scripts/lib/content-validator.mjs` and in
DECISIONS D-13. **Zero bytes reach the browser**, so the §4 JS budget is untouched.

---

## C-4 · Difficulty did **not** change

Spec §7's `beginner | intermediate` stands. Production Kubernetes and the case
studies are advanced material and are labelled `intermediate`, because SPEC §5 says
difficulty labels come from the existing set — and because a third value would have to
be threaded through `LessonLayout`, `DifficultyChip`, `LessonCard`, amendment D-1's
"badge the exception" rule and `difficultySpread()`, which silently drops anything
outside the hardcoded two. Recorded here as a constraint considered and kept.

---

## C-5 · A sixth Definition-of-Done command

**Was** spec §18: five commands.

**Now** six — `npm run validate:content` joins them, and CI runs it as
`-- --strict`. The strict flag additionally requires every Appendix A/B topic in
`docs/courses/coverage.json` to name a lesson that exists, which is what makes
"every topic is taught" a checked claim rather than a remembered one.

Nine defect classes are mechanical rather than reviewed: placeholders, PracticeCheck
bookkeeping, per-module `order` contiguity, the `estimatedMinutes` band, the
CONTENT_STYLE §1 ban list, viz-coupled components in a prose lesson, superseded
figures, out-of-charset glyphs, and Appendix coverage. Each was added *after* a
reviewer found that class of defect by hand, and each was verified to fail on a
planted defect and pass once reverted.

---

## C-6 · Prose artifacts: tables, fenced code, and figures

**Was** nothing. Markdown tables rendered with no padding, no borders and no overflow
handling; a bare fenced block had no styling at all; and the site had no diagram
mechanism.

**Now** a zero-dependency rehype pass in `astro.config.mjs` wraps a markdown table in
a keyboard-reachable scroll container and marks a markdown fence so it can be styled
without fighting `<CodeTabs>`; `Figure.astro` owns the `<svg>`, the accessible name,
description and caption, a scroll frame, and a token-based drawing kit.

**Why the wrapper rather than CSS.** `display: block; overflow-x: auto` on a `<table>`
strips its semantics from the accessibility tree in Chrome and Firefox — a real
regression traded for a scrollbar.

**Why inline SVG rather than Mermaid.** Client-side Mermaid is a large dependency
against the ≤ 60 KB per-page JS budget; build-time Mermaid pulls a headless browser
into the build; a static `.svg` cannot repaint itself for the light/dark tokens.
Inline SVG in a component is the only option that is zero-dependency, zero-JS,
themable and printable.

---

## C-7 · Site copy is no longer algorithms-only

Home, `/learn/`, the footer tagline and the WebSite JSON-LD described a site about
data structures and algorithms. They now describe a catalogue of three courses,
**without renaming the product or changing its branding**, as SPEC §1 requires.

One thing deliberately *not* broadened: the home page's three promises are all about
the step-through instrument, and the Kubernetes and System Design lessons do not mount
one. That section is now headed "What an algorithms lesson actually does" rather than
being reworded to cover courses it is not true of.

---

## Not reopened, and why

- **Trace-then-render (§11).** The new courses mount no visualizer; the pipeline is
  untouched, and the validator rejects a viz-coupled component in a prose lesson.
- **The §6 storage keys.** No key added, none renamed. `LessonRef` gained a `course`
  field, which is build-injected and never stored.
- **The §4 JS budget.** The course pages share `progress-paint.ts` with the catalogue
  rather than shipping a second island.
- **The M8 calm invariants.** Untouched, and still enforced by their tests.
- **The glossary.** Left DSA-scoped; lesson prose may not link into it (DECISIONS
  D-12). Terms pointing *at* the new lessons are optional polish, not a gate item.
