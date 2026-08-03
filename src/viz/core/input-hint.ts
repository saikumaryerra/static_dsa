/**
 * Custom-input disclosure helpers (M7.2 Player v2; audit CMP-14 / INP-*).
 *
 * Three build-time-only concerns, kept pure so they are unit testable in the
 * `node` Vitest harness:
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
 *
 * DOM-free and dependency-free; imported by the Visualizer FRONTMATTER (zero
 * client bytes). `splitAuthoredInput` is additionally imported by the island's
 * script for the "Restore example" prefill — it is a six-line pure function and
 * the other two exports tree-shake away.
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
