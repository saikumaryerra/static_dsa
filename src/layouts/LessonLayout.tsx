/**
 * LessonLayout — wraps a rendered lesson's MDX body (design §1, site spec §8).
 * Ported from `LessonLayout.astro` (React migration P2); its CSS lives in
 * `src/styles/layouts/lesson.css` and its three scripts are the client modules
 * `toc`, `lesson-stage` and `learning-days` (`src/client/modules/`).
 *
 * Props:
 * - `title`, `summary`, `difficulty`, `track`, `estimatedMinutes` — frontmatter.
 * - `slug`            for MarkComplete's persistence key.
 * - `readingMinutes`  computed prose reading time (design §1.4).
 * - `headings`        the lesson's `LessonHeading[]` → TableOfContents (h2 only).
 * - `prev` / `next`   adjacent lessons in global order (or null at a boundary).
 * - `prerequisites`   frontmatter `prerequisites`, resolved to titles at build
 *                     time and referentially validated in `checkCollection()`.
 * - `lessons`         every published lesson, forwarded to MarkComplete's
 *                     "N of 15 complete" line.
 *
 * Composes inside BaseLayout's `<main>`. Layout: breadcrumb, header (h1 +
 * summary + meta row + "Builds on:" row), responsive ToC, the 7-section MDX slot
 * (prose capped at --measure, full-column breakout for viz/code/table), and the
 * "What's next" section that closes the loop (completion + prev/next).
 *
 * M8.1 adds the reader's current stage to the meta row — the same `MasteryPips`
 * the curriculum cards use, painted by the `lesson-stage` module from
 * `src/lib/progress.ts`. It is a derived display of what MarkComplete
 * and PracticeCheck already store: no new key, no new store, and nothing
 * rendered at all when there is nothing recorded.
 *
 * M8.3 adds two things at this level, both because the lesson SHELL is where they
 * belong and neither because a section was invented for them:
 * - `ExplainBack`, mounted after "What's next" for the lessons whose frontmatter
 *   authors an `explainPrompt` (spec §7). It titles itself and renders nothing
 *   until the reader marks the lesson complete, so no heading, no ToC entry and
 *   no layout above the completion button depends on it.
 * - The learning-days recording (the `learning-days` module). It is here for
 *   the same reason the stage painter is: this is the one place that already
 *   observes every explicit learning act a lesson page can produce.
 */
import type { JSX, ReactNode } from 'react';
import Breadcrumb from '../components/Breadcrumb';
import DifficultyChip from '../components/DifficultyChip';
import ExplainBack from '../components/ExplainBack';
import MasteryPips from '../components/MasteryPips';
import TableOfContents from '../components/TableOfContents';
import WhatsNext from '../components/WhatsNext';
import type { Adjacent } from '../components/PrevNext';
import type { LessonEntry, LessonHeading } from '../content/lessons';
import type { CourseId } from '../lib/courses';
import type { LessonRef } from '../lib/progress';
import { courseJsonLd } from '../lib/structured-data';
import type { Track } from '../lib/tracks';
import { useClientModule, useRenderContext } from '../render/context';
import BaseLayout from './BaseLayout';

/** A prerequisite lesson, resolved from a frontmatter slug at build time. */
export interface Prerequisite {
  slug: string;
  title: string;
}

/** Props of `LessonLayout`. */
export interface LessonLayoutProps {
  entry: LessonEntry;
  title: string;
  summary: string;
  difficulty: 'beginner' | 'intermediate';
  track: Track;
  /** The course this lesson belongs to — the breadcrumb's middle crumb. */
  course: CourseId;
  estimatedMinutes: number;
  readingMinutes: number;
  slug: string;
  headings: LessonHeading[];
  prerequisites: Prerequisite[];
  lessons: LessonRef[];
  prev: Adjacent | null;
  next: Adjacent | null;
  /** The rendered MDX body. */
  children?: ReactNode;
}

/**
 * Asks for the layout's own three client modules. Rendered LAST, after the
 * article, because Astro emitted a layout's scripts after everything its slot
 * rendered: the modules then load in the legacy order (component scripts
 * first), so document-level listeners keep their legacy registration order.
 *
 * @returns Nothing.
 */
function LayoutModules(): null {
  useClientModule('toc');
  useClientModule('lesson-stage');
  useClientModule('learning-days');
  return null;
}

/**
 * The 16px stroke icon the meta row uses.
 *
 * @param props - The icon's shapes.
 * @returns The SVG.
 */
