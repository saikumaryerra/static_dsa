/**
 * HashTableRenderer — separate-chaining hash table (site spec §5 L6, architecture
 * §6 deferral: "array-of-slots + per-slot chain, reuses LinkedList layout").
 *
 * Layout: a vertical column of `capacity` bucket slots (the array-of-slots), each
 * with its collision chain drawn to the RIGHT using the LinkedList node+arrow
 * visual language (design §2b.1). A bucket with a chain of length > 1 IS a
 * collision — the whole point of the lesson made visible.
 *
 * TState: { buckets: HashEntry[][]; capacity }. `buckets[b]` is bucket `b`'s
 * chain, in insertion order; `buckets.length === capacity`.
 *
 * Id scheme (shared with any future hash-table algorithm via `core/ids`, TD-3):
 *   • bucket slot `b`            → `slotId(b)`   (`"s1"`)   — honors `active`.
 *   • chain entry (bucket b, p)  → `entryId(b,p)` (`"h1_0"`) — honors the rest.
 *
 * Honored highlights: `active` (bucket being probed — ▶ caret), `compare` (key
 * comparison between two chained entries — dashed tie-line + rings), `insert`
 * (new entry appended — `+`), `found` (`✓`), `pointer` (named caret from
 * `meta.label`). Every kind carries its non-color marker (design §3.2 gate).
 *
 * Reduced motion inherited from the token layer; single atomic redraw per step
 * via the shared DOM helper. Value text/edges/markers reuse the M2 `viz-*` sheet.
 */
import type { RendererModule, Step } from '../core/types';
import { entryId, slotId } from '../core/ids';
import { applyHighlights } from '../core/highlight';
import { group, line, polygon, rect, text } from '../core/svg';
import {
  caretMark,
  createRenderer,
  foundMark,
  insertMark,
  metaLabel,
  renderStaticSvg,
  type Canvas,
} from './shared';

/** One key (+ optional value) stored in a bucket's chain. */
export interface HashEntry {
  key: number;
  value?: number;
}

/** State HashTableRenderer draws. */
export interface HashTableState {
  /** `buckets[b]` = bucket `b`'s collision chain (insertion order). */
  buckets: HashEntry[][];
  /** Number of buckets; equals `buckets.length`. */
  capacity: number;
}

// --- Geometry (design §2.5 rhythm, §2b.1 node+arrow language) ---
const PAD = 10;
const TOP = 26; // marker band above the whole grid
const LEFT = 44; // gutter for the bucket "probe" ▶ caret
const BUCKET_W = 46;
const ROW_H = 40; // bucket + entry height (shared, so they align)
const ROW_GAP = 24; // vertical gap — doubles as a per-row marker band
const NODE_W = 54;
const CHAIN_GAP = 30; // arrow gap: bucket→entry and entry→entry
const PITCH = NODE_W + CHAIN_GAP; // entry-to-entry center pitch

const bucketX = PAD + LEFT;
const firstEntryX = bucketX + BUCKET_W + CHAIN_GAP;
const rowY = (b: number): number => PAD + TOP + b * (ROW_H + ROW_GAP);
const entryX = (p: number): number => firstEntryX + p * PITCH;
const rowMid = (b: number): number => rowY(b) + ROW_H / 2;

const heightOf = (cap: number): number =>
  PAD + TOP + Math.max(cap, 1) * (ROW_H + ROW_GAP) - ROW_GAP + PAD;
const widthOf = (maxChain: number): number =>
  firstEntryX + Math.max(maxChain, 1) * PITCH + PAD;

/** Right-pointing arrowhead triangle ending at (x, y) — the `next` cue. */
const arrowRight = (x: number, y: number): string =>
  polygon({
    class: 'viz-arrow',
    points: `${x},${y} ${x - 8},${y - 4} ${x - 8},${y + 4}`,
  });

/** Parses `entryId` `"h{b}_{p}"` → `[b, p]`, or `null` if not an entry id. */
function parseEntryId(id: string): [number, number] | null {
  if (id[0] !== 'h') return null;
  const [b, p] = id.slice(1).split('_');
  return [Number(b), Number(p)];
}

/** Parses `slotId` `"s{b}"` → `b`, or `null` if not a bucket id. */
function parseBucketId(id: string): number | null {
  return id[0] === 's' ? Number(id.slice(1)) : null;
}

