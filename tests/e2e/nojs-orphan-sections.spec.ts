/**
 * WITH JAVASCRIPT OFF, EVERY LESSON HEADING STILL HAS A SECTION UNDER IT.
 *
 * This is a regression guard for a bug that has now shipped twice, both times in
 * the same shape: a component carries its own `<noscript>` kill-switch (the rule
 * every M8 component follows — `docs/m8-gamification.md`), the MDX author gives
 * it a heading, and with JS off the kill-switch takes the component while the
 * heading survives. What is left is a heading with nothing beneath it and two
 * dead table-of-contents entries pointing at it (the inline bar and the rail),
 * on every lesson that hosts one. It happened with Trace Trials, it happened
 * again with the Final Run, and both fixes were the same: author the component
 * HEADLESS, so heading, card and ToC entry live and die together
 * (`src/components/FinalRun.astro` records the rule at its own source).
 *
 * A code-review rule ("remember not to add a heading") is exactly the kind of
 * intention that erodes; this is the test that does not. It is deliberately
 * NOT scoped to M8: any future component with a kill-switch and a heading fails
 * it, which is the whole point.
 *
 * WHAT COUNTS AS "HAS A SECTION": rendered content. `innerText` alone would be a
 * false pass — it falls back to `textContent` for an element that is not being
 * rendered, so a kill-switched card reads back in full — so every candidate is
 * filtered through `checkVisibility()` first, and media (`svg`, `img`, …) counts
 * as content even when it carries no text. A heading whose own body is empty but
 * which owns sub-headings with content is FINE: `## Visualizer` above two `###`
 * sections is a correct outline, not an orphan.
 *
 * WHY JS OFF IS THE INTERESTING CASE (spec §4: "all prose/code must work with JS
 * disabled"): with JS on, every one of these components renders, so the outline
 * is trivially whole. The kill-switches are the only thing that can empty a
 * section, and they only fire here.
 */
import { expect, test, type Page } from '@playwright/test';
import { curriculum } from './utils/mastery';

/** One heading in a lesson body, with its section's rendered content measured. */
interface SectionAudit {
  /** The id the table of contents links to. */
  id: string;
  /** Heading text, for the failure message. */
  text: string;
  /** 2 for `<h2>`, 3 for `<h3>`, … */
  depth: number;
  /**
   * Rendered content units in this heading's section, INCLUDING its
   * sub-sections: one per non-empty rendered text run and one per rendered
   * media element. Zero means the reader sees a title and then the next title.
   */
  content: number;
}

/** The audit of one lesson page: its outline plus its in-page nav. */
interface PageAudit {
  sections: SectionAudit[];
  /** Every `href` on a `[data-toc-link]` — the inline bar's and the rail's. */
  tocLinks: string[];
  /** ToC hrefs whose target is missing from the document entirely. */
  danglingLinks: string[];
  /** ToC hrefs whose target element exists but is not being rendered. */
  hiddenTargets: string[];
}

/**
 * Walks one rendered lesson and reports its outline and its in-page nav.
 *
 * Runs in the page because it needs `checkVisibility()` — the difference between
 * "this section has content" and "this section has content in the markup".
 * `page.evaluate` still works with `javaScriptEnabled: false`: that flag stops
 * the PAGE's own scripts from executing, not the harness's evaluation.
 */
