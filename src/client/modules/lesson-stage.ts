// Client module for the lesson header's mastery pips
// (`src/layouts/LessonLayout.tsx`): the legacy `LessonLayout.astro`'s second
// `<script>`, moved verbatim (React migration plan §5 P2 WS-C step 4).
// Loaded as a `<script type="module">` on every page that renders the
// component.
/**
 * Lesson header stage (M8.1) — paints the meta row's mastery pips from the
 * shared store, and keeps them true for the rest of the visit.
 *
 * Three kinds of thing can move this row after its first paint, and each is
 * OBSERVED rather than polled: the completion click and a practice self-grade,
 * both caught by the delegated click listener at the bottom; a retrieval pass
 * written by an island that owns no pips (a cleared Final Run, a qualifying
 * predict session), caught by listening on `progress:changed` — the channel
 * `src/lib/progress-events.ts` defines for exactly this, which a writer
 * dispatches once its write has LANDED (the predict session's write sits
 * inside a lazy `import()`, so "landed" is load-bearing); and a
 * back/forward-cache restore, caught by `onRestore`.
 *
 * It reads and never writes: `MarkComplete` owns `lesson:{slug}:complete` and
 * `progress.ts` owns the mastery record, so this is a display of their state
 * (`src/lib/progress.ts` resolves it, `src/lib/mastery-ui.ts` words and draws
 * it — the same two modules /learn's cards use, so a stage cannot mean one
 * thing here and another there).
 *
 * Storage blocked, or nothing recorded: `masteryStage` answers `none` and the
 * row stays hidden — absent, never a wrong stage. With JS off this script
 * never runs and the pips carry their own `<noscript>` kill-switch besides.
 */
import { masteryStage, onRestore } from '../../lib/progress';
import { PROGRESS_CHANGED_EVENT } from '../../lib/progress-events';
import { paintPips, stageLabel } from '../../lib/mastery-ui';

const wrap = document.querySelector<HTMLElement>('[data-lesson-stage]');
const pips = wrap?.querySelector<HTMLElement>('[data-mastery-pips]') ?? null;
// The slug travels ON the component's own hook attribute, not on the layout,
// so the pips and the record they show can never be given different lessons.
const slug = pips?.dataset['masteryPips'] ?? '';

if (wrap && pips && slug) {
  /** Re-reads the store and repaints; silent, and never announces. */
  const paint = (): void => {
    const stage = masteryStage(slug);
    // The device-scope suffix rides in the label because this is a persistent
    // surface far from the controls that carry their own scope line
    // ("Saved only in this browser", "Saved on this device only"), and every
    // one of them owes the reader that sentence.
    paintPips(pips, stage, `${stageLabel(stage)} on this device`);
    wrap.hidden = stage === 'none';
  };

  paint();
  // A back/forward-cache restore replays no script, so a reader returning by
  // Back would otherwise see the stage as it stood when they left.
  onRestore(paint);

  // A write this visit made, announced by the island that made it. Both
  // retrieval passes stamp `practicedAt` from a script that owns no pips, and
  // the predict session's write happens inside a lazy `import()` — no
  // click-time listener could observe THAT, whatever it watched — which is why
  // the channel is an event dispatched after the write, not more delegation.
  document.addEventListener(PROGRESS_CHANGED_EVENT, paint);

  // MarkComplete and PracticeCheck emit nothing, so their acts are still
  // observed the way M8.3's note is specified to: one delegated click
  // listener. The ordering is what makes it correct — both components attach
  // their handlers directly to their own buttons, and a listener on `document`
  // runs in the BUBBLE phase, after the target's own, so the write this click
  // made is already in storage by the time this re-reads it. Kept beside the
  // event rather than replaced by it: a repaint is idempotent and silent
  // (`paintPips` writes one attribute and one label, and this row has no live
  // region), so a component that grows a dispatch later costs a second read
  // and nothing else.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-mark-complete], [data-practice-grade]')) {
      paint();
    }
  });
}
