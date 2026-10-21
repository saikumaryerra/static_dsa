/**
 * The ledger — the run written out, at the foot of the instrument (Plan C §1).
 *
 * A `Step` is a row and `Trace = Step[]` is the table; `core/ledger.ts` does the
 * transcription and this file does nothing but draw it. The split is the point:
 * the derivation is pure and therefore unit-tested under the harness's
 * `environment: 'node'`.
 *
 * SERVER-RENDERED ON PURPOSE (spec §8). This is M7-class content, not an M8
 * component: with JavaScript off it *is* the lesson, so it has no `<noscript>`
 * kill-switch and it sits OUTSIDE `.viz-controls`, which the island's kill-switch
 * hides. A reader with JS off gets the complete worked example instead of a
 * still and a note.
 *
 * ONE COMPONENT, BOTH SIDES (React migration). The legacy build drew this table
 * twice — `Ledger.astro` on the server and a hand-written DOM rebuild in the
 * island's script after every custom run — and kept the two in step by sharing
 * `ledgerLayout`. Here the island renders this same component on the server and
 * in the browser, so a rebuild after a custom run is just new props: the two
 * renderings cannot disagree about a column because there is only one of them.
 * The `<details>`, its summary and the well are the same elements before and
 * after a rebuild, so a reader who has opened the table (or scrolled it) is not
 * thrown out of it by running a new input.
 *
 * OPEN BY DEFAULT (redesign 2026-08). It shipped closed, which meant the single
 * best explanatory artifact this product has — the run written out, one row per
 * step, provably the same trace the drawing is showing — was a line of grey text
 * a reader had to guess was worth clicking. "Show your work" cannot be the
 * thesis and also be folded shut by default. The well is bounded (18rem, 12rem
 * on a phone) and every row stays in the DOM, so a 200-row run costs the page a
 * fixed 288px and scrolls inside itself; and it is still a real disclosure, so a
 * reader who wants only the drawing closes it once.
 *
 * Two side effects worth naming, both good: it now PRINTS open (no stylesheet
 * can open a closed `<details>`, which is why the print rules could never reach
 * it), and axe now scans it on every run rather than skipping it as
 * `display: none` — the blind spot spec §18 records.
 *
 * NATIVE `<details>` FOR THE COLLAPSE. Zero JS, so it is correct with JS off and
 * the disclosure is a real control rather than a button waiting to be brought
 * to life; a JS-toggled `hidden` would leave the JS-off reader with no way in at
 * all. (`hidden="until-found"` is not an option either — it does not work on a
 * `<tr>`.)
 *
 * TABLE SEMANTICS ARE LOAD-BEARING. A `<tr role="button">` stops being a row and
 * takes the column-header association down with it, so the seek control is the
 * step-number cell's own `<button>` inside a `<th scope="row">`.
 *
 * THE BUTTONS SHIP `disabled` and stay that way until the island enables them —
 * the honesty mechanism the transport row already uses. A JS-off reader is never
 * offered a control that cannot act, and the state is painted on the AFFORDANCE
 * channel (the resting underline withdrawn, `not-allowed`) rather than with
 * `--disabled-opacity`, because the label is the step NUMBER and dimming it
 * would take a legible piece of the lesson below AA — see the `.viz-ledger__seek`
 * rules in `src/styles/components/ledger.css` for the measurement.
 *
 * ROVING TABINDEX once live — exactly one button in the table is tabbable — so a
 * 200-row run costs a keyboard reader one tab stop rather than 200, and the
 * arrow keys move between rows from there. When the current step is past the
 * row cap there is no row to mark, so the tab stop falls back to the last
 * rendered row: `aria-current` stays OFF, which is honest (the reader is not on
 * a row this table shows, and the cap notice says why), while the table never
 * becomes a region the keyboard cannot enter at all.
 */
import type { JSX, KeyboardEvent, Ref } from 'react';
import { ledgerLayout } from './core/ledger';
import type { Ledger as LedgerData } from './core/ledger';

/** Props of {@link Ledger}. */
export interface LedgerProps {
  /** The transcribed trace, from `buildLedger` (already capped). */
  ledger: LedgerData;
  /** The instrument's stable id base, so row ids are unique and durable. */
  uid: string;
  /** Algorithm label, e.g. "Binary Search" — names the disclosure and the table. */
  label: string;
  /**
   * The trace index the Player is on, once the island is live; `null` in the
   * server render and before the player exists, when no row is current and
   * every seek button is still `disabled`.
   */
  current: number | null;
  /** Hidden while Predict is on — the table is that mode's answer key. */
  hidden?: boolean;
  /** A row's seek button was activated. */
  onSeek?: (index: number) => void;
  /** A key went down on a row's seek button. */
  onSeekKey?: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  /** The bounded well — the scroll container the current row is kept inside. */
  wellRef?: Ref<HTMLDivElement>;
}

/**
 * The run as a table: disclosure, cap notice, bounded well.
 *
 * @param props - See {@link LedgerProps}.
 * @returns The `<details>` element.
 */
