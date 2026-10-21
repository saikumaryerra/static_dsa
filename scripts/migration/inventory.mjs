/**
 * Migration inventory and parity checker (Astro → React migration,
 * `docs/migrations/react-migration-plan.md`).
 *
 * TWO JOBS, ONE NORMALIZATION.
 *
 * 1. `--out <file>` writes a machine-checkable inventory of the site: the
 *    lessons in `src/content/lessons/`, every route a built `dist/` serves (with
 *    the parity-relevant facts about each page), the `localStorage` keys and
 *    their call sites, the browser-only API call sites, the public assets and
 *    font subsets, the npm scripts, the dependency list by category and the test
 *    files by kind.
 * 2. `--compare <old.json>` builds the same inventory from the CURRENT tree and
 *    `dist/`, diffs every parity field against the old one and exits 1 on any
 *    drift that `--allow <exceptions.json>` does not name with a reason.
 *
 * `--diff-page <url> --against <old dist dir>` prints the first divergence
 * between two builds' normalized `<main>` token streams for one page — the tool
 * to reach for when a `mainHash`/`bodyHash`/`proseHash` comparison fails.
 *
 * Three fingerprints per lesson, from coarse to fine: `proseHash` is the
 * `.lesson-body` with every instrument subtree (visualizer, code tabs, trials,
 * Final Run, complexity table, step links, figures) replaced by a placeholder —
 * the MDX pipeline's parity gate; `bodyHash` is the whole `.lesson-body`;
 * `mainHash` is the whole `<main>`.
 *
 * DEPENDENCY-FREE ON PURPOSE: it must run against the legacy tree (Astro) and
 * the new one (React) without either toolchain, so the HTML is read by the small
 * tokenizer below rather than by a parser package. It only has to read HTML this
 * repository's own builds emit, which always close their elements.
 *
 * NORMALIZATION (applied identically to both builds; recorded in the output):
 * - comments, the doctype, executable `<script>` elements (not JSON-LD) and
 *   Astro's `data-astro-cid-*` / `data-astro-*` attributes are dropped; so are
 *   the new build's island markers (`data-island`, `data-props`) and
 *   `data-site-root` (retired with portability, decision D1);
 * - every `href`/`src` is resolved against the page URL, so the legacy build's
 *   document-relative URLs and the new build's root-absolute ones compare equal;
 *   fingerprinted asset URLs collapse to `asset:<ext>`;
 * - attribute values are entity-decoded; `class` tokens are sorted (and Astro's
 *   `astro-code` reads as Shiki's `shiki`, decision D-12); `style`
 *   declarations lose insignificant whitespace; boolean attributes compare by
 *   presence; ids minted from the legacy build-wide counter (`pc-ask-17`,
 *   `ct-4-tab-0`, …) are renumbered per page in order of first appearance, in
 *   every attribute that references them;
 * - text is entity-decoded, whitespace runs collapse to one space outside
 *   `<pre>`/`<textarea>`, whitespace-only text nodes are dropped, and adjacent
 *   text nodes merge (React's `<!-- -->` separators split them);
 * - curly quotes, dashes and ellipses are NOT normalized: smartypants output is
 *   content, and a pipeline that stops producing it must fail parity.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';
import { URL, fileURLToPath } from 'node:url';

/** Repository root, from this file's location (`scripts/migration/`). */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/** Bumped whenever the inventory's shape or normalization changes. */
const SCHEMA = 1;

/** The origin every page URL is resolved against. Never published. */
const ORIGIN = 'https://inventory.invalid';

/**
 * Writes one line to stdout. `console` is banned repo-wide (spec §18).
 *
 * @param {string} line - Text to print.
 * @returns {void}
 */
const say = (line) => void process.stdout.write(`${line}\n`);

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

/**
 * Parses `--flag value` pairs and bare `--flag`s.
 *
 * @param {string[]} argv - `process.argv.slice(2)`.
 * @returns {Record<string, string | true>} The options.
 */
function parseArgs(argv) {
  /** @type {Record<string, string | true>} */
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (!arg.startsWith('--')) throw new Error(`unexpected argument "${arg}"`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--'))
      options[arg.slice(2)] = true;
    else {
      options[arg.slice(2)] = next;
      i += 1;
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/**
 * Every file under `dir`, recursively, as paths relative to `dir` with `/`.
 *
 * @param {string} dir - Directory to walk.
 * @param {(rel: string) => boolean} [skip] - Directories to leave out.
 * @returns {string[]} Sorted relative paths.
 */
function walk(dir, skip = () => false) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} rel */
  const visit = (rel) => {
    for (const name of readdirSync(path.join(dir, rel))) {
      const child = rel === '' ? name : `${rel}/${name}`;
      if (statSync(path.join(dir, child)).isDirectory()) {
        if (!skip(child)) visit(child);
      } else out.push(child);
    }
  };
  visit('');
  return out.sort();
}

/**
 * Short, stable content hash.
 *
 * @param {string | Buffer} data - Bytes or text.
 * @returns {string} First 16 hex characters of the SHA-256.
 */
const hash16 = (data) =>
  createHash('sha256').update(data).digest('hex').slice(0, 16);

/**
 * Full SHA-256 of a file.
 *
 * @param {string} file - Absolute path.
 * @returns {string} Hex digest.
 */
const sha256File = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

/** Named entities this repository's builds can emit, decoded on read. */
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '·',
  times: '×',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rarr: '→',
  larr: '←',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
};

/**
 * Decodes HTML character references. Unknown named references are kept.
 *
 * @param {string} text - Raw attribute value or text.
 * @returns {string} Decoded text.
 */
function decodeEntities(text) {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    const named = NAMED_ENTITIES[/** @type {keyof NAMED_ENTITIES} */ (body)];
    return named ?? whole;
  });
}

/** Collapses whitespace runs to a single space. */
const collapse = (/** @type {string} */ text) => text.replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// HTML: tokenizer and tree
// ---------------------------------------------------------------------------

/** Elements whose content is raw text, never markup. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/** Elements that never have content or an end tag. */
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/**
 * @typedef {object} HtmlNode
 * @property {'element' | 'text' | 'root'} type - Node kind.
 * @property {string} [tag] - Lower-case tag name (elements).
 * @property {[string, string][]} [attrs] - Attributes in source order.
 * @property {HtmlNode[]} [children] - Child nodes (elements, root).
 * @property {string} [value] - Decoded text (text nodes).
 * @property {boolean} [raw] - Text came from a raw-text element.
 */

/**
 * Parses HTML into a tree. Comments and the doctype are discarded.
 *
 * Tolerant rather than conformant: it reads well-formed output from this
 * repository's builds, closes void elements, honours `/>` (SVG), and on a
 * stray end tag pops to the nearest matching open element or ignores it.
 *
 * @param {string} html - A whole document or a fragment.
 * @returns {HtmlNode} The root node.
 */
