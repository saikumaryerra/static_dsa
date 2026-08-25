/**
 * The DOM half of the progress surfaces — the painters `/learn` and every
 * course page share (course expansion, decision D-05).
 *
 * These lived inside `/learn`'s island while `/learn` was the only page that
 * drew a track arc or a lesson card. The catalogue and the three course pages
 * both draw them now, and the design's rule is that ONE function paints every
 * surface from one read — so the functions moved here rather than being copied.
 * The pure half stays where it was: stage words, ring geometry and every count
 * sentence come from `src/lib/mastery-ui.ts`, which a Vitest suite can read.
 *
 * Nothing here is unit-testable in this repo's harness (Vitest runs `node` with
 * no DOM), which is the same reason `paintPips` is pure and its caller is not.
 * The DOM/storage half is covered by Playwright, per spec §18.
 *
 * Every storage access goes through `src/lib/progress.ts`, so the try/catch
 * discipline and the "which keys count as progress" list stay in one place.
 */
import {
  completeKey,
  countComplete,
  countMastery,
  lessonHref,
  masteryStage,
  nextIncomplete,
  parseLessonRefs,
  resumeLabel,
  siteRoot,
  type LessonRef,
} from './progress';
import {
  arcOffset,
  masteryCountsText,
  paintPips,
  trackCountText,
} from './mastery-ui';

/**
 * How many pips one lesson can fill — the three of `MasteryPips`, which the ring
 * sums across a track. Named rather than inlined because it is a fact about that
 * component, not an arbitrary divisor.
 */
const PIPS_PER_LESSON = 3;

/**
 * Reads the build-injected lesson list off the page.
 *
 * The injected list is scoped to what the page is about: the catalogue injects
 * every course's lessons, a course page injects only its own — which is what
 * makes the same painters produce a catalogue-wide resume CTA on one page and a
 * course-scoped one on the other, with no flag to pass.
 *
 * @returns The parsed list; `[]` when the attribute is missing or malformed, so
 * every caller leaves its server-rendered fallback alone.
 */
export function lessonsFromDom(): LessonRef[] {
  const host = document.querySelector<HTMLElement>('[data-lessons]');
  return parseLessonRefs(host?.dataset['lessons']);
}

/**
 * Can this device's storage actually be read?
 *
 * Every helper in `src/lib/progress.ts` degrades a blocked store to "nothing
 * recorded", which is the right answer for a checkmark and the WRONG one for a
 * counter: rendered, "0 of 9 done on this device" states as fact something the
 * page could not check, on a device that may well have nine marks in a store the
 * browser is refusing to open. So the surfaces that would otherwise assert that
 * zero ask this question first.
 *
 * The probe is a real read of a real spec §6 key (the first lesson's completion
 * mark) — nothing is written, nothing is enumerated, and the two failure shapes
 * both land in the catch: the global missing entirely (a ReferenceError) and the
 * getter throwing (Safari's blocked-methods mode).
 *
 * @param list - The build-injected lesson list; its first entry is the probe.
 * @returns True when a read completed without throwing.
 */
export function storageReadable(list: LessonRef[]): boolean {
  const probe = list[0];
  if (!probe) return false;
  try {
    localStorage.getItem(completeKey(probe.slug));
    return true;
  } catch {
    return false;
  }
}

/**
 * Fills each group's arc — count line, mastery counts, ring — and reveals it.
 *
 * A "group" is whatever `[data-track-progress]` names: a **track** on a course
 * page, or a **course** on the catalogue, which draws the same ring per course
 * card. One predicate serves both because track ids and course ids are disjoint
 * by construction — `tests/unit/courses.test.ts` asserts it, so a future track
 * called `kubernetes` fails a test rather than silently double-counting.
 *
 * @param list - The build-injected lesson list.
 * @param readable - Whether storage answered a read (see {@link storageReadable}).
 * With `false` the block states nothing at all and marks itself unreadable:
 * absent, not broken, and never a number nobody could verify.
 */
