/**
 * Callout — static note/tip/warning box (design §6.7, site spec §9). Ported
 * markup (React migration P1 step 7); the full design rationale (M7.3 CMP-11
 * severity encoding, VD-3 elevation) lives with `Callout.astro`, whose CSS
 * moves to `src/styles/components/callout.css` in P2.
 *
 * Props:
 * - `variant` "note" | "tip" | "warning" (default "note").
 *
 * Meaning is never color-only: every callout shows a 16px icon AND a bold
 * label. Body prose goes in the children.
 */
import type { JSX, ReactNode } from 'react';

type Variant = 'note' | 'tip' | 'warning';

const labels: Record<Variant, string> = {
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
};

// Stroke icon paths (24×24), house style.
const icons: Record<Variant, string[]> = {
  note: ['M12 16v-4', 'M12 8h.01', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'],
  tip: [
    'M9 18h6',
    'M10 22h4',
    'M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2h6c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z',
  ],
  warning: ['M12 3 2 20h20z', 'M12 10v4', 'M12 17h.01'],
};

/**
 * A callout.
 *
 * @param props - Variant and body.
 * @returns The `<aside role="note">`.
 */
export default function Callout({
  variant = 'note',
  children,
}: {
  variant?: Variant;
  children?: ReactNode;
}): JSX.Element {
  return (
    <aside className={`callout callout--${variant}`} role="note">
      <div className="callout__head">
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
          {icons[variant].map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
        <span className="callout__label">{labels[variant]}</span>
      </div>
      <div className="callout__body">{children}</div>
    </aside>
  );
}
