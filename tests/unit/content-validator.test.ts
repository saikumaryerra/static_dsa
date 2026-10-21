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
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  conventionGaps,
  validateContent,
} from '../../scripts/lib/content-validator.mjs';

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

  it('has no OVER_CEILING_ACCEPTED entry that outlived its overage', () => {
    // The table in content-validator.mjs excuses four lessons from the word
    // ceiling, each with a written reason. The guard against it rotting into a
    // blanket exemption is that an entry whose lesson is back INSIDE the ceiling
    // is an error, not a note — so this assertion is the first one above,
    // reached transitively. Stated here so the intent is visible: trim one of
    // those lessons and `npm run test` goes red until its entry is deleted.
    expect(
      result.errors.filter((e) => e.includes('OVER_CEILING_ACCEPTED')),
    ).toEqual([]);
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

describe('conventionGaps', () => {
  /** Builds a cohort: `n` lessons in `course`, the first `withIt` carrying `section`. */
  const cohort = (
    course: string,
    n: number,
    withIt: number,
    section = 'Interview notes',
  ) =>
    Array.from({ length: n }, (_, i) => ({
      file: `${course}-${i}.mdx`,
      course,
      titles: ['Intuition', ...(i < withIt ? [section] : [])],
    }));

  it("says nothing when a section is one course's minority habit", () => {
    // Kubernetes carries "Interview notes" in 1 lesson of 67. One lesson doing
    // something no sibling does is a judgement, not a gap, and reporting the
    // other 66 would be the noise that gets a guard switched off.
    expect(conventionGaps(cohort('kubernetes', 67, 1))).toEqual([]);
  });

  it('names every lesson missing a section the course has adopted', () => {
    // 39 of 45 is 87%, over the threshold, so the six absentees are the report.
    const gaps = conventionGaps(cohort('system-design', 45, 39));
    expect(gaps).toHaveLength(6);
    expect(gaps[0]).toContain('39 of 45 system-design lessons (87%)');
    expect(gaps[0]).toContain('no "## Interview notes"');
  });

  it('says nothing once every lesson carries it', () => {
    // The state the repair pass is aiming at: a convention with no absentees.
    expect(conventionGaps(cohort('system-design', 45, 45))).toEqual([]);
  });

  it('is silent exactly below the threshold and speaks exactly at it', () => {
    // 3 of 4 is 75%. The boundary is worth pinning: an off-by-one here either
    // reports a habit as a convention or lets a real gap through.
    expect(conventionGaps(cohort('c', 4, 3))).toHaveLength(1);
    expect(conventionGaps(cohort('c', 4, 2))).toEqual([]);
  });

  it('never reports the dsa course, which predates this contract', () => {
    // The fifteen algorithm lessons follow spec §7's older six-heading shape,
    // and SPEC §2 says preserve them.
    expect(conventionGaps(cohort('dsa', 15, 14))).toEqual([]);
  });

  it('judges each course on its own cohort', () => {
    const mixed = [
      ...cohort('kubernetes', 67, 1),
      ...cohort('system-design', 45, 39),
    ];
    const gaps = conventionGaps(mixed);
    expect(gaps).toHaveLength(6);
    expect(gaps.every((g) => g.includes('system-design'))).toBe(true);
  });
});

describe('rule 7: diagram imports after the cutover codemod', () => {
  /**
   * The codemod (scripts/migration/codemod-mdx-imports.mjs) rewrote every
   * lesson import to the extensionless specifier the React build resolves
   * (`…/diagrams/K8sArchitecture`). The rule must still FIND those imports —
   * otherwise it would pass every lesson by never checking a diagram — and read
   * the `.tsx` they name. A throwaway root holds one real diagram lesson and a
   * diagram component without a caption, so the rule's error proves it parsed
   * the import; the shipped component proves the happy path.
   */
  const LESSON = 'k8s-what-kubernetes-is.mdx';

  /**
   * A validator root with the real lesson and a chosen diagram source.
   *
   * @param diagram - `K8sArchitecture.tsx`'s source in the fixture.
   * @returns The root path.
   */
  function fixtureRoot(diagram: string): string {
    const root = mkdtempSync(path.join(tmpdir(), 'ldsa-validator-'));
    mkdirSync(path.join(root, 'src', 'content', 'lessons'), {
      recursive: true,
    });
    mkdirSync(path.join(root, 'src', 'components', 'diagrams'), {
      recursive: true,
    });
    symlinkSync(
      path.join(ROOT, 'src', 'styles'),
      path.join(root, 'src', 'styles'),
    );
    symlinkSync(path.join(ROOT, 'docs'), path.join(root, 'docs'));
    copyFileSync(
      path.join(ROOT, 'src', 'content', 'lessons', LESSON),
      path.join(root, 'src', 'content', 'lessons', LESSON),
    );
    writeFileSync(
      path.join(root, 'src', 'components', 'diagrams', 'K8sArchitecture.tsx'),
      diagram,
    );
    return root;
  }

  const diagramErrors = (root: string) =>
    validateContent(root).errors.filter((e: string) => e.includes('diagram'));

  it('the shipped lesson uses the extensionless specifier', () => {
    const source = readFileSync(
      path.join(ROOT, 'src', 'content', 'lessons', LESSON),
      'utf8',
    );
    expect(source).toContain(
      "import K8sArchitecture from '../../components/diagrams/K8sArchitecture';",
    );
  });

  it('reads the .tsx an extensionless import names, and flags a missing caption', () => {
    const root = fixtureRoot('<Figure title="t" description="d" />');
    try {
      expect(diagramErrors(root)).toEqual([
        'diagrams/K8sArchitecture.tsx: no `caption` — every figure needs an accessible name, description and caption',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes the shipped component', () => {
    const root = fixtureRoot(
      readFileSync(
        path.join(ROOT, 'src', 'components', 'diagrams', 'K8sArchitecture.tsx'),
        'utf8',
      ),
    );
    try {
      expect(diagramErrors(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
