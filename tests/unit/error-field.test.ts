/**
 * errorField — input-error attribution (M7.1 CMP-4 / A11Y-8).
 *
 * This heuristic is the only NEW logic M7.1 adds, and it is the one thing in the
 * repair batch a reader cannot see: it decides which custom-input field gets
 * `aria-invalid` and the focus move, so when it is wrong a screen-reader user is
 * sent to correct the field that was already correct. It is also the one piece of
 * the Visualizer island that is pure, so — unlike everything else in that
 * `<script>` — it is reachable from the `environment: 'node'` harness.
 *
 * The corpus below is HARVESTED, not invented: every string is a message
 * `src/viz/algorithms/*.ts` can actually return from `parseInput`, with the
 * template interpolations resolved to the values that module ships
 * (`${MAX_N}` → its `const`, `${tok}`/`${start}` → a plausible user token). The
 * final `describe` re-reads those files from disk and fails if the two sets have
 * drifted, so "every shipped message is covered" stays true as messages are
 * added or reworded rather than being true only on the day this was written.
 *
 * Each message is asserted under the label its OWN lesson renders (see
 * `TARGET_LABEL`) — attribution is label-sensitive by design, so testing a
 * message against a label it never ships with would prove nothing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { errorField, type ErrorField } from '../../src/viz/core/error-field';

const ALGORITHMS_DIR = fileURLToPath(
  new URL('../../src/viz/algorithms', import.meta.url),
);

/**
 * The SECOND field's rendered label per algorithm module, read off the
 * `<Visualizer>` mountings in `src/content/lessons/*.mdx`: the lesson's
 * `targetLabel="…"` where it overrides one, the component default `"Target"`
 * where it does not, and `''` for `showTarget={false}` — the empty string is
 * exactly what the island passes, because `data-target-label` is blank when the
 * field is not rendered (`Visualizer.astro`).
 */
const TARGET_LABEL = {
  'array-operations': 'Index',
  bfs: 'Start node',
  'binary-search': 'Target',
  'bst-operations': 'Target',
  'bubble-sort': 'Target',
  dfs: 'Start node',
  'dp-fib-memoization': '',
  'dp-fib-tabulation': '',
  'graph-representations': '',
  'growth-rates': 'Target',
  'hash-table-operations': 'Search key',
  'heap-operations': '',
  'insertion-sort': 'Target',
  'linear-search': 'Target',
  'linked-list-operations': 'Index',
  'merge-sort': 'Target',
  'queue-operations': '',
  'quick-sort': 'Target',
  'recursion-callstack': '',
  'selection-sort': 'Target',
  'stack-operations': '',
} as const;

type AlgorithmId = keyof typeof TARGET_LABEL;

interface CorpusEntry {
  algorithm: AlgorithmId;
  /** `[message, the field the Visualizer must mark invalid and focus]`. */
  messages: [string, ErrorField][];
}

/**
 * Every message the shipped `parseInput` implementations can return.
 *
 * Only three route to the target field, and the pattern is consistent: the
 * sentence's SUBJECT is the second field. Everything else either leads with the
 * first field ("Type an array and target, …" names both — first field wins) or
 * names no field at all, and both fall back to the first field, which is also
 * where every non-array structure (edges, keys, `n`) is typed.
 */
