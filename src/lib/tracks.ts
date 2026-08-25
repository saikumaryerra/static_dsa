/**
 * Every curriculum track and the strings the site shows for it (site spec §8).
 *
 * SPEC-GAP: the spec names the tracks but not where their copy lives, and it was
 * duplicated — `/learn` inlined the long section headings and blurbs while
 * `Breadcrumb.astro` inlined the short crumb label. Rather than add a third copy
 * for cross-track prev/next (M7.1 IA-5), this module owns the concept and every
 * caller reads from here, so renaming a track is a one-file edit.
 *
 * **A track is a module.** Since the course expansion (`docs/courses/SPEC.md`,
 * decision D-04) every track belongs to exactly one course, and a course page
 * renders its tracks in `moduleOrder`. The two original tracks are the two
 * modules of the `dsa` course, which is why no existing lesson's frontmatter
 * changed. New course pages label them "Module N"; `/learn/dsa/` keeps the
 * original wording.
 */
import type { CourseId } from './courses.ts';

/**
 * Every track id, in site order, as a `const` tuple.
 *
 * The lesson schema's `track` enum is built from this array, so a typo in
 * frontmatter fails the build and `Track` below stays a closed union rather
 * than widening to `string` when the list grew past two.
 */
export const TRACK_IDS = [
  // Course: dsa
  'foundations',
  'algorithms',
  // Course: kubernetes
  'k8s-foundations',
  'k8s-workloads',
  'k8s-networking',
  'k8s-config',
  'k8s-storage',
  'k8s-scheduling',
  'k8s-reliability',
  'k8s-security',
  'k8s-observability',
  'k8s-scaling',
  'k8s-delivery',
  'k8s-production',
  'k8s-troubleshooting',
  'k8s-projects',
  // Course: system-design
  'sd-foundations',
  'sd-properties',
  'sd-edge',
  'sd-data',
  'sd-async',
  'sd-netflix',
  'sd-spotify',
  'sd-youtube',
  'sd-comparison',
] as const;

/** A curriculum track id — mirrors the lesson schema's `track` enum. */
export type Track = (typeof TRACK_IDS)[number];

/** Everything the site says about one track. */
export interface TrackCopy {
  /**
   * Short label: the exact wording the lesson breadcrumb shows, which is also
   * what fits an uppercase, letter-spaced overline without wrapping.
   */
  short: string;
  /** Long section heading on the course page (the `<h2 id="track-{id}">` anchor target). */
  heading: string;
  /** One-line promise under that heading. */
  blurb: string;
  /** The course this track is a module of. */
  course: CourseId;
}

/** The tracks in site-map order (§8) — a course page renders its own in this order. */
export const TRACK_ORDER: readonly Track[] = TRACK_IDS;

