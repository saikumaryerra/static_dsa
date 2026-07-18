/**
 * Reading-time estimator for lesson prose (design §1.4).
 *
 * Distinct from the author's `estimatedMinutes` frontmatter (which includes
 * playing with the visualization); this is a pure word-count estimate of the
 * prose alone at 200 wpm. Small, dependency-free, unit-tested.
 */

/** Average adult reading speed used for the estimate (words per minute). */
const WORDS_PER_MINUTE = 200;

/**
 * Estimates reading time in minutes for a body of prose.
 *
 * Fenced (```) and inline (`` ` ``) code is stripped first so code samples don't
 * inflate the estimate (design §1.4). Words are whitespace-delimited runs. The
 * result is `Math.max(1, Math.round(words / 200))`, so any non-empty prose reads
 * as at least "1 min".
 *
 * @param source - Raw lesson text (MDX/Markdown body).
 * @returns Whole-minute reading-time estimate (≥ 1).
 */
export function readingTimeMinutes(source: string): number {
  // Strip fenced code blocks, then inline code spans, so only prose is counted.
  const prose = source.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');

  const words = prose.split(/\s+/).filter((token) => token.length > 0);
  if (words.length === 0) return 1;

  return Math.max(1, Math.round(words.length / WORDS_PER_MINUTE));
}
