/**
 * Helpers shared by `scope-audit.mjs` and `style-parity.mjs`: argument parsing,
 * the plan's page sample, the cid → source-file map, and a selector-list
 * splitter. Kept apart from `style-engine.mjs` because none of it touches a
 * browser.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The legacy commit the migration branched from (plan §1). The cid map is
 * computed from the `.astro` sources AT this commit, so it stays correct after
 * the migration deletes them.
 */
export const LEGACY_REF = '51a70cf';

/**
 * Parses the flags both audit scripts take. Unknown flags throw: a typo must
 * not silently run the 30-minute full audit.
 *
 * @param {string[]} argv - `process.argv.slice(2)`.
 * @param {[number, number]} defaultPorts - Ports when `--ports` is absent.
 * @returns {{ help: boolean, smoke: boolean, all: boolean, pages: string[] | null,
 *   out: string | null, ports: [number, number], positional: string[] }}
 */
export function parseCommonArgs(argv, defaultPorts) {
  const args = {
    help: false,
    smoke: false,
    all: false,
    pages: null,
    out: null,
    ports: defaultPorts,
    positional: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      i += 1;
      return next;
    };
    if (flag === '--help' || flag === '-h') args.help = true;
    else if (flag === '--smoke') args.smoke = true;
    else if (flag === '--all') args.all = true;
    else if (flag === '--out') args.out = value();
    else if (flag === '--pages') {
      args.pages = value()
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    } else if (flag === '--ports') {
      const ports = value().split(',').map(Number);
      if (
        ports.length !== 2 ||
        ports.some((p) => !Number.isInteger(p) || p < 1)
      ) {
        throw new Error('--ports takes two port numbers, e.g. 4501,4502');
      }
      if (ports.some((p) => p === 4321 || p === 4322)) {
        throw new Error(
          'ports 4321/4322 belong to the e2e suite (plan §5 P1 step 2)',
        );
      }
      args.ports = /** @type {[number, number]} */ (ports);
    } else if (flag.startsWith('-')) throw new Error(`unknown flag ${flag}`);
    else args.positional.push(flag);
  }
  return args;
}

/**
 * The plan's sample (§5 P1 step 2): the 9 non-lesson pages, all 15 DSA lessons,
 * the 11 lessons that use a diagram, and 5 prose lessons with tables — 38
 * distinct pages, because two of the table lessons also carry a diagram.
 * Routes and lessons come from the committed baseline inventory; the diagram
 * lessons from the MDX sources (content migrates unchanged, D-08).
 *
 * @param {string} root - Repository root.
 * @returns {string[]} Site paths, in sample order, deduplicated.
 */
export function defaultSample(root) {
  const inventory = JSON.parse(
    readFileSync(
      path.join(root, 'docs/migrations/react-migration-inventory.json'),
      'utf8',
    ),
  );
  const nonLesson = inventory.routes
    .filter((r) => r.kind !== 'lesson')
    .map((r) => r.url);
  const dsa = inventory.lessons
    .filter((l) => l.course === 'dsa')
    .sort((a, b) => a.order - b.order)
    .map((l) => l.route);
  const lessonsDir = path.join(root, 'src/content/lessons');
  const diagrams = readdirSync(lessonsDir)
    .filter((f) => f.endsWith('.mdx'))
    .filter((f) =>
      readFileSync(path.join(lessonsDir, f), 'utf8').includes(
        'components/diagrams',
      ),
    )
    .sort()
    .map((f) => `/learn/${f.replace(/\.mdx$/, '')}/`);
  const tables = [
    'sd-comparison-table',
    'k8s-services',
    'sd-capacity-estimation',
    'k8s-rbac',
    'sd-api-design',
  ].map((slug) => `/learn/${slug}/`);
  return [...new Set([...nonLesson, ...dsa, ...diagrams, ...tables])];
}

/**
 * Maps every Astro scope id (`data-astro-cid-<cid>`) to the `.astro` file it
 * belongs to. The cid is the compiler's hash of the component's root-relative
 * path, so the map is computed rather than guessed: each `.astro` file at
 * {@link LEGACY_REF} is run through `@astrojs/compiler-rs`'s `transform`, which
 * reports the `scope`. The result is cached at `cachePath`; when the compiler is
 * no longer installed (it leaves at P5) the cache is used instead.
 *
 * @param {string} root - Repository root.
 * @param {string} cachePath - Where to read/write the JSON map.
 * @returns {Promise<Record<string, string>>} cid → `src/…/X.astro`.
 */
export async function buildCidMap(root, cachePath) {
  let transform;
  try {
    ({ transform } = await import('@astrojs/compiler-rs'));
  } catch {
    if (existsSync(cachePath))
      return JSON.parse(readFileSync(cachePath, 'utf8'));
    return {};
  }
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    });
  const files = git('ls-tree', '-r', '--name-only', LEGACY_REF, '--', 'src')
    .split('\n')
    .filter((f) => f.endsWith('.astro'));
  /** @type {Record<string, string>} */
  const map = {};
  for (const file of files) {
    const source = git('show', `${LEGACY_REF}:${file}`);
    const { scope } = transform(source, {
      filename: path.join(root, file),
      normalizedFilename: `/${file}`,
      resultScopedSlot: true,
    });
    map[scope] = file;
  }
  writeFileSync(cachePath, `${JSON.stringify(map, null, 1)}\n`);
  return map;
}

/**
 * The source file(s) a scoped selector belongs to, from the cids it carries.
 *
 * @param {string} selector - Original selector text.
 * @param {Record<string, string>} cidMap - From {@link buildCidMap}.
 * @returns {string | null} File path(s) joined with ` + `, or null when unscoped.
 */
export function fileOfSelector(selector, cidMap) {
  const cids = [
    ...new Set(
      [...selector.matchAll(/data-astro-cid-([a-z0-9]+)/g)].map((m) => m[1]),
    ),
  ];
  if (cids.length === 0) return null;
  return cids.map((cid) => cidMap[cid] ?? `unmapped cid ${cid}`).join(' + ');
}

/**
 * Splits a selector list on its top-level commas (commas inside `:is()`,
 * `:not()` or an attribute value do not split).
 *
 * @param {string} list - Selector list text.
 * @returns {string[]} Individual selectors, trimmed.
 */
export function splitSelectorList(list) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(list.slice(start).trim());
  return out.filter(Boolean);
}