function draw(step: Step<HashTableState>): Canvas {
  const { buckets } = step.state;
  const cap = buckets.length;
  const classes = applyHighlights(step.highlights);
  const maxChain = buckets.reduce((m, chain) => Math.max(m, chain.length), 0);

  let structure = '';
  for (let b = 0; b < cap; b += 1) {
    const chain = buckets[b] ?? [];
    const y = rowY(b);
    const mid = rowMid(b);

    // Bucket slot (the array cell): shows its index; honors `active`.
    const bucketCls = classes.get(slotId(b));
    structure += group(
      rect({
        class: 'viz-cell__rect',
        x: bucketX,
        y,
        width: BUCKET_W,
        height: ROW_H,
        rx: 6,
      }) +
        text(b, {
          class: 'viz-cell__value',
          x: bucketX + BUCKET_W / 2,
          y: mid,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }),
      {
        id: slotId(b),
        class: ['viz-cell', bucketCls].filter(Boolean).join(' '),
      },
    );

    // Chain: arrows first (behind), then entry nodes, then a null terminal.
    let cursor = bucketX + BUCKET_W; // right edge of the bucket
    for (let p = 0; p < chain.length; p += 1) {
      const ex = entryX(p);
      structure += line({
        class: 'viz-edge',
        x1: cursor,
        x2: ex,
        y1: mid,
        y2: mid,
      });
      structure += arrowRight(ex, mid);
      cursor = ex + NODE_W;
    }
    // Terminal null glyph (empty bucket → straight after the slot).
    structure += line({
      class: 'viz-edge',
      x1: cursor,
      x2: cursor + CHAIN_GAP - 8,
      y1: mid,
      y2: mid,
    });
    structure += text('⌀', {
      class: 'viz-null',
      x: cursor + CHAIN_GAP + 2,
      y: mid,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });

    chain.forEach((entry, p) => {
      const ex = entryX(p);
      const cls = classes.get(entryId(b, p));
      structure += group(
        rect({
          class: 'viz-cell__rect',
          x: ex,
          y,
          width: NODE_W,
          height: ROW_H,
          rx: 6,
        }) +
          text(entry.key, {
            class: 'viz-cell__value',
            x: ex + NODE_W / 2,
            y: mid,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
          }),
        {
          id: entryId(b, p),
          class: ['viz-cell', cls].filter(Boolean).join(' '),
        },
      );
    });
  }

  // Markers: bucket carets, entry +/✓/pointer, and chain compare tie-lines.
  let markers = '';
  for (const h of step.highlights ?? []) {
    // A compare between two chained entries draws a dashed tie-line (the
    // required non-color marker) plus the per-node rings from `is-compare`.
    if (h.kind === 'compare' && h.ids.length >= 2) {
      const a = parseEntryId(h.ids[0]!);
      const c = parseEntryId(h.ids[1]!);
      if (a && c && a[0] === c[0]) {
        markers += line({
          class: 'viz-tie',
          x1: entryX(a[1]) + NODE_W / 2,
          x2: entryX(c[1]) + NODE_W / 2,
          y1: rowY(a[0]) - 8,
          y2: rowY(c[0]) - 8,
        });
      }
      continue;
    }
    for (const id of h.ids) {
      const bucket = parseBucketId(id);
      if (bucket !== null && bucket >= 0 && bucket < cap) {
        // Bucket-level markers: `active`/`pointer` probe caret to the left.
        if (h.kind === 'active' || h.kind === 'pointer') {
          const yMid = rowMid(bucket);
          markers +=
            caretMark(metaLabel(h, 'probe'), bucketX - 24, yMid + 4) +
            text('▶', {
              class: 'viz-caret',
              x: bucketX - 8,
              y: yMid,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
            });
        }
        continue;
      }
      const parsed = parseEntryId(id);
      if (!parsed) continue;
      const [b, p] = parsed;
      if (b < 0 || b >= cap || p < 0 || p >= (buckets[b]?.length ?? 0))
        continue;
      const cx = entryX(p) + NODE_W / 2;
      if (h.kind === 'insert') {
        markers += insertMark(cx, rowY(b) - 6);
      } else if (h.kind === 'found') {
        markers += foundMark(cx, rowY(b) - 6);
      } else if (h.kind === 'pointer' || h.kind === 'active') {
        markers +=
          caretMark(metaLabel(h, 'curr'), cx, rowY(b) - 6) +
          text('▼', {
            class: 'viz-caret',
            x: cx,
            y: rowY(b) - 18,
            'text-anchor': 'middle',
          });
      }
    }
  }

  return {
    viewBox: `0 0 ${widthOf(maxChain)} ${heightOf(cap)}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
}

/** Registered hash-table renderer. */
export const hashTableRenderer: RendererModule<HashTableState> = {
  create: () => createRenderer(draw),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts),
};
