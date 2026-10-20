// ESLint flat config: JS recommended + typescript-eslint + React hooks + Astro
// plugin. Astro components are linted via astro-eslint-parser (pulled in by the
// plugin), which stays until the last `.astro` file is ported (React migration P3).
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
// eslint-plugin-react-hooks: rules-of-hooks and exhaustive-deps — the
// stale-closure guard for the islands' player timers (React migration D-15).
import reactHooks from 'eslint-plugin-react-hooks';

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
      // Agent/tooling scratch space, not project source. `.claude/worktrees/`
      // holds a full nested checkout, so without this ESLint parses 368 files
      // that have no tsconfig root here; both are git-excluded already.
      '.claude/',
      '.impeccable/',
      // React migration: the frozen legacy artifact and prerender metadata.
      '.migration/',
      '.build/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs['flat/recommended'],
  {
    files: ['**/*.tsx'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    rules: {
      // §18 DoD: zero console usage ships — `'no-console': 'error'` bans ALL
      // console methods (console.log, .warn, .error, everything). The strict ban
      // is intentional; no exceptional path in this codebase logs.
      'no-console': 'error',
    },
  },
  {
    // The designer handoff requires the pre-paint theme script VERBATIM (ES5-style
    // `var` + an intentionally empty `catch (e)`), so these two rules are relaxed
    // for the file that holds it rather than editing the mandated script. It
    // lives in `src/render/pre-paint.inline.js` (inlined by `Document.tsx` via
    // `?raw`); the BaseLayout globs cover the legacy layout until WS-C ports it
    // (the second matches the virtual files the Astro plugin creates for
    // inline <script> blocks).
    files: [
      'src/render/pre-paint.inline.js',
      '**/BaseLayout.astro',
      '**/BaseLayout.astro/*.{js,ts}',
    ],
    // A plain browser script (not a module): name the three globals it reads,
    // which an Astro <script> got from the plugin's browser environment.
    languageOptions: {
      globals: {
        localStorage: 'readonly',
        window: 'readonly',
        document: 'readonly',
      },
    },
    rules: {
      'no-var': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
