/**
 * `<Island>` — the server half of a hydrated component (React migration, D-04).
 *
 * CONTAINER-AS-ROOT. The island's container IS the component's own root
 * element (`<section class="viz">`, `<div class="challenge">`): this helper
 * renders it with `rootProps`, adds `data-island` (and `data-props` when the
 * client needs props it cannot read off the root), and puts the component's
 * output INSIDE it. No wrapper element is introduced, so child combinators, the
 * ARIA tree and every e2e selector see the legacy DOM (D-11).
 *
 * ISOLATED RENDER. The children are `renderToString(<Component {...props} />)`
 * — a separate React render with exactly the props the client will hydrate
 * with and NO context — so server and client output are equal by
 * construction. A component that reads `window`/`document`/`localStorage`
 * during render throws here, in plain Node, and fails the build.
 *
 * The client half is `src/client/islands.ts`, which finds `[data-island]`,
 * runs the registry entry's `prepare`, waits for the trigger and calls
 * `hydrateRoot(container, <Component {...props} container={container} />)`.
 */
import {
  createElement,
  type ComponentType,
  type HTMLAttributes,
  type JSX,
} from 'react';
import { renderToString } from 'react-dom/server';
import { useRenderContext } from './context';

/** Props of `<Island>`. */
export interface IslandProps<P extends object> {
  /** Registry name, e.g. `visualizer`; becomes `data-island`. */
  name: string;
  /** The island component (the same one the registry loads on the client). */
  component: ComponentType<P>;
  /** The component's props: JSON-serializable, identical on both sides. */
  props: P;
  /** The container element; it is the component's own root. */
  as?: keyof JSX.IntrinsicElements;
  /** Attributes of the container (class, id, ARIA, legacy `data-*`). */
  rootProps?: HTMLAttributes<HTMLElement> & Record<`data-${string}`, string>;
  /**
   * `false` when the client rebuilds `props` from the container's own
   * attributes (the registry entry's `load` must then reproduce them exactly);
   * `data-props` is omitted. Default `true`.
   */
  serializeProps?: boolean;
  /**
   * Repository-relative source paths of chunks this island loads on
   * activation beyond its component (e.g. `src/viz/algorithms/x.ts`), for the
   * JS budget's page manifest.
   */
  assets?: readonly string[];
}

/**
 * Render an island: container + isolated server render of its component.
 *
 * @param props - See `IslandProps`.
 * @returns The container element.
 */
export function Island<P extends object>({
  name,
  component,
  props,
  as = 'div',
  rootProps = {},
  serializeProps = true,
  assets = [],
}: IslandProps<P>): JSX.Element {
  const context = useRenderContext();
  if (!context.islands.includes(name)) context.islands.push(name);
  const known = context.islandAssets.get(name) ?? new Set<string>();
  for (const asset of assets) known.add(asset);
  context.islandAssets.set(name, known);

  const html = renderToString(createElement(component, props));
  return createElement(as, {
    ...rootProps,
    'data-island': name,
    ...(serializeProps ? { 'data-props': JSON.stringify(props) } : {}),
    dangerouslySetInnerHTML: { __html: html },
  });
}
