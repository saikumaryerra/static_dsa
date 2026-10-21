// Client module for every lesson page (`src/layouts/LessonLayout.tsx`): the
// legacy `LessonLayout.astro`'s third `<script>`, moved verbatim
// (React migration plan §5 P2 WS-C step 4). Loaded as a `<script
// type="module">` on every page that renders the component.
/**
 * Learning days (M8.3) — count today, once, when the reader does something
 * explicit on this page (`docs/m8-gamification.md`; spec §6's `ld:days:v1`).
 *
 * IT COUNTS ACTS, NEVER ATTENDANCE. Spec §6 bans behavioral tracking outright,
 * so nothing here observes arrival, scrolling, elapsed time or a revealed
 * answer. What it listens to is exactly what the stage painter above listens
 * to, and for the same reason — this is the one place on a lesson page that
 * already sees every explicit act:
 * - a **completion** click, and only when it LEFT the lesson complete: un-
 *   ticking is an explicit act too, and it is not a learning one.
 * - a **practice self-grade**, either answer. "Not yet" is an honest report of
 *   a retrieval attempt, and this counter has no notion of a right answer.
 * - a landed retrieval pass announced on `progress:changed` — today that is a
 *   cleared Final Run and a qualifying predict session, both of which dispatch
 *   it only after their write (`src/lib/progress-events.ts`), so a mode that is
 *   merely toggled or a prediction that is merely answered writes nothing.
 *
 * Everything else about the counter — the once-per-day rule, the day boundary,
 * the monotonic increment, the storage guards — lives in
 * `src/lib/learning-days.ts`, so calling it more than once in a day is a read
 * and nothing else, and no caller can invent a second definition of "a day".
 *
 * With JS off this never runs and no key is ever written; with storage blocked
 * the module answers "nothing recorded" instead of throwing, and `/learn`
 * simply renders no line.
 */
import { isComplete } from '../../lib/progress';
import { recordLearningDay } from '../../lib/learning-days';
import { PROGRESS_CHANGED_EVENT } from '../../lib/progress-events';

// From the WRITER's own hook, so "did this click complete the lesson?" is
// asked about the same slug `MarkComplete` just wrote.
const slug =
  document.querySelector<HTMLElement>('[data-mark-complete]')?.dataset[
    'slug'
  ] ?? '';

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('[data-practice-grade]')) {
    recordLearningDay();
    return;
  }
  // Delegated on `document`, so this runs in the BUBBLE phase — after
  // MarkComplete's own handler has written the key — which is what makes the
  // read below the state this click produced rather than the one before it.
  if (target.closest('[data-mark-complete]') && slug && isComplete(slug)) {
    recordLearningDay();
  }
});

document.addEventListener(PROGRESS_CHANGED_EVENT, () => {
  recordLearningDay();
});
