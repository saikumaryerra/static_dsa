/**
 * CourseIndex — the body of one course page, `/learn/{course}/` (course
 * expansion, `docs/courses/SPEC.md` §6, decision D-05). Ported from
 * `CourseIndex.astro` (React migration P3); CSS in
 * `src/styles/components/course-index.css`, behaviour in the client module
 * `src/client/modules/course-index.ts`.
 *
 * `/learn` was the course page while there was one course; it is the catalogue
 * now, and this is what moved out of it: the module sections, their arcs, their
 * lesson cards and a resume CTA — scoped to one course instead of to everything.
 * `src/pages/CoursePage.tsx` passes a `course` id here for each of the three
 * course routes (`src/routes.tsx`); lesson URLs did not move.
 *
 * WHAT STAYED ON THE CATALOGUE, and why: the reset control, the ready-to-review
 * strip and the learning-days line are facts about the *device*, not about a
 * course. Rendering three reset buttons that all delete the same five keys would
 * be three ways to describe one act; the review strip is capped at two cards
 * precisely because it is the product's single prompting surface, and one per
 * course would be three.
 *
 * The injected `data-lessons` list is scoped to THIS course, which is the whole
 * mechanism: the shared painters in `src/lib/progress-paint.ts` derive the
 * resume target, the arcs and the card pips from whatever list they find, so the
 * same functions give a catalogue-wide CTA on `/learn` and a course-wide one
 * here without a flag.
 *
 * JS off (or storage blocked): the CTA still points at lesson 01 of the course,
 * every card is a working link, and each arc removes itself through the
 * kill-switch `TrackArc` ships — the same degradation `/learn` had.
 */
import type { JSX } from 'react';
import type { LessonEntry } from '../content/lessons';
import { COURSE_COPY, type CourseId } from '../lib/courses';
import { resumeLabel, type LessonRef } from '../lib/progress';
import { TRACK_COPY, tracksForCourse } from '../lib/tracks';
import { useClientModule } from '../render/context';
import LessonCard from './LessonCard';
import TrackArc from './TrackArc';

/** Props of `CourseIndex`. */
export interface CourseIndexProps {
  course: CourseId;
  /** Every published lesson; this component takes its own course's slice. */
  lessons: LessonEntry[];
}

/** `2 modules` / `1 module` — a page that says "1 modules" reads as unfinished. */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The body of one course page.
 *
 * @param props - See `CourseIndexProps`.
 * @returns The course page body.
 */
