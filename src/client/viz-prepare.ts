/**
 * The Visualizer island's pre-activation and failed states (React migration
 * plan §5 P2 WS-I step 5): the two DOM states the legacy script set on the
 * server markup BEFORE (or instead of) a live player, kept out of the island
 * chunk because they must work when that chunk has not arrived — or never
 * will. Eager on every page that hosts an instrument, so it imports nothing.
 */

/**
 * Loading state (M7.2), set at page load on every instrument. From JS and
 * never in SSR: markup-level `aria-busy` would leave a JS-off page permanently
 * "busy" for assistive tech, and the JS-off reader is not waiting for anything
 * — they have the still. `aria-busy` itself waits until the chunks are actually
 * being fetched (the registry entry's `load`): an island four screens away is
 * not loading, it is deferred, and claiming otherwise would make every lesson
 * page announce several busy regions.
 *
 * @param root - The `<section class="viz">` container.
 */
export function prepareViz(root: HTMLElement): void {
  if (!root.querySelector('[data-viz-canvas]')) return;
  root.dataset['vizLoading'] = 'true';
  const counter = root.querySelector<HTMLElement>('[data-viz-counter]');
  if (counter) counter.textContent = '…';
}

/**
 * The terminal "failed" state — a chunk that would not load, or an authored
 * input the loaded parser rejects. Distinguishable from "loading" (VIZ-*): the
 * controls are hidden rather than dimmed (`[data-viz-failed]` in
 * `visualizer.css`), the busy flag is cleared, and the copy says what the
 * reader can still do instead of only naming the failure.
 *
 * @param root - The `<section class="viz">` container.
 */
export function failViz(root: HTMLElement): void {
  delete root.dataset['vizLoading'];
  root.removeAttribute('aria-busy');
  root.dataset['vizFailed'] = 'true';
  const canvas = root.querySelector<HTMLElement>('[data-viz-canvas]');
  if (!canvas) return;
  canvas.replaceChildren();
  const box = document.createElement('p');
  box.className = 'viz-unavailable';
  box.textContent =
    'This visualization could not load. Reload the page to try again — the steps are also described in the text below.';
  canvas.appendChild(box);
}
