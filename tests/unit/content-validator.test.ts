/**
 * The content validator, run as part of `npm run test` (SPEC Appendix D item 10).
 *
 * Appendix D asks for the validator to run "as part of the test suite (or a
 * script wired into CI) and fail the build on any error". It is both: this suite
 * is the DoD gate's copy, and `npm run validate:content` is the one an author
 * runs while writing. Neither restates a rule — both call the same module.
 *
 * The second suite is the validator validating itself: a deliberately broken
 * lesson must produce an error, or a green run here would only prove the pass
 * executed, not that it can fail.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from '../../scripts/lib/content-validator.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

describe('content validator', () => {
  const result = validateContent(ROOT);

  it('finds no errors in the shipped content', () => {
    expect(result.errors, result.errors.join('\n')).toEqual([]);
  });

  it('actually looked at the lessons', () => {
    // Without this, an empty glob would satisfy the assertion above by never
    // checking anything — the same non-vacuity guard the glossary suite uses.
    expect(result.checked).toBeGreaterThanOrEqual(15);
  });
});

describe('the Appendix coverage map', () => {
  it('maps every topic to at least one lesson', async () => {
    const { readFileSync } = await import('node:fs');
    const coverage = JSON.parse(
      readFileSync(path.join(ROOT, 'docs/courses/coverage.json'), 'utf8'),
    ) as {
      topics: { id: string; appendix: string; lessons: string[] }[];
    };
    for (const topic of coverage.topics) {
      expect(topic.lessons.length, topic.id).toBeGreaterThan(0);
    }
  });

  it('still carries every Appendix section, at its pinned size', async () => {
    // Pinned so a topic cannot be quietly dropped to make the validator pass —
    // "every Appendix topic appears in coverage.json" (Appendix D item 9) is
    // otherwise a claim nothing can check, since coverage.json IS the list.
    // These counts are the transcription of SPEC.md Appendix A and B.
    const { readFileSync } = await import('node:fs');
    const coverage = JSON.parse(
      readFileSync(path.join(ROOT, 'docs/courses/coverage.json'), 'utf8'),
    ) as { topics: { appendix: string }[] };
    const counts: Record<string, number> = {};
    for (const topic of coverage.topics) {
      counts[topic.appendix] = (counts[topic.appendix] ?? 0) + 1;
    }
    expect(counts).toEqual({
      A1: 11,
      A2: 11,
      A3: 8,
      A4: 7,
      A5: 8,
      A6: 10,
      A7: 6,
      A8: 9,
      A9: 7,
      A10: 6,
      A11: 9,
      A12: 10,
      A13: 10,
      A14: 8,
      B1: 13,
      B2: 20,
      B3: 8,
      B4: 7,
      B5: 9,
      B6: 2,
    });
  });
});