async function auditLesson(page: Page): Promise<PageAudit> {
  return page.evaluate(() => {
    const body = document.querySelector('.lesson-body');
    if (!body) {
      throw new Error(
        'No .lesson-body on this page — LessonLayout changed and this audit is looking at nothing.',
      );
    }

    const rendered = (element: Element): boolean =>
      element.checkVisibility({
        contentVisibilityAuto: true,
        opacityProperty: true,
        visibilityProperty: true,
      });

    const headings = [...body.querySelectorAll('h2, h3, h4, h5, h6')];
    /** Content attributed DIRECTLY to each heading (not to its sub-headings). */
    const own = headings.map(() => 0);

    // One document-order pass. Each node is charged to the most recent heading
    // seen before it, which is what "the section under this title" means in a
    // flat markdown body: MDX renders headings as siblings, not as wrappers.
    const walker = document.createTreeWalker(
      body,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );
    let index = -1;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Element) {
        const at = headings.indexOf(node);
        if (at !== -1) {
          index = at;
          continue;
        }
        // Media is content with no text of its own — the BFS and DFS sections of
        // the graph lesson are a heading and a visualization, nothing else.
        if (
          index >= 0 &&
          /^(img|svg|video|canvas|iframe)$/i.test(node.tagName) &&
          rendered(node)
        ) {
          own[index] += 1;
        }
        continue;
      }
      const text = (node.nodeValue ?? '').trim();
      const parent = node.parentElement;
      if (index < 0 || text.length === 0 || !parent) continue;
      // A heading's own words are the title, never its section's body.
      if (parent.closest('h1, h2, h3, h4, h5, h6')) continue;
      if (rendered(parent)) own[index] += 1;
    }

    const sections = headings.map((heading, i) => {
      const depth = Number(heading.tagName.slice(1));
      let content = own[i] ?? 0;
      // Roll sub-sections up: a section that delegates all its content to its
      // sub-headings is a correct outline, not an orphan.
      for (let j = i + 1; j < headings.length; j += 1) {
        const next = headings[j];
        if (!next || Number(next.tagName.slice(1)) <= depth) break;
        content += own[j] ?? 0;
      }
      return {
        id: heading.id,
        text: (heading.textContent ?? '').replace(/\s+/g, ' ').trim(),
        depth,
        content,
      };
    });

    const tocLinks = [
      ...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'),
    ].map((link) => link.getAttribute('href') ?? '');
    const danglingLinks: string[] = [];
    const hiddenTargets: string[] = [];
    for (const href of new Set(tocLinks)) {
      const target = href.startsWith('#')
        ? document.getElementById(href.slice(1))
        : null;
      if (!target) danglingLinks.push(href);
      else if (!rendered(target)) hiddenTargets.push(href);
    }

    return { sections, tocLinks, danglingLinks, hiddenTargets };
  });
}

test.describe('JavaScript disabled — no heading is left without its section', () => {
  test.use({ javaScriptEnabled: false });

  test('every lesson keeps a whole outline, and every ToC link lands in one', async ({
    page,
  }) => {
    // Read from the build-injected list rather than a literal: this must cover
    // the lessons that EXIST, including any added after this test was written.
    // The attribute is server-rendered, so it survives with no script.
    const lessons = await curriculum(page);
    expect(lessons.length, 'the curriculum must be readable').toBeGreaterThan(
      0,
    );

    // Every finding across every lesson, reported in ONE failure. A per-lesson
    // assertion would abort at the first offender, and this bug arrives by
    // COMPONENT: one authored heading is the same mistake on every lesson that
    // hosts that component (the Final Run's was six of them), so fixing them one
    // run at a time wastes a whole audit per lesson.
    const orphaned: string[] = [];
    const deadLinks: string[] = [];

    for (const lesson of lessons) {
      await page.goto(`/learn/${lesson.slug}`);
      const audit = await auditLesson(page);

      // DISCRIMINATOR: the audit found the page's real structure. A selector that
      // matched nothing would otherwise report a perfect outline for every
      // lesson forever. This one DOES fail fast — a broken audit invalidates
      // every finding after it.
      expect(
        audit.sections.length,
        `${lesson.slug} rendered no headings — the audit is looking at the wrong element`,
      ).toBeGreaterThan(3);
      expect(
        audit.tocLinks.length,
        `${lesson.slug} rendered no table-of-contents links`,
      ).toBeGreaterThan(3);

      // THE INVARIANT. A heading with nothing under it is a promise the page does
      // not keep — and with JS off it is always the same cause: a component was
      // switched off and its title was not.
      const reachable = new Set<string>();
      for (const section of audit.sections) {
        if (section.content > 0) {
          reachable.add(section.id);
          continue;
        }
        orphaned.push(
          `${lesson.slug}: h${section.depth} "${section.text}" (#${section.id})`,
        );
      }

      // …and neither table of contents may offer a way into one. A link to a
      // heading that is not rendered — or to a section with nothing in it — is
      // worse than no link: it looks like navigation and does nothing.
      for (const href of audit.danglingLinks) {
        deadLinks.push(`${lesson.slug}: ${href} → no such id on the page`);
      }
      for (const href of audit.hiddenTargets) {
        deadLinks.push(`${lesson.slug}: ${href} → target is not rendered`);
      }
      for (const href of new Set(audit.tocLinks)) {
        if (href.startsWith('#') && !reachable.has(href.slice(1))) {
          deadLinks.push(`${lesson.slug}: ${href} → section is empty`);
        }
      }
    }

    expect(
      orphaned,
      'heading(s) with an empty section with JS off. Author the component HEADLESS (it titles itself) so its heading and its ToC entry disappear with it — see the note at the top of src/components/FinalRun.astro.',
    ).toEqual([]);
    expect(
      deadLinks,
      'table-of-contents link(s) that lead nowhere with JS off',
    ).toEqual([]);
  });
});
