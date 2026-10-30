/**
 * Glossary — `/glossary` (spec §6, §8; M5 architecture §1, design §1). Ported
 * from `src/pages/glossary.astro` (React migration P3); CSS in
 * `src/styles/pages/glossary.css`, the filter in the client module
 * `src/client/modules/glossary-filter.ts`.
 *
 * Static apart from the filter (redesign 2026-08, below): the jump bar is native
 * in-page anchors and CSS-only sticky/scroll-margin, so the page is fully usable
 * with JavaScript disabled.
 *
 * Build-time validation (arch §1.3): every glossary `lessonSlug` is checked
 * against the PUBLISHED lessons collection (in `checkCollection()`, before the
 * first page renders); an unknown/unpublished slug throws and FAILS THE BUILD, so a renamed or deleted lesson can never ship a dead cross-link.
 * Lesson titles for the "Introduced in …" links are resolved from the collection
 * (never hardcoded in glossary.ts). M7.2 adds the mirror guard for the other
 * direction: per-term `id`s must be unique and must not clash with a structural id,
 * because lesson prose now hard-links `/glossary/#{term}` (spec §8).
 *
 * Landmarks/headings: BaseLayout owns <header>/<main>/<footer>; this page has one
 * <h1>, an <h2> per present letter, a labelled jump <nav>, and <dl>/<dt>/<dd>
 * definition-list semantics. Empty letters are dimmed AND aria-disabled AND
 * non-links (skipped in Tab order) — structural, never color-only.
 */
import type { JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getLessons } from '../content/lessons';
import BaseLayout from '../layouts/BaseLayout';
import { glossary, termAnchor, type GlossaryTerm } from '../lib/glossary';
import { useClientModule } from '../render/context';

/** A glossary entry enriched with the resolved lesson title (design §1.7). */
interface GlossaryEntry extends GlossaryTerm {
  lessonTitle: string;
}

/**
 * First-letter bucket for a term. Non-alphabetic leads collapse to '#'.
 * SPEC-GAP (arch §1.3): §8 is silent on numerics/symbols; '#' is the simplest
 * correct single bucket. No terms currently fall here, but it is defensive.
 *
 * @param term - A glossary term.
 * @returns Its letter, or `#`.
 */
function bucketOf(term: string): string {
  const first = term.charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

// The 26 letters, each flagged present (has a section) or empty (dimmed chip).
const ALPHABET = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(65 + i),
);

/** Stable, URL-safe fragment id for a letter section ('#' → 'num'). */
const sectionId = (letter: string) =>
  `letter-${letter === '#' ? 'num' : letter.toLowerCase()}`;

/**
 * Per-term anchors (M7.2): every entry is deep-linkable as /glossary#{anchor},
 * and lesson prose hard-links those ids. Two terms slugifying alike would
 * silently make one unreachable and the other's link wrong, so — in the same
 * self-correcting spirit as the dead-link guard — a collision FAILS THE BUILD.
 * Ids already spent on page structure are reserved: a duplicate id is invalid
 * HTML and would break the letter jump bar too.
 *
 * @throws On an empty, reserved or colliding anchor.
 */
function checkAnchors(): void {
  const reservedIds = new Set<string>([
    'top', // the page header sentinel
    'main', // BaseLayout's skip-to-content target
    ...ALPHABET.map(sectionId),
    sectionId('#'),
  ]);
  const anchorOwner = new Map<string, string>();
  for (const term of glossary) {
    const anchor = termAnchor(term.term);
    if (anchor === '') {
      throw new Error(
        `Glossary term "${term.term}" slugifies to an empty anchor id.`,
      );
    }
    if (reservedIds.has(anchor)) {
      throw new Error(
        `Glossary term "${term.term}" slugifies to "#${anchor}", which is reserved by the page structure.`,
      );
    }
    const owner = anchorOwner.get(anchor);
    if (owner !== undefined) {
      throw new Error(
        `Glossary anchor collision: "${owner}" and "${term.term}" both slugify to "#${anchor}".`,
      );
    }
    anchorOwner.set(anchor, term.term);
  }
}

/** The filter form's opening tag, as React renders it. */
const FORM_OPEN = '<form class="glossary__search"';

/**
 * Writes the filter form's one inline handler into the rendered markup. The
 * form is the one element on the site that needs an inline handler attribute —
 * `onsubmit="return false"`, so Enter in the field never reloads the page — and
 * React does not render string event-handler attributes. So the page body
 * renders to a string and the attribute is written into the form's opening tag;
 * nothing else is touched, and a markup change that moves the tag fails the
 * build rather than shipping a form that submits.
 *
 * @param html - The rendered page body.
 * @returns The body with the handler in place.
 * @throws When the form's opening tag is not found exactly once.
 */
function withSubmitGuard(html: string): string {
  const parts = html.split(FORM_OPEN);
  if (parts.length > 2) {
    throw new Error('Glossary: more than one filter form rendered.');
  }
  if (parts.length === 1) return html; // the empty glossary renders no form
  return parts.join(`<form onsubmit="return false" class="glossary__search"`);
}

/**
 * The glossary page.
 *
 * @returns The page body.
 */
