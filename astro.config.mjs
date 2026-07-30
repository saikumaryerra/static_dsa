// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // SPEC-GAP: no production domain is specified anywhere in the spec (§14 requires
  // canonical URLs, which need an absolute origin). Placeholder used so canonical/OG
  // tags are structurally correct; swap this one value when the real host is known.
  site: 'https://learndsa.example.com',
  output: 'static',
  integrations: [mdx()],
  markdown: {
    // Dual-theme Shiki (spec §12/§13 AA): emit CSS-variable tokens so code blocks
    // follow the site light/dark theme instead of a single fixed dark palette.
    // Both comment colors clear WCAG 1.4.3 (≥4.5:1): github-light comment #6a737d
    // on #fff = 4.82:1; github-dark-default comment #8b949e on #0d1117 = 6.15:1.
    // (The old single `github-dark` comment was 3.05:1 — the a11y failure fixed here.)
    // Keep these two names in sync with the `<Code themes>` in CodeTabs.astro and the
    // `.astro-code` dark wiring in global.css. Highlighting stays build-time (no JS).
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark-default' },
    },
  },
  vite: {
    // Tailwind v4 integrates with Astro via this Vite plugin (no @astrojs/tailwind).
    plugins: [tailwindcss()],
  },
});