export default function Ledger({
  ledger,
  uid,
  label,
  current,
  hidden = false,
  onSeek,
  onSeekKey,
  wellRef,
}: LedgerProps): JSX.Element {
  const { headers, rows, total } = ledger;

  // Which column holds the authored sentence, and which are set in numerals —
  // derived in `core/ledger.ts` rather than here, so the rule lives beside the
  // transcription it describes.
  const { whatIndex, numeric: numericColumns } = ledgerLayout(ledger);

  /** The classes a column's cells carry, or `undefined` for none. */
  const columnClass = (column: number): string | undefined =>
    [
      column === whatIndex ? 'viz-ledger__what' : '',
      numericColumns[column] ? 'viz-ledger__n' : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  // NO SILENT CAPS (spec §11). The cap never binds on an authored run (the
  // longest ships 33 rows against a cap of 200), but a custom run can reach 901
  // steps, and a bounded output that does not admit it is a lie about the run.
  const capped = rows.length < total;
  const stepWord = total === 1 ? 'step' : 'steps';
  const rowWord = rows.length === 1 ? 'row' : 'rows';

  const live = current !== null;
  const currentRow = live ? rows.findIndex((row) => row.index === current) : -1;
  // The roving tab stop: the current row's button, or the last rendered row's
  // when the current step is past the cap.
  const tabStop = !live ? -1 : currentRow >= 0 ? currentRow : rows.length - 1;

  return (
    <details className="viz-ledger" data-ledger="" open hidden={hidden}>
      <summary className="viz-ledger__summary">
        {/* Constant phrase first, instrument second — the shape CNT-8 already
            establishes for the Practice disclosures ("Show answer to question
            1"): the reader scans the affordance, and the tail keeps two
            visualizers on one lesson from shipping identical disclosure
            labels. Every page that mounts more than one mounts a different
            ALGORITHM, so the label makes them unique by construction. */}
        <span className="viz-ledger__title">{`The run, written out — ${label}`}</span>{' '}
        <span className="viz-ledger__count" data-ledger-count="">
          {`(${total} ${stepWord})`}
        </span>
      </summary>

      {capped && (
        <p className="viz-ledger__cap" data-ledger-cap="">
          {`Showing the first ${rows.length} of ${total} steps. Narrow the input to see the whole run.`}
        </p>
      )}

      {/* Bounded well. Every row stays in the DOM for find-in-page, screen
          readers and print; only the viewport onto them is capped.

          A REACHABLE, NAMED SCROLL REGION, the same shape RSP-2 gives the
          canvas (`tabindex="0"` + `role="group"` + a name) — because a scroll
          container the keyboard cannot reach is a 2.1.1 failure, and axe calls
          it `serious` (verified: `scrollable-region-focusable` on all three
          sorting-basics wells before this attribute existed). Unconditional
          here, where the canvas measures first: the canvas can only overflow
          once JS has measured it, while this well is a scroller by
          construction in BOTH axes, and the reader who needs it most is the
          one with no JS to measure with. It costs no stray tab stop, because a
          closed `<details>` takes its whole subtree out of the tab order — the
          stop appears only once the reader has asked for the table. */}
      <div
        className="viz-ledger__well"
        data-ledger-well=""
        tabIndex={0}
        role="group"
        aria-label={`${label}, scrollable table`}
        ref={wellRef}
      >
        <table className="viz-ledger__table">
          {/* The table's accessible name. Visually hidden rather than removed:
              the disclosure above already says this in the visual layer, and a
              table announced as just "table" is a table nobody can place. NO
              `aria-describedby` pointing back at it — the abandoned build did
              that, which made the name and the description the identical
              string. */}
          <caption className="sr-only">
            {`${label}: ${rows.length} ${rowWord}, one per step of this run.`}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="viz-ledger__num">
                #
              </th>
              {headers.map((header, column) => (
                <th scope="col" className={columnClass(column)} key={column}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, position) => (
              <tr
                id={`${uid}-row-${row.n}`}
                data-ledger-row={row.index}
                // `step`, not `true`: the token exists for exactly this — one
                // step of a process — and this site already uses the specific
                // token wherever one is defined (`page` in the breadcrumb,
                // `location` in the ToC).
                aria-current={position === currentRow ? 'step' : undefined}
                key={row.index}
              >
                {/* `scope="row"` keeps the step number the row's HEADER, so a
                    screen reader announces "row 3" with every cell in it. The
                    button lives inside that header rather than replacing it. */}
                <th scope="row" className="viz-ledger__num">
                  <button
                    type="button"
                    className="viz-ledger__seek"
                    data-ledger-seek={row.index}
                    aria-label={`Go to step ${row.n}`}
                    disabled={!live}
                    tabIndex={
                      live ? (position === tabStop ? 0 : -1) : undefined
                    }
                    onClick={onSeek ? () => onSeek(row.index) : undefined}
                    onKeyDown={
                      onSeekKey
                        ? (event) => onSeekKey(event, row.index)
                        : undefined
                    }
                  >
                    {row.n}
                  </button>
                </th>
                {row.cells.map((cell, column) => (
                  <td className={columnClass(column)} key={column}>
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
