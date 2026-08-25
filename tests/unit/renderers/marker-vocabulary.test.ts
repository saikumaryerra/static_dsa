/**
 * A renderer may not invent a vocabulary the lesson disowns.
 *
 * `ArrayRenderer` hardcoded "lo"/"hi" for EVERY `range` highlight, and the
 * registry maps both the `array` and the `bars` id to it — so seven of the eight
 * algorithms that emit a range printed a search-window vocabulary their own
 * prose disowns. Linear search printed it two paragraphs after saying "There is
 * no `lo`, `hi`, or `mid`", and `array-operations` printed it on all 13 steps of
 * the arrays lesson.
 *
 * Scoped by highlight KIND rather than by algorithm: an exemption list per
 * algorithm would have left `array-operations` both the one lesson still
 * printing the wrong labels and the one lesson the test never looked at.
 *
 * The two things this must NOT over-apply are asserted here too: the range
 * underbar (the WCAG non-colour cue for the kind, design §3.2) still draws for a
 * range that prints no label, and an AUTHORED label on another kind still
 * reaches the drawing.
 */
import { describe, expect, it } from 'vitest';
import type {
  Algorithm,
  RendererModule,
  Step,
} from '../../../src/viz/core/types';
import { binarySearch } from '../../../src/viz/algorithms/binary-search';
import { linearSearch } from '../../../src/viz/algorithms/linear-search';
import { arrayOperations } from '../../../src/viz/algorithms/array-operations';
import { bubbleSort } from '../../../src/viz/algorithms/bubble-sort';
import { insertionSort } from '../../../src/viz/algorithms/insertion-sort';
import { selectionSort } from '../../../src/viz/algorithms/selection-sort';
import { mergeSort } from '../../../src/viz/algorithms/merge-sort';
import { quickSort } from '../../../src/viz/algorithms/quick-sort';
import {
  arrayRenderer,
  barsRenderer,
} from '../../../src/viz/renderers/ArrayRenderer';

const OPTS = { title: 't', idBase: 'v' };

/**
 * The two registry ids this module serves, erased to the shape the tables below
 * drive. Both renderers share one `markersMarkup`, so the defect and its fix
 * reach every algorithm mounted through either id.
 */
const arrayR: RendererModule<unknown> = arrayRenderer;
const barsR: RendererModule<unknown> = barsRenderer;

/** Widens a concrete algorithm to the erased shape this table drives. */
const A = <T>(x: T): Algorithm<unknown, unknown> =>
  x as unknown as Algorithm<unknown, unknown>;

/**
 * Every `<text class="viz-marker">…</text>` body in an emitted SVG. `viz-marker`
 * is the range end-label class ONLY — the `active` probe uses `viz-mid-label`
 * and `pointer` uses `viz-caret` — so this reads exactly the labels under test
 * and cannot be satisfied or broken by a caret on another kind.
 */
const markerTexts = (svg: string): string[] =>
  [...svg.matchAll(/<text[^>]*class="viz-marker"[^>]*>([^<]*)<\/text>/g)].map(
    (m) => m[1]!,
  );

/** Runs an algorithm on its authored lesson input (or its default). */
const trace = (
  algo: Algorithm<unknown, unknown>,
  input?: string,
): Step<unknown>[] => {
  const parsed = input ? algo.parseInput(input) : algo.defaultInput();
  expect(parsed).not.toHaveProperty('error');
  return algo.run(parsed);
};

/** Every range end-label an algorithm prints across its whole trace. */
const rangeLabels = (
  algo: Algorithm<unknown, unknown>,
  renderer: RendererModule<unknown>,
  input?: string,
): string[] =>
  trace(algo, input).flatMap((step) =>
    markerTexts(renderer.renderStatic(step, OPTS)),
  );

describe('range end-labels come from the algorithm, never the renderer', () => {
  it('POSITIVE: binary search still shows lo and hi, because it supplies them', () => {
    const labels = rangeLabels(
      A(binarySearch),
      arrayR,
      '[1,3,5,7,9,11] target=7',
    );
    expect(labels).toContain('lo');
    expect(labels).toContain('hi');
  });

  /**
   * The other seven range emitters, each with the renderer its lesson actually
   * mounts: `linear-search` and `array-operations` draw with `array`
   * (`src/content/lessons/binary-search.mdx`, `arrays.mdx`); the five sorts draw
   * with `bars` (`sorting-basics.mdx`, `sorting-efficient.mdx`).
   */
  const silent: [
    string,
    Algorithm<unknown, unknown>,
    RendererModule<unknown>,
    string | undefined,
  ][] = [
    ['linear-search', A(linearSearch), arrayR, '[8,3,5,9,1,7] target=9'],
    ['array-operations', A(arrayOperations), arrayR, undefined],
    ['bubble-sort', A(bubbleSort), barsR, undefined],
    ['insertion-sort', A(insertionSort), barsR, undefined],
    ['selection-sort', A(selectionSort), barsR, undefined],
    ['merge-sort', A(mergeSort), barsR, undefined],
    ['quick-sort', A(quickSort), barsR, undefined],
  ];

  for (const [name, algo, renderer, input] of silent) {
    it(`NEGATIVE: ${name} prints no range end-label`, () => {
      expect(rangeLabels(algo, renderer, input)).toEqual([]);
    });
  }

  it('the range UNDERBAR survives — it is the non-colour cue for the kind', () => {
    const steps = trace(A(bubbleSort));
    const withRange = steps.find((s) =>
      (s.highlights ?? []).some((h) => h.kind === 'range'),
    );
    expect(withRange).toBeDefined();
    expect(barsR.renderStatic(withRange!, OPTS)).toContain('viz-range-bar');
  });

  it('an AUTHORED label on another kind is untouched: array-operations still reads "read"', () => {
    const labels = trace(A(arrayOperations)).flatMap((step) =>
      [
        ...arrayR
          .renderStatic(step, OPTS)
          .matchAll(/<text[^>]*class="viz-mid-label"[^>]*>([^<]*)<\/text>/g),
      ].map((m) => m[1]!),
    );
    expect(labels).toContain('read');
    expect(labels).toContain('shift');
  });
});
