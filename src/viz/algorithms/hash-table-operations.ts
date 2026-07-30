/**
 * Hash Table Operations — instrumented demo for the Hash Tables lesson (site spec
 * §5 L6, §11.4). Runs a separate-chaining hash table through the three moves the
 * lesson makes concrete:
 *   1. HASH — map each key to a bucket with `key % capacity` (probe that bucket).
 *   2. INSERT with CHAINING — append the key to its bucket's chain; a bucket that
 *      already holds a key is a COLLISION, so the chain grows past length 1.
 *   3. SEARCH — hash the target, then walk the bucket's chain comparing keys.
 *
 * TState matches HashTableRenderer's `HashTableState` ({ buckets, capacity }),
 * where `buckets[b]` is bucket `b`'s chain in insertion order. `active` marks a
 * bucket probe, `insert` a newly chained entry, `compare`/`pointer` a chain walk,
 * and `found` a match. Imports only core types + `snapshot` + the pure `slotId`
 * and `entryId` helpers (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { entryId, slotId } from '../core/ids';

/** Hard cap on number of keys (site spec §11.4: arrays ≤ 30). */
const MAX_KEYS = 30;
/** Hard cap on bucket count — keeps the vertical bucket column readable. */
const MAX_CAPACITY = 30;
/** Default bucket count for custom input that omits `cap=` (a small prime). */
const DEFAULT_CAPACITY = 7;

/** One key stored in a bucket's chain (mirrors HashTableRenderer's `HashEntry`). */
export interface HashEntry {
  key: number;
}

/** Typed input: the keys to insert, the bucket count, and an optional search key. */
export interface HashTableOperationsInput {
  keys: number[];
  capacity: number;
  searchTarget: number | null;
}

/** Snapshot state HashTableRenderer draws. */
export interface HashTableOperationsState {
  buckets: HashEntry[][];
  capacity: number;
}

/**
 * Runs the insert-then-search demo, emitting one `Step` per hash probe, chain
 * insert, and chain comparison. Each step deep-copies its state via `snapshot()`
 * (site spec §11.4). The `key % capacity` hash mirrors the lesson's code samples.
 */
function run(input: HashTableOperationsInput): Trace<HashTableOperationsState> {
  const { keys, capacity, searchTarget } = input;
  const buckets: HashEntry[][] = Array.from({ length: capacity }, () => []);
  const trace: Trace<HashTableOperationsState> = [];
  const metrics = { collisions: 0, comparisons: 0 };

  const push = (explanation: string, highlights: Highlight[]): void => {
    trace.push({
      state: snapshot({ buckets, capacity }),
      explanation,
      highlights,
      metrics: { ...metrics },
    } satisfies Step<HashTableOperationsState>);
  };

  // Step 0: an empty table of `capacity` buckets.
  push(
    `An empty hash table with ${capacity} buckets. Each key is placed by hashing it: bucket = key % ${capacity}.`,
    [],
  );

  // --- Insert every key, chaining on collisions ---
  for (const key of keys) {
    const b = key % capacity;
    push(`Hash key ${key}: ${key} % ${capacity} = ${b}. Probe bucket ${b}.`, [
      { kind: 'active', ids: [slotId(b)], meta: { label: 'h' } },
    ]);

    const chain = buckets[b]!;

    // Insert-if-absent, matching the lesson's code samples (`if key not in bucket`):
    // a key already stored in this bucket is skipped, not chained twice. Separate
    // chaining holds a SET of keys per bucket, so duplicates never grow the chain.
    const dupIndex = chain.findIndex((entry) => entry.key === key);
    if (dupIndex !== -1) {
      push(
        `Key ${key} is already in bucket ${b} (position ${dupIndex}) — skip it; each key is stored once.`,
        [{ kind: 'compare', ids: [entryId(b, dupIndex)] }],
      );
      continue;
    }

    const collision = chain.length > 0;
    if (collision) metrics.collisions += 1;
    chain.push({ key });
    const p = chain.length - 1;

    push(
      collision
        ? `Bucket ${b} already holds ${p} key${p === 1 ? '' : 's'} — a collision. Chain ${key} onto the end of the bucket.`
        : `Bucket ${b} is empty. Store ${key} there — no collision.`,
      [{ kind: 'insert', ids: [entryId(b, p)] }],
    );
  }

  // Load factor: keys ÷ buckets. Above ~0.75 chains lengthen and lookups slow.
  const load = keys.length / capacity;
  push(
    `All ${keys.length} key${keys.length === 1 ? '' : 's'} inserted. Load factor = ${keys.length} / ${capacity} = ${load.toFixed(
      2,
    )} (keys per bucket).`,
    [],
  );

  // --- Search: hash the target, then walk its bucket's chain ---
  if (searchTarget !== null) {
    const target = searchTarget;
    const b = target % capacity;
    push(
      `Search for ${target}: hash ${target} % ${capacity} = ${b}. Probe bucket ${b}.`,
      [{ kind: 'active', ids: [slotId(b)], meta: { label: 'h' } }],
    );

    const chain = buckets[b]!;
    let found = false;
    for (let p = 0; p < chain.length; p += 1) {
      metrics.comparisons += 1;
      const entry = chain[p]!;
      if (entry.key === target) {
        push(
          `Compare ${target} with ${entry.key} (position ${p}) — match. Found ${target} in bucket ${b}.`,
          [{ kind: 'found', ids: [entryId(b, p)] }],
        );
        found = true;
        break;
      }
      push(
        `Compare ${target} with ${entry.key} (position ${p}) — no match. Walk to the next entry in the chain.`,
        [
          { kind: 'compare', ids: [entryId(b, p)] },
          { kind: 'pointer', ids: [entryId(b, p)], meta: { label: 'curr' } },
        ],
      );
    }
    if (!found) {
      push(
        `Reached the end of bucket ${b}'s chain without a match — ${target} is not in the table.`,
        [{ kind: 'active', ids: [slotId(b)], meta: { label: 'h' } }],
      );
    }
  }

  return trace;
}

