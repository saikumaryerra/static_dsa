/**
 * `src/lib/mastery-ui.ts` — the pure halves of the M8.1 mastery surfaces: the
 * ring geometry and the copy.
 *
 * Vitest runs `environment: 'node'` with no DOM (`vitest.config.ts`), which is
 * exactly why the geometry and the wording live in a module rather than inside
 * the two islands that paint them: everything asserted below is reachable
 * without an SVG, a card or a browser. `paintPips` is the one DOM writer in that
 * module and is therefore left to Playwright — importing this file must not
 * execute it, which the import here proves.
 *
 * The last block is a calm invariant, not a formatting test: the design bans
 * loss-framing vocabulary and countdowns outright (`docs/m8-gamification.md`,
 * "calm invariants"), and a ban that is only written down erodes under
 * maintenance. Asserting it over the exported copy is how it stays true.
 */
import { describe, expect, it } from 'vitest';
import {
  ARC_CIRCUMFERENCE,
  ARC_RADIUS,
  arcOffset,
  masteryCountsText,
  PIPS_KILL_SWITCH,
  stageLabel,
  trackCountText,
} from '../../src/lib/mastery-ui';
import type { MasteryStage } from '../../src/lib/progress';

describe('stageLabel', () => {
  it('names each earned stage — the pips are aria-hidden, so this text is the whole signal', () => {
    expect(stageLabel('learned')).toBe('Learned');
    expect(stageLabel('practiced')).toBe('Practiced');
    expect(stageLabel('mastered')).toBe('Mastered');
  });

  it('is empty for a lesson with nothing recorded, which renders nothing at all', () => {
    // Not "Not started": absence is never labelled, never counted and never
    // shamed (design stance 5 — never punish absence).
    expect(stageLabel('none')).toBe('');
  });

  it('has a label for every stage the store can resolve', () => {
    // Guards the union: a stage added to `progress.ts` without a word here
    // would render pips with an empty label — colour-only, and a §12 failure.
    const stages: MasteryStage[] = ['none', 'learned', 'practiced', 'mastered'];
    for (const stage of stages) {
      expect(typeof stageLabel(stage)).toBe('string');
    }
    expect(
      stages.filter((stage) => stageLabel(stage) !== '').length,
      'every stage above `none` must be nameable',
    ).toBe(3);
  });
});

describe('the ring constants baked into TrackArc at build time', () => {
  it('is the circumference of the radius the component draws', () => {
    expect(ARC_CIRCUMFERENCE).toBeCloseTo(2 * Math.PI * ARC_RADIUS, 2);
  });

  it('is rounded, so the build-time dash array and the runtime offset are the same literal', () => {
    // An unrounded pair leaves 17-digit floats in the DOM and a "full" ring
    // that misses zero by 1e-14.
    expect(ARC_CIRCUMFERENCE).toBe(Math.round(ARC_CIRCUMFERENCE * 1000) / 1000);
  });

  it('fits inside the 28×28 viewBox with its 3px stroke', () => {
    expect(ARC_RADIUS + 1.5).toBeLessThanOrEqual(14);
  });
});

describe('arcOffset (the only value the runtime writes)', () => {
  it('draws nothing at zero and the whole ring at the total', () => {
    expect(arcOffset(0, 9)).toBe(ARC_CIRCUMFERENCE);
    expect(arcOffset(9, 9)).toBe(0);
  });

  it('draws the fraction between them', () => {
    expect(arcOffset(3, 9)).toBeCloseTo((ARC_CIRCUMFERENCE * 2) / 3, 2);
    expect(arcOffset(1, 2)).toBeCloseTo(ARC_CIRCUMFERENCE / 2, 2);
  });

  it('never over-draws when a count outruns its total', () => {
    // Defensive rather than expected: the island counts both numbers from the
    // same injected list. A negative count is the same shape of impossible.
    expect(arcOffset(12, 9)).toBe(0);
    expect(arcOffset(-3, 9)).toBe(ARC_CIRCUMFERENCE);
  });

  it('draws an EMPTY ring for a degenerate track rather than dividing by zero', () => {
    // Empty is the honest answer, and it is also the safe one: a NaN offset
    // blanks the attribute and leaves a FULL ring claiming a finished track.
    expect(arcOffset(0, 0)).toBe(ARC_CIRCUMFERENCE);
    expect(arcOffset(2, 0)).toBe(ARC_CIRCUMFERENCE);
    expect(arcOffset(Number.NaN, 9)).toBe(ARC_CIRCUMFERENCE);
    expect(arcOffset(3, Number.NaN)).toBe(ARC_CIRCUMFERENCE);
    expect(arcOffset(3, Number.POSITIVE_INFINITY)).toBe(ARC_CIRCUMFERENCE);
  });

  it('accepts an injected circumference, and refuses an impossible one', () => {
    expect(arcOffset(1, 4, 100)).toBe(75);
    expect(arcOffset(1, 4, 0)).toBe(0);
    expect(arcOffset(1, 4, Number.NaN)).toBe(0);
  });

  it('is rounded to 3dp, so the DOM never carries float noise', () => {
    const offset = arcOffset(1, 7);
    expect(offset).toBe(Math.round(offset * 1000) / 1000);
  });
});

describe('the counter copy', () => {
  it('states the number AND where it lives — every persistent surface owes both', () => {
    expect(trackCountText(3, 9)).toBe('3 of 9 done on this device');
  });

  it('is M7.2 wording, unchanged by the ring drawn around it', () => {
    // Pinned: this string is the same surface M7.2 shipped, and the /learn
    // e2e suite asserts it verbatim.
    expect(trackCountText(0, 9)).toBe('0 of 9 done on this device');
  });

  it('shows both earned counts, so the self-reported one is never displayed alone', () => {
    expect(masteryCountsText(2, 1)).toBe('Practiced 2 · Mastered 1');
    expect(masteryCountsText(0, 0)).toBe('Practiced 0 · Mastered 0');
  });
});

describe('calm invariants over the exported copy', () => {
  const COPY = [
    stageLabel('learned'),
    stageLabel('practiced'),
    stageLabel('mastered'),
    trackCountText(3, 9),
    masteryCountsText(2, 1),
    masteryCountsText(0, 0),
  ];

  it('never loss-frames absence or counts days behind', () => {
    // The banned vocabulary of `docs/m8-gamification.md`: nothing is overdue,
    // missed, lost or broken here, because nothing decays and nothing demotes.
    const BANNED =
      /\b(overdue|missed|behind|late|expired|lost|streak|don't lose|keep it up)\b/i;
    for (const line of COPY) {
      expect(line, `banned vocabulary in "${line}"`).not.toMatch(BANNED);
    }
  });

  it('never names a second currency', () => {
    // Mastery states are the only progress measure in the product; XP, points,
    // levels and badges were designed and killed (see the design doc).
    const CURRENCY = /\b(xp|points?|levels?|badges?|score|rank)\b/i;
    for (const line of COPY) {
      expect(line, `second currency in "${line}"`).not.toMatch(CURRENCY);
    }
  });
});

describe('the shared <noscript> kill-switch', () => {
  it('hides the pips with a rule nothing in the bundle can outrank', () => {
    // Both emitters (MasteryPips, and LessonCard on its behalf) render THIS
    // string, so the selector cannot drift between them.
    expect(PIPS_KILL_SWITCH).toContain('.mastery-pips');
    expect(PIPS_KILL_SWITCH).toContain('display: none !important');
    expect(PIPS_KILL_SWITCH.startsWith('<style>')).toBe(true);
    expect(PIPS_KILL_SWITCH.endsWith('</style>')).toBe(true);
  });
});
