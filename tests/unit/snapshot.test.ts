import { describe, expect, it } from 'vitest';
import { snapshot } from '../../src/viz/core/snapshot';

describe('snapshot', () => {
  it('deep-clones nested arrays and objects with no shared references', () => {
    const original = {
      array: [1, 2, 3],
      window: { lo: 0, hi: 2 },
      tags: ['a', 'b'],
    };
    const copy = snapshot(original);

    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.array).not.toBe(original.array);
    expect(copy.window).not.toBe(original.window);

    // Mutating the copy must not touch the original.
    copy.array[0] = 999;
    copy.window.lo = 5;
    expect(original.array[0]).toBe(1);
    expect(original.window.lo).toBe(0);
  });

  it('preserves values JSON round-tripping would drop', () => {
    const copy = snapshot({ set: new Set([1, 2]), map: new Map([['k', 1]]) });
    expect(copy.set).toBeInstanceOf(Set);
    expect(copy.map.get('k')).toBe(1);
  });
});
