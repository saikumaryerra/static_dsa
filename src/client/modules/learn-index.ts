// Client module for the catalogue `/learn/` (`src/pages/LearnIndex.tsx`): the
// legacy `src/pages/learn/index.astro` `<script>`, moved verbatim (React
// migration plan §5 P3, the step-4 rule of P2) except for the edits that rule
// names: the never-fired `astro:page-load` listener is gone, and links are
// built with the root-absolute `lessonHref(slug)`/`reviewHref(slug)` instead of
// joining onto a runtime site root. Loaded as a `<script type="module">` on
// every page that renders it.
/**
 * Progress island for /learn (M7.2, extended by M8.1). Reflects the stored
 * progress keys onto four surfaces — the resume CTA, the per-track arcs, the
 * cards and the reset control — and owns the delete path.
 *
 * Every storage access goes through `src/lib/progress.ts`, so the try/catch
 * discipline and the "which keys count as progress" list live in one place
 * (M8 extended that module, not this file); every stage word and the ring
 * geometry come from `src/lib/mastery-ui.ts`, which the lesson header shares.
 * The several passes over storage this makes are deliberate: each is a
 * synchronous read of at most the 15 lessons' own keys, and calling the shared
 * helpers keeps every surface honest rather than re-deriving a stage locally
 * from a value that happens to be in hand.
 *
 * Re-runs on a back/forward-cache restore (`onRestore`); the reset controls
 * use delegated listeners, which survive any re-render of the nodes they serve.
 */
import {
  countNotes,
  hasStoredProgress,
  onRestore,
  PROGRESS_RESET_EVENT,
  readCompleted,
  resetProgress,
  storedProgress,
  type LessonRef,
} from '../../lib/progress';
import {
  lessonsFromDom,
  renderCards,
  renderResume,
  renderTracks,
  storageReadable,
} from '../../lib/progress-paint';
import {
  hasLearningDays,
  learningDaysLine,
  readLearningDays,
} from '../../lib/learning-days';

/** "3 completed marks" / "1 completed mark" — used by the confirm and the announcement. */
function marks(count: number): string {
  return `${count} completed mark${count === 1 ? '' : 's'}`;
}