export function renderTracks(list: LessonRef[], readable: boolean): void {
  document
    .querySelectorAll<HTMLElement>('[data-track-progress]')
    .forEach((block) => {
      const group = block.dataset['trackProgress'];
      if (!group) return;
      const inTrack = list.filter(
        (lesson) => lesson.track === group || lesson.course === group,
      );
      if (inTrack.length === 0) return; // empty group keeps its "coming soon" note

      if (!readable) {
        // Both attributes move together: dropping `pending` is what proves the
        // island ran (a block still pending is indistinguishable from a script
        // that never executed), and `unreadable` is what hides it.
        block.removeAttribute('data-track-pending');
        block.setAttribute('data-track-unreadable', 'true');
        return;
      }
      block.removeAttribute('data-track-unreadable');

      const { done, total } = countComplete(inTrack);
      const text = block.querySelector<HTMLElement>('[data-track-count]');
      if (text) text.textContent = trackCountText(done, total);

      // The self-reported completion count is never displayed alone: "Mark as
      // complete" has no learning precondition, so the two EARNED counts are
      // rendered beside it always (`docs/m8-gamification.md`). They are
      // cumulative, so a lesson promoted to Mastered never makes the Practiced
      // number fall — a demotion this system does not have.
      const counts = countMastery(inTrack);
      const mastery = block.querySelector<HTMLElement>('[data-track-mastery]');
      if (mastery) {
        mastery.textContent = masteryCountsText(
          counts.practiced,
          counts.mastered,
        );
      }

      // The ring is the macro rendering of the MASTERY STATES, which is what the
      // design calls it — not of the completion marks. Driven by `done` it sat at
      // zero for a reader who had genuinely practised, displaying the one number
      // in this system that is nobody's evidence of anything. The counts are
      // cumulative, so summing them is the count of filled pips across the track
      // (Mastered fills 3, Practiced 2, Learned 1) and the ring fills exactly as
      // the cards below do. Only the offset is written — the dash array was baked
      // at build time.
      const ring = block.querySelector<SVGCircleElement>('[data-track-ring]');
      const pips = counts.learned + counts.practiced + counts.mastered;
      ring?.setAttribute(
        'stroke-dashoffset',
        String(arcOffset(pips, total * PIPS_PER_LESSON)),
      );

      // Drops `visibility: hidden`, not a `hidden` attribute: the block has been
      // holding its own height since SSR so this reveal shifts nothing.
      block.removeAttribute('data-track-pending');
    });
}

/**
 * Marks each card with its completion state and paints its mastery pips
 * (§6 local completed state; M8.1's "the done-checkmark becomes pip 1").
 *
 * `data-complete` stays on the card and keeps its exact M7 meaning — the
 * completion MARK, which is also the only thing the reset control counts — while
 * `data-stage` carries the wider currency the pips draw. Both are written in this
 * one synchronous pass over the same store (the stage costs a second read of the
 * same key, deliberately: `masteryStage` is where the OR-win rule lives, and
 * re-deriving it here would be a second definition), so the mark and the pips on
 * a card can never contradict each other.
 *
 * @param completed - Slugs with a completion mark, from `readCompleted`.
 */
export function renderCards(completed: string[]): void {
  const done = new Set(completed);
  document
    .querySelectorAll<HTMLElement>('[data-lesson-card]')
    .forEach((card) => {
      const slug = card.dataset['slug'];
      if (!slug) return;
      if (done.has(slug)) card.setAttribute('data-complete', 'true');
      else card.removeAttribute('data-complete');

      const pips = card.querySelector<HTMLElement>('[data-mastery-pips]');
      if (pips) paintPips(pips, masteryStage(slug));
    });
}

/**
 * Points the resume CTA at the first unfinished lesson in the injected list, or
 * stands it down when all of them are done.
 *
 * Scope follows the injected list, so the catalogue resumes across every course
 * and a course page resumes inside its own.
 *
 * @param list - The build-injected lesson list.
 * @param completed - How many of those lessons are complete on this device.
 */
export function renderResume(list: LessonRef[], completed: number): void {
  const link = document.querySelector<HTMLAnchorElement>('[data-resume-link]');
  const label = document.querySelector<HTMLElement>('[data-resume-label]');
  const done = document.querySelector<HTMLElement>('[data-resume-done]');
  if (!link || !label || !done) return;

  // Where this deployment lives, read BEFORE anything is written: the CTA's
  // wording and its destination are one statement (see `siteRoot`). Without the
  // anchor this leaves the server-rendered "Start with 01 · …" in place — stale
  // for a returning reader, but a link that works.
  const site = siteRoot();
  if (!site) return;

  const next = nextIncomplete(list);
  const text = resumeLabel(next, completed, list.length);
  if (next) {
    link.href = lessonHref(next.slug, site);
    label.textContent = text;
    done.hidden = true;
    link.hidden = false;
  } else {
    done.textContent = text;
    done.hidden = false;
    link.hidden = true;
  }
}
