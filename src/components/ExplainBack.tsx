/**
 * ExplainBack — the optional one-sentence "why does this work?" note
 * (`docs/m8-gamification.md`, M8.3; spec §7's `explainPrompt` frontmatter field,
 * §6's `progress:v1:{slug}` record). Ported from `ExplainBack.astro` (React
 * migration P2); behaviour in the client module
 * `src/client/modules/explain-back.ts`, CSS in
 * `src/styles/components/explain-back.css`. A MODULE, not an island (decision
 * D-05 R-min′): the server markup is the legacy `<template>` and the legacy
 * script clones it, so nothing here hydrates.
 *
 * Props:
 * - `slug`   the lesson that owns the record the note is stored in.
 * - `prompt` the lesson's own `explainPrompt`. Rendered VERBATIM as the field's
 *            `<label>`: it is the question, and a component that decorated it
 *            would be answering for the author.
 *
 * WHAT IT IS. Self-explanation (Chi et al.) and elaborative interrogation: the
 * reader states, in their own words, why the thing they just read works — and
 * meets that sentence again at review time, where it is both a retrieval cue and
 * a calibration check ("still agree?"). It is the only mechanic in this product
 * that stores free-form reader text.
 *
 * IT EARNS NOTHING, and that is load-bearing rather than modest: no stage, no
 * pip, no tally, no count, no schedule move (`writeNote` in
 * `src/lib/progress.ts` stamps nothing). Skipping it costs the reader exactly
 * nothing, which is the only honest way to make a prompt optional; grading a
 * sentence — even by counting one — would turn elaboration into a chore and put
 * a second currency beside the mastery states the design allows.
 *
 * THE FOUR OBLIGATIONS this component carries (the design's word for why it is
 * not one control but four): a **Delete** button beside Save, because a privacy
 * promise with no deletion path is an erosion of it; the note NAMED in the reset
 * control's copy (`/learn` composes that sentence from `countNotes`); the
 * device-scope label adjacent to the textarea, not buried in a footer; and the
 * `note` field carried through every other write of the record, which
 * `parseMastery`'s unknown-field bag already does for free.
 *
 * WHY THE MARKUP LIVES IN A `<template>`. The box appears only once the reader
 * has said they finished the lesson — self-explanation of a lesson nobody has
 * read yet is a prompt with no referent — and "appears" has to mean it is not
 * there beforehand: a hidden textarea is still a form field in the DOM, and a
 * hidden prompt is still a question the page is asking. A `<template>` is inert
 * in every mode that matters (not rendered, not focusable, not in the
 * accessibility tree, and its content is not in the document tree at all), so the
 * copy, the ids and the styling stay reviewable in this file while the page a
 * reader meets before completing carries no note box whatsoever.
 *
 * THIS IS THE ONE CONTROL IN THE PRODUCT THAT APPEARS WITH PROGRESS. Everything
 * else M8 added is a display: `docs/m8-gamification.md` is emphatic that stage is
 * never a permission, and `tests/e2e/m8-calm-invariants.spec.ts` pins that as
 * "a Mastered lesson offers exactly what an untouched one offers" on the `arrays`
 * lesson — which is why `arrays` deliberately authors no `explainPrompt`.
 * Authoring one there is a design decision that reopens that invariant (the note
 * is not an unlock — nothing is gated behind it and it grants nothing — but it IS
 * a control that was not there before), not a bug fix to make quietly.
 *
 * A11Y:
 * - A real `<label>` bound to the textarea by `for`/`id`, carrying the authored
 *   question as its whole text, so the field's accessible name IS the prompt.
 * - `maxlength` on the field (the store bounds it again — see `NOTE_MAX_CHARS`),
 *   with a visible character counter that is `aria-hidden`: a counter that
 *   announced on every keystroke would talk over the reader as they typed.
 *   The count reaches the live region only at the two moments it becomes news —
 *   the last stretch, and the cap — and each is announced once.
 * - ONE polite `role="status"`, shipped EMPTY, carrying both that counter news
 *   and the save/delete confirmation. The confirmation is text PLUS a glyph, and
 *   never colour: the glyph is `aria-hidden` decoration beside a sentence that
 *   says the same thing.
 * - Delete is `aria-disabled` rather than `disabled` while there is nothing to
 *   delete (M7.1 CMP-3): it is exactly where focus stands the instant a note is
 *   removed, and a real `disabled` would drop that focus onto `<body>`.
 *
 * JS-OFF / STORAGE BLOCKED: with no script the template is never cloned, so
 * there is no field, no button and no prompt anywhere on the page — and the
 * `<noscript>` kill-switch below covers the class besides, the belt-and-braces
 * rule `ReviewStrip` follows for the same reason. With storage blocked, `readNote`
 * and `isComplete` both answer "nothing", so the box never appears rather than
 * appearing and promising a save this device cannot keep.
 */
