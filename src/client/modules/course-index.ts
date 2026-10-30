// Client module for a course page (`src/components/CourseIndex.tsx`): the
// legacy `CourseIndex.astro` `<script>`, moved verbatim (React migration plan
// §5 P3, the step-4 rule of P2) except for the edits that rule names: the
// never-fired `astro:page-load` listener is gone, and links are built with the
// root-absolute `lessonHref(slug)`/`reviewHref(slug)` instead of joining onto a
// runtime site root. Loaded as a `<script type="module">` on every page that
// renders it.
/**
 * Progress island for a course page (course expansion, decision D-05).
 *
 * Deliberately small: it paints the three surfaces this page owns — the resume
 * CTA, each module's arc and each card's pips — and nothing else. Every one of
 * those painters is imported from `src/lib/progress-paint.ts`, the same module
 * `/learn` calls, so the catalogue and the course pages cannot draw the same
 * state two different ways. The delete path, the review strip and the
 * learning-days line stay on the catalogue, where the device-wide facts live.
 *
 * Re-runs on a back/forward-cache restore (`onRestore`), exactly as `/learn`
 * does.
 */
import {
  onRestore,
  PROGRESS_RESET_EVENT,
  readCompleted,
} from '../../lib/progress';
import {
  lessonsFromDom,
  renderCards,
  renderResume,
  renderTracks,
  storageReadable,
} from '../../lib/progress-paint';

/** Redraws every progress surface on this page from storage. */
function render(): void {
  const list = lessonsFromDom();
  if (list.length === 0) return; // no injected list: leave every fallback alone
  const completed = readCompleted(list);
  renderResume(list, completed.length);
  // Asked once per render, not once per surface: the answer cannot change
  // mid-pass, and two probes would be two reads for one question.
  renderTracks(list, storageReadable(list));
  renderCards(completed);
}

render();
onRestore(render);
// A reset happens on the catalogue; listening for the same event keeps this page
// honest should one ever be dispatched here.
document.addEventListener(PROGRESS_RESET_EVENT, render);
