/**
 * Reading-time estimator for lesson prose (design §1.4).
 *
 * Distinct from the author's `estimatedMinutes` frontmatter (which includes
 * playing with the visualization); this is a pure word-count estimate of the
 * prose alone at 200 wpm. Small, dependency-free, unit-tested.
 *
 * "Prose alone" now means it, which it did not before the course expansion.
 * The input is a raw MDX body, so it arrives carrying three things nobody
 * reads: the `import` block at the top of every lesson, the component tags the
 * prose is wrapped in, and the `{expression}` braces inside them. On a
 * visualization lesson those are a handful of tokens and the rounding absorbs
 * them. On a prose lesson with three `<PracticeCheck slug={frontmatter.slug}
 * index={1} total={3}>` disclosures they were worth a whole minute, which is
 * how 19 of 127 lesson headers came to claim a READING time longer than the
 * lesson time that is supposed to contain it. Stripping them is the fix; the
 * numbers move down by 0-2 minutes on lessons that carry components, and the
 * self-contradiction goes away.
 */

/** Average adult reading speed used for the estimate (words per minute). */
const WORDS_PER_MINUTE = 200;

/**
 * Estimates reading time in minutes for a body of prose.
 *
 * Fenced (```) and inline (`` ` ``) code is stripped first so code samples don't
 * inflate the estimate (design §1.4), then the MDX scaffolding the body arrives
 * wrapped in — `import`/`export` lines, component and HTML tags, and
 * `{expression}` braces — because none of it is read. Words are
 * whitespace-delimited runs. The result is `Math.max(1, Math.round(words /
 * 200))`, so any non-empty prose reads as at least "1 min".
 *
 * @param source - Raw lesson text (MDX/Markdown body).
 * @returns Whole-minute reading-time estimate (≥ 1).
 */
export function readingTimeMinutes(source: string): number {
  // Order matters: fences first (they can contain backticks, braces and tags
  // that every later pattern would otherwise mangle), then inline spans, then
  // the MDX scaffolding, and only then the words.
  const prose = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    // ESM at the top of an MDX file. Anchored to the line so a sentence about
    // importing something survives.
    .replace(/^[ \t]*(?:import|export)\s[^\n]*$/gm, ' ')
    // Component and HTML tags, opening, closing and self-closing. The tag NAME
    // and its attributes are markup; the text between two tags is prose and is
    // deliberately left alone.
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    // What is left of an MDX expression, e.g. a bare {frontmatter.slug}.
    .replace(/\{[^{}]*\}/g, ' ');

  const words = prose.split(/\s+/).filter((token) => token.length > 0);
  if (words.length === 0) return 1;

  return Math.max(1, Math.round(words.length / WORDS_PER_MINUTE));
}
