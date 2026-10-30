/**
 * About — `/about` (spec §6, §8; M5 design §2). Ported from
 * `src/pages/about.astro` (React migration P3); CSS in
 * `src/styles/pages/about.css` (with the scope audit's fixes #2–#4).
 *
 * A single readable column (capped at --measure): what LearnDSA is, who it's for,
 * and — in plain language, not §11 jargon — how the visualizations work, closing
 * with one live, trimmed Binary Search demo (tell-then-show on a meta page).
 *
 * The demo is the ONLY island on the page (`allowCustomInput` and `showMetrics`
 * off). With JS disabled it degrades to the Visualizer's static still + "enable JS"
 * note, so the page stays informative offline/JS-off.
 *
 * Design §2.4 asked for "client:visible"; the Visualizer is a React island whose
 * registry entry activates it when it scrolls into view, so lessons and this page
 * embed it the same bare way and the viz chunks load lazily on first view.
 *
 * Landmarks/headings: BaseLayout owns the landmarks; one <h1>, three <h2>s in
 * reading order.
 */
import type { JSX } from 'react';
import Callout from '../components/Callout';
import BaseLayout from '../layouts/BaseLayout';
import Visualizer from '../viz/Visualizer';

/** "Who it's for" audiences — a compact list (design §2.2), not cards. */
const audiences: { who: string; detail: string }[] = [
  {
    who: 'Beginners',
    detail:
      'meeting data structures for the first time and wanting to see, not just read, how they behave.',
  },
  {
    who: 'Self-taught developers',
    detail:
      'filling the gaps a project-first path leaves behind, one topic at a time.',
  },
  {
    who: 'Interview-preppers',
    detail:
      'refreshing the classics and rebuilding intuition for how each algorithm actually runs.',
  },
];

/**
 * The about page.
 *
 * @returns The page body.
 */
export default function About(): JSX.Element {
  return (
    <BaseLayout
      title="About · LearnDSA"
      description="What LearnDSA is, who it's for, and how the interactive visualizations work."
      canonicalPath="/about/"
    >
      <div className="about">
        <header className="about__head">
          <h1>About LearnDSA</h1>
          <p className="about__lede">
            LearnDSA makes data structures and algorithms visible: every lesson
            is built around a visualization you can step through and run on your
            own input.
          </p>
        </header>

        <hr className="about__rule" />

        <section className="about__section" aria-labelledby="what">
          <h2 id="what">What this is</h2>
          <p>
            LearnDSA is a free, static website — no accounts, no paywall, no
            tracking. Around fifteen self-contained lessons cover the core of
            computer science, from Big-O and arrays through sorting and graph
            traversal.
          </p>
          <p>
            Everything runs in your browser. There is no backend and no network
            calls once a page has loaded, so a lesson keeps working offline and
            your progress stays on your own device.
          </p>
        </section>

        <section className="about__section" aria-labelledby="who">
          <h2 id="who">{"Who it's for"}</h2>
          <ul className="about__audience">
            {audiences.map((a) => (
              <li key={a.who}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="about__audience-icon"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>
                  <strong>{a.who}</strong> {a.detail}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="about__section" aria-labelledby="how">
          <h2 id="how">How the visualizations work</h2>
          <p>
            Each lesson runs the real algorithm once and records every
            meaningful moment — each comparison, swap, or pointer move — as a
            list of steps.
            {
              " You're not watching a video; you're scrubbing through that list."
            }
          </p>
          <p>
            Play advances it, Step moves one operation forward or back, and
            Custom input re-runs it on numbers you type. In the lessons that
            same recorded list is also written out as a table under the drawing,
            one row per step — close enough to the prose that a sentence can
            link straight to the step it is talking about. Because every step is
            recorded up front, stepping backward is instant and nothing is
            faked.
          </p>

          <Callout variant="tip">
            <p className="about__callout-title">How to read a visualization</p>
            <ul className="about__controls">
              <li>
                <strong>Play / Pause</strong>
                {' — run the steps automatically, then stop.'}
              </li>
              <li>
                <strong>Step ±</strong>
                {' — move exactly one operation forward or back.'}
              </li>
              {/* "click any row" became true only when the island gained its
                  seek wiring. Until it did, this bullet deliberately stopped at
                  "read": the rows were server-rendered and inert, and
                  advertising a control that does nothing is worse than
                  describing less than there is. */}
              <li>
                <strong>The run, written out</strong>
                {
                  ' — in a lesson, open the table under the drawing to read every step of the run at once, and click any row to send the drawing to that step.'
                }
              </li>
              <li>
                <strong>Scrub</strong>
                {
                  ' — tab to the step slider, which appears when it takes focus, and use the arrow keys, '
                }
                <kbd>Home</kbd> and <kbd>End</kbd>.
              </li>
              <li>
                <strong>Custom input</strong>
                {' — re-run the algorithm on your own values.'}
              </li>
            </ul>
          </Callout>

          <figure className="about__demo">
            {/* `showLedger={false}`: this is a demonstration of the CHROME, not
                a lesson, so the run written out belongs where there is an
                algorithm to learn — and the page's own callout above says "in a
                lesson" for that reason. `showMetrics={false}` is the older half
                of the same decision, and the ledger's cost column inherits it,
                so the two can never contradict each other. */}
            <Visualizer
              algorithm="binary-search"
              renderer="array"
              input="[1,3,5,7,9,11] target=7"
              allowCustomInput={false}
              showMetrics={false}
              showLedger={false}
            />
            <figcaption className="about__figcaption">
              A live example — the same Binary Search visualization used in the
              lessons. Press Play, or step through one comparison at a time.
            </figcaption>
          </figure>
        </section>

        <hr className="about__rule" />

        <p className="about__cta">
          Ready to start?{' '}
          <a href="/learn/" className="btn-primary">
            Browse the lessons
          </a>
        </p>
      </div>
    </BaseLayout>
  );
}
