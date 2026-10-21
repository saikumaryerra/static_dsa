/**
 * Home page (site spec §8, M1 wireframe, M5 design §3, M7.3 hero — rebuilt in the
 * 2026-08 redesign). Ported from `src/pages/index.astro` (React migration P3);
 * CSS in `src/styles/pages/home.css`, the continue line in the client module
 * `src/client/modules/home-resume.ts`.
 *
 * WHAT CHANGED AND WHY. The page used to open with a still: a frozen frame of
 * binary search, produced by the real renderer so it could never drift, with
 * "Play it in the lesson →" underneath. It was honest and it was the wrong
 * artifact. A product whose entire claim is *you can step through this* opened
 * by showing a photograph of stepping through it, and asked the visitor to
 * navigate twice before the claim could be checked. The hero now mounts the REAL
 * instrument — the same `<Visualizer>` island a lesson uses, on the same trace —
 * so the first thing a stranger can do on this site is press Play.
 *
 * That deleted about 130 lines from this file: the `renderStatic` call, the
 * frame-picking derivation, the build-time assertion that the renderer still
 * emits nine class names, and the ~110 lines of `.hero-demo__canvas :global(…)`
 * CSS that restated the renderer's stylesheet because the still was drawn
 * outside the island that owns it. All of it existed to keep a hand-placed copy
 * of the product in step with the product. Mounting the product needs none of it.
 *
 * Sections, each with one job:
 *   hero        what this is + the thing itself, running
 *   lesson      what a lesson gives you, described in terms of the hero above it
 *   curriculum  every lesson, by track — the scope of the thing, and 15 doors in
 *   candour     what it costs and what it takes from you (both nothing)
 *   close       one last way in
 *
 * The track counts, minutes, difficulty spread and the lesson lists are all
 * DERIVED from the published collection (M5 design §3.5), so they can never
 * drift from the real curriculum. Nothing on this page is fabricated: there are
 * no testimonials, ratings, user counts or logos, because the product has never
 * been publicly measured and inventing one would be the worst thing this page
 * could do (PRODUCT.md, "Evidence on Hand").
 */
import type { JSX } from 'react';
import { getLessons, type LessonEntry } from '../content/lessons';
import BaseLayout from '../layouts/BaseLayout';
import { COURSE_COPY, COURSE_ORDER, coursePath } from '../lib/courses';
import { resumeLabel, type LessonRef } from '../lib/progress';
import { webSiteJsonLd } from '../lib/structured-data';
import { TRACK_COPY, tracksForCourse } from '../lib/tracks';
import { useClientModule, useRenderContext } from '../render/context';
import Visualizer from '../viz/Visualizer';

/**
 * What one lesson actually gives a reader. Three claims, each about something
 * visible in the hero instrument directly above them rather than about the
 * product in the abstract — "step forward and back" is a button they can already
 * see, and "the run written out as a table" is the table under the drawing.
 */
const promises = [
  {
    title: 'Step it, forwards and back',
    body: 'The drawing above is not an animation. An instrumented algorithm ran once and recorded every step, so the player is just an index into that record — which is why stepping backwards is instant, and why it is always the truth.',
  },
  {
    title: 'Read the same run as a table',
    body: 'Under every drawing is the run written out, one row per step, with the algorithm’s own variables as columns. Two views of one trace: they cannot tell you different stories, and with JavaScript off the table is the lesson.',
  },
  {
    title: 'Run it on your own numbers',
    body: 'Type an array and press Run. The algorithm executes on your input for real and the drawing, the table and the step count all follow — no canned second example, nothing pre-recorded.',
  },
];

/**
 * Human-readable difficulty spread for a course's lessons (M5 design §3.5) — e.g.
 * "8 beginner · 1 intermediate" or "All beginner". Difficulty as words (never a
 * color-only chip) keeps it accessible (§3.8, WCAG 1.4.1).
 *
 * @param lessons - One course's lessons.
 * @returns The spread line.
 */
function difficultySpread(lessons: LessonEntry[]): string {
  const counts = { beginner: 0, intermediate: 0 };
  for (const l of lessons) counts[l.data.difficulty]++;
  const parts = (['beginner', 'intermediate'] as const)
    .filter((d) => counts[d] > 0)
    .map((d) => `${counts[d]} ${d}`);
  // A single-difficulty course reads "All beginner" rather than "9 beginner".
  return parts.length === 1
    ? `All ${(parts[0] ?? '').split(' ')[1] ?? ''}`
    : parts.join(' · ');
}

/** Two-digit lesson number, matching the curriculum cards. */
const num = (order: number) => String(order).padStart(2, '0');

/** `2 lessons` / `1 lesson` — a landing page that says "1 lessons" reads as unfinished. */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Asks for the page's own module last: Astro emitted a page's script after
 * every component script it rendered.
 *
 * @returns Nothing.
 */
function PageModule(): null {
  useClientModule('home-resume');
  return null;
}

