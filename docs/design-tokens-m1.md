# M1 Design Tokens & Layout Spec — UI/UX Designer handoff

**Status:** Approved for M1 implementation
**Consumer:** Frontend Engineer (implement verbatim in `src/styles/tokens.css` and `tailwind.config.ts`)
**Scope:** M1 (scaffold & tokens, home page). Visualization behavior is owned by M2/M3 — this spec only reserves the highlight color roles renderers will consume.

---

## UX Rationale

A beginner meeting recursion for the first time is already at high cognitive load, so the chrome must recede: a calm neutral palette and strong typographic hierarchy direct all attention to prose and, later, the visualization, where the only saturated colors on any page live (Von Restorff effect — algorithm state pops because nothing else competes). Every choice below favors zero-surprise standard patterns (Jakob's Law) and zero-cost performance (system fonts, no webfont request) because trust in a learning site is built on speed and legibility, not decoration.

---

## The User Flow (M1 scope: first visit, home page)

1. User lands on `/`. Inline head script resolves theme before first paint — no flash, page appears in their OS-preferred scheme.
2. User reads the hero value prop (one line), scans the subhead, and sees two clear paths: primary CTA "Start learning" → `/learn`, or scroll.
3. Scrolling reveals three feature blurbs (interactive / beginner-friendly / free) confirming "this is for me."
4. User reaches two track cards (Foundations, Algorithms), each showing lesson count; clicking either goes to `/learn`.
5. At any point the user clicks the theme toggle in the header: theme switches instantly, choice persists to `localStorage`, and survives reload.
6. Keyboard user presses Tab on load: first stop is the skip-to-content link, then logo, nav links, theme toggle, hero CTA — a complete keyboard path with visible focus rings.

---

## Visual Hierarchy & Layout (The Wireframe)

Mobile-first (360px baseline). Desktop deltas noted with `≥768px`.

```
[Skip link]  visually hidden until :focus; z-50; bg --brand, text --brand-contrast
[Header]     sticky top; z-40; height 56px (≥768px: 64px); bg --bg; border-bottom 1px --border
             padding-inline --space-4 (≥768px: --space-6)
  ├─ Logo    wordmark "LearnDSA"; --text-lg; weight 700; color --text; links to /
  └─ Nav     flex; gap --space-5; flex-wrap: wrap (i18n: labels may grow 30%, never truncate)
      ├─ Learn / Glossary / About   --text-sm; weight 500; color --text-muted; hover/current: --text
      └─ ThemeToggle                <button> 40x40px; icon 20px; radius --radius-control

[Main] id="main"; max-width 72rem; margin-inline auto; padding-inline --space-4 (≥768px: --space-6)

  [Hero]     padding-block 64px (≥768px: 96px top, 80px bottom); left-aligned (editorial; center-
             aligned rag breaks with 30% longer DE/FR strings)
    ├─ H1        --text-4xl; weight 700; --leading-tight; --tracking-tight; max-width 22ch
    ├─ Subhead   --text-lg; color --text-muted; --leading-relaxed; max-width 55ch; margin-top --space-4
    └─ CTA row   flex; gap --space-4; flex-wrap; margin-top --space-8
        ├─ Primary: bg --brand; text --brand-contrast; radius --radius-control;
        │           padding --space-3 --space-5; min-height 44px; --text-base; weight 600
        └─ Secondary: text link, color --brand, weight 500, trailing "→" (i18n: arrow is a
                      separate span, not baked into the translated string)

  [Features] margin-top 64px (≥768px: 96px); grid 1 col, gap --space-10 (≥768px: 3 cols, gap --space-8)
             borderless — whitespace does the separation (editorial, not dashboard)
    └─ x3:  icon 24px (stroke --brand) → H2-styled-as --text-lg weight 600 → body --text-base --text-muted

  [Tracks]   margin-top 64px (≥768px: 96px); H2 --text-2xl weight 700; margin-bottom --space-6
             grid 1 col gap --space-6 (≥768px: 2 cols)
    └─ x2 TrackCard (whole card is one <a>):
         bg --surface; border 1px --border; radius --radius-card; padding --space-6
         ├─ Overline  --text-xs; uppercase; letter-spacing 0.06em; color --text-muted
         ├─ Title     --text-xl; weight 600; color --text
         ├─ Summary   --text-base; color --text-muted; --leading-relaxed
         └─ Meta row  --text-sm; --text-muted; "9 lessons · ~70 min" + "→"

[Footer]   margin-top 96px; border-top 1px --border; padding-block --space-10; padding-inline --space-4
           stacked, gap --space-4 (≥768px: flex row, justify-between, align center)
  ├─ Wordmark + one-line tagline  --text-sm; --text-muted
  ├─ Nav repeat (Learn / Glossary / About)  --text-sm
  └─ "Free and open source." + copyright   --text-xs; --text-muted
```

Heading order on home: one `h1` (hero), `h2` for Features and Tracks sections. No hamburger menu — three short nav labels fit at 320px even with German expansion ("Lernen", "Glossar", "Über uns"); they wrap to a second row if needed (flex-wrap), never overflow.

---

## Design System Tokens

### Decision 1 — Typography: system UI stack (not Inter)

Rationale, in priority order: (a) 0 bytes vs ~45 KB woff2 — the spec's whole performance posture (§4, §14) is "ship nothing you don't need"; (b) zero layout shift by construction — no font swap, nothing to preload, no `size-adjust` metric tuning; (c) system fonts (SF Pro, Segoe UI Variable, Roboto) are excellent for the "well-designed docs site" register — the editorial feel comes from the scale, weight contrast, and whitespace below, not the typeface. §14's "self-host fonts; preload" clause is satisfied vacuously. FE note: leave a one-line comment in tokens.css: `/* SPEC-GAP §19: system stack chosen over Inter for 0-byte cost and zero CLS; swap here if brand demands it. */`

Fluid scale uses `clamp()` with a `rem + vw` middle term (rem component keeps text-only zoom working, WCAG 1.4.4). Scale is computed for viewports 360px → 1280px.

| Token | 360px | 1280px | Use |
|---|---|---|---|
| `--text-xs` | 12px | 12px (fixed) | overlines, chips, legal |
| `--text-sm` | 14px | 15px | nav, meta, captions |
| `--text-base` | 16px | 18px | body |
| `--text-lg` | 18px | 20px | subhead, feature titles |
| `--text-xl` | 20px | 24px | card titles, h4/h3 |
| `--text-2xl` | 24px | 30px | h2 |
| `--text-3xl` | 30px | 40px | h1 (interior pages) |
| `--text-4xl` | 36px | 52px | home hero h1 only |

Heading weights: h1/h2 = 700, h3/h4 = 600, UI emphasis = 500–600, body = 400. `--tracking-tight (-0.015em)` applies to `--text-3xl` and `--text-4xl` only.

### Decision 2 — Dark-mode mechanism: `data-theme` attribute on `<html>`

`:root` holds light values; `[data-theme="dark"]` overrides. Chosen because: (a) an attribute set by the pre-paint inline script gives a manual override that cleanly beats the OS setting; (b) a `prefers-color-scheme` media block guarded by `:root:not([data-theme])` gives no-JS users their OS theme for free (spec §4 requires full function with JS disabled — an inline script does not run then); (c) Tailwind supports it directly: `darkMode: ['class', '[data-theme="dark"]']`. The dark values appear twice in the file (override block + no-JS media block); this is deliberate — keep them byte-identical.

### Decision 3 — Color

Neutrals are cool slate (calm, editorial). Brand is indigo — confident, link-recognizable, and unused by any highlight role so it never collides with algorithm state. The six highlight roles are the only saturated colors; co-occurring sets were chosen for hue-family + luminance separation under deutan/protan simulation: sorting shows {compare amber-brown, swap magenta, active blue}; traversal shows {active blue, visited violet, frontier teal, found green}. The weakest CVD pair is frontier/found (teal vs green) — separated by luminance in both modes and, per §10, always paired with labels/icons; renderers must never let those two be the sole differentiator.

**Contrast ratios (WCAG 2.1, computed):**

| Pair | Light | Dark |
|---|---|---|
| `--text` on `--bg` | 17.8:1 | 15.2:1 |
| `--text` on `--surface` | 16.6:1 | 11.9:1 |
| `--text-muted` on `--bg` | 7.6:1 | 7.3:1 |
| `--text-muted` on `--surface` | 7.0:1 | 5.7:1 |
| `--brand` (link text) on `--bg` | 6.3:1 | 6.3:1 |
| `--brand` (link text) on `--surface` | 5.9:1 | 4.9:1 |
| `--brand-contrast` on `--brand` (buttons) | 6.3:1 | 6.3:1 |
| `--border-strong` (input borders/icons) on `--bg` | 4.8:1 | 3.9:1 |
| Highlights on `--bg` (all six, non-text graphics, min) | 3.3:1 (found) | 6.9:1 (visited) |

Every text pair clears 4.5:1; every UI/graphic pair clears 3:1. FE note for M3 renderers: use highlight tokens as 2px strokes/rings with fills derived via `color-mix(in srgb, var(--hl-*) 15%, transparent)`, keeping `--text` for labels on top — never put small text directly on a solid highlight fill.

### Ready-to-paste `src/styles/tokens.css`

```css
/* LearnDSA design tokens — M1. Source of truth for all color/type/space/motion.
   SPEC-GAP §19: system font stack chosen over Inter for 0-byte cost and zero CLS;
   swap --font-sans here if brand direction changes. */

:root {
  /* ---------- Typography ---------- */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace;

  --text-xs:   0.75rem;                                      /* 12px fixed */
  --text-sm:   clamp(0.875rem, 0.851rem + 0.109vw, 0.9375rem); /* 14→15px */
  --text-base: clamp(1rem, 0.951rem + 0.217vw, 1.125rem);      /* 16→18px */
  --text-lg:   clamp(1.125rem, 1.076rem + 0.217vw, 1.25rem);   /* 18→20px */
  --text-xl:   clamp(1.25rem, 1.152rem + 0.435vw, 1.5rem);     /* 20→24px */
  --text-2xl:  clamp(1.5rem, 1.353rem + 0.652vw, 1.875rem);    /* 24→30px */
  --text-3xl:  clamp(1.875rem, 1.63rem + 1.087vw, 2.5rem);     /* 30→40px */
  --text-4xl:  clamp(2.25rem, 1.859rem + 1.739vw, 3.25rem);    /* 36→52px */

  --leading-tight:   1.1;   /* --text-4xl hero */
  --leading-snug:    1.25;  /* headings 2xl/3xl */
  --leading-normal:  1.5;   /* UI, nav, buttons */
  --leading-relaxed: 1.7;   /* body prose */

  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --tracking-tight: -0.015em; /* 3xl/4xl only */

  /* ---------- Layout ---------- */
  --container-max: 72rem;   /* 1152px site shell */
  --measure: 70ch;          /* prose max-width (M2 lesson body) */

  /* ---------- Spacing (4px base) ---------- */
  --space-px: 1px;
  --space-0-5: 0.125rem; /*  2px */
  --space-1:   0.25rem;  /*  4px */
  --space-1-5: 0.375rem; /*  6px */
  --space-2:   0.5rem;   /*  8px */
  --space-3:   0.75rem;  /* 12px */
  --space-4:   1rem;     /* 16px */
  --space-5:   1.25rem;  /* 20px */
  --space-6:   1.5rem;   /* 24px */
  --space-8:   2rem;     /* 32px */
  --space-10:  2.5rem;   /* 40px */
  --space-12:  3rem;     /* 48px */
  --space-16:  4rem;     /* 64px */
  --space-20:  5rem;     /* 80px */
  --space-24:  6rem;     /* 96px */

  /* ---------- Radius (spec §13: 8px cards, 6px controls — confirmed) ---------- */
  --radius-sm: 4px;        /* inline code, small chips */
  --radius-control: 6px;   /* buttons, inputs, toggles, tabs */
  --radius-card: 8px;      /* cards, callouts, viz frame */
  --radius-full: 9999px;   /* pills, difficulty chips */

  /* ---------- Motion ---------- */
  --duration-fast: 150ms;  /* hover color/border */
  --duration-base: 200ms;  /* most UI transitions */
  --duration-slow: 300ms;  /* collapsible expand, larger movement */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);

  /* ---------- Focus ---------- */
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;
  --focus-ring-color: var(--brand);

  /* ---------- Color: LIGHT ---------- */
  --bg: #FFFFFF;
  --surface: #F6F7F9;
  --text: #0F172A;
  --text-muted: #475569;
  --border: #E2E8F0;         /* decorative separators only */
  --border-strong: #64748B;  /* input borders, meaningful icons (>=3:1) */
  --brand: #4F46E5;
  --brand-contrast: #FFFFFF;

  --hl-compare:  #B45309;
  --hl-swap:     #DB2777;
  --hl-active:   #0072B2;
  --hl-visited:  #7C3AED;
  --hl-frontier: #0F766E;
  --hl-found:    #16A34A;

  --shadow-1: 0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.06);
  --shadow-2: 0 2px 4px -1px rgb(15 23 42 / 0.06), 0 6px 16px -2px rgb(15 23 42 / 0.10);

  color-scheme: light;
}

/* ---------- Color: DARK (manual override via inline script / toggle) ---------- */
[data-theme="dark"] {
  --bg: #0B1220;
  --surface: #1E293B;
  --text: #E2E8F0;
  --text-muted: #94A3B8;
  --border: #334155;
  --border-strong: #64748B;
  --brand: #818CF8;
  --brand-contrast: #0B1220;

  --hl-compare:  #F59E0B;
  --hl-swap:     #F472B6;
  --hl-active:   #60A5FA;
  --hl-visited:  #A78BFA;
  --hl-frontier: #2DD4BF;
  --hl-found:    #4ADE80;

  /* Dark elevation is primarily surface+border; shadows add depth only */
  --shadow-1: 0 1px 2px 0 rgb(0 0 0 / 0.50);
  --shadow-2: 0 2px 4px -1px rgb(0 0 0 / 0.45), 0 8px 20px -2px rgb(0 0 0 / 0.55);

  color-scheme: dark;
}

/* ---------- No-JS fallback: honor OS preference when the inline script never ran.
   MUST stay byte-identical to the [data-theme="dark"] block above. ---------- */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --bg: #0B1220;
    --surface: #1E293B;
    --text: #E2E8F0;
    --text-muted: #94A3B8;
    --border: #334155;
    --border-strong: #64748B;
    --brand: #818CF8;
    --brand-contrast: #0B1220;
    --hl-compare:  #F59E0B;
    --hl-swap:     #F472B6;
    --hl-active:   #60A5FA;
    --hl-visited:  #A78BFA;
    --hl-frontier: #2DD4BF;
    --hl-found:    #4ADE80;
    --shadow-1: 0 1px 2px 0 rgb(0 0 0 / 0.50);
    --shadow-2: 0 2px 4px -1px rgb(0 0 0 / 0.45), 0 8px 20px -2px rgb(0 0 0 / 0.55);
    color-scheme: dark;
  }
}

/* ---------- Reduced motion: durations collapse to near-zero (0.01ms, not 0,
   so transitionend still fires for any listeners). ---------- */
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0.01ms;
    --duration-base: 0.01ms;
    --duration-slow: 0.01ms;
  }
}
```

### Tailwind theme extension for `tailwind.config.ts`

Tokens.css stays the single source of truth; Tailwind only aliases the variables.

```ts
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)',
        text: 'var(--text)', muted: 'var(--text-muted)',
        border: 'var(--border)', 'border-strong': 'var(--border-strong)',
        brand: 'var(--brand)', 'brand-contrast': 'var(--brand-contrast)',
        hl: {
          compare: 'var(--hl-compare)', swap: 'var(--hl-swap)',
          active: 'var(--hl-active)', visited: 'var(--hl-visited)',
          frontier: 'var(--hl-frontier)', found: 'var(--hl-found)',
        },
      },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      fontSize: {
        xs: ['var(--text-xs)', { lineHeight: 'var(--leading-normal)' }],
        sm: ['var(--text-sm)', { lineHeight: 'var(--leading-normal)' }],
        base: ['var(--text-base)', { lineHeight: 'var(--leading-relaxed)' }],
        lg: ['var(--text-lg)', { lineHeight: 'var(--leading-relaxed)' }],
        xl: ['var(--text-xl)', { lineHeight: 'var(--leading-snug)' }],
        '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-snug)' }],
        '3xl': ['var(--text-3xl)', { lineHeight: 'var(--leading-tight)', letterSpacing: 'var(--tracking-tight)' }],
        '4xl': ['var(--text-4xl)', { lineHeight: 'var(--leading-tight)', letterSpacing: 'var(--tracking-tight)' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)', control: 'var(--radius-control)', card: 'var(--radius-card)',
      },
      boxShadow: { 1: 'var(--shadow-1)', 2: 'var(--shadow-2)' },
      transitionDuration: {
        fast: 'var(--duration-fast)', base: 'var(--duration-base)', slow: 'var(--duration-slow)',
      },
      transitionTimingFunction: { standard: 'var(--ease-standard)' },
      maxWidth: { container: 'var(--container-max)', measure: 'var(--measure)' },
    },
  },
} // spacing intentionally NOT overridden: Tailwind's default scale is the same 4px base
```

### Theme toggle spec (component `ThemeToggle`, spec §9)

- **States:** two visible states — light and dark. "System" is the implicit default before the user ever interacts: no `localStorage` key → follow `prefers-color-scheme`. Rationale: one unambiguous icon button beats a tri-state segmented control in a slim header; the OS preference is still fully respected until the user explicitly overrides it, which satisfies §12/§13. (If the team later wants an explicit "system" option, it becomes a 3-option menu — do not build that for M1.)
- **Persistence:** `localStorage` key `theme`, values `"light" | "dark"`. Key absent = system. Written only on user click.
- **Behavior:** click sets `data-theme` on `<html>` to the opposite of the currently resolved theme and persists it. While no key exists, the island subscribes to `matchMedia('(prefers-color-scheme: dark)')` changes and updates `data-theme` live; once a key exists, unsubscribe.
- **Icon:** shows the action, not the state — moon icon in light mode ("switch to dark"), sun icon in dark mode. Both icons rendered in the static HTML; CSS `[data-theme]` selectors show the correct one (works pre-hydration, no flash, no layout shift — both occupy the same 20px box). Icons are `aria-hidden="true"`.
- **Accessible name:** real `<button>` with dynamic `aria-label`: `"Switch to dark theme"` / `"Switch to light theme"`, updated on every toggle. 40x40px hit area, `--radius-control`, focus-visible ring per token.
- **FOUC avoidance (required):** inline synchronous script in `<head>` of `BaseLayout` (Astro: `<script is:inline>`), before any content paints:

```html
<script is:inline>
(function () {
  try {
    var t = localStorage.getItem('theme');
    var dark = t ? t === 'dark'
                 : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) { /* no-JS/blocked storage: CSS media-query fallback applies */ }
})();
</script>
```

- **No theme-change transition:** switching themes must be instant (no cross-fade on `--bg`/`--text`); animating a full-page repaint reads as a glitch and fights `prefers-reduced-motion`.
- **No-JS:** hide the toggle via a `<noscript><style>` rule; the CSS media-query fallback already delivers the correct theme, so no dead control is shown.

---

## State Variations (M1 components)

- **Pre-hydration (toggle):** server HTML + `[data-theme]` CSS render the correct icon immediately; a click before hydration is a no-op — acceptable, hydration is near-instant with `client:load` on a ~1 KB island.
- **Hover:** nav links `--text-muted → --text`; track cards border `--border → --border-strong` plus `--shadow-1`; primary button darkens/lightens brand by overlaying `color-mix(in srgb, var(--brand) 88%, var(--text))`. All at `--duration-fast` / `--ease-standard`.
- **Focus:** every interactive element gets `outline: var(--focus-ring-width) solid var(--focus-ring-color); outline-offset: var(--focus-ring-offset)` on `:focus-visible`. Never `outline: none` without this replacement.
- **Active:** buttons translate 0 (no movement) — compress via slightly darker fill only; motion is reserved for the visualizer.
- **Current page:** the active nav link uses `--text` + `aria-current="page"`.
- **Disabled:** not used in M1 (no control on these pages can be disabled; do not ship gray dead buttons).
- **Loading/Empty/Error:** none exist on the static home page by design — content is prerendered. These states belong to the M2 Visualizer (input validation errors, JS-off fallback) and are owned by that milestone's spec; do not invent them here.

---

## Accessibility (a11y) Checklist (M1-specific)

1. **Contrast (WCAG 1.4.3 / 1.4.11):** all token pairs in the table above clear 4.5:1 (text) and 3:1 (UI/graphics) in both themes — Lighthouse a11y 100 on home is gated on using `--text-muted` (never lighter grays) for secondary text and `--border-strong` (never `--border`) for any input boundary.
2. **Focus & keyboard (2.4.7, 2.1.1):** skip link is the first tab stop; toggle is a native `<button>` with a dynamic `aria-label`; focus ring token applied globally via `:focus-visible`; tab order matches visual order (header → hero CTA → cards → footer).
3. **Motion & scheme preferences (2.3.3, §12):** `prefers-reduced-motion` collapses all duration tokens to 0.01ms globally (snap, not tween); `prefers-color-scheme` is honored with and without JS via the dual mechanism above; `color-scheme` is declared so native UI (scrollbars, form controls) matches the theme.
