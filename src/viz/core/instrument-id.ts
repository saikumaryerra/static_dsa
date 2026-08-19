/**
 * Stable ids for visualizer instruments (Plan C §5).
 *
 * `Visualizer.astro` minted its id base with `Math.random()` — the last one in
 * `src/` — so every instrument's id churned on every build. Nothing durable
 * could point INTO a run: not a row anchor, not a `<StepLink>`, not a bookmark.
 * Three siblings already went stable for exactly this reason (`hero-demo`,
 * `nf-demo`, `og-still`), and `src/components/uid.ts` exists precisely to avoid
 * `Math.random()` in build-time components.
 *
 * The id is derived from the page's pathname plus the instrument's algorithm and
 * renderer, which is unique per instrument on every page the site ships today.
 * The algorithm name is kept LEGIBLE in the id (`viz-binary-search-…`) because a
 * hash alone tells a reader who lands on an anchor nothing about where they are.
 *
 * WHY THE STATE LIVES IN A MODULE. `.astro` frontmatter runs once per component
 * INSTANCE, so a `let` there cannot see the instrument rendered before it; only
 * module scope persists across renders. That is the same reason `uid.ts` is a
 * module, and this follows its shape rather than inventing a second convention.
 *
 * WHY THE COUNTER IS KEYED PER RENDER, not global. A global counter would be
 * correct in a static build (each page renders exactly once) and WRONG in
 * `astro dev`, where the module survives across requests: the second load of a
 * page would see every seed a second time and suffix ids that had no collision,
 * re-introducing exactly the churn this module removes. Keying the tally to one
 * render — `Astro.request`, which is a fresh object per page render and shared
 * by every component within it — makes a reload replay the same ids. The
 * `WeakMap` means a finished render's tally is collectable.
 *
 * This module imports nothing (architecture §8): it is a leaf, like `core/ids.ts`.
 */

/** Instruments issued so far in one render, keyed by seed. */
const issued = new WeakMap<object, Map<string, number>>();

/**
 * djb2 over the seed, base36. Only ever has to separate the handful of
 * instruments on one page, so 32 bits is generous; the point is that it is
 * stable across builds, not that it is cryptographic.
 */
function hash(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).padStart(6, '0').slice(-6);
}

/** Lowercase, CSS-`id`-safe, and never empty — ids are `querySelector` targets. */
function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned === '' ? 'viz' : cleaned;
}

/**
 * Claims this render's id for one instrument, e.g. `"viz-binary-search-3f0k1p"`.
 *
 * Deterministic: the same page rendered again yields the same ids, in the same
 * order. The suffix is the collision tiebreak and appears ONLY on an actual
 * repeat — a second instrument of the same algorithm AND renderer on the same
 * page becomes `…-2`, a third `…-3`. No page ships a repeat today, but
 * `sorting-basics` mounts three instruments and the dev gallery twelve from one
 * `samples.map()`, so a duplicate is one authoring edit away and a silent
 * duplicate id would break every anchor into both of them.
 *
 * @param scope - Any object unique to the current page render (`Astro.request`).
 * @param pathname - The page's path, so two pages never mint the same id.
 * @param algorithm - Registry id of the algorithm, e.g. `'binary-search'`.
 * @param renderer - Registry id of the renderer, e.g. `'array'`.
 * @returns The instrument's id base; its controls derive their ids from it.
 */
export function claimInstrumentId(
  scope: object,
  pathname: string,
  algorithm: string,
  renderer: string,
): string {
  const seed = `${pathname}:${algorithm}:${renderer}`;
  const base = `viz-${slug(algorithm)}-${hash(seed)}`;

  let tally = issued.get(scope);
  if (!tally) {
    tally = new Map<string, number>();
    issued.set(scope, tally);
  }
  const nth = (tally.get(seed) ?? 0) + 1;
  tally.set(seed, nth);

  return nth === 1 ? base : `${base}-${nth}`;
}
