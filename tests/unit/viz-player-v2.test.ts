/**
 * Pure halves of M7.2's Player v2 (site spec §11, docs/m7-ux-overhaul.md).
 *
 * Everything the visualizer gained that is a FUNCTION rather than a DOM effect:
 * the build-time legend, the custom-input disclosure helpers, and the speed
 * preference normalizer. The DOM/storage halves (aria-disabled bounds, the
 * live-region mute, the scroll-region toggle, `pref:viz-speed` round-tripping)
 * belong to Playwright — Vitest runs `environment: 'node'` with no DOM and no
 * localStorage.
 *
 * Two cases here run against the REAL algorithms rather than a stub, because the
 * whole point of `probeListCap` is that it reports what the shipped parser does:
 * a hand-mocked parser would let the helper text drift from the caps it claims
 * to disclose.
 */
import { describe, expect, it } from 'vitest';
import { collectLegend, LEGEND_LABELS } from '../../src/viz/core/legend';
import {
  inputHelpText,
  probeListCap,
  splitAuthoredInput,
} from '../../src/viz/core/input-hint';
import { normalizeSpeed, SPEED_OPTIONS } from '../../src/viz/core/player';
import { HIGHLIGHTS } from '../../src/viz/core/highlight';
import { binarySearch } from '../../src/viz/algorithms/binary-search';
import { stackOperations } from '../../src/viz/algorithms/stack-operations';
import { recursionCallStack } from '../../src/viz/algorithms/recursion-callstack';
import type { Highlight, Trace } from '../../src/viz/core/types';

/** A one-step trace carrying exactly the given highlights. */
function traceOf(...highlights: Highlight[]): Trace<null> {
  return [{ state: null, explanation: 'x', highlights }];
}

describe('collectLegend', () => {
  it('returns nothing for a trace with no highlights', () => {
    expect(collectLegend([{ state: null, explanation: 'x' }])).toEqual([]);
    expect(collectLegend([])).toEqual([]);
  });

  it('lists each used kind once, in display order, ignoring unused kinds', () => {
    const trace: Trace<null> = [
      ...traceOf({ kind: 'found', ids: ['i1'] }),
      ...traceOf(
        { kind: 'compare', ids: ['i0'] },
        { kind: 'active', ids: ['i1'] },
      ),
      ...traceOf({ kind: 'compare', ids: ['i2'] }),
    ];
    expect(collectLegend(trace).map((entry) => entry.kind)).toEqual([
      'active',
      'compare',
      'found',
    ]);
  });

  it('takes each row token from HIGHLIGHTS, so the legend cannot drift', () => {
    const [entry] = collectLegend(traceOf({ kind: 'swap', ids: ['i0'] }));
    expect(entry?.token).toBe(HIGHLIGHTS.swap.token);
    expect(entry?.glyph).toBe('↔');
    expect(entry?.word).toBe('Swapping');
  });

  it('gives the two shape-only cues no glyph (swatch + word pills)', () => {
    expect(LEGEND_LABELS.active.glyph).toBeNull();
    expect(LEGEND_LABELS.frontier.glyph).toBeNull();
    const words = Object.values(LEGEND_LABELS).map((label) => label.word);
    expect(words.every((word) => word.length > 0)).toBe(true);
  });

  it('covers every highlight kind, so no drawing can go unexplained', () => {
    for (const kind of Object.keys(HIGHLIGHTS)) {
      expect(LEGEND_LABELS).toHaveProperty(kind);
    }
  });

  it('describes the real binary-search trace with its three kinds', () => {
    const kinds = collectLegend(
      binarySearch.run({ array: [1, 3, 5, 7, 9, 11], target: 7 }),
    ).map((entry) => entry.kind);
    expect(kinds).toEqual(['active', 'range', 'found']);
  });
});

