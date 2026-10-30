/**
 * Catalogue — `/learn` (site spec §6 site map, §8 layout; course expansion
 * decision D-05). Ported from `src/pages/learn/index.astro` (React migration
 * P3); CSS in `src/styles/pages/learn-index.css`, behaviour in the client
 * module `src/client/modules/learn-index.ts`.
 *
 * This page WAS the curriculum index: two track sections and fifteen lesson
 * cards. Since the course expansion it is the catalogue of COURSES, and the
 * sections, arcs and cards moved to `/learn/{course}/` (`CourseIndex`).
 * Data-driven either way: it queries the published lessons and derives each
 * card's lesson count, module count and duration, so a lesson added tomorrow
 * moves the numbers with no edit here.
 *
 * WHAT STAYED, and why: the resume CTA, the ready-to-review strip, the
 * reset-progress control, the learning-days line and the pip legend are all
 * facts about the DEVICE rather than about one course. Three reset buttons
 * deleting the same five keys would be three descriptions of one act, and the
 * review strip is capped at two cards precisely because it is the product's
 * single prompting surface.
 *
 * M7.2 closes the progress loop (§8 "curriculum index"), all of it driven by
 * `src/lib/progress.ts` reading the same `lesson:{slug}:complete` keys
 * `MarkComplete` writes: a resume CTA under the page head, a ring on each course
 * card, and a reset-progress control with an inline confirm step. The lesson
 * list those surfaces need is injected as JSON at build time (`data-lessons`) —
 * localStorage is never enumerated by prefix. Here the injected list is the
 * WHOLE catalogue, so the CTA resumes across courses; a course page injects its
 * own slice and the same painters scope themselves to it.
 *
 * M8.1's currency is unchanged (spec §8's M8 amendment;
 * `docs/m8-gamification.md`): `TrackArc` is reused per course card, filled from
 * the mastery states rather than the completion count, because the design calls
 * the ring their macro rendering. ONE function paints every surface from one
 * read — `src/lib/progress-paint.ts`, shared with the course pages, which is
 * what keeps the two levels from disagreeing. A collapsed legend under the page
 * head says what the three stages are and who is grading them (the reader) —
 * static copy, no key, no island.
 *
 * M8.2 adds the ready-to-review strip directly under the page head (spec §8) —
 * at most two quiet link-cards, and ZERO DOM when nothing is due, so a reader
 * with nothing to review never meets an empty state or an "all caught up"
 * badge. It is the only surface in the product that ever prompts, which is why
 * it is capped, wordless about lateness, and derived at render rather than
 * stored. `ReviewStrip` reads the SAME build-injected `data-lessons` list the
 * progress island does — one list, one schedule — and inserts itself after the
 * element carrying it, so its placement is not a second fact to keep in sync.
 *
 * M8.3 adds truth to the reset control and exactly one new line. `ld:challenges:v1`,
 * `ld:finalrun:v1` and `ld:days:v1` are spec §6 PROGRESS keys, so the reset control
 * clears them — through `src/lib/progress.ts`, which owns the delete list — and its
 * confirm warning and its announcement name whichever kinds this device actually
 * holds, the reader's own written notes and the learning-days count included. A
 * reader whose only stored data is a cleared trial is therefore neither told
 * there is nothing to clear nor told that "0 completed marks" went.
 *
 * The new line is Learning Days: one muted sentence under the resume CTA saying
 * how many days this device has seen an explicit learning act on. It is the
 * design's ANTI-STREAK — monotonic, targetless, chainless, and worded so
 * (`learningDaysLine()` in `src/lib/learning-days.ts`, where a unit test can
 * read it) — so it renders no calendar, no gap and no comparison, and there is
 * no state in which it could show a broken chain. Nothing on this page WRITES
 * it; the acts that do are on the lesson pages, which is where explicit acts
 * happen.
 *
 * JS off (or storage blocked): the CTA still points at lesson 01, the rings
 * stay hidden rather than lying "0 of 9" — with the store blocked the arcs mark
 * themselves unreadable instead of stating a zero nobody could verify — the
 * reset control, the legend, the learning-days line and every M8 surface are
 * hidden by their own <noscript> kill-switches (none of them can work; the
 * review strip has no markup to hide in the first place, and the days line ships
 * empty and hidden besides), and every card stays a fully usable link
 * (§6 local completed state, §12 a11y).
 *
 * Landmarks/headings: BaseLayout owns <header>/<main>/<footer>; this page has one
 * <h1> and, on the visits where the review strip has something to offer, its
 * <h2>. The course cards are links in one list rather than sections, because a
 * catalogue of three is a choice, not an outline.
 */