export default function Glossary(): JSX.Element {
  useClientModule('glossary-filter');
  checkAnchors();

  // slug → title lookup. Every `lessonSlug` resolves: `checkCollection()`
  // fails the build on a dead cross-link before any page renders.
  const titleBySlug = new Map(
    getLessons().map((l) => [l.data.slug, l.data.title]),
  );

  // Sort A–Z case-insensitively by term (arch §1.3 step 2).
  const sorted: GlossaryEntry[] = [...glossary]
    .map((t) => ({ ...t, lessonTitle: titleBySlug.get(t.lessonSlug) ?? '' }))
    .sort((a, b) =>
      a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }),
    );

  // Group into present buckets only (empty letters render NO section — design
  // §1.2).
  const groups = new Map<string, GlossaryEntry[]>();
  for (const entry of sorted) {
    const letter = bucketOf(entry.term);
    const list = groups.get(letter) ?? [];
    list.push(entry);
    groups.set(letter, list);
  }
  const presentLetters = new Set(groups.keys());

  // Ordered list of present sections (A→Z; the '#' bucket, if ever used, leads).
  const sections = ALPHABET.filter((l) => presentLetters.has(l))
    .concat(presentLetters.has('#') ? ['#'] : [])
    .map((letter) => ({ letter, entries: groups.get(letter) ?? [] }));

  const body = (
    <>
      <header id="top" className="glossary__head">
        <h1>Glossary</h1>
        <p className="glossary__intro">
          Every term the lessons introduce, defined in one or two sentences and
          linked back to where you first meet it.
        </p>
      </header>

      {sections.length === 0 ? (
        <p className="glossary__empty">
          The glossary is being written — check back soon.
        </p>
      ) : (
        <>
          {/* FILTER (redesign 2026-08). Spec §19 left this open as an owner
                decision — "Glossary search island (~1 KB)" — and forty-six
                terms down a 10,000px page is exactly the case it was left open
                for: the A–Z chips answer "take me to L", and nothing answered
                "where is the thing I half-remember the name of".

                It filters what is already on the page; it fetches nothing,
                indexes nothing and stores nothing. It ships `hidden` and the
                module reveals it, because a text field that cannot filter is
                worse than no field — the same rule every M8 control follows.
                With JavaScript off the complete A–Z list and its jump nav are
                untouched. */}
          <form
            className="glossary__search"
            data-glossary-search=""
            hidden
            role="search"
          >
            <label className="glossary__search-label" htmlFor="glossary-filter">
              Filter terms
            </label>
            <div className="glossary__search-field">
              <svg
                className="glossary__search-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                id="glossary-filter"
                type="search"
                className="glossary__search-input"
                placeholder="hash, traversal, O(n)…"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-glossary-input=""
              />
              <button
                type="button"
                className="glossary__search-clear"
                data-glossary-clear=""
                hidden
              >
                Clear
              </button>
            </div>
            {/* Polite, not assertive: the reader is typing, and an assertive region
                  would interrupt them on every keystroke. Empty until a filter is
                  actually applied, so it never announces the resting state of the
                  page. */}
            <p
              className="glossary__search-status"
              role="status"
              data-glossary-status=""
            />
          </form>

          <nav
            className="glossary__jump"
            aria-label="Jump to letter"
            data-glossary-jump=""
          >
            <ul>
              {ALPHABET.map((letter) =>
                presentLetters.has(letter) ? (
                  <li key={letter}>
                    <a
                      className="glossary__chip"
                      href={`#${sectionId(letter)}`}
                    >
                      {letter}
                    </a>
                  </li>
                ) : (
                  <li key={letter}>
                    <span
                      className="glossary__chip glossary__chip--empty"
                      aria-disabled="true"
                    >
                      {letter}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </nav>

          <p className="glossary__no-match" data-glossary-nomatch="" hidden />

          <div className="glossary__sections">
            {sections.map(({ letter, entries }) => (
              <section
                key={letter}
                id={sectionId(letter)}
                data-glossary-section=""
                aria-labelledby={`${sectionId(letter)}-h`}
              >
                <h2 id={`${sectionId(letter)}-h`} className="glossary__letter">
                  {letter}
                </h2>
                <dl className="glossary__list">
                  {entries.map((entry) => (
                    <div
                      key={entry.term}
                      className="glossary__entry"
                      id={termAnchor(entry.term)}
                      data-glossary-entry=""
                      data-haystack={[
                        entry.term,
                        ...(entry.aliases ?? []),
                        entry.definition,
                      ]
                        .join(' ')
                        .toLowerCase()}
                    >
                      <dt className="glossary__term">{entry.term}</dt>
                      <dd className="glossary__def">
                        <p>{entry.definition}</p>
                        {entry.aliases && entry.aliases.length > 0 && (
                          <p className="glossary__aliases">
                            {`Also called: ${entry.aliases.join(', ')}`}
                          </p>
                        )}
                        <p className="glossary__xref-line">
                          <a
                            className="glossary__xref"
                            href={`/learn/${entry.lessonSlug}/`}
                          >
                            {`Introduced in ${entry.lessonTitle} `}
                            <span aria-hidden="true">→</span>
                          </a>
                        </p>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );

  return (
    <BaseLayout
      title="Glossary · LearnDSA"
      description="A–Z reference of the data-structure and algorithm terms used across LearnDSA, each linked to the lesson that introduces it."
      canonicalPath="/glossary/"
    >
      <div
        className="glossary"
        dangerouslySetInnerHTML={{
          __html: withSubmitGuard(renderToStaticMarkup(body)),
        }}
      />
    </BaseLayout>
  );
}