/**
 * Parses the custom-input box, e.g. `"[11,24,6,15,20] cap=5 target=6"`, into
 * typed input. The array literal is the keys to insert; optional `cap=` sets the
 * bucket count and `target=` the key to search for. Returns `{ error }` (never
 * throws) and enforces the key/capacity caps and the non-negative-key rule the
 * `key % capacity` hash relies on.
 */
function parseInput(raw: string): HashTableOperationsInput | { error: string } {
  const text = raw.trim();
  const arrayMatch = text.match(/\[([^\]]*)\]/);
  const capMatch = text.match(/cap(?:acity)?\s*=\s*(\d+)/i);
  const targetMatch = text.match(/target\s*=\s*(\d+)/i);

  if (!arrayMatch) {
    return { error: 'Type keys to insert, e.g. [11,24,6,15] cap=5' };
  }

  const inner = arrayMatch[1]!.trim();
  const keys: number[] = [];
  if (inner.length > 0) {
    for (const token of inner.split(',')) {
      const t = token.trim();
      // Non-negative whole numbers only — the hash is `key % capacity`.
      if (!/^\d+$/.test(t)) {
        return {
          error: 'Use non-negative whole numbers for keys, e.g. [11,24,6,15]',
        };
      }
      keys.push(Number(t));
    }
  }

  if (keys.length === 0) {
    return { error: 'Add at least one key, e.g. [11,24,6,15]' };
  }
  if (keys.length > MAX_KEYS) {
    return { error: 'Keep it to 30 keys or fewer.' };
  }

  const capacity = capMatch ? Number(capMatch[1]) : DEFAULT_CAPACITY;
  if (capacity < 1) {
    return { error: 'Capacity must be at least 1, e.g. cap=5' };
  }
  if (capacity > MAX_CAPACITY) {
    return { error: 'Keep capacity to 30 buckets or fewer.' };
  }

  // Default the search key to the last inserted key so the demo always ends
  // with a lookup the reader just watched go in.
  const searchTarget = targetMatch
    ? Number(targetMatch[1])
    : keys[keys.length - 1]!;

  return { keys, capacity, searchTarget };
}

/** The registered Hash Table Operations demo. */
export const hashTableOperations: Algorithm<
  HashTableOperationsInput,
  HashTableOperationsState
> = {
  id: 'hash-table-operations',
  label: 'Hash table: hashing, collisions, and chaining',
  run,
  defaultInput: () => ({
    keys: [11, 24, 6, 15, 20],
    capacity: 5,
    searchTarget: 6,
  }),
  parseInput,
};
