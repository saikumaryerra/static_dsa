import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only — Playwright owns tests/e2e (§16).
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