import type { JSX } from 'react';
import { NOTE_MAX_CHARS } from '../lib/progress';
import { useClientModule, useRenderContext } from '../render/context';

/** The legacy `<noscript>` kill-switch, verbatim. */
const NOSCRIPT = `<style>
    /* Kill-switch, as every M8 component ships one. Belt-and-braces here, like
       \`ReviewStrip\`'s: the box only ever exists because the island cloned the
       template, so a JS-off page cannot show one. The rule is what makes that
       structural fact unbreakable if the block is ever server-rendered — and
       \`!important\` because a kill-switch must be unbeatable by any
       equal-specificity rule in the bundle (QA DEFECT-1). */
    .explain-back {
      display: none !important;
    }
  </style>`;

/** Props of `ExplainBack`. */
export interface ExplainBackProps {
  slug: string;
  prompt: string;
}

/**
 * The Explain-it-back note's inert template.
 *
 * @param props - See `ExplainBackProps`.
 * @returns The `<template>` and the `<noscript>` kill-switch.
 * @throws At build time on an empty prompt.
 */
export default function ExplainBack({
  slug,
  prompt,
}: ExplainBackProps): JSX.Element {
  const { uid } = useRenderContext();
  useClientModule('explain-back');

  // Fail the BUILD on an authoring slip rather than rendering an empty label:
  // a blank prompt is a labelled field with no question in it, which no reader
  // can answer and no test can distinguish from a missing component.
  if (prompt.trim().length === 0) {
    throw new Error(
      `ExplainBack: explainPrompt is empty for "${slug}" — remove the field or author a question (spec §7).`,
    );
  }

  const fieldId = `explain-${uid()}`;
  const countId = `${fieldId}-count`;
  const scopeId = `${fieldId}-scope`;

  return (
    <>
      <template data-explain-template="" data-slug={slug}>
        <div className="explain-back" data-explain-back="">
          {/* The review replay, populated and revealed by the module only on a
              `?review=1` visit that has something to replay. It leads the
              block on purpose: meeting your own earlier sentence BEFORE you
              edit it is what makes the box a calibration check rather than a
              blank page. */}
          <p className="explain-back__recall" data-explain-recall="" hidden></p>

          <label className="explain-back__label" htmlFor={fieldId}>
            {prompt}
          </label>

          <textarea
            className="explain-back__field"
            id={fieldId}
            data-explain-field=""
            rows={3}
            maxLength={NOTE_MAX_CHARS}
            aria-describedby={`${countId} ${scopeId}`}
          ></textarea>

          <p className="explain-back__meta">
            {/* Both halves of this line are the field's `aria-describedby`, so
                a screen-reader user meets the remaining count and the device
                scope when they focus the box. The count is `aria-hidden` so it
                is not ALSO read as loose text while browsing, and a description
                is spoken on focus rather than on change — which is what keeps
                the counter from chattering; the live region below carries it
                only when it becomes news. */}
            <span
              className="explain-back__count"
              id={countId}
              data-explain-count=""
              aria-hidden="true"
            ></span>
            <span className="explain-back__scope" id={scopeId}>
              Saved only in this browser. Never sent anywhere.
            </span>
          </p>

          <div className="explain-back__actions">
            <button
              type="button"
              className="btn-secondary"
              data-explain-save=""
            >
              Save note
            </button>
            {/* BESIDE Save, never buried: the ethics review's requirement, and
                the reason it is `aria-disabled` rather than `disabled` is that
                this is where focus stands the moment a note goes. */}
            <button
              type="button"
              className="btn-secondary"
              data-explain-delete=""
              aria-disabled="true"
            >
              Delete note
            </button>
          </div>

          {/* Ships EMPTY so nothing is announced on load, and stays in the DOM:
              a live region has to be in the accessibility tree before its first
              population for that announcement to fire reliably. */}
          <p
            className="explain-back__status"
            role="status"
            data-explain-status=""
          >
            {/* The glyph is wrapped rather than carrying `hidden` itself:
                `hidden` is an HTML attribute, not an SVG one, so the wrapper is
                what the script toggles — and Tailwind's preflight hides
                `[hidden]` with `display: none !important`, which beats the
                inline-flex the stylesheet gives it. */}
            <span
              className="explain-back__status-icon"
              data-explain-status-icon=""
              hidden
            >
              <svg
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
                <path d="M4 12l5 5L20 6"></path>
              </svg>
            </span>
            <span data-explain-status-text=""></span>
          </p>
        </div>
      </template>
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