function parseHtml(html) {
  /** @type {HtmlNode} */
  const root = { type: 'root', children: [] };
  /** @type {HtmlNode[]} */
  const stack = [root];
  const lower = html.toLowerCase();
  const top = () => /** @type {HtmlNode} */ (stack[stack.length - 1]);
  /** @param {string} value @param {boolean} raw */
  const pushText = (value, raw) => {
    if (value === '') return;
    top().children?.push({ type: 'text', value: decodeEntities(value), raw });
  };
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      pushText(html.slice(i), false);
      break;
    }
    pushText(html.slice(i, lt), false);
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (html[lt + 1] === '/') {
      const close = /^<\/([a-zA-Z][\w:-]*)\s*>/.exec(html.slice(lt, lt + 80));
      if (!close) {
        pushText('<', false);
        i = lt + 1;
        continue;
      }
      const tag = (close[1] ?? '').toLowerCase();
      const at = stack.map((node) => node.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      i = lt + close[0].length;
      continue;
    }
    const open = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(lt, lt + 80));
    if (!open) {
      pushText('<', false);
      i = lt + 1;
      continue;
    }
    const tag = (open[1] ?? '').toLowerCase();
    let j = lt + open[0].length;
    /** @type {[string, string][]} */
    const attrs = [];
    let selfClosing = false;
    while (j < n) {
      while (j < n && /\s/.test(html[j] ?? '')) j += 1;
      if (html[j] === '>') {
        j += 1;
        break;
      }
      if (html[j] === '/' && html[j + 1] === '>') {
        selfClosing = true;
        j += 2;
        break;
      }
      const name = /^[^\s"'>/=]+/.exec(html.slice(j, j + 256));
      if (!name) {
        j += 1;
        continue;
      }
      j += name[0].length;
      while (j < n && /\s/.test(html[j] ?? '')) j += 1;
      let value = '';
      if (html[j] === '=') {
        j += 1;
        while (j < n && /\s/.test(html[j] ?? '')) j += 1;
        const quote = html[j];
        if (quote === '"' || quote === "'") {
          const end = html.indexOf(quote, j + 1);
          value = html.slice(j + 1, end === -1 ? n : end);
          j = end === -1 ? n : end + 1;
        } else {
          const bare = /^[^\s>]+/.exec(html.slice(j, j + 4096));
          value = bare ? bare[0] : '';
          j += value.length;
        }
      }
      attrs.push([name[0].toLowerCase(), decodeEntities(value)]);
    }
    /** @type {HtmlNode} */
    const element = { type: 'element', tag, attrs, children: [] };
    top().children?.push(element);
    i = j;
    if (selfClosing || VOID.has(tag)) continue;
    if (RAW_TEXT.has(tag)) {
      const end = lower.indexOf(`</${tag}`, i);
      const stop = end === -1 ? n : end;
      const value = html.slice(i, stop);
      if (value !== '')
        element.children?.push({
          type: 'text',
          value:
            tag === 'textarea' || tag === 'title'
              ? decodeEntities(value)
              : value,
          raw: true,
        });
      const close = end === -1 ? n : html.indexOf('>', end);
      i = close === -1 ? n : close + 1;
      continue;
    }
    stack.push(element);
  }
  return root;
}

/**
 * One attribute's value, or `null` when absent.
 *
 * @param {HtmlNode} node - An element.
 * @param {string} name - Lower-case attribute name.
 * @returns {string | null} The decoded value.
 */
function attr(node, name) {
  const found = node.attrs?.find(([key]) => key === name);
  return found ? found[1] : null;
}

/**
 * The element's class tokens.
 *
 * @param {HtmlNode} node - An element.
 * @returns {string[]} Tokens, in source order.
 */
function classes(node) {
  return (attr(node, 'class') ?? '').split(/\s+/).filter(Boolean);
}

/**
 * Depth-first walk over every element below `node`.
 *
 * @param {HtmlNode} node - Start node (not itself visited).
 * @param {(element: HtmlNode) => void} visit - Called per element.
 * @returns {void}
 */
function eachElement(node, visit) {
  for (const child of node.children ?? []) {
    if (child.type !== 'element') continue;
    visit(child);
    eachElement(child, visit);
  }
}

/**
 * First element (document order) satisfying a predicate.
 *
 * @param {HtmlNode} node - Search root.
 * @param {(element: HtmlNode) => boolean} test - Predicate.
 * @returns {HtmlNode | null} The element.
 */
