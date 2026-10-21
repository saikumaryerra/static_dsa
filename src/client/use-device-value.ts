/**
 * Device state for a hydrated island, without a hydration mismatch.
 *
 * An island's server render cannot know what this device remembers ("cleared
 * on this device") or that a script is running at all, and the hydration
 * render must reproduce the server render exactly (D-04). React's answer is
 * `useSyncExternalStore` with a server snapshot: hydration renders with
 * `serverValue`, and React re-renders straight afterwards with `read()` — no
 * effect that sets state, no flash of a different first paint than the server
 * sent, and `read` is never called on the server.
 *
 * `read` must return a primitive (or the same object until it changes), and it
 * must be safe to call on every render: the storage readers in
 * `src/lib/enrichment-store.ts` are `try/catch`-guarded and cheap.
 */
import { useSyncExternalStore } from 'react';

/** Nothing to subscribe to: device state changes only through this island. */
const subscribeNothing = (): (() => void) => () => {};

/**
 * A browser-only value, `serverValue` until hydration has finished.
 *
 * @param read - Reads the value in the browser.
 * @param serverValue - What the server rendered with.
 * @returns The value.
 */
export function useDeviceValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNothing, read, () => serverValue);
}

/** `true` once the island is live in a browser; `false` on the server and while hydrating. */
const isLive = (): boolean => true;

/**
 * Whether the island has hydrated — the moment its server-`disabled` controls
 * may come alive.
 *
 * @returns `false` on the server and in the hydration render, `true` after.
 */
export function useLive(): boolean {
  return useDeviceValue(isLive, false);
}
