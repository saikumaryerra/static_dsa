// ESLint flat config: JS recommended + typescript-eslint + React hooks.
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
// eslint-plugin-react-hooks: rules-of-hooks and exhaustive-deps — the
// stale-closure guard for the islands' player timers (React migration D-15).
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig(
  {
    // Never lint build output, generated types, or third-party/tooling artifacts.
    ignores: [
      'dist/',
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
    // `?raw`).
    files: ['src/render/pre-paint.inline.js'],
    // A plain browser script (not a module): name the three globals it reads.
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
