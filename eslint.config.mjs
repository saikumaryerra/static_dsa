// ESLint flat config: JS recommended + typescript-eslint + Astro plugin.
// Astro components are linted via astro-eslint-parser (pulled in by the plugin).
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default defineConfig(
  {
    // Never lint build output, generated types, or third-party/tooling artifacts.
    ignores: [
      'dist/',
      '.astro/',
      'node_modules/',
      'playwright-report/',
      'test-results/',
      '.opencode/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs['flat/recommended'],
  {
    rules: {
      // §18 DoD: no console.log in shipped code (warn/error stay available for
      // genuinely exceptional paths, of which M1 has none).
      'no-console': 'error',
    },
  },
  {
    // The designer handoff requires the pre-paint theme script VERBATIM (ES5-style
    // `var` + an intentionally empty `catch (e)`), so these two rules are relaxed
    // for the layout that hosts it rather than editing the mandated script. The
    // second glob matches the virtual files (e.g. BaseLayout.astro/1_1.ts) the
    // Astro plugin's client-side-ts processor creates for inline <script> blocks.
    files: ['**/BaseLayout.astro', '**/BaseLayout.astro/*.{js,ts}'],
    rules: {
      'no-var': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
