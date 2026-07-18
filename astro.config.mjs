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
  vite: {
    // Tailwind v4 integrates with Astro via this Vite plugin (no @astrojs/tailwind).
    plugins: [tailwindcss()],
  },
});
