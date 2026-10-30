// Client module for the Explain-it-back note
// (`src/components/ExplainBack.tsx`): the legacy `ExplainBack.astro`
// `<script>`, moved verbatim (React migration plan §5 P2 WS-C step 4). Loaded
// as a `<script type="module">` on every page that renders the component.
/**
 * The Explain-it-back island: mount the box once the reader says they are
 * done, then read, save and delete their note.
 *
 * Every storage rule lives in `src/lib/progress.ts` — the key, the cap, the
 * read-modify-write that keeps the rest of the record intact, and the delete
 * that takes exactly one field — so this file only decides WHEN the box exists
 * and WHAT the reader is told.
 */
import {
  deleteNote,
  isComplete,
  NOTE_MAX_CHARS,
  onRestore,
  readNote,
  writeNote,
} from '../../lib/progress';

/** How few characters may be left before the count becomes worth announcing. */
const ANNOUNCE_FROM = 20;

const template = document.querySelector<HTMLTemplateElement>(
  '[data-explain-template]',
);
const slug = template?.dataset['slug'] ?? '';

if (template && slug) {
  /**
   * Whether this visit arrived from the review strip.
   *
   * Read, never written: `?review=1` is a URL, not a preference (spec §6
   * permits no key for it), so a review visit leaves the device byte-identical.
   */
  const isReview =
    new URLSearchParams(window.location.search).get('review') === '1';

  /** The cloned box, once it exists. */
  let box: HTMLElement | null = null;
  let field: HTMLTextAreaElement | null = null;
  let recall: HTMLElement | null = null;
  let count: HTMLElement | null = null;
  let removeBtn: HTMLElement | null = null;
  let statusText: HTMLElement | null = null;
  let statusIcon: HTMLElement | null = null;
  /** The last character-count band announced, so it is said once per crossing. */
  let announcedBand = '';
  /**
   * Whether the box holds typing that has not been saved.
   *
   * It exists so a repaint can never overwrite the reader's unsaved sentence:
   * `paint()` runs on the completion click too (the same delegated listener
   * that reveals the box), and a reader who types first and un-ticks
   * completion second would otherwise watch their words be replaced by
   * whatever storage last held.
   */
  let dirty = false;

  /**
   * Says one thing, politely, in the single live region — with the glyph only
   * where the sentence is a confirmation.
   *
   * Rewriting a region with an identical string re-announces it, so an
   * unchanged message is left alone (the rule `PracticeCheck` follows).
   */
  function say(message: string, confirmed = false): void {
    if (!statusText || statusText.textContent === message) return;
    statusText.textContent = message;
    if (statusIcon) statusIcon.hidden = !confirmed || message === '';
  }

  /**
   * Paints the counter, and announces it only when it becomes news.
   *
   * Two moments qualify: entering the last {@link ANNOUNCE_FROM} characters,
   * and reaching the cap. Everything between is visible and silent — a live
   * region that spoke on every keystroke would talk over the reader mid-word.
   */
  function paintCount(): void {
    if (!field || !count) return;
    const left = NOTE_MAX_CHARS - field.value.length;
    count.textContent = `${left} characters left`;
    const band = left === 0 ? 'full' : left <= ANNOUNCE_FROM ? 'near' : '';
    if (band === announcedBand) return;
    announcedBand = band;
    if (band === 'full') say('No characters left in this note.');
    else if (band === 'near') say(`${left} characters left.`);
    else say('');
  }

  /** Reflects the stored note onto the field, the replay and Delete. */
  function paint(): void {
    if (!field) return;
    const stored = readNote(slug);
    // Unsaved typing wins over storage: see `dirty`. Everything else on the
    // block still repaints, so Delete and the replay stay true either way.
    if (!dirty) field.value = stored ?? '';
    removeBtn?.setAttribute('aria-disabled', stored ? 'false' : 'true');
    if (recall) {
      // The replay is the payoff, so it appears where the payoff is: on a
      // review visit, with something to replay. On an ordinary visit the
      // reader's words are already in the box below it, and quoting them
      // twice would be noise.
      const replay = isReview && stored;
      recall.textContent = replay ? `You wrote last time: “${stored}”` : '';
      recall.hidden = !replay;
    }
    paintCount();
  }

  /**
   * Clones the box into the page, once, and wires it up.
   *
   * Inserted after the template so it lands where this component was mounted —
   * below "What's next", clear of the button that reveals it, so nothing the
   * reader is looking at moves under them when it appears.
   */
  function mount(): void {
    if (box) return;
    const fragment = template!.content.cloneNode(true) as DocumentFragment;
    const root = fragment.querySelector<HTMLElement>('[data-explain-back]');
    if (!root) return;

    field = root.querySelector<HTMLTextAreaElement>('[data-explain-field]');
    recall = root.querySelector<HTMLElement>('[data-explain-recall]');
    count = root.querySelector<HTMLElement>('[data-explain-count]');
    removeBtn = root.querySelector<HTMLElement>('[data-explain-delete]');
    statusText = root.querySelector<HTMLElement>('[data-explain-status-text]');
    statusIcon = root.querySelector<HTMLElement>('[data-explain-status-icon]');
    const saveBtn = root.querySelector<HTMLElement>('[data-explain-save]');
    if (!field || !saveBtn || !removeBtn) return;

    field.addEventListener('input', () => {
      dirty = true;
      // A confirmation describes the note as it was SAVED, so editing makes
      // it stale: clear it rather than leave "Saved" beside text that is not.
      if (statusIcon && !statusIcon.hidden) say('');
      paintCount();
    });

    saveBtn.addEventListener('click', () => {
      const typed = field!.value.trim();
      if (typed.length === 0) {
        // Nothing to keep, and nothing claimed: an empty box is not a delete
        // (Delete is its own button, beside this one) and not a save either.
        say('Nothing to save yet — the note is empty.');
        return;
      }
      // The store returns what actually landed, so a blocked or full device
      // gets the honest sentence rather than a promise (MarkComplete's rule).
      const saved = writeNote(slug, typed);
      announcedBand = '';
      if (saved === null) {
        // Still dirty: nothing landed, so the reader's text stays theirs to
        // copy elsewhere rather than being tidied away by the next repaint.
        say('Not saved — this browser is not letting the page store it.');
        return;
      }
      dirty = false;
      paint();
      say('Saved. Only in this browser.', true);
    });

    removeBtn.addEventListener('click', () => {
      if (removeBtn!.getAttribute('aria-disabled') === 'true') return;
      const gone = deleteNote(slug);
      announcedBand = '';
      // A delete the reader asked for empties the box, typing included: that
      // is the act, and leaving their words on screen beside "deleted" would
      // contradict it.
      dirty = false;
      paint();
      // Focus stays on this button (it is `aria-disabled`, never `disabled`),
      // so the reader who just deleted their note is not dropped onto <body>.
      say(
        gone
          ? 'Note deleted from this browser.'
          : 'Not deleted — this browser is not letting the page change it.',
        gone,
      );
    });

    template!.insertAdjacentElement('afterend', root);
    box = root;
    paint();
  }

  /** Takes the box away again — nothing stored, nothing to show. */
  function unmount(): void {
    box?.remove();
    box = null;
    field = null;
    recall = null;
    count = null;
    removeBtn = null;
    statusText = null;
    statusIcon = null;
    announcedBand = '';
    dirty = false;
  }

  /**
   * The reveal rule: the reader has said they finished this lesson, OR they
   * have a note here already.
   *
   * The second half is what keeps their words reachable after they un-tick
   * completion — changing your mind about finishing a lesson must not hide the
   * sentence you wrote, or the Delete button that removes it.
   *
   * Both halves are storage READS, so a blocked store answers "no" and the box
   * stays away rather than appearing and promising a save it cannot keep.
   */
  function sync(): void {
    if (isComplete(slug) || readNote(slug) !== null) {
      if (box) paint();
      else mount();
    } else {
      unmount();
    }
  }

  sync();

  // MarkComplete emits no event, so its act is observed the way the design
  // specifies: one delegated click listener. A listener on `document` runs in
  // the BUBBLE phase, after the button's own handler, so the completion this
  // click wrote is already in storage by the time this re-reads it.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-mark-complete]')) sync();
  });

  // A back/forward-cache restore replays no script, so a reader who cleared
  // their progress on `/learn` and came Back would otherwise meet a box the
  // device no longer has anything for.
  onRestore(sync);
}
