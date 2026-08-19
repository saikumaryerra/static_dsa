/**
 * `claimInstrumentId` — the derivation behind every instrument anchor (Plan C §5).
 *
 * Testable here at all because the id is a pure function of (pathname,
 * algorithm, renderer) plus a per-render tally, and the tally's key is an opaque
 * object — in production `Astro.request`, here a plain `{}`. The harness is
 * `environment: 'node'` with no DOM, and nothing below needs one.
 *
 * This file is where the COLLISION TIEBREAK is proven. No page the site ships
 * mounts two instruments of the same algorithm and renderer, so the suffix
 * cannot be demonstrated in the e2e suite without inventing a fixture page; it
 * is pinned here instead, and `tests/e2e/plan-c-ledger.spec.ts` asserts the
 * other half — that real pages stay clean and never grow a suffix.
 */
import { describe, expect, it } from 'vitest';
import { claimInstrumentId } from '../../src/viz/core/instrument-id';

/** A fresh page render. Production passes `Astro.request`; the identity is all that matters. */
const render = (): object => ({});

describe('claimInstrumentId', () => {
  it('derives an id that names its algorithm and is CSS-id-safe', () => {
    const id = claimInstrumentId(
      render(),
      '/learn/binary-search',
      'binary-search',
      'array',
    );
    expect(id).toMatch(/^viz-binary-search-[a-z0-9]{6}$/);
  });

  it('is stable across renders — the whole point', () => {
    // Two page renders (a rebuild, a dev reload) must mint the same id, or no
    // row anchor, StepLink or bookmark survives.
    const first = claimInstrumentId(
      render(),
      '/learn/binary-search',
      'binary-search',
      'array',
    );
    const second = claimInstrumentId(
      render(),
      '/learn/binary-search',
      'binary-search',
      'array',
    );
    expect(second).toBe(first);
  });

  it('separates instruments by algorithm, by renderer, and by page', () => {
    const scope = render();
    const ids = [
      claimInstrumentId(scope, '/learn/sorting-basics', 'bubble-sort', 'bars'),
      claimInstrumentId(
        scope,
        '/learn/sorting-basics',
        'selection-sort',
        'bars',
      ),
      claimInstrumentId(scope, '/learn/sorting-basics', 'bubble-sort', 'array'),
      claimInstrumentId(
        render(),
        '/learn/sorting-intro',
        'bubble-sort',
        'bars',
      ),
    ];
    expect(new Set(ids).size).toBe(4);
    // The common case carries no suffix: three distinct instruments, three
    // clean ids.
    expect(ids.every((id) => !/-\d+$/.test(id))).toBe(true);
  });

  it('appends a tiebreak ONLY on an actual repeat, and counts from 2', () => {
    const scope = render();
    const first = claimInstrumentId(
      scope,
      '/dev/renderers',
      'demo-stack',
      'stack',
    );
    const second = claimInstrumentId(
      scope,
      '/dev/renderers',
      'demo-stack',
      'stack',
    );
    const third = claimInstrumentId(
      scope,
      '/dev/renderers',
      'demo-stack',
      'stack',
    );

    expect(first).toMatch(/^viz-demo-stack-[a-z0-9]{6}$/);
    expect(second).toBe(`${first}-2`);
    expect(third).toBe(`${first}-3`);
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('restarts the tally per render, so a reload replays the same ids', () => {
    // The failure this guards: a module-global counter would keep counting
    // across `astro dev` requests, so the second load of an unchanged page
    // would suffix ids that never collided.
    const page = (): string[] => {
      const scope = render();
      return [
        claimInstrumentId(scope, '/dev/renderers', 'demo-stack', 'stack'),
        claimInstrumentId(scope, '/dev/renderers', 'demo-stack', 'stack'),
      ];
    };
    expect(page()).toEqual(page());
  });

  it('never emits an empty or unsafe id, whatever it is handed', () => {
    // Registry ids are kebab-case today; this is the guard for the day one
    // isn't. An id is a `querySelector` target, so a space or an empty segment
    // is a broken anchor rather than an ugly one.
    expect(
      claimInstrumentId(render(), '/', 'Demo Linked List!', 'linkedList'),
    ).toMatch(/^viz-demo-linked-list-[a-z0-9]{6}$/);
    expect(claimInstrumentId(render(), '/', '', 'array')).toMatch(
      /^viz-viz-[a-z0-9]{6}$/,
    );
  });
});
