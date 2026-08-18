/**
 * Which custom-input field a parse error belongs to (CMP-4 / A11Y-8).
 *
 * `parseInput` returns a plain message string and nothing else — giving it a
 * field discriminator would change the contract in all 22 algorithm files — so
 * the Visualizer island reads the prose to decide which field to mark
 * `aria-invalid` and move focus to. This lives outside the `.astro` `<script>`
 * because everything in there is unreachable from Vitest; the heuristic is the
 * one piece of the island that is pure, so it is unit-testable here.
 */

/** The two custom-input fields an error can be about. */
export type ErrorField = 'input' | 'target';

/**
 * Vocabulary the shipped messages use for the FIRST field across every structure
 * it holds — array, edge list, keys, linked list, hash capacity. Stems only;
 * `vocabulary()` matches the plurals. (Messages about `n` name no field word at
 * all, which the "names neither" branch already resolves to this field.)
 */
const FIRST_FIELD_WORDS = [
  'array',
  'list',
  'value',
  'key',
  'node',
  'edge',
  'number',
  'vertices',
  'sequence',
  'capacity',
  'bucket',
];

/**
 * Vocabulary that means the SECOND field no matter how it is labelled: every
 * `parseInput` accepts the same `… target=N` wire format, so several messages
 * name `target` even where the field is rendered as "Start node" or "Index".
 */
const SECOND_FIELD_WORDS = ['target'];

/** Label tokens too generic to identify a field ("Search key" → just "search", "key"). */
const LABEL_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'your',
]);

/**
 * Builds a plural-tolerant, word-boundary matcher for a vocabulary
 * (`key` also matches `keys`, `vertices`/`search` also match `…es`).
 * Every word is `[a-z]+` by construction, so nothing needs escaping.
 */
function vocabulary(words: string[]): RegExp {
  return new RegExp(`\\b(?:${words.join('|')})(?:e?s)?\\b`);
}

const FIRST_FIELD_RE = vocabulary(FIRST_FIELD_WORDS);

/** The words that name the second field: its own rendered label, plus `target`. */
function secondFieldWords(targetLabel: string | undefined): string[] {
  const fromLabel = (targetLabel?.toLowerCase().match(/[a-z]+/g) ?? []).filter(
    // One-letter tokens ("n") would match far too much prose to attribute anything.
    (word) => word.length > 1 && !LABEL_STOPWORDS.has(word),
  );
  return [...new Set([...fromLabel, ...SECOND_FIELD_WORDS])];
}

/**
 * Attributes a `parseInput` error message to one of the two custom-input fields.
 *
 * The rule is "whichever field the sentence names FIRST is its subject", because
 * these messages are short imperatives that lead with what they are about:
 * "Start node 9 is not one of the graph's vertices." names the second field at
 * word one and the first field ("vertices") only in passing, while "Enter an
 * array of whole numbers, …" leads with the array and never mentions the
 * second. A message that names neither field, or that names the first field
 * first — including the tie where one word serves both, as in the hash-table
 * lesson's "Type keys to insert, …" under its "Search key" label — falls back
 * to `'input'`: that field is also where every non-array structure (edges,
 * keys, `n`) reports, so it is the safe side to be wrong on.
 *
 * @param message - The message from `parseInput`'s `{ error }` branch.
 * @param targetLabel - The SECOND field's rendered label ("Target", "Index",
 *   "Search key", "Start node"); omit it when that field is not rendered.
 * @returns Which field to mark invalid and focus.
 */
export function errorField(message: string, targetLabel?: string): ErrorField {
  // Read the prose BEFORE the "e.g." example: nearly every example literal names
  // both fields ("… e.g. [1,3,5,7] target=5"), so matching it attributes nothing.
  const prose = message.toLowerCase().split('e.g.')[0]!;
  const second = prose.search(vocabulary(secondFieldWords(targetLabel)));
  if (second < 0) return 'input';
  const first = prose.search(FIRST_FIELD_RE);
  return first < 0 || second < first ? 'target' : 'input';
}