/** Track copy keyed by track id. */
export const TRACK_COPY: Record<Track, TrackCopy> = {
  foundations: {
    short: 'Foundations',
    heading: 'Foundations & Data Structures',
    blurb: 'The building blocks every algorithm relies on.',
    course: 'dsa',
  },
  algorithms: {
    short: 'Algorithms',
    heading: 'Algorithms',
    blurb: 'Classic algorithms, watched step by step until they click.',
    course: 'dsa',
  },

  'k8s-foundations': {
    short: 'Foundations',
    heading: 'Foundations',
    blurb: 'What an orchestrator is for, and how a cluster is put together.',
    course: 'kubernetes',
  },
  'k8s-workloads': {
    short: 'Core workloads',
    heading: 'Core workloads',
    blurb:
      'The objects that actually run your containers, and when to use each.',
    course: 'kubernetes',
  },
  'k8s-networking': {
    short: 'Networking',
    heading: 'Networking',
    blurb: 'How Pods reach each other, and how traffic reaches them.',
    course: 'kubernetes',
  },
  'k8s-config': {
    short: 'Configuration',
    heading: 'Configuration and secrets',
    blurb: 'Keeping settings and credentials out of the image.',
    course: 'kubernetes',
  },
  'k8s-storage': {
    short: 'Storage',
    heading: 'Storage',
    blurb: 'Giving a workload a disk that outlives the Pod using it.',
    course: 'kubernetes',
  },
  'k8s-scheduling': {
    short: 'Scheduling',
    heading: 'Scheduling and resources',
    blurb: 'Where a Pod lands, what it is promised, and what it may take.',
    course: 'kubernetes',
  },
  'k8s-reliability': {
    short: 'Reliability',
    heading: 'Reliability and health',
    blurb: 'Staying available while you change things underneath.',
    course: 'kubernetes',
  },
  'k8s-security': {
    short: 'Security',
    heading: 'Security',
    blurb: 'Least privilege for people, for workloads and for images.',
    course: 'kubernetes',
  },
  'k8s-observability': {
    short: 'Observability',
    heading: 'Observability',
    blurb: 'Logs, metrics, traces and events — and what each one answers.',
    course: 'kubernetes',
  },
  'k8s-scaling': {
    short: 'Scaling',
    heading: 'Scaling',
    blurb: 'Adding replicas, adding nodes, and knowing which one you need.',
    course: 'kubernetes',
  },
  'k8s-delivery': {
    short: 'Delivery',
    heading: 'Deployments and DevOps',
    blurb: 'Getting a change from a commit to a running cluster, safely.',
    course: 'kubernetes',
  },
  'k8s-production': {
    short: 'Production',
    heading: 'Production Kubernetes',
    blurb: 'Upgrades, tenancy, cost and recovery — the operational half.',
    course: 'kubernetes',
  },
  'k8s-troubleshooting': {
    short: 'Troubleshooting',
    heading: 'Troubleshooting',
    blurb:
      'One debugging workflow, applied to the failures you will actually meet.',
    course: 'kubernetes',
  },
  'k8s-projects': {
    short: 'Projects',
    heading: 'Practical projects',
    blurb:
      'One application, built up feature by feature until it is production-shaped.',
    course: 'kubernetes',
  },

  'sd-foundations': {
    short: 'Design workflow',
    heading: 'The design workflow',
    blurb: 'The same repeatable steps, whatever the system is.',
    course: 'system-design',
  },
  'sd-properties': {
    short: 'Properties',
    heading: 'Scale, latency and consistency',
    blurb: 'The vocabulary every trade-off in this course is argued in.',
    course: 'system-design',
  },
  'sd-edge': {
    short: 'The edge',
    heading: 'Building blocks: the edge',
    blurb: 'What sits between a client and your servers, and why.',
    course: 'system-design',
  },
  'sd-data': {
    short: 'Data',
    heading: 'Building blocks: data',
    blurb: 'Where the bytes live, and how they survive growth.',
    course: 'system-design',
  },
  'sd-async': {
    short: 'Asynchrony',
    heading: 'Building blocks: asynchrony and operations',
    blurb: 'Work that happens later, and knowing whether it happened at all.',
    course: 'system-design',
  },
  'sd-netflix': {
    short: 'Streaming',
    heading: 'Designing a Netflix-like streaming platform',
    blurb:
      'A small catalogue, enormous playback, and a CDN doing the heavy lifting.',
    course: 'system-design',
  },
  'sd-spotify': {
    short: 'Music',
    heading: 'Designing a Spotify-like music platform',
    blurb:
      'Millions of small files, constant events, and playlists people edit together.',
    course: 'system-design',
  },
  'sd-youtube': {
    short: 'Video',
    heading: 'Designing a YouTube-like video platform',
    blurb:
      'Anyone can upload, everything is a long tail, and writes never stop.',
    course: 'system-design',
  },
  'sd-comparison': {
    short: 'Comparison',
    heading: 'Comparative architecture',
    blurb: 'Three similar products, three different systems — and why.',
    course: 'system-design',
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

/**
 * The tracks belonging to one course, in the order its page renders them.
 *
 * @param course - Course id.
 * @returns That course's track ids, in `TRACK_IDS` order.
 */
export function tracksForCourse(course: CourseId): readonly Track[] {
  return TRACK_ORDER.filter((id) => TRACK_COPY[id].course === course);
}

/**
 * The course a track belongs to.
 *
 * @param track - Track id from lesson frontmatter.
 * @returns The owning course id.
 */
export function courseOfTrack(track: Track): CourseId {
  return TRACK_COPY[track].course;
}
