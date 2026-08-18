/**
 * Frame audit (Plan A §2) — measures, per registered lesson instrument:
 *
 *   A. how the drawing's viewBox varies across a FULL trace, and
 *   B. whether step 0's drawing fits inside the box step 0 computes for it.
 *
 * Exists so Plan A's scope is a measurement rather than an assumption: an
 * earlier draft assumed six broken resting frames and there are two. Run it
 * again after any renderer geometry change.
 *
 * Run: `npm run audit:frames`
 *
 * `src/viz` is written for a bundler, so plain Node needs the same two nudges
 * `scripts/build-og.mjs` documents: `--experimental-transform-types` to strip
 * the types, and the `registerHooks` resolver below, because the registry's
 * lazy thunks name their chunks with extensionless specifiers
 * (`'./algorithms/bfs'`) which ESM does not resolve. Neither touches the
 * shipped build — Vite handles both there.
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Resolve `'./algorithms/bfs'` -> `'./algorithms/bfs.ts'` for the src tree. */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !path.extname(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

// Dynamic, so the resolver above is installed before any viz module loads.
const { algorithms, renderers } = await import(
  pathToFileURL(path.join(ROOT, 'src/viz/registry.ts')).href
);

/**
 * Every `<Visualizer>` instrument this site ships, as (algorithm, renderer,
 * authored input) triples, transcribed from `src/content/lessons/*.mdx` so the
 * audit measures the runs readers actually see. All 21 shipped instruments
 * author an `input`; `null` would mean `defaultInput()`, and no lesson relies
 * on that today. The 12 registered renderer ids are all covered.
 */
const INSTRUMENTS = [
  // arrays.mdx
  ['array-operations', 'array', '[10,20,30,40,50] target=2'],
  // binary-search.mdx — note BOTH searches draw with the `array` renderer.
  ['binary-search', 'array', '[1,3,5,7,9,11] target=7'],
  ['linear-search', 'array', '[8,3,5,9,1,7] target=9'],
  // complexity-big-o.mdx
  ['growth-rates', 'chart', '16'],
  // linked-lists.mdx
  ['linked-list-operations', 'linkedList', '[12,34,56,78] target=1'],
  // stacks.mdx
  ['stack-operations', 'stack', '[12,34,56]'],
  // queues.mdx
  ['queue-operations', 'queue', '[10,20,30]'],
  // hash-tables.mdx
  ['hash-table-operations', 'hashTable', '[11,24,6,15,20] cap=5 target=6'],
  // trees-bst.mdx
  ['bst-operations', 'tree', '[50,30,70,20,40,60] target=40'],
  // heaps.mdx
  ['heap-operations', 'heap', '[5,9,3,12,8,15]'],
  // graphs.mdx
  ['graph-representations', 'graph', '0>1:4, 0>2:1, 2>1:2, 1>3:5, 2>3:8'],
  // graph-traversal.mdx
  ['bfs', 'graph', '0-1,0-2,1-3,2-3,3-4,4-5 target=0'],
  ['dfs', 'graph', '0-1,0-2,1-3,2-3,3-4,4-5 target=0'],
  // recursion.mdx
  ['recursion-callstack', 'callStack', '4'],
  // sorting-basics.mdx
  ['bubble-sort', 'bars', '[5,2,9,1,7,3]'],
  ['selection-sort', 'bars', '[5,2,9,1,7,3]'],
  ['insertion-sort', 'bars', '[5,2,9,1,7,3]'],
  // sorting-efficient.mdx
  ['merge-sort', 'bars', '[5,2,9,1,7,3]'],
  ['quick-sort', 'bars', '[5,2,9,1,7,3]'],
  // dynamic-programming.mdx
  ['dp-fib-tabulation', 'table', '6'],
  ['dp-fib-memoization', 'table', '6'],
];

/** Pulls `0 0 W H` out of an emitted `<svg>` string. */
function viewBoxOf(svg) {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!m) throw new Error(`No parseable viewBox in: ${svg.slice(0, 120)}`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

/**
 * Rendered px size of every `<text>` class the renderers emit, transcribed from
 * `Visualizer.astro`'s stylesheet (`--text-xs` is 0.75rem = 12px fixed).
 *
 * A per-class table rather than one flat advance because the sizes span
 * 12–20px, and a label's own size decides whether it fits. A flat 11u advance
 * (18px, the plan's first draft) falsely flagged `growth-rates`: its
 * `.viz-curve-label` is 12px, and the chart already reserves 96u for those end
 * labels. Unknown classes fall back to the largest real size — over-flagging is
 * the right failure direction for an audit.
 */
const FONT_PX = {
  'viz-axis-label': 12,
  'viz-badge': 14,
  'viz-caret': 12,
  'viz-cell__index': 12,
  'viz-cell__value': 20,
  'viz-curve-label': 12,
  'viz-delete-mark': 16,
  'viz-found-mark': 18,
  'viz-frame-label': 14,
  'viz-frame-meta': 12,
  'viz-insert-mark': 16,
  'viz-marker': 12,
  'viz-mid-label': 12,
  'viz-node__value': 16,
  'viz-null': 18,
  'viz-swap-mark': 16,
  'viz-weight': 12,
};

/**
 * Every drawn x-coordinate that could sit outside the box: `<text x=…>` plus
 * its rendered run, and `<rect>`/`<line>` extents. Text is the case that
 * actually breaks (a label anchored `start` at x=50 inside a 40-unit box), so
 * it is measured with a monospace advance rather than skipped: ~0.6em of the
 * class's own size (see {@link FONT_PX}), rounded up.
 */
function textOverflow(svg, box) {
  let worst = null;
  for (const m of svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
    const attrs = m[1];
    const content = m[2];
    const x = Number(/\bx="([-\d.]+)"/.exec(attrs)?.[1] ?? NaN);
    if (Number.isNaN(x) || content.length === 0) continue;
    const anchor = /text-anchor="(\w+)"/.exec(attrs)?.[1] ?? 'start';
    const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const width = content.length * Math.ceil((FONT_PX[cls] ?? 18) * 0.6);
    const start =
      anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const end = start + width;
    if (start < 0 || end > box.w) {
      const overflow = Math.max(-start, end - box.w);
      if (!worst || overflow > worst.overflow) {
        worst = { content, cls, start, end, overflow };
      }
    }
  }
  return worst;
}

const varying = [];
const constant = [];
const broken = [];

for (const [algoId, rendererId, input] of INSTRUMENTS) {
  const algo = await algorithms[algoId]();
  const rmod = await renderers[rendererId]();
  const parsed = input ? algo.parseInput(input) : algo.defaultInput();
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    throw new Error(`${algoId}: authored input rejected — ${parsed.error}`);
  }
  const trace = algo.run(parsed);

  let minW = Infinity,
    maxW = 0,
    minH = Infinity,
    maxH = 0;
  for (const step of trace) {
    const { w, h } = viewBoxOf(
      rmod.renderStatic(step, { title: '', idBase: 'a' }),
    );
    minW = Math.min(minW, w);
    maxW = Math.max(maxW, w);
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
  }
  const varies = minW !== maxW || minH !== maxH;
  const row = {
    algoId,
    rendererId,
    steps: trace.length,
    minW,
    maxW,
    minH,
    maxH,
  };
  (varies ? varying : constant).push(row);

  const still = rmod.renderStatic(trace[0], { title: '', idBase: 'a' });
  const box = viewBoxOf(still);
  const bad = textOverflow(still, box);
  if (bad) broken.push({ algoId, rendererId, box, ...bad });
}

// One write rather than `console.log`: `no-console` is an unconditional error
// repo-wide (eslint.config.mjs), and `scripts/build-og.mjs` sets the precedent
// that a build script reports through `process.stdout`.
const report = [
  '',
  `A. VARYING extent (${varying.length} of ${INSTRUMENTS.length} instruments)`,
];
for (const r of varying) {
  report.push(
    `  ${r.rendererId.padEnd(11)} ${r.algoId.padEnd(24)} W ${r.minW}\u2192${r.maxW}  H ${r.minH}\u2192${r.maxH}  (${r.steps} steps)`,
  );
}
report.push('', `   CONSTANT (${constant.length})`);
for (const r of constant) {
  report.push(
    `  ${r.rendererId.padEnd(11)} ${r.algoId.padEnd(24)} ${r.maxW}\u00d7${r.maxH}`,
  );
}
report.push('', `B. BROKEN resting frames (${broken.length})`);
for (const r of broken) {
  report.push(
    `  ${r.algoId}: viewBox 0 0 ${r.box.w} ${r.box.h} \u2014 [${r.cls}] "${r.content}" spans ${Math.round(r.start)}\u2192${Math.round(r.end)} (overflow ${Math.round(r.overflow)})`,
  );
}
report.push('', '');
process.stdout.write(report.join('\n'));
