// Client module for prose links into a ledger row (`src/components/StepLink.tsx`):
// the legacy `StepLink.astro` `<script>`, moved verbatim (React migration plan
// §5 P2 WS-I step 6). Loaded as a `<script type="module">` on every page that
// renders the component. It drives the Visualizer island only through the DOM
// — it clicks the row's own seek button — never through the island's internals
// (plan §2.3).
/**
 * Landing a prose jump on a table row that three things are sitting on top of.
 *
 * A `<StepLink>` is a DOCUMENT jump into a row that lives inside a scrollable
 * well inside a collapsed `<details>`, under a sticky page header and (below
 * 1024px) a sticky mini-ToC bar. Measured on the built site, at 900x800 with
 * the ledger's own `<tr>` carrying no offset, the target row landed at y=18.7
 * with the header ending at 64 and the ToC bar at 109 — the row was entirely
 * behind the chrome — and the well's sticky header ROW was sitting on it as
 * well. Two occluders, and the browser's own behaviour is not consistent
 * enough to build on: the same jump scrolled the well on one page and left it
 * at 0 on another, so which row you arrive at was luck.
 *
 * So the offset is declared TWICE, on purpose, and neither copy is redundant:
 *
 *   - `scroll-margin-top` on the row (`ledger.css`) is the whole fix for a
 *     reader with no JavaScript, and it is the SOURCE OF TRUTH — this script
 *     reads it back with `getComputedStyle` rather than restating the
 *     arithmetic, exactly as the lesson scroll-spy reads the same property off
 *     a heading so the highlight and the jump cannot disagree.
 *   - this handler takes over the click so the sequence is deterministic:
 *     open the disclosure, correct the WELL first (its scroll changes where
 *     the row is), then scroll the document, then put focus on the step's own
 *     seek button so the arrival is announced and visible.
 *
 * The well is corrected by adjusting `scrollTop`, never `scrollIntoView`,
 * which is the rule `markLedgerRow` already follows: `scrollIntoView` walks
 * EVERY scrollable ancestor and would drag the page away from the drawing the
 * row describes.
 *
 * WHAT IT NEVER DOES: seek the player. The link is navigation — it takes you
 * to where the step is written down, and the row's own button (now focused)
 * is what moves the drawing. Making one link do both would give it a
 * behaviour its JS-off self cannot have.
 */
const SELECTOR = 'a[data-step-link]';

/** The sticky offset the CSS already declares for this element, in px. */
function stickyOffset(element: Element): number {
  return parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
}

/**
 * Scrolls the ledger's well so `row` is clear of its sticky header row.
 *
 * Centred rather than aligned to the top, which is what `markLedgerRow` does
 * for the same reason: the header row is sticky at the top of the well, so a
 * top-aligned row lands underneath it.
 */
function revealInWell(row: HTMLElement): void {
  const well = row.closest<HTMLElement>('[data-ledger-well]');
  if (!well) return;
  const head = well.querySelector<HTMLElement>('thead th');
  const rowBox = row.getBoundingClientRect();
  const wellBox = well.getBoundingClientRect();
  // The band the sticky header row occupies is unusable space at the top.
  const usableTop = wellBox.top + (head?.getBoundingClientRect().height ?? 0);
  if (rowBox.top >= usableTop && rowBox.bottom <= wellBox.bottom) return;
  well.scrollTop +=
    rowBox.top - wellBox.top - (wellBox.height - rowBox.height) / 2;
}

/** Opens every `<details>` between `element` and the document. */
function openAncestors(element: Element): void {
  let details = element.closest('details');
  while (details) {
    details.open = true;
    details = details.parentElement?.closest('details') ?? null;
  }
}

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  // Let the browser keep its own affordances: a modified click opens a tab.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest<HTMLAnchorElement>(SELECTOR);
  if (!link) return;

  const rowId = decodeURIComponent(link.getAttribute('href')?.slice(1) ?? '');
  const row = document.getElementById(rowId);
  const instrument = document.getElementById(link.dataset['stepLink'] ?? '');
  // Nothing to land on: leave the browser to it rather than swallowing the
  // click. The e2e suite is what makes sure this branch is unreachable.
  if (!row && !instrument) return;

  const ledger = row?.closest<HTMLElement>('[data-ledger]');
  // Predict mode hides the ledger, because the table is its answer key — so
  // the row exists but must not be shown. The reader still gets an answer to
  // "where is that step written down?": the instrument's own note, which is
  // visible only while the mode is on and says why the table is gone. A link
  // that quietly did nothing here would be the worst of the three options.
  const shown = !!row && !!ledger && !ledger.hidden;
  const fallback =
    instrument?.querySelector<HTMLElement>(
      '[data-viz-predict-note]:not([hidden])',
    ) ?? instrument;
  const destination = shown ? row! : fallback;
  if (!destination) return;

  event.preventDefault();
  if (shown) {
    openAncestors(row!);
    revealInWell(row!);
  }

  // The offset lives on the row (or on the instrument, for the fallback) —
  // read, never restated. Measured AFTER the well moved, because that is what
  // decides where the row now is.
  const offsetSource = row ?? instrument!;
  const top =
    window.scrollY +
    destination.getBoundingClientRect().top -
    stickyOffset(offsetSource);
  // No `behavior`, so this inherits `scroll-behavior` from the page: smooth
  // where motion is welcome, instant under `prefers-reduced-motion: reduce`.
  window.scrollTo({ top: Math.max(0, top) });

  // Native anchors push a history entry, and losing that would make the back
  // button leave the lesson instead of returning the reader to the sentence
  // they clicked from. Guarded because a rejected pushState must not take the
  // scroll with it.
  try {
    history.pushState(null, '', link.getAttribute('href'));
  } catch {
    /* A blocked history write costs the address bar, nothing else. */
  }

  // Arrival, said twice: a visible focus ring and an announced control.
  //
  // The seek button is `disabled` until the island enables it, and a disabled
  // control cannot take focus — so the well (a named, reachable scroll region
  // since Task 3) takes it instead, and it is never nothing. That fallback is
  // the COMMON case, not an edge: the island mounts from an
  // `IntersectionObserver`, so an instrument the reader has never scrolled to
  // is still inert at the moment its link is clicked — this jump is what
  // brings it into view and starts it. The button branch is for the reader who
  // has already been down there and come back to the prose.
  const seek = shown
    ? row!.querySelector<HTMLButtonElement>('[data-ledger-seek]')
    : null;

  // AND DRIVE THE DRAWING (redesign 2026-08). The link has always been able to
  // put the reader in front of the row; with the instrument pinned beside the
  // prose at ≥1200px, the drawing that row describes is now ON SCREEN while
  // they read the sentence — so landing on the row and leaving the picture at
  // whatever step it happened to be showing is a half-kept promise.
  //
  // This clicks the row's own seek button rather than calling the player,
  // because that button is the one path the island already owns: it declines
  // while Predict is on (scrubbing past a question is what the mode exists to
  // prevent), it marks the row, and it keeps the current row inside the well.
  // Re-implementing any of that here would be a second definition of "go to
  // step n". It is `disabled` until the island enables it, which is exactly
  // the condition under which there is no player to drive yet.
  if (seek && !seek.disabled) seek.click();

  const focusTarget =
    seek && !seek.disabled
      ? seek
      : (row?.closest<HTMLElement>('[data-ledger-well]') ?? null);
  focusTarget?.focus({ preventScroll: true });
});
