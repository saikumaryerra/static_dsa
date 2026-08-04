/**
 * The same-page progress channel — one name for "the record you are showing just
 * changed", so an act that WRITES progress and a surface that only DISPLAYS it
 * can agree without sharing a scope.
 *
 * WHY IT EXISTS: Astro gives component scripts no shared scope, and none of the
 * writes emit a DOM event of their own. A cleared Final Run and a qualifying
 * predict session both stamp `practicedAt` from an island that owns no pips, so
 * the lesson header — the only mastery display a lesson page has — kept whatever
 * it last drew until the next full page load, making the visit that earned the
 * stage the one visit that never showed it. This is the same problem
 * `PROGRESS_RESET_EVENT` (in `src/lib/progress.ts`) already solves between
 * `/learn`'s reset control and its review strip, answered the same way; a
 * `storage` event cannot cover it either, since browsers fire that in OTHER
 * tabs only.
 *
 * WHY ITS OWN MODULE rather than an export of `src/lib/progress.ts`, where
 * `PROGRESS_RESET_EVENT` lives: that file is the store — every read, write and
 * delete of the keys — and this is only a channel name, wanted on both sides of
 * it. Separating them means a caller that reaches the store through a lazy
 * `import()` (as `Visualizer.astro`'s predict path does, so a page with no
 * lesson to credit never downloads it) can still take the NAME with a plain
 * static import. Folding the two constants back together later is safe: what
 * callers depend on is the name and the shape, not the file.
 */

/**
 * Dispatch after a write to `progress:v1:{slug}` or `lesson:{slug}:complete` has
 * LANDED, so a listener that re-reads storage sees the new value.
 *
 * THE SHAPE, in full — every caller uses this one and no other:
 * - on `document`, as `document.dispatchEvent(new CustomEvent(PROGRESS_CHANGED_EVENT))`,
 *   exactly as `PROGRESS_RESET_EVENT` is dispatched;
 * - with **no detail**. `codetabs:lang` and `viz:speed` carry the new value
 *   because their listeners cannot look it up; here every listener re-reads the
 *   store itself, so a payload could only ever be a second version of the truth;
 * - **after** the write, which matters where the store is loaded lazily — the
 *   predict path writes inside a dynamic `import()` callback, so the dispatch
 *   belongs in that callback and not beside it.
 *
 * Listeners repaint only, and must stay silent: a stage appearing mid-visit is a
 * display catching up, not an announcement the reader asked for.
 */
export const PROGRESS_CHANGED_EVENT = 'progress:changed';