function MetaIcon({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * One lesson page.
 *
 * @param props - See `LessonLayoutProps`.
 * @returns The page body.
 */
export default function LessonLayout({
  entry,
  title,
  summary,
  difficulty,
  track,
  course,
  estimatedMinutes,
  readingMinutes,
  slug,
  headings,
  prerequisites,
  lessons,
  prev,
  next,
  children,
}: LessonLayoutProps): JSX.Element {
  const { site } = useRenderContext();

  // Course JSON-LD (arch §3.1), built at build time; `Document` emits it as
  // static text in the head with zero client JS.
  const jsonLd = courseJsonLd(entry, site);

  // M8.3: the lesson's own "why does this work?" question, read off the entry
  // this layout already receives rather than threaded through `LessonPage` as a
  // tenth prop. Optional per lesson (spec §7) — a lesson without one renders no
  // component at all, not an empty one.
  const explainPrompt = entry.data.explainPrompt;

  return (
    <BaseLayout
      title={`${title} · LearnDSA`}
      description={summary}
      canonicalPath={`/learn/${slug}/`}
      ogType="article"
      jsonLd={jsonLd}
      wide
    >
      <div className="lesson">
        <div className="lesson__grid">
          <article className="lesson__article">
            <Breadcrumb course={course} track={track} title={title} />

            <header className="lesson__header">
              <h1>{title}</h1>
              <p className="lesson__summary">{summary}</p>
              <div className="lesson__meta">
                <DifficultyChip difficulty={difficulty} />
                <span aria-hidden="true" className="lesson__dot">
                  ·
                </span>
                <span className="lesson__meta-item">
                  <MetaIcon>
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M12 7v5l3 2"></path>
                  </MetaIcon>
                  {`${estimatedMinutes} min lesson`}
                </span>
                {/* The reading estimate, shown ONLY when it is smaller than the
                    lesson estimate — because the pair means "the whole lesson
                    takes N, of which M is reading", and that sentence is only
                    informative when M < N.

                    The course expansion is what made the guard necessary. Every
                    lesson used to carry a visualization, so the doing time was
                    always real and the two numbers always differed (binary
                    search still reads "10 min lesson · 7 min read"). A prose
                    lesson has no visualization, so the two computations
                    converge: 46 of 127 lessons rendered the same number twice,
                    and 14 rendered a READING time longer than the lesson time
                    that is supposed to contain it — a header contradicting
                    itself.

                    The rejected alternative was to redefine `estimatedMinutes`
                    as `readingMinutes + 2..5` and re-derive it for every lesson.
                    It was measured: 93 of 112 lessons would have been restated
                    2-3 minutes longer, inflating every course total, to satisfy
                    a formula rather than a judgement about how long a lesson
                    takes. Suppressing a duplicate is the smaller and truer
                    change. */}
                {readingMinutes < estimatedMinutes && (
                  <>
                    <span aria-hidden="true" className="lesson__dot">
                      ·
                    </span>
                    <span className="lesson__meta-item">
                      <MetaIcon>
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </MetaIcon>
                      {`${readingMinutes} min read`}
                    </span>
                  </>
                )}

                {/* Where this lesson stands, in the one progress currency
                    (M8.1). It rides at the END of the meta row so appearing
                    appends rather than pushing the reading estimates sideways,
                    and the separator lives INSIDE the wrapper so a lesson with
                    nothing recorded never shows a dangling "·". Hidden until the
                    `lesson-stage` module resolves a stage — with JS off, or with
                    storage blocked, the header is exactly what M7 rendered. */}
                <span className="lesson__stage" data-lesson-stage="" hidden>
                  <span aria-hidden="true" className="lesson__dot">
                    ·
                  </span>
                  <MasteryPips slug={slug} />
                </span>
              </div>

              {prerequisites.length > 0 && (
                <div className="lesson__prereqs">
                  <span className="lesson__prereqs-label" id="builds-on">
                    Builds on:
                  </span>
                  {/* role="list" because `list-style: none` strips list
                      semantics in Safari; same guard /learn uses on its card
                      grid. */}
                  <ul
                    className="lesson__prereq-list"
                    role="list"
                    aria-labelledby="builds-on"
                  >
                    {prerequisites.map((p) => (
                      <li key={p.slug}>
                        <a
                          className="lesson__prereq"
                          href={`/learn/${p.slug}/`}
                        >
                          {p.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </header>

            <TableOfContents headings={headings} variant="inline" />

            <hr className="lesson__rule" />

            <div className="lesson-body">{children}</div>

            <hr className="lesson__rule lesson__rule--wide" />

            <WhatsNext
              slug={slug}
              lessons={lessons}
              prev={prev}
              next={next}
              course={course}
            />

            {/* The note sits AFTER that section, not inside it: it appears on
                the click that marks the lesson complete, and appearing above
                that button would move it out from under the reader's cursor the
                moment they press it. Below, nothing already on screen shifts. */}
            {explainPrompt && (
              <ExplainBack slug={slug} prompt={explainPrompt} />
            )}
          </article>
        </div>
      </div>
      <LayoutModules />
    </BaseLayout>
  );
}
