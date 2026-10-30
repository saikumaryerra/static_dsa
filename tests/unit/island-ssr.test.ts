/**
 * Server rendering of islands and slots (React migration, D-04 / D-07). Node
 * only: `react-dom/server` needs no DOM.
 *
 * - `<Island>` renders the container element ITSELF (no wrapper), carrying
 *   `data-island` and the escaped JSON props, with the component's ISOLATED
 *   `renderToString` output inside — the exact string the client hydrates
 *   against.
 * - `<Bench>` routes `slot="stage"` children into the stage column and strips
 *   the attribute, as Astro's named slots did.
 */
import {
  createContext,
  createElement as h,
  useContext,
  type ReactElement,
} from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Bench from '../../src/components/Bench';
import { Island } from '../../src/render/Island';
import {
  createRenderContext,
  RenderContextProvider,
  type RenderContext,
} from '../../src/render/context';

const Probe = createContext('outside');

/** A tiny island: reads its props and a context it must NOT see. */
function Counter({
  label,
  start,
}: {
  label: string;
  start: number;
}): ReactElement {
  const seen = useContext(Probe);
  return h(
    'button',
    { type: 'button', 'data-seen': seen },
    `${label} ${start}`,
  );
}

/**
 * Render inside a page context, as the SSR entry does.
 *
 * @param element - What to render.
 * @returns HTML and the context it recorded into.
 */
function page(element: ReactElement): {
  html: string;
  context: RenderContext;
} {
  const context = createRenderContext('/learn/x/', 'https://learndsa.invalid');
  const html = renderToStaticMarkup(
    h(
      Probe.Provider,
      { value: 'page' },
      h(RenderContextProvider, { value: context }, element),
    ),
  );
  return { html, context };
}

describe('<Island>', () => {
  const props = { label: 'a "quoted" </script> & more', start: 3 };

  it('renders the container as the root, with the isolated render inside', () => {
    const { html, context } = page(
      h(Island<typeof props>, {
        name: 'counter',
        component: Counter,
        props,
        as: 'section',
        rootProps: { className: 'viz', id: 'viz-x', 'data-viz': '' },
        assets: ['src/viz/algorithms/x.ts'],
      }),
    );
    const isolated = renderToString(h(Counter, props));
    expect(html.startsWith('<section class="viz" id="viz-x" data-viz=""')).toBe(
      true,
    );
    expect(html).toContain('data-island="counter"');
    expect(html.endsWith(`>${isolated}</section>`)).toBe(true);
    // No context leaks in: the island rendered with the default value.
    expect(isolated).toContain('data-seen="outside"');
    expect(context.islands).toEqual(['counter']);
    expect([...(context.islandAssets.get('counter') ?? [])]).toEqual([
      'src/viz/algorithms/x.ts',
    ]);
  });

  it('serializes props as escaped JSON that round-trips', () => {
    const { html } = page(
      h(Island<typeof props>, { name: 'counter', component: Counter, props }),
    );
    const raw = /data-props="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(raw).not.toContain('<');
    expect(raw).not.toContain('"');
    const decoded = raw
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&');
    expect(JSON.parse(decoded)).toEqual(props);
  });

  it('omits data-props when the client rebuilds props from the root', () => {
    const { html } = page(
      h(Island<typeof props>, {
        name: 'counter',
        component: Counter,
        props,
        serializeProps: false,
      }),
    );
    expect(html).not.toContain('data-props');
  });
});

describe('<Bench>', () => {
  it('moves slot="stage" children to the stage column and strips `slot`', () => {
    const { html } = page(
      h(
        Bench,
        { id: 'visualizer' },
        h('p', null, 'Prose.'),
        h('div', { id: 'viz-x', slot: 'stage' }, 'Stage.'),
        h('p', null, 'More prose.'),
      ),
    );
    expect(html).toBe(
      '<div class="bench" id="visualizer"><div class="bench__read"><p>Prose.</p><p>More prose.</p></div><div class="bench__stage"><div id="viz-x">Stage.</div></div></div>',
    );
    expect(html).not.toContain('slot=');
  });

  it('renders the solo variant', () => {
    const { html } = page(h(Bench, { solo: true }, 'x'));
    expect(html.startsWith('<div class="bench bench--solo">')).toBe(true);
  });
});
