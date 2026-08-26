/**
 * Courses — the level above a track (course expansion, `docs/courses/SPEC.md` §6,
 * decision D-04).
 *
 * The site shipped one implicit course ("data structures and algorithms") split
 * into two tracks. Two more courses arrive with this expansion, so the hierarchy
 * is now **course → track → lesson**, where a *track* is the module-sized
 * grouping inside a course. The field name `track` is unchanged on purpose: the
 * 15 existing lessons keep their frontmatter, `LessonRef.track` keeps its
 * meaning, and every already-generic progress surface keeps working.
 *
 * This module owns everything the site *says* about a course, exactly as
 * `tracks.ts` owns everything it says about a track — so renaming one is a
 * one-file edit and no page states course copy of its own.
 */

/** A course id. Mirrors the lesson schema's `course` enum. */
export type CourseId = 'dsa' | 'kubernetes' | 'system-design';

/** Everything the site shows for one course. */
export interface CourseCopy {
  /** Short label: breadcrumb crumb and card eyebrow. Must not wrap. */
  short: string;
  /** Full catalogue title. */
  title: string;
  /** One line under the title on the course card. */
  blurb: string;
  /**
   * Two or three sentences on the course page and in its `<meta description>`.
   * Written to stand alone in a search result.
   */
  description: string;
  /** What a reader can do once they finish. Rendered as a list. */
  outcomes: readonly string[];
  /** Assumed knowledge, in prose fragments. Rendered as a list. */
  prerequisites: readonly string[];
  /**
   * The difficulty band shown on the card. Drawn from the lesson schema's
   * vocabulary (`beginner` | `intermediate`) so the catalogue never invents a
   * label the lessons themselves cannot carry (decision D-06).
   */
  difficulty: 'beginner' | 'intermediate';
}

/** The courses in catalogue order — `/learn` renders its cards in this order. */
export const COURSE_ORDER: readonly CourseId[] = [
  'dsa',
  'kubernetes',
  'system-design',
];

/** Course copy keyed by course id. */
export const COURSE_COPY: Record<CourseId, CourseCopy> = {
  dsa: {
    short: 'DSA',
    title: 'Data Structures & Algorithms',
    blurb: 'The core of computer science, watched one step at a time.',
    description:
      'Fifteen interactive lessons on the data structures and algorithms every engineer is expected to know. Each one is built around a visualization you can play, pause, step through and run on your own input.',
    outcomes: [
      'Reason about running time and memory with Big-O',
      'Choose the right data structure for a problem and say why',
      'Trace searching, sorting and graph algorithms by hand',
      'Explain what each algorithm does at every step',
    ],
    prerequisites: [
      'Comfortable reading code in any one language',
      'No maths beyond secondary school',
    ],
    difficulty: 'beginner',
  },
  kubernetes: {
    short: 'Kubernetes',
    title: 'Kubernetes: From Fundamentals to Production',
    blurb:
      'Run containers the way production does — declaratively, and on purpose.',
    description:
      'A complete path from "what is an orchestrator" to running, securing, scaling and debugging real workloads. Written for Kubernetes 1.36, using only current APIs, with a working manifest or command in every lesson.',
    outcomes: [
      'Model an application as Kubernetes workloads, Services and configuration',
      'Give a workload storage, health checks and a safe rollout',
      'Secure a cluster with RBAC, Pod Security Admission and NetworkPolicies',
      'Scale, observe and troubleshoot workloads under load',
      'Judge which production concerns are core Kubernetes and which are ecosystem',
    ],
    prerequisites: [
      'Container and Docker basics — images, layers, running a container',
      'A Linux shell: files, processes, environment variables',
      'Reading YAML',
    ],
    difficulty: 'intermediate',
  },
  'system-design': {
    short: 'System Design',
    title: 'System Design: Principles and Real-World Architectures',
    blurb:
      'The reusable principles first — then three real platforms, taken apart.',
    description:
      'A repeatable design workflow, the distributed-systems building blocks it draws on, and three applied case studies: a Netflix-like, a Spotify-like and a YouTube-like platform, ending in a comparison of why similar products need different architectures.',
    outcomes: [
      'Run a design from requirements to trade-offs without skipping a step',
      'Size a system with back-of-envelope arithmetic you can defend',
      'Pick between a queue, a stream, a cache and a CDN — and say when not to',
      'Design media delivery, recommendations and high-volume writes',
      'Explain why two similar products end up with different architectures',
    ],
    prerequisites: [
      'You have built a web backend of some kind',
      'Basic HTTP: methods, status codes, headers',
      'Basic database knowledge: tables, indexes, transactions',
    ],
    difficulty: 'intermediate',
  },
};

/**
 * The path of a course page, e.g. `/learn/kubernetes/`.
 *
 * Authored root-absolute with a trailing slash, like every other internal link
 * in `src/`; `scripts/portablize.mjs` makes it document-relative in `dist/`.
 *
 * @param course - Course id.
 * @returns The published path, trailing slash included.
 */
export function coursePath(course: CourseId): string {
  return `/learn/${course}/`;
}

/**
 * Short human label for a course, e.g. `"Kubernetes"`.
 *
 * @param course - Course id from lesson frontmatter.
 * @returns The label shown in the breadcrumb and in cross-course pagination.
 */
export function courseLabel(course: CourseId): string {
  return COURSE_COPY[course].short;
}
