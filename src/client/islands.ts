/**
 * The island bootstrap (React migration, D-04 / D-06): the one eager script on
 * a page that hosts an island, and the only place React is loaded from.
 *
 * It finds every `[data-island]` container the server rendered
 * (`src/render/Island.tsx`), looks its name up in the registry
 * (`src/client/island-registry.ts`), runs the entry's `prepare` at once (the
 * pre-activation DOM states the legacy scripts set on load), waits for the
 * entry's trigger, and only then imports `react-dom/client` together with the
 * island's own chunk and hydrates. React is never statically imported here:
 * a page pays for React when an island ACTIVATES, not when it loads (D-06), and
 * the JS budget counts it through `.build/page-manifest.json` either way.
 *
 * A failed load calls the entry's `fail` (the instrument's "unavailable" state)
 * instead of throwing into the void; a hydration mismatch is reported as a
 * `ldsa:hydration-error` event on `document` (D-04 rule 6) — never through
 * `console`, which spec §18 bans — so the e2e suite can assert none fired.
 */
import type { ComponentType } from 'react';
import { islandRegistry } from './island-registry';

/** When an island activates. */
export type IslandTrigger =
  /** On entering the viewport (+200px, the legacy Visualizer's margin). */
  | 'visible'
  /** When the main thread is idle after load. */
  | 'idle'
  /** When `prepare` calls the `activate` callback it is handed. */
  | 'event';

/** One registry row. */
export interface IslandEntry {
  /** Activation trigger. */
  trigger: IslandTrigger;
  /**
   * Runs at bootstrap time, before activation: pre-activation DOM states and
   * early event buffering. For `event` islands it receives `activate`.
   */
  prepare?: (container: HTMLElement, activate: () => void) => void;
  /**
   * Loads the island component (a dynamic `import()`, so it is its own chunk)
   * and anything it needs before hydrating; resolves to the component and the
   * props to hydrate with.
   */
  load: (
    container: HTMLElement,
    props: Record<string, unknown>,
  ) => Promise<{
    component: ComponentType<Record<string, unknown>>;
    props: Record<string, unknown>;
  }>;
  /** The island's failed state, when `load` rejects. */
  fail?: (container: HTMLElement, error: unknown) => void;
  /** `true` when the server rendered nothing to hydrate (client-only). */
  clientOnly?: boolean;
}

/** The event a hydration mismatch is reported through. */
export const HYDRATION_ERROR_EVENT = 'ldsa:hydration-error';

/**
 * The props serialized on a container, or `{}` when it carries none.
 *
 * @param container - An island container.
 * @returns The props.
 */
function readProps(container: HTMLElement): Record<string, unknown> {
  const raw = container.dataset.props;
  if (raw === undefined) return {};
  const parsed: unknown = JSON.parse(raw);
  return parsed && typeof parsed === 'object'
    ? (parsed as Record<string, unknown>)
    : {};
}

/**
 * Load and hydrate one island.
 *
 * @param name - Registry name.
 * @param entry - Its registry row.
 * @param container - Its container.
 * @returns Resolves once hydration has been scheduled.
 */
async function activate(
  name: string,
  entry: IslandEntry,
  container: HTMLElement,
): Promise<void> {
  try {
    const [client, react, loaded] = await Promise.all([
      import('react-dom/client'),
      import('react'),
      entry.load(container, readProps(container)),
    ]);
    const element = react.createElement(loaded.component, {
      ...loaded.props,
      container,
    });
    const onRecoverableError = (): void => {
      document.dispatchEvent(
        new CustomEvent(HYDRATION_ERROR_EVENT, { detail: { island: name } }),
      );
    };
    if (entry.clientOnly) {
      client.createRoot(container, { onRecoverableError }).render(element);
    } else {
      client.hydrateRoot(container, element, { onRecoverableError });
    }
  } catch (error) {
    entry.fail?.(container, error);
  }
}

/**
 * Wait for an island's trigger, then activate it once.
 *
 * @param name - Registry name.
 * @param entry - Its registry row.
 * @param container - Its container.
 */
function schedule(
  name: string,
  entry: IslandEntry,
  container: HTMLElement,
): void {
  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    void activate(name, entry, container);
  };
  entry.prepare?.(container, start);
  if (entry.trigger === 'visible') {
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(container);
  } else if (entry.trigger === 'idle') {
    // Safari ships no `requestIdleCallback`; a zero-delay task is the
    // nearest equivalent there. The deadline matters: without one a busy main
    // thread may postpone the callback indefinitely, and an idle island stands
    // in for a legacy script that ran as soon as the page loaded — a card the
    // reader can reach must never sit disabled waiting for the browser to be
    // quiet. One second keeps it off the first paint and bounds it otherwise.
    const idle = (window as Partial<Window>).requestIdleCallback;
    if (idle) idle.call(window, start, { timeout: 1000 });
    else window.setTimeout(start, 0);
  }
}

for (const container of document.querySelectorAll<HTMLElement>(
  '[data-island]',
)) {
  const name = container.dataset.island ?? '';
  const entry = islandRegistry[name];
  if (entry) schedule(name, entry, container);
}