const CORPUS: CorpusEntry[] = [
  {
    algorithm: 'array-operations',
    messages: [
      ['Type an array, e.g. [10,20,30,40,50]', 'input'],
      ['Use whole numbers only, e.g. [10,20,30,40,50]', 'input'],
      ['Add at least one number, e.g. [10,20,30,40,50]', 'input'],
      ['Keep the array to 30 numbers or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'bfs',
    messages: [
      [
        'Type an undirected edge list, e.g. 0-1,0-2,1-3 with a start node.',
        'input',
      ],
      ['Bad edge "9". Use A-B, e.g. 0-1.', 'input'],
      ['Keep it to 15 vertices or fewer.', 'input'],
      ['Keep it to 30 edges or fewer.', 'input'],
      // The one graph message whose subject is the start-node field.
      ["Start node 9 is not one of the graph's vertices.", 'target'],
    ],
  },
  {
    algorithm: 'binary-search',
    messages: [
      // The array field is empty or unreadable. This message replaced "Type an
      // array and target, e.g. [1,3,5,7] target=5", which was the P0: the field
      // now ACCEPTS the bare comma-separated list its own help text documents,
      // so the old text both demanded brackets it never mentioned and named two
      // fields beneath two the reader had already filled in. It names the one
      // field that is actually wrong, in the format the field actually takes.
      ['Type the numbers to search, e.g. 1,3,5,7', 'input'],
      ['Add a target, e.g. [1,3,5,7] target=5', 'target'],
      ['Use whole numbers only, e.g. [1,3,5,7]', 'input'],
      ['Keep the array to 30 numbers or fewer.', 'input'],
      ['Binary search needs a sorted array — try [1,3,5,7].', 'input'],
    ],
  },
  {
    algorithm: 'bst-operations',
    messages: [
      ['Type an insertion sequence, e.g. [50,30,70,20,40]', 'input'],
      ['Use whole numbers only, e.g. [50,30,70,20,40]', 'input'],
      ['Use distinct values — a BST assumes no duplicates.', 'input'],
      ['Add at least one value, e.g. [50,30,70,20,40]', 'input'],
      ['Keep it to 30 values or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'bubble-sort',
    messages: [
      ['Type an array to sort, e.g. [5,2,9,1,7]', 'input'],
      ['Use whole numbers only, e.g. [5,2,9,1,7]', 'input'],
      ['Keep the array to 30 numbers or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'dfs',
    messages: [
      [
        'Type an undirected edge list, e.g. 0-1,0-2,1-3 with a start node.',
        'input',
      ],
      ['Bad edge "9". Use A-B, e.g. 0-1.', 'input'],
      ['Keep it to 15 vertices or fewer.', 'input'],
      ['Keep it to 30 edges or fewer.', 'input'],
      ["Start node 9 is not one of the graph's vertices.", 'target'],
    ],
  },
  {
    algorithm: 'dp-fib-memoization',
    messages: [
      ['Type a whole number for n, e.g. 6', 'input'],
      ['n must be 0 or greater — Fibonacci is undefined below 0.', 'input'],
      ['Keep n at 30 or less so the table stays readable.', 'input'],
    ],
  },
  {
    algorithm: 'dp-fib-tabulation',
    messages: [
      ['Type a whole number for n, e.g. 6', 'input'],
      ['n must be 0 or greater — Fibonacci is undefined below 0.', 'input'],
      ['Keep n at 30 or less so the table stays readable.', 'input'],
    ],
  },
  {
    algorithm: 'graph-representations',
    messages: [
      ['Type an edge list, e.g. 0>1:4, 0>2:1, 2>1:2', 'input'],
      ['Add at least one edge, e.g. 0>1:4', 'input'],
      [
        'Bad edge "9". Use A-B (undirected) or A>B (directed), e.g. 0>1:4',
        'input',
      ],
      ['Keep it to 15 vertices or fewer.', 'input'],
      ['Keep it to 30 edges or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'growth-rates',
    messages: [
      ['Type a maximum n between 2 and 40.', 'input'],
      ['Use a maximum n of at least 2.', 'input'],
      ['Keep the maximum n to 40 or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'hash-table-operations',
    messages: [
      // "Search key" shares the word "key" with the keys ARRAY these messages
      // are about; a message that names the shared word once must not be read as
      // naming the second field.
      ['Type keys to insert, e.g. [11,24,6,15] cap=5', 'input'],
      ['Use non-negative whole numbers for keys, e.g. [11,24,6,15]', 'input'],
      ['Add at least one key, e.g. [11,24,6,15]', 'input'],
      ['Keep it to 30 keys or fewer.', 'input'],
      ['Capacity must be at least 1, e.g. cap=5', 'input'],
      ['Keep capacity to 30 buckets or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'heap-operations',
    messages: [
      ['Type values to insert, e.g. [5,9,3,12,8,15]', 'input'],
      ['Use whole numbers only, e.g. [5,9,3,12,8,15]', 'input'],
      ['Add at least one value, e.g. [5,9,3,12,8,15]', 'input'],
      ['Keep it to 15 values or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'insertion-sort',
    messages: [
      ['Type an array to sort, e.g. [5,2,9,1,7]', 'input'],
      ['Use whole numbers only, e.g. [5,2,9,1,7]', 'input'],
      ['Keep the array to 30 numbers or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'linear-search',
    messages: [
      ['Type an array and target, e.g. [4,1,7,2] target=7', 'input'],
      ['Add a target, e.g. [4,1,7,2] target=7', 'target'],
      ['Use whole numbers only, e.g. [4,1,7,2]', 'input'],
      ['Keep the array to 30 numbers or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'linked-list-operations',
    messages: [
      ['Type a list, e.g. [12,34,56,78]', 'input'],
      ['Use whole numbers only, e.g. [12,34,56,78]', 'input'],
      ['Add at least one node, e.g. [12,34,56,78]', 'input'],
      ['Keep the list to 30 nodes or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'merge-sort',
    messages: [
      ['Type an array to sort, e.g. [5,2,9,1,7]', 'input'],
      ['Use whole numbers only, e.g. [5,2,9,1,7]', 'input'],
      ['Keep the array to 30 numbers or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'queue-operations',
    messages: [
      ['Type values to enqueue, e.g. [10,20,30]', 'input'],
      ['Use whole numbers only, e.g. [10,20,30]', 'input'],
      ['Add at least one value, e.g. [10,20,30]', 'input'],
      ['Keep it to 12 values or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'quick-sort',
    messages: [
      ['Type an array to sort, e.g. [5,2,9,1,7]', 'input'],
      ['Use whole numbers only, e.g. [5,2,9,1,7]', 'input'],
      ['Keep the array to 30 numbers or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'recursion-callstack',
    messages: [
      ['Type a whole number for n, e.g. 5', 'input'],
      ['n must be 0 or greater — factorial is undefined below 0.', 'input'],
      ['Keep n at 10 or less so the stack stays readable.', 'input'],
    ],
  },
  {
    algorithm: 'selection-sort',
    messages: [
      ['Type an array to sort, e.g. [5,2,9,1,7]', 'input'],
      ['Use whole numbers only, e.g. [5,2,9,1,7]', 'input'],
      ['Keep the array to 30 numbers or fewer.', 'input'],
    ],
  },
  {
    algorithm: 'stack-operations',
    messages: [
      ['Type values to push, e.g. [12,34,56]', 'input'],
      ['Use whole numbers only, e.g. [12,34,56]', 'input'],
      ['Add at least one value, e.g. [12,34,56]', 'input'],
      ['Keep it to 12 values or fewer.', 'input'],
    ],
  },
];

describe('errorField: every shipped parseInput message', () => {
  for (const { algorithm, messages } of CORPUS) {
    const targetLabel = TARGET_LABEL[algorithm];
    describe(`${algorithm} (second field: ${targetLabel || 'not rendered'})`, () => {
      for (const [message, field] of messages) {
        it(`→ ${field}: ${message}`, () => {
          expect(errorField(message, targetLabel)).toBe(field);
        });
      }
    });
  }
});

describe('errorField: the rules the corpus rests on', () => {
  it('attributes a message to the field its PROSE names first', () => {
    // Same sentence, two lessons: only the one whose second field is actually
    // called "Start node" may claim it. Under the default "Target" label the
    // message names no second field at all.
    const message = "Start node 9 is not one of the graph's vertices.";
    expect(errorField(message, 'Start node')).toBe('target');
    expect(errorField(message, 'Target')).toBe('input');
  });

  it('does not read the "e.g." example as evidence', () => {
    // Nearly every example literal names both fields, so matching inside one
    // would attribute every message to the target field.
    expect(errorField('Type an array, e.g. [1,3,5,7] target=5', 'Target')).toBe(
      'input',
    );
  });

  it('ignores one-letter label tokens, which would match far too much prose', () => {
    // "n" appears in every recursion/DP message; a second field labelled "n"
    // must not swallow them.
    expect(
      errorField('Keep n at 10 or less so the stack stays readable.', 'n'),
    ).toBe('input');
  });

  it('treats a blank label exactly like an omitted one', () => {
    // The island passes '' when `showTarget={false}`, so the two must agree.
    const message = "Start node 9 is not one of the graph's vertices.";
    expect(errorField(message, '')).toBe(errorField(message));
    expect(errorField(message, '')).toBe('input');
  });

  it('cannot be flipped by text the USER typed', () => {
    // The two `Bad edge "${tok}"` messages interpolate raw user input, so a
    // hostile (or unlucky) token must not steal the attribution: the message
    // names its own field, "edge", before the echoed token.
    expect(
      errorField('Bad edge "target". Use A-B, e.g. 0-1.', 'Start node'),
    ).toBe('input');
    expect(
      errorField('Bad edge "start node". Use A-B, e.g. 0-1.', 'Start node'),
    ).toBe('input');
  });

  it('falls back to the first field for text it cannot attribute', () => {
    // A future message, a caught exception's text, or an empty string: the
    // first field is the safe side to be wrong on — every non-array structure
    // is typed there too.
    expect(errorField('Something unexpected went wrong.', 'Target')).toBe(
      'input',
    );
    expect(errorField('', 'Start node')).toBe('input');
  });
});

describe('errorField: corpus coverage', () => {
  /**
   * Canonical form for comparing a table entry with the source it came from:
   * `${…}` interpolations and every number collapse to `#`. The heuristic reads
   * words only, so a cap's numeric value is not part of the behaviour under
   * test — but a reworded or brand-new message changes words, and that is
   * exactly what this comparison must catch.
   */
  function canonical(message: string): string {
    return message.replace(/\$\{[^}]*\}/g, '#').replace(/\d+/g, '#');
  }

  /**
   * Every `{ error: '…' }` / `{ error: \`…\` }` literal in an algorithm module,
   * in canonical form. Reads the source rather than calling `parseInput`,
   * because reaching some branches (each cap, each malformed token) would mean
   * hand-crafting 82 inputs and would still silently skip any branch missed.
   */
  function shippedMessages(source: string): string[] {
    const literal = /error:\s*(['`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
    const found: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = literal.exec(source)) !== null) {
      // Un-escape any quote escaped for its own delimiter (none today, but a
      // future `it\'s` must compare as the string the user is shown).
      found.push(canonical(match[2]!.replace(/\\(['"`\\])/g, '$1')));
    }
    return found.sort();
  }

  it('covers every message the algorithm modules can return', () => {
    const declared = new Map(
      CORPUS.map(({ algorithm, messages }) => [
        algorithm,
        messages.map(([message]) => canonical(message)).sort(),
      ]),
    );

    for (const file of readdirSync(ALGORITHMS_DIR).sort()) {
      if (!file.endsWith('.ts')) continue;
      const shipped = shippedMessages(
        readFileSync(`${ALGORITHMS_DIR}/${file}`, 'utf8'),
      );
      // `demos.ts` and any future helper return no errors and need no entry.
      if (shipped.length === 0) continue;
      const algorithm = file.replace(/\.ts$/, '');
      expect(declared.get(algorithm as AlgorithmId), `${file} is untested`)
        // The message text is the assertion: a diff here means a message was
        // added, reworded, or removed and its routing has not been re-decided.
        .toEqual(shipped);
    }
  });
});
