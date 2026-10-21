// Client module for the completion toggle (`src/components/MarkComplete.tsx`):
// the legacy `MarkComplete.astro` `<script>`, moved verbatim (React migration
// plan §5 P2 WS-C step 4). Loaded as a `<script type="module">` on every page
// that renders the component.
import {
  completeKey,
  countComplete,
  countMastery,
  isComplete,
  onRestore,
  parseLessonRefs,
  type LessonRef,
} from '../../lib/progress';

const group = document.querySelector<HTMLElement>('[data-mark-complete-group]');
const button =
  group?.querySelector<HTMLButtonElement>('[data-mark-complete]') ?? null;
const note =
  group?.querySelector<HTMLElement>('[data-mark-complete-note]') ?? null;
const count =
  group?.querySelector<HTMLElement>('[data-mark-complete-count]') ?? null;
const milestoneLine =
  group?.querySelector<HTMLElement>('[data-milestone]') ?? null;
const slug = button?.dataset['slug'] ?? '';
// The key format comes from the progress module, never retyped here: this is
// the only writer, and a template literal on both sides let the write and the
// reads drift apart silently (M7.2 review).
const KEY = slug ? completeKey(slug) : null;

// The curriculum as injected at build time. `parseLessonRefs` is defensive by
// contract: a malformed payload yields [] rather than throwing inside the
// island, which costs the count line and nothing else.
const lessons = parseLessonRefs(group?.dataset['lessons']);

// This lesson's track, read out of the SAME injected list the counts come
// from, so the milestone and the count line can never disagree about which
// lessons exist. An unknown slug leaves the subset empty and no track can then
// read as complete.
const track = lessons.find((lesson) => lesson.slug === slug)?.track ?? null;
const trackLessons =
  track === null ? [] : lessons.filter((lesson) => lesson.track === track);

// The two sentences, composed at build time (see the frontmatter). Absent
// attributes mean "no milestone is available", not an empty announcement.
const TRACK_LINE = group?.dataset['trackLine'] ?? '';
const COURSE_LINE = group?.dataset['courseLine'] ?? '';

/**
 * Has every lesson in `subset` been BOTH marked complete AND practiced?
 *
 * Both halves are required, and the second one is why this function exists:
 * `docs/m8-gamification.md` binds the whole system to "nothing gates on
 * Learned alone", because the completion mark is a self-report with no
 * learning precondition. The mastery states are the currency the milestone
 * spends — the marks establish that this click finished the track, the
 * Practiced count establishes that retrieval actually happened.
 *
 * `countMastery().practiced` is CUMULATIVE (a Mastered lesson is counted in it
 * too), so this asks "every lesson is at Practiced or above" and never
 * "exactly Practiced" — a reader who mastered a lesson has not lost it.
 *
 * @param subset - The lessons the sentence names (one track, or all of them).
 * @returns True only when the subset is non-empty and every lesson in it
 * satisfies both halves; false whenever storage cannot be read, since both
 * counts degrade to 0 there and a claim about a device is never made on
 * numbers this component could not read.
 */
function fullyEarned(subset: LessonRef[]): boolean {
  const { done, total } = countComplete(subset);
  if (total === 0 || done !== total) return false;
  return countMastery(subset).practiced === total;
}

/**
 * The milestone sentence that is TRUE right now, or `''` when none is.
 *
 * Course before track, because finishing the course necessarily finishes a
 * track too and the design allows exactly ONE line. Derived on every call
 * rather than remembered: there is no milestone key in spec §6, and deriving
 * is what lets the line retire itself the moment its claim stops holding.
 */
function currentMilestone(): string {
  // This lesson is not in the injected curriculum (a malformed payload, or a
  // slug renamed out from under it): no click here can be shown to have
  // completed anything, so nothing is claimed.
  if (track === null) return '';
  if (COURSE_LINE && fullyEarned(lessons)) return COURSE_LINE;
  if (TRACK_LINE && fullyEarned(trackLessons)) return TRACK_LINE;
  return '';
}

/**
 * Shows (or retires) the milestone line and the check's one-off draw-in.
 *
 * Writing the same string back into a live region would re-announce a fact the
 * reader has already heard, so an unchanged line is left untouched. The class
 * and the text are only ever set together, which is what keeps the draw-in
 * tied to the one click that earned it.
 */
function setMilestone(line: string): void {
  if (!milestoneLine || milestoneLine.textContent === line) return;
  milestoneLine.textContent = line;
  // Un-toggling takes the line away with no replacement copy: nothing here
  // shames the reader for changing their mind.
  button?.classList.toggle('mark-complete--milestone', line !== '');
}

/**
 * Syncs the button's pressed state to `done` and reveals the saved-note.
 * The visible label stays "Mark as complete" (see the component doc):
 * `aria-pressed` plus the check glyph and filled styling it drives in CSS
 * carry the state on their own.
 */
function apply(done: boolean): void {
  if (!button) return;
  button.setAttribute('aria-pressed', done ? 'true' : 'false');

  // The note claims the choice was SAVED, so show it only when a read-back
  // agrees. With storage blocked (private mode) the toggle still flips for
  // this view, and promising a save that did not happen would be a lie.
  const saved = done && isComplete(slug);
  if (note) note.hidden = !saved;
  if (saved && count) {
    const totals = countComplete(lessons);
    // No injected curriculum (or a malformed one): drop the count line and
    // keep the honest half of the note.
    count.hidden = totals.total === 0;
    count.textContent =
      totals.total === 0
        ? ''
        : `Saved — ${totals.done} of ${totals.total} complete`;
  }

  // This never RAISES the milestone — only a click does (below), so returning
  // to a finished track never replays the celebration. It only retires a line
  // that has stopped being true: after an un-toggle, or when another tab
  // cleared part of the track while this page sat in the bfcache. The storage
  // reads happen only when a line is actually on screen.
  if (
    milestoneLine?.textContent &&
    (!done || currentMilestone() !== milestoneLine.textContent)
  ) {
    setMilestone('');
  }
}

button?.addEventListener('click', () => {
  const next = !isComplete(slug);
  if (KEY) {
    try {
      if (next) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {
      // Storage blocked: the toggle still updates this view, it just won't persist.
    }
  }
  apply(next);

  // The Quiet Milestone, raised only by a click and only once the save is
  // read back — the line claims a completed track ON THIS DEVICE, and a
  // blocked store has not got one. Because this lesson was incomplete a
  // moment ago, a track that now reads complete was necessarily completed BY
  // this click (N-1 → N), so no previous count has to be remembered.
  //
  // The Practiced half of the gate was earned earlier, in the lesson's
  // Practice section, and is only READ here. That is deliberate and it has one
  // consequence worth stating plainly: a reader who marks a whole track done
  // and only practises it afterwards sees no line until some later mark
  // re-raises it. Raising it on load instead would replay the celebration on
  // every visit, and the design gives this feature no storage key to remember
  // that it has already fired.
  if (next && isComplete(slug)) setMilestone(currentMilestone());
});

// Reflect any previously stored state on load, and again after a
// back/forward-cache restore — that path re-runs no script, so a lesson
// returned to via Back would otherwise show whatever the button said when the
// reader left, even if another tab has since cleared the mark.
apply(isComplete(slug));
onRestore(() => apply(isComplete(slug)));