import type { JSX } from 'react';
import Collapsible from '../components/Collapsible';
import CourseCard from '../components/CourseCard';
import ReviewStrip from '../components/ReviewStrip';
import { getLessons } from '../content/lessons';
import BaseLayout from '../layouts/BaseLayout';
import { COURSE_ORDER } from '../lib/courses';
import {
  MASTERY_GATE_DAYS,
  resumeLabel,
  type LessonRef,
} from '../lib/progress';
import { tracksForCourse } from '../lib/tracks';
import { useClientModule } from '../render/context';

/** The page head's `<noscript>` kill-switches, verbatim. */
const NOSCRIPT = `<style>
    /* No script, no delete path — hide the control rather than expose a
       dead one (same kill-switch as MarkComplete/ThemeToggle).
       !important so it can never lose to the bundled stylesheet. */
    .learn__reset {
      display: none !important;
    }

    /* The pip legend goes too. It needs no script — a native <details>
       opens on its own — but with JS off there is no pip, no ring and no
       stage word anywhere on this page, so it would be a legend for a
       thing that is not there. Same M8 rule the components apply: no
       gamification surface appears without JS. */
    .learn__legend {
      display: none !important;
    }

    /* And the learning-days line, for the same reason and one more: with
       no script there is no storage read, so any number here would be a
       fiction the build invented about a device it never saw. (It also
       ships \`hidden\`, so this rule is the belt to that braces.) */
    .learn__days {
      display: none !important;
    }

    /* The per-track counter's own kill-switch lives in TrackArc
       (every M8 component ships one), so it is deliberately not restated
       here — one rule, in the component that owns the markup. */
  </style>`;

/**
 * The catalogue.
 *
 * @returns The page body.
 */