describe('splitAuthoredInput', () => {
  it('splits an array + target string into its two fields', () => {
    expect(splitAuthoredInput('[1,3,5,7,9,11] target=7')).toEqual({
      input: '[1,3,5,7,9,11]',
      target: '7',
    });
  });

  it('keeps algorithm-specific companions with the first field', () => {
    expect(splitAuthoredInput('[11,24,6,15,20] cap=5 target=6')).toEqual({
      input: '[11,24,6,15,20] cap=5',
      target: '6',
    });
  });

  it('returns an empty target when the input has none', () => {
    expect(splitAuthoredInput('[5,9,3,12,8,15]')).toEqual({
      input: '[5,9,3,12,8,15]',
      target: '',
    });
    expect(splitAuthoredInput('4')).toEqual({ input: '4', target: '' });
  });

  it('splits on the LAST separator and trims both halves', () => {
    expect(splitAuthoredInput('  a target=b target=9  ')).toEqual({
      input: 'a target=b',
      target: '9',
    });
  });

  it('round-trips an empty authored input', () => {
    expect(splitAuthoredInput('')).toEqual({ input: '', target: '' });
  });
});

describe('probeListCap', () => {
  it('reports the cap the real parser enforces (binary search: 30)', () => {
    expect(
      probeListCap('[1,3,5,7,9,11] target=7', (raw) =>
        binarySearch.parseInput(raw),
      ),
    ).toBe(30);
  });

  it('reports a different structure’s own, smaller cap (stack: 12)', () => {
    expect(
      probeListCap('[12,34,56]', (raw) => stackOperations.parseInput(raw)),
    ).toBe(12);
  });

  it('returns null when the authored input has no list to vary', () => {
    expect(
      probeListCap('4', (raw) => recursionCallStack.parseInput(raw)),
    ).toBeNull();
  });

  it('preserves everything around the list while probing', () => {
    const seen: string[] = [];
    probeListCap('[1,2] cap=5 target=6', (raw) => {
      seen.push(raw);
      return raw.includes('cap=5') ? {} : { error: 'lost the companion' };
    });
    expect(seen).toHaveLength(40);
    expect(seen[0]).toBe('[1] cap=5 target=6');
    expect(seen.every((raw) => raw.endsWith(' cap=5 target=6'))).toBe(true);
  });

  it('finds the cap even when small inputs are rejected for another reason', () => {
    // Mirrors array-operations: `target=2` is an INDEX, so n < 3 is invalid too.
    const cap = probeListCap('[10,20,30] target=2', (raw) => {
      const items = raw.slice(1, raw.indexOf(']')).split(',').length;
      return items < 3 || items > 25 ? { error: 'nope' } : {};
    });
    expect(cap).toBe(25);
  });

  it('returns null for an uncapped parser rather than inventing a limit', () => {
    expect(probeListCap('[1,2,3]', () => ({}))).toBeNull();
  });

  it('returns null when nothing at all parses', () => {
    expect(probeListCap('[1,2,3]', () => ({ error: 'always' }))).toBeNull();
  });
});

describe('inputHelpText', () => {
  it('discloses both the cap and the example when the cap is known', () => {
    expect(inputHelpText({ example: '[1,3,5]', cap: 30 })).toBe(
      'Up to 30 whole numbers, comma-separated. Example: [1,3,5]',
    );
  });

  it('drops the cap sentence when it is not derivable', () => {
    expect(inputHelpText({ example: '0-1,0-2,1-3', cap: null })).toBe(
      'Example: 0-1,0-2,1-3',
    );
  });

  it('says nothing when there is nothing honest to say', () => {
    expect(inputHelpText({ example: '', cap: null })).toBe('');
  });
});

describe('normalizeSpeed', () => {
  it('accepts every option the transport offers', () => {
    for (const option of SPEED_OPTIONS) {
      expect(normalizeSpeed(String(option))).toBe(option);
    }
  });

  it('rejects anything the <select> could not display', () => {
    for (const raw of ['0.75', '4', '0', '-1', 'fast', '', 'NaN']) {
      expect(normalizeSpeed(raw)).toBeNull();
    }
  });

  it('treats missing storage as no preference', () => {
    expect(normalizeSpeed(null)).toBeNull();
  });
});