/** "a", "a and b", "a, b and c" — the list both reset sentences read from. */
function joinList(parts: string[]): string {
  const last = parts[parts.length - 1];
  if (parts.length < 2 || last === undefined) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${last}`;
}

/**
 * What a reset removes BESIDES completion marks, named in the reader's words:
 * "practice records", "trial records", "written notes", "learning-days count",
 * in whatever combination is actually stored.
 *
 * Two sentences share it — the confirm warning and the announcement — so a
 * device is described the same way before and after the delete. It names only
 * what is actually there, which is why it takes the storage readings rather
 * than a fixed phrase: "practice and trial records" on a device holding only
 * practice records would over-claim a delete the reader cannot undo.
 *
 * "Trial records" covers both enrichment keys (cleared Trace Trials and
 * cleared Final Runs) deliberately: the reader met them as one thing — puzzles
 * they cleared — and spelling out two internal key names in a warning sentence
 * would trade clarity for an accuracy nobody asked for. Notes and the
 * learning-days count are named SEPARATELY for the opposite reason: the notes
 * are the reader's own words (the design's ethics pass makes naming them an
 * obligation, not a nicety), and the count is not a record at all. Notes live
 * inside the practice records, so a device holding one is described as holding
 * both — over-listing, which is the safe direction for a delete that cannot be
 * undone.
 *
 * Returned as a LIST rather than a finished phrase so each sentence can flatten
 * it into its own grammar: the warning says "the …" of each kind beside the
 * completion marks, the announcement drops the article. Joining here instead
 * produced "1 completed mark and the practice records and learning-days count"
 * — true, and read like a machine wrote it.
 *
 * @param stored - The reading from `storedProgress`.
 * @param notes - How many lessons hold a written note (`countNotes`).
 * @param days - Whether `ld:days:v1` is on the device.
 * @returns Each stored kind, without an article, in a stable order; `[]` when
 * none of them is stored.
 */
function recordKinds(
  stored: { records: number; enrichment: boolean },
  notes: number,
  days: boolean,
): string[] {
  const kinds: string[] = [];
  if (stored.records > 0) kinds.push('practice');
  if (stored.enrichment) kinds.push('trial');
  const parts: string[] = [];
  if (kinds.length > 0) parts.push(`${kinds.join(' and ')} records`);
  if (notes > 0) parts.push(notes === 1 ? 'written note' : 'written notes');
  if (days) parts.push('learning-days count');
  return parts;
}

/**
 * Paints the learning-days line, or leaves the page without one.
 *
 * Three states collapse to the same absence — nothing recorded, a value this
 * version cannot read, and a store that will not open — because all three mean
 * the same thing here: this page cannot honestly state a number about this
 * device. "0 days" would be a claim nobody could verify, and an empty state
 * would be the guilt the design killed streaks to avoid.
 *
 * Reads on every render, so a reset clears the line in place with no reload.
 */
function renderDays(): void {
  const line = document.querySelector<HTMLElement>('[data-learning-days]');
  if (!line) return;
  const days = readLearningDays();
  const text = days ? learningDaysLine(days.count) : '';
  // One text node, no child elements: the sentence is the whole surface, and
  // splitting the number into its own span would let a future style treat it
  // as a score.
  line.textContent = text;
  line.hidden = text === '';
}

/**
 * Nothing stored = nothing to delete, so the control reads as unavailable.
 *
 * The question is `hasStoredProgress`, not the completion count, since M8.1:
 * a reader who self-graded practice without ever clicking "Mark as complete"
 * has a `progress:v1:{slug}` record on the device, and a control gated on
 * marks alone would present itself as "nothing to clear" while holding it.
 * M8.3 widened the same question rather than adding a second one — a device
 * whose only stored data is a cleared Trace Trial reaches this control too.
 */
function renderReset(list: LessonRef[]): void {
  const toggle = document.querySelector<HTMLElement>('[data-reset-toggle]');
  toggle?.setAttribute(
    'aria-disabled',
    hasStoredProgress(list) ? 'false' : 'true',
  );
}

/** Redraws every progress surface from storage. */
function render(): void {
  // First, and outside the guard below: the days count belongs to the reader,
  // not to the curriculum, so it is the one surface here that still has
  // something true to say if the injected lesson list ever fails to parse.
  renderDays();
  const list = lessonsFromDom();
  if (list.length === 0) return; // no injected list: leave every fallback alone
  const completed = readCompleted(list);
  renderResume(list, completed.length);
  // Asked once per render, not once per surface: the answer cannot change
  // mid-pass, and two probes would be two reads for one question.
  renderTracks(list, storageReadable(list));
  renderCards(completed);
  renderReset(list);
}

/** Writes the polite announcement region (empty until the reader acts). */
function announce(message: string): void {
  const status = document.querySelector<HTMLElement>('[data-progress-status]');
  if (status) status.textContent = message;
}

/**
 * Opens the inline confirm step — deliberately not `window.confirm`, which is
 * unstyleable, unannounced in place, and blocks the page. Focus stays on the
 * toggle (a disclosure, not a dialog): moving it onto "Confirm" would put a
 * destructive button under a Space keypress the reader has not released yet.
 */
function openPanel(toggle: HTMLElement, panel: HTMLElement): void {
  const list = lessonsFromDom();
  const stored = storedProgress(list);
  const kinds = recordKinds(stored, countNotes(list), hasLearningDays());
  const warn = panel.querySelector<HTMLElement>('[data-reset-warn]');
  if (warn) {
    // A device with records but no marks — practice-only, one that has only
    // cleared trials, or one holding nothing but the days count — must not be
    // told "0 completed marks", which would describe the delete as a no-op it
    // is not. Every §6 progress shape is named in whatever combination is
    // actually stored, as ONE flat list so the sentence reads the same way at
    // one kind and at four; the fallback never renders (the toggle is
    // aria-disabled with nothing stored) and is here so no arrangement of this
    // sentence can come out empty.
    const parts = kinds.map((kind) => `the ${kind}`);
    if (stored.marks > 0) parts.unshift(marks(stored.marks));
    const what = parts.length > 0 ? joinList(parts) : 'the progress';
    warn.textContent = `Removes ${what} stored on this device — cannot be undone.`;
  }
  panel.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
}

/** Collapses the confirm step and returns focus to the toggle it came from. */
function closePanel(): void {
  const toggle = document.querySelector<HTMLElement>('[data-reset-toggle]');
  const panel = document.querySelector<HTMLElement>('[data-reset-panel]');
  if (!toggle || !panel || panel.hidden) return;
  panel.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  // aria-disabled (not `disabled`) keeps this a valid focus target even when
  // the reset just emptied it, so focus never lands on <body>.
  toggle.focus();
}

/** Confirm: clear the keys, redraw every surface in place, say what happened. */
function confirmReset(): void {
  const list = lessonsFromDom();
  // Read BEFORE the delete, and only then: `resetProgress` counts the
  // completion marks it removed and deliberately counts neither mastery
  // records nor the enrichment keys (neither a practice record nor a cleared
  // trial is a "mark"), so this is the only moment the rest is still there to
  // be named.
  const stored = storedProgress(list);
  const kinds = recordKinds(stored, countNotes(list), hasLearningDays());
  const removed = resetProgress(list);
  closePanel();
  render();
  // The review strip paints from the records this just deleted, and it is a
  // SECOND island with no shared scope — so it is told, or it keeps inviting
  // the reader to review lessons the device no longer remembers. Announced
  // rather than called: this file must not learn how another component
  // renders itself.
  document.dispatchEvent(new CustomEvent(PROGRESS_RESET_EVENT));
  // Said in the same units the warning used, so the reader hears back exactly
  // what they agreed to: the marks the delete actually removed (never the
  // count it hoped to — a blocked key is not a removal), plus whichever other
  // record kinds were there. "Nothing to reset" is what a clean device and a
  // blocked store both come out as, which is the honest answer for both.
  const alongWith = joinList(kinds.map((kind) => `the ${kind}`));
  announce(
    removed > 0
      ? `Progress reset — ${marks(removed)} removed from this device${
          alongWith ? `, along with ${alongWith}` : ''
        }.`
      : kinds.length > 0
        ? `Progress reset — ${joinList(kinds)} removed from this device.`
        : 'Nothing to reset — no progress was stored on this device.',
  );
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const toggle = target.closest<HTMLElement>('[data-reset-toggle]');
  if (toggle) {
    if (toggle.getAttribute('aria-disabled') === 'true') return;
    const panel = document.querySelector<HTMLElement>('[data-reset-panel]');
    if (!panel) return;
    if (panel.hidden) openPanel(toggle, panel);
    else closePanel();
    return;
  }
  if (target.closest('[data-reset-confirm]')) {
    confirmReset();
    return;
  }
  if (target.closest('[data-reset-cancel]')) closePanel();
});

// Escape closes the confirm step from the control it belongs to — the panel OR
// the toggle that owns it — and from nowhere else, so it can never swallow an
// Escape meant for something else on the page. The toggle has to be in that
// set: `openPanel` deliberately leaves focus there (a disclosure, not a
// dialog), and it is the panel's SIBLING, so a `panel.contains()` test alone
// made Escape a no-op at the exact moment a destructive confirm opened.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const panel = document.querySelector<HTMLElement>('[data-reset-panel]');
  if (!panel || panel.hidden) return;
  const target = event.target instanceof Node ? event.target : null;
  if (!target) return;
  const toggle = document.querySelector<HTMLElement>('[data-reset-toggle]');
  if (panel.contains(target) || toggle?.contains(target)) closePanel();
});

render();
// A back/forward-cache restore replays no script, so the counts, the CTA and
// the checkmarks would all show whatever they said when the reader left for a
// lesson — including the one they just marked done.
onRestore(render);
