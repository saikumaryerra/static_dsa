// Client module for the glossary filter (`src/pages/Glossary.tsx`): the legacy
// `src/pages/glossary.astro` `<script>`, moved verbatim (React migration plan
// §5 P3, the step-4 rule of P2) except for the edits that rule names: the
// never-fired `astro:page-load` listener is gone, and links are built with the
// root-absolute `lessonHref(slug)`/`reviewHref(slug)` instead of joining onto a
// runtime site root. Loaded as a `<script type="module">` on every page that
// renders it.
/**
 * Glossary filter (redesign 2026-08) — spec §19's deferred "glossary search
 * island", resolved.
 *
 * It filters MARKUP THAT IS ALREADY ON THE PAGE. There is no index, no fetch,
 * no store and no debounce timer: forty-six `data-haystack` strings are
 * compared with `includes` on every keystroke, which is well inside a frame,
 * and building an index would be more code than the search it serves.
 *
 * Progressive enhancement, in the site's usual shape: the form ships `hidden`
 * and this script reveals it, so a reader with JavaScript off — or with this
 * chunk still in flight — never meets a text field that cannot filter. The
 * complete A–Z list and its jump nav are what the page IS; the filter only
 * ever hides parts of it, and clearing the field restores every one.
 *
 * WHAT IT MATCHES: the term, its aliases, and its definition — composed at
 * build time into `data-haystack`, lowercased there so this runs no per-key
 * normalisation. Matching the definition is deliberate: a reader who half
 * remembers "the one about wrapping around" finds `Circular buffer`, which is
 * the case a term-only match would fail.
 *
 * The A–Z nav is HIDDEN while a filter is active, because its chips jump to
 * letters that may now be empty — a control that cannot do what it says is the
 * thing every kill-switch on this site exists to prevent.
 */
const form = document.querySelector<HTMLElement>('[data-glossary-search]');
const input = document.querySelector<HTMLInputElement>('[data-glossary-input]');
const clear = document.querySelector<HTMLButtonElement>(
  '[data-glossary-clear]',
);
const status = document.querySelector<HTMLElement>('[data-glossary-status]');
const noMatch = document.querySelector<HTMLElement>('[data-glossary-nomatch]');
const jump = document.querySelector<HTMLElement>('[data-glossary-jump]');
const sections = [
  ...document.querySelectorAll<HTMLElement>('[data-glossary-section]'),
];
const entries = [
  ...document.querySelectorAll<HTMLElement>('[data-glossary-entry]'),
];

if (form && input && clear && status && noMatch && entries.length > 0) {
  // The one thing that makes the control real. Everything below assumes it.
  form.hidden = false;

  /** "1 term" / "12 terms" — a count in words, never a ratio (calm invariant). */
  const termCount = (n: number): string => `${n} term${n === 1 ? '' : 's'}`;

  function apply(): void {
    const query = input!.value.trim().toLowerCase();
    clear!.hidden = query === '';

    if (query === '') {
      for (const entry of entries) entry.hidden = false;
      for (const section of sections) section.hidden = false;
      if (jump) jump.hidden = false;
      noMatch!.hidden = true;
      // Empty, not "46 terms": the resting state of the page is not news, and
      // announcing it on every clear would talk over the reader.
      status!.textContent = '';
      return;
    }

    let shown = 0;
    for (const entry of entries) {
      const hit = (entry.dataset['haystack'] ?? '').includes(query);
      entry.hidden = !hit;
      if (hit) shown += 1;
    }
    // A letter with nothing left to show goes too, heading and all.
    for (const section of sections) {
      section.hidden = !section.querySelector(
        '[data-glossary-entry]:not([hidden])',
      );
    }
    if (jump) jump.hidden = true;

    status!.textContent = `${termCount(shown)} matching “${input!.value.trim()}”`;
    noMatch!.hidden = shown > 0;
    if (shown === 0) {
      noMatch!.textContent = `Nothing matches “${input!.value.trim()}”. Try a shorter word — the filter looks at each term, its other names, and its definition.`;
    }
  }

  input.addEventListener('input', apply);
  clear.addEventListener('click', () => {
    input!.value = '';
    apply();
    input!.focus();
  });
  // Escape clears rather than blurring, which is what a reader who has filtered
  // themselves into a corner reaches for. `type="search"` gives Escape this
  // meaning natively in some browsers and not others; this makes it uniform.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input!.value !== '') {
      event.preventDefault();
      input!.value = '';
      apply();
    }
  });
}

// A module, not a global script: its top-level names stay its own.
export {};
