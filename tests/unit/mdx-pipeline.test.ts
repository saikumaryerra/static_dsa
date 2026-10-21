/**
 * The lesson MDX pipeline (React migration, D-07): Astro 7's remark/rehype
 * chain, reproduced. The build-level proof is `proseHash` for all 127 lessons
 * (`scripts/migration/inventory.mjs --compare`); these are the unit-sized
 * pins for each stage, so a regression names the stage that broke.
 *
 * Each case compiles a small MDX document with the real `mdxOptions`, runs it
 * with React's runtime and renders it with `renderToStaticMarkup` — the same
 * path a lesson takes through the SSR build, minus Vite.
 */
import { compile, run } from '@mdx-js/mdx';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as runtime from 'react/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { lessonBody } from '../../src/mdx/remark-lesson-body';
import { mdxOptions } from '../../src/mdx/pipeline';

/** What a compiled lesson exports. */
interface Compiled {
  html: string;
  frontmatter: unknown;
  body: string;
  headings: { depth: number; slug: string; text: string }[];
}

/**
 * Compile, run and render one MDX source.
 *
 * @param source - MDX text.
 * @returns The rendered HTML and the named exports.
 */
async function render(source: string): Promise<Compiled> {
  const code = await compile(
    { value: source, path: 'fixture.mdx' },
    { ...mdxOptions, outputFormat: 'function-body' },
  );
  const module = (await run(code, {
    ...runtime,
    baseUrl: import.meta.url,
  })) as unknown as Omit<Compiled, 'html'> & { default: ComponentType };
  return {
    html: renderToStaticMarkup(createElement(module.default)),
    frontmatter: module.frontmatter,
    body: module.body,
    headings: module.headings,
  };
}

const FRONTMATTER = "---\ntitle: 'Fixture'\nslug: 'fixture'\n---\n";

describe('frontmatter and body exports', () => {
  it('exports the frontmatter and Astro’s trimmed body', async () => {
    const source = `${FRONTMATTER}\n# Hello {frontmatter.slug}\n\nText.\n`;
    const out = await render(source);
    expect(out.frontmatter).toEqual({ title: 'Fixture', slug: 'fixture' });
    expect(out.body).toBe('# Hello {frontmatter.slug}\n\nText.');
    expect(lessonBody(source)).toBe(out.body);
    // `{frontmatter.x}` evaluates in the body, as 381 lesson lines rely on.
    expect(out.html).toContain('Hello fixture');
  });
});

describe('smartypants', () => {
  it('curls quotes and converts dashes and ellipses (default options)', async () => {
    // Default smartypants: `--` is an em dash and `---` is left alone — the
    // behaviour every lesson was written and reviewed against.
    const { html } = await render(
      `${FRONTMATTER}\nIt's "quoted" -- and --- then...\n`,
    );
    expect(html).toContain('<p>It’s “quoted” — and --- then…</p>');
  });
});

describe('heading ids', () => {
  it('slugs headings with github-slugger, suffixing duplicates with -1', async () => {
    const { html, headings } = await render(
      `${FRONTMATTER}\n## Practice\n\n## Practice\n\n### What's next?\n`,
    );
    expect(html).toContain('<h2 id="practice">Practice</h2>');
    expect(html).toContain('<h2 id="practice-1">Practice</h2>');
    expect(html).toContain('<h3 id="whats-next">What’s next?</h3>');
    expect(headings.map((h) => [h.depth, h.slug])).toEqual([
      [2, 'practice'],
      [2, 'practice-1'],
      [3, 'whats-next'],
    ]);
  });

  it('includes inline code text in the id', async () => {
    const { html } = await render(
      `${FRONTMATTER}\n## Using \`kubectl apply\`\n`,
    );
    expect(html).toContain(
      '<h2 id="using-kubectl-apply">Using <code>kubectl apply</code></h2>',
    );
  });

  it('resolves {frontmatter.x} in a heading id the way Astro did', async () => {
    const { headings } = await render(
      `${FRONTMATTER}\n## About {frontmatter.title}\n`,
    );
    expect(headings[0]).toEqual({
      depth: 2,
      slug: 'about-fixture',
      text: 'About Fixture',
    });
  });
});

describe('the prose pass', () => {
  it('wraps a GFM table in a keyboard-reachable scroll container', async () => {
    const { html } = await render(
      `${FRONTMATTER}\n| a | b |\n|---|---|\n| 1 | 2 |\n`,
    );
    expect(html).toMatch(/^<div class="table-scroll" tabindex="0"><table>/);
  });

  it('turns a fence into pre.md-code with Shiki’s dual-theme spans', async () => {
    const { html } = await render(
      `${FRONTMATTER}\n\`\`\`yaml\nkind: Pod\n\`\`\`\n`,
    );
    const pre = /<pre([^>]*)>/.exec(html)?.[1] ?? '';
    // EXACTLY `md-code`: Shiki's own `shiki` class is overwritten by the
    // prose pass's `className` — the pre-existing defect plan §1 records and
    // the migration reproduces for parity.
    expect(pre).toMatch(/ class="md-code"/);
    expect(pre).toContain('tabindex="0"');
    expect(pre).toContain('data-language="yaml"');
    expect(pre).toContain(
      'style="background-color:#fff;--shiki-dark-bg:#0d1117;color:#24292e;--shiki-dark:#e6edf3;overflow-x:auto"',
    );
    expect(html).toMatch(
      /<span style="color:#[0-9A-F]{6};--shiki-dark:#[0-9A-F]{6}">/i,
    );
  });

  it('keeps a ```text fence’s authored language (Shiki special language)', async () => {
    const { html } = await render(
      `${FRONTMATTER}\n\`\`\`text\nplain\n\`\`\`\n`,
    );
    expect(html).toContain('data-language="text"');
  });

  it('falls back to plaintext for an unknown language', async () => {
    const { html } = await render(
      `${FRONTMATTER}\n\`\`\`no-such-language\nx\n\`\`\`\n`,
    );
    expect(html).toContain('data-language="plaintext"');
  });
});
