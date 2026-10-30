/**
 * Figure — the frame every diagram in this site is drawn inside (course
 * expansion, `docs/courses/SPEC.md` Phase 4, decision D-08). Ported from
 * `Figure.astro` (React migration P3); the frame and the drawing kit are
 * `src/styles/components/figure.css`.
 *
 * The site had no diagram mechanism at all: no Mermaid, no `<Figure>`, no
 * content SVG, and no styling for raster media. `renderStatic()` exists but is
 * bound to an instrumented algorithm's `Step[]`, so it cannot draw a control
 * plane. Of the
 * three options the spec ranks, hand-written inline SVG is the only one that is
 * zero-dependency, zero-JS, follows the light/dark tokens and prints — a static
 * `.svg` asset cannot repaint itself for the theme, and Mermaid means either a
 * large client bundle against the 60 KB budget or a headless browser in the
 * build.
 *
 * **This component owns the `<svg>` element**, and a diagram supplies only its
 * children. That is deliberate: the accessible name and description are then
 * structural rather than something each of eleven diagrams has to remember, and
 * `role="img"` plus the id wiring cannot drift between them.
 *
 * Props:
 * - `viewBox`   the SVG user-space box, e.g. `"0 0 640 360"`. Keep the numbers
 *               small — they are also the font sizes, and a 1600-wide box makes
 *               every label half-size on a phone.
 * - `title`     the accessible NAME. One short noun phrase.
 * - `description` the accessible DESCRIPTION: what the diagram actually shows,
 *               in enough detail that a reader who cannot see it loses nothing.
 * - `caption`   the visible caption under the frame. Never a restatement of the
 *               title — it says what to take away.
 * - `id`        optional anchor id, so prose can link to a figure.
 * - `minWidth`  px width below which the frame scrolls instead of shrinking.
 *
 * WHY IT DOES NOT SCALE UP EITHER. The viewBox width is also the drawing's
 * natural size, and letting `width: 100%` stretch a 690-unit diagram across a
 * 1118px column renders its 14px labels at 23px — larger than the lesson's own
 * headings, which reads as a mistake rather than as emphasis. The frame caps the
 * drawing at 1:1 so a diagram's type is the same size as the prose beside it.
 *
 * WHY IT SCROLLS RATHER THAN SHRINKS. A diagram scaled to 343px of a phone
 * screen renders its labels at around 6px. Spec §6 allows a diagram to scroll
 * ("no horizontal overflow unless intentional and handled — scrollable code
 * blocks and tables, for example"), so the frame keeps the text legible and
 * lets the box scroll, with `tabindex="0"` so the scroll region is reachable
 * from the keyboard (WCAG 2.1.1, and axe's `scrollable-region-focusable`).
 *
 * THE DRAWING KIT. Every shape class a diagram may use is defined here, in
 * tokens, so no diagram hardcodes a colour and all eleven look like one set.
 * Arrowheads are drawn as `<polygon class="dg-head">` rather than with an SVG
 * `<marker>`: a marker needs a document-unique id, and eleven figures on one
 * page referencing a shared id is either duplicate ids or eleven copies of the
 * same four vertices.
 */
import type { JSX, ReactNode } from 'react';
import { useRenderContext } from '../render/context';

/** Props of `Figure`. */
export interface FigureProps {
  viewBox: string;
  title: string;
  description: string;
  caption: string;
  id?: string;
  minWidth?: number;
  /** The diagram's shapes (Figure owns the `<svg>`). */
  children?: ReactNode;
}

/**
 * A diagram's frame.
 *
 * @param props - See `FigureProps`.
 * @returns The `<figure>`.
 */
export default function Figure({
  viewBox,
  title,
  description,
  caption,
  id,
  minWidth = 520,
  children,
}: FigureProps): JSX.Element {
  const uid = `fig-${useRenderContext().uid()}`;

  // The drawing's natural width in px — the third number of the viewBox. Used
  // as the cap so the SVG never scales past 1:1 (see the note above). A
  // malformed viewBox falls back to no cap rather than to a wrong one.
  const naturalWidth = Number(viewBox.trim().split(/\s+/)[2]);
  const cap = Number.isFinite(naturalWidth) ? `${naturalWidth}px` : 'none';

  return (
    <figure className="figure" id={id}>
      {/* The scroll container carries `tabindex` and NOTHING else: a
          `role="group"` here with the same `aria-labelledby` as the `<svg>`
          inside it makes a screen reader announce the diagram's name twice,
          once for the wrapper and once for the image. Focusability is all WCAG
          2.1.1 asks of a scroll region, and it is all axe checks. */}
      <div className="figure__frame" tabIndex={0}>
        <svg
          className="figure__svg"
          viewBox={viewBox}
          role="img"
          aria-labelledby={`${uid}-t`}
          aria-describedby={`${uid}-d`}
          style={{ minWidth: `${minWidth}px`, maxWidth: cap }}
        >
          <title id={`${uid}-t`}>{title}</title>
          <desc id={`${uid}-d`}>{description}</desc>
          {children}
        </svg>
      </div>
      <figcaption className="figure__caption">{caption}</figcaption>
    </figure>
  );
}