export default function CourseIndex({
  course,
  lessons,
}: CourseIndexProps): JSX.Element {
  const copy = COURSE_COPY[course];

  const inCourse = lessons.filter((l) => l.data.course === course);
  const byOrder = (a: LessonEntry, b: LessonEntry) =>
    a.data.order - b.data.order;

  // This course's modules in site order, each with its lessons. Headings and
  // blurbs come from `src/lib/tracks.ts`, so this component states no module
  // copy of its own — a rename lands in one place.
  const modules = tracksForCourse(course)
    .map((id) => ({
      id,
      ...TRACK_COPY[id],
      lessons: inCourse.filter((l) => l.data.track === id).sort(byOrder),
    }))
    // A module with no published lesson is ABSENT (SPEC §3: "at every commit a
    // module is either absent or complete"). A promise of future content is a
    // placeholder, and the content validator bans that phrasing outright — so
    // the page simply does not draw a section with nothing in it. Everything
    // that renders here is finished.
    .filter((module) => module.lessons.length > 0);

  // The lesson list the progress module reads — THIS course only, in course
  // order. Injected from the build, never recovered by scanning localStorage
  // keys, which would count lessons that no longer exist and inflate every
  // counter here.
  const lessonRefs: LessonRef[] = inCourse
    .map(({ data }) => ({
      slug: data.slug,
      title: data.title,
      order: data.order,
      track: data.track,
      course: data.course,
    }))
    .sort((a, b) => a.order - b.order);

  // First lesson of the course — the JS-off / nothing-stored resume target.
  const firstLesson = lessonRefs[0];

  const totalMinutes = inCourse.reduce(
    (sum, l) => sum + l.data.estimatedMinutes,
    0,
  );

  // The meta line, assembled here rather than in the markup: interleaving text
  // and separator elements collapses the whitespace around them unpredictably
  // ("1 lessons ·1 modules"), and one joined string cannot get that wrong.
  const meta = [
    plural(inCourse.length, 'lesson'),
    plural(modules.length, 'module'),
    `~${Math.round(totalMinutes / 5) * 5} min`,
    copy.difficulty,
  ].join(' · ');

  // The CTA's server-rendered wording, from the SAME helper the module calls at
  // runtime (with "nothing complete yet" as the only honest build-time
  // assumption), so the fallback and the rewrite can never word a state twice.
  const resumeFallback = firstLesson
    ? resumeLabel(firstLesson, 0, lessonRefs.length)
    : '';

  useClientModule('course-index');

  return (
    <div className="course">
      <header
        className="course__head"
        data-lessons={JSON.stringify(lessonRefs)}
      >
        <p className="course__eyebrow">Course</p>
        <h1>{copy.title}</h1>
        <p className="course__intro">{copy.description}</p>

        <p className="course__meta">{meta}</p>

        {firstLesson && (
          <div className="course__resume">
            <a
              className="btn-primary course__resume-link"
              href={`/learn/${firstLesson.slug}/`}
              data-resume-link=""
            >
              <span data-resume-label="">{resumeFallback}</span>
              <span aria-hidden="true">→</span>
            </a>
            {/* The all-complete state has no honest "next" destination, so the
                CTA steps aside for this line instead of linking somewhere
                arbitrary. Revealed by the module only. */}
            <p className="course__resume-done" data-resume-done="" hidden />
          </div>
        )}

        {/* Prerequisites and outcomes are labelled lists rather than sections:
            the page's `<h2>`s are its modules and nothing else, so the outline a
            screen reader walks is the curriculum itself. Each list is named by
            the span above it, the same `aria-labelledby` pairing the lesson
            header's "Builds on:" row uses. */}
        <div className="course__facts">
          <div className="course__fact">
            <p className="course__fact-label" id="course-prereqs">
              {"You'll need"}
            </p>
            <ul
              className="course__fact-list"
              role="list"
              aria-labelledby="course-prereqs"
            >
              {copy.prerequisites.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="course__fact">
            <p className="course__fact-label" id="course-outcomes">
              By the end you can
            </p>
            <ul
              className="course__fact-list"
              role="list"
              aria-labelledby="course-outcomes"
            >
              {copy.outcomes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </header>

      {modules.map((module, index) => (
        <section
          key={module.id}
          className="course__section"
          aria-labelledby={`track-${module.id}`}
        >
          <div className="course__section-head">
            <div className="course__section-titles">
              <p className="course__section-number">
                {`Module ${String(index + 1).padStart(2, '0')}`}
              </p>
              <h2 id={`track-${module.id}`}>{module.heading}</h2>
              <p className="course__section-blurb">{module.blurb}</p>
            </div>

            {/* Empty until the module fills it: "0 of 5" rendered server-side
                would be a claim about a device the build cannot see. Its SPACE
                is reserved all the same, and every rule about what this block
                says, reserves and hides lives in the component. */}
            <TrackArc track={module.id} />
          </div>

          <ul className="course__grid" role="list">
            {module.lessons.map((lesson) => (
              <li key={lesson.data.slug}>
                <LessonCard
                  slug={lesson.data.slug}
                  order={lesson.data.order}
                  title={lesson.data.title}
                  summary={lesson.data.summary}
                  difficulty={lesson.data.difficulty}
                  estimatedMinutes={lesson.data.estimatedMinutes}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
