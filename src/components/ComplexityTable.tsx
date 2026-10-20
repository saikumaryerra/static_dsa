/**
 * ComplexityTable — static render of frontmatter `complexity` (design §6.4, §9).
 * Ported from `ComplexityTable.astro` (React migration P2); CSS in
 * `src/styles/components/complexity-table.css`.
 *
 * Props:
 * - `complexity` the frontmatter object: `{ time: {best,average,worst}, space: {worst} }`.
 *
 * Absent keys render "—" (never crash). Full-column width (breakout, not
 * measure-capped). Big-O values in the mono font; the explanatory sentence
 * lives in the MDX prose below the table, not here.
 *
 * M7.3 VD-3: the table is elevation level 1 (`--surface` + 1px `--border` +
 * resting `--shadow-1`, the `.track-card` recipe). It already had the border;
 * the shadow is what the inversion made necessary, because the fill alone is now
 * 1.03:1 against the canvas in light (1.08:1 dark), leaving the whole outer edge
 * to a `--border` hairline at 1.32:1 light / 1.36:1 dark. The achromatic repaint
 * made that argument stronger, not weaker: the fill/canvas step got quieter in
 * both themes (it was 1.05:1 / 1.28:1 on the slate palette) while the hairline
 * got louder, so the shadow and the keyline are now the whole boundary. Text
 * inside is untouched by the change and still AA: `--text` on `--surface` is
 * 18.24:1 light / 15.00:1 dark, `--text-muted` (the header and row-label cells)
 * 6.67:1 / 7.22:1.
 */
import type { JSX } from 'react';

/** The frontmatter `complexity` object, as lessons author it. */
interface Complexity {
  time: { best: string; average: string; worst: string };
  space: { worst: string };
}

/**
 * The Big-O table.
 *
 * @param props - The lesson's complexity. Typed loosely at the edges because
 *   it arrives from MDX (`complexity={frontmatter.complexity}`), where a missing
 *   key must render "—" rather than crash.
 * @returns The table.
 */
export default function ComplexityTable({
  complexity,
}: {
  complexity: Partial<Complexity> | undefined;
}): JSX.Element {
  const dash = '—';
  const time: Partial<Complexity['time']> = complexity?.time ?? {};
  const space: Partial<Complexity['space']> = complexity?.space ?? {};
  return (
    <table className="complexity-table">
      <caption className="sr-only">Time and space complexity</caption>
      <thead>
        <tr>
          <th scope="col">Measure</th>
          <th scope="col">Best</th>
          <th scope="col">Average</th>
          <th scope="col">Worst</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Time</th>
          <td>{time.best ?? dash}</td>
          <td>{time.average ?? dash}</td>
          <td>{time.worst ?? dash}</td>
        </tr>
        <tr>
          <th scope="row">Space</th>
          <td>{dash}</td>
          <td>{dash}</td>
          <td>{space.worst ?? dash}</td>
        </tr>
      </tbody>
    </table>
  );
}
