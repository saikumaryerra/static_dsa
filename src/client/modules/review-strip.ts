// Client module for the review strip on `/learn/`
// (`src/components/ReviewStrip.tsx`): the legacy `ReviewStrip.astro`
// `<script>`, moved verbatim (React migration plan §5 P3, the step-4 rule of
// P2) except for the edits that rule names: the never-fired `astro:page-load`
// listener is gone, and links are built with the root-absolute
// `lessonHref(slug)`/`reviewHref(slug)` instead of joining onto a runtime site
// root. Loaded as a `<script type="module">` on every page that renders it.
/**
 * The review strip's island: derive what is due, build the strip, insert it.
 *
 * Every rule about WHAT is due lives in `src/lib/progress.ts` — the intervals,
 * the clamp, the two-card cap and the words — so this file only ever decides
 * where the nodes go. Deriving on each render (rather than storing a queue) is
 * what makes two open tabs impossible to disagree: neither of them wrote one.
 */
import {
  onRestore,
  parseLessonRefs,
  PROGRESS_RESET_EVENT,
  readNote,
  REVIEW_COPY,
  reviewHref,
  selectDueReviews,
  type LessonRef,
} from '../../lib/progress';

/** Links the section to its heading; one strip per page, so one id is enough. */
const HEADING_ID = 'review-strip-heading';

/**
 * The slugs currently drawn, so an unchanged queue is left alone.
 *
 * Not an optimisation: the repaint hooks below fire on a page that is already
 * live and may hold focus, and replacing a card with an identical new node
 * would drop that focus onto `<body>` mid-keyboard-navigation.
 */
let rendered: string | null = null;

/**
 * One card: the whole thing is the link, its text is its accessible name —
 * followed, where the reader left one, by their own note as a sibling of that
 * link rather than a child of it (see the note-replay paragraph above).
 */
function card(lesson: LessonRef): HTMLLIElement {
  const item = document.createElement('li');

  const link = document.createElement('a');
  link.className = 'track-card review-strip__card';
  link.href = reviewHref(lesson.slug);
  link.setAttribute('data-review-card', lesson.slug);

  const text = document.createElement('span');
  text.className = 'review-strip__text';

  const title = document.createElement('span');
  title.className = 'review-strip__lesson';
  title.textContent = lesson.title;

  const check = document.createElement('span');
  check.className = 'review-strip__check';
  check.textContent = REVIEW_COPY.check;

  text.append(title, check);

  const arrow = document.createElement('span');
  arrow.className = 'review-strip__arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';

  link.append(text, arrow);
  item.append(link);

  // The replay, when there is one. Plain text in a <p>: the reader's sentence
  // is neither edited nor truncated in the DOM — the three-line clamp is CSS,
  // so a screen reader still reads the whole note, and following the card
  // reaches the box that holds it in full.
  const note = readNote(lesson.slug);
  if (note) {
    const wrote = document.createElement('p');
    wrote.className = 'review-strip__wrote';
    wrote.setAttribute('data-review-note', lesson.slug);
    wrote.textContent = `${REVIEW_COPY.wrote} ${note}`;
    item.append(wrote);
  }
  return item;
}

/** The whole strip for a non-empty queue. */
function build(due: LessonRef[]): HTMLElement {
  const strip = document.createElement('section');
  strip.className = 'review-strip';
  strip.setAttribute('data-review-strip', '');
  strip.setAttribute('aria-labelledby', HEADING_ID);

  const heading = document.createElement('h2');
  heading.className = 'review-strip__heading';
  heading.id = HEADING_ID;
  heading.textContent = REVIEW_COPY.heading;

  const note = document.createElement('p');
  note.className = 'review-strip__note';
  note.textContent = REVIEW_COPY.note;

  const list = document.createElement('ul');
  list.className = 'review-strip__list';
  // Explicit `role`: Safari drops list semantics from a `list-style: none`
  // list, and the count of what is on offer is the one thing this strip
  // genuinely owes a screen-reader user.
  list.setAttribute('role', 'list');
  for (const lesson of due) list.append(card(lesson));

  strip.append(heading, note, list);
  return strip;
}

/**
 * Redraws the strip from storage — or removes it, or does nothing at all.
 *
 * Nothing due means no nodes: not a hidden container, not an empty state.
 */
function render(): void {
  const host = document.querySelector<HTMLElement>('[data-lessons]');
  if (!host) return; // not `/learn` (or no injected list): leave the page alone
  const due = selectDueReviews(parseLessonRefs(host.dataset['lessons']));
  // The note is part of the signature, not just the slug: a reader who writes
  // or deletes one on a lesson page and comes Back lands on this page from the
  // back/forward cache, where `rendered` still holds what was drawn before
  // they left — so a slug-only signature would leave their old words (or none)
  // quoted under the card. At most two due lessons, so at most two reads.
  const signature = due
    .map((lesson) => `${lesson.slug}\n${readNote(lesson.slug) ?? ''}`)
    .join('\n');

  const existing = document.querySelector<HTMLElement>('[data-review-strip]');
  if (existing && signature === rendered) return;
  existing?.remove();
  rendered = signature;
  if (due.length === 0) return;

  host.insertAdjacentElement('afterend', build(due));
}

render();
// A back/forward-cache restore replays no script, so a reader who reviewed a
// lesson and came Back would still be invited to review it.
onRestore(render);
// The reset control lives in `/learn`'s own island and deletes the records
// this strip is derived from. Nothing else would tell this one, and a strip
// left standing after a reset would invite the reader to review a lesson the
// device has just forgotten.
document.addEventListener(PROGRESS_RESET_EVENT, render);
