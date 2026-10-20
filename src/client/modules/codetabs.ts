// Client module for tabbed code samples (`src/components/CodeTabs.tsx`): the
// legacy `CodeTabs.astro` `<script>`, moved verbatim (React migration plan §5
// P2 WS-C step 4). Loaded as a `<script type="module">` on every page that
// renders the component.
// Progressive enhancement: WAI-ARIA tab behavior + copy. Without this script
// the noscript fallback shows all panels; with it, the tabs are interactive.

// SPEC-GAP: `pref:code-lang` is an enumerated §6 *preference* key (amended for
// M7.2). It holds the Shiki `lang` id of the last tab the reader chose — an
// explicit user act, never an inference — so the language follows them across
// groups and lessons. Being a preference, the reset-progress control
// deliberately never clears it.
const LANG_KEY = 'pref:code-lang';

/** Same-page sync channel: one group's choice re-selects every sibling group. */
const LANG_EVENT = 'codetabs:lang';

/** How long a copy result — success OR failure — stays on the button. */
const RESULT_MS = 1500;

/** Reads the stored language; `null` when nothing is stored or storage is blocked. */
function readLang(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    // Private mode / blocked storage: the server-rendered default stands.
    return null;
  }
}

/** Persists the language; a blocked store just means the choice lasts one page. */
function writeLang(lang: string): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Same as above — the in-page selection still works, it just won't survive.
  }
}

// One storage read for the whole page, taken before any group is wired up.
const storedLang = readLang();

const groups = document.querySelectorAll<HTMLElement>('[data-codetabs]');

groups.forEach((group) => {
  const tabs = Array.from(
    group.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  );
  const panels = Array.from(
    group.querySelectorAll<HTMLElement>('[role="tabpanel"]'),
  );
  const status = group.querySelector<HTMLElement>('[data-copy-status]');

  /** Selects tab `index`, updating aria + roving tabindex + panel visibility. */
  function select(index: number, focus = true): void {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      panels[i]?.toggleAttribute('hidden', !selected);
    });
    if (focus) tabs[index]?.focus();
  }

  /** Index of the tab for `lang` in THIS group, or -1 when it has no such tab. */
  function indexOfLang(lang: string | null | undefined): number {
    if (!lang) return -1;
    return tabs.findIndex((tab) => tab.dataset['lang'] === lang);
  }

  /**
   * A selection the reader asked for (click or arrow key): select it, remember
   * the language, and tell the other groups on the page so one lesson never
   * shows Python in one block and Java in the next.
   */
  function selectByUser(index: number): void {
    select(index);
    const lang = tabs[index]?.dataset['lang'];
    if (!lang) return;
    writeLang(lang);
    document.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: lang }));
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectByUser(i));
    tab.addEventListener('keydown', (event) => {
      let next: number;
      if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (event.key === 'ArrowLeft')
        next = (i - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      // Arrow keys activate automatically here, so this IS a language choice
      // and persists exactly like a click.
      selectByUser(next);
    });
  });

  // Sibling sync. `focus = false` is load-bearing twice: the reader is
  // interacting with ANOTHER group (moving focus would yank them out of it),
  // and re-applying to the origin group must stay a no-op.
  document.addEventListener(LANG_EVENT, (event) => {
    const index = indexOfLang((event as CustomEvent<string>).detail);
    if (index >= 0) select(index, false);
  });

  // Restore the remembered language. Index 0 is what the HTML already shows,
  // so only a real change touches the DOM — and never with focus: stealing it
  // on load would drag the reader down to the first code block. `select()`
  // rewrites the whole roving tabindex, so the restored tab becomes the single
  // tabbable one and the arrow-key behavior stays intact.
  const restore = indexOfLang(storedLang);
  if (restore > 0) select(restore, false);

  // Copy buttons: read the highlighted <pre> text, then report the outcome on
  // the button (sighted) and through role=status (assistive tech).
  group
    .querySelectorAll<HTMLButtonElement>('.codetabs__copy')
    .forEach((button) => {
      const label = button.querySelector('.codetabs__copy-label');
      // Per-button timer: a second click must cancel the first revert, or the
      // earlier timeout would wipe the newer result mid-flight.
      let revert = 0;

      /**
       * Shows one copy outcome in both channels, then clears itself.
       *
       * Failure gets the SAME visible treatment and the SAME timeout as
       * success (CMP-9): writing only to the sr-only node left a sighted
       * reader looking at an unchanged "Copy" button and assuming the code was
       * on their clipboard, and a failure branch with no timeout could leave a
       * stale "Copy failed" announcement sitting under a later success.
       *
       * @param text - Visible button label for the outcome.
       * @param message - What the sr-only `role="status"` node announces.
       * @param failed - Whether this is the failure state (drives the glyph
       * swap and `--accent-warn` styling; never the only signal).
       */
      function report(text: string, message: string, failed: boolean): void {
        if (label) label.textContent = text;
        button.toggleAttribute('data-copy-failed', failed);
        if (status) status.textContent = message;
        window.clearTimeout(revert);
        revert = window.setTimeout(() => {
          if (label) label.textContent = 'Copy';
          button.removeAttribute('data-copy-failed');
          if (status) status.textContent = '';
        }, RESULT_MS);
      }

      button.addEventListener('click', async () => {
        const pre = button.parentElement?.querySelector('pre');
        const code = pre?.textContent ?? '';
        try {
          await navigator.clipboard.writeText(code);
          report('Copied', 'Code copied to clipboard', false);
        } catch {
          // Clipboard blocked (insecure context, permissions, embedded
          // webview) — or missing entirely, which throws here too. The code
          // stays on screen to select manually; say so where it can be seen.
          report(
            'Copy failed',
            'Copy failed — select the code to copy manually',
            true,
          );
        }
      });
    });
});

// A module, not a global script: its top-level names stay its own.
export {};
