/**
 * Courses and the track→course partition (course expansion, decisions D-04/D-05).
 *
 * Pure data, so this belongs in Vitest: the harness runs `node` with no DOM, and
 * everything asserted here is a fact about two `const` tables.
 *
 * The load-bearing one is the DISJOINTNESS test. `renderTracks` in
 * `src/lib/progress-paint.ts` paints a track arc and a course arc with one
 * predicate — `lesson.track === group || lesson.course === group` — which is only
 * correct while no id means both things. A track called `kubernetes` would make
 * every Kubernetes lesson count twice on the catalogue card and once again on the
 * course page, and nothing on screen would look wrong enough to notice.
 */
import { describe, it, expect } from 'vitest';
import {
  COURSE_COPY,
  COURSE_ORDER,
  coursePath,
  courseLabel,
  type CourseId,
} from '../../src/lib/courses';
import {
  TRACK_COPY,
  TRACK_IDS,
  courseOfTrack,
  tracksForCourse,
} from '../../src/lib/tracks';

describe('the course table', () => {
  it('orders every course exactly once', () => {
    const declared = Object.keys(COURSE_COPY) as CourseId[];
    expect([...COURSE_ORDER].sort()).toEqual([...declared].sort());
    expect(new Set(COURSE_ORDER).size).toBe(COURSE_ORDER.length);
  });

  it('says something real about each one', () => {
    for (const id of COURSE_ORDER) {
      const copy = COURSE_COPY[id];
      expect(copy.short.length, `${id} short`).toBeGreaterThan(1);
      expect(copy.title.length, `${id} title`).toBeGreaterThan(5);
      expect(copy.blurb.length, `${id} blurb`).toBeGreaterThan(20);
      expect(copy.description.length, `${id} description`).toBeGreaterThan(80);
      // A catalogue card that promises nothing and assumes nothing is a card
      // with no information on it. Both lists are rendered, so both must exist.
      expect(copy.outcomes.length, `${id} outcomes`).toBeGreaterThanOrEqual(3);
      expect(
        copy.prerequisites.length,
        `${id} prerequisites`,
      ).toBeGreaterThanOrEqual(2);
      expect(['beginner', 'intermediate']).toContain(copy.difficulty);
    }
  });

  it('builds a root-absolute, trailing-slash path for each one', () => {
    for (const id of COURSE_ORDER) {
      const path = coursePath(id);
      expect(path.startsWith('/learn/'), path).toBe(true);
      expect(path.endsWith('/'), path).toBe(true);
      // The convention every internal link in `src/` follows; `url-shape.spec.ts`
      // fails the build on a slashless one.
      expect(path).toMatch(/^\/learn\/[a-z0-9-]+\/$/);
    }
  });

  it('labels a course with its short name', () => {
    expect(courseLabel('kubernetes')).toBe('Kubernetes');
  });
});

describe('the track table', () => {
  it('lists every track exactly once', () => {
    expect(new Set(TRACK_IDS).size).toBe(TRACK_IDS.length);
    expect([...TRACK_IDS].sort()).toEqual(Object.keys(TRACK_COPY).sort());
  });

  it('gives every track a course that exists', () => {
    for (const id of TRACK_IDS) {
      expect(COURSE_ORDER, `${id} course`).toContain(courseOfTrack(id));
    }
  });

  it('partitions the tracks across the courses with nothing left over', () => {
    const grouped = COURSE_ORDER.flatMap((id) => [...tracksForCourse(id)]);
    expect([...grouped].sort()).toEqual([...TRACK_IDS].sort());
  });

  it('keeps the tracks of a course in TRACK_IDS order', () => {
    for (const id of COURSE_ORDER) {
      const tracks = tracksForCourse(id);
      const positions = tracks.map((t) => TRACK_IDS.indexOf(t));
      expect(positions, id).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('says something real about each one', () => {
    for (const id of TRACK_IDS) {
      const copy = TRACK_COPY[id];
      expect(copy.short.length, `${id} short`).toBeGreaterThan(1);
      expect(copy.heading.length, `${id} heading`).toBeGreaterThan(3);
      expect(copy.blurb.length, `${id} blurb`).toBeGreaterThan(20);
    }
  });
});

describe('track ids and course ids never collide', () => {
  it('shares no id between the two levels', () => {
    // THE INVARIANT `renderTracks` DEPENDS ON. See this file's header.
    const overlap = TRACK_IDS.filter((id) =>
      (COURSE_ORDER as readonly string[]).includes(id),
    );
    expect(
      overlap,
      'a track id that is also a course id would make one lesson count twice in `renderTracks`',
    ).toEqual([]);
  });
});
