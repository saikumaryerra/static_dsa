/**
 * Mastery presentation — the words, the pip contract and the ring geometry the
 * M8.1 mastery surfaces share (spec §8 curriculum index, §9 `TrackArc`; design
 * in `docs/m8-gamification.md`).
 *
 * WHY A MODULE AND NOT COMPONENT-LOCAL CODE: two separate islands paint these
 * surfaces — `/learn`'s progress script (cards + track rings) and the lesson
 * header's — and Astro gives component scripts no shared scope. A stage word,
 * the `data-stage` attribute name or the ring formula written inline would
 * therefore exist in two copies, free to drift; here each exists once.
 *
 * DIVISION OF LABOUR: `src/lib/progress.ts` owns the STATE — which stage a
 * lesson is at, and every `localStorage` access that answers it. This module
 * never touches storage and never decides a stage; it only words and draws one
 * it is handed. That split is also what keeps it unit-testable: Vitest runs
 * `environment: 'node'` with no DOM and no `localStorage`, and everything below
 * is a pure function except {@link paintPips} — which writes the one attribute
 * and the one label the pip contract defines, and is never called at import
 * time, so importing this module in a Node test touches no DOM.
 */
import type { MasteryStage } from './progress';

/**
 * The word each stage is announced and shown with — the ONE place the currency
 * is named, because the pips are `aria-hidden` decoration and this text is the
 * whole accessible signal (a stage may never be carried by colour alone, §12).
 *
 * `none` is the empty string on purpose: a lesson with nothing recorded renders
 * no pips and no label at all, rather than a "Not started" chip. Nothing here
 * shames absence (`docs/m8-gamification.md`, design stance 5).
 */
const STAGE_LABEL: Record<MasteryStage, string> = {
  none: '',
  learned: 'Learned',
  practiced: 'Practiced',
  mastered: 'Mastered',
};

/**
 * The visible/announced word for one stage.
 *
 * @param stage - The stage `progress.ts` resolved.
 * @returns The label, or `''` for `none` (which renders nothing).
 */
export function stageLabel(stage: MasteryStage): string {
  return STAGE_LABEL[stage];
}

/**
 * Paints one `MasteryPips` instance — the ONE writer of the component's
 * contract, so the attribute name and the "none renders nothing" rule cannot be
 * restated differently by the two islands that call it.
 *
 * The contract, in full: `data-stage` present ⇔ the pips are shown, and its
 * value selects how many pips are filled (the component's CSS does the rest).
 * `none` REMOVES the attribute rather than setting `data-stage="none"`, so the
 * "hidden until the script runs" default and "hidden because nothing is
 * recorded" are the same state — a reset therefore restores the JS-off
 * appearance exactly, with no empty-pip row left behind.
 *
 * @param root - The component root (`[data-mastery-pips]`).
 * @param stage - The stage to show.
 * @param label - Optional override for the visible text, for a host that adds
 * the honest device-scope suffix ("Practiced on this device"). Ignored for
 * `none`, which always clears the text — a stale word beside no pips would be a
 * claim about a device that no longer has the record.
 */
export function paintPips(
  root: HTMLElement,
  stage: MasteryStage,
  label: string = stageLabel(stage),
): void {
  if (stage === 'none') root.removeAttribute('data-stage');
  else root.setAttribute('data-stage', stage);
  const text = root.querySelector<HTMLElement>('[data-mastery-label]');
  if (text) text.textContent = stage === 'none' ? '' : label;
}

/**
 * `MasteryPips`' `<noscript>` kill-switch, as raw HTML for `set:html`.
 *
 * A shared constant because TWO components emit it: the pips themselves, and
 * `LessonCard`, which renders pips inside an `<a>` and so must host the block
 * outside that link (a `<style>` is metadata content and has no business inside
 * phrasing content). One string means the two can never disagree about the
 * selector. Both uses are in component FRONTMATTER (build time) and no island
 * imports it, so it is not part of any client entry's import graph.
 *
 * The selector is global, so a single block anywhere on the page covers every
 * instance; `!important` because a kill-switch must be unbeatable by any
 * equal-specificity rule in the bundle (QA DEFECT-1).
 */
export const PIPS_KILL_SWITCH =
  '<style>.mastery-pips { display: none !important; }</style>';

/** Ring radius in the arc's 28×28 viewBox (stroke 3 ⇒ outer edge at 13.5). */
export const ARC_RADIUS = 12;

/**
 * The ring's full circumference, rounded to 3dp.
 *
 * Rounded here rather than at each use so the value BAKED into
 * `stroke-dasharray` at build time and the value {@link arcOffset} returns at
 * runtime are the same literal: an unrounded pair leaves 17-digit floats in the
 * DOM, and a full ring that misses zero by 1e-14.
 */
export const ARC_CIRCUMFERENCE =
  Math.round(2 * Math.PI * ARC_RADIUS * 1000) / 1000;

/**
 * `stroke-dashoffset` for a ring showing `done / total` — the only value the
 * runtime writes, since the dash array is baked at build.
 *
 * Pure and injectable so the geometry is unit-testable with no SVG anywhere
 * (mirroring `resolveTheme`). Full offset = empty ring, which is deliberately
 * also the answer for every degenerate input: an empty track, a `total` of 0
 * (no division by zero), or a NaN that reached here from a malformed injected
 * list. A ring is decoration — the text beside it carries the value — so
 * drawing nothing is always safe, while a `NaN` offset would blank the SVG
 * attribute and leave a FULL ring claiming a finished track.
 *
 * @param done - Lessons complete on this device.
 * @param total - Lessons in the track.
 * @param circumference - The ring's circumference; defaults to the shipped one.
 * @returns The offset in user units, rounded to 3dp and clamped to
 * `[0, circumference]` — `done > total` (a stale count) can never over-draw.
 */
export function arcOffset(
  done: number,
  total: number,
  circumference: number = ARC_CIRCUMFERENCE,
): number {
  if (!Number.isFinite(circumference) || circumference <= 0) return 0;
  if (!Number.isFinite(done) || !Number.isFinite(total)) return circumference;
  if (total <= 0 || done <= 0) return circumference;
  const fraction = Math.min(done / total, 1);
  return Math.round(circumference * (1 - fraction) * 1000) / 1000;
}

/**
 * The track counter's sentence — M7.2's exact wording, kept verbatim as M8.1
 * draws a ring around it: it is the one line that states both the number and
 * the honest scope ("on this device") that every persistent surface owes.
 *
 * @param done - Lessons with a completion mark on this device.
 * @param total - Lessons in the track.
 * @returns e.g. `3 of 9 done on this device`.
 */
export function trackCountText(done: number, total: number): string {
  return `${done} of ${total} done on this device`;
}

/**
 * The two honest counts that must sit beside the self-reported one.
 *
 * Required by the design, not decorative: "Mark as complete" is self-reported
 * with no learning precondition, so a track header showing it ALONE would
 * overstate what happened. Practised and Mastered are earned through retrieval,
 * so they are shown next to it always — including at zero, which states a fact
 * and sets no target (there is no goal, no streak and no countdown here).
 *
 * @param practiced - Lessons at Practiced or above (the count is cumulative, so
 * promoting one to Mastered never makes this number fall).
 * @param mastered - Lessons at Mastered.
 * @returns e.g. `Practiced 2 · Mastered 1`.
 */
export function masteryCountsText(practiced: number, mastered: number): string {
  return `Practiced ${practiced} · Mastered ${mastered}`;
}
