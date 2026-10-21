// Client module for the home page's resume CTA (`src/pages/Home.tsx`): the
// legacy `src/pages/index.astro` `<script>`, moved verbatim (React migration
// plan §5 P3, the step-4 rule of P2) except for the edits that rule names: the
// never-fired `astro:page-load` listener is gone, and links are built with the
// root-absolute `lessonHref(slug)`/`reviewHref(slug)` instead of joining onto a
// runtime site root. Loaded as a `<script type="module">` on every page that
// renders it.
/**
 * Hero continue line (M7.2). The only thing this island does is rewrite one
 * already-useful link: server-side it reads "Start with 01 · …", and once it
 * can see this device's `lesson:{slug}:complete` keys it becomes
 * "Continue: NN · …", or stands down for "All N done — revisit any lesson."
 *
 * The primary CTA above is deliberately untouched — a first-time visitor must
 * always meet the same hero. All storage access goes through
 * `src/lib/progress.ts` (one module, one try/catch discipline), so a blocked
 * store simply leaves the server-rendered line in place.
 */
import {
  lessonHref,
  nextIncomplete,
  onRestore,
  parseLessonRefs,
  readCompleted,
  resumeLabel,
} from '../../lib/progress';

function render(): void {
  const host = document.querySelector<HTMLElement>('[data-lessons]');
  const list = parseLessonRefs(host?.dataset['lessons']);
  if (list.length === 0) return; // no injected list: leave the fallback alone

  const root = document.querySelector<HTMLElement>('[data-resume-root]');
  const link = document.querySelector<HTMLAnchorElement>('[data-resume-link]');
  const label = document.querySelector<HTMLElement>('[data-resume-label]');
  const done = document.querySelector<HTMLElement>('[data-resume-done]');
  if (!root || !link || !label || !done) return;

  const next = nextIncomplete(list);
  const completed = readCompleted(list).length;
  // Nothing finished on this device: there is nothing to resume, and the
  // primary CTA above already offers lesson 01. Staying hidden is the whole
  // behaviour — this is also the state a reader returns to after using the
  // reset control, so the line has to be able to go back to it.
  root.hidden = completed === 0;
  if (completed === 0) return;

  const text = resumeLabel(next, completed, list.length);
  if (next) {
    link.href = lessonHref(next.slug);
    label.textContent = text;
    done.hidden = true;
    link.hidden = false;
  } else {
    done.textContent = text;
    done.hidden = false;
    link.hidden = true;
  }
}

render();
// Re-read after a back/forward-cache restore: the home page is exactly what a
// reader lands back on after finishing a lesson, and that path runs no script,
// so the line would still name the lesson they just completed.
onRestore(render);