/**
 * The home page.
 *
 * @returns The page body.
 */
export default function Home(): JSX.Element {
  const { site } = useRenderContext();
  const published = getLessons();
  const totalLessons = published.length;

  /**
   * The courses with their real contents. The home page used to show a paragraph
   * *about* each track; it then showed all fifteen lessons, because a visitor
   * deciding whether this site covers what they came for should not have to take a
   * summary's word for it.
   *
   * Course expansion (decision D-05): it names the MODULES now, not every lesson.
   * The same argument still holds — the reader sees the real contents — but a
   * hundred-odd lesson links on a landing page is a directory, not an answer, and
   * a module title says what a group of four lessons covers in one line. The
   * lessons themselves are one click away on the course page.
   */
  const courses = COURSE_ORDER.map((id) => {
    const lessons = published.filter((l) => l.data.course === id);
    const minutes = lessons.reduce(
      (sum, l) => sum + l.data.estimatedMinutes,
      0,
    );
    const modules = tracksForCourse(id)
      .map((track) => ({
        id: track,
        heading: TRACK_COPY[track].heading,
        count: lessons.filter((l) => l.data.track === track).length,
      }))
      // An empty module is a plan, not something to advertise.
      .filter((module) => module.count > 0);
    return {
      id,
      ...COURSE_COPY[id],
      modules,
      count: lessons.length,
      totalMinutes: Math.round(minutes / 5) * 5,
      spread: difficultySpread(lessons),
    };
  });

  // The lesson list the hero's continue line reads (M7.2 progress system), in
  // global order. Injected from the BUILD as JSON — localStorage is never
  // enumerated by prefix, so a renamed or unpublished lesson can never leave a
  // stale key that points the reader at a 404.
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

  // First lesson in catalogue order — the JS-off / nothing-stored destination.
  const firstLesson = lessonRefs[0];

  // The continue line's server-rendered wording, from the same helper the
  // module calls at runtime (with "nothing complete yet" as the only honest
  // build-time assumption) so the two can never word the same state
  // differently.
  const resumeFallback = firstLesson
    ? resumeLabel(firstLesson, 0, lessonRefs.length)
    : '';

  return (
    <BaseLayout
      title="LearnDSA — algorithms, Kubernetes and system design, one step at a time"
      description="Free, interactive engineering courses. Step through algorithms on your own input, then learn the systems they run inside: Kubernetes from fundamentals to production, and system design from principles to real architectures."
      canonicalPath="/"
      jsonLd={webSiteJsonLd(site)}
      wide
    >
      {/* Hero: copy left, the real instrument right from 1024px; stacked below
          it. Left-aligned per wireframe (a centred rag breaks with longer
          strings). */}
      <section className="hero">
        <div className="hero__copy">
          <h1 className="hero__title">See how the machine actually works</h1>
          <p className="hero__lede">
            {`${courses.length} free courses — data structures and algorithms, Kubernetes, and system design. The algorithms run in your browser, one step at a time, on your own input. The rest is taught the same way: one idea per lesson, with a real manifest, a worked estimate or a diagram you can read.`}
          </p>
          <div className="hero__actions">
            <a
              href={firstLesson ? `/learn/${firstLesson.slug}/` : '/learn/'}
              className="btn-primary"
            >
              Start with lesson 01
            </a>
            {/* Secondary stays a TEXT link (one clear primary); min-height 44px
                + inline-flex aligns it to the button's baseline on the shared
                row (M5 design §3.3). Arrow in its own span so translations never
                bake it into the label. */}
            <a href="/learn/" className="hero__secondary">
              {`Browse all ${courses.length} courses `}
              <span aria-hidden="true">→</span>
            </a>
          </div>

          {/* Continue line (M7.2, amended by the redesign). It used to ship
              VISIBLE and server-rendered pointing at lesson 01, so a JS-off
              reader still had a true link. The primary CTA above now says
              exactly that — "Start with lesson 01" — so on a first visit the
              two said the same thing twice, one under the other. A returning
              reader is the only person this line has anything to tell, so it
              ships `hidden` and the module reveals it only once it can see at
              least one completed lesson on this device.

              Nothing is lost with JavaScript off or with storage blocked: the
              line stays hidden and the CTA above is the same destination it
              would have offered. The server-rendered text is still the real
              wording from `resumeLabel`, so the reveal cannot flash a different
              sentence. */}
          {firstLesson && (
            <p
              className="hero__resume"
              data-lessons={JSON.stringify(lessonRefs)}
              data-resume-root=""
              hidden
            >
              <a
                href={`/learn/${firstLesson.slug}/`}
                className="hero__resume-link"
                data-resume-link=""
              >
                <span data-resume-label="">{resumeFallback}</span>
                <span aria-hidden="true">→</span>
              </a>
              {/* All-complete state: no honest "next" destination, so the link
                  stands down for a plain line. Revealed by the module only. */}
              <span data-resume-done="" hidden />
            </p>
          )}
        </div>

        {/* THE PRODUCT, NOT A PICTURE OF IT. This is the same island, algorithm
            and renderer the binary-search lesson mounts, so nothing here can
            drift from what a lesson does — it is not "kept in sync", it is the
            same code.

            Two props are set against their defaults.
            `allowCustomInput={false}`: the custom-input form is the one control
            that needs its own explanation (formats, caps, a target field), and
            the hero's job is to get a stranger to press Play, not to teach an
            input grammar — the lesson two clicks away does that, and the third
            promise below says so in words. `showLedger` stays on, because the
            table under the drawing IS the argument this page is making. */}
        <div className="hero__stage">
          <Visualizer
            algorithm="binary-search"
            renderer="array"
            input="[1,3,5,7,9,11] target=7"
            allowCustomInput={false}
          />
          <p className="hero__stage-note">
            The real lesson visualization, running here.{' '}
            <a href="/learn/binary-search/">
              Open the lesson <span aria-hidden="true">→</span>
            </a>
          </p>
        </div>
      </section>

      {/* What a lesson gives you. Borderless and whitespace-separated
          (editorial, not dashboard), and each claim is about the instrument
          directly above. Scoped to the algorithms course in its heading since
          the course expansion: all three claims are about the instrument, and
          the Kubernetes and System Design lessons do not mount one.
          Overclaiming here would have been the cheapest way to make the new
          courses sound like something they are not. */}
      <section className="promises" aria-labelledby="promises-heading">
        <h2 id="promises-heading" className="section-heading">
          What an algorithms lesson actually does
        </h2>
        <div className="promises__grid">
          {promises.map((promise) => (
            <div key={promise.title} className="promise">
              <h3 className="promise__title">{promise.title}</h3>
              <p className="promise__body">{promise.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The curriculum itself: every course, with its modules named and
          linked. */}
      <section className="curriculum" aria-labelledby="curriculum-heading">
        <div className="curriculum__head">
          <h2 id="curriculum-heading" className="section-heading">
            {`${totalLessons} lessons, ${courses.length} courses`}
          </h2>
          <p className="curriculum__intro">
            Work through a course in order, or start at whichever topic you came
            for — nothing is locked, and every lesson names what it builds on.
            Kubernetes and System Design are prose and diagrams rather than
            instruments: one idea per lesson, each with something you could
            actually apply, run or estimate.
          </p>
        </div>
        <div className="curriculum__courses">
          {courses.map((course) => (
            <div key={course.id} className="course-block">
              <h3 className="course-block__title">
                <a href={coursePath(course.id)}>{course.title}</a>
              </h3>
              <p className="course-block__meta tabular-nums">
                {`${plural(course.count, 'lesson')} · ~${course.totalMinutes} min · ${course.spread}`}
              </p>
              <ol className="course-block__list" role="list">
                {course.modules.map((module, index) => (
                  <li key={module.id}>
                    <a
                      href={`${coursePath(course.id)}#track-${module.id}`}
                      className="course-block__item"
                    >
                      <span
                        className="course-block__num tabular-nums"
                        aria-hidden="true"
                      >
                        {num(index + 1)}
                      </span>
                      <span className="course-block__name">
                        {module.heading}
                      </span>
                      <span className="course-block__mins tabular-nums">
                        {plural(module.count, 'lesson')}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* Candour. These are the product's own non-promises, stated plainly
          rather than buried — PRODUCT.md calls that candour part of the
          identity, and it is also the honest answer to "what is the catch".
          Nothing here is a claim about popularity or quality, because there is
          no evidence for one. */}
      <section className="candour" aria-labelledby="candour-heading">
        <h2 id="candour-heading" className="section-heading">
          What it costs you
        </h2>
        <dl className="candour__list">
          <div>
            <dt>No account, no paywall</dt>
            <dd>
              Every lesson is open on the first visit. There is nothing to sign
              up for, because there is no server to sign up to.
            </dd>
          </div>
          <div>
            <dt>No tracking, no cookies</dt>
            <dd>
              Nothing is measured and nothing is sent anywhere. The site makes
              no network calls at all once a page has loaded.
            </dd>
          </div>
          <div>
            <dt>Progress stays on this device</dt>
            <dd>
              What you finish is remembered in this browser only — never synced,
              never uploaded. Clearing your browser data clears it.
            </dd>
          </div>
          <div>
            <dt>Works offline, and without JavaScript</dt>
            <dd>
              A loaded lesson keeps working with no connection. With scripts
              blocked the prose, the code and the written-out run are all still
              there.
            </dd>
          </div>
        </dl>
      </section>

      <section className="close">
        <h2 className="close__title">
          Start where the rest of it builds from.
        </h2>
        {firstLesson && (
          <a href={`/learn/${firstLesson.slug}/`} className="btn-primary">
            {`Begin: ${num(firstLesson.order)} · ${firstLesson.title}`}
          </a>
        )}
      </section>
      <PageModule />
    </BaseLayout>
  );
}
