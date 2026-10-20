/**
 * CodeTabs — tabbed multi-language code, Shiki-highlighted (design §6.6, §9).
 * Ported from `CodeTabs.astro` (React migration P2); CSS in
 * `src/styles/components/code-tabs.css`, behaviour in the client module
 * `src/client/modules/codetabs.ts`.
 *
 * Props:
 * - `tabs` `{ label, lang, code }[]` — one fenced block per language. Highlighted
 *   at build time by the site's one Shiki highlighter (`highlightToHtml` in
 *   `src/lib/highlight.ts`, called with the options Astro's `<Code>` defaulted
 *   to, so the `<pre>` is the one `<Code>` emitted), and all tabs ship as static
 *   HTML. Dual themes (github-light / github-dark-default, `SHIKI_THEMES`) emit
 *   CSS-variable tokens that follow the site theme and both clear WCAG 1.4.3 for
 *   comments; the `.astro-code` dark wiring lives in global.css.
 *
 * WAI-ARIA Tabs: `role="tablist"` + roving-tabindex `role="tab"` buttons control
 * `role="tabpanel"`s (arrow keys wired in the script). Copy button per panel.
 * JS-off: the `<noscript>` kill-switch hides the tablist/copy and reveals every
 * panel stacked with a visible language heading (design §6.6 fallback).
 *
 * M7.2 adds two things, both script-side:
 * - **Language memory.** The chosen `lang` is stored in `pref:code-lang` and
 *   re-applied to every group on load (and to sibling groups instantly, via a
 *   `CustomEvent`), so a JavaScript reader stops re-picking the language on all
 *   21 groups across the 15 lessons. Each tab therefore carries `data-lang`.
 * - **Visible copy failure (CMP-9).** A blocked clipboard used to speak only
 *   through the sr-only status node, so a sighted reader saw "Copy" sitting
 *   there and assumed success; the button now says so too, with the same
 *   self-clearing timeout the success path has.
 */
import type { JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { highlightToHtml } from '../lib/highlight';
import { useClientModule, useRenderContext } from '../render/context';

/** One language's sample. */
export interface Tab {
  label: string;
  lang: string;
  code: string;
}

/** The legacy `<noscript>` block, verbatim. */
const NOSCRIPT = `<style>
    /* Kill-switch (mirrors ThemeToggle): without JS, tabs can't switch — show
       every panel stacked with its language heading, hide the tablist + copy. */
    .codetabs__tablist,
    .codetabs__copy {
      display: none !important;
    }
    /* \`@layer base\` is load-bearing, not decoration: Tailwind's preflight hides
       \`[hidden]\` with \`display: none !important\` from inside that layer, and for
       IMPORTANT declarations a layered rule beats an unlayered one no matter how
       specific the unlayered one is. Unlayered, this override silently lost and
       the JS-off fallback showed only the first language — the other two code
       blocks were unreachable without JS. Joining the same layer puts the two
       rules on equal footing, where this one's higher specificity (class +
       attribute vs \`[hidden]:where(…)\`) decides. Same preflight quirk
       MarkComplete.astro documents from the other direction. */
    @layer base {
      .codetabs__panel[hidden] {
        display: block !important;
      }
    }
    .codetabs__lang {
      position: static !important;
      width: auto !important;
      height: auto !important;
      clip: auto !important;
      clip-path: none !important;
      white-space: normal !important;
      margin: var(--space-4) 0 var(--space-2) !important;
      font-weight: var(--weight-semibold) !important;
      color: var(--text) !important;
    }
  </style>`;

/** The copy button's two glyphs and label (static; the module swaps them). */
function CopyButton({ label }: { label: string }): JSX.Element {
  return (
    <button
      type="button"
      className="codetabs__copy"
      aria-label={`Copy ${label} code`}
    >
      <svg
        className="codetabs__copy-icon codetabs__copy-icon--copy"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="6" y="6" width="12" height="14" rx="2" />
        <path d="M9 4h6v2H9z" />
      </svg>
      {/* Failure glyph — Callout's warning triangle, no new asset. Ships in the
          static HTML and is swapped in by CSS (mirrors MarkComplete's dual-icon
          pattern) so the failure state costs no runtime markup. */}
      <svg
        className="codetabs__copy-icon codetabs__copy-icon--failed"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3 2 20h20z" />
        <path d="M12 10v4" />
        <path d="M12 17h.01" />
      </svg>
      <span className="codetabs__copy-label">Copy</span>
    </button>
  );
}

/**
 * Tabbed, highlighted code.
 *
 * @param props - The tabs.
 * @returns The tab group and its `<noscript>` kill-switch.
 */
export default function CodeTabs({ tabs }: { tabs: Tab[] }): JSX.Element {
  useClientModule('codetabs');
  // Per-page counter (D-11) so multiple CodeTabs on a page get distinct id
  // bases WITHOUT Math.random() — deterministic build output, no collisions.
  const uid = `ct-${useRenderContext().uid()}`;
  return (
    <>
      <div className="codetabs" data-codetabs="">
        <div
          role="tablist"
          aria-label="Code language"
          className="codetabs__tablist"
        >
          {tabs.map((tab, i) => (
            <button
              key={tab.lang}
              type="button"
              role="tab"
              id={`${uid}-tab-${i}`}
              aria-controls={`${uid}-panel-${i}`}
              aria-selected={i === 0 ? 'true' : 'false'}
              tabIndex={i === 0 ? 0 : -1}
              className="codetabs__tab"
              data-lang={tab.lang}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {tabs.map((tab, i) => (
          // The panel's children are one HTML string: Shiki's `<pre>` must be
          // a direct child of the panel (the copy button reads it as
          // `parentElement.querySelector('pre')`, and `.codetabs pre` styles
          // it), and React cannot mix element children with raw HTML.
          <div
            key={tab.lang}
            role="tabpanel"
            id={`${uid}-panel-${i}`}
            aria-labelledby={`${uid}-tab-${i}`}
            tabIndex={0}
            className="codetabs__panel"
            hidden={i !== 0}
            dangerouslySetInnerHTML={{
              __html:
                renderToStaticMarkup(
                  <>
                    <p className="codetabs__lang" aria-hidden="true">
                      {tab.label}
                    </p>
                    <CopyButton label={tab.label} />
                  </>,
                ) +
                // `<Code>`'s defaults: light colours inline, no wrap.
                highlightToHtml(tab.code, tab.lang, {
                  defaultColor: 'light',
                  wrap: false,
                }),
            }}
          />
        ))}
        <p className="sr-only" role="status" data-copy-status=""></p>
      </div>
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
