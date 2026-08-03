/**
 * The two curriculum tracks and every string the site shows for them (site spec §8).
 *
 * SPEC-GAP: the spec names the tracks but not where their copy lives, and it was
 * duplicated — `/learn` inlined the long section headings and blurbs while
 * `Breadcrumb.astro` inlined the short crumb label. Rather than add a third copy
 * for cross-track prev/next (M7.1 IA-5), this module owns the concept and every
 * caller reads from here, so renaming a track is a one-file edit.
 */

/** The two curriculum tracks — mirrors the lesson schema's `track` enum. */
export type Track = 'foundations' | 'algorithms';

/** Everything the site says about one track. */
export interface TrackCopy {
  /**
   * Short label: the exact wording the lesson breadcrumb shows, which is also
   * what fits an uppercase, letter-spaced overline without wrapping.
   */
  short: string;
  /** Long section heading on `/learn` (the `<h2 id="track-{id}">` anchor target). */
  heading: string;
  /** One-line promise under that heading. */
  blurb: string;
}

/** The tracks in site-map order (§8) — `/learn` renders its sections in this order. */
export const TRACK_ORDER: readonly Track[] = ['foundations', 'algorithms'];

/** Track copy keyed by track id. */
export const TRACK_COPY: Record<Track, TrackCopy> = {
  foundations: {
    short: 'Foundations',
    heading: 'Foundations & Data Structures',
    blurb: 'The building blocks every algorithm relies on.',
  },
  algorithms: {
    short: 'Algorithms',
    heading: 'Algorithms',
    blurb: 'Classic algorithms, watched step by step until they click.',
  },
};

/**
 * Short human label for a curriculum track, e.g. `"Foundations"`.
 *
 * @param track - Track id from lesson frontmatter.
 * @returns The label as shown in the breadcrumb and in cross-track pagination.
 */
export function trackLabel(track: Track): string {
  return TRACK_COPY[track].short;
}