export default function LearnIndex(): JSX.Element {
  const published = getLessons();

  // The catalogue: every course in `COURSE_ORDER`, with the counts its card
  // states. Titles, blurbs, prerequisites and outcomes all come from
  // `src/lib/courses.ts`, so this page states no course copy of its own — a
  // rename lands in one place. The counts are DERIVED from the collection, so
  // a lesson added tomorrow moves the number without anyone editing this file.
  const courses = COURSE_ORDER.map((id) => {
    const lessons = published.filter((l) => l.data.course === id);
    return {
      id,
      lessonCount: lessons.length,
      // Modules that actually have a published lesson — an empty module is a
      // plan, not something to count on a catalogue card.
      moduleCount: tracksForCourse(id).filter((track) =>
        lessons.some((l) => l.data.track === track),
      ).length,
      totalMinutes: lessons.reduce(
        (sum, l) => sum + l.data.estimatedMinutes,
        0,
      ),
    };
  });

  // The lesson list the progress module reads (M7.2), in global order.
  // Injected from the build — never recovered by scanning localStorage keys,
  // which would count lessons that no longer exist (renamed or unpublished)
  // and inflate every counter on the page.
  const lessonRefs: LessonRef[] = published
    .map(({ data }) => ({
      slug: data.slug,
      title: data.title,
      order: data.order,
      track: data.track,
      course: data.course,
    }))
    .sort(
      (a, b) =>
        COURSE_ORDER.indexOf(a.course) - COURSE_ORDER.indexOf(b.course) ||
        a.order - b.order,
    );

  // First lesson in catalogue order — the JS-off / nothing-stored resume target.
  const firstLesson = lessonRefs[0];

  // The review strip's `#practice` deep-link guard (M8.2) that lived here runs
  // for the whole collection in `checkCollection()` (`src/content/lessons.ts`),
  // before the first page renders.

  // The CTA's server-rendered wording, from the SAME helper the module calls at
  // runtime (with "nothing complete yet" as the only honest build-time
  // assumption), so the fallback and the rewrite can never word a state twice.
  const resumeFallback = firstLesson
    ? resumeLabel(firstLesson, 0, lessonRefs.length)
    : '';

  return (
    <BaseLayout
      title="Learn · LearnDSA"
      canonicalPath="/learn/"
      description="Every LearnDSA course: data structures and algorithms, Kubernetes, and system design — interactive lessons you work through at your own pace, free and without an account."
    >
      <div className="learn">
        <header
          className="learn__head"
          data-lessons={JSON.stringify(lessonRefs)}
        >
          <h1>Courses</h1>
          <p className="learn__intro">
            {`${courses.length} courses, ${published.length} lessons. Pick one and work through it in order, or jump to whichever topic you came for — nothing is locked, and every lesson names what it builds on. Lessons you finish are checked off on this device.`}
          </p>

          {firstLesson && (
            <div className="learn__resume">
              <a
                className="btn-primary learn__resume-link"
                href={`/learn/${firstLesson.slug}/`}
                data-resume-link=""
              >
                <span data-resume-label="">{resumeFallback}</span>
                <span aria-hidden="true">→</span>
              </a>
              {/* The all-complete state has no honest "next" destination, so
                  the CTA steps aside for this line instead of linking
                  somewhere arbitrary. Revealed by the module only. */}
              <p className="learn__resume-done" data-resume-done="" hidden />
            </div>
          )}

          {/* Learning days (M8.3) — one quiet line, and the whole surface of the
              feature. It ships EMPTY and hidden: the count is a fact about this
              device, which the build cannot see, so it is the module that
              decides whether there is anything to say. A reader who has not
              acted yet meets no line at all — never a "0 days", which would be
              an empty state doing the guilt work this design killed streaks to
              avoid. Every word of it comes from `learningDaysLine()` so the copy
              rules are a unit test rather than a habit, and the whole thing is
              one text node: nothing here is a chain, a calendar, a target or a
              comparison. */}
          <p className="learn__days" data-learning-days="" hidden></p>

          {/* Reset control: JS-only (it cannot delete anything without
              script), so it ships visible for script-enabled readers — no
              layout shift on hydrate — and is removed entirely by the
              <noscript> kill-switch below, the same pattern MarkComplete and
              ThemeToggle use. It starts aria-disabled because the count is
              unknowable at build time. */}
          {firstLesson && (
            <div className="learn__reset">
              <button
                type="button"
                className="learn__reset-toggle"
                data-reset-toggle=""
                aria-expanded="false"
                aria-controls="reset-progress-panel"
                aria-disabled="true"
              >
                Reset progress
              </button>

              <div
                className="learn__reset-panel"
                id="reset-progress-panel"
                data-reset-panel=""
                hidden
              >
                <p
                  className="learn__reset-warn"
                  id="reset-progress-warn"
                  data-reset-warn=""
                >
                  {/* Rewritten by the module every time the panel opens, naming
                      only the record kinds this device actually holds. This is
                      the build's honest version of that sentence: it cannot
                      know the device, so it names every progress key §6 lists. */}
                  Removes every completed mark, practice record, written note,
                  trial record and the learning-days count stored on this device
                  — cannot be undone.
                </p>
                <div className="learn__reset-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    data-reset-confirm=""
                    aria-describedby="reset-progress-warn"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    data-reset-cancel=""
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />

          {/* Outcome of a reset, announced politely. role="status" carries an
              implicit aria-live="polite"; it is empty until the reader acts, so
              it never announces on load. */}
          <p
            className="learn__status"
            role="status"
            data-progress-status=""
          ></p>

          {/* SPEC-GAP: neither spec §8 nor `docs/m8-gamification.md` names a
              legend for the currency — but both make the pips, the three stage
              words and "Practiced n · Mastered n" the product's entire progress
              language, and M8.1 shipped all of it with nothing anywhere saying
              what a pip means, how one is earned, or that the reader is the one
              doing the grading. This is the smallest thing that closes that:
              static copy in the site's existing disclosure idiom
              (`Collapsible` — a native `<details>`, so it needs no script of its
              own), collapsed by default, adding no key and no module. It sits
              directly above the first track's ring, which is the first place
              the words appear. Gated on `firstLesson` alongside the reset
              control so "Reset progress above" can never name a control this
              page did not render. */}
          {firstLesson && (
            <div className="learn__legend">
              <Collapsible summary="What the three pips mean">
                <p>
                  Each lesson can fill up to three pips. They are your own notes
                  to yourself: you decide when one is earned, nothing here is
                  graded or checked, and nothing is ever taken away.
                </p>
                <dl className="learn__legend-list">
                  <dt>Learned</dt>
                  <dd>
                    You pressed &quot;Mark as complete&quot; at the end of the
                    lesson.
                  </dd>
                  <dt>Practiced</dt>
                  <dd>
                    You answered every practice question in the lesson and
                    marked each one &quot;I had it&quot;.
                  </dd>
                  <dt>Mastered</dt>
                  <dd>
                    {`You did that again, at least ${MASTERY_GATE_DAYS} days after the first time — that's how memory consolidates.`}
                  </dd>
                </dl>
                <p>
                  All three are kept on this device only, so clearing your
                  browser data clears them — and &quot;Reset progress&quot;
                  above removes them whenever you want.
                </p>
              </Collapsible>
            </div>
          )}
        </header>

        {/* The ready-to-review strip (M8.2). Nothing of the strip renders here
            — the component emits only its <noscript> kill-switch, and its
            module inserts the cards after the page head (the element above,
            which carries the injected lesson list) only when something is
            actually due. Mounted at the position it will occupy so the source
            reads in document order. */}
        <ReviewStrip />

        <ul className="learn__courses" role="list">
          {courses.map((course) => (
            <li key={course.id}>
              <CourseCard
                course={course.id}
                lessonCount={course.lessonCount}
                moduleCount={course.moduleCount}
                totalMinutes={course.totalMinutes}
              />
            </li>
          ))}
        </ul>
      </div>
      <PageModule />
    </BaseLayout>
  );
}

/**
 * Asks for the page's own module last: Astro emitted a page's script after
 * every component script it rendered (`review-strip` here).
 *
 * @returns Nothing.
 */
function PageModule(): null {
  useClientModule('learn-index');
  return null;
}
