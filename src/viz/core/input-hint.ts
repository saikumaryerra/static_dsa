/**
 * Custom-input disclosure helpers (M7.2 Player v2; audit CMP-14 / INP-*).
 *
 * Four concerns around the two custom-input fields, kept pure so they are unit
 * testable in the `node` Vitest harness (everything inside the island's own
 * `<script>` is unreachable from it):
 *
 * 1. {@link splitAuthoredInput} — the authored `input` prop is ONE raw string
 *    (`"[1,3,5,7,9,11] target=7"`), but the UI shows two fields. The parsed
 *    object cannot be used for this: `parseInput` returns a per-algorithm shape
 *    typed `unknown` here, so it cannot be serialized back generically (CMP-14).
 *    Splitting the raw string on `target=` — the exact separator the island's own
 *    submit handler composes — is therefore the only algorithm-agnostic route,
 *    and it round-trips by construction.
 * 2. {@link probeListCap} — the per-algorithm input cap (30 array items, 15 heap
 *    values, 12 stack items, …) lives inside each `parseInput`, so helper text
 *    that hardcoded "up to 30" would be a lie on six lessons. Instead ask the
 *    real parser, at build time, where it starts refusing.
 * 3. {@link inputHelpText} — composes the persistent helper line from those two.
 * 4. {@link composeCustomInput} — the inverse of (1): joins the two fields back
 *    into the one raw string `parseInput` takes, wrapping a bare comma-separated
 *    list in the `[…]` the help text never mentions but every array parser
 *    requires.
 *
 * DOM-free and dependency-free. {@link probeListCap} and {@link inputHelpText}
 * are build-time only, called from the Visualizer FRONTMATTER and tree-shaken
 * out of the island's chunk; {@link splitAuthoredInput} and
 * {@link composeCustomInput} are imported by BOTH, because the "Restore example"
 * prefill and the submit handler need them at runtime. Both of those are a few
 * lines of string work with no imports of their own.
 */

/** The authored input, split into the two fields the form renders. */
export interface AuthoredInput {
  /** Everything before `target=` — the first field's value (array, edges, n). */
  input: string;
  /** Everything after `target=`; `''` when the raw string has no target. */
  target: string;
}

/** The separator the island composes on submit: `` `${array} target=${target}` ``. */
const TARGET_SEPARATOR = 'target=';

/** How far {@link probeListCap} is willing to look before calling a parser uncapped. */
const MAX_PROBE = 40;

/**
 * Splits an authored raw input into its two form fields.
 *
 * Uses the LAST `target=` so a value that itself contains the token cannot
 * swallow the separator, and trims both halves because the composed string
 * carries a space before `target=`.
 *
 * @param raw - The authored `input` prop, e.g. `"[11,24,6] cap=5 target=6"`.
 * @returns The first-field and target-field values (both `''` for an empty raw).
 */
export function splitAuthoredInput(raw: string): AuthoredInput {
  const at = raw.lastIndexOf(TARGET_SEPARATOR);
  if (at === -1) return { input: raw.trim(), target: '' };
  return {
    input: raw.slice(0, at).trim(),
    target: raw.slice(at + TARGET_SEPARATOR.length).trim(),
  };
}

/** Narrow a `parseInput` result to its `{ error }` branch. */
function isParseError(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  );
}

/**
 * Finds how many list items an algorithm's `parseInput` accepts, by re-parsing
 * the authored input with a synthetic `[1,2,…,n]` list substituted for its own.
 * Everything around the list (`cap=5`, `target=7`) is preserved, so
 * algorithm-specific companions keep validating.
 *
 * Returns the largest accepted `n`, or `null` when the answer would be a guess:
 * no bracketed list in the authored input, nothing accepted at all, or nothing
 * refused up to {@link MAX_PROBE} (an uncapped parser has no cap to disclose).
 *
 * @param raw - The authored input string.
 * @param parse - The algorithm's own `parseInput` (returns input or `{ error }`).
 * @returns The item cap, or `null` when it is not derivable.
 */
export function probeListCap(
  raw: string,
  parse: (value: string) => unknown,
): number | null {
  const open = raw.indexOf('[');
  const close = raw.indexOf(']', open + 1);
  if (open === -1 || close === -1) return null;

  const before = raw.slice(0, open);
  const after = raw.slice(close + 1);
  let accepted: number | null = null;
  for (let n = 1; n <= MAX_PROBE; n += 1) {
    const items = Array.from({ length: n }, (_, i) => i + 1).join(',');
    if (!isParseError(parse(`${before}[${items}]${after}`))) accepted = n;
  }
  return accepted !== null && accepted < MAX_PROBE ? accepted : null;
}

/**
 * Composes the persistent helper line under the custom-input fields — the format
 * and the cap, which are otherwise discoverable only by failing (INP-*). The
 * example restates the placeholder, which vanishes the moment the reader types.
 *
 * @param options.example - The first field's example value (its placeholder).
 * @param options.cap - Item cap from {@link probeListCap}, or `null` if unknown.
 * @returns The helper sentence, or `''` when there is nothing honest to say.
 */
export function inputHelpText(options: {
  example: string;
  cap: number | null;
}): string {
  const { example, cap } = options;
  const format =
    cap === null ? '' : `Up to ${cap} whole numbers, comma-separated.`;
  const sample = example ? `Example: ${example}` : '';
  return [format, sample].filter(Boolean).join(' ');
}

/**
 * Composes the raw string `parseInput` receives from the two rendered fields.
 *
 * Exists for one defect: every array `parseInput` requires a `[…]` literal
 * while the field's own help text says "Up to 30 whole numbers,
 * comma-separated", so a reader who typed exactly what they were asked for got
 * an error telling them to fill in both fields — which they had.
 *
 * GATED on the instrument's own authored input, because one composer serves
 * every instrument and an unconditional wrap corrupts every non-array lesson: a
 * graph reader types `0-1,0-2,1-3` and a DP reader types `7`. It gates on the
 * AUTHORED value rather than the rendered placeholder because the placeholder
 * falls back to a bracketed literal for an instrument that authored nothing,
 * which would be exactly the wrong answer — and because the placeholder is a
 * build-time frontmatter const the island never receives.
 *
 * The typed field must also be free of `[`, `]` and `=`. Wrapping is only ever
 * meant to rescue an input that is failing today, and each of those three
 * characters marks a field that is NOT failing today, or that would fail worse:
 *
 * - `[` — already a literal; wrapping would nest it.
 * - `]` — `9,2],7` becomes `[9,2],7]`, whose first `[…]` is `[9,2]`. That
 *   parses, so the reader's `7` would vanish with no error at all. Silent
 *   truncation is worse than the message they get unwrapped.
 * - `=` — the hash-table lesson's first field takes a companion token, so
 *   `cap=5 [11,24]` works today and `[cap=5 [11,24]]` does not.
 *
 * Normalises nothing else, so a malformed list still reaches `parseInput` and
 * still produces that algorithm's own message.
 *
 * @param first - What the reader typed in the first field.
 * @param target - What they typed in the second (`''` when it is not rendered).
 * @param authoredFirst - `splitAuthoredInput(authored).input` for this instrument.
 * @returns The raw string, in the `` `${first} target=${target}` `` wire format.
 */
export function composeCustomInput(
  first: string,
  target: string,
  authoredFirst: string,
): string {
  const trimmed = first.trim();
  const wrap =
    authoredFirst.startsWith('[') &&
    trimmed.length > 0 &&
    !/[[\]=]/.test(trimmed);
  return `${wrap ? `[${trimmed}]` : first} ${TARGET_SEPARATOR}${target}`;
}