function find(node, test) {
  for (const child of node.children ?? []) {
    if (child.type !== 'element') continue;
    if (test(child)) return child;
    const deeper = find(child, test);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * Every element satisfying a predicate, in document order.
 *
 * @param {HtmlNode} node - Search root.
 * @param {(element: HtmlNode) => boolean} test - Predicate.
 * @returns {HtmlNode[]} The elements.
 */
function findAll(node, test) {
  /** @type {HtmlNode[]} */
  const out = [];
  eachElement(node, (element) => {
    if (test(element)) out.push(element);
  });
  return out;
}

/**
 * The element's text content with whitespace collapsed and trimmed.
 *
 * @param {HtmlNode} node - Any node.
 * @returns {string} Visible-ish text (raw-text children included).
 */
function textOf(node) {
  if (node.type === 'text') return node.value ?? '';
  return collapse((node.children ?? []).map(textOf).join('')).trim();
}

// ---------------------------------------------------------------------------
// Normalization (see the header comment)
// ---------------------------------------------------------------------------

/** Attributes that are build artefacts, never content. */
const DROPPED_ATTR = /^(data-astro-.*|data-island|data-props|data-site-root)$/;

/** Attributes compared by presence only. */
const BOOLEAN_ATTRS = new Set([
  'allowfullscreen',
  'async',
  'autofocus',
  'checked',
  'defer',
  'disabled',
  'hidden',
  'inert',
  'itemscope',
  'multiple',
  'nomodule',
  'novalidate',
  'open',
  'readonly',
  'required',
  'selected',
]);

/**
 * Class tokens that are one class under two names. Astro rewrote Shiki's
 * `shiki` to `astro-code`; decision D-12 renames it back at cutover, which must
 * not register as drift.
 */
const CLASS_ALIASES = new Map([
  ['astro-code', 'shiki'],
  ['astro-code-themes', 'shiki-themes'],
]);

/** Attributes whose value is a URL resolved against the page. */
const URL_ATTRS = new Set(['href', 'src', 'action', 'poster']);

/** Attributes whose value is a list of id references. */
const IDREF_ATTRS = new Set([
  'id',
  'for',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-owns',
  'aria-activedescendant',
  'aria-details',
  'aria-errormessage',
  'aria-flowto',
]);

/**
 * Ids minted from the legacy build-wide `nextUid()` counter. The number depends
 * on the order Astro rendered pages in, so it is renumbered per page.
 */
const COUNTER_ID =
  /^(ch-title-|ct-|explain-|fig-|fr-input-|fr-prompt-|fr-status-|pc-ask-)(\d+)(.*)$/;

/**
 * Builds the per-page renumbering for counter-minted ids.
 *
 * @param {HtmlNode} scope - The subtree being normalized.
 * @returns {(token: string) => string} Maps one id token to its stable form.
 */
function counterRenumbering(scope) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  /** @type {Map<string, number>} */
  const next = new Map();
  /** @param {string} token */
  const map = (token) => {
    const m = COUNTER_ID.exec(token);
    if (!m) return token;
    const prefix = m[1] ?? '';
    const key = `${prefix}${m[2]}`;
    let ordinal = seen.get(key);
    if (ordinal === undefined) {
      ordinal = (next.get(prefix) ?? 0) + 1;
      next.set(prefix, ordinal);
      seen.set(key, ordinal);
    }
    return `${prefix}#${ordinal}${m[3] ?? ''}`;
  };
  // First pass fixes ordinals in document order, so both builds number alike.
  eachElement(scope, (element) => {
    for (const [name, value] of element.attrs ?? []) {
      if (IDREF_ATTRS.has(name)) value.split(/\s+/).forEach(map);
      else if (name === 'href' && value.startsWith('#')) map(value.slice(1));
    }
  });
  return map;
}

/**
 * Normalizes a URL attribute: resolved against the page, origin stripped for
 * internal URLs, fingerprinted assets collapsed.
 *
 * @param {string} value - Raw attribute value.
 * @param {string} pageUrl - The page's own path, e.g. `/learn/arrays/`.
 * @returns {string} The comparable form.
 */
function normalizeUrl(value, pageUrl) {
  if (value === '' || /^(mailto:|tel:|javascript:|data:)/i.test(value)) {
    return value;
  }
  let resolved;
  try {
    resolved = new URL(value, `${ORIGIN}${pageUrl}`);
  } catch {
    return value;
  }
  if (resolved.origin !== ORIGIN) return resolved.href;
  const asset = /^\/(?:_astro|assets)\/.+\.([a-z0-9]+)$/i.exec(
    resolved.pathname,
  );
  if (asset) return `asset:${asset[1]}`;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/**
 * Normalizes an inline `style` attribute.
 *
 * @param {string} value - Raw declarations.
 * @returns {string} Declarations joined by `;` with no padding.
 */
function normalizeStyle(value) {
  return value
    .split(';')
    .map((decl) => {
      const colon = decl.indexOf(':');
      if (colon === -1) return decl.trim();
      return `${decl.slice(0, colon).trim()}:${collapse(decl.slice(colon + 1)).trim()}`;
    })
    .filter(Boolean)
    .join(';');
}

/**
 * Normalizes raw CSS/JS text for hashing: comments dropped, whitespace
 * collapsed. Inline code here is a kill-switch `<style>` or a JSON blob.
 *
 * @param {string} text - Raw text.
 * @returns {string} Comparable text.
 */
function normalizeRawText(text) {
  return collapse(text.replace(/\/\*[\s\S]*?\*\//g, ''))
    .replace(/\s*([{};:,>])\s*/g, '$1')
    .trim();
}

/**
 * Serializes a subtree to the normalized token stream both builds are compared
 * on. One token per line; the hash of the joined stream is the page's
 * fingerprint, and `--diff-page` prints the streams side by side.
 *
 * @param {HtmlNode} scope - Subtree root (its children are serialized).
 * @param {string} pageUrl - The page's own path, for URL resolution.
 * @param {(element: HtmlNode) => string | null} [instrument] - When given, an
 * element it names is emitted as one `<instrument NAME>` token and its subtree
 * is skipped — the prose-only projection (`proseHash`).
 * @returns {string[]} Tokens.
 */
function normalizedTokens(scope, pageUrl, instrument) {
  const renumber = counterRenumbering(scope);
  /** @type {string[]} */
  const out = [];
  let pendingText = '';
  let pendingPre = false;
  const flush = () => {
    if (pendingText === '') return;
    const text = pendingPre ? pendingText : collapse(pendingText);
    if (pendingPre || text.trim() !== '') out.push(`#text ${text}`);
    pendingText = '';
  };
  /** @param {HtmlNode} node @param {boolean} inPre */
  const visit = (node, inPre) => {
    for (const child of node.children ?? []) {
      if (child.type === 'text') {
        if (child.raw && !inPre) {
          flush();
          const text = normalizeRawText(child.value ?? '');
          if (text !== '') out.push(`#raw ${text}`);
          continue;
        }
        pendingPre = inPre;
        pendingText += child.value ?? '';
        continue;
      }
      if (child.type !== 'element') continue;
      flush();
      // Where a build puts its executable scripts is an implementation detail
      // (Astro 7 emits each component's module script inside <main>, at the
      // component's first use; the new build puts them in <head>). Script
      // loading is gated by the JS-budget and hydration specs, not here.
      if (
        child.tag === 'script' &&
        attr(child, 'type') !== 'application/ld+json'
      ) {
        continue;
      }
      const kind = instrument ? instrument(child) : null;
      if (kind) {
        out.push(`<instrument ${kind}>`);
        continue;
      }
      const tag = child.tag ?? '';
      /** @type {string[]} */
      const parts = [];
      for (const [name, rawValue] of child.attrs ?? []) {
        if (DROPPED_ATTR.test(name)) continue;
        let value = rawValue;
        if (BOOLEAN_ATTRS.has(name)) value = '';
        else if (name === 'class') {
          value = value
            .split(/\s+/)
            .filter(Boolean)
            .map((token) => CLASS_ALIASES.get(token) ?? token)
            .sort()
            .join(' ');
          if (value === '') continue;
        } else if (name === 'style') value = normalizeStyle(value);
        else if (IDREF_ATTRS.has(name)) {
          value = value.split(/\s+/).filter(Boolean).map(renumber).join(' ');
        } else if (URL_ATTRS.has(name)) {
          value =
            name === 'href' && value.startsWith('#')
              ? `#${renumber(value.slice(1))}`
              : normalizeUrl(value, pageUrl);
        } else value = collapse(value).trim();
        parts.push(`${name}=${JSON.stringify(value)}`);
      }
      parts.sort();
      out.push(`<${tag}${parts.length ? ` ${parts.join(' ')}` : ''}>`);
      const pre = inPre || tag === 'pre' || tag === 'textarea';
      visit(child, pre);
      flush();
      out.push(`</${tag}>`);
    }
  };
  visit(scope, false);
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// dist/: routes and pages
// ---------------------------------------------------------------------------

/**
 * Component markers counted per page: a name and the test that recognises the
 * component's root element in BOTH builds (classes and data-attributes are part
 * of the DOM contract the migration keeps).
 */
/** @typedef {{ tag?: string; cls?: string | string[]; attr?: string }} MarkerTest */

/** @type {[string, MarkerTest][]} */
const MARKERS = [
  ['visualizer', { tag: 'section', cls: 'viz' }],
  ['ledger', { cls: 'viz-ledger' }],
  ['practiceCheck', { cls: 'practice-check' }],
  ['challenge', { cls: 'challenge' }],
  ['finalRun', { cls: 'final-run' }],
  ['markComplete', { cls: 'mark-complete-group' }],
  ['explainBack', { attr: 'data-explain-template' }],
  ['codeTabs', { cls: 'codetabs' }],
  ['stepLink', { cls: 'step-link' }],
  ['figure', { tag: 'figure', cls: 'figure' }],
  ['callout', { cls: 'callout' }],
  ['collapsible', { cls: 'collapsible' }],
  ['complexityTable', { cls: 'complexity-table' }],
  ['bench', { cls: 'bench' }],
  ['band', { cls: 'band' }],
  ['tableScroll', { cls: 'table-scroll' }],
  ['mdCode', { tag: 'pre', cls: 'md-code' }],
  // Either spelling: decision D-12 renames Astro's `astro-code` to Shiki's own.
  ['shikiPre', { tag: 'pre', cls: ['astro-code', 'shiki'] }],
  ['toc', { cls: 'toc' }],
  ['breadcrumb', { cls: 'breadcrumb' }],
  ['prevNext', { cls: 'prevnext' }],
  ['whatsNext', { cls: 'whats-next' }],
  ['masteryPips', { cls: 'mastery-pips' }],
  ['trackArc', { cls: 'track-arc' }],
  ['lessonCard', { cls: 'lesson-card' }],
  ['courseCard', { cls: 'course-card' }],
  ['difficultyChip', { cls: 'difficulty-chip' }],
  ['themeToggle', { cls: 'theme-toggle' }],
  ['glossaryEntry', { attr: 'data-glossary-entry' }],
];

/**
 * Whether an element is the root a marker describes.
 *
 * @param {HtmlNode} element - Any element.
 * @param {MarkerTest} test - The marker's description.
 * @returns {boolean} A match.
 */
function isMarker(element, test) {
  return (
    (test.tag === undefined || element.tag === test.tag) &&
    (test.cls === undefined ||
      [test.cls].flat().some((name) => classes(element).includes(name))) &&
    (test.attr === undefined || attr(element, test.attr) !== null)
  );
}

/**
 * The "instruments": lesson-body components whose markup is NOT markdown. The
 * prose-only projection (`proseHash`) replaces each one's whole subtree with a
 * placeholder, so the MDX pipeline (smartypants, heading ids, GFM, Shiki on
 * fences, the rehype prose pass, slots, the prose-container components) can be
 * proven at parity before these components are ported — a stub that renders
 * the same root element is enough.
 */
const INSTRUMENTS = [
  'visualizer',
  'codeTabs',
  'challenge',
  'finalRun',
  'complexityTable',
  'stepLink',
  'figure',
];

/**
 * Names the instrument an element is the root of, or `null`.
 *
 * @param {HtmlNode} element - Any element.
 * @returns {string | null} The instrument's marker name.
 */
function instrumentOf(element) {
  for (const [name, test] of MARKERS) {
    if (INSTRUMENTS.includes(name) && isMarker(element, test)) return name;
  }
  return null;
}

/**
 * Maps a `dist/`-relative HTML file to the URL it is served at.
 *
 * @param {string} rel - e.g. `learn/arrays/index.html`, `404.html`.
 * @returns {string} e.g. `/learn/arrays/`, `/404.html`.
 */
function urlForFile(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html'))
    return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
}

/**
 * Classifies a route by URL shape.
 *
 * @param {string} url - Served URL.
 * @param {Set<string>} courses - Course ids.
 * @returns {string} Route kind.
 */
function routeKind(url, courses) {
  if (url === '/') return 'home';
  if (url === '/learn/') return 'catalogue';
  if (url === '/404.html') return 'not-found';
  if (url === '/glossary/') return 'glossary';
  if (url === '/about/') return 'about';
  if (url.startsWith('/dev/')) return 'dev';
  const m = /^\/learn\/([a-z0-9-]+)\/$/.exec(url);
  if (m) return courses.has(m[1] ?? '') ? 'course' : 'lesson';
  return 'other';
}

/**
 * Extracts every parity fact about one built page.
 *
 * @param {string} dist - Absolute `dist/` path.
 * @param {string} rel - The HTML file, relative to `dist/`.
 * @param {Set<string>} courses - Course ids, for route classification.
 * @returns {Record<string, unknown>} The page record.
 */
function inspectPage(dist, rel, courses) {
  const url = urlForFile(rel);
  const doc = parseHtml(readFileSync(path.join(dist, rel), 'utf8'));
  const head = find(doc, (el) => el.tag === 'head') ?? doc;
  const body = find(doc, (el) => el.tag === 'body') ?? doc;
  const main = find(body, (el) => el.tag === 'main');

  const titleEl = find(head, (el) => el.tag === 'title');
  const canonical = find(
    head,
    (el) => el.tag === 'link' && attr(el, 'rel') === 'canonical',
  );
  const description = find(
    head,
    (el) => el.tag === 'meta' && attr(el, 'name') === 'description',
  );
  const robots = find(
    head,
    (el) => el.tag === 'meta' && attr(el, 'name') === 'robots',
  );

  const headings = main
    ? findAll(main, (el) => el.tag === 'h2' || el.tag === 'h3').map((el) => ({
        level: Number((el.tag ?? 'h0').slice(1)),
        id: attr(el, 'id'),
        text: textOf(el),
      }))
    : [];

  /** @type {Set<string>} */
  const internal = new Set();
  /** @type {Set<string>} */
  const external = new Set();
  for (const a of findAll(
    doc,
    (el) => el.tag === 'a' && attr(el, 'href') !== null,
  )) {
    const href = attr(a, 'href') ?? '';
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    const resolved = new URL(href, `${ORIGIN}${url}`);
    if (resolved.origin === ORIGIN) {
      internal.add(`${resolved.pathname}${resolved.search}${resolved.hash}`);
    } else external.add(resolved.href);
  }

  /** @type {Record<string, number>} */
  const markers = {};
  for (const [name, test] of MARKERS) {
    const count = findAll(doc, (el) => isMarker(el, test)).length;
    if (count > 0) markers[name] = count;
  }

  /** @type {string[]} */
  const jsonLdTypes = [];
  for (const script of findAll(
    doc,
    (el) => el.tag === 'script' && attr(el, 'type') === 'application/ld+json',
  )) {
    try {
      const data = JSON.parse(textOf(script));
      const type = data['@type'];
      for (const t of Array.isArray(type) ? type : [type]) {
        if (typeof t === 'string') jsonLdTypes.push(t);
      }
    } catch {
      jsonLdTypes.push('<unparseable>');
    }
  }

  const lessonBody = main
    ? find(main, (el) => classes(el).includes('lesson-body'))
    : null;
  const mainTokens = main ? normalizedTokens(main, url) : [];
  const bodyTokens = lessonBody ? normalizedTokens(lessonBody, url) : null;
  const proseTokens = lessonBody
    ? normalizedTokens(lessonBody, url, instrumentOf)
    : null;

  return {
    file: rel,
    url,
    kind: routeKind(url, courses),
    title: titleEl ? textOf(titleEl) : null,
    canonicalPath: canonical
      ? new URL(attr(canonical, 'href') ?? '', `${ORIGIN}${url}`).pathname
      : null,
    description: description ? attr(description, 'content') : null,
    robots: robots ? attr(robots, 'content') : null,
    h1: findAll(body, (el) => el.tag === 'h1').map(textOf),
    headings,
    internalLinks: [...internal].sort(),
    externalLinks: [...external].sort(),
    noscript: findAll(doc, (el) => el.tag === 'noscript').length,
    markers,
    jsonLdTypes: jsonLdTypes.sort(),
    mainHash: hash16(mainTokens.join('\n')),
    bodyHash: bodyTokens ? hash16(bodyTokens.join('\n')) : null,
    proseHash: proseTokens ? hash16(proseTokens.join('\n')) : null,
  };
}

/**
 * Inventories a built `dist/`.
 *
 * @param {string} dist - Absolute path.
 * @param {Set<string>} courses - Course ids.
 * @returns {Record<string, unknown>} Routes, files and asset totals.
 */
function inventoryDist(dist, courses) {
  const files = walk(dist);
  const html = files.filter((file) => file.endsWith('.html'));
  const routes = html.map((file) => inspectPage(dist, file, courses));

  // Fingerprinted bundles: totals only (names and counts are expected to change).
  const bundleDir = /^(_astro|assets)\//;
  /** @type {Record<string, { files: number; bytes: number; gzip: number }>} */
  const bundles = {};
  /** @type {{ path: string; bytes: number; sha256: string }[]} */
  const verbatim = [];
  for (const file of files) {
    const abs = path.join(dist, file);
    if (bundleDir.test(file)) {
      const ext = path.extname(file).slice(1) || 'none';
      const bucket = (bundles[ext] ??= { files: 0, bytes: 0, gzip: 0 });
      const data = readFileSync(abs);
      bucket.files += 1;
      bucket.bytes += data.length;
      bucket.gzip += gzipSync(data, { level: 9 }).length;
    } else if (!file.endsWith('.html')) {
      verbatim.push({
        path: file,
        bytes: statSync(abs).size,
        sha256: sha256File(abs),
      });
    }
  }

  const sitemapFile = path.join(dist, 'sitemap.xml');
  const sitemap = existsSync(sitemapFile)
    ? [...readFileSync(sitemapFile, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => new URL(m[1] ?? '').pathname)
        .sort()
    : null;
  const robotsFile = path.join(dist, 'robots.txt');
  const robots = existsSync(robotsFile)
    ? readFileSync(robotsFile, 'utf8').replace(
        /https?:\/\/[^/\s]+/g,
        '{origin}',
      )
    : null;

  return {
    htmlFiles: html.length,
    routes,
    sitemapPaths: sitemap,
    robotsTxt: robots,
    files: verbatim,
    bundles,
  };
}

// ---------------------------------------------------------------------------
// Source: lessons, MDX features, storage, browser APIs, assets, tooling
// ---------------------------------------------------------------------------

/**
 * Reads one top-level scalar from a YAML frontmatter block. Single-quoted
 * scalars (CONTENT_STYLE.md requires them) unescape `''`; double-quoted ones
 * unescape `\"`. Block scalars and flow collections return `null`.
 *
 * @param {string} block - Frontmatter without the fences.
 * @param {string} key - Key to read.
 * @returns {string | null} The scalar.
 */
function scalar(block, key) {
  const line = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(block);
  if (!line) return null;
  const raw = (line[1] ?? '').replace(/\s+#.*$/, '').trim();
  if (raw === '' || raw === '|' || raw === '>') return null;
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1).replace(/\\"/g, '"');
  }
  return raw;
}

/**
 * Removes fenced code blocks, so component and syntax counts see only MDX.
 *
 * @param {string} body - MDX body.
 * @returns {{ text: string; fences: Record<string, number> }} The body with
 * fences blanked, and a count of fences by language (`''` = none).
 */
function stripFences(body) {
  /** @type {Record<string, number>} */
  const fences = {};
  const lines = body.split('\n');
  /** @type {string[]} */
  const kept = [];
  let open = false;
  for (const line of lines) {
    const fence = /^(\s*)```\s*([\w-]*)/.exec(line);
    if (fence) {
      if (!open) {
        const lang = fence[2] ?? '';
        fences[lang] = (fences[lang] ?? 0) + 1;
      }
      open = !open;
      kept.push('');
      continue;
    }
    kept.push(open ? '' : line);
  }
  return { text: kept.join('\n'), fences };
}

/**
 * Inventories the lessons and the MDX features they use.
 *
 * @returns {{ lessons: Record<string, unknown>[]; mdx: Record<string, unknown> }}
 */
function inventoryLessons() {
  const dir = path.join(ROOT, 'src', 'content', 'lessons');
  /** @type {Record<string, unknown>[]} */
  const lessons = [];
  /** @type {Record<string, { importedFrom: string[]; files: number; usages: number }>} */
  const components = {};
  /** @type {Record<string, number>} */
  const fencesByLang = {};
  /** @type {Record<string, number>} */
  const frontmatterExpressions = {};
  /** @type {Record<string, number>} */
  const slotAttributes = {};
  /** @type {Record<string, number>} */
  const htmlElements = {};
  /** @type {Record<string, number>} */
  const headingLevels = {};
  let exportConsts = 0;
  let gfmTables = 0;
  let inlineLinks = 0;

  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .sort()) {
    const source = readFileSync(path.join(dir, name), 'utf8');
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(source);
    if (!fm) throw new Error(`${name}: no frontmatter block`);
    const block = fm[1] ?? '';
    const body = source.slice(fm[0].length);
    const slug = scalar(block, 'slug');
    const published = scalar(block, 'published') === 'true';
    lessons.push({
      file: `src/content/lessons/${name}`,
      slug,
      course: scalar(block, 'course') ?? 'dsa',
      track: scalar(block, 'track'),
      order: Number(scalar(block, 'order')),
      published,
      title: scalar(block, 'title'),
      difficulty: scalar(block, 'difficulty'),
      hasComplexity: /^complexity:/m.test(block),
      explainPrompt: (scalar(block, 'explainPrompt') ?? '') !== '',
      route: published ? `/learn/${slug}/` : null,
      bodySha: hash16(body),
    });

    const fenced = stripFences(body);
    const fences = fenced.fences;
    // `export const codeTabs = [...]` blocks hold code as template strings; a
    // `# comment` line in them is not a heading and `<T>` in them is not JSX.
    const text = fenced.text.replace(
      /^export\s+const\s[\s\S]*?^\];?[ \t]*$/gm,
      (block) => (/^export\s+const\s+\w+\s*=\s*\[/.test(block) ? '' : block),
    );
    exportConsts += [...fenced.text.matchAll(/^export\s+const\s+\w+/gm)].length;
    for (const [lang, count] of Object.entries(fences)) {
      fencesByLang[lang] = (fencesByLang[lang] ?? 0) + count;
    }
    for (const m of text.matchAll(/^import\s+(\w+)\s+from\s+'([^']+)';?$/gm)) {
      const entry = (components[m[1] ?? ''] ??= {
        importedFrom: [],
        files: 0,
        usages: 0,
      });
      if (!entry.importedFrom.includes(m[2] ?? ''))
        entry.importedFrom.push(m[2] ?? '');
      entry.files += 1;
    }
    // Usages: JSX opening tags outside fences and outside inline code spans.
    const prose = text.replace(/`[^`\n]*`/g, '');
    for (const m of prose.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
      const entry = components[m[1] ?? ''];
      if (entry) entry.usages += 1;
    }
    for (const m of prose.matchAll(/<([a-z][a-z0-9]*)[\s/>]/g)) {
      htmlElements[m[1] ?? ''] = (htmlElements[m[1] ?? ''] ?? 0) + 1;
    }
    for (const m of prose.matchAll(/\{frontmatter\.([\w.]+)\}/g)) {
      frontmatterExpressions[m[1] ?? ''] =
        (frontmatterExpressions[m[1] ?? ''] ?? 0) + 1;
    }
    for (const m of prose.matchAll(/\bslot="([\w-]+)"/g)) {
      slotAttributes[m[1] ?? ''] = (slotAttributes[m[1] ?? ''] ?? 0) + 1;
    }
    for (const m of text.matchAll(/^(#{1,6})\s/gm)) {
      const level = `h${(m[1] ?? '').length}`;
      headingLevels[level] = (headingLevels[level] ?? 0) + 1;
    }
    gfmTables += [...text.matchAll(/^\|.*\|\s*\n\|[\s:|-]+\|\s*$/gm)].length;
    inlineLinks += [...prose.matchAll(/\]\(([^)\s]+)\)/g)].length;
  }

  for (const entry of Object.values(components)) entry.importedFrom.sort();
  return {
    lessons,
    mdx: {
      components: Object.fromEntries(Object.entries(components).sort()),
      fencesByLang: Object.fromEntries(Object.entries(fencesByLang).sort()),
      frontmatterExpressions,
      slotAttributes,
      lowercaseJsxElements: htmlElements,
      headingLevels,
      exportConsts,
      gfmTables,
      markdownLinks: inlineLinks,
    },
  };
}

/** Source extensions scanned for storage and browser-API call sites. */
const CODE_EXT = /\.(astro|ts|tsx|mts|mjs|js|jsx)$/;

/**
 * Source lines that are code rather than comments, with 1-based numbers.
 * Line-level heuristic: JSDoc/block-comment bodies and `//` lines are skipped.
 *
 * @param {string} source - File text.
 * @returns {[number, string][]} Code lines.
 */
function codeLines(source) {
  /** @type {[number, string][]} */
  const out = [];
  let inBlock = false;
  source.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      return;
    }
    if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) {
      if (!trimmed.includes('*/')) inBlock = true;
      return;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    out.push([index + 1, line]);
  });
  return out;
}

/** Spec §6's permitted keys, by pattern, with their class. */
const SPEC_KEYS = [
  ['theme', 'preference'],
  ['pref:viz-speed', 'preference'],
  ['pref:code-lang', 'preference'],
  ['lesson:{slug}:complete', 'progress'],
  ['progress:v1:{slug}', 'progress'],
  ['ld:challenges:v1', 'progress'],
  ['ld:finalrun:v1', 'progress'],
  ['ld:days:v1', 'progress'],
];

/** Browser-only APIs tracked per file (spec: never touched during SSR). */
const BROWSER_APIS = [
  ['window', /\bwindow\./],
  ['document', /\bdocument\./],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['cookie', /\bdocument\.cookie\b/],
  ['matchMedia', /\bmatchMedia\b/],
  ['IntersectionObserver', /\bIntersectionObserver\b/],
  ['ResizeObserver', /\bResizeObserver\b/],
  ['requestAnimationFrame', /\brequestAnimationFrame\b/],
  ['history', /\bhistory\.(pushState|replaceState|back|forward|go)\b/],
  [
    'location',
    /\blocation\.(search|hash|href|pathname|assign|replace|reload)\b/,
  ],
  ['navigator', /\bnavigator\./],
  ['getComputedStyle', /\bgetComputedStyle\b/],
  ['network', /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\s*\(/],
];

/**
 * Inventories storage keys, storage call sites and browser-API call sites in
 * `src/` (plus the inline pre-paint script, which lives in a layout).
 *
 * @returns {Record<string, unknown>} The three tables.
 */
function inventoryRuntime() {
  const src = path.join(ROOT, 'src');
  const files = walk(src).filter((file) => CODE_EXT.test(file));
  /** @type {Map<string, Set<string>>} */
  const keyDefs = new Map();
  /** @type {{ file: string; line: number; api: string; code: string }[]} */
  const callSites = [];
  /** @type {Record<string, Record<string, number[]>>} */
  const apis = {};
  const keyLiteral =
    /(['"`])(theme|pref:[\w-]+|ld:[\w-]+:v\d+|lesson:\$\{\s*\w+\s*\}:complete|progress:v\d+:\$\{\s*\w+\s*\})\1/g;
  for (const rel of files) {
    const file = `src/${rel}`;
    const source = readFileSync(path.join(src, rel), 'utf8');
    for (const [line, code] of codeLines(source)) {
      for (const m of code.matchAll(keyLiteral)) {
        const key = (m[2] ?? '').replace(/\$\{\s*\w+\s*\}/, '{slug}');
        // `theme` is also an ordinary word; only count it where storage is in play.
        if (key === 'theme' && !/KEY|getItem|setItem|removeItem/.test(code))
          continue;
        if (!keyDefs.has(key)) keyDefs.set(key, new Set());
        keyDefs.get(key)?.add(`${file}:${line}`);
      }
      const storage =
        /\b(localStorage|store|storage)\.(getItem|setItem|removeItem|clear|key)\s*\(/.exec(
          code,
        );
      if (storage) {
        callSites.push({
          file,
          line,
          api: `${storage[1]}.${storage[2]}`,
          code: code.trim().slice(0, 160),
        });
      }
      for (const [name, pattern] of BROWSER_APIS) {
        if (!(/** @type {RegExp} */ (pattern).test(code))) continue;
        const byFile = (apis[/** @type {string} */ (name)] ??= {});
        (byFile[file] ??= []).push(line);
      }
    }
  }
  const permitted = new Map(SPEC_KEYS.map(([key, kind]) => [key, kind]));
  const keys = [...keyDefs.entries()]
    .map(([key, sites]) => ({
      key,
      kind: permitted.get(key) ?? 'NOT-IN-SPEC-§6',
      sites: [...sites].sort(),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    storageKeys: keys,
    storageCallSites: callSites,
    browserApis: Object.fromEntries(
      Object.entries(apis)
        .sort()
        .map(([name, byFile]) => [
          name,
          Object.fromEntries(Object.entries(byFile).sort()),
        ]),
    ),
  };
}

/**
 * Public assets and font subsets.
 *
 * @returns {Record<string, unknown>} Asset records.
 */
function inventoryAssets() {
  const pub = path.join(ROOT, 'public');
  const assets = walk(pub).map((rel) => ({
    path: `public/${rel}`,
    bytes: statSync(path.join(pub, rel)).size,
    sha256: sha256File(path.join(pub, rel)),
  }));
  const manifest = path.join(ROOT, 'src', 'styles', 'font-charset.ts');
  /** @type {Record<string, number>} */
  let declared = {};
  if (existsSync(manifest)) {
    const block = /FONT_BYTES[^=]*=\s*(\{[\s\S]*?\});/.exec(
      readFileSync(manifest, 'utf8'),
    );
    if (block) declared = JSON.parse(block[1] ?? '{}');
  }
  return {
    public: assets,
    fonts: assets
      .filter((a) => a.path.endsWith('.woff2'))
      .map((a) => ({
        ...a,
        declaredBytes: declared[path.basename(a.path)] ?? null,
      })),
  };
}

/** Dependency categories, first match wins. */
const DEP_CATEGORIES = [
  ['framework', /^(astro|@astrojs\/|next$|react-router|vike)/],
  ['ui-runtime', /^(react|react-dom)$/],
  ['build', /^(vite|@vitejs\/|rolldown|esbuild)$/],
  ['styling', /^(tailwindcss|@tailwindcss\/)/],
  [
    'content',
    /^(yaml|zod|shiki|@shikijs\/|@mdx-js\/|remark-|rehype-|unified|github-slugger|hast-|mdast-|unist-)/,
  ],
  ['test', /^(vitest|@playwright\/|playwright|@axe-core\/)/],
  [
    'lint-format',
    /^(eslint|@eslint\/|typescript-eslint|eslint-plugin-|prettier)/,
  ],
  ['types', /^@types\//],
  ['language', /^typescript$/],
];

/**
 * npm scripts, dependencies by category, and test files by kind.
 *
 * @returns {Record<string, unknown>} Tooling records.
 */
function inventoryTooling() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  /** @type {Record<string, { name: string; range: string; dev: boolean }[]>} */
  const deps = {};
  for (const [field, dev] of [
    ['dependencies', false],
    ['devDependencies', true],
  ]) {
    for (const [name, range] of Object.entries(
      pkg[/** @type {string} */ (field)] ?? {},
    )) {
      const category =
        DEP_CATEGORIES.find(([, test]) =>
          /** @type {RegExp} */ (test).test(name),
        )?.[0] ?? 'other';
      (deps[/** @type {string} */ (category)] ??= []).push({
        name,
        range: String(range),
        dev: Boolean(dev),
      });
    }
  }
  const tests = path.join(ROOT, 'tests');
  const all = walk(tests);
  // Code lines only: a comment that says "Visualizer.astro" couples nothing.
  const coupled = /astro|portabl|rehost|data-site-root|siteRoot/i;
  /** @param {string} rel */
  const isCoupled = (rel) =>
    /\.(ts|mjs)$/.test(rel) &&
    codeLines(readFileSync(path.join(tests, rel), 'utf8')).some(([, line]) =>
      coupled.test(line),
    );
  return {
    npmScripts: pkg.scripts ?? {},
    engines: pkg.engines ?? {},
    dependencies: Object.fromEntries(Object.entries(deps).sort()),
    tests: {
      unit: all.filter((f) => /^unit\/[^/]+\.test\.ts$/.test(f)),
      unitRenderers: all.filter((f) => /^unit\/renderers\/.+\.ts$/.test(f)),
      e2eSpecs: all.filter((f) => /^e2e\/[^/]+\.spec\.ts$/.test(f)),
      e2eSupport: all.filter((f) => /^e2e\/(utils|fixtures)\//.test(f)),
      ariaBaselines: all.filter((f) => f.endsWith('.aria.yml')),
      visualBaselines: all.filter((f) => f.endsWith('.png')),
      astroOrPortabilityInCode: all.filter(isCoupled),
    },
  };
}

// ---------------------------------------------------------------------------
// Inventory and comparison
// ---------------------------------------------------------------------------

/**
 * Builds the whole inventory.
 *
 * @param {string} dist - Absolute path of the build to read.
 * @param {string} label - Human description of that build, stored verbatim.
 * @returns {Record<string, any>} The inventory.
 */
function buildInventory(dist, label) {
  if (!existsSync(path.join(dist, 'index.html'))) {
    throw new Error(
      `${dist} holds no index.html — build first (npm run build).`,
    );
  }
  const { lessons, mdx } = inventoryLessons();
  const courses = new Set(lessons.map((l) => String(l.course)));
  const built = inventoryDist(dist, courses);
  const routes = /** @type {Record<string, any>[]} */ (built.routes);
  const byUrl = new Map(routes.map((r) => [r.url, r]));

  // Internal consistency: what the source promises, the build must serve.
  /** @type {string[]} */
  const problems = [];
  const published = lessons.filter((l) => l.published);
  const slugs = new Set();
  for (const lesson of published) {
    if (slugs.has(lesson.slug)) problems.push(`duplicate slug ${lesson.slug}`);
    slugs.add(lesson.slug);
    const page = byUrl.get(lesson.route);
    if (!page)
      problems.push(`lesson ${lesson.slug}: no page at ${lesson.route}`);
    else if (page.title !== `${lesson.title} · LearnDSA`) {
      problems.push(
        `lesson ${lesson.slug}: <title> "${page.title}" ≠ frontmatter title`,
      );
    }
  }
  const lessonRoutes = routes
    .filter((r) => r.kind === 'lesson')
    .map((r) => r.url);
  for (const url of lessonRoutes) {
    if (!published.some((l) => l.route === url)) {
      problems.push(`page ${url} has no published lesson source`);
    }
  }
  for (const route of routes) {
    for (const link of route.internalLinks) {
      const target = String(link).replace(/[?#].*$/, '');
      if (target === '' || byUrl.has(target)) continue;
      const file = path.join(dist, target);
      if (!(existsSync(file) && statSync(file).isFile())) {
        problems.push(
          `${route.url}: internal link ${link} resolves to nothing in the build`,
        );
      }
    }
  }

  /** @type {Record<string, number>} */
  const byCourse = {};
  for (const lesson of published) {
    byCourse[String(lesson.course)] =
      (byCourse[String(lesson.course)] ?? 0) + 1;
  }
  /** @type {Record<string, number>} */
  const kinds = {};
  for (const route of routes) kinds[route.kind] = (kinds[route.kind] ?? 0) + 1;

  return {
    schema: SCHEMA,
    generatedBy: 'scripts/migration/inventory.mjs',
    build: label,
    normalization: {
      droppedAttributes: String(DROPPED_ATTR),
      droppedElements:
        'comments, doctype, <script> other than application/ld+json (placement is a build detail)',
      urlAttributes: [...URL_ATTRS],
      booleanAttributes: [...BOOLEAN_ATTRS],
      counterIds: String(COUNTER_ID),
      text: 'entity-decoded; whitespace collapsed outside pre/textarea; whitespace-only nodes dropped; adjacent nodes merged',
      smartQuotes: 'not normalized — typographic characters are content',
      classTokens:
        'sorted; astro-code/astro-code-themes read as shiki/shiki-themes',
      hashes: 'sha256 of the normalized token stream, first 16 hex chars',
      proseHash: `.lesson-body with these subtrees replaced by a placeholder: ${INSTRUMENTS.join(', ')}`,
    },
    summary: {
      lessonFiles: lessons.length,
      publishedLessons: published.length,
      lessonsByCourse: byCourse,
      htmlFiles: built.htmlFiles,
      routesByKind: kinds,
      consistencyProblems: problems,
    },
    lessons,
    mdx,
    routes,
    sitemapPaths: built.sitemapPaths,
    robotsTxt: built.robotsTxt,
    distFiles: built.files,
    bundles: built.bundles,
    ...inventoryRuntime(),
    assets: inventoryAssets(),
    tooling: inventoryTooling(),
  };
}

/** Per-route fields that must not drift. */
const ROUTE_FIELDS = [
  'kind',
  'title',
  'canonicalPath',
  'description',
  'robots',
  'h1',
  'headings',
  'internalLinks',
  'externalLinks',
  'noscript',
  'markers',
  'jsonLdTypes',
  'mainHash',
  'bodyHash',
  'proseHash',
];

/** Per-lesson fields that must not drift. */
const LESSON_FIELDS = [
  'file',
  'course',
  'track',
  'order',
  'published',
  'title',
  'difficulty',
  'hasComplexity',
  'explainPrompt',
  'route',
  'bodySha',
];

/**
 * Compares two inventories' parity fields.
 *
 * @param {Record<string, any>} before - The baseline.
 * @param {Record<string, any>} after - The candidate.
 * @param {Record<string, any>} allow - Accepted differences, each with a reason:
 *   `{ "routes": { "<url>": { "<field>": "reason" } }, "global": { "<key>": "reason" } }`.
 *   `routes["*"]` applies a field exception to every route.
 * @returns {{ drift: string[]; accepted: string[] }} Findings.
 */
function compare(before, after, allow) {
  /** @type {string[]} */
  const drift = [];
  /** @type {string[]} */
  const accepted = [];
  const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) =>
    JSON.stringify(a) === JSON.stringify(b);
  /** @param {string} where @param {string} message @param {string | undefined} reason */
  const report = (where, message, reason) => {
    if (reason) accepted.push(`${where}: ${message}  [accepted: ${reason}]`);
    else drift.push(`${where}: ${message}`);
  };
  const globalAllow = allow.global ?? {};

  // Lessons.
  const oldLessons = new Map(
    before.lessons.map((/** @type {any} */ l) => [l.slug, l]),
  );
  const newLessons = new Map(
    after.lessons.map((/** @type {any} */ l) => [l.slug, l]),
  );
  for (const [slug, old] of oldLessons) {
    const now = newLessons.get(slug);
    if (!now) {
      report(`lesson ${slug}`, 'missing', globalAllow[`lesson:${slug}`]);
      continue;
    }
    for (const field of LESSON_FIELDS) {
      if (!same(old[field], now[field])) {
        report(
          `lesson ${slug}`,
          `${field}: ${JSON.stringify(old[field])} → ${JSON.stringify(now[field])}`,
          globalAllow[`lesson.${field}`],
        );
      }
    }
  }
  for (const slug of newLessons.keys()) {
    if (!oldLessons.has(slug))
      report(
        `lesson ${slug}`,
        'unexpected new lesson',
        globalAllow[`lesson:${slug}`],
      );
  }

  // Routes.
  const oldRoutes = new Map(
    before.routes.map((/** @type {any} */ r) => [r.url, r]),
  );
  const newRoutes = new Map(
    after.routes.map((/** @type {any} */ r) => [r.url, r]),
  );
  for (const [url, old] of oldRoutes) {
    const now = newRoutes.get(url);
    const exceptions = {
      ...(allow.routes?.['*'] ?? {}),
      ...(allow.routes?.[url] ?? {}),
    };
    if (!now) {
      report(`route ${url}`, 'not served', exceptions.missing);
      continue;
    }
    for (const field of ROUTE_FIELDS) {
      if (same(old[field], now[field])) continue;
      const detail = Array.isArray(old[field])
        ? `${field}: -${JSON.stringify(old[field].filter((/** @type {unknown} */ x) => !now[field]?.some((/** @type {unknown} */ y) => same(x, y))))} +${JSON.stringify((now[field] ?? []).filter((/** @type {unknown} */ x) => !old[field].some((/** @type {unknown} */ y) => same(x, y))))}`
        : `${field}: ${JSON.stringify(old[field])} → ${JSON.stringify(now[field])}`;
      report(`route ${url}`, detail, exceptions[field]);
    }
  }
  for (const url of newRoutes.keys()) {
    if (!oldRoutes.has(url))
      report(
        `route ${url}`,
        'unexpected new route',
        globalAllow[`route:${url}`],
      );
  }

  // Site-wide facts.
  for (const key of ['sitemapPaths', 'robotsTxt']) {
    if (!same(before[key], after[key])) {
      report(
        key,
        `${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}`,
        globalAllow[key],
      );
    }
  }
  const oldKeys = before.storageKeys
    .map((/** @type {any} */ k) => `${k.key}|${k.kind}`)
    .sort();
  const newKeys = after.storageKeys
    .map((/** @type {any} */ k) => `${k.key}|${k.kind}`)
    .sort();
  if (!same(oldKeys, newKeys)) {
    report(
      'storageKeys',
      `${JSON.stringify(oldKeys)} → ${JSON.stringify(newKeys)}`,
      globalAllow.storageKeys,
    );
  }
  for (const unexpected of after.storageKeys.filter(
    (/** @type {any} */ k) => k.kind === 'NOT-IN-SPEC-§6',
  )) {
    report('storageKeys', `key outside spec §6: ${unexpected.key}`, undefined);
  }
  for (const api of ['sessionStorage', 'indexedDB', 'cookie', 'network']) {
    if (after.browserApis[api]) {
      report(
        'browserApis',
        `${api} used in ${Object.keys(after.browserApis[api]).join(', ')}`,
        globalAllow[`api:${api}`],
      );
    }
  }
  const files = (/** @type {any} */ inv) =>
    new Map(inv.distFiles.map((/** @type {any} */ f) => [f.path, f.sha256]));
  const oldFiles = files(before);
  const newFiles = files(after);
  for (const [file, sha] of oldFiles) {
    if (newFiles.get(file) !== sha) {
      report(
        `dist file ${file}`,
        newFiles.has(file) ? 'content changed' : 'missing',
        globalAllow[`file:${file}`],
      );
    }
  }
  for (const file of newFiles.keys()) {
    if (!oldFiles.has(file))
      report(`dist file ${file}`, 'unexpected', globalAllow[`file:${file}`]);
  }
  for (const problem of after.summary.consistencyProblems) {
    report('consistency', problem, undefined);
  }
  return { drift, accepted };
}

/**
 * Prints the first divergence between two builds' normalized `<main>` streams.
 *
 * @param {string} oldDist - Baseline build directory.
 * @param {string} newDist - Candidate build directory.
 * @param {string} url - Page URL, e.g. `/learn/arrays/`.
 * @param {string | null} newFile - A single rendered HTML file to use as the
 * candidate instead of `newDist` (e.g. one route rendered by the dev renderer).
 * @param {boolean} bodyOnly - Compare `.lesson-body` instead of `<main>`.
 * @param {boolean} prose - Use the instrument-stubbed projection (`proseHash`).
 * @returns {boolean} `true` when the two streams are identical.
 */
function diffPage(oldDist, newDist, url, newFile, bodyOnly, prose) {
  const fileFor = (/** @type {string} */ dist) =>
    path.join(
      dist,
      url === '/'
        ? 'index.html'
        : url.endsWith('/')
          ? `${url.slice(1)}index.html`
          : url.slice(1),
    );
  const streamOf = (
    /** @type {string} */ dist,
    /** @type {string | null} */ file,
  ) => {
    const doc = parseHtml(readFileSync(file ?? fileFor(dist), 'utf8'));
    const main = find(doc, (el) => el.tag === 'main') ?? doc;
    const scope =
      bodyOnly || prose
        ? (find(main, (el) => classes(el).includes('lesson-body')) ?? main)
        : main;
    return normalizedTokens(scope, url, prose ? instrumentOf : undefined);
  };
  const a = streamOf(oldDist, null);
  const b = streamOf(newDist, newFile);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (i === a.length && i === b.length) {
    say(`${url}: identical (${a.length} tokens)`);
    return true;
  }
  say(
    `${url}: first divergence at token ${i} of ${a.length} (old) / ${b.length} (new)`,
  );
  for (let k = Math.max(0, i - 4); k < i + 8; k += 1) {
    const left = a[k] ?? '∅';
    const right = b[k] ?? '∅';
    say(
      `${k === i ? '>>' : '  '} ${String(k).padStart(5)}  old ${left.slice(0, 150)}`,
    );
    if (left !== right) say(`${' '.repeat(10)}new ${right.slice(0, 150)}`);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Runs the CLI.
 *
 * @returns {number} Exit code.
 */
function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    say(
      [
        'usage: node scripts/migration/inventory.mjs [--dist dist] [--label text] [--out file.json]',
        '       node scripts/migration/inventory.mjs --compare old.json [--allow exceptions.json] [--dist dist]',
        '       node scripts/migration/inventory.mjs --diff-page </url/|all> --against <old dist> [--dist dist | --file page.html] [--body | --prose]',
      ].join('\n'),
    );
    return 0;
  }
  const dist = path.resolve(
    ROOT,
    typeof options.dist === 'string' ? options.dist : 'dist',
  );

  if (typeof options['diff-page'] === 'string') {
    if (typeof options.against !== 'string')
      throw new Error('--diff-page needs --against <old dist dir>');
    const pages =
      options['diff-page'] === 'all'
        ? walk(dist)
            .filter((f) => f.endsWith('.html'))
            .map(urlForFile)
        : [options['diff-page']];
    let clean = true;
    for (const url of pages) {
      clean =
        diffPage(
          path.resolve(ROOT, options.against),
          dist,
          url,
          typeof options.file === 'string'
            ? path.resolve(ROOT, options.file)
            : null,
          Boolean(options.body),
          Boolean(options.prose),
        ) && clean;
    }
    return clean ? 0 : 1;
  }

  const label =
    typeof options.label === 'string'
      ? options.label
      : path.relative(ROOT, dist) || dist;
  const inventory = buildInventory(dist, label);
  const s = inventory.summary;
  say(
    `inventory: ${s.lessonFiles} lesson files (${s.publishedLessons} published: ${Object.entries(
      s.lessonsByCourse,
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}); ${s.htmlFiles} HTML files (${Object.entries(s.routesByKind)
      .map(([k, v]) => `${k} ${v}`)
      .join(
        ', ',
      )}); ${inventory.storageKeys.length} storage keys; ${s.consistencyProblems.length} consistency problem(s)`,
  );
  for (const problem of s.consistencyProblems) say(`  problem: ${problem}`);

  if (typeof options.out === 'string') {
    writeFileSync(
      path.resolve(ROOT, options.out),
      `${JSON.stringify(inventory, null, 1)}\n`,
    );
    say(`wrote ${options.out}`);
  }

  if (typeof options.compare === 'string') {
    const before = JSON.parse(
      readFileSync(path.resolve(ROOT, options.compare), 'utf8'),
    );
    if (before.schema !== SCHEMA) {
      throw new Error(
        `${options.compare} is schema ${before.schema}; this script reads schema ${SCHEMA}. Regenerate the baseline.`,
      );
    }
    const allow =
      typeof options.allow === 'string'
        ? JSON.parse(readFileSync(path.resolve(ROOT, options.allow), 'utf8'))
        : {};
    const { drift, accepted } = compare(before, inventory, allow);
    for (const line of accepted) say(`accepted  ${line}`);
    for (const line of drift) say(`DRIFT     ${line}`);
    say(
      `parity: ${drift.length} drift(s), ${accepted.length} accepted difference(s)`,
    );
    return drift.length === 0 ? 0 : 1;
  }
  return s.consistencyProblems.length === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  say(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
